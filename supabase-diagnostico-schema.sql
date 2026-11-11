-- supabase-diagnostico-schema.sql  (pode rodar de novo sem problema; só CRIA uma função de leitura)
-- Item 3 da lista da banca (2026-11-11): conferir se o banco REAL está como o app espera.
-- Motivo: os SQLs são aplicados à mão e reaplicar um antigo desfaz regras (dar_baixa, produtos_sel, somar_ao_lote...).
-- `diagnostico_schema()` só LÊ o catálogo do banco (nada de dado de loja/pessoa) e devolve a lista de checagens.
-- Só nível <= 2 (DEV/diretoria). Sem escrita, sem auditoria. Tem auto-teste que provoca uma falha e desfaz tudo.
-- MANTER O MANIFESTO (listas abaixo) quando criar função/trigger/policy/cron crítica nova; está descrito no CLAUDE.md.
begin;

create or replace function public.diagnostico_schema()
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public', 'pg_catalog'
as $fn$
declare
  v_itens jsonb := '[]'::jsonb;
  v_lista text[];
  v_extra text[];
  v_falta text[];
  v_m text; y text; t text;
  v_def text;
  v_n int;
  -- ===== MANIFESTO (o que PRECISA existir) =====
  c_anon_ok constant text[] := array['_marca_stop','_sem_acento','buscar_funcionario_pendente','ean13_valido','ean_valido','hoje_br','norm_lote'];
  c_funcs constant text[] := array['dar_baixa','somar_ao_lote','lancar_validade','registrar_pedido_promocao','atualizar_convite',
    'rl_checar','rl_servico','nivel_do_usuario','loja_ok','_promotor_ve','_sou_promotor','_produto_da_marca','registrar_login',
    'listar_solicitacoes_lgpd','responder_solicitacao_lgpd','exportar_meus_dados','aprovar_produto_novo','recusar_produto_novo',
    'telegram_enviar_aprovacao','telegram_contexto','gerar_codigo_telegram','remover_telegram','excluir_convite','pausar_convite',
    'revogar_convite','resgatar_convite_codigo','salvar_push','telegram_complementar_lote','telegram_pedido_aviso','telegram_auditar'];
  c_triggers constant text[] := array[
    'auditoria:trg_auditoria_quem','auditoria:trg_limite',
    'catalogo:trg_catalogo_ean','catalogo:trg_catalogo_marca','catalogo:trg_limite',
    'convites_promotor:trg_a_convite_marcas','convites_promotor:trg_convite_codigo','convites_promotor:trg_convite_registra_marcas','convites_promotor:trg_limite',
    'funcionarios_pendentes:trg_checar_matricula_livre','funcionarios_pendentes:trg_limite','funcionarios_pendentes:trg_pendente_regra_setor',
    'historico:trg_historico_quem','historico:trg_limite',
    'login_auditoria:trg_limite','login_auditoria:trg_login_aud_servidor',
    'produtos:trg_a_perm_ins','produtos:trg_a_perm_upd','produtos:trg_b_pedido_ck','produtos:trg_b_pedido_del','produtos:trg_limite',
    'produtos:trg_produtos_blindagem','produtos:trg_produtos_blindagem_ins','produtos:trg_produtos_del','produtos:trg_produtos_lote',
    'produtos:trg_produtos_promotor_marca','produtos:trg_produtos_prox','produtos:trg_produtos_regras'];
  c_marcas constant text[] := array[   -- 'funcao|texto que a definição precisa conter' (pega SQL antigo reaplicado por cima)
    'dar_baixa|baixa_exige_encarregado','somar_ao_lote|editar_exige_autor','somar_ao_lote|validade_muito_proxima',
    'atualizar_convite|acesso_total_exige_gerencia','registrar_pedido_promocao|p_valor','_produtos_pedido_ck|pedido_valor',
    '_produtos_pedido_ck|produto_travado_pedido','lancar_validade|lote_obrigatorio','_produtos_perm|editar_exige_autor',
    '_produtos_del_ck|excluir_exige_encarregado','registrar_login|login_auditoria','_promotor_ve|_produto_da_marca',
    'responder_solicitacao_lgpd|solicitacoes_lgpd','_produtos_blindagem|produtos_aumento',
    'telegram_enviar_aprovacao|validade_muito_proxima','aprovar_produto_novo|p_subsetor'];
  c_pol_promotor constant text[] := array['produtos:produtos_sel','historico:historico_sel','catalogo:catalogo_sel'];
  c_realtime constant text[] := array['aprovacoes_produto','auditoria','avisos','catalogo','convites_promotor','historico',
    'ocorrencias','produtos','rondas','ronda_itens','solicitacoes_lgpd','telegram_vinculos'];
  c_cron constant text[] := array['aprovacoes_produto_limpar','condor-alertas-diarios','limpar-limite-uso','limpar-telegram-falhas','telegram_limpar'];
  c_colunas constant text[] := array['produtos.lote','produtos.sem_lote','produtos.pedido_tipo','produtos.pedido_valor','produtos.lancado_por_id',
    'usuarios.acesso_expira_em','usuarios.promotor','convites_promotor.marcas','convites_promotor.acesso_total','aprovacoes_produto.lote'];
begin
  if auth.uid() is null or coalesce(public.nivel_do_usuario(), 99) > 2 then
    raise exception 'sem_permissao';
  end if;

  -- 1) RLS ligada em TODA tabela do schema public
  select coalesce(array_agg(c.relname order by c.relname), '{}') into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  v_itens := v_itens || jsonb_build_object('id','rls_ligada','grupo','Segurança','ok', cardinality(v_lista) = 0,
    'detalhe', case when cardinality(v_lista) = 0 then 'Todas as tabelas têm RLS.' else 'SEM RLS: ' || array_to_string(v_lista, ', ') end);

  -- 2) anônimo só executa as funções permitidas
  select coalesce(array_agg(p.proname order by p.proname), '{}') into v_extra
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute') and not (p.proname = any(c_anon_ok));
  v_itens := v_itens || jsonb_build_object('id','anon_funcoes','grupo','Segurança','ok', cardinality(v_extra) = 0,
    'detalhe', case when cardinality(v_extra) = 0 then 'Visitante sem login só executa as funções públicas esperadas.' else 'Visitante pode executar: ' || array_to_string(v_extra, ', ') end);

  -- 3) escrita direta em usuarios continua fechada (cargo/loja só por função)
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'usuarios' and cmd in ('INSERT','UPDATE','DELETE','ALL');
  v_itens := v_itens || jsonb_build_object('id','usuarios_sem_escrita','grupo','Segurança','ok', v_n = 0,
    'detalhe', case when v_n = 0 then 'Ninguém escreve direto em usuarios.' else v_n || ' política(s) de escrita em usuarios (deveria ser 0).' end);

  -- 4) funções críticas existem
  select coalesce(array_agg(f), '{}') into v_falta from unnest(c_funcs) f
   where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f);
  v_itens := v_itens || jsonb_build_object('id','funcoes_existem','grupo','Funções','ok', cardinality(v_falta) = 0,
    'detalhe', case when cardinality(v_falta) = 0 then array_length(c_funcs, 1) || ' funções críticas presentes.' else 'FALTAM: ' || array_to_string(v_falta, ', ') end);

  -- 5) funções críticas ainda têm a regra (SQL antigo reaplicado por cima apaga o marcador)
  v_falta := '{}';
  foreach v_m in array c_marcas loop
    y := split_part(v_m, '|', 1); t := split_part(v_m, '|', 2);
    select string_agg(pg_get_functiondef(p.oid), E'\n') into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = y;
    if v_def is null or position(t in v_def) = 0 then v_falta := v_falta || (y || ' (sem "' || t || '")'); end if;
  end loop;
  v_itens := v_itens || jsonb_build_object('id','funcoes_regras','grupo','Funções','ok', cardinality(v_falta) = 0,
    'detalhe', case when cardinality(v_falta) = 0 then 'Regras de negócio presentes nas funções-chave.' else 'REGRA PERDIDA (reaplicou um SQL antigo?): ' || array_to_string(v_falta, '; ') end);

  -- 6) triggers críticos existem e estão ligados
  select coalesce(array_agg(x), '{}') into v_falta from unnest(c_triggers) x
   where not exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
                      where c.relnamespace = 'public'::regnamespace and not g.tgisinternal and g.tgenabled <> 'D'
                        and c.relname = split_part(x, ':', 1) and g.tgname = split_part(x, ':', 2));
  v_itens := v_itens || jsonb_build_object('id','triggers','grupo','Regras no banco','ok', cardinality(v_falta) = 0,
    'detalhe', case when cardinality(v_falta) = 0 then array_length(c_triggers, 1) || ' triggers críticos ligados.' else 'TRIGGER AUSENTE/DESLIGADO: ' || array_to_string(v_falta, ', ') end);

  -- 7) promotor só vê as marcas dele (policies de leitura usam _promotor_ve)
  select coalesce(array_agg(x), '{}') into v_falta from unnest(c_pol_promotor) x
   where not exists (select 1 from pg_policies q where q.schemaname = 'public' and q.tablename = split_part(x, ':', 1)
                      and q.policyname = split_part(x, ':', 2) and q.qual ilike '%_promotor_ve%');
  v_itens := v_itens || jsonb_build_object('id','promotor_ve_marca','grupo','Segurança','ok', cardinality(v_falta) = 0,
    'detalhe', case when cardinality(v_falta) = 0 then 'Promotor só enxerga as marcas dele (produtos, histórico, catálogo).' else 'PROMOTOR VÊ TUDO em: ' || array_to_string(v_falta, ', ') || ' (reaplicar supabase-promotor-ve-marca.sql)' end);

  -- 8) auditoria só para nível <= 5
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'auditoria' and policyname = 'auditoria_sel' and qual ilike '%nivel_do_usuario%';
  v_itens := v_itens || jsonb_build_object('id','auditoria_nivel','grupo','Segurança','ok', v_n = 1,
    'detalhe', case when v_n = 1 then 'Auditoria fechada para nível > 5.' else 'auditoria_sel sem trava de nível (reaplicar supabase-auditoria-nivel.sql)' end);

  -- 9) tempo real: tabelas na publicação
  select coalesce(array_agg(x), '{}') into v_falta from unnest(c_realtime) x
   where not exists (select 1 from pg_publication_tables w where w.pubname = 'supabase_realtime' and w.schemaname = 'public' and w.tablename = x);
  v_itens := v_itens || jsonb_build_object('id','realtime','grupo','Tempo real','ok', cardinality(v_falta) = 0,
    'detalhe', case when cardinality(v_falta) = 0 then 'Tabelas do tempo real publicadas.' else 'FORA do tempo real: ' || array_to_string(v_falta, ', ') end);

  -- 10) colunas esperadas
  select coalesce(array_agg(x), '{}') into v_falta from unnest(c_colunas) x
   where not exists (select 1 from information_schema.columns k where k.table_schema = 'public'
                      and k.table_name = split_part(x, '.', 1) and k.column_name = split_part(x, '.', 2));
  v_itens := v_itens || jsonb_build_object('id','colunas','grupo','Tabelas','ok', cardinality(v_falta) = 0,
    'detalhe', case when cardinality(v_falta) = 0 then 'Colunas esperadas presentes.' else 'COLUNA FALTANDO: ' || array_to_string(v_falta, ', ') end);

  -- 11) rotinas agendadas (limpezas, alertas)
  begin
    select coalesce(array_agg(x), '{}') into v_falta from unnest(c_cron) x
     where not exists (select 1 from cron.job j where j.jobname = x and j.active);
    v_itens := v_itens || jsonb_build_object('id','cron','grupo','Rotinas','ok', cardinality(v_falta) = 0,
      'detalhe', case when cardinality(v_falta) = 0 then 'Rotinas agendadas ativas.' else 'ROTINA PARADA/AUSENTE: ' || array_to_string(v_falta, ', ') end);
  exception when others then
    v_itens := v_itens || jsonb_build_object('id','cron','grupo','Rotinas','ok', false, 'detalhe', 'Não consegui ler as rotinas agendadas.');
  end;

  return jsonb_build_object(
    'gerado_em', now(),
    'total', jsonb_array_length(v_itens),
    'falhas', (select count(*) from jsonb_array_elements(v_itens) e where not (e->>'ok')::boolean),
    'itens', v_itens);
end
$fn$;

revoke all on function public.diagnostico_schema() from public, anon;
grant execute on function public.diagnostico_schema() to authenticated;

-- ===== AUTO-TESTE (desfaz tudo): estrutura, permissão e DETECÇÃO de uma regra quebrada de propósito =====
do $t$
declare
  uid2 uuid; uid6 uuid; r jsonb; ok_perm boolean := false; ok_estrutura boolean := false; ok_detecta boolean := false; ok_detecta2 boolean := false;
begin
  select u.id into uid2 from public.usuarios u join public.cargos c on c.id = u.cargo_id where c.nivel <= 2 and u.ativo limit 1;
  select u.id into uid6 from public.usuarios u join public.cargos c on c.id = u.cargo_id where c.nivel >= 6 and u.ativo limit 1;
  if uid2 is null then raise exception 'AUTO-TESTE: nenhum usuário nível <= 2 encontrado'; end if;
  if uid6 is null then raise exception 'AUTO-TESTE: nenhum usuário nível >= 6 encontrado'; end if;

  begin  -- nível >= 6 é recusado
    perform set_config('request.jwt.claims', json_build_object('sub', uid6, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform public.diagnostico_schema(); exception when others then ok_perm := (sqlerrm = 'sem_permissao'); end;
    raise exception 'desfazer_autoteste';
  exception when others then if sqlerrm <> 'desfazer_autoteste' then raise exception 'AUTO-TESTE passo 1: %', sqlerrm; end if; end;
  reset role;

  begin  -- nível <= 2: estrutura
    perform set_config('request.jwt.claims', json_build_object('sub', uid2, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.diagnostico_schema();
    ok_estrutura := (jsonb_array_length(r->'itens') >= 10 and r ? 'falhas' and r ? 'gerado_em');
    raise exception 'desfazer_autoteste';
  exception when others then if sqlerrm <> 'desfazer_autoteste' then raise exception 'AUTO-TESTE passo 2: %', sqlerrm; end if; end;
  reset role;

  begin  -- quebra de propósito: derruba um trigger e remove uma regra de uma função; o diagnóstico TEM de acusar
    drop trigger trg_produtos_prox on public.produtos;
    alter table public.usuarios disable row level security;
    perform set_config('request.jwt.claims', json_build_object('sub', uid2, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.diagnostico_schema();
    ok_detecta := exists (select 1 from jsonb_array_elements(r->'itens') e where e->>'id' = 'triggers' and not (e->>'ok')::boolean and e->>'detalhe' like '%trg_produtos_prox%');
    ok_detecta2 := exists (select 1 from jsonb_array_elements(r->'itens') e where e->>'id' = 'rls_ligada' and not (e->>'ok')::boolean and e->>'detalhe' like '%usuarios%');
    raise exception 'desfazer_autoteste';
  exception when others then if sqlerrm <> 'desfazer_autoteste' then raise exception 'AUTO-TESTE passo 3: %', sqlerrm; end if; end;
  reset role;

  if not (ok_perm and ok_estrutura and ok_detecta and ok_detecta2) then
    raise exception 'AUTO-TESTE FALHOU (permissao=%, estrutura=%, detecta_trigger=%, detecta_rls=%): nada foi alterado', ok_perm, ok_estrutura, ok_detecta, ok_detecta2;
  end if;
end $t$;

commit;

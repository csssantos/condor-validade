-- ============================================================================
-- Condor · Alerta de Validade — REFORÇO DE SEGURANÇA (2026-10-31)
-- Rode inteiro no SQL Editor do Supabase. É idempotente (pode rodar de novo).
-- O que faz:
--  1) Tabelas: troca "acesso total pra qualquer um" por regras por loja / cargo.
--  2) Permissões: anon (sem login) perde acesso a quase tudo; ninguém mais
--     apaga/zera tabela; trilhas de auditoria viram só-inserção.
--  3) Funções: só quem está logado executa; funções internas ficam trancadas.
--  4) Anti-abuso: limite de requisições por minuto (banco) + limites de tamanho.
--  5) Fecha o furo em que o usuário podia editar o próprio cargo/loja.
-- ============================================================================
begin;

-- ---------- 0. Ajudantes ----------------------------------------------------
create or replace function public.tem_perfil() returns boolean
language sql stable security definer set search_path = public as
$$ select public.nivel_do_usuario() is not null $$;

create or replace function public.loja_ok(l bigint) returns boolean
language sql stable security definer set search_path = public as
$$ select public.nivel_do_usuario() is not null
          and (public.eh_gestao_global() or l = public.loja_do_usuario()) $$;

create or replace function public.loja_numero_ok(n text) returns boolean
language sql stable security definer set search_path = public as
$$ select public.nivel_do_usuario() is not null
          and (public.eh_gestao_global()
               or n = (select numero::text from public.lojas where id = public.loja_do_usuario())) $$;

-- ---------- 1. Limitador de requisições (por usuário, ou por IP se sem login)
create table if not exists public.limite_uso (
  chave text not null, bucket text not null, janela timestamptz not null, n int not null default 0,
  primary key (chave, bucket, janela)
);
alter table public.limite_uso enable row level security;
revoke all on public.limite_uso from anon, authenticated;

create or replace function public.rl_checar(p_bucket text, p_max int) returns void
language plpgsql security definer set search_path = public as
$$
declare k text; c int; h text;
begin
  -- só limita chamadas vindas da API pública; painel/serviço/cron passam direto
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return; end if;
  -- DEV e DIRETOR não são limitados (importações grandes)
  if coalesce(public.nivel_do_usuario(), 99) <= 2 then return; end if;
  h := nullif(current_setting('request.headers', true), '');
  k := coalesce(auth.uid()::text,
                split_part(coalesce((h::json)->>'x-forwarded-for', (h::json)->>'cf-connecting-ip', '?'), ',', 1));
  insert into public.limite_uso(chave, bucket, janela, n)
  values (k, p_bucket, date_trunc('minute', now()), 1)
  on conflict (chave, bucket, janela) do update set n = public.limite_uso.n + 1
  returning n into c;
  if c > p_max then
    raise exception 'limite_excedido' using hint = 'Muitas requisições. Aguarde 1 minuto.', errcode = 'P0001';
  end if;
end $$;

create or replace function public.trg_limite() returns trigger
language plpgsql security definer set search_path = public as
$$ begin perform public.rl_checar(tg_argv[0], tg_argv[1]::int); return new; end $$;

-- limite usado pelas Edge Functions (enviar-push, identificar-produto, assistente-ia): devolve false quando passou do teto
create or replace function public.rl_servico(p_chave text, p_bucket text, p_max int) returns boolean
language plpgsql security definer set search_path = public as
$$
declare c int;
begin
  insert into public.limite_uso(chave, bucket, janela, n)
  values (left(p_chave, 200), p_bucket, date_trunc('minute', now()), 1)
  on conflict (chave, bucket, janela) do update set n = public.limite_uso.n + 1
  returning n into c;
  return c <= p_max;
end $$;
revoke all on function public.rl_servico(text, text, int) from public, anon, authenticated;
grant execute on function public.rl_servico(text, text, int) to service_role;

-- limpeza das janelas antigas (a cada hora)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('limpar-limite-uso') where exists (select 1 from cron.job where jobname = 'limpar-limite-uso');
    perform cron.schedule('limpar-limite-uso', '7 * * * *', $c$ delete from public.limite_uso where janela < now() - interval '2 hours' $c$);
  end if;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('produtos','produtos',300), ('catalogo','catalogo',600), ('historico','historico',300),
    ('auditoria','auditoria',600), ('validade_alteracoes','validade',300), ('login_auditoria','login',12),
    ('convites_promotor','convite',20), ('funcionarios_pendentes','pendente',60)
  ) v(t, b, m) loop
    execute format('drop trigger if exists trg_limite on public.%I', r.t);
    execute format('create trigger trg_limite before insert or update on public.%I for each row execute function public.trg_limite(%L, %L)', r.t, r.b, r.m);
  end loop;
end $$;

-- ---------- 2. RPCs sensíveis ganham limite por minuto ----------------------
-- (a função original é renomeada para _rl_<nome> e um "porteiro" com o nome antigo passa a chamá-la)
do $$
declare r record; f record; callargs text; corpo text;
begin
  for r in select * from (values
    ('resgatar_convite','resgatar',10), ('vincular_meu_cadastro','vincular',10),
    ('criar_solicitacao_lgpd','lgpd',5), ('exportar_meus_dados','exportar',5),
    ('painel_rede','painel',20), ('enviar_aviso','aviso',10), ('buscar_funcionario_pendente','matricula',10)
  ) v(n, b, m) loop
    continue when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_rl_' || r.n);
    select p.oid, pg_get_function_arguments(p.oid) a, pg_get_function_identity_arguments(p.oid) ida,
           pg_get_function_result(p.oid) res, p.proargnames pn, p.proretset rs
      into f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.n;
    continue when f.oid is null;
    execute format('alter function public.%I(%s) rename to %I', r.n, f.ida, '_rl_' || r.n);
    select coalesce(string_agg(format('%I => %I', a, a), ', '), '') into callargs from unnest(coalesce(f.pn, '{}')) a;
    if f.rs then corpo := format('return query select * from public.%I(%s);', '_rl_' || r.n, callargs);
    elsif f.res = 'void' then corpo := format('perform public.%I(%s);', '_rl_' || r.n, callargs);
    else corpo := format('return public.%I(%s);', '_rl_' || r.n, callargs); end if;
    execute format('create function public.%I(%s) returns %s language plpgsql security definer set search_path = public as $f$ begin perform public.rl_checar(%L, %s); %s end $f$',
                   r.n, f.a, f.res, r.b, r.m, corpo);
  end loop;
end $$;

-- ---------- 3. Salvar inscrição de push pelo servidor (sem escrita direta na tabela)
create or replace function public.salvar_push(p_endpoint text, p_subscription jsonb, p_usuario text, p_loja bigint)
returns void language plpgsql security definer set search_path = public as
$$
begin
  if auth.uid() is null or public.nivel_do_usuario() is null then raise exception 'sem_permissao'; end if;
  if length(coalesce(p_endpoint, '')) not between 10 and 1000 or length(p_subscription::text) > 4000 then raise exception 'dados_invalidos'; end if;
  perform public.rl_checar('push', 20);
  insert into public.push_subscriptions(endpoint, subscription, usuario, loja_id, usuario_id)
  values (p_endpoint, p_subscription, left(p_usuario, 120), public.loja_do_usuario(), auth.uid())
  on conflict (endpoint) do update
    set subscription = excluded.subscription, usuario = excluded.usuario, loja_id = excluded.loja_id, usuario_id = excluded.usuario_id;
end $$;

-- ---------- 4. Políticas (RLS) ---------------------------------------------
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in
             ('produtos','catalogo','historico','auditoria','config_loja','config_setor','equipe_permitida',
              'push_subscriptions','resumo_lojas_rede','setores_customizados','subsetores_customizados',
              'login_auditoria','validade_alteracoes','avisos','usuarios','lojas','cargos') loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- por loja: qualquer pessoa com cadastro ativo, só da própria loja (gestão global vê todas)
create policy produtos_sel on public.produtos for select to authenticated using (public.loja_ok(loja_id));
create policy produtos_ins on public.produtos for insert to authenticated with check (public.loja_ok(loja_id));
create policy produtos_upd on public.produtos for update to authenticated using (public.loja_ok(loja_id)) with check (public.loja_ok(loja_id));
create policy produtos_del on public.produtos for delete to authenticated using (public.loja_ok(loja_id));

create policy catalogo_sel on public.catalogo for select to authenticated using (public.loja_ok(loja_id));
create policy catalogo_ins on public.catalogo for insert to authenticated with check (public.loja_ok(loja_id));
create policy catalogo_upd on public.catalogo for update to authenticated using (public.loja_ok(loja_id)) with check (public.loja_ok(loja_id));

create policy historico_sel on public.historico for select to authenticated using (public.loja_ok(loja_id));
create policy historico_ins on public.historico for insert to authenticated with check (public.loja_ok(loja_id));

create policy auditoria_sel on public.auditoria for select to authenticated using (public.loja_ok(loja_id));
create policy auditoria_ins on public.auditoria for insert to authenticated with check (public.loja_ok(loja_id));

create policy config_setor_sel on public.config_setor for select to authenticated using (public.loja_ok(loja_id));

create policy equipe_sel on public.equipe_permitida for select to authenticated using (public.nivel_do_usuario() <= 5 and public.loja_ok(loja_id));

create policy setores_sel on public.setores_customizados for select to authenticated using (public.loja_ok(loja_id));
create policy setores_ins on public.setores_customizados for insert to authenticated with check (public.nivel_do_usuario() <= 6 and public.loja_ok(loja_id));
create policy setores_upd on public.setores_customizados for update to authenticated using (public.nivel_do_usuario() <= 6 and public.loja_ok(loja_id)) with check (public.loja_ok(loja_id));

create policy subsetores_sel on public.subsetores_customizados for select to authenticated using (public.loja_ok(loja_id));
create policy subsetores_ins on public.subsetores_customizados for insert to authenticated with check (public.nivel_do_usuario() <= 6 and public.loja_ok(loja_id));
create policy subsetores_upd on public.subsetores_customizados for update to authenticated using (public.nivel_do_usuario() <= 6 and public.loja_ok(loja_id)) with check (public.loja_ok(loja_id));

-- configuração/valores da loja
create policy config_loja_sel on public.config_loja for select to authenticated using (public.loja_numero_ok(loja_numero));
create policy config_loja_ins on public.config_loja for insert to authenticated with check (public.nivel_do_usuario() <= 4 and public.loja_numero_ok(loja_numero));
create policy config_loja_upd on public.config_loja for update to authenticated using (public.nivel_do_usuario() <= 4 and public.loja_numero_ok(loja_numero)) with check (public.loja_numero_ok(loja_numero));

create policy resumo_sel on public.resumo_lojas_rede for select to authenticated using (public.nivel_do_usuario() <= 5);
create policy resumo_ins on public.resumo_lojas_rede for insert to authenticated with check (public.nivel_do_usuario() <= 5 and public.loja_numero_ok(loja_numero));
create policy resumo_upd on public.resumo_lojas_rede for update to authenticated using (public.nivel_do_usuario() <= 5 and public.loja_numero_ok(loja_numero)) with check (public.loja_numero_ok(loja_numero));

-- trilhas
create policy login_aud_ins on public.login_auditoria for insert to authenticated with check (usuario_id = auth.uid());
create policy login_aud_sel on public.login_auditoria for select to authenticated using (usuario_id = auth.uid() or public.nivel_do_usuario() <= 2 or (public.nivel_do_usuario() <= 4 and public.loja_ok(loja_id)));
create policy valid_alt_ins on public.validade_alteracoes for insert to authenticated with check (public.tem_perfil());
create policy valid_alt_sel on public.validade_alteracoes for select to authenticated using (public.nivel_do_usuario() <= 5);

create policy avisos_sel on public.avisos for select to authenticated using (public.loja_ok(loja_id));
create policy push_sel on public.push_subscriptions for select to authenticated using (usuario_id = auth.uid());

-- usuários: só leitura (cargo/loja só mudam pelas funções com checagem). Some a política que deixava editar a si mesmo.
create policy usuarios_sel_proprio on public.usuarios for select to authenticated using (auth.uid() = id);
create policy usuarios_sel_gestao on public.usuarios for select to authenticated using (public.nivel_do_usuario() <= 5 and (public.eh_gestao_global() or loja_id = public.loja_do_usuario()));

-- lojas e cargos: leitura aberta (a tela de cadastro precisa); escrita só gestão global
create policy lojas_sel on public.lojas for select to anon, authenticated using (true);
create policy lojas_ins on public.lojas for insert to authenticated with check (public.eh_gestao_global());
create policy lojas_upd on public.lojas for update to authenticated using (public.eh_gestao_global()) with check (public.eh_gestao_global());
create policy cargos_sel on public.cargos for select to anon, authenticated using (true);

-- ---------- 5. Permissões de tabela ----------------------------------------
revoke all on all tables in schema public from anon;
grant select on public.lojas, public.cargos to anon;

revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke all on public.bootstrap_admins, public.ia_config, public.limite_uso from authenticated;

-- somente leitura para o app (a escrita acontece só por funções com checagem)
revoke insert, update, delete on public.avisos, public.cargos, public.consentimentos, public.solicitacoes_lgpd,
  public.solicitacoes_exclusao, public.ia_uso, public.ia_acoes, public.acoes_preventivas, public.designacoes_ronda,
  public.usuarios, public.push_subscriptions, public.config_setor, public.equipe_permitida from authenticated;
-- trilhas: só inserção (ninguém apaga/edita rastro)
revoke update, delete on public.historico, public.auditoria, public.login_auditoria, public.validade_alteracoes from authenticated;
-- sem apagar cadastros-base pelo app
revoke delete on public.catalogo, public.config_loja, public.resumo_lojas_rede, public.setores_customizados,
  public.subsetores_customizados, public.lojas, public.convites_promotor from authenticated;
revoke update on public.convites_promotor, public.funcionarios_pendentes from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------- 6. Funções ------------------------------------------------------
alter function public.config_loja_guarda_balanca() set search_path = public;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon', r.f);
  end loop;
  -- internas: nem o app logado chama
  for r in select p.oid::regprocedure f from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
             and (p.proname like '\_%' or p.proname like 'condor\_%' or p.proname in
                  ('config_loja_guarda_balanca','sincronizar_email_usuario','handle_new_user','lancar_validade','whatsapp_limpar')) loop
    execute format('revoke all on function %s from authenticated', r.f);
  end loop;
end $$;
-- único chamado antes do login (tela de cadastro por matrícula)
grant execute on function public.buscar_funcionario_pendente(text) to anon, authenticated;
grant execute on function public.salvar_push(text, jsonb, text, bigint) to authenticated;
grant execute on function public.tem_perfil(), public.loja_ok(bigint), public.loja_numero_ok(text) to authenticated;
revoke all on function public.rl_checar(text, int), public.trg_limite() from public, anon, authenticated;

-- ---------- 7. Limites de tamanho (valem para dados novos) ------------------
do $$
declare r record;
begin
  for r in select * from (values
    ('produtos','foto',600000), ('produtos','observacoes',2000), ('produtos','nome',300),
    ('catalogo','foto',600000), ('catalogo','nome',300),
    ('historico','foto',600000), ('historico','foto_ocorrencia',600000), ('historico','observacoes',2000), ('historico','nome',300),
    ('auditoria','detalhe',2000), ('login_auditoria','dispositivo',600)
  ) v(t, c, m) loop
    if not exists (select 1 from pg_constraint where conname = 'tam_' || r.t || '_' || r.c) then
      execute format('alter table public.%I add constraint %I check (length(%I) <= %s) not valid', r.t, 'tam_' || r.t || '_' || r.c, r.c, r.m);
    end if;
  end loop;
end $$;

-- ---------- 8. AUTO-TESTE: se qualquer checagem falhar, NADA é aplicado (volta tudo) ----------
-- Os testes rodam dentro de um sub-bloco que sempre desfaz o que fez (não deixa dados de teste).
do $$
declare
  falhas text := '';
  dev  constant text := '66fc204f-99d3-4cbf-ac20-f75b7be16c6c';
  outro constant text := 'd2840fa1-6c2b-4b4e-a735-fd355a5c35d4';
  n int; i int; msg text;
begin
  begin
    -- (a) DEV logado: vê dados, grava, mas NÃO consegue mudar o próprio cargo
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', dev, 'role', 'authenticated')::text, true);
    select count(*) into n from public.produtos;
    if n = 0 then falhas := falhas || ' [dev não vê produtos]'; end if;
    begin
      insert into public.produtos(id, barcode, nome, setor, validade, dias_alerta, quantidade, loja_id)
      values ('zz_teste_1', '1', 'TESTE', 'Mercearia', current_date + 400, 5, 1, 1);
    exception when others then falhas := falhas || ' [dev não consegue gravar produto: ' || sqlerrm || ']'; end;
    begin
      update public.usuarios set cargo_id = 7 where id = dev::uuid;
      falhas := falhas || ' [usuário ainda edita o próprio cargo]';
    exception when others then null; end;
    begin perform public.salvar_push('https://exemplo.invalid/endpoint-teste', '{"a":1}'::jsonb, 'teste', 1);
    exception when others then falhas := falhas || ' [salvar_push: ' || sqlerrm || ']'; end;
    begin perform public.painel_rede(7);
    exception when others then falhas := falhas || ' [painel_rede: ' || sqlerrm || ']'; end;
    begin perform public.exportar_meus_dados();
    exception when others then falhas := falhas || ' [exportar_meus_dados: ' || sqlerrm || ']'; end;
    begin perform * from public.buscar_funcionario_pendente('123');
    exception when others then falhas := falhas || ' [buscar_funcionario_pendente logado: ' || sqlerrm || ']'; end;
    begin
      insert into public.historico(barcode, nome, setor, quantidade, loja_id) values ('1', 't', 'Mercearia', 1, 1);
    exception when others then falhas := falhas || ' [historico insert: ' || sqlerrm || ']'; end;
    begin delete from public.historico; falhas := falhas || ' [historico ainda pode ser apagado]';
    exception when others then null; end;
    begin perform public.condor_disparar_push('x'); falhas := falhas || ' [função interna acessível]';
    exception when others then null; end;
    begin insert into public.login_auditoria(usuario_id, nome) values (outro::uuid, 'x'); falhas := falhas || ' [login_auditoria aceita outro usuário]';
    exception when others then null; end;

    -- (b) logado sem cadastro: não vê nem grava nada
    perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
    select count(*) into n from public.produtos;
    if n <> 0 then falhas := falhas || ' [sem cadastro ainda vê produtos]'; end if;
    begin
      insert into public.produtos(id, barcode, nome, setor, validade, dias_alerta, loja_id) values ('zz_teste_2', '1', 'X', 'M', current_date + 400, 5, 1);
      falhas := falhas || ' [sem cadastro consegue gravar]';
    exception when others then null; end;

    -- (c) funcionário (nível 6) da loja: grava na própria loja, não na outra, não mexe em valores da loja, e é limitado por minuto
    execute 'reset role';
    update public.usuarios set cargo_id = (select id from public.cargos where nivel = 6 limit 1) where id = outro::uuid;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', outro, 'role', 'authenticated')::text, true);
    begin
      insert into public.produtos(id, barcode, nome, setor, validade, dias_alerta, loja_id) values ('zz_teste_3', '1', 'X', 'M', current_date + 400, 5, 1);
    exception when others then falhas := falhas || ' [funcionário não grava na própria loja: ' || sqlerrm || ']'; end;
    begin
      insert into public.produtos(id, barcode, nome, setor, validade, dias_alerta, loja_id) values ('zz_teste_4', '1', 'X', 'M', current_date + 400, 5, 999);
      falhas := falhas || ' [funcionário grava em outra loja]';
    exception when others then null; end;
    begin insert into public.config_loja(loja_numero, faturamento_mensal) values ('1', 1); falhas := falhas || ' [funcionário altera config da loja]';
    exception when others then null; end;
    msg := '';
    begin
      for i in 1..320 loop
        insert into public.produtos(id, barcode, nome, setor, validade, dias_alerta, loja_id) values ('zz_r' || i, '1', 'X', 'M', current_date + 400, 5, 1);
      end loop;
    exception when others then msg := sqlerrm; end;
    if msg <> 'limite_excedido' then falhas := falhas || ' [limite por minuto não funcionou: ' || coalesce(nullif(msg, ''), 'não limitou') || ']'; end if;

    -- (d) sem login (anon)
    execute 'reset role';
    execute 'set local role anon';
    begin perform count(*) from public.produtos; falhas := falhas || ' [anon lê produtos]'; exception when others then null; end;
    begin perform count(*) from public.lojas; exception when others then falhas := falhas || ' [anon não lê lojas]'; end;
    begin perform * from public.buscar_funcionario_pendente('123'); exception when others then falhas := falhas || ' [anon não consulta matrícula: ' || sqlerrm || ']'; end;
    begin perform public.painel_rede(7); falhas := falhas || ' [anon executa painel_rede]'; exception when others then null; end;
    begin perform public.eh_gestao_global(); falhas := falhas || ' [anon executa helper]'; exception when others then null; end;

    execute 'reset role';
    raise exception 'fim_do_teste';   -- desfaz tudo que o teste fez
  exception when others then
    if sqlerrm <> 'fim_do_teste' then falhas := falhas || ' [erro inesperado no teste: ' || sqlerrm || ']'; end if;
  end;
  if falhas <> '' then
    raise exception 'AUTO-TESTE DE SEGURANCA FALHOU, NADA FOI APLICADO:%', falhas;
  end if;
end $$;

commit;
select 'OK: segurança aplicada e auto-teste passou' as resultado;

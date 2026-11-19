-- Monitoramento de erros do app (do próprio banco, sem serviço externo): quando o app quebra no aparelho de alguém,
-- ele manda uma linha curta (mensagem, tela, versão). SEM dado pessoal de produto/loja: só quem (id da conta), qual loja,
-- navegador resumido, a mensagem técnica e o trecho da pilha. Guardado por 30 dias.
-- Rodar depois de supabase-seguranca.sql. Sem acesso direto à tabela: só pela RPC (e leitura só do DEV).

create table if not exists public.erros_app (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  ultimo_em timestamptz not null default now(),
  ocorrencias integer not null default 1,
  hash text not null,
  usuario_id uuid,
  loja_id bigint,
  versao text,
  rota text,
  mensagem text not null,
  pilha text,
  navegador text
);
create unique index if not exists erros_app_hash_hora on public.erros_app (hash, (date_trunc('hour', criado_em at time zone 'UTC')));
create index if not exists erros_app_criado on public.erros_app (criado_em desc);
alter table public.erros_app enable row level security;
revoke all on public.erros_app from public, anon, authenticated;   -- nenhuma policy: só as funções abaixo acessam

create or replace function public.registrar_erro_app(p_versao text, p_rota text, p_mensagem text, p_pilha text, p_navegador text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_msg text; v_pilha text; v_h text;
begin
  if auth.uid() is null or public.nivel_do_usuario() is null then return; end if;   -- só conta com perfil (anônimo sem convite não grava)
  v_msg := left(btrim(coalesce(p_mensagem, '')), 300);
  if v_msg = '' then return; end if;
  v_pilha := left(coalesce(p_pilha, ''), 1500);
  begin perform public.rl_checar('erro_app', 12); exception when others then return; end;   -- limite por minuto: nunca vira enchente
  if (select count(*) from public.erros_app where criado_em > now() - interval '1 hour') >= 300 then return; end if;   -- teto global por hora
  v_h := md5(v_msg || '|' || left(coalesce(p_rota, ''), 80) || '|' || left(coalesce(p_versao, ''), 40));
  insert into public.erros_app(hash, usuario_id, loja_id, versao, rota, mensagem, pilha, navegador)
  values (v_h, auth.uid(), public.loja_do_usuario(), left(p_versao, 40), left(p_rota, 60), v_msg, v_pilha, left(p_navegador, 120))
  on conflict (hash, (date_trunc('hour', criado_em at time zone 'UTC')))
  do update set ocorrencias = public.erros_app.ocorrencias + 1, ultimo_em = now();
exception when others then return;                            -- registrar erro nunca pode quebrar o app
end $$;
revoke all on function public.registrar_erro_app(text, text, text, text, text) from public, anon;
grant execute on function public.registrar_erro_app(text, text, text, text, text) to authenticated;

-- Leitura: só DESENVOLVEDOR (nível 1)
create or replace function public.listar_erros_app(p_horas integer default 72)
returns table(quando timestamptz, vezes integer, versao text, rota text, mensagem text, pilha text, navegador text, loja bigint)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if coalesce(public.nivel_do_usuario(), 99) > 1 then raise exception 'sem_permissao'; end if;
  return query select e.ultimo_em, e.ocorrencias, e.versao, e.rota, e.mensagem, e.pilha, e.navegador, e.loja_id
    from public.erros_app e where e.ultimo_em > now() - make_interval(hours => greatest(1, least(coalesce(p_horas, 72), 720)))
    order by e.ultimo_em desc limit 200;
end $$;
revoke all on function public.listar_erros_app(integer) from public, anon;
grant execute on function public.listar_erros_app(integer) to authenticated;

-- Retenção: 30 dias (descrito na Política de Privacidade)
do $$ begin
  perform cron.unschedule('erros_app_limpar') where exists (select 1 from cron.job where jobname = 'erros_app_limpar');
  perform cron.schedule('erros_app_limpar', '23 3 * * *', $c$delete from public.erros_app where criado_em < now() - interval '30 days'$c$);
end $$;

-- Exportação dos dados do titular (LGPD) ganha o campo "erros_app" (quantidade e datas dos erros ligados à conta)
do $$ declare d text; novo text;
begin
  d := pg_get_functiondef('public._rl_exportar_meus_dados()'::regprocedure);
  if position('erros_app' in d) = 0 then
    novo := replace(d, E'\'telegram\', (select jsonb_build_object(', E'\'erros_app\', (select coalesce(jsonb_agg(jsonb_build_object(\'quando\', ea.ultimo_em, \'vezes\', ea.ocorrencias, \'tela\', ea.rota, \'mensagem\', ea.mensagem)), \'[]\'::jsonb) from public.erros_app ea where ea.usuario_id = auth.uid()),\n    \'telegram\', (select jsonb_build_object(');
    if novo = d then raise exception 'exportar_meus_dados mudou: não foi possível acrescentar erros_app (nada foi aplicado)'; end if;
    execute novo;
  end if;
end $$;

-- AUTO-TESTE
do $$
declare falhas text := '';
begin
  if has_table_privilege('authenticated', 'public.erros_app', 'select') then falhas := falhas || ' [authenticated lê a tabela]'; end if;
  if has_table_privilege('anon', 'public.erros_app', 'insert') then falhas := falhas || ' [anon escreve]'; end if;
  if has_function_privilege('anon', 'public.registrar_erro_app(text,text,text,text,text)', 'execute') then falhas := falhas || ' [anon executa]'; end if;
  if has_function_privilege('anon', 'public.listar_erros_app(integer)', 'execute') then falhas := falhas || ' [anon lista]'; end if;
  if not exists (select 1 from cron.job where jobname = 'erros_app_limpar') then falhas := falhas || ' [sem cron]'; end if;
  if position('erros_app' in pg_get_functiondef('public._rl_exportar_meus_dados()'::regprocedure)) = 0 then falhas := falhas || ' [exportação sem erros_app]'; end if;
  if falhas <> '' then raise exception 'AUTO-TESTE FALHOU:%', falhas; end if;
  raise notice 'erros_app: OK';
end $$;

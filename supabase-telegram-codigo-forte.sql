-- Item 3: código do Telegram forte + trava de erros. Rode no SQL Editor (tem auto-teste). Rode DEPOIS de supabase-revisao.sql.
-- Antes: 8 DÍGITOS (100 milhões de combinações) e um balde GLOBAL que qualquer um esgotava para travar a vinculação de todos.
-- Agora: 8 caracteres de um alfabeto de 32 (~1,1 trilhão de combinações), gerado só pelo servidor, e trava por chat após erros.

-- 1) trava por erros (por chat do Telegram): só o bot (service_role) mexe
create table if not exists public.telegram_falhas (
  chat_id bigint primary key,
  n int not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table public.telegram_falhas enable row level security;
revoke all on public.telegram_falhas from public, anon, authenticated;

-- devolve quantos segundos o chat ainda está bloqueado (0 = livre)
create or replace function public.telegram_vinc_bloqueio(p_chat_id bigint) returns int
language sql security definer set search_path = public as $$
  select coalesce(greatest(0, ceil(extract(epoch from (bloqueado_ate - now()))))::int, 0)
  from public.telegram_falhas where chat_id = p_chat_id;
$$;

-- registra 1 código errado; a cada 5 erros bloqueia (15 min, depois 1 h, depois 24 h)
create or replace function public.telegram_vinc_falha(p_chat_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare f public.telegram_falhas%rowtype; v_bloq interval;
begin
  insert into public.telegram_falhas(chat_id, n) values (p_chat_id, 1)
  on conflict (chat_id) do update set n = public.telegram_falhas.n + 1, atualizado_em = now()
  returning * into f;
  if f.n % 5 = 0 then
    v_bloq := case when f.n >= 15 then interval '24 hours' when f.n >= 10 then interval '1 hour' else interval '15 minutes' end;
    update public.telegram_falhas set bloqueado_ate = now() + v_bloq where chat_id = p_chat_id;
    return ceil(extract(epoch from v_bloq))::int;
  end if;
  return 0;
end $$;

-- vinculou com sucesso: zera o histórico de erros
create or replace function public.telegram_vinc_ok(p_chat_id bigint) returns void
language sql security definer set search_path = public as $$
  delete from public.telegram_falhas where chat_id = p_chat_id;
$$;
revoke all on function public.telegram_vinc_bloqueio(bigint), public.telegram_vinc_falha(bigint), public.telegram_vinc_ok(bigint) from public, anon, authenticated;
grant execute on function public.telegram_vinc_bloqueio(bigint), public.telegram_vinc_falha(bigint), public.telegram_vinc_ok(bigint) to service_role;

-- limpeza: erros antigos (sem bloqueio ativo) saem em 2 dias
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('limpar-telegram-falhas') where exists (select 1 from cron.job where jobname = 'limpar-telegram-falhas');
    perform cron.schedule('limpar-telegram-falhas', '17 * * * *', $c$ delete from public.telegram_falhas where atualizado_em < now() - interval '2 days' and (bloqueado_ate is null or bloqueado_ate < now()) $c$);
  end if;
end $$;

-- 2) gerar código forte (8 caracteres; sem 0/O/1/I)
create or replace function public.gerar_codigo_telegram()
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; v_cod text; v_exp timestamptz := now() + interval '10 minutes'; tent int := 0;
        alfa text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  perform public.rl_checar('tg_codigo', 5);
  select id, ativo, promotor, loja_id into u from public.usuarios where id = auth.uid();
  if not found or not u.ativo or u.promotor or u.loja_id is null then raise exception 'usuario_invalido'; end if;
  if exists (select 1 from public.telegram_vinculos where usuario_id = u.id) then raise exception 'ja_vinculado'; end if;
  loop
    v_cod := '';
    for i in 1..8 loop
      v_cod := v_cod || substr(alfa, 1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), i * 2 - 1, 2))::bit(8)::int % 32), 1);
    end loop;
    begin
      insert into public.telegram_codigos (usuario_id, codigo, expira_em) values (u.id, v_cod, v_exp)
        on conflict (usuario_id) do update set codigo = excluded.codigo, expira_em = excluded.expira_em;
      exit;
    exception when unique_violation then
      tent := tent + 1; if tent > 10 then raise exception 'codigo_indisponivel'; end if;
    end;
  end loop;
  return jsonb_build_object('codigo', v_cod, 'expira_em', v_exp);
end $$;
revoke all on function public.gerar_codigo_telegram() from public, anon;
grant execute on function public.gerar_codigo_telegram() to authenticated;

-- 3) vincular: aceita letras e números (códigos numéricos antigos ainda valem pelos 10 minutos)
create or replace function public.telegram_vincular_funcionario(p_chat_id bigint, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; u record; v_id uuid; v_cod text;
begin
  v_cod := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_cod) <> 8 then raise exception 'codigo_invalido'; end if;
  select * into c from public.telegram_codigos where codigo = v_cod and expira_em > now();
  if not found then raise exception 'codigo_invalido'; end if;
  select id, nome, loja_id, ativo, promotor into u from public.usuarios where id = c.usuario_id;
  if not found or not u.ativo or u.promotor then raise exception 'usuario_invalido'; end if;
  if exists (select 1 from public.telegram_vinculos where chat_id = p_chat_id) then raise exception 'chat_ja_vinculado'; end if;
  insert into public.telegram_vinculos (chat_id, tipo, usuario_id, loja_id, nome) values (p_chat_id, 'funcionario', u.id, u.loja_id, u.nome)
    returning id into v_id;
  delete from public.telegram_codigos where usuario_id = u.id;
  insert into public.auditoria (usuario, acao, detalhe, loja_id) values (u.nome, 'vinculou Telegram', u.nome, u.loja_id);
  return jsonb_build_object('nome', u.nome, 'tipo', 'funcionario');
end $$;
revoke all on function public.telegram_vincular_funcionario(bigint, text) from public, anon, authenticated;
grant execute on function public.telegram_vincular_funcionario(bigint, text) to service_role;

-- AUTO-TESTE
do $do$
declare r jsonb; n int; b int;
begin
  if not exists (select 1 from pg_class where relname = 'telegram_falhas' and relrowsecurity) then raise exception 'auto-teste: telegram_falhas sem RLS'; end if;
  if has_function_privilege('anon', 'public.telegram_vinc_falha(bigint)', 'execute') or has_function_privilege('authenticated', 'public.telegram_vinc_falha(bigint)', 'execute') then raise exception 'auto-teste: telegram_vinc_falha aberta'; end if;
  if not has_function_privilege('service_role', 'public.telegram_vinc_falha(bigint)', 'execute') then raise exception 'auto-teste: service_role sem acesso'; end if;
  -- simula 5 erros num chat fictício e confere o bloqueio
  delete from public.telegram_falhas where chat_id = -999000111;
  for n in 1..4 loop b := public.telegram_vinc_falha(-999000111); if b <> 0 then raise exception 'auto-teste: bloqueou cedo'; end if; end loop;
  b := public.telegram_vinc_falha(-999000111);
  if b <> 900 then raise exception 'auto-teste: 5o erro deveria bloquear 900s (%)', b; end if;
  if public.telegram_vinc_bloqueio(-999000111) <= 0 then raise exception 'auto-teste: bloqueio nao ficou'; end if;
  perform public.telegram_vinc_ok(-999000111);
  if public.telegram_vinc_bloqueio(-999000111) <> 0 then raise exception 'auto-teste: ok nao zerou'; end if;
  if pg_get_functiondef('public.gerar_codigo_telegram()'::regprocedure) not like '%23456789%' then raise exception 'auto-teste: gerador antigo'; end if;
end $do$;

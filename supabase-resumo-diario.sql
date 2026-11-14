-- RESUMO DIÁRIO PARA O ENCARREGADO (2026-11-14, pedido do dono). Rode ANTES de publicar o app e a Edge Function `resumo-diario`.
-- O que cria (nada existente é alterado, exceto exportar_meus_dados, que ganha o campo "resumo_diario"):
--  * resumo_diario_prefs  : escolha de cada pessoa (Telegram / push / e-mail). TUDO DESLIGADO por padrão. Só o próprio usuário lê; só RPC grava.
--  * resumo_diario_envios : 1 linha por pessoa/dia/canal (trava de "no máximo 1 envio por dia"; apagada depois de 30 dias). Ninguém acessa direto.
--  * salvar_resumo_diario : única porta de escrita (só nível <= 5, ativo, não anônimo; Telegram/e-mail/push só liga se o canal existe; audita).
--  * resumo_diario_calcular / _destinatarios / _reservar / _liberar / _validar : só a chave de serviço (a Edge Function) executa.
--  * resumo_diario_disparar: chamada pelo agendador (pg_cron) às 07:00 e 08:00 de Brasília (10:00/11:00 UTC; o das 08:00 só refaz o que falhou).
--    Fala com a Edge Function por um segredo gerado AQUI e guardado no Vault (nunca sai do banco; a função confere o segredo pelo banco).
-- Regras do resumo: cada encarregado (nível 5) vê SÓ o setor dele (sem setor = loja toda); gerência/diretoria da loja veem a loja toda.
--   Sem nada a avisar (nenhum lote vencido, vencendo em até 10 dias ou pedido de produto novo esperando), NÃO manda mensagem.
-- Para desfazer: select cron.unschedule('resumo_diario_7h'); select cron.unschedule('resumo_diario_8h'); depois apague as tabelas/funções
--   (drop table resumo_diario_envios, resumo_diario_prefs; drop function ...). Sem dado de produto é tocado.
-- NÃO reaplicar supabase-lgpd-respostas.sql / supabase-seguranca.sql depois sem rodar este de novo (a exportação perde o campo novo).
-- Auto-teste: se algo falhar, nada é aplicado (transação desfeita). O auto-teste NÃO grava nada em dado real.
begin;

-- 1) Tabelas ------------------------------------------------------------------------------------------------------------
create table if not exists public.resumo_diario_prefs (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  telegram boolean not null default false,
  push boolean not null default false,
  email boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.resumo_diario_envios (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  dia date not null,
  canal text not null check (canal in ('telegram','push','email')),
  enviado_em timestamptz not null default now(),
  primary key (usuario_id, dia, canal)
);
alter table public.resumo_diario_prefs enable row level security;
alter table public.resumo_diario_envios enable row level security;
revoke all on public.resumo_diario_prefs from public, anon, authenticated;
revoke all on public.resumo_diario_envios from public, anon, authenticated;
grant select on public.resumo_diario_prefs to authenticated;
drop policy if exists resumo_prefs_proprio on public.resumo_diario_prefs;
create policy resumo_prefs_proprio on public.resumo_diario_prefs for select to authenticated using (usuario_id = (select auth.uid()));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'resumo_diario_prefs') then
    alter publication supabase_realtime add table public.resumo_diario_prefs;
  end if;
end $$;

-- 2) Regra de setor (pura, testável): igual à _setor_ok, mas para um usuário informado ----------------------------------
create or replace function public._setor_casa(p_setor text, p_usuario_setor text) returns boolean
language plpgsql immutable set search_path = public as $f$
declare s text := public._norm_setor(p_usuario_setor); d text := public._norm_setor(p_setor);
begin
  if s is null or s = '' then return true; end if;
  return d = s or left(d, length(s) + 1) = s || ' ' or left(s, length(d) + 1) = d || ' ';
end $f$;

-- 3) Escolha da pessoa (única porta de escrita) -------------------------------------------------------------------------
create or replace function public.salvar_resumo_diario(p_telegram boolean, p_push boolean, p_email boolean) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare u record; v_ant public.resumo_diario_prefs%rowtype; v_tem boolean;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  perform public.rl_checar('resumo_pref', 20);
  select us.id, us.nome, us.loja_id, us.email, coalesce(us.ativo, true) as ativo, coalesce(au.is_anonymous, false) as anonimo
    into u from public.usuarios us left join auth.users au on au.id = us.id where us.id = auth.uid();
  if not found or not u.ativo or u.anonimo or u.loja_id is null then raise exception 'sem_permissao'; end if;
  if coalesce(public.nivel_do_usuario(), 99) > 5 then raise exception 'sem_permissao'; end if;
  if p_telegram is null or p_push is null or p_email is null then raise exception 'dados_invalidos'; end if;
  select * into v_ant from public.resumo_diario_prefs where usuario_id = u.id;
  v_tem := found;
  -- só confere o canal que a pessoa está LIGANDO agora (um canal que já estava ligado e quebrou não trava os outros)
  if p_telegram and not (v_tem and v_ant.telegram) and not exists (select 1 from public.telegram_vinculos v where v.usuario_id = u.id and v.tipo = 'funcionario') then raise exception 'telegram_nao_vinculado'; end if;
  if p_email and not (v_tem and v_ant.email) and (u.email is null or u.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'sem_email'; end if;
  if p_push and not (v_tem and v_ant.push) and not exists (select 1 from public.push_subscriptions s where s.usuario_id = u.id) then raise exception 'push_nao_ativo'; end if;
  if v_tem and v_ant.telegram = p_telegram and v_ant.push = p_push and v_ant.email = p_email then
    return jsonb_build_object('telegram', p_telegram, 'push', p_push, 'email', p_email, 'mudou', false);
  end if;
  insert into public.resumo_diario_prefs as r (usuario_id, telegram, push, email, atualizado_em) values (u.id, p_telegram, p_push, p_email, now())
    on conflict (usuario_id) do update set telegram = excluded.telegram, push = excluded.push, email = excluded.email, atualizado_em = now();
  insert into public.auditoria (usuario, acao, detalhe, loja_id) values (u.nome, 'alterou resumo diário',
    'Telegram ' || case when p_telegram then 'sim' else 'não' end || ' · push ' || case when p_push then 'sim' else 'não' end || ' · e-mail ' || case when p_email then 'sim' else 'não' end, u.loja_id);
  return jsonb_build_object('telegram', p_telegram, 'push', p_push, 'email', p_email, 'mudou', true);
end $f$;

-- 4) Cálculo do resumo de UMA pessoa (só a Edge Function, com a chave de serviço) ---------------------------------------
create or replace function public.resumo_diario_calcular(p_usuario uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare u record; hoje date := public.hoje_br(); r jsonb; v_aprov int;
begin
  select us.id, us.nome, us.loja_id, us.setor, c.nivel into u from public.usuarios us join public.cargos c on c.id = us.cargo_id
   where us.id = p_usuario and coalesce(us.ativo, true);
  if not found or u.loja_id is null or u.nivel > 5 then return null; end if;
  with p as (
    select pr.id, pr.nome, pr.validade, pr.lote, pr.sem_lote, pr.quantidade, pr.pedido_tipo, (pr.validade - hoje) as dias
      from public.produtos pr
     where pr.loja_id = u.loja_id and pr.validade is not null and pr.validade <= hoje + 10
       and (u.nivel <= 4 or public._setor_casa(pr.setor, u.setor))
  )
  select jsonb_build_object(
    'vencidos', count(*) filter (where dias < 0),
    'hoje', count(*) filter (where dias = 0),
    'amanha', count(*) filter (where dias = 1),
    'ate10', count(*) filter (where dias between 0 and 10),
    'sem_pedido', count(*) filter (where dias between 0 and 10 and pedido_tipo is null),
    'top', coalesce((select jsonb_agg(jsonb_build_object('nome', left(t.nome, 60), 'dias', t.dias, 'validade', t.validade, 'lote', case when t.sem_lote then null else left(t.lote, 20) end,
                      'quantidade', t.quantidade, 'pedido', t.pedido_tipo is not null) order by (t.dias < 0), (t.pedido_tipo is not null), abs(t.dias), t.quantidade desc nulls last)
                      from (select * from p order by (dias < 0), (pedido_tipo is not null), abs(dias), quantidade desc nulls last limit 5) t), '[]'::jsonb))
    into r from p;
  select count(*) into v_aprov from public.aprovacoes_produto a
   where a.loja_id = u.loja_id and a.status = 'pendente' and (u.nivel <= 4 or public._setor_casa(a.setor, u.setor));
  return r || jsonb_build_object('aprovacoes', v_aprov, 'nome', u.nome, 'setor', nullif(btrim(coalesce(u.setor, '')), ''), 'hoje_data', hoje);
end $f$;

-- 5) Quem recebe (só serviço) -------------------------------------------------------------------------------------------
create or replace function public.resumo_diario_destinatarios() returns table (usuario_id uuid, nome text, quer_telegram boolean, quer_push boolean, quer_email boolean, chat_id bigint, email text)
language sql stable security definer set search_path = public as $f$
  select us.id, us.nome, p.telegram, p.push, p.email,
         (select v.chat_id from public.telegram_vinculos v where v.usuario_id = us.id and v.tipo = 'funcionario' limit 1),
         case when us.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then us.email end
    from public.resumo_diario_prefs p
    join public.usuarios us on us.id = p.usuario_id
    join public.cargos c on c.id = us.cargo_id
    join auth.users au on au.id = us.id
   where (p.telegram or p.push or p.email) and coalesce(us.ativo, true) and coalesce(au.is_anonymous, false) = false
     and us.loja_id is not null and c.nivel <= 5
   order by us.id limit 500;
$f$;

-- 6) Trava de 1 envio por dia (reserva atômica) -------------------------------------------------------------------------
create or replace function public.resumo_diario_reservar(p_usuario uuid, p_canal text) returns boolean
language plpgsql security definer set search_path = public as $f$
declare n int;
begin
  if p_canal not in ('telegram','push','email') then raise exception 'canal_invalido'; end if;
  insert into public.resumo_diario_envios (usuario_id, dia, canal) values (p_usuario, public.hoje_br(), p_canal) on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $f$;
create or replace function public.resumo_diario_liberar(p_usuario uuid, p_canal text) returns void
language sql security definer set search_path = public as $f$
  delete from public.resumo_diario_envios where usuario_id = p_usuario and dia = public.hoje_br() and canal = p_canal;
$f$;

-- 7) Segredo do agendador (Vault) + conferência ------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'resumo_diario_segredo') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'resumo_diario_segredo', 'segredo do disparo do resumo diário (7h)');
  end if;
end $$;
create or replace function public.resumo_diario_validar(p_segredo text) returns boolean
language sql stable security definer set search_path = public as $f$
  select coalesce(p_segredo, '') <> '' and exists (select 1 from vault.decrypted_secrets s where s.name = 'resumo_diario_segredo' and s.decrypted_secret = p_segredo);
$f$;

-- 8) Disparo (agendador) ------------------------------------------------------------------------------------------------
create or replace function public.resumo_diario_disparar() returns bigint
language plpgsql security definer set search_path = public as $f$
declare seg text; id bigint;
begin
  select decrypted_secret into seg from vault.decrypted_secrets where name = 'resumo_diario_segredo';
  if seg is null then raise exception 'segredo_ausente'; end if;
  delete from public.resumo_diario_envios where dia < public.hoje_br() - 30; -- retenção de 30 dias
  select net.http_post(url := 'https://fbovltxucooeoldjfckk.supabase.co/functions/v1/resumo-diario',
                       headers := jsonb_build_object('Content-Type', 'application/json', 'x-resumo-segredo', seg),
                       body := '{}'::jsonb, timeout_milliseconds := 120000) into id;
  return id;
end $f$;

-- 9) Permissões: padrão é SEM permissão; só o necessário ----------------------------------------------------------------
revoke all on function public._setor_casa(text, text) from public, anon, authenticated;
revoke all on function public.salvar_resumo_diario(boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.resumo_diario_calcular(uuid) from public, anon, authenticated;
revoke all on function public.resumo_diario_destinatarios() from public, anon, authenticated;
revoke all on function public.resumo_diario_reservar(uuid, text) from public, anon, authenticated;
revoke all on function public.resumo_diario_liberar(uuid, text) from public, anon, authenticated;
revoke all on function public.resumo_diario_validar(text) from public, anon, authenticated;
revoke all on function public.resumo_diario_disparar() from public, anon, authenticated;
grant execute on function public.salvar_resumo_diario(boolean, boolean, boolean) to authenticated;
grant execute on function public._setor_casa(text, text) to service_role;
grant execute on function public.resumo_diario_calcular(uuid) to service_role;
grant execute on function public.resumo_diario_destinatarios() to service_role;
grant execute on function public.resumo_diario_reservar(uuid, text) to service_role;
grant execute on function public.resumo_diario_liberar(uuid, text) to service_role;
grant execute on function public.resumo_diario_validar(text) to service_role;

-- 10) Agenda: 07:00 e 08:00 de Brasília (UTC-3, sem horário de verão). O das 08:00 só refaz o que falhou (a reserva impede repetição) ---
select cron.schedule('resumo_diario_7h', '0 10 * * *', 'select public.resumo_diario_disparar()');
select cron.schedule('resumo_diario_8h', '0 11 * * *', 'select public.resumo_diario_disparar()');

-- 11) Exportação dos dados do titular (LGPD) ganha o campo "resumo_diario" --------------------------------------------
do $$ declare d text; novo text;
begin
  d := pg_get_functiondef('public._rl_exportar_meus_dados()'::regprocedure);
  if position('resumo_diario' in d) = 0 then
    novo := replace(d, E'\'telegram\', (select jsonb_build_object(', E'\'resumo_diario\', (select jsonb_build_object(\'telegram\', rd.telegram, \'push\', rd.push, \'email\', rd.email, \'atualizado_em\', rd.atualizado_em) from public.resumo_diario_prefs rd where rd.usuario_id = auth.uid()),\n    \'telegram\', (select jsonb_build_object(');
    if novo = d then raise exception 'exportar_meus_dados mudou: não foi possível acrescentar o resumo diário (nada foi aplicado)'; end if;
    execute novo;
  end if;
end $$;

-- 12) Auto-teste (sem gravar nada em dado real) ------------------------------------------------------------------------
do $$
declare v_uid uuid; r jsonb; v_seg text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.resumo_diario_prefs'::regclass) or not (select relrowsecurity from pg_class where oid = 'public.resumo_diario_envios'::regclass)
    then raise exception 'auto-teste: RLS desligada'; end if;
  if has_table_privilege('authenticated', 'public.resumo_diario_prefs', 'insert') or has_table_privilege('authenticated', 'public.resumo_diario_prefs', 'update')
     or has_table_privilege('authenticated', 'public.resumo_diario_prefs', 'delete') or has_table_privilege('anon', 'public.resumo_diario_prefs', 'select')
     or has_table_privilege('authenticated', 'public.resumo_diario_envios', 'select') or has_table_privilege('anon', 'public.resumo_diario_envios', 'select')
    then raise exception 'auto-teste: permissão de tabela aberta demais'; end if;
  if has_function_privilege('authenticated', 'public.resumo_diario_calcular(uuid)', 'execute') or has_function_privilege('anon', 'public.resumo_diario_calcular(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.resumo_diario_destinatarios()', 'execute') or has_function_privilege('authenticated', 'public.resumo_diario_reservar(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.resumo_diario_liberar(uuid,text)', 'execute') or has_function_privilege('authenticated', 'public.resumo_diario_validar(text)', 'execute')
     or has_function_privilege('authenticated', 'public.resumo_diario_disparar()', 'execute') or has_function_privilege('anon', 'public.salvar_resumo_diario(boolean,boolean,boolean)', 'execute')
    then raise exception 'auto-teste: função de serviço aberta para usuário'; end if;
  if not has_function_privilege('authenticated', 'public.salvar_resumo_diario(boolean,boolean,boolean)', 'execute')
     or not has_function_privilege('service_role', 'public.resumo_diario_calcular(uuid)', 'execute') then raise exception 'auto-teste: permissão que deveria existir não existe'; end if;
  if not exists (select 1 from cron.job where jobname = 'resumo_diario_7h' and schedule = '0 10 * * *') or not exists (select 1 from cron.job where jobname = 'resumo_diario_8h' and schedule = '0 11 * * *')
    then raise exception 'auto-teste: agenda não criada'; end if;
  -- regra de setor
  if not public._setor_casa('Mercearia Seca', 'Mercearia') or public._setor_casa('Açougue', 'Mercearia') or not public._setor_casa('Padaria', null)
     or not public._setor_casa('Mercearia', 'Mercearia seca') or not public._setor_casa('PADARIA', '  padaria ') then raise exception 'auto-teste: _setor_casa'; end if;
  -- segredo do Vault confere
  select decrypted_secret into v_seg from vault.decrypted_secrets where name = 'resumo_diario_segredo';
  if v_seg is null or not public.resumo_diario_validar(v_seg) or public.resumo_diario_validar('errado') or public.resumo_diario_validar('') or public.resumo_diario_validar(null) then raise exception 'auto-teste: segredo'; end if;
  -- cálculo (só leitura) para uma pessoa real de nível <= 5, se existir
  select us.id into v_uid from public.usuarios us join public.cargos c on c.id = us.cargo_id where coalesce(us.ativo, true) and c.nivel <= 5 and us.loja_id is not null order by us.id limit 1;
  if v_uid is not null then
    r := public.resumo_diario_calcular(v_uid);
    if r is null or not (r ? 'vencidos' and r ? 'hoje' and r ? 'amanha' and r ? 'ate10' and r ? 'sem_pedido' and r ? 'top' and r ? 'aprovacoes') then raise exception 'auto-teste: resumo_diario_calcular'; end if;
    if jsonb_array_length(r -> 'top') > 5 then raise exception 'auto-teste: top maior que 5'; end if;
  end if;
  if public.resumo_diario_calcular('00000000-0000-0000-0000-000000000000') is not null then raise exception 'auto-teste: usuário inexistente deveria dar nulo'; end if;
  if position('resumo_diario' in pg_get_functiondef('public._rl_exportar_meus_dados()'::regprocedure)) = 0 then raise exception 'auto-teste: exportação sem o campo'; end if;
end $$;

commit;

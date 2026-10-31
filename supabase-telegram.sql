-- ============================================================================
-- TELEGRAM: bot de lançamento de validade + código permanente do promotor
-- Rode no SQL Editor do Supabase (pode rodar mais de uma vez). Nada é apagado.
-- Impacto: cria 4 tabelas (telegram_*), 7 funções, a coluna convites_promotor.codigo,
-- aceita origem 'telegram' em produtos e troca lancar_validade (agora aceita promotor).
-- Todas as tabelas novas: RLS ligado, sem escrita direta pelo app, só por funções com checagem.
-- ============================================================================

-- 1) Código curto e permanente do promotor (ex.: BAU-7K3QP) --------------------
alter table public.convites_promotor add column if not exists codigo text;

create or replace function public._gerar_codigo_promotor(p_marca text)
returns text language plpgsql set search_path = public as $$
declare pref text; alfa text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; tent int := 0;
begin
  pref := upper(regexp_replace(translate(coalesce(p_marca,''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç','AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'), '[^A-Za-z]', '', 'g'));
  pref := rpad(left(pref, 3), 3, 'X');
  loop
    c := '';
    for i in 1..5 loop
      c := c || substr(alfa, 1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), i * 2 - 1, 2))::bit(8)::int % 32), 1);
    end loop;
    c := pref || '-' || c;
    exit when not exists (select 1 from public.convites_promotor where upper(codigo) = c);
    tent := tent + 1; if tent > 20 then raise exception 'codigo_indisponivel'; end if;
  end loop;
  return c;
end $$;
revoke all on function public._gerar_codigo_promotor(text) from public, anon, authenticated;

create or replace function public._convite_codigo_trg()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.codigo is null or btrim(new.codigo) = '' then new.codigo := public._gerar_codigo_promotor(new.marca);
  else new.codigo := upper(btrim(new.codigo)); end if;
  return new;
end $$;
revoke all on function public._convite_codigo_trg() from public, anon, authenticated;
drop trigger if exists trg_convite_codigo on public.convites_promotor;
create trigger trg_convite_codigo before insert on public.convites_promotor
  for each row execute function public._convite_codigo_trg();

update public.convites_promotor set codigo = public._gerar_codigo_promotor(marca) where codigo is null;
create unique index if not exists convites_promotor_codigo_uniq on public.convites_promotor (upper(codigo));

-- Entrar pelo link permanente /promotor/<marca>/<codigo> (sessão anônima já criada pelo app)
create or replace function public.resgatar_convite_codigo(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  select token into v_token from public.convites_promotor where upper(codigo) = upper(btrim(coalesce(p_codigo,'')));
  if v_token is null then raise exception 'convite_invalido'; end if;
  return public.resgatar_convite(v_token);
end $$;
revoke all on function public.resgatar_convite_codigo(text) from public, anon;
grant execute on function public.resgatar_convite_codigo(text) to authenticated;

-- 2) Tabelas -------------------------------------------------------------------
create table if not exists public.telegram_vinculos (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null unique,
  tipo text not null check (tipo in ('funcionario','promotor')),
  usuario_id uuid references public.usuarios(id) on delete cascade,
  convite_id uuid references public.convites_promotor(id) on delete cascade,
  loja_id bigint not null,
  nome text,
  vinculado_em timestamptz not null default now(),
  check ((tipo = 'funcionario' and usuario_id is not null) or (tipo = 'promotor' and convite_id is not null))
);
create unique index if not exists telegram_vinculos_usuario_uniq on public.telegram_vinculos (usuario_id) where usuario_id is not null;
create unique index if not exists telegram_vinculos_convite_uniq on public.telegram_vinculos (convite_id) where convite_id is not null;

create table if not exists public.telegram_codigos (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  codigo text not null,
  expira_em timestamptz not null
);
create unique index if not exists telegram_codigos_codigo_uniq on public.telegram_codigos (codigo);

create table if not exists public.telegram_sessoes (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  vinculo_id uuid references public.telegram_vinculos(id) on delete cascade,
  estado text not null check (estado in ('aguardando_info','aguardando_confirmacao','confirmado','registrado','cancelado','erro','expirada')),
  dados jsonb not null default '{}'::jsonb,
  erro text,
  expira_em timestamptz not null default now() + interval '30 minutes',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (pg_column_size(dados) < 700000)
);
create unique index if not exists telegram_sessoes_ativa_uniq on public.telegram_sessoes (chat_id)
  where estado in ('aguardando_info','aguardando_confirmacao','confirmado');

create table if not exists public.telegram_mensagens (
  update_id bigint primary key,
  chat_id bigint,
  tipo text,
  texto text check (length(texto) <= 600),
  status_proc text not null default 'recebida' check (status_proc in ('recebida','processada','erro','ignorada')),
  erro text check (length(erro) <= 600),
  criado_em timestamptz not null default now()
);
create index if not exists telegram_mensagens_chat_idx on public.telegram_mensagens (chat_id, criado_em desc);

alter table public.telegram_vinculos enable row level security;
alter table public.telegram_codigos enable row level security;
alter table public.telegram_sessoes enable row level security;
alter table public.telegram_mensagens enable row level security;
revoke all on public.telegram_vinculos, public.telegram_codigos, public.telegram_sessoes, public.telegram_mensagens from anon, authenticated;
grant select on public.telegram_vinculos, public.telegram_sessoes to authenticated;

drop policy if exists tg_vinculos_ver on public.telegram_vinculos;
create policy tg_vinculos_ver on public.telegram_vinculos for select to authenticated
  using (usuario_id = auth.uid() or (public.nivel_do_usuario() <= 5 and (public.eh_gestao_global() or loja_id = public.loja_do_usuario())));
drop policy if exists tg_sessoes_ver on public.telegram_sessoes;
create policy tg_sessoes_ver on public.telegram_sessoes for select to authenticated
  using (public.nivel_do_usuario() <= 5 and exists (select 1 from public.telegram_vinculos v where v.id = vinculo_id
         and (public.eh_gestao_global() or v.loja_id = public.loja_do_usuario())));

-- 3) Funções chamadas pelo app (usuário logado) --------------------------------
-- Funcionário gera um código de 8 dígitos (vale 10 min) e digita no bot.
create or replace function public.gerar_codigo_telegram()
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; v_cod text; v_exp timestamptz := now() + interval '10 minutes'; tent int := 0;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  perform public.rl_checar('tg_codigo', 5);
  select id, ativo, promotor, loja_id into u from public.usuarios where id = auth.uid();
  if not found or not u.ativo or u.promotor or u.loja_id is null then raise exception 'usuario_invalido'; end if;
  if exists (select 1 from public.telegram_vinculos where usuario_id = u.id) then raise exception 'ja_vinculado'; end if;
  loop
    v_cod := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 100000000)::text, 8, '0');
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

-- Situação do Telegram da própria pessoa (funcionário ou promotor)
create or replace function public.telegram_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; v record; cod text;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  select id, promotor, convite_id into u from public.usuarios where id = auth.uid();
  if not found then raise exception 'usuario_invalido'; end if;
  if u.promotor then
    select codigo into cod from public.convites_promotor where id = u.convite_id;
    select vinculado_em into v from public.telegram_vinculos where convite_id = u.convite_id;
    return jsonb_build_object('tipo', 'promotor', 'codigo', cod, 'vinculado', v.vinculado_em is not null, 'vinculado_em', v.vinculado_em);
  end if;
  select vinculado_em into v from public.telegram_vinculos where usuario_id = u.id;
  return jsonb_build_object('tipo', 'funcionario', 'vinculado', v.vinculado_em is not null, 'vinculado_em', v.vinculado_em);
end $$;

-- Remover o vínculo: a própria pessoa; DEV/Diretor qualquer um; gerência da loja; encarregado do setor.
create or replace function public.remover_telegram(p_usuario uuid default null, p_convite uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_nivel int := public.nivel_do_usuario(); v record; ok boolean := false; alvo text;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  perform public.rl_checar('tg_remover', 20);
  if p_usuario is null and p_convite is null then p_usuario := auth.uid(); end if;
  select * into v from public.telegram_vinculos
    where (p_usuario is not null and usuario_id = p_usuario) or (p_convite is not null and convite_id = p_convite) limit 1;
  if not found then return; end if;
  if v.usuario_id = auth.uid() then ok := true;
  elsif v_nivel is not null and v_nivel <= 2 then ok := true;
  elsif v_nivel in (3, 4) and v.loja_id = public.loja_do_usuario() then ok := true;
  elsif v_nivel = 5 and v.tipo = 'funcionario' then
    ok := public.pode_gerir_setor((select setor from public.usuarios where id = v.usuario_id), v.loja_id);
  end if;
  if not ok then raise exception 'sem_permissao'; end if;
  delete from public.telegram_vinculos where id = v.id;
  delete from public.telegram_sessoes where chat_id = v.chat_id and estado in ('aguardando_info','aguardando_confirmacao','confirmado');
  insert into public.auditoria (usuario, acao, detalhe, loja_id)
    values ((select nome from public.usuarios where id = auth.uid()), 'removeu vínculo do Telegram', v.nome, v.loja_id);
end $$;

revoke all on function public.gerar_codigo_telegram(), public.telegram_status(), public.remover_telegram(uuid, uuid) from public, anon;
grant execute on function public.gerar_codigo_telegram(), public.telegram_status(), public.remover_telegram(uuid, uuid) to authenticated;

-- 4) Funções só do bot (service_role) -------------------------------------------
create or replace function public.telegram_vincular_funcionario(p_chat_id bigint, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; u record; v_id uuid;
begin
  select * into c from public.telegram_codigos where codigo = regexp_replace(coalesce(p_codigo,''), '\D', '', 'g') and expira_em > now();
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

create or replace function public.telegram_vincular_promotor(p_chat_id bigint, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.convites_promotor%rowtype;
begin
  select * into c from public.convites_promotor where upper(codigo) = upper(btrim(coalesce(p_codigo,'')));
  if not found then raise exception 'codigo_invalido'; end if;
  if c.revogado then raise exception 'convite_revogado'; end if;
  if c.pausado then raise exception 'convite_pausado'; end if;
  if c.expira_em <= now() then raise exception 'convite_expirado'; end if;
  if exists (select 1 from public.telegram_vinculos where chat_id = p_chat_id) then raise exception 'chat_ja_vinculado'; end if;
  if exists (select 1 from public.telegram_vinculos where convite_id = c.id) then raise exception 'codigo_ja_vinculado'; end if;
  insert into public.telegram_vinculos (chat_id, tipo, convite_id, loja_id, nome) values (p_chat_id, 'promotor', c.id, c.loja_id, c.nome || ' (' || c.marca || ')');
  insert into public.auditoria (usuario, acao, detalhe, loja_id) values (c.nome, 'vinculou Telegram (promotor)', c.marca, c.loja_id);
  return jsonb_build_object('nome', c.nome, 'marca', c.marca, 'tipo', 'promotor');
end $$;

-- Vínculo + checagem de que a pessoa/convite continua valendo (chamado a cada mensagem)
create or replace function public.telegram_contexto(p_chat_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record; u record; c record;
begin
  select * into v from public.telegram_vinculos where chat_id = p_chat_id;
  if not found then return null; end if;
  if v.tipo = 'funcionario' then
    select nome, ativo, loja_id, promotor into u from public.usuarios where id = v.usuario_id;
    if not found or not u.ativo or u.promotor or u.loja_id is distinct from v.loja_id then return jsonb_build_object('motivo', 'inativo'); end if;
    return jsonb_build_object('vinculo_id', v.id, 'tipo', 'funcionario', 'usuario_id', v.usuario_id, 'loja_id', v.loja_id, 'nome', u.nome);
  end if;
  select * into c from public.convites_promotor where id = v.convite_id;
  if not found or c.revogado or c.pausado or c.expira_em <= now() then return jsonb_build_object('motivo', 'convite'); end if;
  return jsonb_build_object('vinculo_id', v.id, 'tipo', 'promotor', 'convite_id', c.id, 'loja_id', c.loja_id, 'nome', c.nome, 'marca', c.marca);
end $$;

revoke all on function public.telegram_vincular_funcionario(bigint, text), public.telegram_vincular_promotor(bigint, text),
  public.telegram_contexto(bigint) from public, anon, authenticated;
grant execute on function public.telegram_vincular_funcionario(bigint, text), public.telegram_vincular_promotor(bigint, text),
  public.telegram_contexto(bigint) to service_role;

-- 5) Lançamento: mesma regra do app/WhatsApp, agora também 'telegram' e promotor -----
do $$ declare r record; begin
  for r in select conname from pg_constraint where conrelid = 'public.produtos'::regclass and contype = 'c'
           and pg_get_constraintdef(oid) like '%whatsapp%' loop
    execute format('alter table public.produtos drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.produtos add constraint produtos_origem_check check (origem in ('app','whatsapp','telegram'));

drop function if exists public.lancar_validade(bigint, uuid, text, date, numeric, text, text, text, integer, text, text, uuid, boolean);
create or replace function public.lancar_validade(
  p_loja bigint, p_usuario uuid, p_barcode text, p_validade date, p_quantidade numeric,
  p_origem text default 'whatsapp', p_foto text default null, p_obs text default null, p_dias_alerta integer default 15,
  p_tamanho text default null, p_unidade text default null, p_op uuid default null, p_confirmar_duplicado boolean default false,
  p_convite uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare c record; u record; cv record; v_id text; v_existente text; v_qtd numeric; v_nome text; v_por uuid;
begin
  if p_origem not in ('app','whatsapp','telegram') then raise exception 'origem_invalida'; end if;
  if p_convite is not null then
    -- promotor: vale só enquanto o convite estiver ativo e só para produtos da marca dele
    select * into cv from public.convites_promotor where id = p_convite;
    if not found or cv.revogado or cv.pausado or cv.expira_em <= now() or cv.loja_id is distinct from p_loja then raise exception 'usuario_fora_da_loja'; end if;
    v_nome := 'Promotor ' || cv.nome || ' (' || cv.marca || ')'; v_por := null;
  else
    select id, nome, loja_id, ativo into u from public.usuarios where id = p_usuario;
    if not found or not u.ativo or u.loja_id is distinct from p_loja then raise exception 'usuario_fora_da_loja'; end if;
    v_nome := u.nome; v_por := p_usuario;
  end if;
  if p_op is not null then
    select id into v_existente from public.produtos where whatsapp_op = p_op;
    if v_existente is not null then return v_existente; end if;
  end if;
  select * into c from public.catalogo where barcode = p_barcode and loja_id = p_loja;
  if not found then raise exception 'produto_nao_encontrado'; end if;
  if p_convite is not null then
    if strpos(upper(c.nome), upper(btrim(cv.marca))) = 0 then raise exception 'produto_fora_da_marca'; end if;
  end if;
  if p_validade is null then raise exception 'validade_obrigatoria'; end if;
  if p_validade < current_date then raise exception 'validade_vencida'; end if;
  if p_validade > current_date + interval '10 years' then raise exception 'validade_invalida'; end if;
  if coalesce(c.por_peso, false) then
    if p_quantidade is null or p_quantidade < 0.001 or p_quantidade > 9999 then raise exception 'quantidade_invalida'; end if;
  else
    if p_quantidade is null or p_quantidade < 1 or p_quantidade > 99999 or p_quantidade <> trunc(p_quantidade) then raise exception 'quantidade_invalida'; end if;
  end if;
  v_qtd := p_quantidade;
  if p_dias_alerta is null or p_dias_alerta < 1 or p_dias_alerta > 365 then raise exception 'dias_alerta_invalido'; end if;
  if not coalesce(c.por_peso, false) and not p_confirmar_duplicado
     and exists (select 1 from public.produtos where barcode = p_barcode and loja_id = p_loja and validade = p_validade) then
    raise exception 'duplicado';
  end if;
  v_id := p_barcode || '-' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  insert into public.produtos (id, barcode, nome, setor, subsetor, foto, quantidade, preco_unitario, por_peso, tamanho, unidade_medida,
      observacoes, validade, dias_alerta, criado_em, cadastrado_por, loja_id, familia, origem, lancado_por_id, whatsapp_op)
    values (v_id, c.barcode, c.nome, c.setor, c.subsetor, coalesce(p_foto, c.foto), v_qtd::int, coalesce(c.preco_unitario, 0), coalesce(c.por_peso, false),
      coalesce(nullif(trim(p_tamanho), ''), c.tamanho), coalesce(nullif(trim(p_unidade), ''), c.unidade_medida),
      left(coalesce(p_obs, ''), 300), p_validade, p_dias_alerta, now(), v_nome, p_loja, c.familia, p_origem, v_por, p_op);
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (v_nome, 'cadastrou produto', c.nome || case p_origem when 'whatsapp' then ' (via WhatsApp)' when 'telegram' then ' (via Telegram)' else '' end, c.barcode, p_loja);
  return v_id;
end $$;
revoke all on function public.lancar_validade(bigint, uuid, text, date, numeric, text, text, text, integer, text, text, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.lancar_validade(bigint, uuid, text, date, numeric, text, text, text, integer, text, text, uuid, boolean, uuid) to service_role;

-- 6) Exportar meus dados inclui o Telegram ---------------------------------------
create or replace function public._rl_exportar_meus_dados()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  select jsonb_build_object(
    'gerado_em', now(),
    'conta', (select to_jsonb(u) - 'last_device_token' from public.usuarios u where u.id = auth.uid()),
    'aceites', coalesce((select jsonb_agg(to_jsonb(c) order by c.aceito_em desc) from public.consentimentos c where c.usuario_id = auth.uid()), '[]'::jsonb),
    'logins', coalesce((select jsonb_agg(jsonb_build_object('quando', l.criado_em, 'ip', l.ip, 'dispositivo', l.dispositivo) order by l.criado_em desc) from (select * from public.login_auditoria where usuario_id = auth.uid() order by criado_em desc limit 200) l), '[]'::jsonb),
    'pedidos_lgpd', coalesce((select jsonb_agg(to_jsonb(s) order by s.criado_em desc) from public.solicitacoes_lgpd s where s.usuario_id = auth.uid()), '[]'::jsonb),
    'telegram', (select jsonb_build_object('tipo', v.tipo, 'vinculado_em', v.vinculado_em) from public.telegram_vinculos v
                 where v.usuario_id = auth.uid() or v.convite_id = (select convite_id from public.usuarios where id = auth.uid()) limit 1)
  ) into r;
  return r;
end $$;

-- 7) Limpeza (mensagens 30 dias, sessões 30 dias, códigos vencidos) a cada 5 min ---
create or replace function public.telegram_limpar()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.telegram_sessoes set estado = 'expirada', atualizado_em = now()
    where estado in ('aguardando_info','aguardando_confirmacao') and expira_em < now();
  delete from public.telegram_sessoes where estado in ('expirada','cancelado','registrado','erro') and atualizado_em < now() - interval '30 days';
  delete from public.telegram_mensagens where criado_em < now() - interval '30 days';
  delete from public.telegram_codigos where expira_em < now();
end $$;
revoke all on function public.telegram_limpar() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'telegram_limpar';
    perform cron.schedule('telegram_limpar', '*/5 * * * *', 'select public.telegram_limpar()');
  end if;
end $$;

-- 8) Auto-teste (desfaz tudo se falhar) --------------------------------------------
do $$ declare c1 text; c2 text;
begin
  c1 := public._gerar_codigo_promotor('Bauducco');
  c2 := public._gerar_codigo_promotor('Á');
  if c1 !~ '^BAU-[A-Z2-9]{5}$' then raise exception 'AUTO-TESTE: formato do código (%)', c1; end if;
  if c2 !~ '^AXX-[A-Z2-9]{5}$' then raise exception 'AUTO-TESTE: marca curta (%)', c2; end if;
  if exists (select 1 from public.convites_promotor where codigo is null) then raise exception 'AUTO-TESTE: convite sem código'; end if;
  if has_function_privilege('anon', 'public.telegram_contexto(bigint)', 'execute') then raise exception 'AUTO-TESTE: anon executa telegram_contexto'; end if;
  if has_table_privilege('authenticated', 'public.telegram_vinculos', 'insert') then raise exception 'AUTO-TESTE: escrita direta liberada'; end if;
end $$;

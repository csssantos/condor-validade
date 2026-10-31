-- Condor · Termos de Uso / Privacidade / LGPD
-- Rode uma vez no SQL Editor do Supabase.

-- 1) Registro de aceites (só inclui, nunca altera/apaga: serve de prova)
create table if not exists public.consentimentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  documento text not null default 'termos_privacidade',
  versao text not null,
  aceito_em timestamptz not null default now(),
  dispositivo text,
  ip text
);
create index if not exists consentimentos_usuario_idx on public.consentimentos(usuario_id, versao);
alter table public.consentimentos enable row level security;
drop policy if exists consentimentos_select_proprio on public.consentimentos;
create policy consentimentos_select_proprio on public.consentimentos for select to authenticated using (usuario_id = auth.uid());
-- sem policy de insert/update/delete: só a função abaixo grava

create or replace function public.registrar_aceite(p_versao text, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ip text;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for',''), ',', 1);
  exception when others then v_ip := null; end;
  if not exists (select 1 from public.consentimentos where usuario_id = auth.uid() and versao = p_versao) then
    insert into public.consentimentos(usuario_id, versao, dispositivo, ip)
    values (auth.uid(), left(p_versao, 40), left(p_dispositivo, 300), nullif(v_ip, ''));
  end if;
end $$;
revoke all on function public.registrar_aceite(text, text) from public, anon;
grant execute on function public.registrar_aceite(text, text) to authenticated;

-- 2) Pedidos de direitos do titular (LGPD art. 18)
create table if not exists public.solicitacoes_lgpd (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('acesso','correcao','exclusao','portabilidade','informacao','oposicao','revogacao','encarregado')),
  detalhe text not null check (char_length(detalhe) between 5 and 1000),
  status text not null default 'aberta' check (status in ('aberta','em_analise','respondida','negada')),
  resposta text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);
create index if not exists solicitacoes_lgpd_usuario_idx on public.solicitacoes_lgpd(usuario_id, criado_em desc);
alter table public.solicitacoes_lgpd enable row level security;
drop policy if exists solicitacoes_lgpd_select_proprio on public.solicitacoes_lgpd;
create policy solicitacoes_lgpd_select_proprio on public.solicitacoes_lgpd for select to authenticated using (usuario_id = auth.uid());

create or replace function public.criar_solicitacao_lgpd(p_tipo text, p_detalhe text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  insert into public.solicitacoes_lgpd(usuario_id, tipo, detalhe) values (auth.uid(), p_tipo, p_detalhe) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.criar_solicitacao_lgpd(text, text) from public, anon;
grant execute on function public.criar_solicitacao_lgpd(text, text) to authenticated;

-- 3) Exportar os dados da própria pessoa (portabilidade/acesso)
create or replace function public.exportar_meus_dados()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  select jsonb_build_object(
    'gerado_em', now(),
    'conta', (select to_jsonb(u) - 'last_device_token' from public.usuarios u where u.id = auth.uid()),
    'aceites', coalesce((select jsonb_agg(to_jsonb(c) order by c.aceito_em desc) from public.consentimentos c where c.usuario_id = auth.uid()), '[]'::jsonb),
    'logins', coalesce((select jsonb_agg(jsonb_build_object('quando', l.criado_em, 'ip', l.ip, 'dispositivo', l.dispositivo) order by l.criado_em desc) from (select * from public.login_auditoria where usuario_id = auth.uid() order by criado_em desc limit 200) l), '[]'::jsonb),
    'pedidos_lgpd', coalesce((select jsonb_agg(to_jsonb(s) order by s.criado_em desc) from public.solicitacoes_lgpd s where s.usuario_id = auth.uid()), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.exportar_meus_dados() from public, anon;
grant execute on function public.exportar_meus_dados() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- LGPD: tela do responsável (responder pedidos) + login registrado pelo SERVIDOR
-- 2026-11-05 · rodar no SQL Editor do Supabase (tudo numa transação, com auto-teste)
-- Ordem: depois de supabase-legal-lgpd.sql e supabase-seguranca.sql (já aplicados)
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- 1) Pedidos LGPD: quem respondeu e quando mudou ----------------------------------------
alter table public.solicitacoes_lgpd add column if not exists respondido_por uuid references auth.users(id) on delete set null;
alter table public.solicitacoes_lgpd add column if not exists atualizado_em timestamptz;

-- o responsável (DEV/diretoria, nível <= 2) enxerga todos os pedidos; o titular continua vendo só os dele
drop policy if exists solicitacoes_lgpd_select_resp on public.solicitacoes_lgpd;
create policy solicitacoes_lgpd_select_resp on public.solicitacoes_lgpd for select to authenticated
  using (coalesce(public.nivel_do_usuario(), 99) <= 2);
-- ninguém escreve direto na tabela (só pelas funções)
revoke insert, update, delete on public.solicitacoes_lgpd from authenticated, anon;

-- lista para o responsável, com nome/matrícula/loja de quem pediu e prazo legal (15 dias)
create or replace function public.listar_solicitacoes_lgpd()
returns table (id uuid, tipo text, detalhe text, status text, resposta text, criado_em timestamptz, respondido_em timestamptz,
               prazo date, nome text, matricula text, loja text, email text, respondido_por_nome text)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.nivel_do_usuario(), 99) > 2 then raise exception 'sem_permissao' using errcode = '42501'; end if;
  return query
    select s.id, s.tipo, s.detalhe, s.status, s.resposta, s.criado_em, s.respondido_em,
           (s.criado_em at time zone 'America/Sao_Paulo')::date + 15,
           u.nome, u.matricula, coalesce(l.numero_loja::text, ''), u.email, r.nome
    from public.solicitacoes_lgpd s
    left join public.usuarios u on u.id = s.usuario_id
    left join public.lojas l on l.id = u.loja_id
    left join public.usuarios r on r.id = s.respondido_por
    order by (s.status in ('aberta','em_analise')) desc, s.criado_em asc
    limit 500;
end $$;
revoke all on function public.listar_solicitacoes_lgpd() from public, anon;
grant execute on function public.listar_solicitacoes_lgpd() to authenticated;

-- responder: em análise (resposta opcional) ou resposta final (respondida/negada, texto obrigatório)
create or replace function public.responder_solicitacao_lgpd(p_id uuid, p_status text, p_resposta text)
returns void language plpgsql security definer set search_path = public as $$
declare v_atual text; v_resp text := nullif(btrim(coalesce(p_resposta, '')), '');
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if coalesce(public.nivel_do_usuario(), 99) > 2 then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if p_status not in ('em_analise', 'respondida', 'negada') then raise exception 'status_invalido'; end if;
  if v_resp is not null and char_length(v_resp) > 2000 then raise exception 'resposta_longa'; end if;
  if p_status in ('respondida', 'negada') and (v_resp is null or char_length(v_resp) < 10) then raise exception 'resposta_obrigatoria'; end if;
  select status into v_atual from public.solicitacoes_lgpd where id = p_id for update;
  if v_atual is null then raise exception 'pedido_nao_encontrado'; end if;
  if v_atual in ('respondida', 'negada') then raise exception 'pedido_ja_respondido'; end if;
  update public.solicitacoes_lgpd
     set status = p_status,
         resposta = coalesce(v_resp, resposta),
         respondido_em = case when p_status in ('respondida', 'negada') then now() else respondido_em end,
         respondido_por = auth.uid(),
         atualizado_em = now()
   where id = p_id;
end $$;
revoke all on function public.responder_solicitacao_lgpd(uuid, text, text) from public, anon;
grant execute on function public.responder_solicitacao_lgpd(uuid, text, text) to authenticated;

-- tempo real: o titular vê a resposta na hora; o responsável vê pedido novo na hora
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solicitacoes_lgpd') then
    alter publication supabase_realtime add table public.solicitacoes_lgpd;
  end if;
end $$;

-- 2) Login registrado pelo servidor (o app não informa mais nome, loja nem IP) -------------
create or replace function public.registrar_login(p_dispositivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); h text; v_ip text; xff text; partes text[]; v_disp text;
        v_nome text; v_mat text; v_loja bigint;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  select nome, matricula, loja_id into v_nome, v_mat, v_loja from public.usuarios where id = v_uid;
  if v_nome is null then return; end if; -- conta sem perfil: nada a registrar
  v_disp := left(regexp_replace(coalesce(p_dispositivo, ''), '[[:cntrl:]]', '', 'g'), 300);
  -- abrir o app de novo no mesmo aparelho em menos de 10 min não vira outro registro
  if exists (select 1 from public.login_auditoria where usuario_id = v_uid and coalesce(dispositivo, '') = v_disp and criado_em > now() - interval '10 minutes') then return; end if;
  h := nullif(current_setting('request.headers', true), '');
  if h is not null then
    v_ip := nullif(btrim(coalesce((h::json)->>'cf-connecting-ip', '')), '');
    if v_ip is null then
      xff := coalesce((h::json)->>'x-forwarded-for', '');
      partes := string_to_array(xff, ',');
      if partes is not null and array_length(partes, 1) > 0 then v_ip := nullif(btrim(partes[array_length(partes, 1)]), ''); end if; -- o último é o que o proxy viu (o primeiro pode ser inventado)
    end if;
  end if;
  insert into public.login_auditoria(usuario_id, nome, matricula, loja_id, ip, dispositivo)
  values (v_uid, v_nome, v_mat, v_loja, left(v_ip, 64), nullif(v_disp, ''));
end $$;
revoke all on function public.registrar_login(text) from public, anon;
grant execute on function public.registrar_login(text) to authenticated;

-- o app não grava mais direto na tabela (antes dava para informar qualquer nome/IP)
drop policy if exists login_aud_ins on public.login_auditoria;
revoke insert, update, delete on public.login_auditoria from authenticated, anon;

-- 3) Auto-teste ------------------------------------------------------------------------------
do $$
declare n int;
begin
  if to_regprocedure('public.registrar_login(text)') is null then raise exception 'AUTO-TESTE: registrar_login faltando'; end if;
  if to_regprocedure('public.responder_solicitacao_lgpd(uuid,text,text)') is null then raise exception 'AUTO-TESTE: responder_solicitacao_lgpd faltando'; end if;
  if to_regprocedure('public.listar_solicitacoes_lgpd()') is null then raise exception 'AUTO-TESTE: listar_solicitacoes_lgpd faltando'; end if;
  select count(*) into n from pg_policies where tablename = 'login_auditoria' and cmd = 'INSERT';
  if n > 0 then raise exception 'AUTO-TESTE: ainda existe policy de INSERT em login_auditoria'; end if;
  if has_table_privilege('authenticated', 'public.login_auditoria', 'INSERT') then raise exception 'AUTO-TESTE: authenticated ainda insere em login_auditoria'; end if;
  if has_table_privilege('authenticated', 'public.solicitacoes_lgpd', 'UPDATE') then raise exception 'AUTO-TESTE: authenticated ainda altera solicitacoes_lgpd'; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'solicitacoes_lgpd') then raise exception 'AUTO-TESTE: solicitacoes_lgpd fora do tempo real'; end if;
  if has_function_privilege('anon', 'public.registrar_login(text)', 'EXECUTE') then raise exception 'AUTO-TESTE: anon executa registrar_login'; end if;
  raise notice 'AUTO-TESTE OK';
end $$;

commit;

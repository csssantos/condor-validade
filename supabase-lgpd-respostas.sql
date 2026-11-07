-- ═══════════════════════════════════════════════════════════════════════════
-- LGPD: tela do responsável (responder pedidos) + login registrado pelo SERVIDOR
-- 2026-11-05 · rodar no SQL Editor do Supabase ANTES de publicar o app (tudo numa transação, com auto-teste)
-- Ordem: depois de supabase-legal-lgpd.sql e supabase-seguranca.sql (já aplicados)
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- 1) Pedidos LGPD ------------------------------------------------------------------------------
alter table public.solicitacoes_lgpd add column if not exists respondido_por uuid references auth.users(id) on delete set null;
alter table public.solicitacoes_lgpd add column if not exists atualizado_em timestamptz;
alter table public.solicitacoes_lgpd enable row level security;

-- trilha só-inserção de cada passo do pedido (quem criou, quem marcou em análise, quem respondeu/negou).
-- Fica FORA da auditoria da loja de propósito: a gerência não pode ficar sabendo quem fez pedido LGPD.
create table if not exists public.lgpd_eventos (
  id bigint generated always as identity primary key,
  solicitacao_id uuid not null references public.solicitacoes_lgpd(id) on delete cascade,
  acao text not null check (acao in ('criou', 'marcou_em_analise', 'respondeu', 'negou')),
  por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists lgpd_eventos_sol_idx on public.lgpd_eventos(solicitacao_id, criado_em);
alter table public.lgpd_eventos enable row level security;
drop policy if exists lgpd_eventos_sel on public.lgpd_eventos;
create policy lgpd_eventos_sel on public.lgpd_eventos for select to authenticated using (coalesce(public.nivel_do_usuario(), 99) <= 2);
revoke insert, update, delete on public.lgpd_eventos from authenticated, anon;

-- o responsável (DEV/diretoria, nível <= 2) enxerga todos os pedidos; o titular continua vendo só os dele
drop policy if exists solicitacoes_lgpd_select_resp on public.solicitacoes_lgpd;
create policy solicitacoes_lgpd_select_resp on public.solicitacoes_lgpd for select to authenticated
  using (coalesce(public.nivel_do_usuario(), 99) <= 2);
revoke insert, update, delete on public.solicitacoes_lgpd from authenticated, anon;

-- criar pedido: além do limite por minuto (embrulho), no máximo 3 em aberto e 10 por dia por pessoa
create or replace function public._rl_criar_solicitacao_lgpd(p_tipo text, p_detalhe text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if (select count(*) from public.solicitacoes_lgpd where usuario_id = auth.uid() and status in ('aberta', 'em_analise')) >= 3 then
    raise exception 'pedidos_em_aberto' using hint = 'Você já tem 3 pedidos em aberto. Aguarde a resposta.'; end if;
  if (select count(*) from public.solicitacoes_lgpd where usuario_id = auth.uid() and criado_em > now() - interval '1 day') >= 10 then
    raise exception 'limite_excedido' using errcode = 'P0001'; end if;
  insert into public.solicitacoes_lgpd(usuario_id, tipo, detalhe) values (auth.uid(), p_tipo, p_detalhe) returning id into v_id;
  insert into public.lgpd_eventos(solicitacao_id, acao, por) values (v_id, 'criou', auth.uid());
  return v_id;
end $$;
revoke all on function public._rl_criar_solicitacao_lgpd(text, text) from public, anon, authenticated;

-- lista para o responsável, com nome/matrícula/loja de quem pediu e prazo legal (15 dias); abertos primeiro, prazo mais curto primeiro
create or replace function public.listar_solicitacoes_lgpd()
returns table (id uuid, tipo text, detalhe text, status text, resposta text, criado_em timestamptz, respondido_em timestamptz,
               prazo date, nome text, matricula text, loja text, email text, respondido_por_nome text, eh_meu boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if coalesce(public.nivel_do_usuario(), 99) > 2 then raise exception 'sem_permissao' using errcode = '42501'; end if;
  return query
    select s.id, s.tipo::text, s.detalhe::text, s.status::text, s.resposta::text, s.criado_em, s.respondido_em,
           (s.criado_em at time zone 'America/Sao_Paulo')::date + 15,
           u.nome::text, u.matricula::text, coalesce(l.numero_loja::text, ''), u.email::text, r.nome::text, coalesce(s.usuario_id = auth.uid(), false)
    from public.solicitacoes_lgpd s
    left join public.usuarios u on u.id = s.usuario_id
    left join public.lojas l on l.id = u.loja_id
    left join public.usuarios r on r.id = s.respondido_por
    order by (s.status in ('aberta', 'em_analise')) desc,
             case when s.status in ('aberta', 'em_analise') then s.criado_em end asc,
             s.criado_em desc
    limit 500;
end $$;
revoke all on function public.listar_solicitacoes_lgpd() from public, anon;
grant execute on function public.listar_solicitacoes_lgpd() to authenticated;

-- responder: "em análise" NÃO grava texto (rascunho não chega a quem pediu); resposta final (respondida/negada) com texto obrigatório
create or replace function public.responder_solicitacao_lgpd(p_id uuid, p_status text, p_resposta text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_atual text; v_dono uuid; v_resp text := nullif(btrim(coalesce(p_resposta, '')), '');
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if coalesce(public.nivel_do_usuario(), 99) > 2 then raise exception 'sem_permissao' using errcode = '42501'; end if;
  perform public.rl_checar('lgpd_resp', 30);
  if p_status is null or p_status not in ('em_analise', 'respondida', 'negada') then raise exception 'status_invalido'; end if;
  if p_status in ('respondida', 'negada') then
    if v_resp is null or char_length(v_resp) < 10 then raise exception 'resposta_obrigatoria'; end if;
    if char_length(v_resp) > 2000 then raise exception 'resposta_longa'; end if;
  end if;
  select status, usuario_id into v_atual, v_dono from public.solicitacoes_lgpd where id = p_id for update;
  if v_atual is null then raise exception 'pedido_nao_encontrado'; end if;
  if v_dono = auth.uid() then raise exception 'nao_responde_o_proprio'; end if;
  if v_atual in ('respondida', 'negada') then raise exception 'pedido_ja_respondido'; end if;
  if p_status = 'em_analise' then
    if v_atual = 'em_analise' then return; end if;
    update public.solicitacoes_lgpd set status = 'em_analise', atualizado_em = now() where id = p_id;
    insert into public.lgpd_eventos(solicitacao_id, acao, por) values (p_id, 'marcou_em_analise', auth.uid());
  else
    update public.solicitacoes_lgpd
       set status = p_status, resposta = v_resp, respondido_em = now(), respondido_por = auth.uid(), atualizado_em = now()
     where id = p_id;
    insert into public.lgpd_eventos(solicitacao_id, acao, por) values (p_id, case when p_status = 'respondida' then 'respondeu' else 'negou' end, auth.uid());
  end if;
end $$;
revoke all on function public.responder_solicitacao_lgpd(uuid, text, text) from public, anon;
grant execute on function public.responder_solicitacao_lgpd(uuid, text, text) to authenticated;

-- tempo real: o titular vê a resposta na hora; o responsável vê pedido novo na hora
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solicitacoes_lgpd') then
    alter publication supabase_realtime add table public.solicitacoes_lgpd;
  end if;
end $$;

-- 2) Login: quem grava nome, matrícula, loja e IP é o SERVIDOR --------------------------------
-- Gatilho em toda inserção: mesmo o app antigo (que ainda insere direto) não consegue mais informar outro nome/loja/IP.
create or replace function public._login_aud_servidor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare h text; xff text; partes text[]; v_ip text;
begin
  if auth.uid() is null then return new; end if; -- serviço interno
  new.usuario_id := auth.uid();
  select u.nome, u.matricula, u.loja_id into new.nome, new.matricula, new.loja_id from public.usuarios u where u.id = auth.uid();
  if new.nome is null then return null; end if; -- conta sem perfil: não registra
  h := nullif(current_setting('request.headers', true), '');
  if h is not null then
    v_ip := nullif(btrim(coalesce((h::json)->>'cf-connecting-ip', '')), '');
    if v_ip is null then
      xff := coalesce((h::json)->>'x-forwarded-for', '');
      partes := string_to_array(xff, ',');
      if partes is not null and array_length(partes, 1) > 0 then v_ip := nullif(btrim(partes[array_length(partes, 1)]), ''); end if; -- o último é o que o proxy viu
    end if;
  end if;
  new.ip := left(v_ip, 64);
  new.dispositivo := nullif(left(regexp_replace(coalesce(new.dispositivo, ''), '[[:cntrl:]]', '', 'g'), 300), '');
  new.criado_em := now();
  -- o mesmo usuário em menos de 10 minutos (qualquer aparelho) não vira outro registro
  if exists (select 1 from public.login_auditoria where usuario_id = new.usuario_id and criado_em > now() - interval '10 minutes') then return null; end if;
  return new;
end $$;
revoke all on function public._login_aud_servidor() from public, anon, authenticated;
drop trigger if exists trg_login_aud_servidor on public.login_auditoria;
create trigger trg_login_aud_servidor before insert on public.login_auditoria for each row execute function public._login_aud_servidor();
-- ninguém altera nem apaga registro de login
revoke update, delete on public.login_auditoria from authenticated, anon;

-- o app novo chama esta função (o gatilho acima preenche tudo)
create or replace function public.registrar_login(p_dispositivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  insert into public.login_auditoria(usuario_id, dispositivo) values (auth.uid(), left(coalesce(p_dispositivo, ''), 300));
end $$;
revoke all on function public.registrar_login(text) from public, anon;
grant execute on function public.registrar_login(text) to authenticated;

-- 3) Auto-teste ---------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.registrar_login(text)', 'public.responder_solicitacao_lgpd(uuid,text,text)', 'public.listar_solicitacoes_lgpd()', 'public._rl_criar_solicitacao_lgpd(text,text)', 'public._login_aud_servidor()'] loop
    if to_regprocedure(f) is null then raise exception 'AUTO-TESTE: % faltando', f; end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure(f) and prosecdef and array_to_string(proconfig, ',') like '%search_path=public, pg_temp%') then
      raise exception 'AUTO-TESTE: % sem security definer/search_path', f; end if;
  end loop;
  if has_function_privilege('anon', 'public.registrar_login(text)', 'EXECUTE') then raise exception 'AUTO-TESTE: anon executa registrar_login'; end if;
  if has_function_privilege('authenticated', 'public._rl_criar_solicitacao_lgpd(text,text)', 'EXECUTE') then raise exception 'AUTO-TESTE: _rl_criar_solicitacao_lgpd exposta'; end if;
  if has_function_privilege('authenticated', 'public._login_aud_servidor()', 'EXECUTE') then raise exception 'AUTO-TESTE: _login_aud_servidor exposta'; end if;
  if has_table_privilege('authenticated', 'public.solicitacoes_lgpd', 'UPDATE') or has_table_privilege('authenticated', 'public.solicitacoes_lgpd', 'INSERT') then raise exception 'AUTO-TESTE: authenticated escreve em solicitacoes_lgpd'; end if;
  if has_table_privilege('authenticated', 'public.lgpd_eventos', 'INSERT') then raise exception 'AUTO-TESTE: authenticated escreve em lgpd_eventos'; end if;
  if has_table_privilege('authenticated', 'public.login_auditoria', 'UPDATE') or has_table_privilege('authenticated', 'public.login_auditoria', 'DELETE') then raise exception 'AUTO-TESTE: login_auditoria editável'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.solicitacoes_lgpd'::regclass) then raise exception 'AUTO-TESTE: RLS desligada em solicitacoes_lgpd'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.lgpd_eventos'::regclass) then raise exception 'AUTO-TESTE: RLS desligada em lgpd_eventos'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.login_auditoria'::regclass and tgname = 'trg_limite') then raise exception 'AUTO-TESTE: trg_limite sumiu de login_auditoria'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.login_auditoria'::regclass and tgname = 'trg_login_aud_servidor') then raise exception 'AUTO-TESTE: gatilho do login faltando'; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'solicitacoes_lgpd') then raise exception 'AUTO-TESTE: solicitacoes_lgpd fora do tempo real'; end if;
  -- comportamento: sem login (papel do SQL Editor) as funções de responsável recusam
  begin perform public.responder_solicitacao_lgpd(gen_random_uuid(), 'respondida', 'resposta de teste'); raise exception 'AUTO-TESTE: responder aceitou sem login';
  exception when others then if sqlerrm like 'AUTO-TESTE%' then raise; end if; end;
  begin perform public.listar_solicitacoes_lgpd(); raise exception 'AUTO-TESTE: listar aceitou sem login';
  exception when others then if sqlerrm like 'AUTO-TESTE%' then raise; end if; end;
  raise notice 'AUTO-TESTE OK';
end $$;

commit;

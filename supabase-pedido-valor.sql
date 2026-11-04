-- Pedido de promoção/preço direto com VALOR PEDIDO + aviso no Telegram de quem lançou o produto pelo Telegram.
-- Rodar DEPOIS de supabase-pedido-trava.sql e ANTES de publicar o app. Tem auto-teste (se falhar, nada é aplicado).
begin;

-- pré-requisito: supabase-pedido-trava.sql já aplicado
do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname = 'trg_b_pedido_del') or not exists (select 1 from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname = 'trg_b_pedido_ck') then
    raise exception 'pedido-valor: rode supabase-pedido-promocao.sql e supabase-pedido-trava.sql antes';
  end if;
end $$;

alter table public.produtos add column if not exists pedido_valor numeric(10,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_pedido_valor_ck') then
    alter table public.produtos add constraint produtos_pedido_valor_ck check (pedido_valor is null or (pedido_valor > 0 and pedido_valor <= 5000));
  end if;
end $$;

-- o valor é campo do pedido: segue a mesma trava (só pela função; lote travado deixa mudar só pedido_*)
create or replace function public._produtos_pedido_ck()
returns trigger language plpgsql security definer set search_path = public as $f$
declare livres text[] := array['pedido_tipo','pedido_campanha','pedido_valor','pedido_em','pedido_por','notificado_10d','notificado_alerta','notificado_vencido','alertas_extras_notificados','atualizado_por'];
begin
  if tg_op = 'UPDATE' and old.pedido_tipo is not null then
    if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then raise exception 'produto_travado_pedido'; end if;
  end if;
  if auth.uid() is null or coalesce(current_setting('app.via_rpc', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if new.pedido_tipo is not null or new.pedido_campanha is not null or new.pedido_valor is not null or new.pedido_em is not null or new.pedido_por is not null then
      raise exception 'pedido_so_pela_funcao';
    end if;
  elsif new.pedido_tipo is distinct from old.pedido_tipo or new.pedido_campanha is distinct from old.pedido_campanha
     or new.pedido_valor is distinct from old.pedido_valor
     or new.pedido_em is distinct from old.pedido_em or new.pedido_por is distinct from old.pedido_por then
    raise exception 'pedido_so_pela_funcao';
  end if;
  return new;
end $f$;
revoke all on function public._produtos_pedido_ck() from public, anon, authenticated;

drop function if exists public.registrar_pedido_promocao(text, text, text);
create or replace function public.registrar_pedido_promocao(p_id text, p_tipo text, p_campanha text default null, p_valor numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare x record; camp text; quem text; nivel int; rotulo text; v numeric(10,2);
begin
  if auth.uid() is null then raise exception 'sem_permissao'; end if;
  nivel := public.nivel_do_usuario();
  if nivel is null or nivel > 6 then raise exception 'sem_permissao'; end if; -- promotor (7) não pede promoção
  perform public.rl_checar('pedido_promocao', 60);
  if p_tipo is not null and p_tipo not in ('promocao', 'preco_direto') then raise exception 'pedido_promocao_invalido'; end if;
  camp := nullif(upper(btrim(coalesce(p_campanha, ''))), '');
  if p_tipo is null then camp := null; end if;
  if camp is not null and camp !~ '^[A-Z0-9./ -]{1,20}$' then raise exception 'campanha_invalida'; end if;
  -- valor pedido: obrigatório ao registrar/alterar; é só uma sugestão (a central é quem libera)
  if p_tipo is null then v := null;
  else
    if p_valor is null then raise exception 'valor_pedido_obrigatorio'; end if;
    if p_valor > 5000 or round(p_valor, 2) <= 0 then raise exception 'valor_pedido_invalido'; end if;
    v := round(p_valor, 2);
  end if;
  select id, nome, barcode, lote, validade, loja_id, setor, lancado_por_id, cadastrado_por, pedido_tipo, pedido_campanha, pedido_valor
    into x from public.produtos where id = p_id for update;
  if not found or not public.loja_ok(x.loja_id) then raise exception 'produto_nao_encontrado'; end if;
  if not (public._setor_ok(x.setor) or public._eh_autor(x.lancado_por_id, x.cadastrado_por)) then raise exception 'editar_exige_autor'; end if;
  if p_tipo is not distinct from x.pedido_tipo and camp is not distinct from x.pedido_campanha and v is not distinct from x.pedido_valor then return; end if;
  if x.pedido_tipo is not null and not public._setor_ok(x.setor) then raise exception 'editar_exige_encarregado'; end if;
  quem := coalesce(public.nome_do_usuario(), 'Usuário');
  perform set_config('app.via_rpc', '1', true);
  update public.produtos
     set pedido_tipo = p_tipo, pedido_campanha = camp, pedido_valor = v,
         pedido_em = case when p_tipo is null then null else now() end,
         pedido_por = case when p_tipo is null then null else quem end
   where id = p_id;
  perform set_config('app.via_rpc', '', true);
  if p_tipo is null then delete from public.pedido_avisos where produto_id = p_id; end if;
  rotulo := case coalesce(p_tipo, x.pedido_tipo) when 'preco_direto' then 'preço direto' else 'promoção' end;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (quem,
            case when p_tipo is null then 'removeu pedido de ' || rotulo
                 when x.pedido_tipo is null then 'registrou pedido de ' || rotulo
                 else 'alterou pedido de ' || rotulo end,
            coalesce(x.nome, '') || ' · validade ' || coalesce(to_char(x.validade, 'DD/MM/YYYY'), '?') || coalesce(' · lote ' || x.lote, '')
              || coalesce(' · campanha ' || coalesce(camp, x.pedido_campanha), '')
              || coalesce(' · valor pedido R$ ' || replace(to_char(coalesce(v, x.pedido_valor), 'FM9990.00'), '.', ','), '')
              || case when x.pedido_tipo is not null and p_tipo is not null then ' (antes: ' || x.pedido_tipo || coalesce(' ' || x.pedido_campanha, '') || coalesce(' R$ ' || replace(to_char(x.pedido_valor, 'FM9990.00'), '.', ','), '') || ')' else '' end,
            x.barcode, x.loja_id);
end $$;
revoke all on function public.registrar_pedido_promocao(text, text, text, numeric) from public, anon;
grant execute on function public.registrar_pedido_promocao(text, text, text, numeric) to authenticated;

-- controle de aviso (um aviso por pedido; só o servidor mexe)
create table if not exists public.pedido_avisos (
  produto_id text primary key references public.produtos(id) on delete cascade,
  pedido_em timestamptz not null,
  avisado_em timestamptz not null default now()
);
alter table public.pedido_avisos enable row level security;
revoke all on public.pedido_avisos from public, anon, authenticated;

-- Função do servidor (só service_role): diz se/para qual chat avisar e "pega" o aviso de forma atômica.
-- Só avisa: produto lançado pelo Telegram, pedido feito há <10 min, por outra pessoa que não quem lançou.
create or replace function public.telegram_pedido_aviso(p_id text, p_quem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x record; chat bigint; m text[]; chats bigint[]; n int; antes boolean;
begin
  select id, nome, lote, sem_lote, validade, origem, lancado_por_id, cadastrado_por, loja_id,
         pedido_tipo, pedido_campanha, pedido_valor, pedido_em, pedido_por
    into x from public.produtos where id = p_id;
  if not found or x.pedido_tipo is null or x.pedido_em is null or x.pedido_em < now() - interval '10 minutes' then return jsonb_build_object('enviar', false); end if;
  if x.origem is distinct from 'telegram' then return jsonb_build_object('enviar', false); end if;
  if x.lancado_por_id is not null then
    if x.lancado_por_id = p_quem then return jsonb_build_object('enviar', false); end if; -- quem lançou já sabe: foi ele que pediu
    -- mesma conferência do telegram_contexto: pessoa ativa, não promotor, da mesma loja do lote e do vínculo
    select v.chat_id into chat
      from public.telegram_vinculos v join public.usuarios u on u.id = v.usuario_id
     where v.usuario_id = x.lancado_por_id and v.convite_id is null
       and u.ativo and not coalesce(u.promotor, false) and u.loja_id is not distinct from x.loja_id and v.loja_id is not distinct from x.loja_id
     limit 1;
  else
    m := regexp_match(coalesce(x.cadastrado_por, ''), '^Promotor (.*) \(([^()]*)\)$');
    if m is null then return jsonb_build_object('enviar', false); end if;
    select array_agg(v.chat_id) into chats
      from public.convites_promotor c join public.telegram_vinculos v on v.convite_id = c.id
     where c.loja_id = x.loja_id and v.loja_id is not distinct from x.loja_id and not coalesce(c.revogado, false) and not coalesce(c.pausado, false) and (c.expira_em is null or c.expira_em > now())
       and lower(c.nome) = lower(m[1])
       and (c.acesso_total or lower(coalesce(c.marca, '')) = lower(m[2]) or exists (select 1 from unnest(coalesce(c.marcas, '{}'::text[])) mm where lower(mm) = lower(m[2])));
    n := coalesce(cardinality(chats), 0);
    if n <> 1 then return jsonb_build_object('enviar', false); end if; -- ambíguo ou sem vínculo: não arrisca avisar a pessoa errada
    chat := chats[1];
  end if;
  if chat is null then return jsonb_build_object('enviar', false); end if;
  select exists (select 1 from public.pedido_avisos where produto_id = x.id) into antes;
  insert into public.pedido_avisos (produto_id, pedido_em) values (x.id, x.pedido_em)
    on conflict (produto_id) do update set pedido_em = excluded.pedido_em, avisado_em = now() where public.pedido_avisos.pedido_em < excluded.pedido_em and public.pedido_avisos.avisado_em < now() - interval '30 seconds'; -- no máx. 1 aviso por lote a cada 30 s
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('enviar', false); end if;
  return jsonb_build_object('enviar', true, 'chat_id', chat, 'nome', x.nome, 'lote', case when x.sem_lote then null else x.lote end, 'validade', x.validade,
    'tipo', x.pedido_tipo, 'campanha', x.pedido_campanha, 'valor', x.pedido_valor, 'por', x.pedido_por, 'atualizado', antes);
end $$;
revoke all on function public.telegram_pedido_aviso(text, uuid) from public, anon, authenticated;
grant execute on function public.telegram_pedido_aviso(text, uuid) to service_role;

-- AUTO-TESTE
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'pedido_valor') then raise exception 'pedido-valor: coluna ausente'; end if;
  if position('pedido_valor' in pg_get_functiondef('public._produtos_pedido_ck()'::regprocedure)) = 0
     or position('produto_travado_pedido' in pg_get_functiondef('public._produtos_pedido_ck()'::regprocedure)) = 0 then raise exception 'pedido-valor: trigger sem o valor/trava'; end if;
  if to_regprocedure('public.registrar_pedido_promocao(text,text,text)') is not null then raise exception 'pedido-valor: assinatura antiga ainda existe'; end if;
  if has_function_privilege('anon', 'public.registrar_pedido_promocao(text,text,text,numeric)', 'execute')
     or not has_function_privilege('authenticated', 'public.registrar_pedido_promocao(text,text,text,numeric)', 'execute') then raise exception 'pedido-valor: permissao da funcao'; end if;
  if has_function_privilege('authenticated', 'public.telegram_pedido_aviso(text,uuid)', 'execute') or has_function_privilege('anon', 'public.telegram_pedido_aviso(text,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.telegram_pedido_aviso(text,uuid)', 'execute') then raise exception 'pedido-valor: permissao do aviso'; end if;
  if has_table_privilege('authenticated', 'public.pedido_avisos', 'select') or has_table_privilege('anon', 'public.pedido_avisos', 'select') then raise exception 'pedido-valor: tabela de avisos aberta'; end if;
end $$;
notify pgrst, 'reload schema';
commit;

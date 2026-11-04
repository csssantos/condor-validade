-- TRAVA DO LOTE COM PEDIDO (2026-11-04, pedido do dono): lote com pedido de promoção/preço direto registrado
-- NÃO pode mais ser alterado (validade, quantidade, preço, setor, promoção, soma de lote etc.) nem excluído.
-- Continua possível: dar baixa (RPC dar_baixa) e o encarregado do setor (ou superior) REMOVER o pedido, o que destrava o lote.
-- Rodar DEPOIS de supabase-pedido-promocao.sql. Tem auto-teste no final.

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'pedido_tipo') then raise exception 'trava: rode supabase-pedido-promocao.sql antes'; end if;
end $$;

create or replace function public._produtos_pedido_ck() returns trigger language plpgsql security definer set search_path = public as $f$
declare livres text[] := array['pedido_tipo','pedido_campanha','pedido_em','pedido_por','notificado_10d','notificado_alerta','notificado_vencido','alertas_extras_notificados','atualizado_por'];
begin
  -- lote com pedido: só mudam os campos do próprio pedido e os de controle de notificação (vale para TODOS, inclusive Telegram/serviço)
  if tg_op = 'UPDATE' and old.pedido_tipo is not null then
    if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then raise exception 'produto_travado_pedido'; end if;
  end if;
  if auth.uid() is null or coalesce(current_setting('app.via_rpc', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if new.pedido_tipo is not null or new.pedido_campanha is not null or new.pedido_em is not null or new.pedido_por is not null then
      raise exception 'pedido_so_pela_funcao';
    end if;
  elsif new.pedido_tipo is distinct from old.pedido_tipo or new.pedido_campanha is distinct from old.pedido_campanha
     or new.pedido_em is distinct from old.pedido_em or new.pedido_por is distinct from old.pedido_por then
    raise exception 'pedido_so_pela_funcao';
  end if;
  return new;
end $f$;
revoke all on function public._produtos_pedido_ck() from public, anon, authenticated;

create or replace function public._produtos_pedido_del() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is not null and old.pedido_tipo is not null and coalesce(current_setting('app.via_baixa', true), '') <> '1' then
    raise exception 'produto_travado_pedido';
  end if;
  return old;
end $f$;
revoke all on function public._produtos_pedido_del() from public, anon, authenticated;
drop trigger if exists trg_b_pedido_del on public.produtos;
create trigger trg_b_pedido_del before delete on public.produtos
  for each row execute function public._produtos_pedido_del();

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'pedido_tipo') then raise exception 'trava: rode supabase-pedido-promocao.sql antes'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname = 'trg_b_pedido_ck' and tgfoid = 'public._produtos_pedido_ck()'::regprocedure) then raise exception 'trava: trigger de atualizacao ausente'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname = 'trg_b_pedido_del') then raise exception 'trava: trigger de exclusao ausente'; end if;
  if position('produto_travado_pedido' in pg_get_functiondef('public._produtos_pedido_ck()'::regprocedure)) = 0 then raise exception 'trava: funcao antiga'; end if;
  if has_function_privilege('authenticated', 'public._produtos_pedido_del()', 'execute') or has_function_privilege('authenticated', 'public._produtos_pedido_ck()', 'execute') then raise exception 'trava: funcao interna aberta'; end if;
end $$;

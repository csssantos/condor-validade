-- Validade a 2 dias ou menos: o app segue a MESMA regra do Telegram. Rode no SQL Editor (tem auto-teste). Rode DEPOIS de supabase-revisao.sql.
-- Regra: produto novo (ou validade alterada) que vence hoje, amanhã ou depois de amanhã NÃO é lançado: leve ao gerente/encarregado para pedir o preço direto.
-- Não mexe em quem só edita quantidade/outros campos de um produto que já estava no app com a mesma validade.
-- Isenta funções do servidor (app.via_rpc = '1', definido por somar_ao_lote; o bot chama lancar_validade sem login de usuário, que tem a própria regra) e jobs sem login.
create or replace function public._produtos_prox() returns trigger language plpgsql security definer set search_path = public as $f$
declare v_antiga date; v_existe boolean := false;
begin
  if auth.uid() is null then return new; end if;
  if coalesce(current_setting('app.via_rpc', true), '') = '1' then return new; end if;
  if new.validade is null then return new; end if;
  if new.validade > public.hoje_br() + 2 then return new; end if;
  if tg_op = 'UPDATE' then
    if new.validade is not distinct from old.validade then return new; end if;
  else
    -- o upsert do app dispara o INSERT mesmo quando o produto já existe (é uma edição)
    select validade, true into v_antiga, v_existe from public.produtos where id = new.id;
    if v_existe and v_antiga is not distinct from new.validade then return new; end if;
  end if;
  if new.validade < public.hoje_br() then return new; end if; -- vencido segue as regras já existentes (validade_vencida)
  raise exception 'validade_muito_proxima';
end $f$;
revoke all on function public._produtos_prox() from public, anon, authenticated;

drop trigger if exists trg_produtos_prox on public.produtos;
create trigger trg_produtos_prox before insert or update on public.produtos for each row execute function public._produtos_prox();

do $do$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_produtos_prox' and tgrelid = 'public.produtos'::regclass and not tgisinternal) then raise exception 'auto-teste: trigger nao criado'; end if;
  if position('validade_muito_proxima' in pg_get_functiondef('public._produtos_prox()'::regprocedure)) = 0 then raise exception 'auto-teste: funcao sem a regra'; end if;
  if has_function_privilege('anon', 'public._produtos_prox()', 'execute') or has_function_privilege('authenticated', 'public._produtos_prox()', 'execute') then raise exception 'auto-teste: funcao aberta'; end if;
end $do$;

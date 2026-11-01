-- Regras do Telegram + EAN-13. Rode DEPOIS de supabase-lote.sql. Pode rodar mais de uma vez; tem auto-teste.
-- 1) Telegram: validade com até 2 dias (hoje, amanhã, depois de amanhã) NÃO é lançada: tem que levar ao gerente para pedir preço direto.
-- 2) Telegram: lote é OBRIGATÓRIO (sem lote não lança), exceto produto por peso.
-- 3) Código de barras novo precisa ser EAN-13 com dígito verificador correto (produto por peso e códigos de balança ficam de fora).

create or replace function public.ean13_valido(p text) returns boolean language plpgsql immutable as $f$
declare s int := 0; i int;
begin
  if p is null or p !~ '^[0-9]{13}$' then return false; end if;
  for i in 1 .. 12 loop s := s + substr(p, i, 1)::int * case when i % 2 = 1 then 1 else 3 end; end loop;
  return (10 - s % 10) % 10 = substr(p, 13, 1)::int;
end $f$;
grant execute on function public.ean13_valido(text) to authenticated, service_role;

-- catálogo: código NOVO precisa ser EAN-13 válido (códigos antigos já cadastrados continuam podendo ser editados)
create or replace function public._catalogo_ean_ck() returns trigger language plpgsql as $f$
begin
  if coalesce(new.por_peso, false) or new.barcode like 'bal:%' then return new; end if;
  if exists (select 1 from public.catalogo where loja_id = new.loja_id and barcode = new.barcode) then return new; end if;
  if not public.ean13_valido(new.barcode) then raise exception 'ean_invalido'; end if;
  return new;
end $f$;
revoke all on function public._catalogo_ean_ck() from public, anon, authenticated;
drop trigger if exists trg_catalogo_ean on public.catalogo;
create trigger trg_catalogo_ean before insert on public.catalogo for each row execute function public._catalogo_ean_ck();

do $do$
declare d text; n text; a1 text; a2 text; a3 text;
begin
  -- lancar_validade
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'lancar_validade';
  if d is null then raise exception 'lancar_validade nao encontrada'; end if;
  if position('validade_muito_proxima' in d) = 0 then
    a1 := 'if p_validade < current_date then raise exception ''validade_vencida''; end if;';
    a2 := 'if lt is null and not coalesce(p_sem_lote, false) and not coalesce(c.por_peso, false) then raise exception ''lote_obrigatorio''; end if;';
    if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'ancoras de lancar_validade nao encontradas'; end if;
    n := replace(d, a1, a1 || ' if p_origem = ''telegram'' and p_validade <= (now() at time zone ''America/Sao_Paulo'')::date + 2 then raise exception ''validade_muito_proxima''; end if;');
    n := replace(n, a2, 'if p_origem = ''telegram'' and lt is null and not coalesce(c.por_peso, false) then raise exception ''lote_obrigatorio_telegram''; end if; ' || a2);
    execute n;
  end if;
  -- telegram_enviar_aprovacao
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'telegram_enviar_aprovacao';
  if d is null then raise exception 'telegram_enviar_aprovacao nao encontrada'; end if;
  if position('validade_muito_proxima' in d) = 0 then
    a1 := 'if length(bc) not in (8, 12, 13, 14) then raise exception ''codigo_invalido''; end if;';
    a2 := 'if p_validade < current_date then raise exception ''validade_vencida''; end if;';
    a3 := 'if lt is null and not coalesce(p_sem_lote, false) then raise exception ''lote_obrigatorio''; end if;';
    if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 then raise exception 'ancoras de telegram_enviar_aprovacao nao encontradas'; end if;
    n := replace(d, a1, 'if length(bc) <> 13 then raise exception ''codigo_invalido''; end if;');
    n := replace(n, a2, a2 || ' if p_validade <= (now() at time zone ''America/Sao_Paulo'')::date + 2 then raise exception ''validade_muito_proxima''; end if;');
    n := replace(n, a3, 'if lt is null then raise exception ''lote_obrigatorio''; end if;');
    execute n;
  end if;
end $do$;

-- auto-teste
do $do$ begin
  if not public.ean13_valido('7891000100103') then raise exception 'auto-teste: ean13 valido recusado'; end if;
  if public.ean13_valido('7891000100104') or public.ean13_valido('123') or public.ean13_valido(null) then raise exception 'auto-teste: ean13 invalido aceito'; end if;
  if position('validade_muito_proxima' in pg_get_functiondef((select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'lancar_validade'))) = 0 then raise exception 'auto-teste: lancar_validade'; end if;
  if position('validade_muito_proxima' in pg_get_functiondef((select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'telegram_enviar_aprovacao'))) = 0 then raise exception 'auto-teste: telegram_enviar_aprovacao'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_catalogo_ean') then raise exception 'auto-teste: trigger do catalogo'; end if;
end $do$;

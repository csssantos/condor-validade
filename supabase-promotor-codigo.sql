-- Item 2: código do promotor forte. Rode no SQL Editor (tem auto-teste).
-- Antes: SIGLA-XXXXX (5 caracteres, ~33 milhões de combinações), permanente e aceitando código escolhido por quem cria.
-- Agora: SIGLA-XXXXXXXXXX (10 caracteres de um alfabeto de 32 = ~1,1 quadrilhão de combinações: adivinhar é inviável),
-- sempre gerado pelo servidor (o cliente não escolhe mais o código). A tabela convites_promotor estava vazia, então nada precisa ser migrado.
-- O app e o bot continuam aceitando os códigos antigos de 5 caracteres, se existirem.

create or replace function public._gerar_codigo_promotor(p_marca text) returns text language plpgsql set search_path = public as $f$
declare pref text; alfa text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; tent int := 0;
begin
  pref := upper(regexp_replace(translate(coalesce(p_marca,''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç','AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'), '[^A-Za-z]', '', 'g'));
  pref := rpad(left(pref, 3), 3, 'X');
  loop
    c := '';
    for i in 1..10 loop
      c := c || substr(alfa, 1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), i * 2 - 1, 2))::bit(8)::int % 32), 1);
    end loop;
    c := pref || '-' || c;
    exit when not exists (select 1 from public.convites_promotor where upper(codigo) = c);
    tent := tent + 1; if tent > 20 then raise exception 'codigo_indisponivel'; end if;
  end loop;
  return c;
end $f$;
revoke all on function public._gerar_codigo_promotor(text) from public, anon, authenticated;

-- o código é SEMPRE gerado pelo servidor no cadastro do convite
create or replace function public._convite_codigo_trg() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  new.codigo := public._gerar_codigo_promotor(new.marca);
  return new;
end $f$;
revoke all on function public._convite_codigo_trg() from public, anon, authenticated;

-- AUTO-TESTE
do $do$
declare c text; c2 text;
begin
  c := public._gerar_codigo_promotor('Bauducco'); c2 := public._gerar_codigo_promotor('Bauducco');
  if c !~ '^BAU-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$' then raise exception 'auto-teste: formato do codigo (%)', c; end if;
  if c = c2 then raise exception 'auto-teste: codigos repetidos'; end if;
  if public._gerar_codigo_promotor('é') !~ '^[A-Z]{3}-' then raise exception 'auto-teste: prefixo'; end if;
  if position('gerar_codigo_promotor' in pg_get_functiondef('public._convite_codigo_trg()'::regprocedure)) = 0 then raise exception 'auto-teste: gatilho do codigo'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.convites_promotor'::regclass and tgname = 'trg_convite_codigo') = false then raise exception 'auto-teste: trigger ausente'; end if;
end $do$;

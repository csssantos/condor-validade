-- ============================================================================
-- Setores em 3 níveis: Setor -> Subcategoria -> Produtos   (2026-10-31)
-- Rode inteiro no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- O que faz:
--  * "Mercearia leve", "Mercearia doce e salgado", "Mercearia saudável" etc. viram setor "Mercearia"
--    + subcategoria (Seca leve, Seca pesada, Seca doce, Seca salgada, Saudáveis, Bolachas, Perfumaria).
--  * Subcategorias antigas (Leve, Pesados, Salgados e Doces, Mundo Saudável) são renomeadas.
--  * Produtos sem subcategoria são classificados pelo nome (chocolate/bala -> Seca doce, cereal -> Seca leve...).
--    O que não der pra decidir fica "Sem subcategoria" para você escolher no app.
-- ============================================================================
begin;

create or replace function pg_temp.sub_nome(n text) returns text language sql immutable as $$
  select case
    when upper(n) ~ 'NESFIT|INTEGRAL|DIET|ZERO ' then 'Saudáveis'
    when upper(n) ~ 'CHEETOS|QUEIJO RALADO|SALGADINHO|AMENDOIM|PIPOCA' then 'Seca salgada'
    when upper(n) ~ 'BISC|BOLACHA|WAFER|COOKIE|ROSCA|MAISENA' then 'Bolachas'
    when upper(n) ~ 'CHOC|BOMBOM|BALA |HALLS|MENTOS|TRIDENT|SNICKERS|MARS |M&M|SONHO|PÃO MEL|LOLO|FINI|KITKAT|BATON|TALENTO|SERENATA|BON O BON|PITSTOP|GAROTO|LACTA|PRESTIGIO|PRESTÍGIO|DIAMANTE|NESCAU' then 'Seca doce'
    when upper(n) ~ 'CER\.|CEREAL|CERAL|CORN|SUCRILHOS|FLAKES|GELATINA|MOLHO|TOSTINES|KELLOGG' then 'Seca leve'
    when upper(n) ~ 'CAFÉ|CAFE |ARROZ|FEIJ|AÇÚCAR|ACUCAR|ÓLEO|OLEO |FARINHA|MACARR' then 'Seca pesada'
    else null end
$$;

create or replace function pg_temp.sub_final(n text, setor_antigo text, sub_antigo text) returns text language sql immutable as $$
  select case
    when lower(coalesce(sub_antigo,'')) in ('seca leve','seca pesada','seca doce','seca salgada','saudáveis','bolachas','perfumaria') then
         (select x from (values ('seca leve','Seca leve'),('seca pesada','Seca pesada'),('seca doce','Seca doce'),('seca salgada','Seca salgada'),('saudáveis','Saudáveis'),('bolachas','Bolachas'),('perfumaria','Perfumaria')) v(k,x) where k = lower(sub_antigo))
    when lower(coalesce(sub_antigo,'')) = 'leve' then 'Seca leve'
    when lower(coalesce(sub_antigo,'')) = 'pesados' then 'Seca pesada'
    when lower(coalesce(sub_antigo,'')) in ('mundo saudável','mundo saudavel') then 'Saudáveis'
    when lower(coalesce(sub_antigo,'')) = 'salgados e doces' then coalesce(pg_temp.sub_nome(n), 'Seca doce')
    when lower(coalesce(setor_antigo,'')) ~ 'saud[aá]vel' then 'Saudáveis'
    when lower(coalesce(setor_antigo,'')) ~ 'leve' then 'Seca leve'
    else pg_temp.sub_nome(n) end
$$;

-- catálogo
update public.catalogo
   set subsetor = pg_temp.sub_final(nome, setor, subsetor), setor = 'Mercearia'
 where lower(btrim(setor)) = 'mercearia' or lower(btrim(setor)) like 'mercearia %';

-- produtos: primeiro copia do catálogo (mesmo código de barras), depois classifica pelo nome o que sobrar
update public.produtos p
   set setor = 'Mercearia'
 where lower(btrim(p.setor)) like 'mercearia %';
update public.produtos p
   set subsetor = c.subsetor
  from public.catalogo c
 where c.barcode = p.barcode and p.setor = 'Mercearia' and c.setor = 'Mercearia' and c.subsetor is not null
   and (p.subsetor is null or lower(p.subsetor) in ('leve','pesados','mundo saudável','salgados e doces'));
update public.produtos p
   set subsetor = pg_temp.sub_final(p.nome, p.setor, p.subsetor)
 where p.setor = 'Mercearia'
   and (p.subsetor is null or lower(p.subsetor) in ('leve','pesados','mundo saudável','salgados e doces'));

-- demais tabelas que guardam o nome do setor
do $$
declare t text;
begin
  foreach t in array array['historico','rondas','ocorrencias','acoes_preventivas'] loop
    begin
      execute format('update public.%I set setor = %L where lower(btrim(setor)) like %L', t, 'Mercearia', 'mercearia %');
    exception when others then raise notice 'pulei %: %', t, sqlerrm; end;
  end loop;
end $$;

delete from public.setores_customizados where lower(btrim(nome)) like 'mercearia %';

commit;

-- Conferência: como ficou a Mercearia
select coalesce(subsetor, '(sem subcategoria)') as subcategoria, count(*) as produtos_no_catalogo
  from public.catalogo where setor = 'Mercearia' group by 1 order by 2 desc;

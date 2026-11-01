-- Lote na RONDA e nos RELATÓRIOS. Rode DEPOIS de supabase-lote.sql. Pode rodar mais de uma vez; tem auto-teste.
-- 1) ronda_itens guarda uma foto dos lotes cadastrados no momento em que a ronda é criada; a conferência guarda validade + lote encontrados.
-- 2) historico (baixas) passa a guardar o lote.
alter table public.ronda_itens add column if not exists lotes_cadastrados jsonb;
alter table public.historico add column if not exists lote text;
alter table public.historico add column if not exists sem_lote boolean not null default false;
do $do$ begin
  if not exists (select 1 from pg_constraint where conname = 'historico_lote_ck') then
    alter table public.historico add constraint historico_lote_ck check (lote is null or lote ~ '^[A-Z0-9][A-Z0-9./ -]{0,19}$');
  end if;
end $do$;

create or replace function public._lotes_do_produto(p_loja bigint, p_barcode text, p_setor text) returns jsonb
language sql stable security definer set search_path = public as $f$
  select coalesce(jsonb_agg(jsonb_build_object('lote', x.lote, 'sem_lote', coalesce(x.sem_lote, false), 'validade', x.validade, 'quantidade', x.quantidade) order by x.validade), '[]'::jsonb)
  from (select lote, sem_lote, validade, quantidade from public.produtos where loja_id = p_loja and barcode = p_barcode and setor = p_setor order by validade limit 20) x
$f$;
revoke all on function public._lotes_do_produto(bigint, text, text) from public, anon, authenticated;

-- criar_ronda e criar_ronda_inteligente: guardam os lotes cadastrados em cada item
do $do$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'criar_ronda';
  if d is null then raise exception 'criar_ronda nao encontrada'; end if;
  if position('lotes_cadastrados' in d) = 0 then
    n := replace(d, 'validade_cadastrada, resultado)', 'validade_cadastrada, resultado, lotes_cadastrados)');
    n := replace(n, '''pendente''', '''pendente'', public._lotes_do_produto(v_loja, c.barcode, c.setor)');
    if n = d or position('lotes_cadastrados' in n) = 0 or position('_lotes_do_produto' in n) = 0 then raise exception 'nao consegui ajustar criar_ronda'; end if;
    execute n;
  end if;
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'criar_ronda_inteligente';
  if d is null then raise exception 'criar_ronda_inteligente nao encontrada'; end if;
  if position('lotes_cadastrados' in d) = 0 then
    n := replace(d, 'validade_cadastrada, resultado, risco,', 'validade_cadastrada, resultado, lotes_cadastrados, risco,');
    n := replace(n, '''pendente'', a.score', '''pendente'', public._lotes_do_produto(v_loja, c.barcode, c.setor), a.score');
    if n = d or position('lotes_cadastrados' in n) = 0 or position('_lotes_do_produto' in n) = 0 then raise exception 'nao consegui ajustar criar_ronda_inteligente'; end if;
    execute n;
  end if;
end $do$;

-- registrar_conferencia: valida e normaliza o lote de cada lote encontrado (opcional, MAIÚSCULAS, mesmo formato do cadastro)
do $do$
declare d text; n text; ancora text; novo text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'registrar_conferencia';
  if d is null then raise exception 'registrar_conferencia nao encontrada'; end if;
  if position('lotes_demais' in d) = 0 then
    ancora := 'if p_resultado in (''ok'',''atencao'') and v_val is null then raise exception ''validade_obrigatoria''; end if;';
    novo := $r$if p_lotes is not null and jsonb_typeof(p_lotes) = 'array' and jsonb_array_length(p_lotes) > 0 then
    if jsonb_array_length(p_lotes) > 10 then raise exception 'lotes_demais'; end if;
    if exists (select 1 from jsonb_array_elements(p_lotes) x where nullif(x ->> 'validade', '') is null) then raise exception 'validade_obrigatoria'; end if;
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('validade', (x ->> 'validade')::date, 'lote', nullif(upper(btrim(coalesce(x ->> 'lote', ''))), '')))) into p_lotes from jsonb_array_elements(p_lotes) x;
    if exists (select 1 from jsonb_array_elements(p_lotes) x where x ? 'lote' and (x ->> 'lote') !~ '^[A-Z0-9][A-Z0-9./ -]{0,19}$') then raise exception 'lote_invalido'; end if;
  elsif p_lotes is not null then p_lotes := null;
  end if;
  $r$;
    if position(ancora in d) = 0 then raise exception 'ancora da conferencia nao encontrada'; end if;
    n := replace(d, ancora, novo || ancora);
    n := replace(n, '''validade'', v_val, ''obs'', p_obs,', '''validade'', v_val, ''lotes'', p_lotes, ''obs'', p_obs,');
    if n = d then raise exception 'nao consegui ajustar registrar_conferencia'; end if;
    execute n;
  end if;
end $do$;

-- auto-teste
do $do$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'ronda_itens' and column_name = 'lotes_cadastrados') then raise exception 'auto-teste: lotes_cadastrados nao existe'; end if;
  if not exists (select 1 from information_schema.columns where table_name = 'historico' and column_name = 'lote') then raise exception 'auto-teste: historico.lote nao existe'; end if;
  if position('_lotes_do_produto' in pg_get_functiondef('public.criar_ronda(text[], text, uuid[], timestamptz, timestamptz, text, bigint, text[])'::regprocedure)) = 0 then raise exception 'auto-teste: criar_ronda'; end if;
  if position('_lotes_do_produto' in pg_get_functiondef((select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'criar_ronda_inteligente'))) = 0 then raise exception 'auto-teste: criar_ronda_inteligente'; end if;
  if position('lotes_demais' in pg_get_functiondef((select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'registrar_conferencia'))) = 0 then raise exception 'auto-teste: registrar_conferencia'; end if;
  if public._lotes_do_produto(-1, 'x', 'x') <> '[]'::jsonb then raise exception 'auto-teste: helper'; end if;
end $do$;

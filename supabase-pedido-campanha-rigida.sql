-- Endurece registrar_pedido_promocao (pedido do dono + banca, 2026-11-13). Rodar DEPOIS de supabase-pedido-campanha-obrigatoria.sql e supabase-pedido-so-encarregado.sql.
--  1) campanha precisa ter ao menos 1 letra/número (só "-", ".", "///" não vale) e espaços repetidos viram um só;
--  2) só o encarregado DO SETOR (ou acima) pede: sai o caminho "autor do lote" (o nível 6, único que usava, já está barrado).
-- Auto-teste: se algo falhar, nada é aplicado. Idempotente. NÃO reaplicar os SQLs antigos de pedido depois (desfazem isto).
do $$
declare d text; novo text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_pedido_promocao' and p.pronargs=4;
  if d is null then raise exception 'registrar_pedido_promocao (4 parâmetros) não encontrada'; end if;
  if d like '%regexp_replace(upper(btrim%' and d like '%camp !~ ''[A-Z0-9]''%' and d not like '%_eh_autor%' then raise notice 'já aplicado'; return; end if;
  novo := replace(d, 'upper(btrim(coalesce(p_campanha, '''')))', 'regexp_replace(upper(btrim(coalesce(p_campanha, ''''))), ''\s+'', '' '', ''g'')');
  if novo = d then raise exception 'trecho da normalização não encontrado: revisar'; end if;
  d := novo;
  novo := replace(d, 'if p_tipo is not null and camp is null then', 'if p_tipo is not null and (camp is null or camp !~ ''[A-Z0-9]'') then');
  if novo = d then raise exception 'trecho da campanha obrigatória não encontrado: aplique antes supabase-pedido-campanha-obrigatoria.sql'; end if;
  d := novo;
  novo := replace(d, 'if not (public._setor_ok(x.setor) or public._eh_autor(x.lancado_por_id, x.cadastrado_por)) then raise exception ''editar_exige_autor''; end if;', 'if not public._setor_ok(x.setor) then raise exception ''editar_exige_encarregado''; end if;');
  if novo = d then raise exception 'trecho da checagem de setor não encontrado: revisar'; end if;
  execute novo;
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_pedido_promocao' and p.pronargs=4;
  if d like '%_eh_autor%' or d not like '%camp !~ ''[A-Z0-9]''%' or d not like '%nivel > 5%' or d not like '%valor_pedido_obrigatorio%' then raise exception 'auto-teste falhou: função inesperada'; end if;
end $$;

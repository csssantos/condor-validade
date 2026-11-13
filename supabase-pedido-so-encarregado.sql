-- Só encarregado (nível <= 5) ou acima pode registrar/alterar pedido de promoção ou preço direto (pedido do dono, 2026-11-13).
-- Rodar DEPOIS de supabase-pedido-campanha-obrigatoria.sql. Auto-teste: se algo falhar, nada é aplicado.
do $$
declare d text; novo text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_pedido_promocao' and p.pronargs=4;
  if d is null then raise exception 'registrar_pedido_promocao (4 parâmetros) não encontrada'; end if;
  if d like '%nivel > 5%' then raise notice 'já aplicado'; return; end if;
  novo := replace(d, 'if nivel is null or nivel > 6 then raise exception ''sem_permissao''; end if;', 'if nivel is null or nivel > 5 then raise exception ''sem_permissao''; end if;');
  if novo = d then raise exception 'trecho não encontrado: a função mudou, revisar antes de aplicar'; end if;
  execute novo;
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_pedido_promocao' and p.pronargs=4;
  if d not like '%nivel > 5%' or d not like '%campanha_obrigatoria%' then raise exception 'auto-teste falhou: função inesperada'; end if;
end $$;

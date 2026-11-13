-- Número da campanha SÓ NÚMEROS, 1 a 20 dígitos (pedido do dono, 2026-11-13). Rodar DEPOIS de supabase-pedido-campanha-rigida.sql.
-- Pedidos antigos com letras continuam como estão; só passam a exigir número se alguém alterar o pedido. Auto-teste: se algo falhar, nada é aplicado.
-- NÃO reaplicar os SQLs antigos de pedido depois (voltam o formato antigo).
do $$
declare d text; novo text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_pedido_promocao' and p.pronargs=4;
  if d is null then raise exception 'registrar_pedido_promocao (4 parâmetros) não encontrada'; end if;
  if position('^[0-9]{1,20}$' in d) > 0 and position('^[A-Z0-9./ -]{1,20}$' in d) = 0 then raise notice 'já aplicado'; return; end if;
  novo := replace(d, 'camp !~ ''^[A-Z0-9./ -]{1,20}$''', 'camp !~ ''^[0-9]{1,20}$''');
  if novo = d then raise exception 'trecho do formato da campanha não encontrado: revisar'; end if;
  execute novo;
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_pedido_promocao' and p.pronargs=4;
  if position('^[0-9]{1,20}$' in d) = 0 or position('campanha_obrigatoria' in d) = 0 or position('nivel > 5' in d) = 0 or position('_eh_autor' in d) > 0 or position('valor_pedido_obrigatorio' in d) = 0 then
    raise exception 'auto-teste falhou: função inesperada';
  end if;
end $$;

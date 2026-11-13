-- Número da campanha OBRIGATÓRIO ao registrar/alterar pedido de promoção ou preço direto E só encarregado (nível <= 5) ou acima pode pedir (pedido do dono, 2026-11-13).
-- Rodar DEPOIS de supabase-pedido-valor.sql. Remover o pedido continua sem campanha. Pedidos já registrados sem campanha continuam como estão
-- (só exigem campanha se alguém for alterá-los). Tem auto-teste: se algo falhar, nada é aplicado (transação desfeita).
-- NÃO reaplicar supabase-pedido-valor.sql depois: volta a campanha opcional (se reaplicar, rode este de novo).
do $$
declare d text; novo text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_pedido_promocao' and p.pronargs=4;
  if d is null then raise exception 'registrar_pedido_promocao (4 parâmetros) não encontrada'; end if;
  if d like '%campanha_obrigatoria%' then raise notice 'já aplicado'; return; end if;
  novo := replace(d, 'if p_tipo is null then camp := null; end if;',
    'if p_tipo is null then camp := null; end if;' || E'\n  ' || 'if p_tipo is not null and camp is null then raise exception ''campanha_obrigatoria''; end if;');
  if novo = d then raise exception 'trecho não encontrado: a função mudou, revisar antes de aplicar'; end if;
  novo := replace(novo, 'if nivel is null or nivel > 6 then raise exception ''sem_permissao''; end if;', 'if nivel is null or nivel > 5 then raise exception ''sem_permissao''; end if;');
  if novo not like '%nivel > 5%' then raise exception 'trecho do nível não encontrado: a função mudou, revisar antes de aplicar'; end if;
  execute novo;
  -- auto-teste: a função nova precisa conter a regra e manter o resto
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_pedido_promocao' and p.pronargs=4;
  if d not like '%campanha_obrigatoria%' or d not like '%nivel > 5%' or d not like '%valor_pedido_obrigatorio%' or d not like '%security definer%' and d not like '%SECURITY DEFINER%' then
    raise exception 'auto-teste falhou: função inesperada';
  end if;
end $$;
-- permissões continuam as mesmas (CREATE OR REPLACE mantém os grants).

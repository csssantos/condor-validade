-- FOTOS DO OPEN FOOD FACTS PARA O NOSSO ARMAZENAMENTO (pedido do dono, 2026-11-17).
-- Problema: parte dos produtos guarda só um LINK de foto do Open Food Facts (site de fora). Os links antigos deles
-- deixam de abrir (revisão trocada ou site fora do ar) e o cartão fica em branco. A Edge Function `fotos-migrar`
-- passa a pedir a foto ATUAL pelo código de barras (API deles), guardar uma cópia no bucket "fotos" e trocar o link.
-- Este SQL só cria 2 funções que SÓ a chave de serviço executa (mesmo padrão de fotos_pendentes/foto_trocar):
--   fotos_off_pendentes(limite): catálogo com link do Open Food Facts + código de barras numérico (ordem aleatória,
--                                para uma foto sem resposta não travar a fila).
--   foto_off_trocar(loja, link_antigo, link_novo): troca o link antigo pelo do nosso bucket em catálogo, lotes
--                                (menos lote travado por pedido de campanha) e histórico daquela loja.
-- Nada muda em tabela, coluna, policy ou trigger. Rodar DEPOIS de supabase-fotos-storage.sql e supabase-fotos-ajustes.sql.
-- Auto-teste no final (não grava nada em dado real): se algo falhar, nada é aplicado.
begin;

create or replace function public.fotos_off_pendentes(p_limite int default 8)
returns table (loja_id bigint, antigo text, barcode text)
language sql security definer set search_path = public as $$
  select c.loja_id, c.foto, c.barcode
    from public.catalogo c
   where c.loja_id is not null
     and c.foto ~ '^https://([a-z0-9-]+\.)*openfoodfacts\.org/'
     and length(c.foto) <= 400
     and c.barcode ~ '^[0-9]{8,14}$'
   group by c.loja_id, c.foto, c.barcode
   order by random()
   limit greatest(1, least(coalesce(p_limite, 8), 20));
$$;

create or replace function public.foto_off_trocar(p_loja bigint, p_antigo text, p_url text)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  if p_loja is null or p_antigo is null or p_antigo !~ '^https://([a-z0-9-]+\.)*openfoodfacts\.org/' then
    raise exception 'foto_pedido_invalido';
  end if;
  -- só aceita link do bucket "fotos" DESTE projeto, na pasta da própria loja
  if p_url is null or p_url !~ ('^https://fbovltxucooeoldjfckk\.supabase\.co/storage/v1/object/public/fotos/' || p_loja::text || '/[a-f0-9]{32}\.(jpg|png|webp)$') then
    raise exception 'foto_url_invalida';
  end if;
  perform set_config('app.via_rpc', '1', true);
  update public.catalogo set foto = p_url where loja_id = p_loja and foto = p_antigo;
  get diagnostics k = row_count; n := n + k;
  update public.produtos set foto = p_url where loja_id = p_loja and pedido_tipo is null and foto = p_antigo;
  get diagnostics k = row_count; n := n + k;
  update public.historico set foto = p_url where loja_id = p_loja and foto = p_antigo;
  get diagnostics k = row_count; n := n + k;
  perform set_config('app.via_rpc', '', true);
  return n;
end $$;

revoke all on function public.fotos_off_pendentes(int) from public, anon, authenticated;
revoke all on function public.foto_off_trocar(bigint, text, text) from public, anon, authenticated;
grant execute on function public.fotos_off_pendentes(int) to service_role;
grant execute on function public.foto_off_trocar(bigint, text, text) to service_role;

-- AUTO-TESTE (não grava em dado real)
do $$
begin
  if has_function_privilege('authenticated', 'public.foto_off_trocar(bigint,text,text)', 'execute')
     or has_function_privilege('anon', 'public.foto_off_trocar(bigint,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.fotos_off_pendentes(int)', 'execute')
     or has_function_privilege('anon', 'public.fotos_off_pendentes(int)', 'execute') then
    raise exception 'auto-teste falhou: função aberta para usuário';
  end if;
  perform 1 from public.fotos_off_pendentes(1);
  begin
    perform public.foto_off_trocar(1, 'https://images.openfoodfacts.org/x.jpg', 'https://exemplo.com/x.jpg');
    raise exception 'auto-teste falhou: aceitou link de fora';
  exception when others then
    if sqlerrm <> 'foto_url_invalida' then raise exception 'auto-teste falhou (link de fora): %', sqlerrm; end if;
  end;
  begin
    perform public.foto_off_trocar(1, 'https://fbovltxucooeoldjfckk.supabase.co/storage/v1/object/public/fotos/1/' || repeat('a', 32) || '.jpg',
                                      'https://fbovltxucooeoldjfckk.supabase.co/storage/v1/object/public/fotos/1/' || repeat('b', 32) || '.jpg');
    raise exception 'auto-teste falhou: aceitou link antigo que não é do Open Food Facts';
  exception when others then
    if sqlerrm <> 'foto_pedido_invalido' then raise exception 'auto-teste falhou (antigo): %', sqlerrm; end if;
  end;
  begin
    perform public.foto_off_trocar(1, 'https://images.openfoodfacts.org/x.jpg',
                                      'https://fbovltxucooeoldjfckk.supabase.co/storage/v1/object/public/fotos/2/' || repeat('b', 32) || '.jpg');
    raise exception 'auto-teste falhou: aceitou pasta de outra loja';
  exception when others then
    if sqlerrm <> 'foto_url_invalida' then raise exception 'auto-teste falhou (pasta): %', sqlerrm; end if;
  end;
  begin
    perform public.foto_off_trocar(1, 'https://evilopenfoodfacts.org/x.jpg',
                                      'https://fbovltxucooeoldjfckk.supabase.co/storage/v1/object/public/fotos/1/' || repeat('b', 32) || '.jpg');
    raise exception 'auto-teste falhou: aceitou domínio parecido';
  exception when others then
    if sqlerrm <> 'foto_pedido_invalido' then raise exception 'auto-teste falhou (domínio): %', sqlerrm; end if;
  end;
end $$;

commit;

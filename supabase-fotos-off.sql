-- FOTOS DO OPEN FOOD FACTS PARA O NOSSO ARMAZENAMENTO (pedido do dono, 2026-11-17).
-- Problema: parte dos produtos guarda só um LINK de foto do Open Food Facts (site de fora). Os links antigos deles
-- deixam de abrir (revisão trocada ou site fora do ar) e o cartão fica em branco. A Edge Function `fotos-migrar`
-- passa a pedir a foto ATUAL pelo código de barras (API deles), guardar uma cópia no bucket "fotos" e trocar o link.
-- Este SQL cria 1 tabelinha de memória (fechada, só a chave de serviço) e 3 funções que SÓ a chave de serviço executa
-- (mesmo padrão de fotos_pendentes/foto_trocar):
--   fotos_off_pendentes(limite): catálogo com link do Open Food Facts + código de barras válido (EAN-8/UPC-A/EAN-13, não só zeros),
--                                ordem aleatória, sem os que o OFF já respondeu "sem foto" (tabela fotos_off_tentativas).
--   foto_off_falhou(loja, barcode): registra essa resposta (3 dias de pausa; 5 falhas = para).
--   foto_off_trocar(loja, link_antigo, link_novo): troca o link antigo pelo do nosso bucket em catálogo, lotes
--                                (menos lote travado por pedido de campanha) e histórico daquela loja.
-- Nenhuma tabela, coluna, policy ou trigger existente muda. Rodar DEPOIS de supabase-fotos-storage.sql e supabase-fotos-ajustes.sql.
-- Auto-teste no final (não grava nada em dado real): se algo falhar, nada é aplicado.
begin;

-- Memória de falha: produto que o OFF respondeu "não tenho foto" não é consultado de novo por 3 dias (e, depois de 5 falhas, só manualmente).
create table if not exists public.fotos_off_tentativas (
  loja_id bigint not null,
  barcode text not null,
  falhas int not null default 1,
  ultima timestamptz not null default now(),
  primary key (loja_id, barcode)
);
alter table public.fotos_off_tentativas enable row level security; -- sem policy: ninguém lê/escreve, só a chave de serviço
revoke all on public.fotos_off_tentativas from public, anon, authenticated;

create or replace function public.fotos_off_pendentes(p_limite int default 4)
returns table (loja_id bigint, antigo text, barcode text)
language sql security definer set search_path = public as $$
  -- um item por (loja, link antigo): o mesmo link em dois códigos não vira dois trabalhos concorrentes
  select c.loja_id, c.foto, min(c.barcode)
    from public.catalogo c
   where c.loja_id is not null
     and c.foto ~ '^https://([a-z0-9-]+\.)*openfoodfacts\.org/'
     and length(c.foto) <= 400
     and (c.barcode ~ '^[0-9]{8}$' or c.barcode ~ '^[0-9]{12,13}$')
     and c.barcode !~ '^0+$'
     and not exists (select 1 from public.fotos_off_tentativas t
                      where t.loja_id = c.loja_id and t.barcode = c.barcode
                        and (t.falhas >= 5 or t.ultima > now() - interval '3 days'))
   group by c.loja_id, c.foto
   order by random()
   limit greatest(1, least(coalesce(p_limite, 4), 10));
$$;

create or replace function public.foto_off_falhou(p_loja bigint, p_barcode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_loja is null or p_barcode is null or p_barcode !~ '^[0-9]{8,14}$' then raise exception 'foto_pedido_invalido'; end if;
  insert into public.fotos_off_tentativas (loja_id, barcode) values (p_loja, p_barcode)
  on conflict (loja_id, barcode) do update set falhas = public.fotos_off_tentativas.falhas + 1, ultima = now();
end $$;

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
revoke all on function public.foto_off_falhou(bigint, text) from public, anon, authenticated;
grant execute on function public.fotos_off_pendentes(int) to service_role;
grant execute on function public.foto_off_trocar(bigint, text, text) to service_role;
grant execute on function public.foto_off_falhou(bigint, text) to service_role;

-- AUTO-TESTE (não grava em dado real)
do $$
begin
  if has_function_privilege('authenticated', 'public.foto_off_trocar(bigint,text,text)', 'execute')
     or has_function_privilege('anon', 'public.foto_off_trocar(bigint,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.fotos_off_pendentes(int)', 'execute')
     or has_function_privilege('anon', 'public.fotos_off_pendentes(int)', 'execute')
     or has_function_privilege('authenticated', 'public.foto_off_falhou(bigint,text)', 'execute')
     or has_function_privilege('anon', 'public.foto_off_falhou(bigint,text)', 'execute')
     or has_table_privilege('authenticated', 'public.fotos_off_tentativas', 'select')
     or has_table_privilege('anon', 'public.fotos_off_tentativas', 'select') then
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

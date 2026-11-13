-- FOTOS FORA DAS TABELAS (pedido do dono, 2026-11-13; item A1 da auditoria).
-- Hoje a foto do produto fica como texto (base64) dentro de catalogo.foto, produtos.foto e historico.foto, e o app baixa tudo ao abrir.
-- Este SQL só PREPARA: cria o bucket público "fotos" e duas funções que só a chave de serviço executa.
-- Quem move as fotos é a Edge Function `fotos-migrar` (publicar DEPOIS deste SQL): envia cada foto uma vez e troca a coluna pelo link.
-- O que NÃO muda: nenhuma tabela, coluna, policy ou trigger existente. Fotos de lote travado por pedido de campanha ficam como estão
-- (o lote não aceita alteração) e são movidas depois, quando o pedido sair ou a baixa for dada.
-- Riscos: (1) o link da foto é público para quem tiver o endereço (nome = código do conteúdo; não dá para listar o bucket);
-- (2) historico é "só inserção" para pessoas; aqui a função de serviço troca APENAS o texto da foto pelo link da mesma foto.
-- Auto-teste no final: se algo falhar, nada é aplicado.
begin;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('fotos', 'fotos', true, 524288, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 524288, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
  -- Sem policy em storage.objects para este bucket: só a chave de serviço grava/apaga; a leitura é pelo link público.
end $$;

create or replace function public.fotos_pendentes(p_limite int default 12)
returns table (loja_id bigint, hash text, foto text)
language sql security definer set search_path = public as $$
  select x.loja_id, md5(x.foto), min(x.foto)
    from (select c.loja_id, c.foto from public.catalogo c where c.foto like 'data:image/%'
          union all select p.loja_id, p.foto from public.produtos p where p.foto like 'data:image/%' and p.pedido_tipo is null
          union all select h.loja_id, h.foto from public.historico h where h.foto like 'data:image/%') x
   where x.loja_id is not null
   group by x.loja_id, md5(x.foto)
   limit greatest(1, least(coalesce(p_limite, 12), 50));
$$;

create or replace function public.foto_trocar(p_loja bigint, p_hash text, p_url text)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  if p_loja is null or p_hash !~ '^[a-f0-9]{32}$' then raise exception 'foto_pedido_invalido'; end if;
  -- só aceita link do bucket "fotos" DESTE projeto, na pasta da própria loja e com o mesmo código do conteúdo
  if p_url !~ ('^https://fbovltxucooeoldjfckk\.supabase\.co/storage/v1/object/public/fotos/' || p_loja::text || '/' || p_hash || '\.(jpg|png|webp)$') then
    raise exception 'foto_url_invalida';
  end if;
  perform set_config('app.via_rpc', '1', true);
  update public.catalogo set foto = p_url where loja_id = p_loja and foto like 'data:image/%' and md5(foto) = p_hash;
  get diagnostics k = row_count; n := n + k;
  update public.produtos set foto = p_url where loja_id = p_loja and pedido_tipo is null and foto like 'data:image/%' and md5(foto) = p_hash;
  get diagnostics k = row_count; n := n + k;
  update public.historico set foto = p_url where loja_id = p_loja and foto like 'data:image/%' and md5(foto) = p_hash;
  get diagnostics k = row_count; n := n + k;
  perform set_config('app.via_rpc', '', true);
  return n;
end $$;

revoke all on function public.fotos_pendentes(int) from public, anon, authenticated;
revoke all on function public.foto_trocar(bigint, text, text) from public, anon, authenticated;
grant execute on function public.fotos_pendentes(int) to service_role;
grant execute on function public.foto_trocar(bigint, text, text) to service_role;

-- AUTO-TESTE (desfaz tudo se falhar): troca uma foto de verdade por um link de teste e confere; depois volta ao que era.
do $$
declare v_loja bigint; v_hash text; v_foto text; n int; antes int; depois int; aud0 int; aud1 int;
begin
  if not exists (select 1 from storage.buckets where id = 'fotos' and public) then raise exception 'auto-teste: bucket fotos não criado'; end if;
  if has_function_privilege('authenticated', 'public.foto_trocar(bigint,text,text)', 'execute')
     or has_function_privilege('anon', 'public.fotos_pendentes(int)', 'execute') then raise exception 'auto-teste: função aberta para usuário'; end if;
  select loja_id, hash, foto into v_loja, v_hash, v_foto from public.fotos_pendentes(1);
  if v_hash is null then raise notice 'auto-teste: nenhuma foto pendente (nada a testar)'; return; end if;
  begin perform public.foto_trocar(v_loja, v_hash, 'https://exemplo.com/x.jpg'); raise exception 'auto-teste: aceitou link de fora';
  exception when others then if sqlerrm not like '%foto_url_invalida%' then raise; end if; end;
  begin perform public.foto_trocar(v_loja, v_hash, 'https://fbovltxucooeoldjfckk.supabase.co/storage/v1/object/public/fotos/' || (v_loja + 1)::text || '/' || v_hash || '.jpg'); raise exception 'auto-teste: aceitou pasta de outra loja';
  exception when others then if sqlerrm not like '%foto_url_invalida%' then raise; end if; end;
  select count(*) into aud0 from public.auditoria;
  select count(*) into antes from (select 1 from public.catalogo where loja_id = v_loja and md5(foto) = v_hash union all select 1 from public.produtos where loja_id = v_loja and pedido_tipo is null and md5(foto) = v_hash union all select 1 from public.historico where loja_id = v_loja and md5(foto) = v_hash) x;
  n := public.foto_trocar(v_loja, v_hash, 'https://fbovltxucooeoldjfckk.supabase.co/storage/v1/object/public/fotos/' || v_loja::text || '/' || v_hash || '.jpg');
  if n <> antes or n = 0 then raise exception 'auto-teste: trocou % de % linhas', n, antes; end if;
  select count(*) into aud1 from public.auditoria;
  if aud1 <> aud0 then raise exception 'auto-teste: a troca gerou auditoria'; end if;
  -- volta ao que era (a foto de verdade ainda não foi enviada ao bucket)
  perform set_config('app.via_rpc', '1', true);
  update public.catalogo set foto = v_foto where loja_id = v_loja and foto like '%/fotos/' || v_loja::text || '/' || v_hash || '.jpg';
  update public.produtos set foto = v_foto where loja_id = v_loja and foto like '%/fotos/' || v_loja::text || '/' || v_hash || '.jpg';
  update public.historico set foto = v_foto where loja_id = v_loja and foto like '%/fotos/' || v_loja::text || '/' || v_hash || '.jpg';
  perform set_config('app.via_rpc', '', true);
  select count(*) into depois from (select 1 from public.catalogo where loja_id = v_loja and md5(foto) = v_hash union all select 1 from public.produtos where loja_id = v_loja and pedido_tipo is null and md5(foto) = v_hash union all select 1 from public.historico where loja_id = v_loja and md5(foto) = v_hash) x;
  if depois <> antes then raise exception 'auto-teste: não voltou ao estado anterior (% de %)', depois, antes; end if;
end $$;

commit;

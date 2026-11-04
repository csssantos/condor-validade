-- TELEGRAM: PREÇO, TROCA E SUBCATEGORIA NO LANÇAMENTO (2026-11-04, pedido do dono)
-- Rodar DEPOIS de supabase-pedido-promocao.sql (a função lê produtos.pedido_tipo). Tem auto-teste no final, que confere as colunas usadas.
-- A gramagem usa o que o lancar_validade já aceita (p_tamanho / p_unidade). Preço, troca e subcategoria entram por esta função,
-- chamada pelo bot logo depois do lançamento, SÓ no lote que acabou de ser criado pela mesma pessoa (funcionário ou promotor) pelo Telegram.
-- Promotor informa só preço e troca; subcategoria é só do funcionário.

create or replace function public.telegram_complementar_lote(p_chat_id bigint, p_id text, p_preco numeric default null, p_troca text default null, p_subsetor text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v record; cv record; x record; sub text; partes text[] := '{}'; troca_final text; preco_antes numeric; quem text; autor_ok boolean; ref numeric;
begin
  select usuario_id, convite_id, tipo, loja_id into v from public.telegram_vinculos where chat_id = p_chat_id;
  if not found then raise exception 'sem_permissao'; end if;
  if v.tipo = 'funcionario' and v.usuario_id is not null then
    select nome into quem from public.usuarios where id = v.usuario_id and ativo and loja_id is not distinct from v.loja_id;
    if quem is null then raise exception 'usuario_fora_da_loja'; end if;
  elsif v.tipo = 'promotor' and v.convite_id is not null then
    -- promotor informa só preço e troca (a subcategoria é do funcionário)
    select nome, marca into cv from public.convites_promotor
     where id = v.convite_id and not revogado and not pausado and expira_em > now() and loja_id is not distinct from v.loja_id;
    if not found then raise exception 'usuario_fora_da_loja'; end if;
    quem := 'Promotor ' || cv.nome || ' (' || cv.marca || ')';
    p_subsetor := null;
  else
    raise exception 'sem_permissao';
  end if;
  if p_preco is not null and (p_preco < 0.01 or p_preco > 5000) then raise exception 'preco_invalido'; end if;
  if p_troca is not null and p_troca not in ('com_troca', 'sem_troca') then raise exception 'troca_invalida'; end if;
  sub := nullif(btrim(coalesce(p_subsetor, '')), '');
  if sub is not null and (length(sub) > 40 or sub !~ '^[A-Za-zÀ-ÿ0-9 ,.&/()-]+$') then sub := null; end if; -- subcategoria estranha é ignorada; não derruba preço e troca
  select id, nome, barcode, validade, lote, loja_id, origem, lancado_por_id, cadastrado_por, criado_em, pedido_tipo, politica_troca, preco_unitario, por_peso
    into x from public.produtos where id = p_id and loja_id = v.loja_id for update;
  -- só o lote criado agora (até 10 min) por esta mesma pessoa pelo Telegram; qualquer outra coisa é recusada
  autor_ok := found and (case when v.tipo = 'funcionario' then x.lancado_por_id is not distinct from v.usuario_id
                              else x.lancado_por_id is null and x.cadastrado_por is not distinct from quem end);
  if not coalesce(autor_ok, false) or x.origem is distinct from 'telegram' or x.criado_em < now() - interval '10 minutes' then
    raise exception 'produto_nao_encontrado';
  end if;
  if x.pedido_tipo is not null then raise exception 'produto_travado_pedido'; end if;
  if coalesce(x.por_peso, false) then raise exception 'produto_por_peso'; end if;
  preco_antes := x.preco_unitario;
  -- promotor é terceiro: o preço dele é comparado com o preço FIXO do catálogo (0,4x a 2,5x). Sem preço de referência, o preço do promotor é ignorado.
  if v.tipo = 'promotor' and p_preco is not null then
    ref := (select c.preco_unitario from public.catalogo c where c.barcode = x.barcode and c.loja_id = x.loja_id);
    if coalesce(ref, 0) <= 0 then p_preco := null;
    elsif p_preco < ref * 0.4 or p_preco > ref * 2.5 then raise exception 'preco_fora_da_faixa'; end if;
  end if;
  troca_final := coalesce(p_troca, x.politica_troca);
  update public.produtos
     set preco_unitario = coalesce(round(p_preco, 2), preco_unitario),
         politica_troca = troca_final,
         subsetor = coalesce(sub, subsetor)
   where id = p_id;
  if p_preco is not null then partes := partes || ('preço R$ ' || replace(to_char(round(p_preco, 2), 'FM9990.00'), '.', ',') || ' (' || case when preco_antes is null then 'sem preço anterior' else 'antes R$ ' || replace(to_char(preco_antes, 'FM9990.00'), '.', ',') end || ')'); end if;
  if p_troca is not null then partes := partes || (case p_troca when 'sem_troca' then 'sem troca' else 'com troca' end); end if;
  if sub is not null then partes := partes || ('subcategoria ' || sub); end if;
  if array_length(partes, 1) > 0 then
    insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
      values (quem, 'completou lançamento (Telegram)',
              x.nome || ' · validade ' || to_char(x.validade, 'DD/MM/YYYY') || coalesce(' · lote ' || x.lote, '') || ' · ' || array_to_string(partes, ' · '),
              x.barcode, x.loja_id);
  end if;
end $$;
revoke all on function public.telegram_complementar_lote(bigint, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.telegram_complementar_lote(bigint, text, numeric, text, text) to service_role;

-- AUTO-TESTE
do $$
begin
  if to_regprocedure('public.telegram_complementar_lote(bigint,text,numeric,text,text)') is null then raise exception 'complemento: função ausente'; end if;
  if has_function_privilege('anon', 'public.telegram_complementar_lote(bigint,text,numeric,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.telegram_complementar_lote(bigint,text,numeric,text,text)', 'execute') then
    raise exception 'complemento: função aberta demais';
  end if;
  if exists (select 1 from (values ('produtos','pedido_tipo'),('produtos','politica_troca'),('produtos','preco_unitario'),('produtos','subsetor'),('produtos','origem'),('produtos','lancado_por_id'),('produtos','por_peso'),('produtos','cadastrado_por'),('produtos','criado_em'),('produtos','lote'),('produtos','validade'),('produtos','nome'),('produtos','barcode'),('convites_promotor','nome'),('convites_promotor','marca'),('convites_promotor','revogado'),('convites_promotor','pausado'),('convites_promotor','expira_em'),('convites_promotor','loja_id'),('telegram_vinculos','tipo'),('telegram_vinculos','convite_id'),('usuarios','ativo'),('catalogo','politica_troca')) v(t, c)
             where not exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = v.t and k.column_name = v.c)) then
    raise exception 'complemento: faltam colunas (rode supabase-pedido-promocao.sql antes)';
  end if;
  if not has_function_privilege('service_role', 'public.telegram_complementar_lote(bigint,text,numeric,text,text)', 'execute') then raise exception 'complemento: service_role sem permissão'; end if;
  begin perform public.telegram_complementar_lote(-1, 'x', 1, null, null); raise exception 'complemento: aceitou chat sem vínculo';
  exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end;
end $$;

-- Lote REAL no lançamento de validade (app e Telegram). Rode DEPOIS de supabase-telegram-aprovacao.sql. Pode rodar mais de uma vez; tem auto-teste.
-- Antes o "lote" era só a validade (o app agrupava por data). Agora cada lançamento leva o número do lote impresso na embalagem
-- (ou "sem lote", dito de propósito). Lote igual já lançado no produto é barrado (precisa confirmar); lote novo = novo lote do produto.

alter table public.produtos add column if not exists lote text;
alter table public.produtos add column if not exists sem_lote boolean not null default false;
alter table public.aprovacoes_produto add column if not exists lote text;
alter table public.aprovacoes_produto add column if not exists sem_lote boolean not null default false;
create index if not exists produtos_lote_idx on public.produtos (loja_id, barcode, lote);

-- normaliza/valida o lote em qualquer gravação (app ou função): MAIÚSCULAS, 1 a 20 caracteres (letras, números, . / - e espaço)
create or replace function public._produtos_lote_ck() returns trigger language plpgsql as $$
begin
  if new.lote is not null then
    new.lote := nullif(upper(btrim(regexp_replace(new.lote, '\s+', ' ', 'g'))), '');
    if new.lote is not null and new.lote !~ '^[A-Z0-9][A-Z0-9./ -]{0,19}$' then raise exception 'lote_invalido'; end if;
  end if;
  if new.lote is not null then new.sem_lote := false; end if;
  return new;
end $$;
revoke all on function public._produtos_lote_ck() from public, anon, authenticated;
drop trigger if exists trg_produtos_lote on public.produtos;
create trigger trg_produtos_lote before insert or update of lote on public.produtos for each row execute function public._produtos_lote_ck();

-- lancar_validade com lote (parâmetros novos no fim: p_lote, p_sem_lote)
drop function if exists public.lancar_validade(bigint, uuid, text, date, numeric, text, text, text, integer, text, text, uuid, boolean, uuid);
create or replace function public.lancar_validade(p_loja bigint, p_usuario uuid, p_barcode text, p_validade date, p_quantidade numeric,
  p_origem text default 'whatsapp', p_foto text default null, p_obs text default null, p_dias_alerta integer default 15,
  p_tamanho text default null, p_unidade text default null, p_op uuid default null, p_confirmar_duplicado boolean default false,
  p_convite uuid default null, p_lote text default null, p_sem_lote boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare c record; u record; cv record; v_id text; v_existente text; v_qtd numeric; v_nome text; v_por uuid; x record;
  lt text := nullif(upper(btrim(coalesce(p_lote, ''))), '');
begin
  if p_origem not in ('app','whatsapp','telegram') then raise exception 'origem_invalida'; end if;
  if p_convite is not null then
    select * into cv from public.convites_promotor where id = p_convite;
    if not found or cv.revogado or cv.pausado or cv.expira_em <= now() or cv.loja_id is distinct from p_loja then raise exception 'usuario_fora_da_loja'; end if;
    v_nome := 'Promotor ' || cv.nome || ' (' || cv.marca || ')'; v_por := null;
  else
    select id, nome, loja_id, ativo into u from public.usuarios where id = p_usuario;
    if not found or not u.ativo or u.loja_id is distinct from p_loja then raise exception 'usuario_fora_da_loja'; end if;
    v_nome := u.nome; v_por := p_usuario;
  end if;
  if p_op is not null then
    select id into v_existente from public.produtos where whatsapp_op = p_op;
    if v_existente is not null then return v_existente; end if;
  end if;
  select * into c from public.catalogo where barcode = p_barcode and loja_id = p_loja;
  if not found then raise exception 'produto_nao_encontrado'; end if;
  if p_convite is not null then
    if strpos(upper(c.nome), upper(btrim(cv.marca))) = 0 then raise exception 'produto_fora_da_marca'; end if;
  end if;
  if p_validade is null then raise exception 'validade_obrigatoria'; end if;
  if p_validade < current_date then raise exception 'validade_vencida'; end if;
  if p_validade > current_date + interval '10 years' then raise exception 'validade_invalida'; end if;
  if coalesce(c.por_peso, false) then
    if p_quantidade is null or p_quantidade < 0.001 or p_quantidade > 9999 then raise exception 'quantidade_invalida'; end if;
  else
    if p_quantidade is null or p_quantidade < 1 or p_quantidade > 99999 or p_quantidade <> trunc(p_quantidade) then raise exception 'quantidade_invalida'; end if;
  end if;
  v_qtd := p_quantidade;
  if p_dias_alerta is null or p_dias_alerta < 1 or p_dias_alerta > 365 then raise exception 'dias_alerta_invalido'; end if;
  -- lote: número da embalagem (obrigatório, exceto produto por peso) ou "sem lote" dito de propósito
  if lt is not null and lt !~ '^[A-Z0-9][A-Z0-9./ -]{0,19}$' then raise exception 'lote_invalido'; end if;
  if lt is null and not coalesce(p_sem_lote, false) and not coalesce(c.por_peso, false) then raise exception 'lote_obrigatorio'; end if;
  -- lote que já existe: não cria linha nova, SOMA na quantidade (mesma validade; aumento máximo = metade do que já tem, mínimo 10 un)
  if lt is not null and not coalesce(c.por_peso, false) then
    select id, quantidade, validade into x from public.produtos where barcode = p_barcode and loja_id = p_loja and lote = lt order by criado_em limit 1 for update;
    if found then
      if x.validade is distinct from p_validade then raise exception 'lote_validade_diferente'; end if;
      if v_qtd > greatest(10, ceil(x.quantidade * 0.5)) then raise exception 'aumento_excessivo'; end if;
      if x.quantidade + v_qtd > 99999 then raise exception 'quantidade_invalida'; end if;
      update public.produtos set quantidade = quantidade + v_qtd::int where id = x.id;
      insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
        values (v_nome, 'somou quantidade ao lote', c.nome || case p_origem when 'telegram' then ' (via Telegram)' else '' end || ' · lote ' || lt || ' · +' || v_qtd::text || ' (de ' || x.quantidade::text || ' para ' || (x.quantidade + v_qtd)::text || ')', c.barcode, p_loja);
      return x.id;
    end if;
  end if;
  if not p_confirmar_duplicado then
    if lt is null and not coalesce(c.por_peso, false)
       and exists (select 1 from public.produtos where barcode = p_barcode and loja_id = p_loja and validade = p_validade and lote is null) then raise exception 'duplicado'; end if;
  end if;
  v_id := p_barcode || '-' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  insert into public.produtos (id, barcode, nome, setor, subsetor, foto, quantidade, preco_unitario, por_peso, tamanho, unidade_medida,
      observacoes, validade, dias_alerta, criado_em, cadastrado_por, loja_id, familia, origem, lancado_por_id, whatsapp_op, lote, sem_lote)
    values (v_id, c.barcode, c.nome, c.setor, c.subsetor, coalesce(p_foto, c.foto), v_qtd::int, coalesce(c.preco_unitario, 0), coalesce(c.por_peso, false),
      coalesce(nullif(trim(p_tamanho), ''), c.tamanho), coalesce(nullif(trim(p_unidade), ''), c.unidade_medida),
      left(coalesce(p_obs, ''), 300), p_validade, p_dias_alerta, now(), v_nome, p_loja, c.familia, p_origem, v_por, p_op, lt, lt is null and coalesce(p_sem_lote, false));
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (v_nome, 'cadastrou produto', c.nome || case p_origem when 'whatsapp' then ' (via WhatsApp)' when 'telegram' then ' (via Telegram)' else '' end
      || ' · validade ' || to_char(p_validade, 'DD/MM/YYYY') || ' · qtd ' || v_qtd::text || coalesce(' · lote ' || lt, case when p_sem_lote then ' · sem lote' else '' end), c.barcode, p_loja);
  return v_id;
end $$;
revoke all on function public.lancar_validade(bigint, uuid, text, date, numeric, text, text, text, integer, text, text, uuid, boolean, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.lancar_validade(bigint, uuid, text, date, numeric, text, text, text, integer, text, text, uuid, boolean, uuid, text, boolean) to service_role;

-- pedido de produto novo com lote
drop function if exists public.telegram_enviar_aprovacao(bigint, text, text, text, text, date, numeric);
create or replace function public.telegram_enviar_aprovacao(p_chat_id bigint, p_barcode text, p_nome text, p_setor text,
  p_foto text, p_validade date, p_quantidade numeric, p_lote text default null, p_sem_lote boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v record; u record; n int; soma int := 0; i int; novo uuid;
  lt text := nullif(upper(btrim(coalesce(p_lote, ''))), '');
  bc text := regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g');
  nm text := upper(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')));
  setores text[] := array['Hortifruti','Açougue','Padaria','Frios e Laticínios','Mercearia','Bebidas','Congelados','Limpeza','Higiene e Perfumaria','Bazar'];
begin
  select * into v from public.telegram_vinculos where chat_id = p_chat_id;
  if not found or v.tipo <> 'funcionario' then raise exception 'sem_permissao'; end if;
  select id, nome, loja_id, ativo, promotor into u from public.usuarios where id = v.usuario_id;
  if not found or not u.ativo or u.promotor or u.loja_id is distinct from v.loja_id then raise exception 'usuario_fora_da_loja'; end if;

  if length(bc) not in (8, 12, 13, 14) then raise exception 'codigo_invalido'; end if;
  for i in 1 .. length(bc) - 1 loop
    soma := soma + substr(bc, length(bc) - i, 1)::int * case when i % 2 = 1 then 3 else 1 end;
  end loop;
  if (10 - soma % 10) % 10 <> substr(bc, length(bc), 1)::int then raise exception 'codigo_invalido'; end if;
  if length(nm) < 5 or length(nm) > 80 or nm !~ '[A-ZÀ-Ý]{3}' or nm ~ '[<>{}\[\]\\|^`]' then raise exception 'nome_invalido'; end if;
  if not (p_setor = any (setores)) then raise exception 'setor_invalido'; end if;
  if p_foto is not null and (p_foto !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(p_foto) > 450000) then raise exception 'foto_invalida'; end if;
  if p_validade is null then raise exception 'validade_obrigatoria'; end if;
  if p_validade < current_date then raise exception 'validade_vencida'; end if;
  if p_validade > current_date + interval '5 years' then raise exception 'validade_invalida'; end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 5000 or p_quantidade <> trunc(p_quantidade) then raise exception 'quantidade_invalida'; end if;
  if lt is not null and lt !~ '^[A-Z0-9][A-Z0-9./ -]{0,19}$' then raise exception 'lote_invalido'; end if;
  if lt is null and not coalesce(p_sem_lote, false) then raise exception 'lote_obrigatorio'; end if;
  if lt is not null and exists (select 1 from public.produtos where barcode = bc and loja_id = v.loja_id and lote = lt) then raise exception 'lote_ja_lancado'; end if;
  if exists (select 1 from public.catalogo where barcode = bc and loja_id = v.loja_id) then raise exception 'produto_ja_existe'; end if;
  if exists (select 1 from public.aprovacoes_produto where barcode = bc and loja_id = v.loja_id and status = 'pendente') then raise exception 'pendente_ja_existe'; end if;

  -- limites: 15 pedidos/hora por pessoa, 10 pendentes por pessoa, 60 pendentes por loja (o catálogo da loja não enche de lixo)
  select count(*) into n from public.aprovacoes_produto where usuario_id = u.id and criado_em > now() - interval '1 hour';
  if n >= 15 then raise exception 'limite_excedido'; end if;
  select count(*) into n from public.aprovacoes_produto where usuario_id = u.id and status = 'pendente';
  if n >= 10 then raise exception 'muitas_pendencias'; end if;
  select count(*) into n from public.aprovacoes_produto where loja_id = v.loja_id and status = 'pendente';
  if n >= 60 then raise exception 'fila_cheia'; end if;

  insert into public.aprovacoes_produto (loja_id, usuario_id, chat_id, solicitante, barcode, nome, setor, foto, validade, quantidade, lote, sem_lote)
    values (v.loja_id, u.id, p_chat_id, u.nome, bc, nm, p_setor, p_foto, p_validade, p_quantidade, lt, lt is null) returning id into novo;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (u.nome, 'enviou produto novo para aprovação (Telegram)',
            nm || ' · setor ' || p_setor || ' · validade ' || to_char(p_validade, 'DD/MM/YYYY') || ' · qtd ' || p_quantidade::text || ' · ' || coalesce('lote ' || lt, 'sem lote')
            || case when p_foto is null then ' · sem imagem' else ' · com imagem' end, bc, v.loja_id);
  return novo;
end $$;
revoke all on function public.telegram_enviar_aprovacao(bigint, text, text, text, text, date, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.telegram_enviar_aprovacao(bigint, text, text, text, text, date, numeric, text, boolean) to service_role;

-- aprovação passa o lote adiante
create or replace function public.aprovar_produto_novo(p_id uuid, p_nome text, p_setor text, p_foto text default null, p_trocar_foto boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  a record; ap record; foto_final text;
  nm text := upper(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')));
  setores text[] := array['Hortifruti','Açougue','Padaria','Frios e Laticínios','Mercearia','Bebidas','Congelados','Limpeza','Higiene e Perfumaria','Bazar'];
begin
  if auth.uid() is null or coalesce(public.nivel_do_usuario(), 99) > 5 then raise exception 'sem_permissao'; end if;
  select * into a from public.aprovacoes_produto where id = p_id for update;
  if not found then raise exception 'nao_encontrado'; end if;
  if not public.loja_ok(a.loja_id) then raise exception 'sem_permissao'; end if;
  if a.status <> 'pendente' then raise exception 'ja_decidido'; end if;
  if length(nm) < 5 or length(nm) > 80 or nm !~ '[A-ZÀ-Ý]{3}' or nm ~ '[<>{}\[\]\\|^`]' then raise exception 'nome_invalido'; end if;
  if not (p_setor = any (setores)) then raise exception 'setor_invalido'; end if;
  foto_final := case when p_trocar_foto then p_foto else a.foto end;
  if foto_final is not null and (foto_final !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(foto_final) > 450000) then raise exception 'foto_invalida'; end if;
  select id, nome into ap from public.usuarios where id = auth.uid();

  if not exists (select 1 from public.catalogo where barcode = a.barcode and loja_id = a.loja_id) then
    insert into public.catalogo (barcode, loja_id, nome, setor, foto, por_peso, cadastrar_estoque)
      values (a.barcode, a.loja_id, nm, p_setor, foto_final, false, false);
    insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
      values (a.solicitante, 'cadastrou produto novo via Telegram', nm || ' · setor ' || p_setor || ' · aprovado por ' || coalesce(ap.nome, '—'), a.barcode, a.loja_id);
  end if;
  -- lança a validade de quem pediu (mesma regra do app; se a data já venceu, dá erro e nada é gravado)
  perform public.lancar_validade(a.loja_id, a.usuario_id, a.barcode, a.validade, a.quantidade, 'telegram', null,
                                 'Via Telegram · aprovado por ' || coalesce(ap.nome, '—'), 15, null, null, a.op, true, null, a.lote, a.sem_lote);
  update public.aprovacoes_produto set status = 'aprovado', nome = nm, setor = p_setor, foto = foto_final,
         decidido_por = coalesce(ap.nome, '—'), decidido_por_id = auth.uid(), decidido_em = now() where id = a.id;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (coalesce(ap.nome, '—'), 'aprovou produto novo (Telegram)', nm || ' · pedido de ' || a.solicitante, a.barcode, a.loja_id);
end $$;
revoke all on function public.aprovar_produto_novo(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.aprovar_produto_novo(uuid, text, text, text, boolean) to authenticated;

-- auto-teste
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'produtos' and column_name = 'lote') then raise exception 'auto-teste: coluna lote nao existe'; end if;
  begin perform public.telegram_enviar_aprovacao(-1, '7891000100103', 'TESTE PRODUTO', 'Mercearia', null, current_date + 10, 3, 'L123', false); raise exception 'deveria barrar';
  exception when others then if sqlerrm <> 'sem_permissao' then raise exception 'auto-teste 1: %', sqlerrm; end if; end;
  begin perform public.aprovar_produto_novo(gen_random_uuid(), 'TESTE PRODUTO', 'Mercearia'); raise exception 'deveria barrar';
  exception when others then if sqlerrm <> 'sem_permissao' then raise exception 'auto-teste 2: %', sqlerrm; end if; end;
  begin perform public.lancar_validade(1, gen_random_uuid(), '0', current_date + 5, 1, 'telegram', null, null, 15, null, null, null, false, null, '!!', false); raise exception 'deveria barrar';
  exception when others then if sqlerrm not in ('usuario_fora_da_loja', 'lote_invalido') then raise exception 'auto-teste 3: %', sqlerrm; end if; end;
end $$;

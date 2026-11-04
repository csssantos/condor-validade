-- APROVAÇÃO DE PRODUTO NOVO: preço, gramagem e subcategoria OBRIGATÓRIOS (2026-11-04, pedido do dono)
-- Rodar ANTES de publicar o app. Troca a função aprovar_produto_novo (a assinatura antiga é apagada: quem aprova precisa informar os 3 campos).
-- Valida tudo no servidor: preço 0,01–5000, gramagem > 0 com unidade G/KG/ML/L, subcategoria preenchida.
-- A gramagem vai também para o lançamento da validade; preço, gramagem e subcategoria entram no catálogo.

drop function if exists public.aprovar_produto_novo(uuid, text, text, text, boolean);

create or replace function public.aprovar_produto_novo(
  p_id uuid, p_nome text, p_setor text, p_foto text, p_trocar_foto boolean,
  p_tamanho text, p_unidade text, p_preco numeric, p_subsetor text)
returns void language plpgsql security definer set search_path = public as $$
declare
  a record; ap record; foto_final text; tam text; uni text; sub text; preco numeric;
  nm text := upper(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')));
  subs_padrao jsonb := '{"Mercearia":["Seca leve","Seca pesada","Seca doce","Seca salgada","Saudáveis","Bolachas","Perfumaria"],"Hortifruti":["Frutas","Verduras","Legumes","Ovos"],"Açougue":["Bovinos","Suínos","Aves","Linguiças e embutidos"],"Padaria":["Pães","Bolos e doces","Salgados"],"Frios e Laticínios":["Queijos","Frios fatiados","Iogurtes e leites","Manteiga e margarina"],"Bebidas":["Refrigerantes","Sucos","Águas","Cervejas e vinhos"],"Congelados":["Pratos prontos","Sorvetes","Carnes congeladas"],"Limpeza":["Roupas","Casa","Cozinha"],"Higiene e Perfumaria":["Cabelo","Corpo","Higiene bucal"],"Bazar":["Utilidades","Papelaria"]}'::jsonb;
  setores text[] := array['Hortifruti','Açougue','Padaria','Frios e Laticínios','Mercearia','Bebidas','Congelados','Limpeza','Higiene e Perfumaria','Bazar'];
begin
  if auth.uid() is null or coalesce(public.nivel_do_usuario(), 99) > 5 then raise exception 'sem_permissao'; end if;
  select * into a from public.aprovacoes_produto where id = p_id for update;
  if not found then raise exception 'nao_encontrado'; end if;
  if not public.loja_ok(a.loja_id) then raise exception 'sem_permissao'; end if;
  if a.status <> 'pendente' then raise exception 'ja_decidido'; end if;
  -- encarregado (nível 5) com setor definido só decide pedidos do próprio setor e não move o produto para outro
  if not public._setor_ok(a.setor) then raise exception 'sem_permissao'; end if;
  if length(nm) < 5 or length(nm) > 80 or nm !~ '[A-ZÀ-Ý]{3}' or nm ~ '[<>{}\[\]\\|^`]' then raise exception 'nome_invalido'; end if;
  if p_setor is null or not (p_setor = any (setores)) then raise exception 'setor_invalido'; end if;
  if not public._setor_ok(p_setor) then raise exception 'sem_permissao'; end if;
  -- campos obrigatórios
  tam := replace(btrim(coalesce(p_tamanho, '')), ',', '.');
  uni := upper(btrim(coalesce(p_unidade, '')));
  if tam !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' or tam ~ '^[0-9]{1,3}\.[0-9]{3}$' then raise exception 'gramagem_invalida'; end if;
  if tam::numeric < 0.01 or tam::numeric > 100000 then raise exception 'gramagem_invalida'; end if;
  tam := trim_scale(tam::numeric)::text;
  if uni not in ('G','KG','ML','L') then raise exception 'unidade_invalida'; end if;
  if p_preco is null or p_preco < 0.01 or p_preco > 5000 then raise exception 'preco_invalido'; end if;
  preco := round(p_preco, 2);
  if preco is null or preco < 0.01 or preco > 5000 then raise exception 'preco_invalido'; end if;
  sub := nullif(btrim(coalesce(p_subsetor, '')), '');
  if sub is null or length(sub) > 40 or sub !~ '^[A-Za-zÀ-ÿ0-9 ,.&/()-]+$' then raise exception 'subsetor_invalido'; end if;
  -- subcategoria precisa existir para o setor (lista padrão do app + as criadas pela loja)
  if not (coalesce((subs_padrao -> p_setor) ? sub, false)
          or exists (select 1 from public.subsetores_customizados sc where sc.loja_id = a.loja_id and sc.setor = p_setor and sc.nome = sub)) then
    raise exception 'subsetor_invalido';
  end if;
  foto_final := case when p_trocar_foto then p_foto else a.foto end;
  if foto_final is not null and (foto_final !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(foto_final) > 450000) then raise exception 'foto_invalida'; end if;
  select id, nome into ap from public.usuarios where id = auth.uid();

  if not exists (select 1 from public.catalogo where barcode = a.barcode and loja_id = a.loja_id) then
    insert into public.catalogo (barcode, loja_id, nome, setor, subsetor, tamanho, unidade_medida, preco_unitario, foto, por_peso, cadastrar_estoque)
      values (a.barcode, a.loja_id, nm, p_setor, sub, tam, uni, preco, foto_final, false, false);
    insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
      values (a.solicitante, 'cadastrou produto novo via Telegram', nm || ' · setor ' || p_setor || ' · ' || sub || ' · ' || tam || ' ' || uni || ' · R$ ' || replace(to_char(preco, 'FM9990.00'), '.', ',') || ' · aprovado por ' || coalesce(ap.nome, '—'), a.barcode, a.loja_id);
  else
    -- o código entrou no catálogo enquanto o pedido esperava: completa só o que estiver vazio e registra
    update public.catalogo set subsetor = coalesce(nullif(subsetor, ''), sub), tamanho = coalesce(nullif(tamanho, ''), tam),
           unidade_medida = coalesce(nullif(unidade_medida, ''), uni), preco_unitario = coalesce(preco_unitario, preco)
     where barcode = a.barcode and loja_id = a.loja_id;
    insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
      values (coalesce(ap.nome, '—'), 'aprovou produto novo (Telegram)', 'catálogo já tinha esse código: só campos vazios foram completados', a.barcode, a.loja_id);
  end if;
  perform public.lancar_validade(a.loja_id, a.usuario_id, a.barcode, a.validade, a.quantidade, 'telegram', null,
                                 'Via Telegram · aprovado por ' || coalesce(ap.nome, '—'), 15, tam, uni, a.op, true, null, a.lote, a.sem_lote);
  update public.aprovacoes_produto set status = 'aprovado', nome = nm, setor = p_setor, foto = foto_final,
         decidido_por = coalesce(ap.nome, '—'), decidido_por_id = auth.uid(), decidido_em = now() where id = a.id;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (coalesce(ap.nome, '—'), 'aprovou produto novo (Telegram)', nm || ' · pedido de ' || a.solicitante || ' · ' || sub || ' · ' || tam || ' ' || uni || ' · R$ ' || replace(to_char(preco, 'FM9990.00'), '.', ','), a.barcode, a.loja_id);
end $$;

revoke all on function public.aprovar_produto_novo(uuid, text, text, text, boolean, text, text, numeric, text) from public, anon;
grant execute on function public.aprovar_produto_novo(uuid, text, text, text, boolean, text, text, numeric, text) to authenticated;

-- AUTO-TESTE
do $$
begin
  if to_regprocedure('public.aprovar_produto_novo(uuid,text,text,text,boolean,text,text,numeric,text)') is null then raise exception 'aprovacao: função nova ausente'; end if;
  if to_regprocedure('public.aprovar_produto_novo(uuid,text,text,text,boolean)') is not null then raise exception 'aprovacao: assinatura antiga ainda existe'; end if;
  if has_function_privilege('anon', 'public.aprovar_produto_novo(uuid,text,text,text,boolean,text,text,numeric,text)', 'execute') then raise exception 'aprovacao: anon pode executar'; end if;
  if exists (select 1 from (values ('catalogo','subsetor'),('catalogo','tamanho'),('catalogo','unidade_medida'),('catalogo','preco_unitario')) v(t, c)
             where not exists (select 1 from information_schema.columns k where k.table_schema='public' and k.table_name=v.t and k.column_name=v.c)) then
    raise exception 'aprovacao: faltam colunas no catálogo';
  end if;
end $$;

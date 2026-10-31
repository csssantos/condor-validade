-- Telegram: cadastro de PRODUTO NOVO pelo bot (código de barras + imagem da internet confirmada pelo funcionário).
-- Regras no banco (não só no bot): só funcionário vinculado e ativo; EAN válido; nome limpo; setor da lista; imagem pequena;
-- não duplica produto; limite por hora; tudo vai para a auditoria. Também ajusta as ações permitidas de auditoria do bot.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez. Tem auto-teste.

-- 1) Ações de auditoria do bot (lista fixa; sai "enviou foto", o bot não recebe mais fotos)
create or replace function public.telegram_auditar(p_chat_id bigint, p_acao text, p_detalhe text default null, p_barcode text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if p_acao not in (
    'desvinculou o Telegram (/sair)', 'cancelou lançamento no Telegram', 'confirmou lançamento duplicado no Telegram',
    'lançamento barrado no Telegram', 'dado barrado no Telegram', 'consultou produto na internet (Open Food Facts)'
  ) then raise exception 'acao_invalida'; end if;
  select nome, loja_id into v from public.telegram_vinculos where chat_id = p_chat_id;
  if not found then return; end if;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (v.nome, p_acao, left(coalesce(p_detalhe, ''), 300), nullif(left(coalesce(p_barcode, ''), 20), ''), v.loja_id);
end $$;
revoke all on function public.telegram_auditar(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.telegram_auditar(bigint, text, text, text) to service_role;

-- 2) Criar produto novo no catálogo da loja
create or replace function public.telegram_criar_produto(p_chat_id bigint, p_barcode text, p_nome text, p_setor text, p_foto text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v record; u record; n int; soma int := 0; i int; dig int[];
  bc text := regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g');
  nm text := upper(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')));
  setores text[] := array['Hortifruti','Açougue','Padaria','Frios e Laticínios','Mercearia','Bebidas','Congelados','Limpeza','Higiene e Perfumaria','Bazar'];
begin
  select * into v from public.telegram_vinculos where chat_id = p_chat_id;
  if not found or v.tipo <> 'funcionario' then raise exception 'sem_permissao'; end if;   -- promotor não cria produto
  select id, nome, loja_id, ativo, promotor into u from public.usuarios where id = v.usuario_id;
  if not found or not u.ativo or u.promotor or u.loja_id is distinct from v.loja_id then raise exception 'usuario_fora_da_loja'; end if;

  -- código de barras válido (EAN-8/12/13/14 com dígito verificador)
  if length(bc) not in (8, 12, 13, 14) then raise exception 'codigo_invalido'; end if;
  for i in 1 .. length(bc) - 1 loop
    soma := soma + substr(bc, length(bc) - i, 1)::int * case when i % 2 = 1 then 3 else 1 end;
  end loop;
  if (10 - soma % 10) % 10 <> substr(bc, length(bc), 1)::int then raise exception 'codigo_invalido'; end if;

  -- nome: 5 a 80 caracteres, com letras, sem símbolos estranhos; sempre em MAIÚSCULAS (padrão do cadastro)
  if length(nm) < 5 or length(nm) > 80 or nm !~ '[A-ZÀ-Ý]{3}' or nm ~ '[<>{}\[\]\\|^`]' then raise exception 'nome_invalido'; end if;
  if not (p_setor = any (setores)) then raise exception 'setor_invalido'; end if;
  -- imagem (opcional): data URL pequena (a imagem vem da internet, o bot a reduz antes)
  if p_foto is not null and (p_foto !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(p_foto) > 450000) then raise exception 'foto_invalida'; end if;
  if exists (select 1 from public.catalogo where barcode = bc and loja_id = v.loja_id) then raise exception 'produto_ja_existe'; end if;

  -- limite: no máximo 15 produtos novos por hora por pessoa
  select count(*) into n from public.auditoria
    where acao = 'cadastrou produto novo via Telegram' and usuario = u.nome and loja_id = v.loja_id and criado_em > now() - interval '1 hour';
  if n >= 15 then raise exception 'limite_excedido'; end if;

  insert into public.catalogo (barcode, loja_id, nome, setor, foto, por_peso, cadastrar_estoque)
    values (bc, v.loja_id, nm, p_setor, p_foto, false, false);
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (u.nome, 'cadastrou produto novo via Telegram',
            nm || case when p_foto is null then ' (sem imagem)' else ' (imagem da internet confirmada)' end || ' · setor ' || p_setor, bc, v.loja_id);
end $$;
revoke all on function public.telegram_criar_produto(bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.telegram_criar_produto(bigint, text, text, text, text) to service_role;

-- auto-teste: a função existe e barra quem não está vinculado
do $$
begin
  begin
    perform public.telegram_criar_produto(-1, '7891000100103', 'TESTE PRODUTO', 'Mercearia', null);
    raise exception 'auto-teste: deveria barrar chat sem vinculo';
  exception when others then
    if sqlerrm <> 'sem_permissao' then raise exception 'auto-teste falhou: %', sqlerrm; end if;
  end;
end $$;

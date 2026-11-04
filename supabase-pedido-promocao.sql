-- PEDIDO DE PROMOÇÃO / PREÇO DIRETO (2026-11-04, pedido do dono)
-- Rodar DEPOIS de supabase-permissoes.sql. Tem auto-teste no final (se falhar, nada é aplicado).
-- Controle: por mais perto que o produto esteja da validade, fica registrado que alguém PEDIU promoção ou
-- preço direto, com o número da campanha (opcional). Só quem gere o setor do produto (ou quem lançou) registra.

alter table public.produtos
  add column if not exists pedido_tipo text,
  add column if not exists pedido_campanha text,
  add column if not exists pedido_em timestamptz,
  add column if not exists pedido_por text;

alter table public.produtos drop constraint if exists produtos_pedido_tipo_ck;
alter table public.produtos add constraint produtos_pedido_tipo_ck
  check (pedido_tipo is null or pedido_tipo in ('promocao', 'preco_direto'));
alter table public.produtos drop constraint if exists produtos_pedido_coerente_ck;
alter table public.produtos add constraint produtos_pedido_coerente_ck
  check ((pedido_tipo is null) = (pedido_em is null) and (pedido_tipo is null) = (pedido_por is null));
alter table public.produtos drop constraint if exists produtos_pedido_campanha_ck;
alter table public.produtos add constraint produtos_pedido_campanha_ck
  check (pedido_campanha is null or (pedido_tipo is not null and pedido_campanha ~ '^[A-Z0-9./ -]{1,20}$'));

-- Os campos do pedido só mudam pela função abaixo (ninguém grava direto pela API, nem falsifica quem pediu).
create or replace function public._produtos_pedido_ck() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is null or coalesce(current_setting('app.via_rpc', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' and new.validade is distinct from old.validade then
    -- o pedido valia para a validade antiga: trocou a data, o pedido precisa ser feito de novo
    new.pedido_tipo := null; new.pedido_campanha := null; new.pedido_em := null; new.pedido_por := null;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.pedido_tipo is not null or new.pedido_campanha is not null or new.pedido_em is not null or new.pedido_por is not null then
      raise exception 'pedido_so_pela_funcao';
    end if;
  elsif new.pedido_tipo is distinct from old.pedido_tipo or new.pedido_campanha is distinct from old.pedido_campanha
     or new.pedido_em is distinct from old.pedido_em or new.pedido_por is distinct from old.pedido_por then
    raise exception 'pedido_so_pela_funcao';
  end if;
  return new;
end $f$;
revoke all on function public._produtos_pedido_ck() from public, anon, authenticated;
drop trigger if exists trg_b_pedido_ck on public.produtos;
create trigger trg_b_pedido_ck before insert or update on public.produtos
  for each row execute function public._produtos_pedido_ck();

-- p_tipo: 'promocao' | 'preco_direto' | null (remove o pedido). p_campanha: opcional, 1–20 (A-Z 0-9 . / - espaço).
create or replace function public.registrar_pedido_promocao(p_id text, p_tipo text, p_campanha text default null)
returns void language plpgsql security definer set search_path = public as $$
declare x record; camp text; quem text; nivel int; rotulo text;
begin
  if auth.uid() is null then raise exception 'sem_permissao'; end if;
  nivel := public.nivel_do_usuario();
  if nivel is null or nivel > 6 then raise exception 'sem_permissao'; end if; -- promotor (7) não pede promoção
  perform public.rl_checar('pedido_promocao', 60);
  if p_tipo is not null and p_tipo not in ('promocao', 'preco_direto') then raise exception 'pedido_promocao_invalido'; end if;
  camp := nullif(upper(btrim(coalesce(p_campanha, ''))), '');
  if p_tipo is null then camp := null; end if;
  if camp is not null and camp !~ '^[A-Z0-9./ -]{1,20}$' then raise exception 'campanha_invalida'; end if;
  select id, nome, barcode, lote, validade, loja_id, setor, lancado_por_id, cadastrado_por, pedido_tipo, pedido_campanha
    into x from public.produtos where id = p_id for update;
  if not found or not public.loja_ok(x.loja_id) then raise exception 'produto_nao_encontrado'; end if;
  if not (public._setor_ok(x.setor) or public._eh_autor(x.lancado_por_id, x.cadastrado_por)) then raise exception 'editar_exige_autor'; end if;
  -- nada mudou (ou nada a remover): não regrava, não troca quem pediu e não suja a auditoria
  if p_tipo is not distinct from x.pedido_tipo and camp is not distinct from x.pedido_campanha then return; end if;
  -- mexer em pedido que já existe (alterar/remover) é de quem gere o setor; o autor do lote só registra o primeiro
  if x.pedido_tipo is not null and not public._setor_ok(x.setor) then raise exception 'editar_exige_encarregado'; end if;
  quem := coalesce(public.nome_do_usuario(), 'Usuário');
  perform set_config('app.via_rpc', '1', true);
  update public.produtos
     set pedido_tipo = p_tipo, pedido_campanha = camp,
         pedido_em = case when p_tipo is null then null else now() end,
         pedido_por = case when p_tipo is null then null else quem end
   where id = p_id;
  perform set_config('app.via_rpc', '', true);
  rotulo := case coalesce(p_tipo, x.pedido_tipo) when 'preco_direto' then 'preço direto' else 'promoção' end;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (quem,
            case when p_tipo is null then 'removeu pedido de ' || rotulo
                 when x.pedido_tipo is null then 'registrou pedido de ' || rotulo
                 else 'alterou pedido de ' || rotulo end,
            coalesce(x.nome, '') || ' · validade ' || coalesce(to_char(x.validade, 'DD/MM/YYYY'), '?') || coalesce(' · lote ' || x.lote, '')
              || coalesce(' · campanha ' || coalesce(camp, x.pedido_campanha), '')
              || case when x.pedido_tipo is not null and p_tipo is not null then ' (antes: ' || x.pedido_tipo || coalesce(' ' || x.pedido_campanha, '') || ')' else '' end,
            x.barcode, x.loja_id);
end $$;
revoke all on function public.registrar_pedido_promocao(text, text, text) from public, anon;
grant execute on function public.registrar_pedido_promocao(text, text, text) to authenticated;

-- AUTO-TESTE
do $$
declare f text;
begin
  foreach f in array array['_setor_ok(text)', '_eh_autor(uuid,text)', 'nome_do_usuario()', 'nivel_do_usuario()', 'loja_ok(bigint)', 'rl_checar(text,integer)'] loop
    if to_regprocedure('public.' || f) is null then raise exception 'pedido: falta % (rode supabase-permissoes.sql antes)', f; end if;
  end loop;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'produtos' and column_name = 'pedido_campanha') then
    raise exception 'pedido: colunas ausentes';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname = 'trg_b_pedido_ck') then
    raise exception 'pedido: trigger ausente';
  end if;
  if has_function_privilege('anon', 'public.registrar_pedido_promocao(text,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.registrar_pedido_promocao(text,text,text)', 'execute') then
    raise exception 'pedido: permissao da funcao';
  end if;
  if has_function_privilege('authenticated', 'public._produtos_pedido_ck()', 'execute') then raise exception 'pedido: funcao interna aberta'; end if;
end $$;

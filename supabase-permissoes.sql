-- PERMISSÕES POR CARGO E SETOR (2026-11-03)
-- Baixa, exclusão e edição:
--   nível <=4 (gerência/diretoria/dev): tudo.
--   nível 5 (encarregado): só produtos do SEU setor (usuarios.setor vazio = todos os setores).
--   nível >=6 (funcionário) e 7 (promotor): lançam e editam SÓ o que eles mesmos lançaram; sem baixa e sem exclusão.
-- Telegram/serviço (auth.uid() nulo) e RPCs internas (app.via_rpc / app.via_baixa) ficam fora.
-- Rodar DEPOIS de supabase-promotor-marcas.sql. Tem auto-teste de existência no final.

create or replace function public._norm_setor(p text)
returns text language sql immutable set search_path = public as $$
  select lower(btrim(regexp_replace(translate(coalesce(p, ''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '[\s\u00a0]+', ' ', 'g')));
$$;

-- nível 5 sem setor cadastrado = encarregado geral (ex.: Encarregado de Reposição): vale para todos os setores
create or replace function public._setor_ok(p_setor text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare nv int; s text; d text;
begin
  if auth.uid() is null then return true; end if;
  nv := coalesce(public.nivel_do_usuario(), 99);
  if nv <= 4 then return true; end if;
  if nv <> 5 then return false; end if;
  select public._norm_setor(setor) into s from public.usuarios where id = auth.uid();
  if s is null or s = '' then return true; end if;
  d := public._norm_setor(p_setor);
  return d = s or left(d, length(s) + 1) = s || ' ' or left(s, length(d) + 1) = d || ' ';
end $$;

-- autor: pelo id; produto antigo (sem id) pelo nome gravado ("Nome" ou "Nome - CARGO")
create or replace function public._eh_autor(p_id uuid, p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_id = auth.uid()
      or (p_id is null and public.nome_do_usuario() is not null
          and (p_nome = public.nome_do_usuario() or left(p_nome, length(public.nome_do_usuario()) + 3) = public.nome_do_usuario() || ' - ')), false);
$$;

-- BAIXA (RPC)
create or replace function public.dar_baixa(p_id text, p_motivo text, p_qtd numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare x record; v_q numeric; m text := btrim(coalesce(p_motivo, ''));
begin
  if auth.uid() is null or public.nivel_do_usuario() is null then raise exception 'sem_permissao'; end if;
  perform public.rl_checar('dar_baixa', 120);
  if length(m) < 2 or length(m) > 80 then raise exception 'motivo_invalido'; end if;
  select * into x from public.produtos where id = p_id for update;
  if not found or not public.loja_ok(x.loja_id) then raise exception 'produto_nao_encontrado'; end if;
  if not public._setor_ok(x.setor) then raise exception 'baixa_exige_encarregado'; end if;
  v_q := coalesce(p_qtd, x.quantidade);
  if v_q > x.quantidade or v_q < (case when coalesce(x.por_peso, false) then 0.001 else 1 end) or (not coalesce(x.por_peso, false) and v_q <> trunc(v_q)) then raise exception 'quantidade_invalida'; end if;
  perform set_config('app.via_baixa', '1', true);
  insert into public.historico (barcode, nome, setor, foto, quantidade, quantidade_medida, preco_unitario, validade, motivo, vencido_antes, loja_id, por_peso, lote, sem_lote)
  values (x.barcode, x.nome, x.setor, x.foto, greatest(1, round(v_q))::int, case when coalesce(x.por_peso, false) then v_q else null end, coalesce(x.preco_unitario, 0), x.validade, m, x.validade < public.hoje_br(), x.loja_id, coalesce(x.por_peso, false), x.lote, coalesce(x.sem_lote, false));
  delete from public.produtos where id = p_id;
  perform set_config('app.via_baixa', '', true);
end $$;

-- HISTÓRICO direto (baixa fora da RPC): mesma regra
create or replace function public._historico_quem()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if coalesce(current_setting('app.via_baixa', true), '') <> '1' then
      -- o setor informado pelo cliente não basta: vale também o setor real do produto (mesmo código de barras, mesma loja)
      if not public._setor_ok(new.setor)
         or exists (select 1 from public.produtos p where p.barcode = new.barcode and p.loja_id = new.loja_id and not public._setor_ok(p.setor)) then
        raise exception 'baixa_exige_encarregado';
      end if;
    end if;
    new.registrado_por_id := auth.uid();
    new.registrado_por := coalesce(public.nome_do_usuario(), new.registrado_por);
    if new.data_baixa is null or new.data_baixa > now() then new.data_baixa := now(); end if;
  end if;
  return new;
end $$;

-- EXCLUSÃO
create or replace function public._produtos_del_ck()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return old; end if;
  if coalesce(current_setting('app.via_baixa', true), '') = '1' then return old; end if;
  perform public.rl_checar('produtos_del', 60);
  if public._setor_ok(old.setor) then return old; end if;
  raise exception 'excluir_exige_encarregado';
end $$;

-- EDIÇÃO (UPDATE e upsert que cai em linha existente)
create or replace function public._produtos_perm()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record; nv int;
begin
  if auth.uid() is null then return new; end if;
  if coalesce(current_setting('app.via_rpc', true), '') = '1' then return new; end if;
  nv := coalesce(public.nivel_do_usuario(), 99);
  if nv <= 4 then return new; end if;
  if tg_op = 'UPDATE' then o := old;
  else
    select * into o from (select id, setor, lancado_por_id, cadastrado_por from public.produtos where id = new.id) q;
    if not found then return new; end if; -- lançamento novo
  end if;
  if nv = 5 then
    if public._setor_ok(o.setor) and public._setor_ok(new.setor) then return new; end if;
    raise exception 'editar_exige_encarregado';
  end if;
  if public._eh_autor(o.lancado_por_id, o.cadastrado_por) then return new; end if;
  raise exception 'editar_exige_autor';
end $$;

drop trigger if exists trg_produtos_perm_upd on public.produtos;
drop trigger if exists trg_produtos_perm_ins on public.produtos;
drop trigger if exists trg_a_perm_upd on public.produtos;
drop trigger if exists trg_a_perm_ins on public.produtos;
create trigger trg_a_perm_upd before update on public.produtos for each row execute function public._produtos_perm();
create trigger trg_a_perm_ins before insert on public.produtos for each row execute function public._produtos_perm();

-- SOMAR AO LOTE: soma é "editar" a quantidade; só autor ou quem gere o setor
create or replace function public.somar_ao_lote(p_id text, p_qtd integer)
returns integer language plpgsql security definer set search_path = public as $$
declare x record; nova int;
begin
  if auth.uid() is null or public.nivel_do_usuario() is null then raise exception 'sem_permissao'; end if;
  perform public.rl_checar('somar_lote', 60);
  if p_qtd is null or p_qtd < 1 or p_qtd > 99999 then raise exception 'quantidade_invalida'; end if;
  select id, nome, barcode, lote, quantidade, loja_id, por_peso, setor, lancado_por_id, cadastrado_por into x from public.produtos where id = p_id for update;
  if not found or not public.loja_ok(x.loja_id) then raise exception 'produto_nao_encontrado'; end if;
  if not (public._setor_ok(x.setor) or public._eh_autor(x.lancado_por_id, x.cadastrado_por)) then raise exception 'editar_exige_autor'; end if;
  if x.lote is null or coalesce(x.por_peso, false) then raise exception 'lote_obrigatorio'; end if;
  if p_qtd > greatest(10, ceil(x.quantidade * 0.5)) then raise exception 'aumento_excessivo'; end if;
  nova := x.quantidade + p_qtd;
  if nova > 99999 then raise exception 'quantidade_invalida'; end if;
  perform set_config('app.via_rpc', '1', true);
  update public.produtos set quantidade = nova, atualizado_por = public.nome_do_usuario() where id = p_id;
  perform set_config('app.via_rpc', '', true);
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (public.nome_do_usuario(), 'somou quantidade ao lote', x.nome || ' · lote ' || x.lote || ' · +' || p_qtd::text || ' (de ' || x.quantidade::text || ' para ' || nova::text || ')', x.barcode, x.loja_id);
  return nova;
end $$;
revoke all on function public.somar_ao_lote(text, integer) from public, anon;
grant execute on function public.somar_ao_lote(text, integer) to authenticated;

revoke all on function public._norm_setor(text), public._setor_ok(text), public._eh_autor(uuid, text), public._produtos_perm() from public, anon, authenticated;

-- AUTO-TESTE (se reaplicar blindagem/revisao depois, estas funções voltam ao antigo: rode este arquivo de novo)
do $$
declare d text;
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_a_perm_upd') or not exists (select 1 from pg_trigger where tgname = 'trg_a_perm_ins') then
    raise exception 'permissoes: triggers ausentes';
  end if;
  for d in select pg_get_functiondef(p) from unnest(array['public.dar_baixa(text,text,numeric)'::regprocedure, 'public._historico_quem()'::regprocedure]) p loop
    if position('baixa_exige_encarregado' in d) = 0 then raise exception 'permissoes: baixa sem trava'; end if;
  end loop;
  if position('_setor_ok' in pg_get_functiondef('public._produtos_del_ck()'::regprocedure)) = 0 then raise exception 'permissoes: exclusao sem trava'; end if;
  if position('_eh_autor' in pg_get_functiondef('public.somar_ao_lote(text,integer)'::regprocedure)) = 0 then raise exception 'permissoes: somar_ao_lote sem trava'; end if;
  if (select count(*) from pg_trigger t where t.tgrelid = 'public.produtos'::regclass and t.tgname in ('trg_a_perm_upd','trg_a_perm_ins') and t.tgfoid = 'public._produtos_perm()'::regprocedure) <> 2 then raise exception 'permissoes: triggers de permissao nao apontam para _produtos_perm'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname in ('trg_produtos_perm_upd','trg_produtos_perm_ins')) then raise exception 'permissoes: triggers antigos'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname = 'trg_produtos_del' and tgfoid = 'public._produtos_del_ck()'::regprocedure)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.historico'::regclass and tgname = 'trg_historico_quem' and tgfoid = 'public._historico_quem()'::regprocedure) then
    raise exception 'permissoes: triggers de exclusao/historico ausentes';
  end if;
  if 'trg_a_perm_upd' > 'trg_produtos_blindagem' then raise exception 'permissoes: ordem dos triggers'; end if;
  if public._norm_setor('  Laticínios   Á ') <> 'laticinios a' then raise exception 'permissoes: _norm_setor'; end if;
  if has_function_privilege('authenticated', 'public._produtos_perm()', 'execute') or has_function_privilege('anon', 'public._setor_ok(text)', 'execute') then raise exception 'permissoes: funcoes internas abertas'; end if;
end $$;

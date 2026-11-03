-- PERMISSÕES POR CARGO E SETOR (2026-11-03)
-- Baixa, exclusão e edição:
--   nível <=4 (gerência/diretoria/dev): tudo.
--   nível 5 (encarregado): só produtos do SEU setor (usuarios.setor vazio = todos os setores).
--   nível >=6 (funcionário) e 7 (promotor): lançam e editam SÓ o que eles mesmos lançaram; sem baixa e sem exclusão.
-- Telegram/serviço (auth.uid() nulo) e RPCs internas (app.via_rpc / app.via_baixa) ficam fora.
-- Rodar DEPOIS de supabase-promotor-marcas.sql. Tem auto-teste de existência no final.

create or replace function public._setor_ok(p_setor text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare nv int; s text;
begin
  if auth.uid() is null then return true; end if;
  nv := coalesce(public.nivel_do_usuario(), 99);
  if nv <= 4 then return true; end if;
  if nv <> 5 then return false; end if;
  select nullif(btrim(setor), '') into s from public.usuarios where id = auth.uid();
  if s is null then return true; end if;
  return lower(btrim(coalesce(p_setor, ''))) = lower(s);
end $$;

create or replace function public._eh_autor(p_id uuid, p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_id = auth.uid()
      or (p_id is null and public.nome_do_usuario() is not null and p_nome = public.nome_do_usuario());
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
    if coalesce(current_setting('app.via_baixa', true), '') <> '1' and not public._setor_ok(new.setor) then
      raise exception 'baixa_exige_encarregado';
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
  if coalesce(current_setting('app.via_rpc', true), '') = '1' or coalesce(current_setting('app.via_baixa', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then o := old;
  else
    select * into o from public.produtos where id = new.id;
    if not found then return new; end if; -- lançamento novo
  end if;
  nv := coalesce(public.nivel_do_usuario(), 99);
  if nv <= 4 then return new; end if;
  if nv = 5 then
    if public._setor_ok(o.setor) and public._setor_ok(new.setor) then return new; end if;
    raise exception 'editar_exige_encarregado';
  end if;
  if public._eh_autor(o.lancado_por_id, o.cadastrado_por) then return new; end if;
  raise exception 'editar_exige_autor';
end $$;

drop trigger if exists trg_produtos_perm_upd on public.produtos;
create trigger trg_produtos_perm_upd before update on public.produtos for each row execute function public._produtos_perm();
drop trigger if exists trg_produtos_perm_ins on public.produtos;
create trigger trg_produtos_perm_ins before insert on public.produtos for each row execute function public._produtos_perm();

revoke all on function public._setor_ok(text), public._eh_autor(uuid, text), public._produtos_perm() from public, anon;
grant execute on function public._setor_ok(text) to authenticated;

-- AUTO-TESTE
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_produtos_perm_upd')
     or not exists (select 1 from pg_trigger where tgname = 'trg_produtos_perm_ins')
     or to_regprocedure('public._setor_ok(text)') is null then
    raise exception 'permissoes: instalação incompleta';
  end if;
end $$;

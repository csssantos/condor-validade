-- Blindagem de produtos no SERVIDOR (item 1 da lista "pode esperar" da banca). Rode no SQL Editor. Tem auto-teste.
-- Vale para quem escreve direto pela API (funcionário, nível >= 6). Encarregado/gerência/diretoria/dev não mudam.
-- 1) funcionário não consegue forjar dono/data/loja do produto (cadastrado_por, criado_em, loja_id, id) num UPDATE;
-- 2) aumento de quantidade pela API segue o mesmo teto da RPC somar_ao_lote: max(10, metade da quantidade atual);
-- 3) exclusão por funcionário segue exigindo baixa própria (24 h) ou produto criado por si nas últimas 24 h, e agora toda exclusão deixa linha na auditoria do servidor (a baixa de promoção pode ser parcial, por isso não se compara a quantidade);
-- 3b) cada baixa só autoriza UMA exclusão e precisa ser do mesmo lote e da mesma validade do produto (coluna historico.usada_exclusao);
-- 2b) o teto de aumento é ACUMULADO por produto e por dia (tabela privada produtos_aumento), não por requisição;
-- 1b) INSERT de funcionário também grava dono/data pelo servidor;
-- 4) todo UPDATE de quantidade/validade/lote e todo DELETE por usuário logado deixam linha na auditoria, gravada pelo servidor.

-- apoio: marca de baixa já usada e contador diário de aumento (tabela privada: RLS ligada e nenhuma política = só gatilhos de servidor)
alter table public.historico add column if not exists usada_exclusao boolean not null default false;
create table if not exists public.produtos_aumento (id text not null, dia date not null, base integer not null, total integer not null default 0, primary key (id, dia));
alter table public.produtos_aumento enable row level security;
revoke all on public.produtos_aumento from public, anon, authenticated;

create or replace function public._historico_quem() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is not null then
    new.registrado_por_id := auth.uid();
    new.registrado_por := coalesce(public.nome_do_usuario(), new.registrado_por);
    new.usada_exclusao := false;
    if new.data_baixa is null or new.data_baixa > now() then new.data_baixa := now(); end if;
  end if;
  return new;
end $f$;

create or replace function public._produtos_blindagem() returns trigger language plpgsql security definer set search_path = public as $f$
declare nv int; ac public.produtos_aumento%rowtype;
begin
  if auth.uid() is null then return new; end if;
  nv := coalesce(public.nivel_do_usuario(), 99);
  if nv <= 5 then return new; end if;
  new.id := old.id; new.loja_id := old.loja_id; new.criado_em := old.criado_em;
  new.cadastrado_por := old.cadastrado_por; new.lancado_por_id := old.lancado_por_id;
  new.atualizado_por := coalesce(public.nome_do_usuario(), old.atualizado_por);
  if new.quantidade is distinct from old.quantidade and new.quantidade > old.quantidade
     and coalesce(current_setting('app.via_rpc', true), '') <> '1' then
    insert into public.produtos_aumento (id, dia, base, total) values (old.id, public.hoje_br(), old.quantidade, 0) on conflict (id, dia) do nothing;
    select * into ac from public.produtos_aumento where id = old.id and dia = public.hoje_br() for update;
    if ac.total + (new.quantidade - old.quantidade) > greatest(10, ceil(ac.base * 0.5)) then raise exception 'aumento_excessivo'; end if;
    update public.produtos_aumento set total = ac.total + (new.quantidade - old.quantidade) where id = old.id and dia = public.hoje_br();
  end if;
  return new;
end $f$;
revoke all on function public._produtos_blindagem() from public, anon, authenticated;
drop trigger if exists trg_produtos_blindagem on public.produtos;
create trigger trg_produtos_blindagem before update on public.produtos for each row execute function public._produtos_blindagem();

-- INSERT de funcionário: dono e data vêm do servidor (se o id já existe, o upsert vira UPDATE e a blindagem acima cuida)
create or replace function public._produtos_blindagem_ins() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is null or coalesce(public.nivel_do_usuario(), 99) <= 5 then return new; end if;
  if exists (select 1 from public.produtos where id = new.id) then return new; end if;
  new.cadastrado_por := public.nome_do_usuario(); new.atualizado_por := public.nome_do_usuario();
  new.lancado_por_id := auth.uid(); new.criado_em := now();
  return new;
end $f$;
revoke all on function public._produtos_blindagem_ins() from public, anon, authenticated;
drop trigger if exists trg_produtos_blindagem_ins on public.produtos;
create trigger trg_produtos_blindagem_ins before insert on public.produtos for each row execute function public._produtos_blindagem_ins();

-- exclusão: baixa própria em 24 h (de uso único, mesmo lote e validade) ou produto criado por si em 24 h
create or replace function public._produtos_del_ck() returns trigger language plpgsql security definer set search_path = public as $f$
declare nv int; hid uuid;
begin
  if auth.uid() is null then return old; end if;
  perform public.rl_checar('produtos_del', 60);
  nv := coalesce(public.nivel_do_usuario(), 99);
  if nv <= 5 then return old; end if;
  select h.id into hid from public.historico h where h.loja_id = old.loja_id and h.barcode = old.barcode
     and h.registrado_por_id = auth.uid() and h.data_baixa > now() - interval '24 hours' and not h.usada_exclusao
     and h.validade is not distinct from old.validade and h.lote is not distinct from old.lote
     order by h.data_baixa desc limit 1 for update;
  if hid is not null then update public.historico set usada_exclusao = true where id = hid; return old; end if;
  if old.cadastrado_por is not distinct from public.nome_do_usuario() and old.criado_em > now() - interval '24 hours' then return old; end if;
  raise exception 'excluir_exige_encarregado';
end $f$;
revoke all on function public._produtos_del_ck() from public, anon, authenticated;

-- trilha gravada pelo servidor (não depende do app)
create or replace function public._produtos_trilha() returns trigger language plpgsql security definer set search_path = public as $f$
declare quem text; d text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  quem := coalesce(public.nome_do_usuario(), 'desconhecido');
  if tg_op = 'DELETE' then
    insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (quem, 'excluiu produto (registro do servidor)', left(coalesce(old.nome, '?') || ' · ' || coalesce('lote ' || old.lote, 'sem lote') || ' · validade ' || coalesce(old.validade::text, '-') || ' · ' || coalesce(old.quantidade::text, '?') || ' un', 400), old.barcode, old.loja_id);
    return old;
  end if;
  if coalesce(current_setting('app.via_rpc', true), '') = '1' then return new; end if; -- a RPC já audita sozinha
  d := '';
  if new.quantidade is distinct from old.quantidade then d := d || ' quantidade ' || old.quantidade::text || '→' || new.quantidade::text; end if;
  if new.validade is distinct from old.validade then d := d || ' validade ' || old.validade::text || '→' || new.validade::text; end if;
  if new.barcode is distinct from old.barcode then d := d || ' código ' || old.barcode || '→' || new.barcode; end if;
  if new.nome is distinct from old.nome then d := d || ' nome alterado'; end if;
  if new.setor is distinct from old.setor then d := d || ' setor ' || coalesce(old.setor, '-') || '→' || coalesce(new.setor, '-'); end if;
  if new.lote is distinct from old.lote then d := d || ' lote ' || coalesce(old.lote, '-') || '→' || coalesce(new.lote, '-'); end if;
  if d <> '' then
    insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (quem, 'alterou produto (registro do servidor)', left(coalesce(new.nome, '?') || ' ·' || d, 400), new.barcode, new.loja_id);
  end if;
  return new;
end $f$;
revoke all on function public._produtos_trilha() from public, anon, authenticated;
drop trigger if exists trg_produtos_trilha_upd on public.produtos;
drop trigger if exists trg_produtos_trilha_del on public.produtos;
create trigger trg_produtos_trilha_upd after update on public.produtos for each row execute function public._produtos_trilha();
create trigger trg_produtos_trilha_del after delete on public.produtos for each row execute function public._produtos_trilha();

-- somar_ao_lote avisa os gatilhos de que é a RPC (teto próprio + auditoria própria)
create or replace function public.somar_ao_lote(p_id text, p_qtd integer) returns integer language plpgsql security definer set search_path = public as $f$
declare x record; nova int;
begin
  if auth.uid() is null or public.nivel_do_usuario() is null then raise exception 'sem_permissao'; end if;
  perform public.rl_checar('somar_lote', 60);
  if p_qtd is null or p_qtd < 1 or p_qtd > 99999 then raise exception 'quantidade_invalida'; end if;
  select id, nome, barcode, lote, quantidade, loja_id, por_peso into x from public.produtos where id = p_id for update;
  if not found or not public.loja_ok(x.loja_id) then raise exception 'produto_nao_encontrado'; end if;
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
end $f$;
revoke all on function public.somar_ao_lote(text, integer) from public, anon;
grant execute on function public.somar_ao_lote(text, integer) to authenticated;

-- AUTO-TESTE
do $do$
declare n int;
begin
  select count(*) into n from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname in ('trg_produtos_blindagem_ins', 'trg_produtos_blindagem', 'trg_produtos_trilha_upd', 'trg_produtos_trilha_del', 'trg_produtos_del', 'trg_produtos_regras');
  if n <> 6 then raise exception 'auto-teste: gatilhos de produtos incompletos (%)', n; end if;
  if position('via_rpc' in pg_get_functiondef('public.somar_ao_lote(text,integer)'::regprocedure)) = 0 then raise exception 'auto-teste: somar_ao_lote'; end if;
  if position('24 hours' in pg_get_functiondef('public._produtos_del_ck()'::regprocedure)) = 0 then raise exception 'auto-teste: _produtos_del_ck'; end if;
  if has_function_privilege('anon', 'public.somar_ao_lote(text,integer)', 'execute') or not has_function_privilege('authenticated', 'public.somar_ao_lote(text,integer)', 'execute') then raise exception 'auto-teste: permissoes somar_ao_lote'; end if;
end $do$;

-- =====================================================================================================
-- supabase-revisao.sql  —  CORREÇÕES DA BANCA DE REVISORES (2026-11-03)   *** ESTE É O "HEAD" DO BANCO ***
-- Rode UMA vez no SQL Editor do Supabase (pode rodar de novo sem problema). Tem AUTO-TESTE no fim.
--
-- NÃO reaplique mais supabase-lote.sql, supabase-telegram.sql, supabase-telegram-aprovacao.sql nem
-- supabase-telegram-regras.sql: eles recriam funções antigas SEM as regras novas. As versões finais de
-- lancar_validade e telegram_enviar_aprovacao estão neste arquivo (corpo completo, sem "replace" remendado).
--
-- O que muda:
--  * EAN: aceita EAN-8, UPC-A (12) e EAN-13 com dígito verificador; recusa tudo-zero (ean_valido). Códigos internos "int:" e "bal:" passam.
--  * Fuso: todas as datas usam hoje_br() (Brasília), não mais current_date (UTC).
--  * Lote: norm_lote() único (maiúsculas, espaços colapsados); lote único por produto/loja (índice único).
--  * produtos: gatilho valida validade/quantidade/lote também em escrita direta pela API; exclusão por funcionário (nível 6) só
--    com baixa recém-registrada ou produto criado por ele nas últimas 24 h; limite de exclusões por minuto.
--  * historico/auditoria/validade_alteracoes: o servidor grava QUEM fez (não confia no que o navegador manda).
--  * validade_alteracoes ganha loja_id; resumo_lojas_rede e Telegram (vínculos/sessões) deixam de vazar entre lojas/cargos.
--  * funcionarios_pendentes: gatilho também barra cargo igual/superior ao de quem cadastra e loja de outra pessoa.
--  * promotor: marca com menos de 3 letras não casa com produto nenhum.
--  * rl_checar: usa o IP do Cloudflare (cf-connecting-ip) ou o ÚLTIMO valor de x-forwarded-for (o primeiro é forjável).
--  * somar_ao_lote(): soma de lote feita no servidor, com teto max(10, metade) e trava de linha.
--  * telegram_criar_produto removida (sem uso; o produto novo passa pela aprovação).
-- =====================================================================================================

-- ---------- 1) Helpers ----------
create or replace function public.hoje_br() returns date language sql stable as
$$ select (now() at time zone 'America/Sao_Paulo')::date $$;
grant execute on function public.hoje_br() to authenticated, service_role;

create or replace function public.norm_lote(p text) returns text language sql immutable as
$$ select nullif(upper(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))), '') $$;
grant execute on function public.norm_lote(text) to authenticated, service_role;

-- EAN-8, UPC-A (12) ou EAN-13; dígito verificador correto; tudo-zero não vale
create or replace function public.ean_valido(p text) returns boolean language plpgsql immutable as $f$
declare t text := coalesce(p, ''); n int; soma int := 0; i int; peso int := 3;
begin
  if t !~ '^[0-9]+$' or length(t) not in (8, 12, 13) or t ~ '^0+$' then return false; end if;
  n := length(t);
  for i in reverse n - 1 .. 1 loop
    soma := soma + substr(t, i, 1)::int * peso;
    peso := case when peso = 3 then 1 else 3 end;
  end loop;
  return (10 - soma % 10) % 10 = substr(t, n, 1)::int;
end $f$;
grant execute on function public.ean_valido(text) to authenticated, service_role;
-- nome antigo continua existindo (funções e testes antigos chamam), agora com a regra nova
create or replace function public.ean13_valido(p text) returns boolean language sql immutable as $$ select public.ean_valido(p) $$;
grant execute on function public.ean13_valido(text) to authenticated, service_role;

-- ---------- 2) Catálogo: código novo precisa ser EAN válido (balança, por peso e interno passam) ----------
create or replace function public._catalogo_ean_ck() returns trigger language plpgsql as $f$
begin
  if coalesce(new.por_peso, false) or new.barcode like 'bal:%' or new.barcode like 'int:%' then return new; end if;
  if exists (select 1 from public.catalogo where loja_id = new.loja_id and barcode = new.barcode) then return new; end if;
  if not public.ean_valido(new.barcode) then raise exception 'ean_invalido'; end if;
  return new;
end $f$;
revoke all on function public._catalogo_ean_ck() from public, anon, authenticated;
drop trigger if exists trg_catalogo_ean on public.catalogo;
create trigger trg_catalogo_ean before insert on public.catalogo for each row execute function public._catalogo_ean_ck();

-- ---------- 3) produtos: lote normalizado e único + regras também na escrita direta ----------
create or replace function public._produtos_lote_ck() returns trigger language plpgsql as $f$
begin
  if new.lote is not null then
    new.lote := public.norm_lote(new.lote);
    if new.lote is not null and new.lote !~ '^[A-Z0-9][A-Z0-9./ -]{0,19}$' then raise exception 'lote_invalido'; end if;
  end if;
  if new.lote is not null then new.sem_lote := false; end if;
  return new;
end $f$;
revoke all on function public._produtos_lote_ck() from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from public.produtos where lote is not null group by loja_id, barcode, lote having count(*) > 1) then
    execute 'create unique index if not exists produtos_lote_unico on public.produtos (loja_id, barcode, lote) where lote is not null';
  else
    raise notice 'Há lotes repetidos em produtos: índice único NÃO criado. Junte os repetidos e rode de novo.';
  end if;
end $do$;

-- Regras de dado para quem escreve pela API (usuário logado). RPCs de servidor/bot (sem auth.uid) já validam por conta própria.
create or replace function public._produtos_regras() returns trigger language plpgsql as $f$
declare ex boolean := (tg_op = 'UPDATE'); q_ant int; v_ant date;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' then q_ant := old.quantidade; v_ant := old.validade;
  else
    -- upsert pelo app: o INSERT dispara este gatilho mesmo quando a linha já existe (vira UPDATE); trata como edição
    select quantidade, validade into q_ant, v_ant from public.produtos where id = new.id;
    ex := found;
  end if;
  if (not ex or new.quantidade is distinct from q_ant) and (new.quantidade is null or new.quantidade < 1 or new.quantidade > 99999) then raise exception 'quantidade_invalida'; end if;
  if not ex or new.validade is distinct from v_ant then
    if new.validade is null then raise exception 'validade_obrigatoria'; end if;
    if new.validade < public.hoje_br() then raise exception 'validade_vencida'; end if;
    if new.validade > public.hoje_br() + interval '10 years' then raise exception 'validade_invalida'; end if;
  end if;
  if not ex and new.lote is null and not coalesce(new.sem_lote, false) and not coalesce(new.por_peso, false) then
    raise exception 'lote_obrigatorio';
  end if;
  return new;
end $f$;
revoke all on function public._produtos_regras() from public, anon, authenticated;
drop trigger if exists trg_produtos_regras on public.produtos;
create trigger trg_produtos_regras before insert or update on public.produtos for each row execute function public._produtos_regras();

-- Exclusão: limite por minuto; funcionário (nível 6) só exclui com baixa recém-registrada por ele ou produto que ele mesmo criou nas últimas 24 h
create or replace function public._produtos_del_ck() returns trigger language plpgsql security definer set search_path = public as $f$
declare nv int;
begin
  if auth.uid() is null then return old; end if;
  perform public.rl_checar('produtos_del', 60);
  nv := coalesce(public.nivel_do_usuario(), 99);
  if nv <= 5 then return old; end if;
  if exists (select 1 from public.historico h where h.loja_id = old.loja_id and h.barcode = old.barcode
             and h.registrado_por_id = auth.uid() and h.data_baixa > now() - interval '10 minutes') then return old; end if;
  if old.cadastrado_por is not distinct from public.nome_do_usuario() and old.criado_em > now() - interval '24 hours' then return old; end if;
  raise exception 'excluir_exige_encarregado';
end $f$;
revoke all on function public._produtos_del_ck() from public, anon, authenticated;
drop trigger if exists trg_produtos_del on public.produtos;
create trigger trg_produtos_del before delete on public.produtos for each row execute function public._produtos_del_ck();

-- ---------- 4) Trilhas: o servidor grava quem fez ----------
create or replace function public._historico_quem() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is not null then
    new.registrado_por_id := auth.uid();
    new.registrado_por := coalesce(public.nome_do_usuario(), new.registrado_por);
  end if;
  return new;
end $f$;
revoke all on function public._historico_quem() from public, anon, authenticated;
drop trigger if exists trg_historico_quem on public.historico;
create trigger trg_historico_quem before insert on public.historico for each row execute function public._historico_quem();

create or replace function public._auditoria_quem() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is not null then new.usuario := coalesce(public.nome_do_usuario(), new.usuario); end if;
  return new;
end $f$;
revoke all on function public._auditoria_quem() from public, anon, authenticated;
drop trigger if exists trg_auditoria_quem on public.auditoria;
create trigger trg_auditoria_quem before insert on public.auditoria for each row execute function public._auditoria_quem();

alter table public.validade_alteracoes add column if not exists loja_id bigint;
create or replace function public._valid_alt_quem() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is not null then
    new.loja_id := public.loja_do_usuario();
    new.alterado_por := coalesce(public.nome_do_usuario(), new.alterado_por);
  end if;
  return new;
end $f$;
revoke all on function public._valid_alt_quem() from public, anon, authenticated;
drop trigger if exists trg_valid_alt_quem on public.validade_alteracoes;
create trigger trg_valid_alt_quem before insert on public.validade_alteracoes for each row execute function public._valid_alt_quem();
drop policy if exists valid_alt_sel on public.validade_alteracoes;
create policy valid_alt_sel on public.validade_alteracoes for select using (public.nivel_do_usuario() <= 5 and public.loja_ok(loja_id));

-- ---------- 5) Leitura entre lojas / cargos ----------
drop policy if exists resumo_sel on public.resumo_lojas_rede;
create policy resumo_sel on public.resumo_lojas_rede for select
  using (public.nivel_do_usuario() <= 3 or (public.nivel_do_usuario() <= 5 and public.loja_numero_ok(loja_numero)));

drop policy if exists tg_vinculos_ver on public.telegram_vinculos;
create policy tg_vinculos_ver on public.telegram_vinculos for select
  using (usuario_id = auth.uid() or (public.nivel_do_usuario() <= 4 and (public.eh_gestao_global() or loja_id = public.loja_do_usuario())));
drop policy if exists tg_sessoes_ver on public.telegram_sessoes;
create policy tg_sessoes_ver on public.telegram_sessoes for select
  using (public.eh_gestao_global() or exists (select 1 from public.telegram_vinculos v where v.id = telegram_sessoes.vinculo_id and v.usuario_id = auth.uid()));

-- ---------- 6) Pré-cadastro: nunca cargo igual/superior ao de quem cadastra, nem loja alheia ----------
create or replace function public._pendente_regra_setor() returns trigger language plpgsql security definer set search_path = public as $f$
declare v_nivel_criador int; v_setor_criador text; v_nivel_cargo int; v_padrao text;
begin
  if auth.uid() is null then return new; end if;
  v_nivel_criador := public.nivel_do_usuario();
  select nivel, setor_padrao into v_nivel_cargo, v_padrao from public.cargos where id = new.cargo_id;
  if v_nivel_cargo is null then raise exception 'Cargo inválido.' using errcode = '22023'; end if;
  if v_nivel_criador is distinct from 1 and v_nivel_cargo <= coalesce(v_nivel_criador, 0) then
    raise exception 'Você só pode cadastrar cargos abaixo do seu.' using errcode = '22023';
  end if;
  if not public.loja_ok(new.loja_id) then raise exception 'Loja inválida para o seu acesso.' using errcode = '22023'; end if;
  new.setor := nullif(btrim(coalesce(new.setor, '')), '');
  if new.setor is not null and length(new.setor) > 80 then raise exception 'Setor inválido.' using errcode = '22023'; end if;
  if v_nivel_criador = 5 then
    select nullif(btrim(coalesce(setor, '')), '') into v_setor_criador from public.usuarios where id = auth.uid();
    if v_setor_criador is null then
      raise exception 'Seu usuário não tem setor definido. Peça à gerência para definir o seu setor antes de cadastrar equipe.' using errcode = '22023';
    end if;
    new.setor := v_setor_criador;
  end if;
  if new.setor is null then new.setor := nullif(btrim(coalesce(v_padrao, '')), ''); end if;
  if v_nivel_cargo >= 6 and new.setor is null then raise exception 'Escolha o setor do funcionário.' using errcode = '22023'; end if;
  return new;
end $f$;
revoke all on function public._pendente_regra_setor() from public, anon, authenticated;

-- ---------- 7) Promotor: marca com menos de 3 letras não casa com produto ----------
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'convites_marca_min') then
    execute 'alter table public.convites_promotor add constraint convites_marca_min check (length(btrim(marca)) >= 3) not valid';
  end if;
end $do$;

-- ---------- 8) Limite por minuto: não confiar no 1º valor de x-forwarded-for ----------
create or replace function public.rl_checar(p_bucket text, p_max integer) returns void language plpgsql security definer set search_path = public as $f$
declare k text; c int; h text; xff text; partes text[];
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return; end if;
  if coalesce(public.nivel_do_usuario(), 99) <= 2 then return; end if;
  h := nullif(current_setting('request.headers', true), '');
  k := auth.uid()::text;
  if k is null then
    k := nullif(btrim(coalesce((h::json)->>'cf-connecting-ip', '')), '');
    if k is null then
      xff := coalesce((h::json)->>'x-forwarded-for', '');
      partes := string_to_array(xff, ',');
      if partes is not null and array_length(partes, 1) > 0 then k := nullif(btrim(partes[array_length(partes, 1)]), ''); end if;
    end if;
    k := coalesce(k, '?');
  end if;
  insert into public.limite_uso(chave, bucket, janela, n) values (k, p_bucket, date_trunc('minute', now()), 1)
  on conflict (chave, bucket, janela) do update set n = public.limite_uso.n + 1 returning n into c;
  if c > p_max then raise exception 'limite_excedido' using hint = 'Muitas requisições. Aguarde 1 minuto.', errcode = 'P0001'; end if;
end $f$;
revoke all on function public.rl_checar(text, int) from public, anon, authenticated;

-- ---------- 9) lancar_validade — VERSÃO FINAL (corpo completo) ----------
create or replace function public.lancar_validade(p_loja bigint, p_usuario uuid, p_barcode text, p_validade date, p_quantidade numeric,
  p_origem text default 'whatsapp', p_foto text default null, p_obs text default null, p_dias_alerta integer default 15,
  p_tamanho text default null, p_unidade text default null, p_op uuid default null, p_confirmar_duplicado boolean default false,
  p_convite uuid default null, p_lote text default null, p_sem_lote boolean default false)
returns text language plpgsql security definer set search_path = public as $f$
declare c record; u record; cv record; v_id text; v_existente text; v_qtd numeric; v_nome text; v_por uuid; x record;
  lt text := public.norm_lote(p_lote);
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
    if length(btrim(cv.marca)) < 3 or strpos(upper(c.nome), upper(btrim(cv.marca))) = 0 then raise exception 'produto_fora_da_marca'; end if;
  end if;
  if p_validade is null then raise exception 'validade_obrigatoria'; end if;
  if p_validade < public.hoje_br() then raise exception 'validade_vencida'; end if;
  if p_origem = 'telegram' and p_validade <= public.hoje_br() + 2 then raise exception 'validade_muito_proxima'; end if;
  if p_validade > public.hoje_br() + interval '10 years' then raise exception 'validade_invalida'; end if;
  if coalesce(c.por_peso, false) then
    if p_quantidade is null or p_quantidade < 0.001 or p_quantidade > 9999 then raise exception 'quantidade_invalida'; end if;
  else
    if p_quantidade is null or p_quantidade < 1 or p_quantidade > 99999 or p_quantidade <> trunc(p_quantidade) then raise exception 'quantidade_invalida'; end if;
  end if;
  v_qtd := p_quantidade;
  if p_dias_alerta is null or p_dias_alerta < 1 or p_dias_alerta > 365 then raise exception 'dias_alerta_invalido'; end if;
  -- lote: número da embalagem (obrigatório, exceto produto por peso) ou "sem lote" dito de propósito
  if lt is not null and lt !~ '^[A-Z0-9][A-Z0-9./ -]{0,19}$' then raise exception 'lote_invalido'; end if;
  if p_origem = 'telegram' and lt is null and not coalesce(c.por_peso, false) then raise exception 'lote_obrigatorio_telegram'; end if;
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
end $f$;

-- ---------- 10) telegram_enviar_aprovacao — VERSÃO FINAL (corpo completo) ----------
create or replace function public.telegram_enviar_aprovacao(p_chat_id bigint, p_barcode text, p_nome text, p_setor text, p_foto text,
  p_validade date, p_quantidade numeric, p_lote text default null, p_sem_lote boolean default false)
returns uuid language plpgsql security definer set search_path = public as $f$
declare
  v record; u record; n int; novo uuid;
  lt text := public.norm_lote(p_lote);
  bc text := regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g');
  nm text := upper(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')));
  setores text[] := array['Hortifruti','Açougue','Padaria','Frios e Laticínios','Mercearia','Bebidas','Congelados','Limpeza','Higiene e Perfumaria','Bazar'];
begin
  select * into v from public.telegram_vinculos where chat_id = p_chat_id;
  if not found or v.tipo <> 'funcionario' then raise exception 'sem_permissao'; end if;
  select id, nome, loja_id, ativo, promotor into u from public.usuarios where id = v.usuario_id;
  if not found or not u.ativo or u.promotor or u.loja_id is distinct from v.loja_id then raise exception 'usuario_fora_da_loja'; end if;

  if not public.ean_valido(bc) then raise exception 'codigo_invalido'; end if;
  if length(nm) < 5 or length(nm) > 80 or nm !~ '[A-ZÀ-Ý]{3}' or nm ~ '[<>{}\[\]\\|^`]' then raise exception 'nome_invalido'; end if;
  if not (p_setor = any (setores)) then raise exception 'setor_invalido'; end if;
  if p_foto is not null and (p_foto !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(p_foto) > 450000) then raise exception 'foto_invalida'; end if;
  if p_validade is null then raise exception 'validade_obrigatoria'; end if;
  if p_validade < public.hoje_br() then raise exception 'validade_vencida'; end if;
  if p_validade <= public.hoje_br() + 2 then raise exception 'validade_muito_proxima'; end if;
  if p_validade > public.hoje_br() + interval '5 years' then raise exception 'validade_invalida'; end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 5000 or p_quantidade <> trunc(p_quantidade) then raise exception 'quantidade_invalida'; end if;
  if lt is not null and lt !~ '^[A-Z0-9][A-Z0-9./ -]{0,19}$' then raise exception 'lote_invalido'; end if;
  if lt is null then raise exception 'lote_obrigatorio'; end if;
  if exists (select 1 from public.produtos where barcode = bc and loja_id = v.loja_id and lote = lt) then raise exception 'lote_ja_lancado'; end if;
  if exists (select 1 from public.catalogo where barcode = bc and loja_id = v.loja_id) then raise exception 'produto_ja_existe'; end if;
  if exists (select 1 from public.aprovacoes_produto where barcode = bc and loja_id = v.loja_id and status = 'pendente') then raise exception 'pendente_ja_existe'; end if;

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
end $f$;

-- ---------- 11) Soma de lote no servidor (teto, trava de linha, auditoria) ----------
create or replace function public.somar_ao_lote(p_id text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $f$
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
  update public.produtos set quantidade = nova, atualizado_por = public.nome_do_usuario() where id = p_id;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (public.nome_do_usuario(), 'somou quantidade ao lote', x.nome || ' · lote ' || x.lote || ' · +' || p_qtd::text || ' (de ' || x.quantidade::text || ' para ' || nova::text || ')', x.barcode, x.loja_id);
  return nova;
end $f$;
revoke all on function public.somar_ao_lote(text, integer) from public, anon;
grant execute on function public.somar_ao_lote(text, integer) to authenticated;

-- ---------- 12) Limpeza ----------
drop function if exists public.telegram_criar_produto(bigint, text, text, text, text);

-- ---------- 13) AUTO-TESTE (comportamento; falha = nada fica aplicado) ----------
-- tempo real da fila de aprovação (a tela atualiza na hora)
do $do$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aprovacoes_produto') then
    alter publication supabase_realtime add table public.aprovacoes_produto;
  end if;
exception when others then null; end $do$;

do $do$
declare d text;
begin
  -- EAN: EAN-8, UPC-A, EAN-13 válidos; errados, tamanhos errados e tudo-zero recusados
  if not public.ean_valido('96385074') then raise exception 'auto-teste: EAN-8 valido recusado'; end if;
  if not public.ean_valido('036000291452') then raise exception 'auto-teste: UPC-A valido recusado'; end if;
  if not public.ean_valido('7891000100103') then raise exception 'auto-teste: EAN-13 valido recusado'; end if;
  if public.ean_valido('96385075') or public.ean_valido('7891000100104') or public.ean_valido('0000000000000') or public.ean_valido('00000000')
     or public.ean_valido('123') or public.ean_valido('12345678901234') or public.ean_valido('abcdefgh') or public.ean_valido(null) then
    raise exception 'auto-teste: EAN invalido aceito';
  end if;
  if not public.ean13_valido('96385074') then raise exception 'auto-teste: ean13_valido (alias) divergente'; end if;
  -- lote e data
  if public.norm_lote('  l  12 ') is distinct from 'L 12' or public.norm_lote('   ') is not null then raise exception 'auto-teste: norm_lote'; end if;
  if public.hoje_br() <> (now() at time zone 'America/Sao_Paulo')::date then raise exception 'auto-teste: hoje_br'; end if;
  -- funções finais sem current_date (UTC) e com as regras
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'lancar_validade';
  if d is null or position('current_date' in d) > 0 or position('hoje_br' in d) = 0 or position('validade_muito_proxima' in d) = 0
     or position('lote_obrigatorio_telegram' in d) = 0 or position('norm_lote' in d) = 0 then raise exception 'auto-teste: lancar_validade final incorreta'; end if;
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'telegram_enviar_aprovacao';
  if d is null or position('current_date' in d) > 0 or position('ean_valido' in d) = 0 or position('validade_muito_proxima' in d) = 0 then
    raise exception 'auto-teste: telegram_enviar_aprovacao final incorreta';
  end if;
  -- gatilhos e políticas novas existem
  if (select count(*) from pg_trigger where not tgisinternal and tgname in ('trg_produtos_regras','trg_produtos_del','trg_historico_quem','trg_auditoria_quem','trg_valid_alt_quem','trg_catalogo_ean')) <> 6 then
    raise exception 'auto-teste: gatilhos ausentes';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and policyname in ('valid_alt_sel','resumo_sel','tg_vinculos_ver','tg_sessoes_ver')) <> 4 then
    raise exception 'auto-teste: politicas ausentes';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'telegram_criar_produto') then raise exception 'auto-teste: telegram_criar_produto ainda existe'; end if;
  if not has_function_privilege('authenticated', 'public.somar_ao_lote(text,integer)', 'execute') or has_function_privilege('anon', 'public.somar_ao_lote(text,integer)', 'execute') then
    raise exception 'auto-teste: permissao de somar_ao_lote';
  end if;
  raise notice 'supabase-revisao.sql aplicado e testado com sucesso.';
end $do$;

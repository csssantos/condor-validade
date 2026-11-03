-- Etapa 1: promotor com VÁRIAS MARCAS (1 a 5) ou ACESSO TOTAL, e registro automático de marcas. Rode no SQL Editor (tem auto-teste).
-- Rode DEPOIS de supabase-revisao.sql e supabase-promotor-codigo.sql.
-- Regras: o convite tem de 1 a 5 marcas OU acesso total (só gerência/diretoria/DEV pode dar acesso total).
-- Promotor só lança produto cujo nome contém uma das marcas dele (palavra inteira, sem diferenciar acento/maiúscula). Vale no app, no Telegram e no banco.

create or replace function public._sem_acento(t text) returns text language sql immutable as $$
  select upper(translate(coalesce(t, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNAAAAAEEEEIIIIOOOOOUUUUCN'))
$$;

-- 1) colunas do convite
alter table public.convites_promotor add column if not exists marcas text[] not null default '{}';
alter table public.convites_promotor add column if not exists acesso_total boolean not null default false;
update public.convites_promotor set marcas = array[upper(btrim(marca))] where cardinality(marcas) = 0 and not acesso_total and marca is not null;

-- 2) normaliza e valida as marcas no cadastro do convite (roda ANTES do gerador de código: nome com '0')
create or replace function public._convite_marcas_trg() returns trigger language plpgsql security definer set search_path = public as $f$
declare m text; src text[]; arr text[] := '{}'; nv int;
begin
  if auth.uid() is not null then
    nv := coalesce(public.nivel_do_usuario(), 99);
    if nv > 5 then raise exception 'sem_permissao'; end if;
  end if;
  if new.acesso_total then
    if auth.uid() is not null and nv > 4 then raise exception 'acesso_total_exige_gerencia'; end if;
    new.marcas := '{}'; new.marca := 'TODAS AS MARCAS';
    return new;
  end if;
  src := case when cardinality(coalesce(new.marcas, '{}')) > 0 then new.marcas else array[coalesce(new.marca, '')] end;
  foreach m in array src loop
    m := public._sem_acento(btrim(regexp_replace(coalesce(m, ''), '[^A-Za-zÀ-ÿ0-9 .&''-]', '', 'g')));
    m := regexp_replace(m, '\s+', ' ', 'g');
    if length(m) < 3 or length(m) > 30 then raise exception 'marca_invalida'; end if;
    if not (m = any(arr)) then arr := arr || m; end if;
  end loop;
  if cardinality(arr) < 1 then raise exception 'marca_invalida'; end if;
  if cardinality(arr) > 5 then raise exception 'marcas_demais'; end if;
  new.marcas := arr; new.marca := arr[1];
  return new;
end $f$;
revoke all on function public._convite_marcas_trg() from public, anon, authenticated;
drop trigger if exists trg_a_convite_marcas on public.convites_promotor;
create trigger trg_a_convite_marcas before insert on public.convites_promotor for each row execute function public._convite_marcas_trg();

-- 3) o produto é da marca? (palavra inteira; sem acento; acesso total libera tudo)
create or replace function public._marca_casa(p_nome text, p_marca text) returns boolean language sql immutable as $f$
  select length(btrim(coalesce(p_marca, ''))) >= 3
     and public._sem_acento(p_nome) ~ ('(^|[^A-Z0-9])' || regexp_replace(public._sem_acento(btrim(p_marca)), '([\.\[\]\(\)\*\+\?\{\}\|\^\$\\])', '\\\1', 'g') || '([^A-Z0-9]|$)')
$f$;
revoke all on function public._marca_casa(text, text) from public, anon, authenticated;

create or replace function public._produto_da_marca(p_nome text, p_convite uuid) returns boolean
language plpgsql stable security definer set search_path = public as $f$
declare c record; m text;
begin
  select acesso_total, marcas into c from public.convites_promotor where id = p_convite;
  if not found then return false; end if;
  if c.acesso_total then return true; end if;
  foreach m in array coalesce(c.marcas, '{}') loop
    if public._marca_casa(p_nome, m) then return true; end if;
  end loop;
  return false;
end $f$;
revoke all on function public._produto_da_marca(text, uuid) from public, anon, authenticated;

-- 4) lancar_validade (todas as versões): usa a regra nova
do $$
declare d text; r record; n int := 0;
begin
  for r in select oid from pg_proc where pronamespace = 'public'::regnamespace and proname = 'lancar_validade' loop
    d := pg_get_functiondef(r.oid);
    if position('strpos(upper(c.nome), upper(btrim(cv.marca)))' in d) > 0 then
      d := replace(d, 'if length(btrim(cv.marca)) < 3 or strpos(upper(c.nome), upper(btrim(cv.marca))) = 0 then', 'if not public._produto_da_marca(c.nome, cv.id) then');
      if position('_produto_da_marca' in d) = 0 then raise exception 'lancar_validade: nao consegui trocar a regra da marca'; end if;
      execute d;
      n := n + 1;
    end if;
  end loop;
  if n = 0 and not exists (select 1 from pg_proc p where p.proname = 'lancar_validade' and p.pronamespace = 'public'::regnamespace and position('_produto_da_marca' in pg_get_functiondef(p.oid)) > 0) then raise exception 'lancar_validade com a regra antiga nao encontrada'; end if;
end $$;

-- 5) telegram_contexto devolve as marcas e o acesso total do promotor
create or replace function public.telegram_contexto(p_chat_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record; u record; c record;
begin
  select * into v from public.telegram_vinculos where chat_id = p_chat_id;
  if not found then return null; end if;
  if v.tipo = 'funcionario' then
    select nome, ativo, loja_id, promotor into u from public.usuarios where id = v.usuario_id;
    if not found or not u.ativo or u.promotor or u.loja_id is distinct from v.loja_id then return jsonb_build_object('motivo', 'inativo'); end if;
    return jsonb_build_object('vinculo_id', v.id, 'tipo', 'funcionario', 'usuario_id', v.usuario_id, 'loja_id', v.loja_id, 'nome', u.nome);
  end if;
  select * into c from public.convites_promotor where id = v.convite_id;
  if not found or c.revogado or c.pausado or c.expira_em <= now() then return jsonb_build_object('motivo', 'convite'); end if;
  return jsonb_build_object('vinculo_id', v.id, 'tipo', 'promotor', 'convite_id', c.id, 'loja_id', c.loja_id, 'nome', c.nome, 'marca', c.marca,
    'marcas', to_jsonb(coalesce(c.marcas, '{}')), 'acesso_total', c.acesso_total);
end $$;
revoke all on function public.telegram_contexto(bigint) from public, anon, authenticated;
grant execute on function public.telegram_contexto(bigint) to service_role;

-- 6) promotor, pelo app: só cria/mexe em produto da marca dele (o servidor repete a regra da tela)
create or replace function public._produtos_promotor_marca() returns trigger language plpgsql security definer set search_path = public as $f$
declare u record;
begin
  if auth.uid() is null then return new; end if;
  select promotor, convite_id into u from public.usuarios where id = auth.uid();
  if not found or not coalesce(u.promotor, false) then return new; end if;
  -- vale para o nome ATUAL e para o novo: promotor não mexe em produto de outra marca nem renomeia para "virar dono"
  if u.convite_id is null or not public._produto_da_marca(new.nome, u.convite_id) then raise exception 'produto_fora_da_marca'; end if;
  if tg_op = 'UPDATE' and not public._produto_da_marca(old.nome, u.convite_id) then raise exception 'produto_fora_da_marca'; end if;
  return new;
end $f$;
revoke all on function public._produtos_promotor_marca() from public, anon, authenticated;
drop trigger if exists trg_produtos_promotor_marca on public.produtos;
create trigger trg_produtos_promotor_marca before insert or update on public.produtos for each row execute function public._produtos_promotor_marca();

-- 7) registro de marcas da loja (sugestões para novos convites)
create table if not exists public.marcas (
  loja_id bigint not null,
  nome text not null,
  origem text not null default 'catalogo',
  criado_em timestamptz not null default now(),
  primary key (loja_id, nome)
);
alter table public.marcas enable row level security;
revoke all on public.marcas from public, anon, authenticated;

-- palavras que nunca são marca (categorias, medidas, adjetivos)
create or replace function public._marca_stop() returns text[] language sql immutable as $f$
  select array['CAFE','ARROZ','FEIJAO','ACUCAR','BISCOITO','BOLACHA','CHOCOLATE','LINGUICA','MACARRAO','MOLHO','OLEO','LEITE','QUEIJO','IOGURTE','MANTEIGA','MARGARINA','REFRIGERANTE','REFRI','SUCO','AGUA','CERVEJA','VINHO','SABAO','DETERGENTE','AMACIANTE','SHAMPOO','CONDICIONADOR','SABONETE','CREME','PAPEL','HIGIENICO','FARINHA','FUBA','SAL','TEMPERO','EXTRATO','PACOTE','CAIXA','LATA','GARRAFA','POTE','SACHE','UNIDADE','TRADICIONAL','INTEGRAL','LIGHT','ZERO','DIET','SABOR','COM','SEM','PARA','PRESUNTO','MORTADELA','SALSICHA','HAMBURGUER','PAO','BOLO','TORTA','GELATINA','SOBREMESA','CEREAL','MATINAL','BARRA','BALA','CHICLETE','PIRULITO','SORVETE','PICOLE','LIQUIDO','CLASSICO','SUAVE','FORTE','EXTRA','PREMIUM','SELECIONADO','ESPECIAL','NATURAL','ORGANICO']
$f$;

-- escolhe a marca do nome do produto: ignora palavras comuns, abreviações (com ponto), números e medidas;
-- entre as candidatas prefere a que aparece em mais produtos do catálogo da loja (uma passada só, sem regex por palavra)
create or replace function public.extrair_marca(p_nome text, p_loja bigint) returns text
language sql stable security definer set search_path = public as $f$
  with toks as (
    select t.w, t.ord from regexp_split_to_table(regexp_replace(public._sem_acento(p_nome), '[^A-Z0-9. ]', ' ', 'g'), '\s+') with ordinality t(w, ord)
    where length(t.w) >= 3 and t.w !~ '[0-9.]' and t.w <> all(public._marca_stop())
  ), freq as (
    select x.w, count(*) n from (
      select distinct c.barcode, w from public.catalogo c,
        lateral regexp_split_to_table(regexp_replace(public._sem_acento(c.nome), '[^A-Z0-9. ]', ' ', 'g'), '\s+') w
      where c.loja_id = p_loja) x
    where x.w in (select w from toks) group by x.w
  )
  select toks.w from toks left join freq on freq.w = toks.w order by coalesce(freq.n, 0) desc, toks.ord limit 1
$f$;
revoke all on function public.extrair_marca(text, bigint) from public, anon, authenticated;

create or replace function public._catalogo_marca() returns trigger language plpgsql security definer set search_path = public as $f$
declare m text;
begin
  begin
    if new.loja_id is null then return new; end if;
    -- caminho barato: se o nome já tem uma marca registrada, não faz mais nada (importação grande não fica lenta)
    if exists (select 1 from regexp_split_to_table(regexp_replace(public._sem_acento(new.nome), '[^A-Z0-9. ]', ' ', 'g'), '\s+') w
               join public.marcas k on k.loja_id = new.loja_id and k.nome = w) then return new; end if;
    if (select count(*) from public.marcas where loja_id = new.loja_id) >= 3000 then return new; end if;
    m := public.extrair_marca(new.nome, new.loja_id);
    if m is not null then insert into public.marcas (loja_id, nome, origem) values (new.loja_id, m, 'catalogo') on conflict do nothing; end if;
  exception when others then null; -- nunca atrapalha o cadastro do produto
  end;
  return new;
end $f$;
revoke all on function public._catalogo_marca() from public, anon, authenticated;
drop trigger if exists trg_catalogo_marca on public.catalogo;
create trigger trg_catalogo_marca after insert on public.catalogo for each row execute function public._catalogo_marca();

-- marcas digitadas num convite também entram no registro
create or replace function public._convite_registra_marcas() returns trigger language plpgsql security definer set search_path = public as $f$
declare m text;
begin
  foreach m in array coalesce(new.marcas, '{}') loop
    insert into public.marcas (loja_id, nome, origem) values (new.loja_id, m, 'convite') on conflict do nothing;
  end loop;
  insert into public.auditoria (usuario, acao, detalhe, loja_id)
    values (coalesce(public.nome_do_usuario(), 'sistema'),
            case when new.acesso_total then 'criou convite de promotor (ACESSO TOTAL)' else 'criou convite de promotor' end,
            new.nome || ' · ' || case when new.acesso_total then 'todas as marcas' else array_to_string(new.marcas, ', ') end, new.loja_id);
  return new;
end $f$;
revoke all on function public._convite_registra_marcas() from public, anon, authenticated;
drop trigger if exists trg_convite_registra_marcas on public.convites_promotor;
create trigger trg_convite_registra_marcas after insert on public.convites_promotor for each row execute function public._convite_registra_marcas();

-- sugestões para a tela de convite: marca + quantos produtos do catálogo da loja casam com ela
create or replace function public.listar_marcas(p_loja bigint, p_busca text default '') returns table(nome text, produtos int)
language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is null or coalesce(public.nivel_do_usuario(), 99) > 5 or not public.loja_ok(p_loja) then raise exception 'sem_permissao'; end if;
  perform public.rl_checar('listar_marcas', 60);
  return query
    select m.nome, (select count(*)::int from public.catalogo c where c.loja_id = m.loja_id and public._marca_casa(c.nome, m.nome))
    from public.marcas m
    where m.loja_id = p_loja and (coalesce(btrim(p_busca), '') = '' or public._sem_acento(m.nome) like '%' || public._sem_acento(left(btrim(p_busca), 30)) || '%')
    order by m.nome limit 15;
end $f$;
revoke all on function public.listar_marcas(bigint, text) from public, anon;
grant execute on function public.listar_marcas(bigint, text) to authenticated;

-- quantos produtos do catálogo casam com a marca digitada (confirma antes de criar o convite)
create or replace function public.contar_produtos_marca(p_loja bigint, p_marca text) returns int
language plpgsql security definer set search_path = public as $f$
declare m text := left(btrim(coalesce(p_marca, '')), 30);
begin
  if auth.uid() is null or coalesce(public.nivel_do_usuario(), 99) > 5 or not public.loja_ok(p_loja) then raise exception 'sem_permissao'; end if;
  perform public.rl_checar('contar_marca', 60);
  if length(m) < 3 then return 0; end if;
  return (select count(*)::int from public.catalogo c where c.loja_id = p_loja and public._marca_casa(c.nome, m));
end $f$;
revoke all on function public.contar_produtos_marca(bigint, text) from public, anon;
grant execute on function public.contar_produtos_marca(bigint, text) to authenticated;

-- preenche o registro com o catálogo que já existe (uma consulta por loja, sem laço por produto)
do $$
declare l bigint;
begin
  for l in select distinct loja_id from public.catalogo where loja_id is not null loop
    with palavras as (
      select distinct c.barcode, w from public.catalogo c,
        lateral regexp_split_to_table(regexp_replace(public._sem_acento(c.nome), '[^A-Z0-9. ]', ' ', 'g'), '\s+') w
      where c.loja_id = l and length(w) >= 3 and w !~ '[0-9.]' and w <> all(public._marca_stop())
    ), freq as (select w, count(*) n from palavras group by w),
    cand as (
      select c.barcode, t.w, t.ord, f.n from public.catalogo c,
        lateral regexp_split_to_table(regexp_replace(public._sem_acento(c.nome), '[^A-Z0-9. ]', ' ', 'g'), '\s+') with ordinality t(w, ord)
        join freq f on f.w = t.w
      where c.loja_id = l
    )
    insert into public.marcas (loja_id, nome, origem)
    select distinct l, w, 'catalogo' from (
      select distinct on (barcode) barcode, w from cand order by barcode, n desc, ord
    ) z
    on conflict do nothing;
  end loop;
end $$;

-- AUTO-TESTE
do $do$
declare ok boolean;
begin
  if public._sem_acento('Nestlé') <> 'NESTLE' then raise exception 'auto-teste: sem_acento'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_a_convite_marcas' and not tgisinternal) then raise exception 'auto-teste: trigger de marcas'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_produtos_promotor_marca' and not tgisinternal) then raise exception 'auto-teste: trigger do promotor'; end if;
  if not exists (select 1 from pg_class where relname = 'marcas' and relrowsecurity) then raise exception 'auto-teste: marcas sem RLS'; end if;
  if has_function_privilege('anon', 'public.listar_marcas(bigint,text)', 'execute') then raise exception 'auto-teste: listar_marcas aberta a anon'; end if;
  if not exists (select 1 from pg_proc p where p.proname = 'lancar_validade' and p.pronamespace = 'public'::regnamespace and position('_produto_da_marca' in pg_get_functiondef(p.oid)) > 0) then raise exception 'auto-teste: lancar_validade sem a regra nova'; end if;
  if position('acesso_total' in pg_get_functiondef('public.telegram_contexto(bigint)'::regprocedure)) = 0 then raise exception 'auto-teste: contexto sem acesso_total'; end if;
  -- casamento por palavra inteira, sem acento (função pura, não grava nada)
  if not public._marca_casa('CHOC. NESTLE CLASSIC', 'Nestlé') then raise exception 'auto-teste: nestle deveria casar'; end if;
  if not public._marca_casa('BISC. COOKIE TRAD. BAUDUCCO PACOTE 100G', 'bauducco') then raise exception 'auto-teste: bauducco deveria casar'; end if;
  if public._marca_casa('SNICKERS', 'NESTLE') then raise exception 'auto-teste: snickers nao deveria casar'; end if;
  if public._marca_casa('NESTLEZINHO', 'NESTLE') then raise exception 'auto-teste: palavra inteira'; end if;
  if public._marca_casa('HALLS MELANCIA', 'HA') then raise exception 'auto-teste: marca curta'; end if;
  if public._marca_casa('AXB', 'A.B') then raise exception 'auto-teste: regex'; end if;
  if not public._marca_casa('A.B CAFE', 'A.B') then raise exception 'auto-teste: regex literal'; end if;
end $do$;

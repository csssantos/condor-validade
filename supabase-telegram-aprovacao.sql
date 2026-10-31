-- Telegram: produto NOVO vai para APROVAÇÃO de encarregado (nível <= 5) ou superior antes de entrar no catálogo.
-- Quem lançou pelo bot não cria produto direto: o pedido (produto + validade + quantidade) fica pendente.
-- Encarregado+ pode EDITAR o produto (nome, setor, imagem), APROVAR (cadastra o produto e lança a validade) ou RECUSAR (com motivo, que volta pelo Telegram).
-- Ninguém edita a validade/quantidade lançada. Tudo na auditoria. Rode no SQL Editor do Supabase (pode rodar mais de uma vez; tem auto-teste).

create table if not exists public.aprovacoes_produto (
  id uuid primary key default gen_random_uuid(),
  loja_id bigint not null,
  usuario_id uuid not null,
  chat_id bigint not null,
  solicitante text not null,
  barcode text not null,
  nome text not null,
  setor text not null,
  foto text,
  validade date not null,
  quantidade numeric not null,
  op uuid not null default gen_random_uuid(),
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  motivo text,
  decidido_por text,
  decidido_por_id uuid,
  decidido_em timestamptz,
  notificado boolean not null default false,
  criado_em timestamptz not null default now()
);
create unique index if not exists aprovacoes_produto_pendente_uq on public.aprovacoes_produto (loja_id, barcode) where status = 'pendente';
create index if not exists aprovacoes_produto_loja_idx on public.aprovacoes_produto (loja_id, status, criado_em desc);

alter table public.aprovacoes_produto enable row level security;
drop policy if exists aprovacoes_produto_ler on public.aprovacoes_produto;
create policy aprovacoes_produto_ler on public.aprovacoes_produto for select to authenticated
  using (public.loja_ok(loja_id) and coalesce(public.nivel_do_usuario(), 99) <= 5);
revoke all on public.aprovacoes_produto from public, anon, authenticated;
grant select on public.aprovacoes_produto to authenticated;   -- escrita só pelas funções abaixo

-- 1) O bot envia o pedido (só service_role). Mesmas travas do cadastro + limites anti-enchente.
create or replace function public.telegram_enviar_aprovacao(p_chat_id bigint, p_barcode text, p_nome text, p_setor text,
  p_foto text, p_validade date, p_quantidade numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v record; u record; n int; soma int := 0; i int; novo uuid;
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
  if exists (select 1 from public.catalogo where barcode = bc and loja_id = v.loja_id) then raise exception 'produto_ja_existe'; end if;
  if exists (select 1 from public.aprovacoes_produto where barcode = bc and loja_id = v.loja_id and status = 'pendente') then raise exception 'pendente_ja_existe'; end if;

  -- limites: 15 pedidos/hora por pessoa, 10 pendentes por pessoa, 60 pendentes por loja (o catálogo da loja não enche de lixo)
  select count(*) into n from public.aprovacoes_produto where usuario_id = u.id and criado_em > now() - interval '1 hour';
  if n >= 15 then raise exception 'limite_excedido'; end if;
  select count(*) into n from public.aprovacoes_produto where usuario_id = u.id and status = 'pendente';
  if n >= 10 then raise exception 'muitas_pendencias'; end if;
  select count(*) into n from public.aprovacoes_produto where loja_id = v.loja_id and status = 'pendente';
  if n >= 60 then raise exception 'fila_cheia'; end if;

  insert into public.aprovacoes_produto (loja_id, usuario_id, chat_id, solicitante, barcode, nome, setor, foto, validade, quantidade)
    values (v.loja_id, u.id, p_chat_id, u.nome, bc, nm, p_setor, p_foto, p_validade, p_quantidade) returning id into novo;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (u.nome, 'enviou produto novo para aprovação (Telegram)',
            nm || ' · setor ' || p_setor || ' · validade ' || to_char(p_validade, 'DD/MM/YYYY') || ' · qtd ' || p_quantidade::text
            || case when p_foto is null then ' · sem imagem' else ' · com imagem' end, bc, v.loja_id);
  return novo;
end $$;
revoke all on function public.telegram_enviar_aprovacao(bigint, text, text, text, text, date, numeric) from public, anon, authenticated;
grant execute on function public.telegram_enviar_aprovacao(bigint, text, text, text, text, date, numeric) to service_role;

-- 2) Encarregado+ aprova (podendo corrigir nome, setor e imagem): cadastra o produto e lança a validade de quem pediu.
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
                                 'Via Telegram · aprovado por ' || coalesce(ap.nome, '—'), 15, null, null, a.op, true, null);
  update public.aprovacoes_produto set status = 'aprovado', nome = nm, setor = p_setor, foto = foto_final,
         decidido_por = coalesce(ap.nome, '—'), decidido_por_id = auth.uid(), decidido_em = now() where id = a.id;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (coalesce(ap.nome, '—'), 'aprovou produto novo (Telegram)', nm || ' · pedido de ' || a.solicitante, a.barcode, a.loja_id);
end $$;
revoke all on function public.aprovar_produto_novo(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.aprovar_produto_novo(uuid, text, text, text, boolean) to authenticated;

-- 3) Encarregado+ recusa com motivo (o motivo volta para quem lançou, pelo Telegram).
create or replace function public.recusar_produto_novo(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare a record; ap record; m text := btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null or coalesce(public.nivel_do_usuario(), 99) > 5 then raise exception 'sem_permissao'; end if;
  if length(m) < 5 or length(m) > 300 then raise exception 'motivo_invalido'; end if;
  select * into a from public.aprovacoes_produto where id = p_id for update;
  if not found then raise exception 'nao_encontrado'; end if;
  if not public.loja_ok(a.loja_id) then raise exception 'sem_permissao'; end if;
  if a.status <> 'pendente' then raise exception 'ja_decidido'; end if;
  select id, nome into ap from public.usuarios where id = auth.uid();
  update public.aprovacoes_produto set status = 'recusado', motivo = m, decidido_por = coalesce(ap.nome, '—'), decidido_por_id = auth.uid(), decidido_em = now() where id = a.id;
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (coalesce(ap.nome, '—'), 'recusou produto novo (Telegram)', a.nome || ' · pedido de ' || a.solicitante || ' · motivo: ' || m, a.barcode, a.loja_id);
end $$;
revoke all on function public.recusar_produto_novo(uuid, text) from public, anon;
grant execute on function public.recusar_produto_novo(uuid, text) to authenticated;

-- 4) Retenção: pedidos decididos são apagados após 90 dias (descrito na Privacidade)
do $$ begin
  perform cron.schedule('aprovacoes_produto_limpar', '17 3 * * *',
    $c$ delete from public.aprovacoes_produto where status <> 'pendente' and decidido_em < now() - interval '90 days' $c$);
exception when others then null; end $$;

-- 5) "Baixar meus dados" passa a incluir os pedidos de produto novo da pessoa
do $$
declare d text;
begin
  select pg_get_functiondef('public._rl_exportar_meus_dados'::regproc) into d;
  if d not like '%aprovacoes_produto%' then
    d := replace(d, '''telegram'', (', '''pedidos_produto_novo'', coalesce((select jsonb_agg(jsonb_build_object(''produto'', a.nome, ''codigo'', a.barcode, ''status'', a.status, ''motivo'', a.motivo, ''criado_em'', a.criado_em) order by a.criado_em desc) from public.aprovacoes_produto a where a.usuario_id = auth.uid()), ''[]''::jsonb),' || chr(10) || '    ''telegram'', (');
    if d not like '%aprovacoes_produto%' then raise exception 'nao consegui ajustar exportar_meus_dados'; end if;
    execute d;
  end if;
end $$;

-- auto-teste
do $$
begin
  begin perform public.telegram_enviar_aprovacao(-1, '7891000100103', 'TESTE PRODUTO', 'Mercearia', null, current_date + 10, 3); raise exception 'deveria barrar';
  exception when others then if sqlerrm <> 'sem_permissao' then raise exception 'auto-teste 1: %', sqlerrm; end if; end;
  begin perform public.aprovar_produto_novo(gen_random_uuid(), 'TESTE PRODUTO', 'Mercearia'); raise exception 'deveria barrar';
  exception when others then if sqlerrm <> 'sem_permissao' then raise exception 'auto-teste 2: %', sqlerrm; end if; end;
  begin perform public.recusar_produto_novo(gen_random_uuid(), 'sem motivo real'); raise exception 'deveria barrar';
  exception when others then if sqlerrm <> 'sem_permissao' then raise exception 'auto-teste 3: %', sqlerrm; end if; end;
end $$;

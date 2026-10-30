-- ============================================================================
-- INTELIGÊNCIA OPERACIONAL — estrutura (já aplicada no projeto fbovltxucooeoldjfckk)
-- ============================================================================

-- Registro de perdas: reaproveita a tabela historico (mesma trilha das baixas, sem duplicar dados)
alter table public.historico
  add column if not exists tipo_perda text,          -- vencimento | avaria | embalagem | quebra | improprio | outros
  add column if not exists quantidade_medida numeric, -- aceita fração (ex.: 1,25 KG)
  add column if not exists unidade_medida text,
  add column if not exists observacoes text,
  add column if not exists foto_ocorrencia text,
  add column if not exists registrado_por_id uuid,
  add column if not exists origem text not null default 'baixa'; -- baixa (fluxo antigo) | perda (módulo novo)
alter table public.historico add constraint historico_tipo_perda_chk
  check (tipo_perda is null or tipo_perda in ('vencimento','avaria','embalagem','quebra','improprio','outros'));
create index if not exists historico_loja_data_idx on public.historico (loja_id, data_baixa desc);
create index if not exists historico_loja_barcode_idx on public.historico (loja_id, barcode);

-- Visão normalizada de perdas: baixas antigas de produto vencido + perdas registradas no módulo novo.
-- Não entram: devolução ao fornecedor, promoção aplicada, erro de cadastro.
create or replace view public.v_perdas with (security_invoker = true) as
select h.id, h.loja_id, h.barcode, h.nome, h.setor, public.setor_principal(h.setor) as setor_principal,
  coalesce(h.quantidade_medida, h.quantidade::numeric) as quantidade,
  coalesce(h.unidade_medida, case when h.por_peso then 'KG' else 'UN' end) as unidade,
  coalesce(h.tipo_perda, 'vencimento') as tipo,
  coalesce(h.quantidade_medida, h.quantidade::numeric) * coalesce(h.preco_unitario, 0) as valor,
  h.data_baixa as data, h.registrado_por, h.registrado_por_id, h.origem, h.motivo, h.observacoes,
  (h.foto_ocorrencia is not null) as tem_foto
from public.historico h
where h.tipo_perda is not null
   or (h.origem = 'baixa' and h.vencido_antes and coalesce(h.motivo,'') not in ('Devolução ao fornecedor','Promoção aplicada','Erro de cadastro'));

-- Ronda inteligente
alter table public.rondas add column if not exists modo text not null default 'completa',
  add column if not exists amostra integer, add column if not exists acao_preventiva_id uuid;
alter table public.ronda_itens add column if not exists risco integer, add column if not exists risco_nivel text,
  add column if not exists ordem integer;

-- Ações preventivas (planos de ação) — leitura pela regra de setor existente; escrita só por função
create table public.acoes_preventivas (
  id uuid primary key default gen_random_uuid(),
  loja_id bigint not null,
  alvo_tipo text not null check (alvo_tipo in ('setor','produto')),
  setor text not null, barcode text, alvo_nome text not null,
  problema text not null,
  evidencias jsonb not null default '{}'::jsonb,
  acoes jsonb not null default '[]'::jsonb,
  status text not null default 'aberta' check (status in ('aberta','em_andamento','concluida','cancelada')),
  origem text not null default 'manual',
  linha_base jsonb, ronda_id uuid, ocorrencia_id uuid,
  criado_por uuid, criado_por_nome text, criado_em timestamptz not null default now(),
  concluido_em timestamptz, atualizado_em timestamptz not null default now());
alter table public.acoes_preventivas enable row level security;
create policy acoes_preventivas_ver on public.acoes_preventivas for select to authenticated
  using (public.pode_gerir_setor(setor, loja_id));

-- Assistente de IA: conversas, mensagens, cota diária e registro de ações
create table public.ia_conversas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid(), loja_id bigint,
  titulo text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
create table public.ia_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.ia_conversas(id) on delete cascade,
  usuario_id uuid not null default auth.uid(),
  papel text not null check (papel in ('usuario','assistente','erro')),
  conteudo text not null, extras jsonb, criado_em timestamptz not null default now());
create table public.ia_uso (
  usuario_id uuid not null, dia date not null default current_date, perguntas integer not null default 0,
  primary key (usuario_id, dia));
create table public.ia_acoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid(), usuario_nome text, loja_id bigint,
  conversa_id uuid, tipo text not null, dados jsonb, resultado text, criado_em timestamptz not null default now());
alter table public.ia_conversas enable row level security;
alter table public.ia_mensagens enable row level security;
alter table public.ia_uso enable row level security;
alter table public.ia_acoes enable row level security;
create policy ia_conversas_dono on public.ia_conversas for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy ia_mensagens_dono on public.ia_mensagens for all to authenticated using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid() and exists (select 1 from public.ia_conversas c where c.id = conversa_id and c.usuario_id = auth.uid()));
create policy ia_uso_dono on public.ia_uso for select to authenticated using (usuario_id = auth.uid());
create policy ia_acoes_ver on public.ia_acoes for select to authenticated using (usuario_id = auth.uid() or public.nivel_do_usuario() <= 2);
create index ia_mensagens_conversa_idx on public.ia_mensagens (conversa_id, criado_em);
create index ia_conversas_usuario_idx on public.ia_conversas (usuario_id, atualizado_em desc);

-- Escopo das análises: encarregado (5) ou acima; loja do usuário, ou qualquer loja para gestão global (≤2)
create or replace function public._loja_analise(p_loja bigint)
returns bigint language plpgsql stable security definer set search_path to 'public' as $$
declare v bigint := coalesce(p_loja, public.loja_do_usuario()); n int := public.nivel_do_usuario();
begin
  if n is null or n > 5 then raise exception 'sem_permissao'; end if;
  if v is null or (v is distinct from public.loja_do_usuario() and not public.eh_gestao_global()) then raise exception 'sem_permissao'; end if;
  return v;
end $$;

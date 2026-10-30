-- ============================================================================
-- PAINEL DA REDE (ao vivo) + configuração do assistente de IA
-- (já aplicado no projeto fbovltxucooeoldjfckk)
-- ============================================================================

-- Modelo Gemini que respondeu bem por último (evita testar modelos sobrecarregados a cada pergunta)
create table if not exists public.ia_config (
  chave text primary key,
  valor text,
  atualizado_em timestamptz default now());
alter table public.ia_config enable row level security;

create or replace function public.ia_modelo_preferido()
returns text language sql stable security definer set search_path to 'public' as $$
  select valor from public.ia_config where chave = 'modelo_bom' and atualizado_em > now() - interval '12 hours'
$$;

create or replace function public.ia_salvar_modelo(p_modelo text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_modelo is null or p_modelo !~ '^gemini-[a-z0-9.\-]+$' then return; end if;
  insert into public.ia_config (chave, valor, atualizado_em) values ('modelo_bom', p_modelo, now())
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end $$;

-- Painel da Rede: tudo calculado direto das tabelas (não depende do resumo enviado pelos celulares).
-- Acesso: gerente geral (3) ou acima.
create or replace function public.painel_rede(p_dias integer default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare d int := greatest(1, least(coalesce(p_dias,30), 365)); r jsonb;
begin
  if public.nivel_do_usuario() is null or public.nivel_do_usuario() > 3 then raise exception 'sem_permissao'; end if;
  with l as (select id, numero_loja, cidade, estado from public.lojas where ativo),
  prod as (
    select p.loja_id, p.setor, public.setor_principal(p.setor) sp, p.validade, coalesce(p.quantidade,0) qtd, coalesce(p.preco_unitario,0) preco,
      (p.validade - current_date) dias, coalesce(p.dias_alerta, 3) alerta
    from public.produtos p where p.validade is not null),
  per as (select * from public.v_perdas where data >= now() - make_interval(days => 2 * d)),
  rnd as (select * from public.rondas where criado_em >= now() - make_interval(days => d)),
  oc as (select * from public.ocorrencias where status not in ('concluida','rascunho')),
  por_loja as (
    select l.id, l.numero_loja, l.cidade, l.estado,
      (select count(*) from prod where loja_id = l.id) monitorados,
      (select coalesce(round(sum(qtd*preco)::numeric,2),0) from prod where loja_id = l.id) valor_monitorado,
      (select count(*) from prod where loja_id = l.id and dias < 0) vencidos,
      (select count(*) from prod where loja_id = l.id and dias >= 0 and dias <= alerta) atencao,
      (select coalesce(round(sum(qtd*preco)::numeric,2),0) from prod where loja_id = l.id and dias <= alerta) valor_risco,
      (select count(*) from prod where loja_id = l.id and dias between 0 and 7) vencem_7d,
      (select count(*) from per where loja_id = l.id and data >= now() - make_interval(days => d)) perdas,
      (select coalesce(round(sum(valor)::numeric,2),0) from per where loja_id = l.id and data >= now() - make_interval(days => d)) valor_perdas,
      (select count(*) from per where loja_id = l.id and data < now() - make_interval(days => d)) perdas_ant,
      (select coalesce(round(sum(valor)::numeric,2),0) from per where loja_id = l.id and data < now() - make_interval(days => d)) valor_perdas_ant,
      (select count(*) from rnd where loja_id = l.id) rondas,
      (select count(*) from rnd where loja_id = l.id and status in ('agendada','aguardando_inicio','em_andamento')) rondas_abertas,
      (select count(*) from rnd where loja_id = l.id and status in ('finalizada','concluida')) rondas_concluidas,
      (select coalesce(sum(total_itens),0) from rnd where loja_id = l.id) itens_ronda,
      (select coalesce(sum(total_verificado),0) from rnd where loja_id = l.id) itens_conferidos,
      (select coalesce(sum(vencido_count),0) from rnd where loja_id = l.id) irregularidades,
      (select count(*) from oc where loja_id = l.id) tarefas_abertas,
      (select count(*) from oc where loja_id = l.id and prazo < now()) tarefas_atrasadas,
      (select count(*) from public.acoes_preventivas a where a.loja_id = l.id and a.status in ('aberta','em_andamento')) acoes_abertas,
      (select count(*) from public.usuarios u where u.loja_id = l.id and u.ativo and not coalesce(u.promotor,false)) equipe,
      (select count(*) from public.usuarios u where u.loja_id = l.id and u.ativo and u.last_login_at >= now() - interval '7 days') ativos_7d,
      (select max(x) from (select max(criado_em) x from public.produtos where loja_id = l.id
                           union all select max(data_baixa) from public.historico where loja_id = l.id
                           union all select max(criado_em) from public.rondas where loja_id = l.id) z) ultima_atividade,
      (select coalesce(jsonb_agg(jsonb_build_object('setor', sp, 'vencidos', v, 'atencao', a, 'valor_risco', vr) order by vr desc), '[]') from (
          select sp, count(*) filter (where dias < 0) v, count(*) filter (where dias >= 0 and dias <= alerta) a,
                 round(sum(qtd*preco) filter (where dias <= alerta)::numeric,2) vr
          from prod where loja_id = l.id group by sp having count(*) filter (where dias <= alerta) > 0) s) setores_risco,
      (select coalesce(jsonb_agg(jsonb_build_object('setor', setor_principal, 'registros', n, 'valor', v) order by v desc), '[]') from (
          select setor_principal, count(*) n, round(sum(valor)::numeric,2) v from per where loja_id = l.id and data >= now() - make_interval(days => d) group by 1) s) setores_perdas,
      (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'registros', n, 'valor', v) order by n desc, v desc), '[]') from (
          select max(nome) nome, count(*) n, round(sum(valor)::numeric,2) v from per where loja_id = l.id and data >= now() - make_interval(days => d)
          group by barcode order by count(*) desc, sum(valor) desc limit 5) s) top_produtos,
      (select coalesce(jsonb_agg(coalesce(n,0) order by w), '[]') from (
          select gs::date w from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') gs) s
          left join (select date_trunc('week', data)::date wk, count(*) n from public.v_perdas where loja_id = l.id and data >= now() - interval '13 weeks' group by 1) a on a.wk = s.w) serie
    from l)
  select jsonb_build_object(
    'periodo_dias', d,
    'lojas', (select coalesce(jsonb_agg(to_jsonb(p) order by p.valor_risco desc), '[]') from por_loja p),
    'semanas', (select coalesce(jsonb_agg(to_char(gs, 'DD/MM') order by gs), '[]') from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') gs),
    'serie_rede', (select coalesce(jsonb_agg(jsonb_build_object('semana', to_char(w, 'DD/MM'), 'registros', coalesce(n,0), 'valor', coalesce(vl,0)) order by w), '[]')
        from (select gs::date w from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') gs) s
        left join (select date_trunc('week', data)::date wk, count(*) n, round(sum(valor)::numeric,2) vl from public.v_perdas where data >= now() - interval '13 weeks' group by 1) a on a.wk = s.w),
    'por_setor', (select coalesce(jsonb_agg(jsonb_build_object('setor', sp, 'registros', n, 'valor', v) order by v desc), '[]') from (
        select setor_principal sp, count(*) n, round(sum(valor)::numeric,2) v from per where data >= now() - make_interval(days => d) group by 1) s),
    'por_motivo', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'registros', n, 'valor', v) order by n desc), '[]') from (
        select tipo, count(*) n, round(sum(valor)::numeric,2) v from per where data >= now() - make_interval(days => d) group by 1) s),
    'gerado_em', now()) into r;
  return r;
end $$;

-- ============================================================================
-- INTELIGÊNCIA OPERACIONAL — análises (risco, perdas, previsões, ações)
-- Todas as funções: SECURITY DEFINER, mas filtram por loja e por setor usando
-- as regras que já existem (nivel_do_usuario, loja_do_usuario, pode_gerir_setor).
-- Funcionário (nível 6) não acessa análises; encarregado (5) só o próprio setor.
-- ============================================================================

-- risco por produto: pesos revisados (lote vencido na gôndola pesa mais)
create or replace function public.analise_risco_produtos(p_loja bigint default null, p_setor text default null)
returns table (barcode text, nome text, setor text, subsetor text, score integer, nivel text, fatores jsonb,
  ultima_conferencia timestamptz, eventos integer, validade_lote date)
language plpgsql stable security definer set search_path to 'public' as $$
declare v bigint := public._loja_analise(p_loja);
begin
  return query
  with cat as (
    select c.barcode, c.nome, public.setor_principal(c.setor) sp, public.subsetor_efetivo(c.setor, c.subsetor) sub
    from public.catalogo c
    where c.loja_id = v and public.pode_gerir_setor(public.setor_principal(c.setor), v)
      and (p_setor is null or lower(public.setor_principal(c.setor)) = lower(p_setor))),
  per as (
    select vp.barcode,
      count(*) filter (where vp.tipo = 'vencimento' and vp.data >= now() - interval '90 days') v90,
      count(*) filter (where vp.tipo = 'vencimento' and vp.data >= now() - interval '30 days') v30,
      count(*) filter (where vp.tipo <> 'vencimento' and vp.data >= now() - interval '90 days') o90
    from public.v_perdas vp where vp.loja_id = v group by vp.barcode),
  con as (
    select ri.barcode,
      count(*) filter (where ri.resultado = 'irregular' and ri.conferido_em >= now() - interval '90 days') irr,
      count(*) filter (where ri.resultado = 'atencao' and ri.conferido_em >= now() - interval '90 days') ate,
      max(ri.conferido_em) filter (where ri.resultado <> 'pendente') ult
    from public.ronda_itens ri join public.rondas r on r.id = ri.ronda_id
    where r.loja_id = v group by ri.barcode),
  lot as (select p.barcode, min(p.validade) mv from public.produtos p where p.loja_id = v and p.validade is not null group by p.barcode),
  base as (
    select cat.*, coalesce(per.v90,0)::int v90, coalesce(per.v30,0)::int v30, coalesce(per.o90,0)::int o90,
      coalesce(con.irr,0)::int irr, coalesce(con.ate,0)::int ate, con.ult, lot.mv,
      case when lot.mv is null then null else (lot.mv - current_date) end dias
    from cat left join per on per.barcode = cat.barcode left join con on con.barcode = cat.barcode left join lot on lot.barcode = cat.barcode),
  pts as (
    select b.*,
      least(30, b.v90*8 + b.v30*4) p_venc,
      least(20, b.irr*8) p_irr,
      least(8, b.ate*3) p_ate,
      case when b.dias is null then 0 when b.dias < 0 then 30 when b.dias <= 7 then 18 when b.dias <= 15 then 10 when b.dias <= 30 then 4 else 0 end p_lote,
      least(10, b.o90*4) p_outras,
      case when b.ult is null then 6 when b.ult < now() - interval '30 days' then 6 when b.ult < now() - interval '14 days' then 3 else 0 end p_conf
    from base b),
  fim as (select pts.*, least(100, pts.p_venc + pts.p_irr + pts.p_ate + pts.p_lote + pts.p_outras + pts.p_conf)::int sc from pts)
  select fim.barcode, fim.nome, fim.sp, fim.sub, fim.sc,
    case when fim.sc >= 60 then 'alta' when fim.sc >= 30 then 'media' else 'baixa' end,
    jsonb_strip_nulls(jsonb_build_object(
      'vencimentos_90d', nullif(fim.v90,0), 'vencimentos_30d', nullif(fim.v30,0),
      'irregularidades_90d', nullif(fim.irr,0), 'atencao_90d', nullif(fim.ate,0),
      'outras_perdas_90d', nullif(fim.o90,0), 'dias_para_vencer_lote', fim.dias,
      'nunca_conferido', case when fim.ult is null then true end,
      'dias_sem_conferir', case when fim.ult is not null then (current_date - fim.ult::date) end,
      'pontos', jsonb_build_object('vencimentos', fim.p_venc, 'irregularidades', fim.p_irr + fim.p_ate, 'lote_atual', fim.p_lote,
        'outras_perdas', fim.p_outras, 'tempo_sem_conferir', fim.p_conf))),
    fim.ult, (fim.v90 + fim.o90 + fim.irr + fim.ate)::int, fim.mv
  from fim
  order by fim.sc desc, fim.nome;
end $$;

-- ---------------------------------------------------------------------------
-- Painel de perdas (período, setor opcional)
create or replace function public.analise_perdas(p_loja bigint default null, p_dias integer default 30, p_setor text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v bigint := public._loja_analise(p_loja); d int := greatest(1, least(coalesce(p_dias,30), 365)); r jsonb;
begin
  with vis as (
    select vp.* from public.v_perdas vp
    where vp.loja_id = v and public.pode_gerir_setor(vp.setor_principal, v)
      and (p_setor is null or lower(vp.setor_principal) = lower(p_setor))),
  per as (select * from vis where data >= now() - make_interval(days => d)),
  irr as (
    select ri.barcode, ri.nome, r.setor, ri.conferido_em from public.ronda_itens ri join public.rondas r on r.id = ri.ronda_id
    where r.loja_id = v and ri.resultado = 'irregular' and ri.conferido_em >= now() - make_interval(days => d)
      and public.pode_gerir_setor(r.setor, v) and (p_setor is null or lower(r.setor) = lower(p_setor))),
  prod as (
    select p.* from public.produtos p where p.loja_id = v and p.validade is not null
      and public.pode_gerir_setor(public.setor_principal(p.setor), v) and (p_setor is null or lower(public.setor_principal(p.setor)) = lower(p_setor)))
  select jsonb_build_object(
    'periodo_dias', d,
    'total_registros', (select count(*) from per),
    'valor_total', (select coalesce(round(sum(valor)::numeric, 2), 0) from per),
    'irregularidades_rondas', (select count(*) from irr),
    'quebras', (select count(*) from per where tipo = 'quebra'),
    'vencidos_agora', (select count(*) from prod where validade < current_date),
    'proximos_7_dias', (select count(*) from prod where validade between current_date and current_date + 7),
    'por_tipo', (select coalesce(jsonb_agg(x order by x->>'tipo'), '[]') from (select jsonb_build_object('tipo', tipo, 'registros', count(*), 'valor', round(sum(valor)::numeric,2)) x from per group by tipo) t),
    'por_setor', (select coalesce(jsonb_agg(x order by (x->>'registros')::int desc), '[]') from (
        select jsonb_build_object('setor', coalesce(s.setor, i.setor), 'registros', coalesce(s.n,0), 'valor', coalesce(s.v,0), 'irregularidades', coalesce(i.n,0)) x
        from (select setor_principal setor, count(*) n, round(sum(valor)::numeric,2) v from per group by 1) s
        full join (select setor, count(*) n from irr group by 1) i on i.setor = s.setor) t),
    'top_produtos', (select coalesce(jsonb_agg(x order by (x->>'registros')::int desc, (x->>'valor')::numeric desc), '[]') from (
        select jsonb_build_object('barcode', barcode, 'nome', max(nome), 'setor', max(setor_principal), 'registros', count(*), 'valor', round(sum(valor)::numeric,2)) x
        from per group by barcode order by count(*) desc, sum(valor) desc limit 10) t),
    'semanal', (select coalesce(jsonb_agg(jsonb_build_object('semana', to_char(w, 'DD/MM'), 'registros', coalesce(n,0), 'valor', coalesce(vl,0)) order by w), '[]')
        from (select gs::date w from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') gs) s
        left join (select date_trunc('week', data)::date wk, count(*) n, round(sum(valor)::numeric,2) vl from vis group by 1) a on a.wk = s.w),
    'mensal', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m, 'MM/YYYY'), 'registros', coalesce(n,0), 'valor', coalesce(vl,0)) order by m), '[]')
        from (select gs::date m from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') gs) s
        left join (select date_trunc('month', data)::date mo, count(*) n, round(sum(valor)::numeric,2) vl from vis group by 1) a on a.mo = s.m),
    'gerado_em', now()) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Histórico de um produto (ocorrências, conferências, perdas, lotes, risco)
create or replace function public.analise_produto(p_barcode text, p_loja bigint default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v bigint := public._loja_analise(p_loja); c record; r jsonb;
begin
  select cc.barcode, cc.nome, public.setor_principal(cc.setor) sp into c from public.catalogo cc where cc.loja_id = v and cc.barcode = p_barcode;
  if not found then raise exception 'produto_nao_encontrado'; end if;
  if not public.pode_gerir_setor(c.sp, v) then raise exception 'setor_nao_permitido'; end if;
  select jsonb_build_object(
    'barcode', c.barcode, 'nome', c.nome, 'setor', c.sp,
    'risco', (select to_jsonb(a) from public.analise_risco_produtos(v, c.sp) a where a.barcode = c.barcode),
    'perdas', (select coalesce(jsonb_agg(jsonb_build_object('data', data, 'tipo', tipo, 'quantidade', quantidade, 'unidade', unidade, 'valor', round(valor::numeric,2),
        'registrado_por', registrado_por, 'motivo', motivo, 'observacoes', observacoes) order by data desc), '[]')
        from (select * from public.v_perdas where loja_id = v and barcode = c.barcode order by data desc limit 50) x),
    'conferencias', (select coalesce(jsonb_agg(jsonb_build_object('data', ri.conferido_em, 'resultado', ri.resultado, 'validade', ri.validade_encontrada,
        'por', ri.conferido_por, 'obs', ri.observacao, 'ronda', r.titulo) order by ri.conferido_em desc), '[]')
        from public.ronda_itens ri join public.rondas r on r.id = ri.ronda_id
        where r.loja_id = v and ri.barcode = c.barcode and ri.resultado <> 'pendente'),
    'lotes_ativos', (select coalesce(jsonb_agg(jsonb_build_object('validade', validade, 'quantidade', quantidade) order by validade), '[]')
        from public.produtos where loja_id = v and barcode = c.barcode),
    'alteracoes_validade', (select count(*) from public.validade_alteracoes va where va.barcode = c.barcode)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Previsão operacional: só gera previsão quando há histórico suficiente
create or replace function public.previsoes_operacionais(p_loja bigint default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v bigint := public._loja_analise(p_loja); cards jsonb := '[]'; insuf jsonb := '[]'; s record; p record;
  total_eventos int; semanas_com_dado int; span_dias int;
begin
  -- base de dados disponível na loja
  select count(*), coalesce(max(data)::date - min(data)::date, 0) into total_eventos, span_dias
    from public.v_perdas where loja_id = v and data >= now() - interval '120 days';

  -- SETORES: compara 4 semanas recentes com as 4 anteriores (perdas + irregularidades de ronda)
  for s in
    with ev as (
      select setor_principal setor, data from public.v_perdas where loja_id = v and data >= now() - interval '56 days'
      union all
      select r.setor, ri.conferido_em from public.ronda_itens ri join public.rondas r on r.id = ri.ronda_id
        where r.loja_id = v and ri.resultado = 'irregular' and ri.conferido_em >= now() - interval '56 days')
    select setor,
      count(*) filter (where data >= now() - interval '28 days') rec,
      count(*) filter (where data < now() - interval '28 days') ant,
      count(distinct date_trunc('week', data)) semanas,
      max(data) ultimo
    from ev where public.pode_gerir_setor(setor, v) group by setor
  loop
    if s.rec + s.ant < 4 or s.semanas < 3 then
      insuf := insuf || jsonb_build_object('alvo', s.setor, 'tipo_alvo', 'setor', 'eventos', s.rec + s.ant, 'semanas_com_dados', s.semanas);
      continue;
    end if;
    cards := cards || jsonb_build_object(
      'tipo_alvo', 'setor', 'alvo', s.setor, 'setor', s.setor,
      'tipo_risco', 'Perdas e irregularidades no setor',
      'tendencia', case when s.rec >= s.ant * 1.25 and s.rec - s.ant >= 2 then 'subindo' when s.rec <= s.ant * 0.75 and s.ant - s.rec >= 2 then 'caindo' else 'estavel' end,
      'nivel', case when s.rec >= 8 or (s.rec >= s.ant * 1.25 and s.rec - s.ant >= 3) then 'alto' when s.rec >= 4 or s.rec > s.ant then 'medio' else 'baixo' end,
      'justificativa', format('%s ocorrência(s) nas últimas 4 semanas contra %s nas 4 anteriores (perdas registradas + irregularidades de ronda).', s.rec, s.ant),
      'dados', jsonb_build_object('ultimas_4_semanas', s.rec, '4_semanas_anteriores', s.ant, 'semanas_com_dados', s.semanas),
      'confianca', case when s.rec + s.ant >= 15 and s.semanas >= 6 then 'alta' when s.rec + s.ant >= 8 and s.semanas >= 4 then 'media' else 'baixa' end,
      'recomendacao', case when s.rec > s.ant then 'Criar ronda preventiva priorizada por risco e aumentar a frequência de conferência no setor.'
                           else 'Manter a frequência atual de conferência e acompanhar os produtos de maior risco.' end,
      'acao_sugerida', case when s.rec > s.ant then 'ronda_preventiva' else 'acompanhar' end);
  end loop;

  -- PRODUTOS: recorrência de vencimento / irregularidade + lote atual
  for p in
    select a.* from public.analise_risco_produtos(v, null) a
    where coalesce((a.fatores->>'vencimentos_90d')::int,0) >= 2
       or coalesce((a.fatores->>'irregularidades_90d')::int,0) >= 2
       or (coalesce((a.fatores->>'vencimentos_90d')::int,0) + coalesce((a.fatores->>'irregularidades_90d')::int,0) >= 1
           and (a.fatores->>'dias_para_vencer_lote') is not null and (a.fatores->>'dias_para_vencer_lote')::int <= 15)
    limit 30
  loop
    cards := cards || jsonb_build_object(
      'tipo_alvo', 'produto', 'alvo', p.nome, 'barcode', p.barcode, 'setor', p.setor,
      'tipo_risco', case when coalesce((p.fatores->>'irregularidades_90d')::int,0) >= 2 then 'Irregularidade recorrente em conferências' else 'Vencimento recorrente' end,
      'tendencia', case when coalesce((p.fatores->>'vencimentos_30d')::int,0) >= 1 then 'subindo' else 'estavel' end,
      'nivel', case p.nivel when 'alta' then 'alto' when 'media' then 'medio' else 'baixo' end,
      'justificativa', concat_ws('; ',
          case when (p.fatores->>'vencimentos_90d') is not null then (p.fatores->>'vencimentos_90d') || ' vencimento(s) em 90 dias' end,
          case when (p.fatores->>'irregularidades_90d') is not null then (p.fatores->>'irregularidades_90d') || ' irregularidade(s) em rondas em 90 dias' end,
          case when (p.fatores->>'dias_para_vencer_lote') is not null then
            case when (p.fatores->>'dias_para_vencer_lote')::int < 0 then 'lote cadastrado já vencido há ' || abs((p.fatores->>'dias_para_vencer_lote')::int) || ' dia(s)'
                 else 'lote atual vence em ' || (p.fatores->>'dias_para_vencer_lote') || ' dia(s)' end end,
          case when (p.fatores->>'nunca_conferido') is not null then 'nunca conferido em ronda' end),
      'dados', p.fatores,
      'score', p.score,
      'confianca', case when p.eventos >= 4 then 'alta' when p.eventos >= 2 then 'media' else 'baixa' end,
      'recomendacao', 'Incluir na próxima ronda priorizada e revisar a validade dos lotes deste produto.',
      'acao_sugerida', 'revisar_produto');
  end loop;

  return jsonb_build_object(
    'cards', cards,
    'sem_dados_suficientes', insuf,
    'base', jsonb_build_object('eventos_120_dias', total_eventos, 'dias_de_historico', span_dias,
      'suficiente', total_eventos >= 10 and span_dias >= 21),
    'gerado_em', now());
end $$;

-- ---------------------------------------------------------------------------
-- Registrar perda (não mexe em estoque/produtos; só grava a ocorrência)
create or replace function public.registrar_perda(p_barcode text, p_nome text, p_setor text, p_quantidade numeric, p_unidade text,
  p_tipo text, p_data date default null, p_foto text default null, p_obs text default null, p_loja bigint default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v bigint := coalesce(p_loja, public.loja_do_usuario()); n int := public.nivel_do_usuario(); u record; preco numeric; id uuid; sp text := public.setor_principal(p_setor);
  cod text := nullif(regexp_replace(coalesce(p_barcode,''), '\D', '', 'g'), '');
begin
  select * into u from public.usuarios where usuarios.id = auth.uid();
  if not found or not u.ativo or coalesce(u.promotor,false) then raise exception 'sem_permissao'; end if;
  if v is null or (v is distinct from public.loja_do_usuario() and not public.eh_gestao_global()) then raise exception 'sem_permissao'; end if;
  if n is null then raise exception 'sem_permissao'; end if;
  if n <= 5 then
    if not public.pode_gerir_setor(sp, v) then raise exception 'setor_nao_permitido'; end if;
  elsif lower(coalesce(u.setor,'')) <> lower(coalesce(sp,'')) then raise exception 'setor_nao_permitido'; end if;
  if cod is null then raise exception 'codigo_obrigatorio'; end if;
  if p_tipo not in ('vencimento','avaria','embalagem','quebra','improprio','outros') then raise exception 'motivo_invalido'; end if;
  if p_quantidade is null or p_quantidade <= 0 or p_quantidade > 100000 then raise exception 'quantidade_invalida'; end if;
  if nullif(trim(coalesce(p_nome,'')),'') is null then raise exception 'produto_obrigatorio'; end if;
  if p_data is not null and p_data > current_date then raise exception 'data_futura'; end if;
  if p_foto is not null and length(p_foto) > 2000000 then raise exception 'foto_grande'; end if;
  if p_tipo = 'outros' and nullif(trim(coalesce(p_obs,'')),'') is null then raise exception 'outros_exige_obs'; end if;
  select coalesce((select c.preco_unitario from public.catalogo c where c.loja_id = v and c.barcode = cod and c.preco_unitario > 0),
                  (select pr.preco_unitario from public.produtos pr where pr.loja_id = v and pr.barcode = cod and pr.preco_unitario > 0 order by pr.criado_em desc limit 1), 0)
    into preco;
  insert into public.historico (barcode, loja_id, nome, setor, quantidade, quantidade_medida, unidade_medida, preco_unitario, por_peso,
      motivo, data_baixa, registrado_por, registrado_por_id, vencido_antes, tipo_perda, origem, observacoes, foto_ocorrencia)
    values (cod, v, trim(p_nome), p_setor, greatest(1, ceil(p_quantidade))::int, p_quantidade, upper(coalesce(p_unidade,'UN')),
      coalesce(preco,0), upper(coalesce(p_unidade,'')) in ('KG','G'),
      'Perda registrada', case when p_data is null or p_data = current_date then now() else p_data::timestamptz + interval '12 hours' end,
      u.nome, auth.uid(), p_tipo = 'vencimento', p_tipo, 'perda', nullif(trim(coalesce(p_obs,'')),''), p_foto)
    returning historico.id into id;
  return id;
end $$;

-- ---------------------------------------------------------------------------
-- Ações preventivas
create or replace function public._linha_base(v bigint, p_setor text, p_barcode text, p_ate timestamptz, p_dias int)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public.nivel_do_usuario() is null or public.nivel_do_usuario() > 5 or not public.pode_gerir_setor(p_setor, v) then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'perdas', (select count(*) from public.v_perdas where loja_id = v and data < p_ate and data >= p_ate - make_interval(days => p_dias)
                 and (case when p_barcode is not null then barcode = p_barcode else lower(setor_principal) = lower(p_setor) end)),
    'valor', (select coalesce(round(sum(valor)::numeric,2),0) from public.v_perdas where loja_id = v and data < p_ate and data >= p_ate - make_interval(days => p_dias)
                 and (case when p_barcode is not null then barcode = p_barcode else lower(setor_principal) = lower(p_setor) end)),
    'irregularidades', (select count(*) from public.ronda_itens ri join public.rondas r on r.id = ri.ronda_id
                 where r.loja_id = v and ri.resultado = 'irregular' and ri.conferido_em < p_ate and ri.conferido_em >= p_ate - make_interval(days => p_dias)
                 and (case when p_barcode is not null then ri.barcode = p_barcode else lower(r.setor) = lower(p_setor) end)),
    'dias', p_dias);
end $$;

create or replace function public.criar_acao_preventiva(p_alvo_tipo text, p_setor text, p_barcode text, p_alvo_nome text, p_problema text,
  p_evidencias jsonb default '{}'::jsonb, p_acoes jsonb default '[]'::jsonb, p_origem text default 'manual', p_loja bigint default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v bigint := public._loja_analise(p_loja); sp text := public.setor_principal(p_setor); id uuid;
begin
  if not public.pode_gerir_setor(sp, v) then raise exception 'setor_nao_permitido'; end if;
  if p_alvo_tipo not in ('setor','produto') then raise exception 'alvo_invalido'; end if;
  if nullif(trim(coalesce(p_problema,'')),'') is null then raise exception 'problema_obrigatorio'; end if;
  insert into public.acoes_preventivas (loja_id, alvo_tipo, setor, barcode, alvo_nome, problema, evidencias, acoes, origem, linha_base, criado_por, criado_por_nome)
    values (v, p_alvo_tipo, sp, case when p_alvo_tipo = 'produto' then p_barcode end, coalesce(nullif(trim(p_alvo_nome),''), sp), trim(p_problema),
      coalesce(p_evidencias,'{}'), coalesce(p_acoes,'[]'), coalesce(p_origem,'manual'),
      public._linha_base(v, sp, case when p_alvo_tipo = 'produto' then p_barcode end, now(), 30), auth.uid(), public.nome_do_usuario())
    returning acoes_preventivas.id into id;
  return id;
end $$;

create or replace function public.atualizar_acao_preventiva(p_id uuid, p_status text default null, p_ronda uuid default null, p_ocorrencia uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a public.acoes_preventivas%rowtype;
begin
  select * into a from public.acoes_preventivas where id = p_id for update;
  if not found then raise exception 'acao_invalida'; end if;
  if not public.pode_gerir_setor(a.setor, a.loja_id) then raise exception 'sem_permissao'; end if;
  if p_status is not null and p_status not in ('aberta','em_andamento','concluida','cancelada') then raise exception 'status_invalido'; end if;
  update public.acoes_preventivas set
    status = coalesce(p_status, case when p_ronda is not null or p_ocorrencia is not null then 'em_andamento' else status end),
    ronda_id = coalesce(p_ronda, ronda_id), ocorrencia_id = coalesce(p_ocorrencia, ocorrencia_id),
    concluido_em = case when p_status = 'concluida' then now() when p_status is not null then null else concluido_em end,
    atualizado_em = now()
  where id = p_id;
end $$;

-- Indicadores de resultado: antes x depois de cada ação (só com tempo suficiente)
create or replace function public.indicadores_prevencao(p_loja bigint default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v bigint := public._loja_analise(p_loja); r jsonb;
begin
  with acoes as (
    select a.*, greatest(0, current_date - a.criado_em::date) dias_desde from public.acoes_preventivas a
    where a.loja_id = v and public.pode_gerir_setor(a.setor, v) and a.status <> 'cancelada'),
  aval as (
    select a.id, a.alvo_nome, a.alvo_tipo, a.setor, a.status, a.criado_em, a.dias_desde, a.linha_base,
      case when a.dias_desde >= 14 then public._linha_base(v, a.setor, a.barcode, now(), least(30, a.dias_desde)) end depois
    from acoes a),
  setores as (
    select setor_principal setor,
      count(*) filter (where data >= now() - interval '30 days') rec,
      count(*) filter (where data < now() - interval '30 days' and data >= now() - interval '60 days') ant
    from public.v_perdas where loja_id = v and data >= now() - interval '60 days' and public.pode_gerir_setor(setor_principal, v) group by 1),
  persist as (
    select barcode, max(nome) nome, max(setor_principal) setor, count(*) n from public.v_perdas
    where loja_id = v and public.pode_gerir_setor(setor_principal, v) and data >= now() - interval '60 days'
    group by barcode
    having count(*) filter (where data >= now() - interval '30 days') > 0 and count(*) filter (where data < now() - interval '30 days') > 0)
  select jsonb_build_object(
    'acoes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'alvo', alvo_nome, 'tipo', alvo_tipo, 'setor', setor, 'status', status, 'criado_em', criado_em,
        'dias_desde', dias_desde, 'antes', linha_base, 'depois', depois,
        'avaliavel', depois is not null,
        'nota', case when depois is null then 'Aguardando pelo menos 14 dias desde a criação para comparar.' end) order by criado_em desc), '[]') from aval),
    'acoes_concluidas', (select count(*) from acoes where status = 'concluida'),
    'acoes_abertas', (select count(*) from acoes where status in ('aberta','em_andamento')),
    'setores', (select coalesce(jsonb_agg(jsonb_build_object('setor', setor, 'ultimos_30', rec, 'anteriores_30', ant,
        'situacao', case when rec + ant < 3 then 'dados_insuficientes' when rec < ant then 'melhorou' when rec > ant then 'piorou' else 'estavel' end)), '[]') from setores),
    'produtos_persistentes', (select coalesce(jsonb_agg(jsonb_build_object('barcode', barcode, 'nome', nome, 'setor', setor, 'registros_60d', n)), '[]') from persist),
    'gerado_em', now()) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Mesmas validações de criar_ronda, mas monta só os itens do modo escolhido (sem apagar nada depois).
-- completa: todos · priorizada: todos, ordenados por risco · amostragem: metade maiores riscos + metade sorteada · manual: códigos escolhidos
create or replace function public.criar_ronda_inteligente(p_setor text, p_nome text, p_participantes uuid[], p_inicio timestamptz default null,
  p_prazo timestamptz default null, p_obs text default null, p_loja bigint default null, p_subsetores text[] default null,
  p_modo text default 'completa', p_quantidade integer default null, p_barcodes text[] default null, p_acao uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_nivel int := public.nivel_do_usuario(); v_loja bigint; v_id uuid; v_nomes text; v_inicio timestamptz := coalesce(p_inicio, now());
  v_n int; v_uid uuid; v_u record; v_nome text := public.nome_do_usuario(); v_cargo text := public.cargo_do_usuario();
  v_titulo text := coalesce(nullif(trim(p_nome),''), 'Conferência de ' || p_setor); metade int; v_sel text[];
begin
  if p_modo not in ('completa','priorizada','amostragem','manual') then raise exception 'modo_invalido'; end if;
  if p_modo = 'amostragem' and (p_quantidade is null or p_quantidade < 1) then raise exception 'quantidade_obrigatoria'; end if;
  if p_modo = 'manual' and (p_barcodes is null or cardinality(p_barcodes) = 0) then raise exception 'selecione_produtos'; end if;
  if v_nivel is null or v_nivel > 5 then raise exception 'sem_permissao'; end if;
  v_loja := coalesce(p_loja, public.loja_do_usuario());
  if v_loja is null or (v_loja is distinct from public.loja_do_usuario() and not public.eh_gestao_global()) then raise exception 'sem_permissao'; end if;
  if p_setor is null then raise exception 'setor_obrigatorio'; end if;
  if p_participantes is null or cardinality(p_participantes) = 0 then raise exception 'participante_obrigatorio'; end if;
  if p_prazo is not null and p_prazo <= v_inicio then raise exception 'prazo_invalido'; end if;
  if not public.pode_gerir_setor(p_setor, v_loja) then raise exception 'setor_nao_permitido'; end if;
  for v_uid in select distinct x from unnest(p_participantes) x loop
    select u.id, u.setor, u.loja_id, u.ativo, u.promotor into v_u from public.usuarios u where u.id = v_uid;
    if not found or not v_u.ativo or v_u.promotor or v_u.loja_id is distinct from v_loja then raise exception 'participante_invalido'; end if;
    if v_nivel = 5 and lower(coalesce(v_u.setor,'')) <> lower(p_setor) then raise exception 'participante_fora_do_setor'; end if;
  end loop;

  with cand as (
    select c.barcode, c.nome, coalesce(a.score, 0) sc
    from public.catalogo c left join public.analise_risco_produtos(v_loja, p_setor) a on a.barcode = c.barcode
    where c.loja_id = v_loja and public.setor_principal(c.setor) = p_setor
      and (p_subsetores is null or cardinality(p_subsetores) = 0 or lower(coalesce(public.subsetor_efetivo(c.setor, c.subsetor), '(sem subsetor)')) in (select lower(x) from unnest(p_subsetores) x))
      and (p_modo <> 'manual' or c.barcode = any(p_barcodes))),
  ord as (select barcode, row_number() over (order by sc desc, nome) pos, random() sorteio from cand)
  select array_agg(barcode) into v_sel from ord
  where p_modo <> 'amostragem'
     or pos <= ceil(p_quantidade / 2.0)
     or barcode in (select o2.barcode from ord o2 where o2.pos > ceil(p_quantidade / 2.0) order by o2.sorteio limit greatest(0, p_quantidade - ceil(p_quantidade / 2.0)::int));
  v_n := coalesce(cardinality(v_sel), 0);
  if v_n = 0 then raise exception 'setor_sem_produtos'; end if;

  select string_agg(distinct u.nome, ', ') into v_nomes from public.usuarios u where u.id = any(p_participantes);
  insert into public.rondas (setor, loja_id, titulo, status, usuario, criado_por, criado_por_nome, criado_por_cargo, criado_por_nivel,
      inicio_previsto, prazo, observacoes, total_itens, total_verificado, ok_count, proximo_count, vencido_count, nao_encontrado_count,
      modo, amostra, acao_preventiva_id)
    values (p_setor, v_loja, v_titulo, case when v_inicio > now() + interval '1 minute' then 'agendada' else 'aguardando_inicio' end,
      v_nomes, auth.uid(), v_nome, v_cargo, v_nivel, v_inicio, p_prazo, nullif(trim(coalesce(p_obs,'')),''), 0, 0, 0, 0, 0, 0,
      p_modo, case when p_modo = 'amostragem' then p_quantidade end, p_acao)
    returning id into v_id;
  insert into public.ronda_participantes (ronda_id, usuario_id, nome)
    select v_id, u.id, u.nome from public.usuarios u where u.id = any(p_participantes);
  insert into public.ronda_itens (ronda_id, barcode, nome, foto, subsetor, validade_cadastrada, resultado, risco, risco_nivel, ordem)
    select v_id, c.barcode, c.nome, c.foto, public.subsetor_efetivo(c.setor, c.subsetor),
      (select min(p.validade) from public.produtos p where p.loja_id = v_loja and p.barcode = c.barcode and p.setor = c.setor),
      'pendente', a.score, a.nivel, row_number() over (order by coalesce(a.score,0) desc, c.nome)
    from public.catalogo c left join public.analise_risco_produtos(v_loja, p_setor) a on a.barcode = c.barcode
    where c.loja_id = v_loja and public.setor_principal(c.setor) = p_setor and c.barcode = any(v_sel);
  get diagnostics v_n = row_count;
  update public.rondas set total_itens = v_n where id = v_id;
  insert into public.ronda_eventos (ronda_id, tipo, usuario_id, usuario_nome, dados)
    values (v_id, 'criada', auth.uid(), v_nome, jsonb_build_object('setor', p_setor, 'itens', v_n, 'participantes', v_nomes, 'cargo', v_cargo, 'modo', p_modo));
  insert into public.ronda_avisos (usuario_id, ronda_id, tipo, dados)
    select u.id, v_id, 'designada', jsonb_build_object('setor', p_setor, 'nome', v_titulo, 'por', v_nome, 'prazo', p_prazo)
    from public.usuarios u where u.id = any(p_participantes) and u.id <> auth.uid();
  if p_acao is not null then perform public.atualizar_acao_preventiva(p_acao, null, v_id, null); end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Cota diária do assistente de IA (contada no servidor, por usuário)
create or replace function public.ia_consumir_cota(p_limite integer default 40)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare usados int;
begin
  if auth.uid() is null then raise exception 'sem_permissao'; end if;
  insert into public.ia_uso (usuario_id, dia, perguntas) values (auth.uid(), current_date, 1)
    on conflict (usuario_id, dia) do update set perguntas = public.ia_uso.perguntas + 1
    returning perguntas into usados;
  if usados > p_limite then
    update public.ia_uso set perguntas = perguntas - 1 where usuario_id = auth.uid() and dia = current_date;
    return jsonb_build_object('ok', false, 'usados', usados - 1, 'limite', p_limite);
  end if;
  return jsonb_build_object('ok', true, 'usados', usados, 'limite', p_limite);
end $$;

create or replace function public.ia_registrar_acao(p_tipo text, p_dados jsonb, p_resultado text, p_conversa uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'sem_permissao'; end if;
  insert into public.ia_acoes (usuario_id, usuario_nome, loja_id, conversa_id, tipo, dados, resultado)
  values (auth.uid(), public.nome_do_usuario(), public.loja_do_usuario(), p_conversa, left(p_tipo, 60), p_dados, left(p_resultado, 500));
end $$;

-- limite global dos testes de diagnóstico do assistente (acao=status / teste_ferramentas): 30 por dia
create or replace function public.ia_cota_diagnostico()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare usados int;
begin
  insert into public.ia_uso (usuario_id, dia, perguntas) values ('00000000-0000-0000-0000-000000000000', current_date, 1)
    on conflict (usuario_id, dia) do update set perguntas = public.ia_uso.perguntas + 1 returning perguntas into usados;
  return jsonb_build_object('ok', usados <= 30, 'usados', usados);
end $$;

-- Permissões: todas as funções acima validam o usuário internamente (nível, loja, setor via
-- nivel_do_usuario / loja_do_usuario / pode_gerir_setor). Chamadas anônimas recebem 'sem_permissao'.

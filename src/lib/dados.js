// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { supabase } from "../supabaseClient";
import { detectarFamilia } from "./utilidades";

// ---------- Armazenamento local (preferências por dispositivo: tema, som, PIN, notificações já enviadas) ----------
function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.error("Erro ao salvar localmente", key, e); }
}

// ---------- Supabase: mapeamento de linhas <-> objetos do app ----------
function produtoFromRow(r) {
  return {
    lancadoPorId: r.lancado_por_id || null,
    id: r.id, barcode: r.barcode, nome: r.nome, setor: r.setor, subsetor: r.subsetor || null, foto: r.foto,
    quantidade: r.quantidade, precoUnitario: Number(r.preco_unitario) || 0, porPeso: !!r.por_peso,
    tamanho: r.tamanho || null, unidadeMedida: r.unidade_medida || null,
    corredor: r.corredor || null, ladoCorredor: r.lado_corredor || null, modulo: r.modulo || null, prateleira: r.prateleira || null,
    categoriaGiro: r.categoria_giro || null, politicaTroca: r.politica_troca || null,
    local: r.local || "loja", corredorDeposito: r.corredor_deposito || null, moduloDeposito: r.modulo_deposito || null,
    nivelDeposito: r.nivel_deposito || null, vaoDeposito: r.vao_deposito || null,
    observacoes: r.observacoes || "", validade: r.validade, diasAlerta: r.dias_alerta,
    diasAlertaExtras: Array.isArray(r.dias_alerta_extras) ? r.dias_alerta_extras : [],
    emPromocao: !!r.em_promocao, precoPromocional: r.preco_promocional != null ? Number(r.preco_promocional) : null,
    criadoEm: r.criado_em, cadastradoPor: r.cadastrado_por || null, atualizadoPor: r.atualizado_por || null,
    notificado10d: !!r.notificado_10d, familia: r.familia || null,
    lote: r.lote || null, semLote: !!r.sem_lote,
    pedidoTipo: r.pedido_tipo || null, pedidoCampanha: r.pedido_campanha || null, pedidoValor: r.pedido_valor != null ? Number(r.pedido_valor) : null, pedidoEm: r.pedido_em || null, pedidoPor: r.pedido_por || null
  };
}

function produtoToRow(item) {
  return {
    id: item.id, barcode: item.barcode, nome: item.nome, setor: item.setor, subsetor: item.subsetor || null, foto: item.foto || null,
    quantidade: item.quantidade || 1, preco_unitario: item.precoUnitario || 0, por_peso: !!item.porPeso,
    tamanho: item.tamanho || null, unidade_medida: item.unidadeMedida || null,
    corredor: item.corredor || null, lado_corredor: item.ladoCorredor || null, modulo: item.modulo || null, prateleira: item.prateleira || null,
    categoria_giro: item.categoriaGiro || null, politica_troca: item.politicaTroca || null,
    local: item.local || "loja", corredor_deposito: item.corredorDeposito || null, modulo_deposito: item.moduloDeposito || null,
    nivel_deposito: item.nivelDeposito || null, vao_deposito: item.vaoDeposito || null,
    observacoes: item.observacoes || "", validade: item.validade, dias_alerta: item.diasAlerta,
    dias_alerta_extras: item.diasAlertaExtras && item.diasAlertaExtras.length ? item.diasAlertaExtras : null,
    em_promocao: !!item.emPromocao, preco_promocional: item.precoPromocional != null ? item.precoPromocional : null,
    criado_em: item.criadoEm || new Date().toISOString(),
    cadastrado_por: item.cadastradoPor || null, atualizado_por: item.atualizadoPor || null,
    notificado_10d: !!item.notificado10d, familia: item.familia || detectarFamilia(item.nome) || null,
    lote: item.lote || null, sem_lote: !item.lote && !!item.semLote
  };
}

function historicoFromRow(r) {
  return {
    id: r.id, barcode: r.barcode, nome: r.nome, setor: r.setor, foto: r.foto,
    quantidade: r.quantidade, precoUnitario: Number(r.preco_unitario) || 0, porPeso: !!r.por_peso,
    validade: r.validade, motivo: r.motivo, dataBaixa: r.data_baixa, registradoPor: r.registrado_por || null,
    vencidoAntes: !!r.vencido_antes, lote: r.lote || null, semLote: !!r.sem_lote
  };
}

// ---------- Supabase: operações de dados (compartilhadas entre toda a equipe) ----------
// ---------- Multiloja: contexto da loja ativa ----------
// Mutável de propósito: evita ter que passar loja_id em toda função/chamada da camada de dados.
// Setado uma vez quando o perfil carrega, e de novo se um DESENVOLVEDOR trocar de loja em "Gestão
// do Aplicativo". Toda leitura/escrita abaixo filtra ou grava por isso.
let LOJA_ID_ATIVA = null;

function setLojaIdAtiva(id) { LOJA_ID_ATIVA = id || null; }

// Lista de funcionários que o cargo de "perfil" pode enxergar/gerenciar — usa a hierarquia real
// (cargos.cargos_subordinados) em vez de comparar texto de setor, que é menos confiável.
// DESENVOLVEDOR/DIRETOR/GERENTE (nivel <= 4) vê todo mundo da loja; ENCARREGADO só vê quem tem um
// cargo listado como subordinado ao dele (ex: "ENCARREGADO DE AÇOUGUE" só vê "AÇOUGUEIRO").
async function supaFetchFuncionariosVisiveis(perfil) {
  let query = supabase.from("usuarios").select("id, nome, matricula, setor, cargos(nome, nivel)").eq("ativo", true).eq("loja_id", LOJA_ID_ATIVA);
  const nivel = perfil?.cargos?.nivel;
  if (nivel != null && nivel > 4) {
    const subordinados = perfil?.cargos?.cargos_subordinados || [];
    if (subordinados.length === 0) return [];
    const { data: cargosPermitidos } = await supabase.from("cargos").select("id").in("nome", subordinados);
    const ids = (cargosPermitidos || []).map((c) => c.id);
    if (ids.length === 0) return [];
    query = query.in("cargo_id", ids);
  }
  const { data, error } = await query.order("nome");
  if (error) { console.error("Erro ao buscar funcionários visíveis:", error); return []; }
  return data || [];
}

// A API devolve no máximo 1000 linhas por pedido e NÃO avisa quando corta: busca de 1000 em 1000 até acabar.
// `montar()` devolve a consulta já com filtro e ORDEM estável (sem ordem fixa as páginas podem repetir/pular linha).
async function buscarTudo(montar, { pagina = 1000, teto = 60000 } = {}) {
  let de = 0, tudo = [];
  for (;;) {
    const { data, error } = await montar().range(de, de + pagina - 1);
    if (error) return { data: null, error };
    tudo = tudo.concat(data || []);
    if (!data || data.length < pagina || tudo.length >= teto) break;
    de += pagina;
  }
  return { data: tudo, error: null };
}

async function supaFetchProdutos() {
  const { data, error } = await buscarTudo(() => supabase.from("produtos").select("*").eq("loja_id", LOJA_ID_ATIVA).order("validade", { ascending: true }).order("id", { ascending: true }));
  if (error) { console.error(error); return []; }
  return (data || []).map(produtoFromRow);
}

async function supaFetchCatalogo() {
  const { data, error } = await buscarTudo(() => supabase.from("catalogo").select("*").eq("loja_id", LOJA_ID_ATIVA).order("barcode", { ascending: true }));
  if (error) { console.error(error); return {}; }
  const mapa = {};
  (data || []).forEach((r) => {
    mapa[r.barcode] = {
      nome: r.nome, setor: r.setor, foto: r.foto, subsetor: r.subsetor || null,
      tamanho: r.tamanho || null, unidadeMedida: r.unidade_medida || null,
      corredor: r.corredor || null, ladoCorredor: r.lado_corredor || null, modulo: r.modulo || null, prateleira: r.prateleira || null,
      categoriaGiro: r.categoria_giro || null, politicaTroca: r.politica_troca || null,
      precoUnitario: r.preco_unitario != null ? Number(r.preco_unitario) : null, porPeso: !!r.por_peso,
      cadastrarEstoque: !!r.cadastrar_estoque, corredorDeposito: r.corredor_deposito || null, moduloDeposito: r.modulo_deposito || null,
      nivelDeposito: r.nivel_deposito || null, vaoDeposito: r.vao_deposito || null, familia: r.familia || null
    };
  });
  return mapa;
}

async function supaFetchHistorico() {
  const { data, error } = await buscarTudo(() => supabase.from("historico").select("*").eq("loja_id", LOJA_ID_ATIVA).order("data_baixa", { ascending: false }).order("id", { ascending: true }));
  if (error) { console.error(error); return []; }
  return (data || []).map(historicoFromRow);
}

async function supaUpsertProduto(item) {
  let { error } = await supabase.from("produtos").upsert({ ...produtoToRow(item), loja_id: LOJA_ID_ATIVA });
  if (error && (error.code === "42703" || error.code === "PGRST204") && /lote/i.test(error.message || "")) { // só quando o banco NÃO TEM a coluna de lote (erro de coluna): salva sem ela. Qualquer outro erro é real e sobe
    const { lote, sem_lote, ...semLote } = produtoToRow(item);
    ({ error } = await supabase.from("produtos").upsert({ ...semLote, loja_id: LOJA_ID_ATIVA }));
  }
  if (error) { console.error("Erro ao salvar produto no Supabase:", error); throw error; }
}

async function supaBaixarProduto({ id, motivo, quantidade }) {
  const { error } = await supabase.rpc("dar_baixa", { p_id: id, p_motivo: motivo, p_qtd: quantidade != null ? quantidade : null });
  if (error) { console.error("Erro ao dar baixa no Supabase:", error); throw error; }
}

async function supaRegistrarPedido(id, tipo, campanha, valor) {
  const { error } = await supabase.rpc("registrar_pedido_promocao", { p_id: id, p_tipo: tipo || null, p_campanha: campanha || null, p_valor: tipo && valor != null ? valor : null });
  if (error) { console.error("Erro ao registrar pedido:", error); throw error; }
}

async function supaDeleteProduto(id) {
  const { error } = await supabase.from("produtos").delete().eq("id", id);
  if (error) { console.error("Erro ao excluir produto no Supabase:", error); throw error; }
}

async function supaUpsertCatalogo(barcode, dados) {
  const { error } = await supabase.from("catalogo").upsert({
    barcode, loja_id: LOJA_ID_ATIVA, nome: dados.nome, setor: dados.setor, foto: dados.foto || null, subsetor: dados.subsetor || null,
    tamanho: dados.tamanho || null, unidade_medida: dados.unidadeMedida || null,
    corredor: dados.corredor || null, lado_corredor: dados.ladoCorredor || null, modulo: dados.modulo || null, prateleira: dados.prateleira || null,
    categoria_giro: dados.categoriaGiro || null, politica_troca: dados.politicaTroca || null,
    preco_unitario: dados.precoUnitario != null && dados.precoUnitario !== "" ? Number(dados.precoUnitario) : null, por_peso: !!dados.porPeso,
    cadastrar_estoque: !!dados.cadastrarEstoque, corredor_deposito: dados.corredorDeposito || null, modulo_deposito: dados.moduloDeposito || null,
    nivel_deposito: dados.nivelDeposito || null, vao_deposito: dados.vaoDeposito || null,
    familia: dados.familia || detectarFamilia(dados.nome) || null
  }, { onConflict: "barcode,loja_id" });
  if (error) { console.error("Erro ao salvar catálogo no Supabase:", error); throw error; }
}

async function supaInserirHistorico(registro) {
  const { error } = await supabase.from("historico").insert({
    barcode: registro.barcode, loja_id: LOJA_ID_ATIVA, nome: registro.nome, setor: registro.setor, foto: registro.foto,
    quantidade: registro.quantidade || 1, preco_unitario: registro.precoUnitario || 0, por_peso: !!registro.porPeso,
    validade: registro.validade, motivo: registro.motivo, registrado_por: registro.registradoPor || null,
    vencido_antes: !!registro.vencidoAntes, lote: registro.lote || null, sem_lote: !registro.lote && !!registro.semLote
  });
  if (error && /lote/i.test(error.message || "")) { // banco ainda sem a coluna de lote no histórico: grava sem ela
    const r2 = await supabase.from("historico").insert({
      barcode: registro.barcode, loja_id: LOJA_ID_ATIVA, nome: registro.nome, setor: registro.setor, foto: registro.foto,
      quantidade: registro.quantidade || 1, preco_unitario: registro.precoUnitario || 0, por_peso: !!registro.porPeso,
      validade: registro.validade, motivo: registro.motivo, registrado_por: registro.registradoPor || null, vencido_antes: !!registro.vencidoAntes
    });
    if (r2.error) { console.error("Erro ao registrar histórico no Supabase:", r2.error); throw r2.error; }
  } else if (error) { console.error("Erro ao registrar histórico no Supabase:", error); throw error; }
}

// Item 37: trilha de auditoria — nunca bloqueia a ação principal se falhar (fire-and-forget)
function registrarAuditoria(usuario, acao, detalhe, barcode) {
  supabase.from("auditoria").insert({ usuario: usuario || null, acao, detalhe: detalhe || null, produto_barcode: barcode || null, loja_id: LOJA_ID_ATIVA })
    .then(({ error }) => { if (error) console.error("Erro ao registrar auditoria:", error); });
}

// Rondas (modelo novo: ver supabase-ronda.sql). Mantém o formato antigo para os painéis/relatórios que já leem `rondas`.
async function supaFetchRondas() {
  const { data, error } = await supabase.from("rondas").select("*").eq("loja_id", LOJA_ID_ATIVA).neq("status", "cancelada").order("criado_em", { ascending: false }).limit(200);
  if (error) { console.error(error); return []; }
  const mapaStatus = { finalizada: "concluida", encerrada_antecipada: "parcial", agendada: "pendente", aguardando_inicio: "pendente" };
  return (data || []).map((r) => ({
    id: r.id, setor: r.setor, titulo: r.titulo || `Ronda — ${r.setor}`, status: mapaStatus[r.status] || r.status || "concluida",
    iniciadoEm: r.iniciado_em || r.criado_em, finalizadoEm: r.finalizado_em, usuario: r.criado_por_nome || r.usuario, finalizadoPor: r.encerrada_por_nome || r.finalizado_por || r.criado_por_nome,
    totalVerificado: r.total_itens || r.total_verificado || 0, okCount: r.ok_count, proximoCount: r.proximo_count,
    vencidoCount: r.vencido_count, naoEncontradoCount: r.nao_encontrado_count
  }));
}

async function supaFetchConfigLoja(lojaNumero) {
  if (!lojaNumero) return null;
  const { data, error } = await supabase.from("config_loja").select("*").eq("loja_numero", String(lojaNumero)).maybeSingle();
  if (error) { console.error(error); return null; }
  return data ? {
    faturamentoMensal: data.faturamento_mensal != null ? Number(data.faturamento_mensal) : null,
    balancaConfig: data.balanca_config || null
  } : null;
}

async function supaSalvarConfigLoja(lojaNumero, faturamentoMensal) {
  if (!lojaNumero) return;
  const { error } = await supabase.from("config_loja").upsert({ loja_numero: String(lojaNumero), faturamento_mensal: faturamentoMensal, atualizado_em: new Date().toISOString() });
  if (error) console.error("Erro ao salvar config da loja:", error);
}

// Item 1 (painel corporativo): cada loja envia um resumo do próprio dia pra uma tabela compartilhada
// entre todas as lojas da rede — pressupõe que exista um projeto Supabase "central" com essa tabela
// acessível (por RLS) a todas as lojas em modo escrita (upsert só na própria linha) e leitura pro papel corporativo.
async function supaEnviarResumoRede(resumo) {
  if (!resumo.lojaNumero) return;
  const { error } = await supabase.from("resumo_lojas_rede").upsert({
    loja_numero: String(resumo.lojaNumero), loja_nome: resumo.lojaNome || null, atualizado_em: new Date().toISOString(),
    valor_em_risco: resumo.valorEmRisco || 0, criticos: resumo.criticos || 0, atencao: resumo.atencao || 0,
    perda_mes: resumo.perdaMes || 0, perda_mes_anterior: resumo.perdaMesAnterior || 0,
    rondas_feitas_hoje: resumo.rondasFeitasHoje || 0, rondas_pendentes_hoje: resumo.rondasPendentesHoje || 0,
    setores_sem_ronda_hoje: resumo.setoresSemRondaHoje || []
  });
  if (error) console.error("Erro ao enviar resumo pra rede:", error);
}

async function supaFetchResumoRede() {
  const { data, error } = await supabase.from("resumo_lojas_rede").select("*").order("valor_em_risco", { ascending: false });
  if (error) { console.error("Erro ao buscar resumo da rede:", error); return []; }
  return (data || []).map((r) => ({
    lojaNumero: r.loja_numero, lojaNome: r.loja_nome, atualizadoEm: r.atualizado_em,
    valorEmRisco: Number(r.valor_em_risco) || 0, criticos: r.criticos || 0, atencao: r.atencao || 0,
    perdaMes: Number(r.perda_mes) || 0, perdaMesAnterior: Number(r.perda_mes_anterior) || 0,
    rondasFeitasHoje: r.rondas_feitas_hoje || 0, rondasPendentesHoje: r.rondas_pendentes_hoje || 0,
    setoresSemRondaHoje: r.setores_sem_ronda_hoje || []
  }));
}

// Trilha imutável de alteração de validade — cada vez que uma validade JÁ LANÇADA é trocada por outra
// (edição, não lançamento novo), fica registrado pra sempre quem mudou, de quando pra quando. A tabela
// só aceita INSERT (ver migração), então isso não pode ser apagado nem pelo próprio app depois.
async function supaRegistrarAlteracaoValidade({ barcode, nome, setor, validadeAnterior, validadeNova, usuario }) {
  const { error } = await supabase.from("validade_alteracoes").insert({
    barcode, nome, setor: setor || null, validade_anterior: validadeAnterior || null, validade_nova: validadeNova, alterado_por: usuario || null
  });
  if (error) console.error("Erro ao registrar alteração de validade:", error);
}

async function supaFetchAlteracoesValidade(barcode) {
  const { data, error } = await supabase.from("validade_alteracoes").select("*").eq("barcode", barcode).order("alterado_em", { ascending: false });
  if (error) { console.error("Erro ao buscar alterações de validade:", error); return []; }
  return (data || []).map((r) => ({ id: r.id, validadeAnterior: r.validade_anterior, validadeNova: r.validade_nova, alteradoPor: r.alterado_por, alteradoEm: r.alterado_em }));
}

async function supaFetchAuditoria(limite = 40) {
  const { data, error } = await supabase.from("auditoria").select("*").eq("loja_id", LOJA_ID_ATIVA).order("criado_em", { ascending: false }).limit(limite);
  if (error) { console.error(error); return []; }
  return (data || []).map((r) => ({ id: r.id, criadoEm: r.criado_em, usuario: r.usuario, acao: r.acao, detalhe: r.detalhe, barcode: r.produto_barcode }));
}

// ---------- Avisos (modal de comunicado geral — demo pra testar) ----------
function avisoFromRow(r) {
  return {
    id: r.id, titulo: r.titulo, mensagem: r.mensagem, tipo: r.tipo || "info",
    alvoTipo: r.alvo_tipo || "todos", alvoSetor: r.alvo_setor || null, alvoUsuarios: r.alvo_usuarios || null,
    criadoPor: r.criado_por || null, criadoEm: r.criado_em, expiraEm: r.expira_em || null, lojaId: r.loja_id ?? null,
  };
}

async function supaFetchAvisosRecentes() {
  const desde = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data, error } = await supabase.from("avisos").select("*").or(`loja_id.eq.${LOJA_ID_ATIVA},loja_id.is.null`).gte("criado_em", desde).order("criado_em", { ascending: false }).limit(20);
  if (error) { console.error(error); return []; }
  return (data || []).map(avisoFromRow);
}

// ---------- Setores/subsetores customizados (cadastrados pela própria equipe) ----------
async function supaFetchSetoresCustomizados() {
  const { data, error } = await supabase.from("setores_customizados").select("*").eq("loja_id", LOJA_ID_ATIVA);
  if (error) { console.error(error); return []; }
  return (data || []).map((r) => ({ nome: r.nome, perecivel: !!r.perecivel }));
}

async function supaCriarSetorCustomizado(nome, perecivel) {
  const { error } = await supabase.from("setores_customizados").upsert({ nome, perecivel: !!perecivel, loja_id: LOJA_ID_ATIVA }, { onConflict: "nome,loja_id" });
  if (error) console.error("Erro ao criar setor customizado:", error);
}

async function supaFetchSubsetoresCustomizados() {
  const { data, error } = await supabase.from("subsetores_customizados").select("*").eq("loja_id", LOJA_ID_ATIVA);
  if (error) { console.error(error); return []; }
  return (data || []).map((r) => ({ setor: r.setor, nome: r.nome }));
}

async function supaCriarSubsetorCustomizado(setor, nome) {
  const { error } = await supabase.from("subsetores_customizados").upsert({ setor, nome, loja_id: LOJA_ID_ATIVA }, { onConflict: "setor,nome,loja_id" });
  if (error) console.error("Erro ao criar subsetor customizado:", error);
}

export { buscarTudo, LOJA_ID_ATIVA, avisoFromRow, historicoFromRow, loadLocal, produtoFromRow, produtoToRow, registrarAuditoria, saveLocal, setLojaIdAtiva, supaBaixarProduto, supaCriarSetorCustomizado, supaCriarSubsetorCustomizado, supaDeleteProduto, supaEnviarResumoRede, supaFetchAlteracoesValidade, supaFetchAuditoria, supaFetchAvisosRecentes, supaFetchCatalogo, supaFetchConfigLoja, supaFetchFuncionariosVisiveis, supaFetchHistorico, supaFetchProdutos, supaFetchResumoRede, supaFetchRondas, supaFetchSetoresCustomizados, supaFetchSubsetoresCustomizados, supaInserirHistorico, supaRegistrarAlteracaoValidade, supaRegistrarPedido, supaSalvarConfigLoja, supaUpsertCatalogo, supaUpsertProduto };

// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useMemo } from "react";
import { criarPDF, COR } from "../pdfMarca.js";
import { supabase } from "../supabaseClient";
import { CONDOR_LOGO_BASE64 } from "./constantes";
import { formatarData, formatarDataHoraExtenso, formatarMoeda, getStatus } from "./formatos";
import { textoLote } from "./produto";
import { calcularPrioridade } from "./utilidades";

// ============ Torre de Controle (itens 26, 30, 31, 32, 37) — tela pra liderança ============
// Dados agregados usados pela Torre de Controle e pela aba Relatórios (resumo geral, setores, itens)
function usarDadosGerenciais(items, historico) {
  const enriched = items.map((it) => ({ ...it, status: getStatus(it) }));
  const criticos = enriched.filter((i) => i.status.level === "expired");
  const atencao = enriched.filter((i) => i.status.level === "alert");
  const valorEmRisco = [...criticos, ...atencao].reduce((acc, i) => acc + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0), 0);

  const previsaoAmanha = useMemo(() => {
    const entrarao = enriched.filter((i) => i.status.level !== "expired" && i.status.d - 1 <= i.diasAlerta && i.status.d - 1 >= 0 && i.status.level !== "alert");
    const valor = entrarao.reduce((acc, i) => acc + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0), 0);
    return { qtd: entrarao.length, valor };
  }, [items]);

  const riscoPorSetor = useMemo(() => {
    const mapa = {};
    [...criticos, ...atencao].forEach((i) => { mapa[i.setor] = (mapa[i.setor] || 0) + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0); });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [items]);
  const setorMaisPerigoso = riscoPorSetor[0];

  const riscoPorCorredor = useMemo(() => {
    const mapa = {};
    [...criticos, ...atencao].forEach((i) => {
      if (!i.corredor) return;
      const chave = `Corredor ${i.corredor}${i.ladoCorredor ? " · " + i.ladoCorredor : ""}`;
      if (!mapa[chave]) mapa[chave] = { valor: 0, vencidos: 0, proximos: 0 };
      mapa[chave].valor += (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0);
      if (i.status.level === "expired") mapa[chave].vencidos++; else mapa[chave].proximos++;
    });
    return Object.entries(mapa).sort((a, b) => b[1].valor - a[1].valor).slice(0, 5);
  }, [items]);

  const tendenciaPerdas = useMemo(() => {
    const agora = new Date();
    const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
    const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).getTime();
    let atual = 0, anterior = 0;
    historico.forEach((h) => {
      if (!h.vencidoAntes) return;
      const t = new Date(h.dataBaixa).getTime();
      const valor = (Number(h.quantidade) || 1) * (Number(h.precoUnitario) || 0);
      if (t >= inicioMesAtual) atual += valor;
      else if (t >= inicioMesAnterior) anterior += valor;
    });
    const variacao = anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : null;
    return { atual, anterior, variacao };
  }, [historico]);

  const reincidentes = useMemo(() => {
    const janela = Date.now() - 60 * 86400000;
    const mapa = {};
    historico.filter((h) => h.vencidoAntes && new Date(h.dataBaixa).getTime() >= janela).forEach((h) => {
      if (!mapa[h.barcode]) mapa[h.barcode] = { nome: h.nome, setor: h.setor, datas: [] };
      mapa[h.barcode].datas.push(h.dataBaixa);
    });
    return Object.values(mapa).filter((p) => p.datas.length >= 3).sort((a, b) => b.datas.length - a.datas.length).slice(0, 6);
  }, [historico]);

  const rankingResponsaveis = useMemo(() => {
    const mapa = {};
    historico.forEach((h) => { const nome = h.registradoPor || "Não identificado"; mapa[nome] = (mapa[nome] || 0) + 1; });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [historico]);

  // Resumo por setor (pra aba Relatórios): total de itens, críticos, atenção, valor em risco por setor
  const resumoPorSetor = useMemo(() => {
    const mapa = {};
    enriched.forEach((i) => {
      if (!mapa[i.setor]) mapa[i.setor] = { total: 0, criticos: 0, atencao: 0, ok: 0, valorEmRisco: 0 };
      mapa[i.setor].total++;
      if (i.status.level === "expired") mapa[i.setor].criticos++;
      else if (i.status.level === "alert") mapa[i.setor].atencao++;
      else mapa[i.setor].ok++;
      if (i.status.level === "expired" || i.status.level === "alert") mapa[i.setor].valorEmRisco += (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0);
    });
    return Object.entries(mapa).sort((a, b) => b[1].valorEmRisco - a[1].valorEmRisco);
  }, [items]);

  return {
    enriched, criticos, atencao, valorEmRisco, previsaoAmanha, riscoPorSetor, setorMaisPerigoso,
    riscoPorCorredor, tendenciaPerdas, reincidentes, rankingResponsaveis, resumoPorSetor,
  };
}

// ============ PDFs (identidade da tela de carregamento: ver src/pdfMarca.js) ============
let gerandoPDF = false;

// Evita toque duplo e transforma qualquer falha em aviso (antes a falha sumia em silêncio).
function protegerPDF(fn) {
  return async (...args) => {
    if (gerandoPDF) return;
    gerandoPDF = true;
    const opc = args.find((x) => x && typeof x === "object" && typeof x.showToast === "function");
    opc?.showToast?.("Gerando o PDF…", "carregando");
    try { await fn(...args); }
    catch (e) { console.error("Erro ao gerar PDF", e); opc?.showToast?.("Não foi possível gerar o PDF. Tente de novo.", "erro"); }
    finally { gerandoPDF = false; }
  };
}

const PDF_BASE = (titulo, subtitulo, usuario, lojaNumero) => criarPDF({
  titulo, subtitulo, usuario, lojaNumero, logo: CONDOR_LOGO_BASE64, formatarDataHora: formatarDataHoraExtenso,
});

const hojeISO = () => new Date().toISOString().slice(0, 10);

const rotuloPedido = (t) => (t === "preco_direto" ? "Preço direto" : t === "promocao" ? "Promoção" : "—");

const valorLinha = (i) => (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0);

const textoQtd = (i) => (i.porPeso ? `${i.quantidade} kg` : String(i.quantidade || 1));

const textoPedidoCurto = (i) => (i.pedidoTipo ? `${rotuloPedido(i.pedidoTipo)}${i.pedidoCampanha ? " · " + i.pedidoCampanha : ""}` : "sem pedido");

const dataCurta = (iso) => { try { return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—"; } catch { return "—"; } };

// Relatório dedicado de itens próximos a vencer
async function gerarPDFProximosAVencer_raw(itensProximos, { usuario, lojaNumero, showToast }) {
  const r = await PDF_BASE("Itens próximos ao vencimento", "Conferir e agir antes de virar perda", usuario, lojaNumero);
  const valorTotal = itensProximos.reduce((a, i) => a + valorLinha(i), 0);
  const semPedido = itensProximos.filter((i) => !i.pedidoTipo).length;
  r.kpis([
    { label: "Itens próximos do vencimento", valor: String(itensProximos.length), cor: COR.ambar },
    { label: "Valor exposto", valor: formatarMoeda(valorTotal), cor: COR.vermelho },
    { label: "Sem pedido de promoção/preço", valor: String(semPedido), cor: semPedido ? COR.vermelho : COR.verde },
  ]);
  r.secao("PRODUTOS, DO MAIS PERTO DE VENCER PARA O MAIS LONGE");
  const ord = [...itensProximos].sort((a, b) => (a.status?.d ?? 0) - (b.status?.d ?? 0));
  r.tabela(
    [{ t: "PRODUTO", w: 40 }, { t: "SETOR", w: 20 }, { t: "VALIDADE", w: 20 }, { t: "LOTE", w: 17 }, { t: "FALTAM", w: 12, a: "r" }, { t: "QTD.", w: 11, a: "r" }, { t: "VALOR", w: 22, a: "r" }, { t: "PEDIDO", w: 24 }],
    ord.map((i) => [i.nome, i.setor, formatarData(i.validade), textoLote(i) || "—", `${i.status?.d ?? "—"}d`, textoQtd(i), formatarMoeda(valorLinha(i)), textoPedidoCurto(i)])
  );
  r.finalizar(`condor-proximos-vencer-loja${lojaNumero || "79"}-${hojeISO()}.pdf`, showToast, "Relatório gerado.");
}

// Pedidos de promoção / preço direto (campanhas) — o que foi pedido, por quem e o que ainda está sem pedido
async function gerarPDFPedidos_raw({ items, usuario, lojaNumero, showToast }) {
  const r = await PDF_BASE("Pedidos de promoção e preço direto", "Campanhas pedidas e itens ainda sem pedido", usuario, lojaNumero);
  const comPedido = items.filter((i) => i.pedidoTipo);
  const promo = comPedido.filter((i) => i.pedidoTipo === "promocao");
  const preco = comPedido.filter((i) => i.pedidoTipo === "preco_direto");
  const criticosSem = items.filter((i) => !i.pedidoTipo && (i.status?.level === "alert" || i.status?.level === "expired") && !i.semValidade);
  r.kpis([
    { label: "Pedidos ativos", valor: String(comPedido.length), cor: COR.azul },
    { label: "Promoção", valor: String(promo.length) },
    { label: "Preço direto", valor: String(preco.length) },
    { label: "Críticos sem pedido", valor: String(criticosSem.length), cor: criticosSem.length ? COR.vermelho : COR.verde },
  ]);
  r.nota("O valor do pedido é uma sugestão: depende da central liberar a promoção ou o preço direto.");
  r.secao("PEDIDOS ATIVOS");
  r.tabela(
    [{ t: "PRODUTO", w: 38 }, { t: "SETOR", w: 20 }, { t: "LOTE", w: 18 }, { t: "VALIDADE", w: 20 }, { t: "PEDIDO / CAMPANHA", w: 26 }, { t: "VALOR", w: 20, a: "r" }, { t: "POR / EM", w: 30 }],
    [...comPedido].sort((a, b) => String(b.pedidoEm || "").localeCompare(String(a.pedidoEm || ""))).map((i) => [
      i.nome, i.setor, textoLote(i) || "—", formatarData(i.validade), `${rotuloPedido(i.pedidoTipo)}\n${i.pedidoCampanha || "sem nº de campanha"}`,
      i.pedidoValor != null ? formatarMoeda(i.pedidoValor) : "—", `${i.pedidoPor || "—"}\n${dataCurta(i.pedidoEm)}`,
    ]),
    { vazio: "Nenhum pedido de promoção ou preço direto registrado." }
  );
  const porCamp = {};
  comPedido.forEach((i) => { const c = i.pedidoCampanha || "Sem nº de campanha"; (porCamp[c] = porCamp[c] || { qtd: 0, valor: 0 }); porCamp[c].qtd++; porCamp[c].valor += valorLinha(i); });
  const listaCamp = Object.entries(porCamp).sort((a, b) => b[1].qtd - a[1].qtd);
  if (listaCamp.length) {
    r.secao("POR CAMPANHA");
    r.tabela([{ t: "CAMPANHA", w: 80 }, { t: "LOTES", w: 40, a: "r" }, { t: "VALOR DO ESTOQUE (PREÇO × QTD.)", w: 62, a: "r" }], listaCamp.map(([c, d]) => [c, String(d.qtd), formatarMoeda(d.valor)]));
  }
  r.secao("CRÍTICOS SEM PEDIDO — PEDIR PROMOÇÃO OU PREÇO DIRETO", COR.vermelho);
  r.tabela(
    [{ t: "PRODUTO", w: 44 }, { t: "SETOR", w: 22 }, { t: "LOTE", w: 17 }, { t: "VALIDADE", w: 20 }, { t: "SITUAÇÃO", w: 18 }, { t: "QTD.", w: 12, a: "r" }, { t: "VALOR", w: 22, a: "r" }],
    [...criticosSem].sort((a, b) => (a.status?.d ?? 0) - (b.status?.d ?? 0)).slice(0, 150).map((i) => [
      i.nome, i.setor, textoLote(i) || "—", formatarData(i.validade), i.status.level === "expired" ? "VENCIDO" : `${i.status.d}d`, textoQtd(i), formatarMoeda(valorLinha(i)),
    ]),
    { vazio: "Nenhum item crítico sem pedido. Tudo coberto." }
  );
  if (criticosSem.length > 150) r.nota(`Mostrando os 150 críticos mais urgentes de ${criticosSem.length}.`);
  r.finalizar(`condor-pedidos-campanha-${hojeISO()}.pdf`, showToast, "Relatório de pedidos gerado.");
}

// Perdas e baixas dos últimos N dias (a partir do histórico)
async function gerarPDFPerdas_raw({ historico, usuario, lojaNumero, showToast, dias = 30 }) {
  const r = await PDF_BASE("Perdas e baixas", `Últimos ${dias} dias`, usuario, lojaNumero);
  const corte = Date.now() - dias * 86400000;
  const lista = (historico || []).filter((h) => new Date(h.dataBaixa).getTime() >= corte);
  const valorH = (h) => (Number(h.quantidade) || 1) * (Number(h.precoUnitario) || 0);
  const vencidos = lista.filter((h) => h.vencidoAntes);
  r.kpis([
    { label: "Baixas no período", valor: String(lista.length) },
    { label: "Vencidos na baixa", valor: String(vencidos.length), cor: COR.vermelho },
    { label: "Valor perdido", valor: formatarMoeda(vencidos.reduce((a, h) => a + valorH(h), 0)), cor: COR.vermelho },
  ]);
  const por = (fn) => { const m = {}; lista.forEach((h) => { const k = fn(h) || "—"; (m[k] = m[k] || { qtd: 0, valor: 0 }); m[k].qtd++; m[k].valor += valorH(h); }); return Object.entries(m).sort((a, b) => b[1].valor - a[1].valor); };
  r.secao("POR SETOR");
  r.tabela([{ t: "SETOR", w: 90 }, { t: "BAIXAS", w: 40, a: "r" }, { t: "VALOR", w: 52, a: "r" }], por((h) => h.setor).map(([k, d]) => [k, String(d.qtd), formatarMoeda(d.valor)]));
  r.secao("POR MOTIVO");
  r.tabela([{ t: "MOTIVO", w: 90 }, { t: "BAIXAS", w: 40, a: "r" }, { t: "VALOR", w: 52, a: "r" }], por((h) => h.motivo).map(([k, d]) => [k, String(d.qtd), formatarMoeda(d.valor)]));
  r.secao("BAIXAS REGISTRADAS");
  r.tabela(
    [{ t: "PRODUTO", w: 40 }, { t: "SETOR", w: 20 }, { t: "LOTE", w: 16 }, { t: "VALIDADE", w: 20 }, { t: "BAIXA EM", w: 20 }, { t: "MOTIVO", w: 24 }, { t: "QTD.", w: 10, a: "r" }, { t: "VALOR", w: 22, a: "r" }],
    [...lista].sort((a, b) => String(b.dataBaixa).localeCompare(String(a.dataBaixa))).slice(0, 300).map((h) => [
      h.nome, h.setor, textoLote(h) || "—", formatarData(h.validade), dataCurta(h.dataBaixa), h.motivo, String(h.quantidade || 1), formatarMoeda(valorH(h)),
    ]),
    { vazio: "Nenhuma baixa no período." }
  );
  if (lista.length > 300) r.nota("Mostrando as 300 baixas mais recentes. Use a planilha para a lista completa.");
  r.finalizar(`condor-perdas-baixas-${hojeISO()}.pdf`, showToast, "Relatório de perdas gerado.");
}

// Vencimentos por setor (posição atual do estoque monitorado)
async function gerarPDFPosicaoSetores_raw({ items, usuario, lojaNumero, showToast }) {
  const r = await PDF_BASE("Posição por setor", "Estoque monitorado e vencimentos", usuario, lojaNumero);
  const m = {};
  items.forEach((i) => {
    const s = i.setor || "—"; (m[s] = m[s] || { total: 0, vencidos: 0, atencao: 0, sem: 0, valor: 0 });
    m[s].total++;
    if (i.status?.level === "expired") m[s].vencidos++; else if (i.status?.level === "alert") m[s].atencao++;
    if (!i.pedidoTipo && (i.status?.level === "expired" || i.status?.level === "alert")) m[s].sem++;
    if (i.status?.level === "expired" || i.status?.level === "alert") m[s].valor += valorLinha(i);
  });
  const lista = Object.entries(m).sort((a, b) => b[1].valor - a[1].valor);
  r.kpis([
    { label: "Lotes monitorados", valor: String(items.length) },
    { label: "Vencidos", valor: String(lista.reduce((a, [, d]) => a + d.vencidos, 0)), cor: COR.vermelho },
    { label: "Em atenção", valor: String(lista.reduce((a, [, d]) => a + d.atencao, 0)), cor: COR.ambar },
  ]);
  r.secao("SETORES, DO MAIOR PARA O MENOR VALOR EM RISCO");
  r.tabela(
    [{ t: "SETOR", w: 50 }, { t: "LOTES", w: 18, a: "r" }, { t: "VENCIDOS", w: 22, a: "r" }, { t: "ATENÇÃO", w: 20, a: "r" }, { t: "S/ PEDIDO", w: 24, a: "r" }, { t: "VALOR EM RISCO", w: 36, a: "r" }],
    lista.map(([s, d]) => [s, String(d.total), String(d.vencidos), String(d.atencao), String(d.sem), formatarMoeda(d.valor)])
  );
  r.finalizar(`condor-posicao-setores-${hojeISO()}.pdf`, showToast, "Relatório gerado.");
}

async function gerarRelatorioGerencialPDF_raw({ items, historico, usuario, showToast, criticos, atencao, valorEmRisco, tendenciaPerdas, riscoPorSetor, reincidentes, rankingResponsaveis, rondas, lojaNumero, secoes }) {
  const inclui = (chave) => !secoes || secoes.has(chave);
  const r = await PDF_BASE("Relatório de controle de validade", "Visão gerencial da loja", usuario, lojaNumero);
  r.kpis([
    { label: "Monitorados", valor: String(items.length) },
    { label: "Vencidos", valor: String(criticos.length), cor: COR.vermelho },
    { label: "Em atenção", valor: String(atencao.length), cor: COR.ambar },
    { label: "Valor em risco", valor: formatarMoeda(valorEmRisco), cor: COR.vermelho },
  ]);
  const semPed = items.filter((i) => !i.pedidoTipo && (i.status?.level === "expired" || i.status?.level === "alert")).length;
  const comPed = items.filter((i) => i.pedidoTipo).length;
  r.nota(`Perdas confirmadas este mês: ${formatarMoeda(tendenciaPerdas.atual)}${tendenciaPerdas.variacao !== null ? ` (${tendenciaPerdas.variacao > 0 ? "+" : ""}${tendenciaPerdas.variacao}% vs mês anterior, ${formatarMoeda(tendenciaPerdas.anterior)})` : ""}.  Pedidos de promoção/preço direto ativos: ${comPed}. Críticos ainda sem pedido: ${semPed}.`);

  if (inclui("setores") && riscoPorSetor.length > 0) {
    r.secao("TOP SETORES EM RISCO AGORA");
    r.tabela([{ t: "SETOR", w: 126 }, { t: "VALOR EXPOSTO", w: 56, a: "r" }], riscoPorSetor.slice(0, 6).map(([s, v]) => [s, formatarMoeda(v)]));
  }
  if (inclui("reincidentes") && reincidentes.length > 0) {
    r.secao("PRODUTOS REINCIDENTES (60 DIAS) — REVISAR COMPRA/REPOSIÇÃO");
    r.tabela([{ t: "PRODUTO", w: 96 }, { t: "SETOR", w: 56 }, { t: "Nº DE BAIXAS", w: 30, a: "r" }], reincidentes.map((p) => [p.nome, p.setor, String(p.datas.length)]));
  }
  if (inclui("responsaveis") && rankingResponsaveis.length > 0) {
    r.secao("REGISTROS POR RESPONSÁVEL (BAIXAS)");
    r.tabela([{ t: "RESPONSÁVEL", w: 126 }, { t: "BAIXAS REGISTRADAS", w: 56, a: "r" }], rankingResponsaveis.map(([n, q]) => [n, String(q)]));
  }
  if (inclui("rondas") && rondas && rondas.length > 0) {
    const janela30 = Date.now() - 30 * 86400000;
    const rec = rondas.filter((x) => new Date(x.iniciadoEm).getTime() >= janela30);
    const conc = rec.filter((x) => x.status === "concluida").length;
    const parc = rec.filter((x) => x.status === "parcial").length;
    const taxa = rec.length ? Math.round((conc / rec.length) * 100) : 0;
    r.secao("EXECUÇÃO DE RONDAS (ÚLTIMOS 30 DIAS)");
    r.tabela([{ t: "MÉTRICA", w: 126 }, { t: "VALOR", w: 56, a: "r" }], [["Rondas realizadas", String(rec.length)], ["Concluídas", String(conc)], ["Parciais", String(parc)], ["Taxa de conclusão", `${taxa}%`]]);
    const porSetor = {};
    rec.forEach((x) => { porSetor[x.setor] = (porSetor[x.setor] || 0) + 1; });
    const top = Object.entries(porSetor).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (top.length > 0) r.tabela([{ t: "SETOR", w: 126 }, { t: "RONDAS NO PERÍODO", w: 56, a: "r" }], top.map(([s, q]) => [s, String(q)]));
  }
  if (inclui("acoesRondas")) {
    try {
      const { data: acaoRows } = await supabase.from("ronda_itens").select("acao").not("acao", "is", null).limit(1000);
      if (acaoRows && acaoRows.length > 0) {
        const mapa = {};
        acaoRows.forEach((x) => { if (x.acao) mapa[x.acao] = (mapa[x.acao] || 0) + 1; });
        const lista = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
        if (lista.length > 0) { r.secao("AÇÕES REGISTRADAS NAS RONDAS"); r.tabela([{ t: "AÇÃO", w: 126 }, { t: "QUANTIDADE", w: 56, a: "r" }], lista.map(([a, q]) => [a, String(q)])); }
      }
    } catch (e) { console.error("Erro ao buscar ações das rondas:", e); }
  }
  if (inclui("prioritarios")) {
    const prior = items.map((i) => ({ item: i, p: calcularPrioridade(i, historico) })).filter((x) => x.p).sort((a, b) => b.p.score - a.p.score).slice(0, 15);
    if (prior.length > 0) {
      r.secao("ITENS PRIORITÁRIOS — AÇÃO RECOMENDADA");
      r.tabela(
        [{ t: "PRODUTO", w: 42 }, { t: "SETOR", w: 20 }, { t: "VALIDADE", w: 20 }, { t: "LOTE", w: 16 }, { t: "VALOR", w: 20, a: "r" }, { t: "PEDIDO", w: 22 }, { t: "AÇÃO", w: 32 }],
        prior.map(({ item, p }) => [(p.nivel === "urgente" ? "[URGENTE] " : "") + item.nome, item.setor, formatarData(item.validade), textoLote(item) || "—", formatarMoeda(p.valor), textoPedidoCurto(item), p.acao])
      );
    }
  }
  r.finalizar(`condor-relatorio-gerencial-${hojeISO()}.pdf`, showToast, "Relatório gerado.");
}

async function gerarRelatorioFinanceiroPDF_raw({ usuario, showToast, lojaNumero, valorTotalMonitorado, valorEmRisco, faixasRisco, porPoliticaTroca, topRisco }) {
  const r = await PDF_BASE("Relatório financeiro de validade", "Valor exposto, faixas de risco e perdas", usuario, lojaNumero);
  r.kpis([
    { label: "Valor monitorado", valor: formatarMoeda(valorTotalMonitorado) },
    { label: "Valor em risco", valor: formatarMoeda(valorEmRisco), cor: COR.vermelho },
    { label: "Itens vencidos", valor: String(faixasRisco.find((f) => f.label === "Vencidos")?.qtd || 0), cor: COR.vermelho },
  ]);
  r.secao("VALOR EXPOSTO POR FAIXA DE VENCIMENTO");
  r.tabela([{ t: "FAIXA", w: 80 }, { t: "ITENS", w: 40, a: "r" }, { t: "VALOR", w: 62, a: "r" }], faixasRisco.map((f) => [f.label, String(f.qtd), formatarMoeda(f.valor)]));
  r.secao("VALOR POR POLÍTICA DE TROCA");
  r.tabela([{ t: "POLÍTICA", w: 80 }, { t: "ITENS", w: 40, a: "r" }, { t: "VALOR", w: 62, a: "r" }], [
    ["Com troca", String(porPoliticaTroca.com_troca.qtd), formatarMoeda(porPoliticaTroca.com_troca.valor)],
    ["Sem troca", String(porPoliticaTroca.sem_troca.qtd), formatarMoeda(porPoliticaTroca.sem_troca.valor)],
  ]);
  r.secao("TOP 10 ITENS COM MAIOR VALOR EM RISCO");
  r.tabela(
    [{ t: "PRODUTO", w: 52 }, { t: "SETOR", w: 26 }, { t: "VALIDADE", w: 22 }, { t: "LOTE", w: 20 }, { t: "PEDIDO", w: 28 }, { t: "VALOR", w: 28, a: "r" }],
    topRisco.map((i) => [i.nome, i.setor, formatarData(i.validade), textoLote(i) || "—", textoPedidoCurto(i), formatarMoeda(i.valorRisco)])
  );
  r.finalizar(`condor-relatorio-financeiro-${hojeISO()}.pdf`, showToast, "Relatório financeiro gerado.");
}

async function gerarRelatorioAtividadePDF_raw({ usuario, showToast, lojaNumero, porUsuarioAuditoria, porTipoAcao, rondasResumo }) {
  const r = await PDF_BASE("Atividade da equipe", "Ações registradas e rondas de validade", usuario, lojaNumero);
  r.kpis([
    { label: "Ações registradas", valor: String(porUsuarioAuditoria.reduce((a, [, q]) => a + q, 0)) },
    { label: "Rondas concluídas", valor: String(rondasResumo.concluidas), cor: COR.verde },
    { label: "Rondas parciais", valor: String(rondasResumo.parciais), cor: COR.ambar },
  ]);
  r.secao("AÇÕES POR RESPONSÁVEL");
  r.tabela([{ t: "RESPONSÁVEL", w: 126 }, { t: "AÇÕES", w: 56, a: "r" }], porUsuarioAuditoria.map(([n, q]) => [n, String(q)]));
  r.secao("AÇÕES POR TIPO");
  r.tabela([{ t: "TIPO DE AÇÃO", w: 126 }, { t: "QTD", w: 56, a: "r" }], porTipoAcao.map(([t, q]) => [t, String(q)]));
  r.secao("RONDAS POR SETOR");
  r.tabela([{ t: "SETOR", w: 86 }, { t: "CONCLUÍDAS", w: 48, a: "r" }, { t: "PARCIAIS", w: 48, a: "r" }], rondasResumo.porSetor.map(([s, d]) => [s, String(d.concluidas), String(d.parciais)]));
  r.finalizar(`condor-relatorio-atividade-${hojeISO()}.pdf`, showToast, "Relatório de atividade gerado.");
}

const gerarPDFProximosAVencer = protegerPDF(gerarPDFProximosAVencer_raw);

const gerarPDFPedidos_ = protegerPDF(gerarPDFPedidos_raw);

const gerarPDFPerdas_ = protegerPDF(gerarPDFPerdas_raw);

const gerarPDFPosicaoSetores = protegerPDF(gerarPDFPosicaoSetores_raw);

const gerarRelatorioGerencialPDF = protegerPDF(gerarRelatorioGerencialPDF_raw);

const gerarRelatorioFinanceiroPDF = protegerPDF(gerarRelatorioFinanceiroPDF_raw);

const gerarRelatorioAtividadePDF = protegerPDF(gerarRelatorioAtividadePDF_raw);

export { PDF_BASE, dataCurta, gerandoPDF, gerarPDFPedidos_, gerarPDFPedidos_raw, gerarPDFPerdas_, gerarPDFPerdas_raw, gerarPDFPosicaoSetores, gerarPDFPosicaoSetores_raw, gerarPDFProximosAVencer, gerarPDFProximosAVencer_raw, gerarRelatorioAtividadePDF, gerarRelatorioAtividadePDF_raw, gerarRelatorioFinanceiroPDF, gerarRelatorioFinanceiroPDF_raw, gerarRelatorioGerencialPDF, gerarRelatorioGerencialPDF_raw, hojeISO, protegerPDF, rotuloPedido, textoPedidoCurto, textoQtd, usarDadosGerenciais, valorLinha };

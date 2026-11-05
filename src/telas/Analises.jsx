// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { DocumentMagnifyingGlassIcon, ClockIcon, MagnifyingGlassIcon, XMarkIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { TrendingDown, AlertTriangle, Flame, ShieldAlert, Download, FileSpreadsheet, Boxes, History, ShieldCheck, LayoutGrid, Layers, Repeat, Users2, Info, ListChecks } from "lucide-react";
import { PalcoPagina } from "../Inicio";
import { Thumb } from "../componentes/ItemCards";
import { DashArea, DashBadge, DashCard, DashHBars, DashKpi, DashPageHeader, DashTable, DashTabs } from "../componentes/dash";
import { BarraRank, CartaoNovo, EstadoVazioNovo, FaixaChips, PilulasPalco, ValorPalco } from "../componentes/ui";
import { BLUE, BLUE_DARK, BLUE_SOFT, RED, RED_DARK, RED_SOFT, gerarCodigoLocalizacao } from "../lib/constantes";
import { abreviarNumero, formatarData, formatarDataExtenso, formatarDataHora, formatarDataHoraExtenso, formatarMoeda, useFormatarMoedaComCamada, useValoresVisiveis } from "../lib/formatos";
import { textoLote } from "../lib/produto";
import { calcularPrioridade, downloadCSV, downloadPlanilha } from "../lib/utilidades";
import { PrioridadeMobile } from "./RedeTorre";
import { isSameDay } from "./Setores";

// ============ Prioridade Inteligente ("PRIORIDADE DE PERDA") ============
// Aba dedicada: não ordena por data de validade — ordena pelo risco real de perda
// (urgência + valor + quantidade + política de troca + reincidência). Um produto que
// vence depois mas não tem troca com o fornecedor pode furar a frente de um que vence
// antes mas tem troca garantida — é exatamente essa a diferença do motor calcularPrioridade.
// ============ Prioridade / Histórico / Auditoria — versões dashboard (PC) ============
function PrioridadeDashboard({ T, prioridades, valorEmRisco, urgenteCount, semTrocaCount, filtro, setFiltro, filtrados, onOpenDetail }) {
  const fmt = useFormatarMoedaComCamada();
  const porSetor = {};
  prioridades.forEach((x) => { porSetor[x.item.setor] = (porSetor[x.item.setor] || 0) + x.p.valor; });
  const top = Object.entries(porSetor).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value, color: RED, right: fmt(value) }));
  const cols = [
    { key: "pos", label: "#", width: 44, render: (x) => <span style={{ color: T.subtext }} className="tabular-nums">{filtrados.indexOf(x) + 1}</span> },
    { key: "nome", label: "Produto", render: (x) => <div className="flex items-center gap-3"><Thumb foto={x.item.foto} size={34} /><div><p className="font-semibold truncate max-w-[20rem]">{x.item.nome}</p><p style={{ color: T.subtext }} className="text-[11px]">{x.item.setor}{gerarCodigoLocalizacao(x.item) ? ` · ${gerarCodigoLocalizacao(x.item)}` : ""}</p></div></div> },
    { key: "nivel", label: "Nível", render: (x) => <DashBadge bg={x.p.nivel === "urgente" ? RED_DARK : RED_SOFT} color={x.p.nivel === "urgente" ? "#fff" : RED_DARK}>{x.p.nivel === "urgente" ? "URGENTE" : "ATENÇÃO"}</DashBadge> },
    { key: "score", label: "Risco", render: (x) => <div className="flex items-center gap-2 w-28"><div style={{ background: T.chipBg }} className="h-1.5 flex-1 rounded-full overflow-hidden"><div style={{ width: `${x.p.score}%`, background: x.p.score > 70 ? RED_DARK : "#E0921C" }} className="h-full" /></div><span className="text-xs font-bold tabular-nums">{x.p.score}</span></div> },
    { key: "prazo", label: "Prazo", render: (x) => <span className="text-xs">{x.p.status.level === "expired" ? `vencido há ${Math.abs(x.p.dias)}d` : x.p.dias === 0 ? "vence hoje" : `em ${x.p.dias}d`}</span> },
    { key: "troca", label: "Troca", render: (x) => x.p.semTroca ? <DashBadge bg="#4A1013" color="#FFD5D8">SEM TROCA</DashBadge> : <span style={{ color: T.subtext }} className="text-xs">—</span> },
    { key: "valor", label: "Valor", align: "right", render: (x) => <span className="font-semibold tabular-nums">{fmt(x.p.valor)}</span> },
    { key: "acao", label: "Ação recomendada", render: (x) => <span style={{ color: BLUE_DARK }} className="text-xs font-semibold">{x.p.acao}</span> },
  ];
  return (
    <div className="hidden lg:block">
      <DashPageHeader T={T} title="Prioridade de perda" subtitle="Ordenado por quem gera a maior perda e tem menor chance de recuperação" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <DashKpi T={T} label="Valor priorizado em risco" value={fmt(valorEmRisco)} sub="soma dos itens em risco" Icon={TrendingDown} accent={RED_DARK} />
        <DashKpi T={T} label="Em risco" value={prioridades.length} sub="vencidos + em alerta" Icon={AlertTriangle} accent={RED} />
        <DashKpi T={T} label="Urgentes" value={urgenteCount} sub="agir primeiro" Icon={Flame} accent={RED_DARK} />
        <DashKpi T={T} label="Sem troca" value={semTrocaCount} sub="não voltam ao fornecedor" Icon={ShieldAlert} accent="#C98A0C" />
      </div>
      {prioridades.length === 0 ? (
        <DashCard T={T} title="Nenhum produto em risco agora"><p style={{ color: T.subtext }} className="text-sm">Assim que algo entrar em alerta ou vencer, a prioridade aparece aqui.</p></DashCard>
      ) : (
        <div className="grid grid-cols-4 gap-4 items-start">
          <DashCard T={T} title="Valor em risco por setor" className="col-span-1"><DashHBars T={T} data={top} /></DashCard>
          <DashCard T={T} title="Fila de prioridade" subtitle={`${filtrados.length} produto(s) — clique para abrir`} className="col-span-3"
            right={<DashTabs T={T} value={filtro} onChange={setFiltro} options={[{ id: "todos", label: `Todos (${prioridades.length})` }, { id: "urgente", label: `Urgente (${urgenteCount})`, color: RED_DARK }, { id: "sem_troca", label: `Sem troca (${semTrocaCount})` }]} />}>
            <DashTable T={T} cols={cols} rows={filtrados.map((x) => ({ ...x, id: x.item.id }))} onRow={(x) => onOpenDetail(x.item)} empty="Nenhum produto nesse filtro." />
          </DashCard>
        </div>
      )}
    </div>
  );
}

function HistoricoDashboard({ T, filtrado, periodo, setPeriodo, valorPerdido, valorTotalMovimentado, rankingSetores, rankingResponsaveis, reincidentes, exportarCSV, exportarPlanilha }) {
  const fmt = useFormatarMoedaComCamada();
  const dias = Math.min(periodo, 30);
  const serie = Array.from({ length: dias }, (_, k) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (dias - 1 - k)); return d; });
  const dadosSerie = serie.map((d) => ({ label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
    value: Math.round(filtrado.filter((h) => new Date(h.dataBaixa).toDateString() === d.toDateString()).reduce((a, h) => a + (Number(h.quantidade) || 1) * (Number(h.precoUnitario) || 0), 0)) }));
  const cols = [
    { key: "nome", label: "Produto", render: (h) => <div><p className="font-semibold truncate max-w-[22rem]">{h.nome}</p>{h.barcode && <p style={{ color: T.subtext }} className="text-[10.5px] font-mono">{h.barcode}</p>}</div> },
    { key: "setor", label: "Setor", render: (h) => <span style={{ color: T.subtext }}>{h.setor}</span> },
    { key: "data", label: "Baixa", render: (h) => <span className="text-xs tabular-nums">{formatarDataHora(h.dataBaixa)}</span> },
    { key: "motivo", label: "Ação", render: (h) => <DashBadge bg={h.vencidoAntes ? RED_SOFT : BLUE_SOFT} color={h.vencidoAntes ? RED_DARK : BLUE_DARK}>{h.motivo}</DashBadge> },
    { key: "qtd", label: "Qtd", align: "right", render: (h) => <span className="tabular-nums">{h.quantidade || 1}</span> },
    { key: "valor", label: "Valor", align: "right", render: (h) => <span className="font-semibold tabular-nums">{fmt((Number(h.quantidade) || 1) * (Number(h.precoUnitario) || 0))}</span> },
    { key: "por", label: "Responsável", render: (h) => <span style={{ color: T.subtext }} className="text-xs">{h.registradoPor || "—"}</span> },
  ];
  const btn = { background: T.card, borderColor: T.border, color: T.text };
  return (
    <div className="hidden lg:block">
      <DashPageHeader T={T} title="Histórico de baixas" subtitle={`Últimos ${periodo} dias · ${filtrado.length} baixa(s)`}
        right={<>
          <DashTabs T={T} value={periodo} onChange={setPeriodo} options={[{ id: 7, label: "7 dias" }, { id: 30, label: "30 dias" }, { id: 90, label: "90 dias" }]} />
          <button onClick={exportarCSV} style={btn} className="text-xs font-semibold px-3 py-2 rounded-xl border flex items-center gap-1.5"><Download size={13} /> CSV</button>
          <button onClick={() => exportarPlanilha("xlsx")} style={btn} className="text-xs font-semibold px-3 py-2 rounded-xl border flex items-center gap-1.5"><FileSpreadsheet size={13} /> Excel</button>
        </>} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <DashKpi T={T} label="Perda por vencimento" value={fmt(valorPerdido)} sub="baixas de produto vencido" Icon={TrendingDown} accent={RED_DARK} />
        <DashKpi T={T} label="Valor movimentado" value={fmt(valorTotalMovimentado)} sub="todas as baixas" Icon={Boxes} accent={BLUE} />
        <DashKpi T={T} label="Baixas registradas" value={filtrado.length} sub={`nos últimos ${periodo} dias`} Icon={History} accent="#1F9D55" />
        <DashKpi T={T} label="Reincidentes" value={reincidentes.length} sub="produtos com 3+ perdas" Icon={AlertTriangle} accent="#C98A0C" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <DashCard T={T} title="Valor baixado por dia" subtitle={`Últimos ${dias} dias`} className="col-span-2"><DashArea T={T} data={dadosSerie} color={RED_DARK} gid="hist" /></DashCard>
        <DashCard T={T} title="Perda por setor" subtitle="% do valor no período">
          {rankingSetores.length ? <DashHBars T={T} data={rankingSetores.map((r) => ({ label: r.setor, value: r.valor, color: RED, right: `${Math.round(r.pct)}% · ${fmt(r.valor)}` }))} /> : <p style={{ color: T.subtext }} className="text-sm py-8 text-center">Sem baixas.</p>}
        </DashCard>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <DashCard T={T} title="Baixas registradas" subtitle="Mais recentes primeiro">
            <DashTable T={T} cols={cols} rows={[...filtrado].sort((a, b) => new Date(b.dataBaixa) - new Date(a.dataBaixa)).slice(0, 100).map((h, i) => ({ ...h, id: h.id ?? i }))} empty="Nenhuma baixa no período." />
          </DashCard>
        </div>
        <div className="flex flex-col gap-4">
          <DashCard T={T} title="Quem registra" subtitle="Ranking de responsáveis">
            {rankingResponsaveis.length ? <DashHBars T={T} data={rankingResponsaveis.map(([n, c]) => ({ label: n, value: c, color: BLUE, right: `${c}` }))} /> : <p style={{ color: T.subtext }} className="text-sm py-4 text-center">—</p>}
          </DashCard>
          <DashCard T={T} title="Reincidentes" subtitle="3+ perdas em 60 dias">
            {reincidentes.length ? <DashHBars T={T} data={reincidentes.map((r) => ({ label: r.nome, value: r.datas.length, color: RED_DARK, right: `${r.datas.length}x` }))} /> : <p style={{ color: T.subtext }} className="text-sm py-4 text-center">Nenhum reincidente.</p>}
          </DashCard>
        </div>
      </div>
    </div>
  );
}

function AuditoriaDashboard({ T, auditoria, filtrada, busca, setBusca }) {
  const hojeStr = new Date().toDateString();
  const hoje = auditoria.filter((a) => new Date(a.criadoEm).toDateString() === hojeStr).length;
  const porUser = {};
  auditoria.forEach((a) => { const u = a.usuario || "Alguém"; porUser[u] = (porUser[u] || 0) + 1; });
  const topUsers = Object.entries(porUser).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const dias = Array.from({ length: 14 }, (_, k) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - k)); return d; });
  const serie = dias.map((d) => ({ label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, value: auditoria.filter((a) => new Date(a.criadoEm).toDateString() === d.toDateString()).length }));
  const cols = [
    { key: "quando", label: "Quando", width: 190, render: (a) => <span className="text-xs tabular-nums">{formatarDataHoraExtenso(a.criadoEm)}</span> },
    { key: "usuario", label: "Pessoa", render: (a) => <span className="font-semibold">{a.usuario || "Alguém"}</span> },
    { key: "acao", label: "Ação", render: (a) => <span>{a.acao}</span> },
    { key: "detalhe", label: "Detalhe", render: (a) => <span style={{ color: T.subtext }} className="text-xs">{a.detalhe || "—"}</span> },
  ];
  return (
    <div className="hidden lg:block">
      <DashPageHeader T={T} title="Auditoria" subtitle="Trilha de tudo o que foi feito no app" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <DashKpi T={T} label="Ações registradas" value={auditoria.length} sub="total" Icon={DocumentMagnifyingGlassIcon} accent={BLUE} />
        <DashKpi T={T} label="Ações hoje" value={hoje} sub="desde 00:00" Icon={ClockIcon} accent="#1F9D55" />
        <DashKpi T={T} label="Pessoas ativas" value={Object.keys(porUser).length} sub="com ao menos 1 ação" Icon={Boxes} accent={RED} />
        <DashKpi T={T} label="Mais ativa" value={topUsers[0] ? topUsers[0][0].split(" ")[0] : "—"} sub={topUsers[0] ? `${topUsers[0][1]} ação(ões)` : ""} Icon={ShieldCheck} accent="#C98A0C" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <DashCard T={T} title="Atividade nos últimos 14 dias" className="col-span-2"><DashArea T={T} data={serie} color={BLUE} gid="aud" /></DashCard>
        <DashCard T={T} title="Ações por pessoa">{topUsers.length ? <DashHBars T={T} data={topUsers.map(([n, c]) => ({ label: n, value: c, color: BLUE, right: `${c}` }))} /> : <p style={{ color: T.subtext }} className="text-sm py-8 text-center">Sem registros.</p>}</DashCard>
      </div>
      <DashCard T={T} title="Registros" subtitle={`${filtrada.length} ação(ões)`}
        right={<div style={{ background: T.inputBg, borderColor: T.inputBorder }} className="flex items-center gap-2 border rounded-xl px-3 py-1.5 w-72"><MagnifyingGlassIcon className="w-4 h-4" style={{ color: T.subtext }} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa, ação, detalhe…" style={{ color: T.text }} className="bg-transparent outline-none text-sm flex-1" /></div>}>
        <DashTable T={T} cols={cols} rows={filtrada.slice(0, 150).map((a, i) => ({ ...a, id: a.id ?? i }))} empty="Nenhum registro encontrado." />
      </DashCard>
    </div>
  );
}

function PrioridadeInteligenteView({ T, items, historico, onOpenDetail }) {
  const podeVerValores = useValoresVisiveis();
  const [filtro, setFiltro] = useState("todos"); // todos | urgente | sem_troca

  const prioridadesTodas = useMemo(() => {
    return items
      .map((it) => ({ item: it, p: calcularPrioridade(it, historico) }))
      .filter((x) => x.p && (x.p.status.level === "alert" || x.p.status.level === "expired"))
      .sort((a, b) => b.p.score - a.p.score);
  }, [items, historico]);

  const valorEmRisco = prioridadesTodas.reduce((acc, x) => acc + x.p.valor, 0);
  const semTrocaCount = prioridadesTodas.filter((x) => x.p.semTroca).length;
  const urgenteCount = prioridadesTodas.filter((x) => x.p.nivel === "urgente").length;

  const porSetor = {};
  prioridadesTodas.forEach((x) => { porSetor[x.item.setor] = (porSetor[x.item.setor] || 0) + 1; });
  const topSetores = Object.entries(porSetor).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const filtrados = prioridadesTodas.filter((x) => {
    if (filtro === "urgente") return x.p.nivel === "urgente";
    if (filtro === "sem_troca") return x.p.semTroca;
    return true;
  });

  return (
    <>
    <PrioridadeDashboard T={T} prioridades={prioridadesTodas} valorEmRisco={valorEmRisco} urgenteCount={urgenteCount} semTrocaCount={semTrocaCount} filtro={filtro} setFiltro={setFiltro} filtrados={filtrados} onOpenDetail={onOpenDetail} />
    <PrioridadeMobile T={T} prioridades={prioridadesTodas} valorEmRisco={valorEmRisco} urgenteCount={urgenteCount} semTrocaCount={semTrocaCount} podeVerValores={podeVerValores} onOpenDetail={onOpenDetail} />
  </>
  );
}

function InfoTile({ T, icon: Icon, label, value, mono }) {
  return (
    <div style={{ background: T.chipBg }} className="rounded-xl px-3 py-2">
      <div style={{ color: T.subtext }} className="flex items-center gap-1 text-[10px] font-semibold uppercase"><Icon size={11} /> {label}</div>
      <p className={`text-sm font-medium mt-0.5 truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ============ Histórico ============
function HistoricoView({ T, historico, items, usuario }) {
  const [periodo, setPeriodo] = useState(30);

  const filtrado = useMemo(() => {
    const limite = Date.now() - periodo * 86400000;
    return historico.filter((h) => new Date(h.dataBaixa).getTime() >= limite);
  }, [historico, periodo]);

  const valorPerdido = filtrado.filter((h) => h.vencidoAntes).reduce((acc, h) => acc + (Number(h.quantidade) || 1) * (Number(h.precoUnitario) || 0), 0);
  const valorTotalMovimentado = filtrado.reduce((acc, h) => acc + (Number(h.quantidade) || 1) * (Number(h.precoUnitario) || 0), 0);

  const dadosGrafico = useMemo(() => {
    const mapa = {};
    filtrado.forEach((h) => { mapa[h.setor] = (mapa[h.setor] || 0) + 1; });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([setor, qtd]) => ({ setor, qtd }));
  }, [filtrado]);

  // Ranking de perdas por setor, em % do valor total perdido no período
  const rankingSetores = useMemo(() => {
    const mapa = {};
    filtrado.forEach((h) => { mapa[h.setor] = (mapa[h.setor] || 0) + (Number(h.quantidade) || 1) * (Number(h.precoUnitario) || 0); });
    const total = Object.values(mapa).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([setor, valor]) => ({ setor, valor, pct: (valor / total) * 100 }));
  }, [filtrado]);

  const rankingResponsaveis = useMemo(() => {
    const mapa = {};
    filtrado.forEach((h) => { const nome = h.registradoPor || "Não identificado"; mapa[nome] = (mapa[nome] || 0) + 1; });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filtrado]);
  const maxResp = rankingResponsaveis.length ? rankingResponsaveis[0][1] : 1;

  // Reincidência: mesmo código de barras com múltiplas baixas por vencimento nos últimos 60 dias
  const reincidentes = useMemo(() => {
    const janela = Date.now() - 60 * 86400000;
    const mapa = {};
    historico.filter((h) => h.vencidoAntes && new Date(h.dataBaixa).getTime() >= janela).forEach((h) => {
      if (!mapa[h.barcode]) mapa[h.barcode] = { nome: h.nome, setor: h.setor, datas: [] };
      mapa[h.barcode].datas.push(h.dataBaixa);
    });
    return Object.values(mapa).filter((p) => p.datas.length >= 3).sort((a, b) => b.datas.length - a.datas.length).slice(0, 5);
  }, [historico]);

  function exportarCSV() {
    const header = ["Produto", "Setor", "Código", "Lote", "Validade", "Ação", "Quantidade", "PrecoUnitario", "DataBaixa", "Responsável"];
    const rows = filtrado.map((h) => [h.nome, h.setor, h.barcode, textoLote(h), formatarData(h.validade), h.motivo, h.quantidade || 1, (h.precoUnitario || 0).toFixed(2), formatarDataHora(h.dataBaixa), h.registradoPor || ""]);
    downloadCSV(rows, header, "condor-historico-baixas.csv");
  }
  function exportarPlanilha(formato) {
    const linhas = filtrado.map((h) => ({
      Produto: h.nome, Setor: h.setor, Codigo: h.barcode, Lote: textoLote(h), Validade: formatarData(h.validade),
      Acao: h.motivo, Quantidade: h.quantidade || 1, PrecoUnitario: h.precoUnitario || 0, DataBaixa: formatarDataHora(h.dataBaixa), Responsavel: h.registradoPor || ""
    }));
    downloadPlanilha(linhas, `condor-historico-baixas.${formato}`, "Historico");
  }

  return (
    <>
    <HistoricoDashboard T={T} filtrado={filtrado} periodo={periodo} setPeriodo={setPeriodo} valorPerdido={valorPerdido} valorTotalMovimentado={valorTotalMovimentado} rankingSetores={rankingSetores} rankingResponsaveis={rankingResponsaveis} reincidentes={reincidentes} exportarCSV={exportarCSV} exportarPlanilha={exportarPlanilha} />
    <div className="lg:hidden px-4 pt-4 pb-6">
      <PalcoPagina className="mb-4" titulo="Histórico de baixas" subtitulo={`Últimos ${periodo} dias`}>
        <ValorPalco rotulo="Perda confirmada (vencidos)" valor={formatarMoeda(valorPerdido)} />
        <PilulasPalco itens={[["Baixas", filtrado.length, "#F5A524"], ["Vencidos", filtrado.filter((h) => h.vencidoAntes).length, "#E31E24"], ["Movimentado", abreviarNumero(valorTotalMovimentado), "#34C77B"]]} />
      </PalcoPagina>

      <div className="flex items-center gap-2 mb-3.5">
        <div className="flex-1 min-w-0"><FaixaChips T={T} valor={periodo} onChange={setPeriodo} opcoes={[[7, "7 dias"], [30, "30 dias"], [90, "90 dias"]]} /></div>
        <div className="flex gap-1.5 shrink-0 mb-3.5">
          <motion.button whileTap={{ scale: 0.92 }} onClick={exportarCSV} aria-label="Exportar CSV" style={{ background: T.card, color: T.text }} className="h-9 px-3 rounded-full text-[11.5px] font-bold flex items-center gap-1 shadow-sm"><Download size={13} /> CSV</motion.button>
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => exportarPlanilha("ods")} aria-label="Exportar planilha" style={{ background: T.card, color: T.text }} className="h-9 px-3 rounded-full text-[11.5px] font-bold flex items-center gap-1 shadow-sm"><FileSpreadsheet size={13} /> ODS</motion.button>
        </div>
      </div>

      {rankingSetores.length > 0 && (
        <CartaoNovo T={T} idx={0} titulo="Perdas por setor (% do valor)" Icone={LayoutGrid} cor={RED_DARK}>
          {rankingSetores.map((r, k) => <BarraRank key={r.setor} T={T} pos={k + 1} rotulo={r.setor} pct={r.pct} texto={`${r.pct.toFixed(0)}%`} />)}
        </CartaoNovo>
      )}
      {dadosGrafico.length > 0 && (
        <CartaoNovo T={T} idx={1} titulo="Baixas por setor" Icone={Layers} cor={BLUE}>
          {dadosGrafico.map((d, k) => <BarraRank key={d.setor} T={T} pos={k + 1} rotulo={d.setor} pct={(d.qtd / dadosGrafico[0].qtd) * 100} texto={String(d.qtd)} cor={BLUE} />)}
        </CartaoNovo>
      )}
      {reincidentes.length > 0 && (
        <CartaoNovo T={T} idx={2} titulo="Produtos reincidentes (60 dias)" Icone={Repeat} cor={RED_DARK}>
          <div className="flex flex-col gap-2">
            {reincidentes.map((pr) => (
              <div key={pr.nome + pr.datas.length} style={{ background: RED_SOFT }} className="rounded-2xl px-3.5 py-2.5">
                <p style={{ color: RED_DARK }} className="text-[13px] font-extrabold">{pr.nome}</p>
                <p style={{ color: RED_DARK }} className="text-[11px] mt-0.5 opacity-80">{pr.setor} · {pr.datas.length} vencimentos · média {(pr.datas.length / 2).toFixed(1)}/mês</p>
              </div>
            ))}
          </div>
        </CartaoNovo>
      )}
      {rankingResponsaveis.length > 0 && (
        <CartaoNovo T={T} idx={3} titulo="Baixas por responsável" Icone={Users2} cor={BLUE}>
          {rankingResponsaveis.map(([nome, qtd], k) => <BarraRank key={nome} T={T} pos={k + 1} rotulo={nome} pct={(qtd / maxResp) * 100} texto={String(qtd)} cor={BLUE} />)}
        </CartaoNovo>
      )}

      <div style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="rounded-[22px] px-4 py-3.5 mb-4 flex items-start gap-2.5">
        <Info size={15} className="mt-0.5 shrink-0" />
        <p className="text-[11.5px] leading-relaxed">Referência do setor: o vencimento responde por cerca de 38% das perdas em supermercados brasileiros, geralmente entre 1% e 1,5% do faturamento. O relatório completo em PDF para a gerência é gerado na aba <b>Torre</b>.</p>
      </div>

      <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-[.1em] mb-2.5">Baixas registradas · {filtrado.length}</p>
      {filtrado.length === 0 ? (
        <EstadoVazioNovo T={T} Icone={History} titulo="Nenhuma baixa neste período" texto="Baixas registradas na tela inicial aparecem aqui." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtrado.map((h, k) => (
            <motion.div key={h.id + h.dataBaixa} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 26, delay: Math.min(k * 0.03, 0.3) }}
              style={{ background: T.card }} className="rounded-[22px] shadow-md shadow-black/5 p-3 flex items-center gap-3">
              <Thumb foto={h.foto} size={50} rounded="rounded-[16px]" />
              <div className="flex-1 min-w-0">
                <p style={{ color: T.text }} className="font-bold text-[13.5px] leading-tight truncate">{h.nome}</p>
                <p style={{ color: T.subtext }} className="text-[11.5px] mt-0.5 truncate">{h.setor} · {formatarDataHora(h.dataBaixa)}</p>
                {h.registradoPor && <p style={{ color: T.subtext }} className="text-[11px] truncate">Por {h.registradoPor}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span style={h.vencidoAntes ? { background: RED_SOFT, color: RED_DARK } : { background: BLUE_SOFT, color: BLUE_DARK }} className="text-[10.5px] font-bold px-2.5 py-1 rounded-full text-right">{h.motivo}</span>
                <span style={{ color: T.subtext }} className="text-[11px] font-semibold tabular-nums">{h.quantidade || 1} un</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  </>
  );
}

// ============ Auditoria (página própria, acessada pelos Ajustes) ============
function AuditoriaView({ T, auditoria }) {
  const [busca, setBusca] = useState("");

  const filtrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return auditoria;
    return auditoria.filter((a) =>
      (a.usuario || "").toLowerCase().includes(termo) ||
      (a.acao || "").toLowerCase().includes(termo) ||
      (a.detalhe || "").toLowerCase().includes(termo)
    );
  }, [auditoria, busca]);

  const grupos = useMemo(() => {
    const mapa = {};
    filtrada.forEach((a) => {
      const chave = formatarDataExtenso(a.criadoEm);
      if (!mapa[chave]) mapa[chave] = [];
      mapa[chave].push(a);
    });
    return Object.entries(mapa);
  }, [filtrada]);

  return (
    <>
    <AuditoriaDashboard T={T} auditoria={auditoria} filtrada={filtrada} busca={busca} setBusca={setBusca} />
    <div className="px-4 pt-4 pb-6 lg:hidden">
      <PalcoPagina className="mb-4" titulo="Auditoria" subtitulo="Tudo o que foi feito no app, em ordem">
        <PilulasPalco itens={[["Registros", auditoria.length, "#F5A524"], ["Hoje", auditoria.filter((a) => isSameDay(a.criadoEm, new Date().toISOString())).length, "#34C77B"], ["Pessoas", new Set(auditoria.map((a) => a.usuario || "—")).size, "#6CB4FF"]]} />
      </PalcoPagina>

      <div className="relative mb-4">
        <MagnifyingGlassIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: T.subtext }} />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por pessoa, ação ou detalhe..."
          style={{ background: T.card, color: T.text, borderColor: T.inputBorder }} className="w-full rounded-full pl-11 pr-10 py-3 text-sm border outline-none focus:ring-2 shadow-sm" />
        {busca && <button onClick={() => setBusca("")} aria-label="Limpar busca" style={{ background: T.chipBg }} className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center"><XMarkIcon className="w-3 h-3" style={{ color: T.subtext }} /></button>}
      </div>

      {grupos.length === 0 ? (
        <EstadoVazioNovo T={T} Icone={ListChecks} titulo="Nenhum registro encontrado" texto={busca ? "Ajuste a busca." : "As ações do app aparecem aqui conforme acontecem."} />
      ) : (
        <div className="flex flex-col gap-5">
          {grupos.map(([data, itens]) => (
            <div key={data}>
              <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
                <CalendarDaysIcon className="w-3.5 h-3.5" /> {data} <span style={{ background: T.chipBg }} className="rounded-full px-1.5 text-[10px] tabular-nums">{itens.length}</span>
              </p>
              <div className="relative pl-1">
                <div aria-hidden style={{ background: T.chipBg }} className="absolute left-[19px] top-3 bottom-3 w-[2px] rounded-full" />
                <div className="flex flex-col gap-2.5">
                  {itens.map((a, k) => (
                    <motion.div key={a.id || k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(k * 0.03, 0.25) }} className="relative flex items-start gap-3">
                      <span style={{ background: T.card, border: `2px solid ${BLUE}` }} className="relative z-10 h-[18px] w-[18px] rounded-full shrink-0 mt-3.5 ml-[2px]" />
                      <div style={{ background: T.card }} className="flex-1 min-w-0 rounded-[20px] shadow-md shadow-black/5 px-3.5 py-3">
                        <p style={{ color: T.text }} className="text-[13px] leading-snug"><strong>{a.usuario || "Alguém"}</strong> {a.acao}</p>
                        {a.detalhe && <p style={{ color: T.subtext }} className="text-[11.5px] mt-1 leading-snug">{a.detalhe}</p>}
                        <p style={{ color: T.subtext }} className="text-[10.5px] mt-1.5 font-mono">{formatarDataHoraExtenso(a.criadoEm)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </>
  );
}

export { AuditoriaDashboard, AuditoriaView, HistoricoDashboard, HistoricoView, InfoTile, PrioridadeDashboard, PrioridadeInteligenteView };

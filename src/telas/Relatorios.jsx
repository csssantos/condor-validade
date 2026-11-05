// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { DocumentMagnifyingGlassIcon, ClockIcon } from "@heroicons/react/24/outline";
import { Check, Download, FileText, TrendingDown, AlertTriangle, Boxes, ShieldCheck, ShieldAlert, Tag, FileSpreadsheet } from "lucide-react";
import { FUNDO_MARCA } from "../TelasEntrada";
import { DashArea, DashBadge, DashCard, DashHBars, DashKpi, DashPageHeader, DashTable, DashTabs } from "../componentes/dash";
import { BarraRank, corDoNivel } from "../componentes/ui";
import { BLUE, BLUE_DARK, RED, RED_DARK, RED_SOFT } from "../lib/constantes";
import { supaFetchAuditoria, supaFetchConfigLoja, supaSalvarConfigLoja } from "../lib/dados";
import { formatarData, formatarDataHoraExtenso, formatarMoeda, getStatus, useFormatarMoedaComCamada } from "../lib/formatos";
import { textoLote } from "../lib/produto";
import { dataCurta, gerarPDFPedidos_, gerarPDFPerdas_, gerarPDFPosicaoSetores, gerarPDFProximosAVencer, gerarRelatorioAtividadePDF, gerarRelatorioFinanceiroPDF, gerarRelatorioGerencialPDF, rotuloPedido, usarDadosGerenciais } from "../lib/relatoriosPDF";
import { useTelaLarga } from "../lib/tela";
import { downloadCSV, downloadPlanilha } from "../lib/utilidades";

// Sheet: escolher quais seções entram no PDF gerencial antes de gerar
function SelecionarSecoesRelatorioSheet({ T, secoesDisponiveis, selecionadas, onAlternar, onFechar, onGerar }) {
  const todasMarcadas = secoesDisponiveis.every((s) => selecionadas.has(s.id));
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div onClick={onFechar} className="absolute inset-0 bg-black/60" />
      <div style={{ background: T.card }} className="relative w-full max-w-md lg:max-w-lg lg:ring-1 lg:ring-black/10 lg:shadow-2xl rounded-t-[28px] p-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] max-h-[88dvh] overflow-y-auto sm:rounded-2xl">
        <h3 className="font-bold text-sm mb-1">O que entra no relatório?</h3>
        <p style={{ color: T.subtext }} className="text-[11px] mb-3">O resumo geral (KPIs e perdas do mês) sempre entra. Escolha as seções extras:</p>

        <button onClick={() => secoesDisponiveis.forEach((s) => { if (todasMarcadas ? selecionadas.has(s.id) : !selecionadas.has(s.id)) onAlternar(s.id); })}
          style={{ color: BLUE }} className="text-[11px] font-semibold mb-2">
          {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
        </button>

        <div className="flex flex-col gap-1.5 mb-4">
          {secoesDisponiveis.map((s) => {
            const marcado = selecionadas.has(s.id);
            return (
              <button key={s.id} onClick={() => onAlternar(s.id)} style={{ background: T.chipBg }}
                className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5">
                <span className="text-xs font-medium">{s.label}</span>
                <div style={marcado ? { background: BLUE, borderColor: BLUE } : { borderColor: T.inputBorder }}
                  className="h-5 w-5 rounded-md border flex items-center justify-center shrink-0">
                  {marcado && <Check size={13} color="#fff" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button onClick={onFechar} style={{ color: T.subtext }} className="flex-1 text-xs py-2.5">Cancelar</button>
          <button onClick={onGerar} disabled={selecionadas.size === 0} style={{ background: RED_DARK, color: "#fff" }}
            className="flex-[2] text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40">
            <Download size={15} /> Gerar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Relatórios (resumo geral, setores, itens, financeiro, atividade — com exportação em PDF/ODS/XLSX/CSV) ============
// ============ Relatórios — versão dashboard (PC) ============
function RelatoriosDashboard({ T, lojaNumero, items, criticos, atencao, valorEmRisco, valorTotalMonitorado, tendenciaPerdas, perdaUltimos6Meses, faixasRisco, porPoliticaTroca, topRisco,
  resumoPorSetor, porUsuarioAuditoria, porTipoAcao, rondasResumo, taxaExecucaoRonda, indicePerda, faturamentoMensal, faturamentoInput, setFaturamentoInput, salvarFaturamento,
  onGerarPDF, gerarPDFFinanceiro, gerarPDFAtividade, exportarFinanceiro, exportarAtividade, onOpenDetail, gerarPDFPedidos, gerarPDFPerdas, gerarPDFSetores, exportarPedidos, qtdPedidos, proximosAVencer, gerarPDFProximos }) {
  const fmt = useFormatarMoedaComCamada();
  const [aba, setAba] = useState("geral");
  const btn = { background: T.card, borderColor: T.border, color: T.text };
  const v = tendenciaPerdas.variacao;
  const cores = ["#C0192B", "#E0921C", "#C98A0C", BLUE, "#1F9D55"];
  return (
    <div className="hidden lg:block">
      <DashPageHeader T={T} title="Relatórios" subtitle={`Loja ${lojaNumero || "—"} · atualizado em ${formatarDataHoraExtenso(new Date().toISOString())}`}
        right={<button onClick={onGerarPDF} style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DARK})` }} className="text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2"><Download size={14} /> Relatório PDF para gerência</button>} />
      <div className="mb-5"><DashTabs T={T} value={aba} onChange={setAba} options={[{ id: "geral", label: "Visão geral" }, { id: "setores", label: "Setores e itens" }, { id: "financeiro", label: "Financeiro e ROI" }, { id: "atividade", label: "Atividade" }]} /></div>

      {aba === "geral" && (<>
        <DashCard T={T} title="Relatórios prontos" subtitle="PDFs no visual do Condor, prontos para imprimir ou enviar" className="mb-5">
          <div className="flex gap-2 flex-wrap">
            {[[`Pedidos de campanha (${qtdPedidos}) PDF`, gerarPDFPedidos], ["Pedidos CSV", () => exportarPedidos("csv")], ["Pedidos Excel", () => exportarPedidos("xlsx")], ["Perdas e baixas 30 dias PDF", gerarPDFPerdas], ["Posição por setor PDF", gerarPDFSetores],
              ...(proximosAVencer.length > 0 ? [[`Próximos do vencimento (${proximosAVencer.length}) PDF`, gerarPDFProximos]] : [])].map(([rot, fn]) => (
              <button key={rot} onClick={fn} style={btn} className="text-xs font-semibold px-3.5 py-2 rounded-xl border flex items-center gap-1.5"><FileText size={13} /> {rot}</button>
            ))}
          </div>
        </DashCard>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <DashKpi T={T} label="Valor em risco" value={fmt(valorEmRisco)} sub="vencidos + em alerta" Icon={TrendingDown} accent={RED_DARK} />
          <DashKpi T={T} label="Vencidos" value={criticos.length} sub={`${atencao.length} em atenção`} Icon={AlertTriangle} accent={RED} />
          <DashKpi T={T} label="Perda no mês" value={fmt(tendenciaPerdas.atual)} sub={v === null ? "sem mês anterior" : `${v > 0 ? "+" : ""}${v}% vs mês anterior`} Icon={Boxes} accent="#C98A0C" />
          <DashKpi T={T} label="Monitorados" value={items.length} sub={fmt(valorTotalMonitorado)} Icon={ShieldCheck} accent={BLUE} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <DashCard T={T} title="Perda por vencimento" subtitle="Últimos 6 meses" className="col-span-2"><DashArea T={T} data={perdaUltimos6Meses.map((m) => ({ label: m.label, value: Math.round(m.valor) }))} color={RED_DARK} gid="rel6" /></DashCard>
          <DashCard T={T} title="Faixas de vencimento" subtitle="Quantidade de produtos">
            <DashHBars T={T} data={faixasRisco.map((f, i) => ({ label: f.label, value: f.qtd, color: cores[i], right: `${f.qtd} · ${fmt(f.valor)}` }))} />
          </DashCard>
        </div>
      </>)}

      {aba === "setores" && (<>
        <div className="grid grid-cols-3 gap-4 mb-5">
          <DashCard T={T} title="Risco por setor" subtitle="Valor em risco" className="col-span-1"><DashHBars T={T} data={resumoPorSetor.filter(([, d]) => d.valorEmRisco > 0).slice(0, 8).map(([s, d]) => ({ label: s, value: d.valorEmRisco, color: RED, right: fmt(d.valorEmRisco) }))} /></DashCard>
          <DashCard T={T} title="Resumo por setor" className="col-span-2">
            <DashTable T={T} rows={resumoPorSetor.map(([setor, d]) => ({ id: setor, setor, ...d }))} cols={[
              { key: "setor", label: "Setor", render: (r) => <span className="font-semibold">{r.setor}</span> },
              { key: "total", label: "Produtos", align: "right" },
              { key: "criticos", label: "Vencidos", align: "right", render: (r) => <DashBadge bg={r.criticos ? RED_SOFT : T.chipBg} color={r.criticos ? RED_DARK : T.subtext}>{r.criticos}</DashBadge> },
              { key: "atencao", label: "Alerta", align: "right", render: (r) => <DashBadge bg={r.atencao ? "#FCF0DD" : T.chipBg} color={r.atencao ? "#C2760C" : T.subtext}>{r.atencao}</DashBadge> },
              { key: "ok", label: "OK", align: "right" },
              { key: "valorEmRisco", label: "Valor em risco", align: "right", render: (r) => <span className="font-semibold tabular-nums">{fmt(r.valorEmRisco)}</span> }]} />
          </DashCard>
        </div>
        <DashCard T={T} title="Itens de maior valor" subtitle="Top 10 do estoque monitorado">
          <DashTable T={T} onRow={onOpenDetail} rows={topRisco} cols={[
            { key: "nome", label: "Produto", render: (i) => <span className="font-semibold">{i.nome}</span> },
            { key: "setor", label: "Setor", render: (i) => <span style={{ color: T.subtext }}>{i.setor}</span> },
            { key: "validade", label: "Validade", render: (i) => formatarData(i.validade) },
            { key: "lote", label: "Lote", render: (i) => <span style={{ color: T.subtext }}>{textoLote(i) || "—"}</span> },
            { key: "valorRisco", label: "Valor", align: "right", render: (i) => <span className="font-semibold tabular-nums">{fmt(i.valorRisco)}</span> }]} />
        </DashCard>
      </>)}

      {aba === "financeiro" && (<>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <DashKpi T={T} label="Faturamento mensal" value={faturamentoMensal ? fmt(faturamentoMensal) : "—"} sub="informado pela loja" Icon={Boxes} accent={BLUE} />
          <DashKpi T={T} label="Índice de perda" value={indicePerda == null ? "—" : `${indicePerda.toFixed(2)}%`} sub="perda do mês ÷ faturamento" Icon={TrendingDown} accent={RED_DARK} />
          <DashKpi T={T} label="Com troca" value={porPoliticaTroca.com_troca.qtd} sub={fmt(porPoliticaTroca.com_troca.valor)} Icon={ShieldCheck} accent="#1F9D55" />
          <DashKpi T={T} label="Sem troca" value={porPoliticaTroca.sem_troca.qtd} sub={fmt(porPoliticaTroca.sem_troca.valor)} Icon={ShieldAlert} accent={RED} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <DashCard T={T} title="Faturamento mensal" subtitle="Base do índice de perda">
            <div className="flex gap-2"><input type="number" value={faturamentoInput} onChange={(e) => setFaturamentoInput(e.target.value)} placeholder="Ex.: 1200000" style={{ background: T.inputBg, borderColor: T.inputBorder, color: T.text }} className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none" />
              <button onClick={salvarFaturamento} style={{ background: BLUE }} className="text-white text-xs font-bold px-4 rounded-xl">Salvar</button></div>
          </DashCard>
          <DashCard T={T} title="Exportar financeiro" subtitle="PDF e planilhas" className="col-span-2">
            <div className="flex gap-2 flex-wrap">
              <button onClick={gerarPDFFinanceiro} style={{ background: RED_SOFT, color: RED_DARK }} className="text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5"><FileText size={13} /> PDF</button>
              {["csv", "ods", "xlsx"].map((f) => <button key={f} onClick={() => exportarFinanceiro(f)} style={btn} className="text-xs font-semibold px-3.5 py-2 rounded-xl border uppercase">{f}</button>)}
            </div>
          </DashCard>
        </div>
      </>)}

      {aba === "atividade" && (<>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <DashKpi T={T} label="Ações registradas" value={porUsuarioAuditoria.reduce((a, [, q]) => a + q, 0)} sub="na auditoria" Icon={DocumentMagnifyingGlassIcon} accent={BLUE} />
          <DashKpi T={T} label="Rondas concluídas" value={rondasResumo.concluidas} sub="" Icon={ShieldCheck} accent="#1F9D55" />
          <DashKpi T={T} label="Rondas parciais" value={rondasResumo.parciais} sub="" Icon={ClockIcon} accent="#C98A0C" />
          <DashKpi T={T} label="Execução de rondas" value={taxaExecucaoRonda == null ? "—" : `${taxaExecucaoRonda}%`} sub="concluídas ÷ total" Icon={Boxes} accent={RED} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <DashCard T={T} title="Ações por pessoa"><DashHBars T={T} data={porUsuarioAuditoria.slice(0, 8).map(([n, c]) => ({ label: n, value: c, color: BLUE, right: `${c}` }))} /></DashCard>
          <DashCard T={T} title="Tipos de ação"><DashHBars T={T} data={porTipoAcao.slice(0, 8).map(([n, c]) => ({ label: n, value: c, color: "#0E9AA7", right: `${c}` }))} /></DashCard>
          <DashCard T={T} title="Rondas por setor" right={<div className="flex gap-1.5">
            <button onClick={gerarPDFAtividade} style={{ background: RED_SOFT, color: RED_DARK }} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg">PDF</button>
            {["csv", "xlsx"].map((f) => <button key={f} onClick={() => exportarAtividade(f)} style={btn} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border uppercase">{f}</button>)}</div>}>
            <DashHBars T={T} data={rondasResumo.porSetor.slice(0, 8).map(([s, d]) => ({ label: s, value: d.concluidas + d.parciais, color: "#1F9D55", right: `${d.concluidas} ok · ${d.parciais} parc.` }))} />
          </DashCard>
        </div>
      </>)}
    </div>
  );
}

// ============ Relatórios (celular) — refeito do zero: uma página só, em capítulos ============
function AnelRel({ partes, tamanho = 132, espessura = 14, centro, sub, fundo = "rgba(255,255,255,.18)" }) {
  const r = (tamanho - espessura) / 2, c = 2 * Math.PI * r;
  const total = partes.reduce((a, p) => a + p.v, 0) || 1;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={fundo} strokeWidth={espessura} />
        {partes.filter((p) => p.v > 0).map((p, i) => {
          const len = (p.v / total) * c; const off = -acc; acc += len;
          return <motion.circle key={i} cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={p.cor} strokeWidth={espessura} strokeLinecap="butt"
            initial={{ strokeDasharray: `0 ${c}` }} animate={{ strokeDasharray: `${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}` }} transition={{ duration: 0.9, delay: 0.1 + i * 0.12, ease: "easeOut" }} strokeDashoffset={off} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-extrabold leading-none tabular-nums" style={{ fontSize: tamanho * 0.22 }}>{centro}</span>
        {sub && <span className="font-semibold opacity-75 mt-1" style={{ fontSize: Math.max(9.5, tamanho * 0.085) }}>{sub}</span>}
      </div>
    </div>
  );
}

function CapituloRel({ T, id, n, titulo, sub, children }) {
  return (
    <motion.section id={id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className="mb-7 scroll-mt-4">
      <div className="flex items-end gap-3 mb-3 px-1">
        <span className="font-extrabold leading-none tabular-nums" style={{ fontSize: 44, color: T.chipBg, WebkitTextStroke: `1.5px ${T.inputBorder}` }}>{String(n).padStart(2, "0")}</span>
        <div className="pb-0.5 min-w-0">
          <h3 style={{ color: T.text }} className="text-[17px] font-extrabold leading-tight">{titulo}</h3>
          {sub && <p style={{ color: T.subtext }} className="text-[12px] leading-snug">{sub}</p>}
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function ExportarCapitulo({ T, titulo, itens }) {
  return (
    <div style={{ background: T.card }} className="rounded-[22px] shadow-md shadow-black/5 p-3 mt-3">
      <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wider mb-2 px-0.5">{titulo}</p>
      <div className="flex flex-wrap gap-2">
        {itens.map(([rot, Icone, fn, forte]) => (
          <motion.button key={rot} whileTap={{ scale: 0.95 }} onClick={fn} className="rounded-full px-3.5 py-2.5 text-[12px] font-extrabold flex items-center gap-1.5"
            style={forte ? { background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)`, color: "#fff" } : { background: T.chipBg, color: T.text }}><Icone size={14} />{rot}</motion.button>
        ))}
      </div>
    </div>
  );
}

function RelatoriosMobile(p) {
  const { T, lojaNumero, items, criticos, atencao, valorEmRisco, valorTotalMonitorado, tendenciaPerdas, perdaUltimos6Meses, faixasRisco, porPoliticaTroca, topRisco,
    resumoPorSetor, porUsuarioAuditoria, porTipoAcao, rondasResumo, taxaExecucaoRonda, indicePerda, faturamentoMensal, faturamentoInput, setFaturamentoInput, salvarFaturamento,
    onGerarPDF, gerarPDFFinanceiro, gerarPDFAtividade, exportarFinanceiro, exportarAtividade, onOpenDetail, proximosAVencer, usuario, showToast, gerarPDFPedidos, gerarPDFPerdas, gerarPDFSetores, exportarPedidos, qtdPedidos } = p;
  const [editFat, setEditFat] = useState(false);
  const ok = Math.max(0, items.length - criticos.length - atencao.length);
  const pctOk = items.length ? Math.round((ok / items.length) * 100) : 100;
  const ir = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const cores = ["#E31E24", "#F5A524", "#F2D14B", "#5BB5E8", "#34C77B"];
  const totalFaixas = faixasRisco.reduce((a, f) => a + f.valor, 0);
  const maxMes = Math.max(...perdaUltimos6Meses.map((m) => m.valor), 1);
  const W = 300, H = 96, passo = W / (perdaUltimos6Meses.length - 1);
  const pts = perdaUltimos6Meses.map((m, i) => [i * passo, H - 10 - (m.valor / maxMes) * (H - 28)]);
  const linha = pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const area = `${linha} L${W} ${H} L0 ${H} Z`;
  const maxSetor = Math.max(...resumoPorSetor.map(([, d]) => d.valorEmRisco || d.criticos * 1000 + d.atencao), 1);
  const maxPessoa = Math.max(...porUsuarioAuditoria.map(([, q]) => q), 1);
  const sub = lojaNumero != null ? `Loja ${lojaNumero}` : "Sua loja";
  const botaoExp = (rot, Icone, fn, destaque) => (
    <motion.button whileTap={{ scale: 0.96 }} onClick={fn} className="rounded-2xl py-3 px-3 text-[12.5px] font-extrabold flex items-center justify-center gap-2"
      style={destaque ? { background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)`, color: "#fff" } : { background: T.chipBg, color: T.text }}><Icone size={15} />{rot}</motion.button>
  );
  const chips = [["rel-saude", "Saúde"], ["rel-dinheiro", "Dinheiro"], ["rel-perdas", "Perdas"], ["rel-setores", "Setores"], ["rel-equipe", "Equipe"], ["rel-riscos", "Maiores riscos"]];
  return (
    <div className="px-4 pt-4 pb-8 lg:hidden">
      {/* Capa */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ background: FUNDO_MARCA, isolation: "isolate", WebkitMaskImage: "-webkit-radial-gradient(white, black)", transform: "translateZ(0)" }}
        className="relative overflow-hidden rounded-[32px] text-white p-5 shadow-xl shadow-black/15 mb-4">
        <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/70">{sub} · Relatório gerencial</p>
          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Em risco agora</p>
              <p className="font-extrabold leading-tight tabular-nums whitespace-nowrap mt-0.5" style={{ fontSize: Math.max(22, Math.min(34, Math.floor(150 / (formatarMoeda(valorEmRisco).length * 0.6)))) }}>{formatarMoeda(valorEmRisco)}</p>
              <p className="text-[12px] text-white/75 mt-1">de {formatarMoeda(valorTotalMonitorado)} monitorados</p>
            </div>
            <AnelRel partes={[{ v: criticos.length, cor: "#FF5A5F" }, { v: atencao.length, cor: "#FFC24B" }, { v: ok, cor: "#34C77B" }]} tamanho={118} espessura={13} centro={`${pctOk}%`} sub="em dia" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-4 -mx-1 px-1">
            {chips.map(([id, rot]) => (
              <motion.button key={id} whileTap={{ scale: 0.94 }} onClick={() => ir(id)} className="shrink-0 rounded-full px-3.5 py-2 text-[12px] font-bold" style={{ background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.22)" }}>{rot}</motion.button>
            ))}
          </div>
        </div>
      </motion.section>

      <CapituloRel T={T} id="rel-saude" n={1} titulo="Saúde do estoque" sub="Como estão os itens monitorados hoje">
        <div style={{ background: T.card }} className="rounded-[26px] shadow-lg shadow-black/5 p-4 flex flex-col gap-3">
          {[["Vencidos", criticos.length, "#E31E24"], ["Em atenção", atencao.length, "#F5A524"], ["Em dia", ok, "#1F9D55"]].map(([rot, n, cor]) => (
            <div key={rot}>
              <div className="flex items-center justify-between"><span style={{ color: T.text }} className="text-[13px] font-bold flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />{rot}</span><span style={{ color: T.text }} className="text-[13px] font-extrabold tabular-nums">{n}<span style={{ color: T.subtext }} className="font-semibold"> · {items.length ? Math.round((n / items.length) * 100) : 0}%</span></span></div>
              <div style={{ background: T.chipBg }} className="h-2.5 rounded-full overflow-hidden mt-1.5"><motion.div initial={{ width: 0 }} animate={{ width: `${items.length ? (n / items.length) * 100 : 0}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: cor }} /></div>
            </div>
          ))}
        </div>
        <ExportarCapitulo T={T} titulo="Exportar este relatório" itens={[
          ["Relatório gerencial (PDF)", Download, onGerarPDF, true],
          ...(proximosAVencer.length > 0 ? [[`Próximos do vencimento (${proximosAVencer.length}) PDF`, AlertTriangle, () => gerarPDFProximosAVencer(proximosAVencer, { usuario, lojaNumero, showToast })]] : []),
          [`Pedidos de campanha (${qtdPedidos}) PDF`, Tag, gerarPDFPedidos],
          ["Pedidos (CSV)", Download, () => exportarPedidos("csv")], ["Pedidos (Excel)", FileSpreadsheet, () => exportarPedidos("xlsx")],
          ["Perdas e baixas 30 dias (PDF)", FileText, gerarPDFPerdas],
          ["Posição por setor (PDF)", FileText, gerarPDFSetores],
        ]} />
      </CapituloRel>

      <CapituloRel T={T} id="rel-dinheiro" n={2} titulo="Dinheiro exposto" sub="Quanto vence em cada faixa de prazo">
        <div style={{ background: T.card }} className="rounded-[26px] shadow-lg shadow-black/5 p-4">
          <div className="flex h-5 rounded-full overflow-hidden" style={{ background: T.chipBg }}>
            {faixasRisco.map((f, i) => f.valor > 0 && <motion.div key={f.label} initial={{ width: 0 }} animate={{ width: `${(f.valor / (totalFaixas || 1)) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.08 }} style={{ background: cores[i] }} />)}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {faixasRisco.map((f, i) => (
              <div key={f.label} className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-md shrink-0" style={{ background: cores[i] }} />
                <span style={{ color: T.text }} className="text-[12.5px] font-bold flex-1">{f.label} <span style={{ color: T.subtext }} className="font-medium">· {f.qtd} item(ns)</span></span>
                <span style={{ color: T.text }} className="text-[12.5px] font-extrabold tabular-nums">{formatarMoeda(f.valor)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {[["Com troca", porPoliticaTroca.com_troca, "#1F9D55"], ["Sem troca", porPoliticaTroca.sem_troca, RED]].map(([rot, d, cor]) => (
              <div key={rot} style={{ background: T.chipBg }} className="rounded-2xl p-3">
                <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">{rot}</p>
                <p style={{ color: cor }} className="text-[15px] font-extrabold tabular-nums mt-0.5">{formatarMoeda(d.valor)}</p>
                <p style={{ color: T.subtext }} className="text-[11px]">{d.qtd} item(ns)</p>
              </div>
            ))}
          </div>
        </div>
        <ExportarCapitulo T={T} titulo="Exportar financeiro" itens={[
          ["PDF", FileText, gerarPDFFinanceiro, true], ["CSV", Download, () => exportarFinanceiro("csv")], ["Excel", FileSpreadsheet, () => exportarFinanceiro("xlsx")],
        ]} />
      </CapituloRel>

      <CapituloRel T={T} id="rel-perdas" n={3} titulo="Perdas confirmadas" sub="Últimos 6 meses">
        <div style={{ background: T.card }} className="rounded-[26px] shadow-lg shadow-black/5 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">Este mês</p>
              <p style={{ color: T.text }} className="text-[24px] font-extrabold leading-tight tabular-nums">{formatarMoeda(tendenciaPerdas.atual)}</p>
            </div>
            {tendenciaPerdas.variacao !== null && (
              <span className="rounded-full px-3 py-1.5 text-[11.5px] font-extrabold" style={{ background: tendenciaPerdas.variacao <= 0 ? "#E4F7EC" : RED_SOFT, color: tendenciaPerdas.variacao <= 0 ? "#1F9D55" : RED_DARK }}>
                {tendenciaPerdas.variacao > 0 ? "▲ +" : "▼ "}{tendenciaPerdas.variacao}% vs mês anterior
              </span>
            )}
          </div>
          <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full mt-3" aria-label="Perda por mês">
            <defs><linearGradient id="gradPerda" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={RED} stopOpacity=".35" /><stop offset="100%" stopColor={RED} stopOpacity="0" /></linearGradient></defs>
            <path d={area} fill="url(#gradPerda)" />
            <path d={linha} fill="none" stroke={RED} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={i === pts.length - 1 ? 4.5 : 3} fill={i === pts.length - 1 ? RED : T.card} stroke={RED} strokeWidth="2" />)}
            {perdaUltimos6Meses.map((m, i) => <text key={i} x={i * passo} y={H + 13} fontSize="10" fontWeight="600" fill={T.subtext} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} style={{ textTransform: "capitalize" }}>{m.label}</text>)}
          </svg>
          <div style={{ background: T.chipBg }} className="rounded-2xl p-3 mt-3">
            <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">Índice de perda (perda ÷ faturamento)</p>
            {indicePerda != null ? (
              <p style={{ color: T.text }} className="text-[20px] font-extrabold tabular-nums">{indicePerda.toFixed(2)}% <span style={{ color: T.subtext }} className="text-[11px] font-semibold">de {formatarMoeda(faturamentoMensal)}/mês</span></p>
            ) : <p style={{ color: T.subtext }} className="text-[12px] mt-0.5">Informe o faturamento mensal para calcular.</p>}
            {!editFat ? (
              <button onClick={() => setEditFat(true)} style={{ color: BLUE }} className="text-[12px] font-bold mt-1.5">{faturamentoMensal ? "Atualizar faturamento" : "+ Informar faturamento"}</button>
            ) : (
              <div className="flex gap-2 mt-2">
                <input type="number" inputMode="decimal" autoFocus value={faturamentoInput} onChange={(e) => setFaturamentoInput(e.target.value)} placeholder="R$ por mês" style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="flex-1 min-w-0 border rounded-xl px-3 py-2 text-sm outline-none" />
                <button onClick={() => { salvarFaturamento(); setEditFat(false); }} style={{ background: BLUE_DARK }} className="text-white text-[12px] font-bold px-4 rounded-xl">Salvar</button>
              </div>
            )}
          </div>
        </div>
      </CapituloRel>

      <CapituloRel T={T} id="rel-setores" n={4} titulo="Setores" sub="Onde está o maior valor em risco">
        <div style={{ background: T.card }} className="rounded-[26px] shadow-lg shadow-black/5 p-4">
          {resumoPorSetor.length === 0 ? <p style={{ color: T.subtext }} className="text-xs text-center py-4">Nenhum setor com itens ainda.</p> : resumoPorSetor.slice(0, 8).map(([setor, d], i) => (
            <BarraRank key={setor} T={T} pos={i + 1} rotulo={setor} pct={((d.valorEmRisco || d.criticos * 1000 + d.atencao) / maxSetor) * 100}
              texto={d.valorEmRisco > 0 ? formatarMoeda(d.valorEmRisco) : `${d.criticos} venc. · ${d.atencao} atenç.`} cor={d.criticos > 0 ? RED : "#F5A524"} />
          ))}
        </div>
      </CapituloRel>

      <CapituloRel T={T} id="rel-equipe" n={5} titulo="Equipe e rondas" sub="Quem registra e se as rondas estão sendo feitas">
        <div style={{ background: T.card }} className="rounded-[26px] shadow-lg shadow-black/5 p-4">
          <div className="flex items-center gap-4" style={{ color: T.text }}>
            <AnelRel partes={[{ v: rondasResumo.concluidas, cor: "#1F9D55" }, { v: rondasResumo.parciais, cor: "#F5A524" }]} tamanho={96} espessura={11} fundo={T.chipBg} centro={taxaExecucaoRonda != null ? `${taxaExecucaoRonda}%` : "—"} sub="rondas" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold">Execução de rondas</p>
              <p style={{ color: T.subtext }} className="text-[12px] mt-0.5">{rondasResumo.concluidas} concluída(s) · {rondasResumo.parciais} parcial(is)</p>
              <p style={{ color: T.subtext }} className="text-[12px]">{porUsuarioAuditoria.reduce((a, [, q]) => a + q, 0)} ações registradas</p>
            </div>
          </div>
          {porUsuarioAuditoria.length > 0 && <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${T.chipBg}` }}>
            {porUsuarioAuditoria.slice(0, 6).map(([nome, q], i) => <BarraRank key={nome} T={T} pos={i + 1} rotulo={nome} pct={(q / maxPessoa) * 100} texto={`${q}`} cor={BLUE} />)}
          </div>}
          {porTipoAcao.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{porTipoAcao.slice(0, 8).map(([t, q]) => <span key={t} style={{ background: T.chipBg, color: T.text }} className="text-[11px] font-bold rounded-full px-2.5 py-1 capitalize">{t} · {q}</span>)}</div>}
        </div>
        <ExportarCapitulo T={T} titulo="Exportar atividade e rondas" itens={[
          ["PDF", FileText, gerarPDFAtividade, true], ["CSV", Download, () => exportarAtividade("csv")], ["Excel", FileSpreadsheet, () => exportarAtividade("xlsx")],
        ]} />
      </CapituloRel>

      <CapituloRel T={T} id="rel-riscos" n={6} titulo="Maiores riscos" sub="Os itens que mais custam se vencerem">
        <div className="flex flex-col gap-2">
          {topRisco.length === 0 ? <p style={{ color: T.subtext }} className="text-xs text-center py-4">Nenhum item monitorado ainda.</p> : topRisco.slice(0, 6).map((i, k) => {
            const c = corDoNivel(getStatus(i).level);
            return (
              <motion.button key={i.id} whileTap={{ scale: 0.98 }} onClick={() => onOpenDetail(i)} style={{ background: T.card }} className="rounded-[20px] shadow-md shadow-black/5 p-3 flex items-center gap-3 text-left">
                <span style={{ background: c.soft, color: c.cor }} className="h-9 w-9 rounded-full text-[13px] font-extrabold flex items-center justify-center shrink-0">{k + 1}</span>
                <span className="min-w-0 flex-1"><span style={{ color: T.text }} className="block text-[13px] font-extrabold truncate">{i.nome}</span><span style={{ color: T.subtext }} className="block text-[11.5px] truncate">{i.setor} · vence {formatarData(i.validade)}</span></span>
                <span style={{ color: RED_DARK }} className="text-[13px] font-extrabold tabular-nums shrink-0">{formatarMoeda(i.valorRisco)}</span>
              </motion.button>
            );
          })}
        </div>
      </CapituloRel>

    </div>
  );
}

function RelatoriosView({ T, items, historico, auditoria, usuario, showToast, onOpenDetail, rondas, lojaNumero }) {
  const [aba, setAba] = useState("resumo"); // resumo | setores | itens | financeiro | atividade
  const telaLargaRel = useTelaLarga();
  const [exportarAberto, setExportarAberto] = useState(false);
  const SECOES_RELATORIO = [
    { id: "setores", label: "Top setores em risco" },
    { id: "reincidentes", label: "Produtos reincidentes" },
    { id: "responsaveis", label: "Registros por responsável" },
    { id: "rondas", label: "Execução de rondas" },
    { id: "acoesRondas", label: "Ações registradas nas rondas" },
    { id: "prioritarios", label: "Itens prioritários" },
  ];
  const [secoesSelecionadas, setSecoesSelecionadas] = useState(() => new Set(SECOES_RELATORIO.map((s) => s.id)));
  const dados = usarDadosGerenciais(items, historico);
  const { criticos, atencao, valorEmRisco, tendenciaPerdas, resumoPorSetor, reincidentes, rankingResponsaveis } = dados;
  const enriched = items.map((it) => ({ ...it, status: getStatus(it) })).sort((a, b) => a.status.d - b.status.d);

  // Auditoria completa (a prop "auditoria" que o app carrega no início vem limitada a 40 registros;
  // pro relatório de atividade buscamos uma janela bem maior direto do Supabase).
  const [auditoriaCompleta, setAuditoriaCompleta] = useState(auditoria || []);
  useEffect(() => { supaFetchAuditoria(1000).then(setAuditoriaCompleta); }, []);

  const valorTotalMonitorado = useMemo(
    () => items.reduce((acc, i) => acc + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0), 0),
    [items]
  );

  const faixasRisco = useMemo(() => {
    const faixas = [
      { label: "Vencidos", min: -Infinity, max: -1 },
      { label: "1-3 dias", min: 0, max: 3 },
      { label: "4-7 dias", min: 4, max: 7 },
      { label: "8-15 dias", min: 8, max: 15 },
      { label: "16+ dias", min: 16, max: Infinity },
    ];
    return faixas.map((f) => {
      const its = items.filter((i) => { const d = getStatus(i).d; return d >= f.min && d <= f.max; });
      const valor = its.reduce((acc, i) => acc + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0), 0);
      return { ...f, qtd: its.length, valor };
    });
  }, [items]);

  const porPoliticaTroca = useMemo(() => {
    const mapa = { sem_troca: { qtd: 0, valor: 0 }, com_troca: { qtd: 0, valor: 0 } };
    items.forEach((i) => {
      const chave = i.politicaTroca === "sem_troca" ? "sem_troca" : "com_troca";
      mapa[chave].qtd++;
      mapa[chave].valor += (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0);
    });
    return mapa;
  }, [items]);

  const topRisco = useMemo(() => (
    items.map((i) => ({ ...i, valorRisco: (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0) }))
      .sort((a, b) => b.valorRisco - a.valorRisco).slice(0, 10)
  ), [items]);

  const porUsuarioAuditoria = useMemo(() => {
    const mapa = {};
    auditoriaCompleta.forEach((a) => { const n = a.usuario || "—"; mapa[n] = (mapa[n] || 0) + 1; });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [auditoriaCompleta]);

  const porTipoAcao = useMemo(() => {
    const mapa = {};
    auditoriaCompleta.forEach((a) => { const t = a.acao || "—"; mapa[t] = (mapa[t] || 0) + 1; });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [auditoriaCompleta]);

  const rondasResumo = useMemo(() => {
    const lista = rondas || [];
    const concluidas = lista.filter((r) => r.status === "concluida").length;
    const parciais = lista.filter((r) => r.status !== "concluida").length;
    const mapa = {};
    lista.forEach((r) => {
      if (!mapa[r.setor]) mapa[r.setor] = { concluidas: 0, parciais: 0 };
      if (r.status === "concluida") mapa[r.setor].concluidas++; else mapa[r.setor].parciais++;
    });
    return { concluidas, parciais, porSetor: Object.entries(mapa).sort((a, b) => (b[1].concluidas + b[1].parciais) - (a[1].concluidas + a[1].parciais)) };
  }, [rondas]);

  // Item 9 (ROI): perda mês a mês nos últimos 6 meses, pra mostrar tendência de verdade — não só mês atual x anterior
  const perdaUltimos6Meses = useMemo(() => {
    const agora = new Date();
    const meses = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(agora.getFullYear(), agora.getMonth() - (5 - i), 1);
      return { ano: d.getFullYear(), mes: d.getMonth(), label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), valor: 0 };
    });
    historico.forEach((h) => {
      if (!h.vencidoAntes) return;
      const t = new Date(h.dataBaixa);
      const alvo = meses.find((m) => m.ano === t.getFullYear() && m.mes === t.getMonth());
      if (alvo) alvo.valor += (Number(h.quantidade) || 1) * (Number(h.precoUnitario) || 0);
    });
    return meses;
  }, [historico]);

  // Item 9 (ROI): faturamento mensal da loja, salvo no Supabase, pra calcular índice de perda (%)
  const [faturamentoMensal, setFaturamentoMensal] = useState(null);
  const [faturamentoInput, setFaturamentoInput] = useState("");
  const [editandoFaturamento, setEditandoFaturamento] = useState(false);
  useEffect(() => {
    if (lojaNumero) {
      supaFetchConfigLoja(lojaNumero).then((cfg) => {
        if (cfg?.faturamentoMensal != null) { setFaturamentoMensal(cfg.faturamentoMensal); setFaturamentoInput(String(cfg.faturamentoMensal)); }
      });
    }
  }, [aba, lojaNumero, telaLargaRel]);
  function salvarFaturamento() {
    const v = Number(faturamentoInput);
    if (!v || v <= 0) return;
    setFaturamentoMensal(v);
    supaSalvarConfigLoja(lojaNumero, v);
    setEditandoFaturamento(false);
    showToast("Faturamento salvo.");
  }
  const indicePerda = faturamentoMensal ? (tendenciaPerdas.atual / faturamentoMensal) * 100 : null;
  const taxaExecucaoRonda = rondasResumo.concluidas + rondasResumo.parciais > 0
    ? Math.round((rondasResumo.concluidas / (rondasResumo.concluidas + rondasResumo.parciais)) * 100) : null;

  const gerarPDF = () => gerarRelatorioGerencialPDF({
    items, historico, usuario, showToast,
    criticos: dados.criticos, atencao: dados.atencao, valorEmRisco: dados.valorEmRisco,
    tendenciaPerdas: dados.tendenciaPerdas, riscoPorSetor: dados.riscoPorSetor,
    reincidentes: dados.reincidentes, rankingResponsaveis: dados.rankingResponsaveis, rondas, lojaNumero,
    secoes: secoesSelecionadas,
  });

  const gerarPDFPedidos = () => gerarPDFPedidos_({ items: enriched, usuario, lojaNumero, showToast });
  const gerarPDFPerdas = () => gerarPDFPerdas_({ historico, usuario, lojaNumero, showToast, dias: 30 });
  const gerarPDFSetores = () => gerarPDFPosicaoSetores({ items: enriched, usuario, lojaNumero, showToast });
  const pedidosAtivos = enriched.filter((i) => i.pedidoTipo);
  function exportarPedidos(formato) {
    if (!pedidosAtivos.length) { showToast("Nenhum pedido de promoção ou preço direto ativo para exportar.", "aviso"); return; }
    const linhas = pedidosAtivos.map((i) => ({
      Produto: i.nome, Setor: i.setor, Lote: textoLote(i) || "", Validade: formatarData(i.validade), Tipo: rotuloPedido(i.pedidoTipo), Campanha: i.pedidoCampanha || "",
      ValorSugerido: i.pedidoValor != null ? Number(i.pedidoValor).toFixed(2) : "", PedidoPor: i.pedidoPor || "", PedidoEm: dataCurta(i.pedidoEm), Quantidade: i.quantidade,
    }));
    if (formato === "csv") downloadCSV(linhas.map((l) => Object.values(l)), Object.keys(linhas[0] || { Produto: 1, Setor: 1, Lote: 1, Validade: 1, Tipo: 1, Campanha: 1, ValorSugerido: 1, PedidoPor: 1, PedidoEm: 1, Quantidade: 1 }), "condor-pedidos-campanha.csv");
    else downloadPlanilha(linhas, `condor-pedidos-campanha.${formato}`, "Pedidos");
  }
  const gerarPDFFinanceiro = () => gerarRelatorioFinanceiroPDF({
    usuario, showToast, lojaNumero, valorTotalMonitorado, valorEmRisco, faixasRisco, porPoliticaTroca, topRisco,
  });
  const gerarPDFAtividade = () => gerarRelatorioAtividadePDF({
    usuario, showToast, lojaNumero, porUsuarioAuditoria, porTipoAcao, rondasResumo,
  });

  function exportarFinanceiro(formato) {
    const linhas = [
      ...faixasRisco.map((f) => ({ Secao: "Faixa de vencimento", Item: f.label, Quantidade: f.qtd, Valor: f.valor })),
      { Secao: "Política de troca", Item: "Com troca", Quantidade: porPoliticaTroca.com_troca.qtd, Valor: porPoliticaTroca.com_troca.valor },
      { Secao: "Política de troca", Item: "Sem troca", Quantidade: porPoliticaTroca.sem_troca.qtd, Valor: porPoliticaTroca.sem_troca.valor },
      ...topRisco.map((i) => ({ Secao: "Top risco", Item: i.nome, Setor: i.setor, Lote: textoLote(i), Validade: formatarData(i.validade), Valor: i.valorRisco })),
    ];
    if (formato === "csv") {
      downloadCSV(linhas.map((l) => [l.Secao, l.Item, l.Setor || "", l.Lote || "", l.Validade || "", l.Quantidade ?? "", (l.Valor || 0).toFixed(2)]),
        ["Secao", "Item", "Setor", "Lote", "Validade", "Quantidade", "Valor"], "condor-relatorio-financeiro.csv");
    } else {
      downloadPlanilha(linhas, `condor-relatorio-financeiro.${formato}`, "Financeiro");
    }
  }
  function exportarAtividade(formato) {
    const linhas = [
      ...porUsuarioAuditoria.map(([n, q]) => ({ Secao: "Por responsável", Item: n, Quantidade: q })),
      ...porTipoAcao.map(([t, q]) => ({ Secao: "Por tipo de ação", Item: t, Quantidade: q })),
      ...rondasResumo.porSetor.map(([s, d]) => ({ Secao: "Rondas por setor", Item: s, Concluidas: d.concluidas, Parciais: d.parciais })),
    ];
    if (formato === "csv") {
      downloadCSV(linhas.map((l) => [l.Secao, l.Item, l.Quantidade ?? "", l.Concluidas ?? "", l.Parciais ?? ""]),
        ["Secao", "Item", "Quantidade", "Concluidas", "Parciais"], "condor-relatorio-atividade.csv");
    } else {
      downloadPlanilha(linhas, `condor-relatorio-atividade.${formato}`, "Atividade");
    }
  }

  const ABAS = [
    { id: "resumo", label: "Resumo geral" },
    { id: "roi", label: "ROI" },
    { id: "setores", label: "Setores" },
    { id: "itens", label: "Itens" },
    { id: "financeiro", label: "Financeiro" },
    { id: "atividade", label: "Atividade" },
  ];

  return (
    <>
    <RelatoriosDashboard T={T} lojaNumero={lojaNumero} items={items} criticos={criticos} atencao={atencao} valorEmRisco={valorEmRisco} valorTotalMonitorado={valorTotalMonitorado}
      tendenciaPerdas={tendenciaPerdas} perdaUltimos6Meses={perdaUltimos6Meses} faixasRisco={faixasRisco} porPoliticaTroca={porPoliticaTroca} topRisco={topRisco}
      resumoPorSetor={resumoPorSetor} porUsuarioAuditoria={porUsuarioAuditoria} porTipoAcao={porTipoAcao} rondasResumo={rondasResumo} taxaExecucaoRonda={taxaExecucaoRonda}
      indicePerda={indicePerda} faturamentoMensal={faturamentoMensal} faturamentoInput={faturamentoInput} setFaturamentoInput={setFaturamentoInput} salvarFaturamento={salvarFaturamento}
      onGerarPDF={() => setExportarAberto(true)} gerarPDFFinanceiro={gerarPDFFinanceiro} gerarPDFAtividade={gerarPDFAtividade} exportarFinanceiro={exportarFinanceiro} exportarAtividade={exportarAtividade} onOpenDetail={onOpenDetail} gerarPDFPedidos={gerarPDFPedidos} gerarPDFPerdas={gerarPDFPerdas} gerarPDFSetores={gerarPDFSetores} exportarPedidos={exportarPedidos} qtdPedidos={pedidosAtivos.length} proximosAVencer={enriched.filter((i) => i.status.level === "alert")} gerarPDFProximos={() => gerarPDFProximosAVencer(enriched.filter((i) => i.status.level === "alert"), { usuario, lojaNumero, showToast })} />
    <RelatoriosMobile T={T} lojaNumero={lojaNumero} items={items} criticos={criticos} atencao={atencao} valorEmRisco={valorEmRisco} valorTotalMonitorado={valorTotalMonitorado}
      tendenciaPerdas={tendenciaPerdas} perdaUltimos6Meses={perdaUltimos6Meses} faixasRisco={faixasRisco} porPoliticaTroca={porPoliticaTroca} topRisco={topRisco}
      resumoPorSetor={resumoPorSetor} porUsuarioAuditoria={porUsuarioAuditoria} porTipoAcao={porTipoAcao} rondasResumo={rondasResumo} taxaExecucaoRonda={taxaExecucaoRonda}
      indicePerda={indicePerda} faturamentoMensal={faturamentoMensal} faturamentoInput={faturamentoInput} setFaturamentoInput={setFaturamentoInput} salvarFaturamento={salvarFaturamento}
      onGerarPDF={() => setExportarAberto(true)} gerarPDFFinanceiro={gerarPDFFinanceiro} gerarPDFAtividade={gerarPDFAtividade} exportarFinanceiro={exportarFinanceiro} exportarAtividade={exportarAtividade}
      onOpenDetail={onOpenDetail} usuario={usuario} showToast={showToast} gerarPDFPedidos={gerarPDFPedidos} gerarPDFPerdas={gerarPDFPerdas} gerarPDFSetores={gerarPDFSetores} exportarPedidos={exportarPedidos} qtdPedidos={pedidosAtivos.length} proximosAVencer={enriched.filter((i) => i.status.level === "alert")} />
      {exportarAberto && (
        <SelecionarSecoesRelatorioSheet T={T} secoesDisponiveis={SECOES_RELATORIO} selecionadas={secoesSelecionadas}
          onAlternar={(id) => setSecoesSelecionadas((prev) => {
            const novo = new Set(prev);
            if (novo.has(id)) novo.delete(id); else novo.add(id);
            return novo;
          })}
          onFechar={() => setExportarAberto(false)}
          onGerar={() => { gerarPDF(); setExportarAberto(false); }} />
      )}
    </>
  );
}

export { AnelRel, CapituloRel, ExportarCapitulo, RelatoriosDashboard, RelatoriosMobile, RelatoriosView, SelecionarSecoesRelatorioSheet };

// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ClockIcon, ChevronRightIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Carrot, Beef, Croissant, Milk, ShoppingBasket, Wine, Snowflake, SprayCan, Sparkles, Boxes, Warehouse, Package, AlertTriangle, ShieldCheck, TrendingDown, LayoutGrid, Trash2, Plus, ChevronRight, ArrowLeft, Search } from "lucide-react";
import { PalcoPagina } from "../Inicio";
import { FUNDO_MARCA } from "../TelasEntrada";
import { DashBadge, DashCard, DashDonut, DashHBars, DashKpi, DashPageHeader, DashTabs } from "../componentes/dash";
import { EstadoVazioNovo, FaixaChips, LinhaProduto } from "../componentes/ui";
import { BLUE, BLUE_DARK, BLUE_SOFT, MOTIVOS_EXCLUSAO, RED, RED_DARK, RED_SOFT, SUBSETORES_PADRAO, agruparItensPorProduto } from "../lib/constantes";
import { formatarData, formatarMoeda, getStatus, statusStyles, useFormatarMoedaComCamada, useValoresVisiveis } from "../lib/formatos";
import { useDesktop } from "../lib/tela";
import { DashFiltros, TabelaProdutos } from "./Home";

// ============ Bottom Nav ============
// ============ Setores (alertas agrupados por setor, item pedido: aba separada) ============
const ICONE_SETOR = {
  "Hortifruti": Carrot,
  "Açougue": Beef,
  "Padaria": Croissant,
  "Frios e Laticínios": Milk,
  "Mercearia": ShoppingBasket,
  "Bebidas": Wine,
  "Congelados": Snowflake,
  "Limpeza": SprayCan,
  "Higiene e Perfumaria": Sparkles,
  "Bazar": Boxes,
  "CPD / Depósito": Warehouse
};

function iconeDoSetor(nome) { return ICONE_SETOR[nome] || Package; }

function isSameDay(isoA, isoB) {
  if (!isoA || !isoB) return false;
  const a = new Date(isoA), b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function tempoDesde(dataISO) {
  if (!dataISO) return "nunca conferido";
  const ms = Date.now() - new Date(dataISO).getTime();
  const horas = Math.floor(ms / 3600000);
  if (horas < 1) return `há ${Math.max(1, Math.floor(ms / 60000))}min`;
  if (horas < 24) return `há ${horas}h`;
  return `há ${Math.floor(horas / 24)}d`;
}

// ============ Setores — versão dashboard (PC) ============
function SetoresDashboard({ T, grupos, resumo, ultimaRondaPorSetor, onAbrirSetor }) {
  const fmt = useFormatarMoedaComCamada();
  const totalItens = grupos.reduce((a, [, g]) => a + g.total, 0);
  const valorTotal = grupos.reduce((a, [, g]) => a + g.valor, 0);
  const estado = (setor, g) => {
    const ur = ultimaRondaPorSetor[setor];
    const atrasada = !ur || Date.now() - new Date(ur).getTime() > 24 * 3600000;
    if (g.vencido > 0) return { label: "Crítico", bg: RED_SOFT, fg: RED_DARK, bar: RED_DARK };
    if (g.alerta > 0 || atrasada) return { label: g.alerta > 0 ? "Atenção" : "Ronda atrasada", bg: "#FCF0DD", fg: "#C2760C", bar: "#E0921C" };
    return { label: "Controlado", bg: "#E4F7EC", fg: "#1F9D55", bar: "#1F9D55" };
  };
  const ranking = grupos.filter(([, g]) => g.valor > 0).slice(0, 8).map(([setor, g]) => ({ label: setor, value: g.valor, color: g.vencido > 0 ? RED_DARK : RED, right: fmt(g.valor) }));
  return (
    <div className="hidden lg:block">
      <DashPageHeader T={T} title="Setores" subtitle={`${grupos.length} setores · ${totalItens} produtos`} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <DashKpi T={T} label="Setores críticos" value={resumo.criticos} sub="com produto vencido" Icon={AlertTriangle} accent={RED_DARK} />
        <DashKpi T={T} label="Em atenção" value={resumo.atencao} sub="alerta ou ronda atrasada" Icon={ClockIcon} accent="#C98A0C" />
        <DashKpi T={T} label="Controlados" value={resumo.controlados} sub="sem pendências" Icon={ShieldCheck} accent="#1F9D55" />
        <DashKpi T={T} label="Valor em risco" value={fmt(valorTotal)} sub="todos os setores" Icon={TrendingDown} accent={RED} />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <DashCard T={T} title="Valor em risco por setor" subtitle="Setores com maior exposição" className="col-span-1">
          {ranking.length ? <DashHBars T={T} data={ranking} /> : <p style={{ color: T.subtext }} className="text-sm py-8 text-center">Nada em risco agora.</p>}
        </DashCard>
        <DashCard T={T} title="Todos os setores" subtitle="Clique para abrir o setor" className="col-span-2">
          <div className="grid grid-cols-3 gap-3">
            {grupos.map(([setor, g]) => {
              const e = estado(setor, g); const Icone = iconeDoSetor(setor);
              const ok = Math.max(g.total - g.vencido - g.alerta - g.semValidadeCount, 0);
              const pct = (n) => (g.total ? `${(n / g.total) * 100}%` : "0%");
              return (
                <button key={setor} onClick={() => onAbrirSetor(setor)} style={{ borderColor: T.border, background: T.card }} className="text-left rounded-xl border p-4 hover:shadow-md transition">
                  <div className="flex items-center gap-2.5">
                    <div style={{ background: e.bg }} className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"><Icone size={17} color={e.fg} /></div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-bold truncate">{setor}</p><p style={{ color: T.subtext }} className="text-[11px]">{g.total} produto(s)</p></div>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden mt-3" style={{ background: T.chipBg }}>
                    <div style={{ width: pct(g.vencido), background: RED_DARK }} /><div style={{ width: pct(g.alerta), background: RED }} /><div style={{ width: pct(ok), background: "#1F9D55" }} />
                  </div>
                  <div className="flex items-center justify-between mt-2.5">
                    <DashBadge bg={e.bg} color={e.fg}>{e.label}</DashBadge>
                    <span style={{ color: T.subtext }} className="text-[10.5px]">{ultimaRondaPorSetor[setor] ? `ronda ${tempoDesde(ultimaRondaPorSetor[setor])}` : "sem ronda"}</span>
                  </div>
                  {(g.vencido > 0 || g.alerta > 0) && <p style={{ color: T.subtext }} className="text-[11px] mt-2">{g.vencido} vencido(s) · {g.alerta} em alerta · {fmt(g.valor)}</p>}
                </button>
              );
            })}
          </div>
        </DashCard>
      </div>
    </div>
  );
}

function SetoresView({ T, items, catalog, rondas, onIniciarRonda, onOpenDetail, onLancarValidade, onAbrirSetor }) {
  const ehDesktop = useDesktop();
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const enriched = items.map((it) => ({ ...it, status: getStatus(it) }));
  const barcodesComItemAtivo = new Set(items.map((it) => it.barcode));

  const ultimaRondaPorSetor = useMemo(() => {
    const mapa = {};
    rondas.forEach((r) => { if (!mapa[r.setor] || new Date(r.finalizadoEm) > new Date(mapa[r.setor])) mapa[r.setor] = r.finalizadoEm; });
    return mapa;
  }, [rondas]);

  const grupos = useMemo(() => {
    const mapa = {};
    enriched.forEach((i) => {
      if (!mapa[i.setor]) mapa[i.setor] = { total: 0, alerta: 0, vencido: 0, semValidadeCount: 0, valor: 0, itens: [] };
      mapa[i.setor].total++;
      if (i.status.level === "alert") mapa[i.setor].alerta++;
      if (i.status.level === "expired") mapa[i.setor].vencido++;
      if (i.status.level === "alert" || i.status.level === "expired") mapa[i.setor].valor += (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0);
      mapa[i.setor].itens.push(i);
    });
    // Produtos cadastrados no catálogo mas ainda sem nenhuma validade lançada: aparecem também, não ficam escondidos
    Object.entries(catalog || {}).forEach(([barcode, dados]) => {
      if (barcodesComItemAtivo.has(barcode) || !dados.setor) return;
      if (!mapa[dados.setor]) mapa[dados.setor] = { total: 0, alerta: 0, vencido: 0, semValidadeCount: 0, valor: 0, itens: [] };
      mapa[dados.setor].total++;
      mapa[dados.setor].semValidadeCount++;
      mapa[dados.setor].itens.push({ id: `catalogo-${barcode}`, barcode, semValidade: true, ...dados });
    });
    return Object.entries(mapa).sort((a, b) => (b[1].vencido * 2 + b[1].alerta) - (a[1].vencido * 2 + a[1].alerta));
  }, [enriched, catalog]);

  const resumo = useMemo(() => {
    let criticos = 0, atencao = 0, controlados = 0;
    grupos.forEach(([setor, dados]) => {
      const ultimaRonda = ultimaRondaPorSetor[setor];
      const rondaAtrasada = !ultimaRonda || Date.now() - new Date(ultimaRonda).getTime() > 24 * 3600000;
      if (dados.vencido > 0) criticos++;
      else if (dados.alerta > 0 || rondaAtrasada) atencao++;
      else controlados++;
    });
    return { criticos, atencao, controlados };
  }, [grupos, ultimaRondaPorSetor]);

  if (grupos.length === 0) {
    return (
      <div className="px-4 pt-4">
        <div className="text-center py-14 px-6">
          <div style={{ background: BLUE_SOFT }} className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center mb-3"><LayoutGrid size={26} color={BLUE} /></div>
          <p className="font-semibold text-sm">Nenhum setor com produtos ainda</p>
          <p style={{ color: T.subtext }} className="text-xs mt-1">{ehDesktop ? "Os produtos cadastrados pela equipe aparecem agrupados aqui." : "Assim que você bipar produtos, eles aparecem agrupados aqui."}</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <SetoresDashboard T={T} grupos={grupos} resumo={resumo} ultimaRondaPorSetor={ultimaRondaPorSetor} onAbrirSetor={onAbrirSetor} />
    <div className="px-4 pt-4 pb-6 lg:hidden">
      {(() => {
        const info = (setor, dados) => {
          const ur = ultimaRondaPorSetor[setor];
          const atrasada = !ur || Date.now() - new Date(ur).getTime() > 24 * 3600000;
          const comData = dados.total - dados.semValidadeCount;
          const ok = Math.max(0, comData - dados.vencido - dados.alerta);
          let nivel = "ok", rotulo = "Em dia", grad = "linear-gradient(145deg,#1F9D55 0%,#0F6B3A 100%)";
          if (dados.vencido > 0) { nivel = "crit"; rotulo = "Crítico"; grad = "linear-gradient(145deg,#F0343A 0%,#A81419 100%)"; }
          else if (dados.alerta > 0 || atrasada) { nivel = "atencao"; rotulo = dados.alerta > 0 ? "Atenção" : "Sem ronda"; grad = "linear-gradient(145deg,#F5A524 0%,#C2670C 100%)"; }
          return { nivel, rotulo, grad, comData, ok, atrasada, pctOk: comData ? Math.round((ok / comData) * 100) : 100, ur };
        };
        const lista = grupos.map(([setor, dados]) => ({ setor, dados, ...info(setor, dados) }))
          .filter((g) => filtroSetor === "todos" || g.nivel === filtroSetor);
        const totalProdutos = grupos.reduce((a, [, d]) => a + d.total, 0);
        const valorRisco = grupos.reduce((a, [, d]) => a + d.valor, 0);
        const n = grupos.length || 1;
        const Tile = ({ g, idx }) => {
          const Icone = iconeDoSetor(g.setor);
          const cor = g.nivel === "crit" ? "#D92D33" : g.nivel === "atencao" ? "#C2760C" : "#1F9D55";
          const soft = g.nivel === "crit" ? RED_SOFT : g.nivel === "atencao" ? "#FCF0DD" : "#E4F7EC";
          const comData = Math.max(1, g.comData);
          const celulas = [["Vencidos", g.dados.vencido, "#D92D33"], ["Atenção", g.dados.alerta, "#C2760C"], ["Em dia", g.ok, "#1F9D55"]];
          return (
            <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 26, delay: Math.min(idx * 0.04, 0.3) }}
              whileTap={{ scale: 0.985 }} onClick={() => onAbrirSetor(g.setor)} style={{ background: T.card }} className="w-full rounded-[26px] shadow-lg shadow-black/5 text-left p-4">
              <div className="flex items-center gap-3">
                <span style={{ background: soft }} className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"><Icone size={22} color={cor} /></span>
                <div className="min-w-0 flex-1">
                  <p style={{ color: T.text }} className="font-extrabold text-[16px] leading-tight break-words">{g.setor}</p>
                  <p style={{ color: T.subtext }} className="text-[12px] mt-0.5">{g.dados.total} produto{g.dados.total !== 1 ? "s" : ""}{g.dados.semValidadeCount > 0 ? ` · ${g.dados.semValidadeCount} sem data` : ""}</p>
                </div>
                <span style={{ background: soft, color: cor }} className="text-[10.5px] font-extrabold rounded-full px-2.5 py-1 shrink-0">{g.rotulo}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3.5">
                {celulas.map(([rot, n, c]) => (
                  <div key={rot} style={{ background: T.chipBg }} className="rounded-2xl py-2 text-center">
                    <p style={{ color: n > 0 ? c : T.subtext }} className="text-[19px] font-extrabold leading-none tabular-nums">{n}</p>
                    <p style={{ color: T.subtext }} className="text-[10.5px] font-semibold mt-1">{rot}</p>
                  </div>
                ))}
              </div>
              <div style={{ background: T.chipBg }} className="flex h-2 rounded-full overflow-hidden mt-3.5">
                <div style={{ width: `${(g.dados.vencido / comData) * 100}%`, background: "#D92D33" }} /><div style={{ width: `${(g.dados.alerta / comData) * 100}%`, background: "#F5A524" }} /><div style={{ width: `${(g.ok / comData) * 100}%`, background: "#34C77B" }} />
              </div>
              <div className="flex items-center justify-between gap-2 mt-3 text-[11.5px]">
                <span style={{ color: T.subtext }} className="font-semibold">{g.dados.valor > 0 ? <>Em risco: <b style={{ color: T.text }}>{formatarMoeda(g.dados.valor)}</b></> : "Sem valor em risco"}</span>
                <span style={{ color: g.atrasada ? "#C2760C" : T.subtext }} className="font-semibold flex items-center gap-1">{g.ur ? `Ronda ${tempoDesde(g.ur)}` : "Sem ronda"}<ChevronRightIcon className="w-3.5 h-3.5" /></span>
              </div>
            </motion.button>
          );
        };
        return (
          <>
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ background: FUNDO_MARCA, isolation: "isolate", WebkitMaskImage: "-webkit-radial-gradient(white, black)", transform: "translateZ(0)" }}
              className="relative overflow-hidden rounded-[32px] text-white p-5 shadow-xl shadow-black/15 mb-4">
              <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
              <div className="relative">
                <p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/70">Setores da loja</p>
                <div className="flex items-end justify-between gap-3 mt-2">
                  <div>
                    <p className="font-extrabold leading-none tabular-nums text-[44px]">{resumo.criticos + resumo.atencao}<span className="text-[18px] text-white/70 font-bold"> / {grupos.length}</span></p>
                    <p className="text-[12.5px] text-white/80 mt-1.5">setores precisam de você agora</p>
                  </div>
                  <div className="text-right"><p className="text-[11px] text-white/70 font-semibold">{totalProdutos} produtos</p>{valorRisco > 0 && <p className="text-[14px] font-extrabold tabular-nums">{formatarMoeda(valorRisco)}</p>}{valorRisco > 0 && <p className="text-[10.5px] text-white/70">em risco</p>}</div>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden mt-4" style={{ background: "rgba(255,255,255,.2)" }}>
                  <div style={{ width: `${(resumo.criticos / n) * 100}%`, background: "#FF5A5F" }} /><div style={{ width: `${(resumo.atencao / n) * 100}%`, background: "#FFC24B" }} /><div style={{ width: `${(resumo.controlados / n) * 100}%`, background: "#34C77B" }} />
                </div>
                <div className="flex gap-4 mt-2.5 text-[11.5px] font-semibold text-white/85">
                  {[["Críticos", resumo.criticos, "#FF5A5F"], ["Atenção", resumo.atencao, "#FFC24B"], ["Em dia", resumo.controlados, "#34C77B"]].map(([r, v, c]) => <span key={r} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{v} {r}</span>)}
                </div>
              </div>
            </motion.section>
            <FaixaChips T={T} valor={filtroSetor} onChange={setFiltroSetor} opcoes={[["todos", "Todos", grupos.length], ["crit", "Críticos", resumo.criticos], ["atencao", "Atenção", resumo.atencao], ["ok", "Em dia", resumo.controlados]]} />
            {lista.length === 0 ? <EstadoVazioNovo T={T} Icone={LayoutGrid} titulo="Nenhum setor aqui" texto="Troque o filtro para ver os outros." /> : (
              <div className="flex flex-col gap-3">
                {lista.map((g, idx) => <React.Fragment key={g.setor}>{Tile({ g, idx })}</React.Fragment>)}
              </div>
            )}
          </>
        );
      })()}
    </div>
    </>
  );
}

// Bottom sheet de exclusão reutilizável (mesma lógica de motivo usada no modal de detalhe),
// pra permitir excluir direto da listagem de um setor sem precisar abrir o detalhe do produto.
function ExcluirProdutoSheet({ T, item, onCancel, onConfirmar }) {
  const [motivo, setMotivo] = useState(null);
  const [motivoOutro, setMotivoOutro] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div onClick={onCancel} className="absolute inset-0 bg-black/60" />
      <div style={{ background: T.card }} className="relative w-full max-w-md lg:max-w-lg lg:ring-1 lg:ring-black/10 lg:shadow-2xl rounded-t-[28px] p-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] max-h-[90dvh] overflow-y-auto sm:rounded-2xl">
        <div className="flex items-center gap-2.5 mb-3">
          <div style={{ background: RED_SOFT }} className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"><Trash2 size={18} color={RED_DARK} /></div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm">Excluir produto</h3>
            <p style={{ color: T.subtext }} className="text-xs truncate">{item.nome}</p>
          </div>
        </div>
        <p style={{ color: T.subtext }} className="text-[11px] font-medium mb-2">Excluir sem registrar no histórico. Qual o motivo?</p>
        <div className="grid grid-cols-2 gap-1.5">
          {MOTIVOS_EXCLUSAO.map((m) => (
            <button key={m} onClick={() => setMotivo(m)}
              style={motivo === m ? { background: RED_DARK, color: "#fff" } : { background: T.chipBg, color: T.text }}
              className="text-[11px] font-medium py-2.5 rounded-xl">
              {m}
            </button>
          ))}
        </div>
        {motivo === "Outro" && (
          <input value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value.slice(0, 80))}
            placeholder="Descreva o motivo..." autoFocus
            style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }}
            className="w-full min-w-0 mt-2 border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2" />
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} style={{ color: T.subtext }} className="flex-1 text-xs py-2.5">Cancelar</button>
          <button
            onClick={() => onConfirmar(motivo === "Outro" ? (motivoOutro.trim() || "Outro") : motivo)}
            disabled={!motivo || (motivo === "Outro" && !motivoOutro.trim())}
            style={{ background: RED_DARK, color: "#fff" }} className="flex-[2] text-sm font-semibold py-2.5 rounded-xl disabled:opacity-40">
            Sim, excluir
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Página de detalhe de um setor (com filtros e "+" pra cadastrar naquele setor) ============
// Card individual (grid 2 colunas) usado na listagem do setor — extraído pra ser reaproveitado
// tanto pra itens únicos quanto dentro do agrupamento por produto.
function ItemCardGridSetor({ T, item, onOpenDetail, onLancarValidade, onExcluir, setItemParaExcluir }) {
  return (
    <div style={{ background: T.card, borderColor: T.border, borderStyle: item.semValidade ? "dashed" : "solid" }}
      className="relative rounded-2xl overflow-hidden border shadow-lg shadow-black/5 text-left">
      <button onClick={() => (item.semValidade && onLancarValidade ? onLancarValidade(item) : onOpenDetail(item))} className="block w-full text-left">
        <div className="relative">
          {item.foto ? <img src={item.foto} alt="" className="w-full h-24 object-cover" /> : (
            <div style={{ background: BLUE_SOFT }} className="w-full h-24 flex items-center justify-center"><Package size={24} color={BLUE} /></div>
          )}
          {!item.semValidade && (
            <span style={{ background: statusStyles(item.status.level).bg, color: statusStyles(item.status.level).fg }} className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded">
              {item.status.label}
            </span>
          )}
          {item.semValidade && (
            <span style={{ background: "rgba(11,79,158,0.85)", color: "#fff" }} className="absolute top-1.5 left-1.5 h-5 w-5 rounded-full flex items-center justify-center">
              <Plus size={12} />
            </span>
          )}
        </div>
        <div className="p-2.5 pr-8">
          <p className="font-semibold text-xs truncate">{item.nome}</p>
          <p style={{ color: T.subtext }} className="text-[10px] mt-1">{item.semValidade ? "Toque pra cadastrar" : formatarData(item.validade)}</p>
        </div>
      </button>
      {!item.semValidade && onExcluir && (
        <button onClick={() => setItemParaExcluir(item)} style={{ background: "rgba(0,0,0,0.45)" }}
          className="absolute bottom-2 right-2 h-6 w-6 rounded-full flex items-center justify-center">
          <Trash2 size={12} color="#fff" />
        </button>
      )}
    </div>
  );
}

// Card agrupado (grid 2 colunas) — mesmo produto com datas e/ou locais diferentes.
// Expande ocupando as 2 colunas pra mostrar o detalhe de cada lote.
function ItemCardGridAgrupado({ T, base, lotes, totalQuantidade, piorStatus, onOpenDetail }) {
  const [aberto, setAberto] = useState(false);
  const s = statusStyles(piorStatus.level);
  const temDeposito = lotes.some((l) => l.local === "deposito");
  const temLoja = lotes.some((l) => (l.local || "loja") === "loja");

  return (
    <div style={{ background: T.card, borderColor: T.border, gridColumn: aberto ? "1 / -1" : undefined }}
      className="relative rounded-2xl overflow-hidden border shadow-lg shadow-black/5 text-left">
      <button onClick={() => setAberto((v) => !v)} className="block w-full text-left">
        <div className="relative">
          {base.foto ? <img src={base.foto} alt="" className="w-full h-24 object-cover" /> : (
            <div style={{ background: BLUE_SOFT }} className="w-full h-24 flex items-center justify-center"><Package size={24} color={BLUE} /></div>
          )}
          <span style={{ background: s.bg, color: s.fg }} className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded">{piorStatus.label}</span>
          <span style={{ background: "rgba(11,79,158,0.85)", color: "#fff" }} className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded">{lotes.length}x datas</span>
        </div>
        <div className="p-2.5">
          <p className="font-semibold text-xs truncate">{base.nome}</p>
          <p style={{ color: T.subtext }} className="text-[10px] mt-1">{totalQuantidade} un no total</p>
        </div>
      </button>
      {aberto && (
        <div style={{ borderColor: T.border }} className="border-t px-2.5 py-2 flex flex-col gap-1.5">
          {lotes.map((l) => {
            const sl = statusStyles(l.status.level);
            return (
              <button key={l.id} onClick={() => onOpenDetail(l)} style={{ background: T.chipBg }} className="w-full text-left rounded-xl p-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-1.5">
                  <span style={{ background: sl.bg, color: sl.fg }} className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">{sl.label}</span>
                  <span className="text-xs font-semibold">{formatarData(l.validade)}</span>
                  <span style={{ color: T.subtext }} className="text-[10px]">· {l.quantidade || 1}un</span>
                </div>
                <ChevronRight size={13} color={T.subtext} className="shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ Setor detalhe — versão dashboard (PC) ============
function SetorDetalheDashboard({ T, setor, itensDoSetor, filtrados, contagens, ultimaRonda, rondasHoje, parcialHoje, concluidaHoje, search, setSearch, statusFiltro, setStatusFiltro,
  subsetorFiltro, setSubsetorFiltro, subsetoresDisponiveis, ordenarPor, setOrdenarPor, onVoltar, onOpenDetail, onExcluir, ehEncarregado, onDesignar }) {
  const fmt = useFormatarMoedaComCamada();
  const comValidade = itensDoSetor.filter((i) => !i.semValidade);
  const semValidade = itensDoSetor.length - comValidade.length;
  const valorEmRisco = comValidade.filter((i) => i.status.level === "expired" || i.status.level === "alert").reduce((a, i) => a + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0), 0);
  const rondaAtrasada = !ultimaRonda || Date.now() - new Date(ultimaRonda).getTime() > 24 * 3600000;
  const Icone = iconeDoSetor(setor);
  const ok = comValidade.filter((i) => i.status.level === "ok" || i.status.level === "warning").length;
  const donut = [{ label: "Vencidos", value: contagens.vencido, color: RED_DARK }, { label: "Em alerta", value: contagens.alerta, color: RED }, { label: "OK / atenção", value: ok, color: "#1F9D55" }];
  const sel = { background: T.inputBg, borderColor: T.inputBorder, color: T.text };
  const rowsProdutos = filtrados.filter((i) => !i.semValidade);
  const estadoRonda = concluidaHoje ? { t: "Ronda concluída hoje", c: "#1F9D55" } : parcialHoje ? { t: "Ronda parcial hoje", c: "#C98A0C" } : rondaAtrasada ? { t: "Ronda atrasada", c: "#C98A0C" } : { t: "Ronda em dia", c: "#1F9D55" };
  return (
    <div className="hidden lg:block">
      <button onClick={onVoltar} style={{ color: BLUE }} className="flex items-center gap-1.5 text-sm font-semibold mb-3"><ArrowLeft size={15} /> Todos os setores</button>
      <DashPageHeader T={T} title={setor} subtitle={`${itensDoSetor.length} produto(s) · ${estadoRonda.t.toLowerCase()}${ultimaRonda ? ` · última ronda ${tempoDesde(ultimaRonda)}` : ""}`}
        right={ehEncarregado ? <button onClick={onDesignar} style={{ background: T.card, borderColor: T.border, color: BLUE }} className="text-xs font-semibold px-3.5 py-2 rounded-xl border flex items-center gap-1.5"><ShieldCheck size={13} /> Criar ronda deste setor</button> : null} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <DashKpi T={T} label="Vencidos" value={contagens.vencido} sub="retirar da área de venda" Icon={AlertTriangle} accent={RED_DARK} />
        <DashKpi T={T} label="Em alerta" value={contagens.alerta} sub="agir antes de vencer" Icon={ClockIcon} accent={RED} />
        <DashKpi T={T} label="Valor em risco" value={fmt(valorEmRisco)} sub="vencidos + em alerta" Icon={TrendingDown} accent="#C98A0C" />
        <DashKpi T={T} label="Produtos no setor" value={itensDoSetor.length} sub={semValidade ? `${semValidade} sem validade lançada` : "todos com validade"} Icon={Icone} accent={BLUE} />
      </div>
      <div className="grid grid-cols-4 gap-4 items-start">
        <div className="flex flex-col gap-4">
          <DashCard T={T} title="Situação do setor">
            <div className="flex flex-col items-center gap-4">
              <DashDonut T={T} size={150} thickness={20} segments={donut} centerValue={comValidade.length} centerLabel="com validade" />
              <div className="w-full flex flex-col gap-1.5 text-xs">
                {donut.map((d) => <div key={d.label} className="flex items-center gap-2"><i style={{ background: d.color }} className="h-2 w-2 rounded-full" /><span style={{ color: T.subtext }}>{d.label}</span><b className="ml-auto tabular-nums">{d.value}</b></div>)}
              </div>
            </div>
          </DashCard>
          <DashCard T={T} title="Ronda do setor">
            <p style={{ color: estadoRonda.c }} className="text-sm font-bold">{estadoRonda.t}</p>
            <p style={{ color: T.subtext }} className="text-xs mt-1">{ultimaRonda ? `Última ronda finalizada ${tempoDesde(ultimaRonda)}` : "Nenhuma ronda finalizada ainda"}</p>
            <p style={{ color: T.subtext }} className="text-xs mt-1">{rondasHoje.length} ronda(s) hoje. Rondas são feitas pelo celular, no corredor.</p>
          </DashCard>
        </div>
        <DashCard T={T} title="Produtos do setor" subtitle={`${rowsProdutos.length} resultado(s)`} className="col-span-3"
          right={<DashTabs T={T} value={statusFiltro} onChange={setStatusFiltro} options={[{ id: "todos", label: "Todos" }, { id: "alerta", label: "Em alerta" }, { id: "vencido", label: "Vencidos", color: RED_DARK }]} />}>
          <DashFiltros T={T}>
            <div style={{ background: T.inputBg, borderColor: T.inputBorder }} className="flex items-center gap-2 border rounded-xl px-3 py-2 flex-1 min-w-[14rem]">
              <MagnifyingGlassIcon className="w-4 h-4" style={{ color: T.subtext }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou código…" style={{ color: T.text }} className="bg-transparent outline-none text-sm flex-1" />
            </div>
            {subsetoresDisponiveis.length > 0 && (
              <select value={subsetorFiltro} onChange={(e) => setSubsetorFiltro(e.target.value)} style={sel} className="border rounded-xl px-3 py-2 text-sm outline-none">
                <option value="todos">Todos os subsetores</option>{subsetoresDisponiveis.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>)}
            <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)} style={sel} className="border rounded-xl px-3 py-2 text-sm outline-none">
              <option value="urgencia">Mais urgentes</option><option value="nome">Nome (A–Z)</option><option value="valor">Maior valor</option>
            </select>
          </DashFiltros>
          <TabelaProdutos T={T} itens={rowsProdutos} onOpenDetail={onOpenDetail} mostrarSetor={false} />
        </DashCard>
      </div>
    </div>
  );
}

// Tela intermediária: setor -> subcategorias (ex.: Mercearia -> Seca leve, Seca doce...) -> produtos
function SetorSubcategoriasView({ T, setor, items, catalog, extras, onVoltar, onEscolher, onCriarSubsetor, onCadastrarNoSetor }) {
  const podeVerValores = useValoresVisiveis();
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const Icone = iconeDoSetor(setor);
  const todos = useMemo(() => {
    const ativos = items.filter((i) => i.setor === setor).map((i) => ({ ...i, status: getStatus(i) }));
    const com = new Set(ativos.map((i) => i.barcode));
    const sem = Object.entries(catalog || {}).filter(([b, d]) => d.setor === setor && !com.has(b)).map(([b, d]) => ({ id: `catalogo-${b}`, barcode: b, semValidade: true, ...d }));
    return [...ativos, ...sem];
  }, [items, catalog, setor]);
  const nomes = useMemo(() => {
    const base = [...(SUBSETORES_PADRAO[setor] || []), ...extras];
    todos.forEach((i) => { if (i.subsetor && !base.some((n) => n.toLowerCase() === i.subsetor.toLowerCase())) base.push(i.subsetor); });
    return base;
  }, [setor, extras, todos]);
  const resumo = (lista) => {
    const ativos = lista.filter((i) => !i.semValidade);
    return {
      total: lista.length,
      vencidos: ativos.filter((i) => i.status.level === "expired").length,
      alerta: ativos.filter((i) => i.status.level === "alert").length,
      risco: ativos.filter((i) => i.status.level === "expired" || i.status.level === "alert").reduce((a, i) => a + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0), 0),
    };
  };
  const linhas = nomes.map((n) => ({ id: n, nome: n, ...resumo(todos.filter((i) => (i.subsetor || "").toLowerCase() === n.toLowerCase())) }));
  const semSub = resumo(todos.filter((i) => !i.subsetor));
  const geral = resumo(todos);
  const Cartao = ({ id, nome, total, vencidos, alerta, risco, destaque }) => (
    <motion.button whileTap={{ scale: 0.98 }} onClick={() => onEscolher(id)} style={{ background: T.card, borderColor: T.inputBorder }}
      className="w-full text-left rounded-2xl border px-4 py-3.5 flex items-center gap-3 shadow-sm">
      <span className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: destaque ? BLUE : T.chipBg, color: destaque ? "#fff" : BLUE }}><Icone size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold truncate" style={{ color: T.text }}>{nome}</span>
        <span className="block text-[12px] font-semibold mt-0.5" style={{ color: T.subtext }}>{total} produto{total !== 1 ? "s" : ""}</span>
        {(vencidos > 0 || alerta > 0 || (risco > 0 && podeVerValores)) && (
          <span className="flex flex-wrap gap-1.5 mt-1.5">
            {vencidos > 0 && <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5" style={{ background: "#E31E2418", color: "#E31E24" }}>{vencidos} vencido{vencidos !== 1 ? "s" : ""}</span>}
            {alerta > 0 && <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5" style={{ background: "#F5A52422", color: "#B87400" }}>{alerta} em alerta</span>}
            {risco > 0 && podeVerValores && <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5" style={{ background: T.chipBg, color: T.text }}>{formatarMoeda(risco)} em risco</span>}
          </span>
        )}
      </span>
      <ChevronRight size={18} color={T.subtext} className="shrink-0" />
    </motion.button>
  );
  return (
    <div className="px-4 pt-4 lg:px-0 lg:pt-0">
      <motion.button whileTap={{ scale: 0.95 }} onClick={onVoltar} style={{ background: T.card, color: T.text }} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-full pl-2.5 pr-3.5 py-2 shadow-md">
        <ArrowLeft size={15} /> Todos os setores
      </motion.button>
      <PalcoPagina className="mb-4" titulo={setor} subtitulo={`${nomes.length} subcategoria${nomes.length !== 1 ? "s" : ""} · ${geral.total} produto${geral.total !== 1 ? "s" : ""}`}
        acao={onCadastrarNoSetor ? (
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => onCadastrarNoSetor(setor)} aria-label="Cadastrar produto neste setor" className="h-11 w-11 rounded-full bg-white flex items-center justify-center shadow-md shrink-0" style={{ color: BLUE_DARK }}><Plus size={20} /></motion.button>
        ) : <span className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,.15)" }}><Icone size={22} color="#fff" /></span>}>
        <p className="text-[12.5px] text-white/80 font-semibold">Escolha uma subcategoria para ver os produtos.</p>
      </PalcoPagina>
      <div className="space-y-2.5 pb-6 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:items-stretch">
        <Cartao id="__todos__" nome={`Todos os produtos de ${setor}`} {...geral} destaque />
        {linhas.map((l) => <Cartao key={l.id} {...l} />)}
        {semSub.total > 0 && <Cartao id="__sem__" nome="Sem subcategoria" {...semSub} />}
        {onCriarSubsetor && (criando ? (
          <div className="flex gap-2 lg:col-span-full">
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={40} placeholder="Nome da subcategoria" autoFocus
              style={{ background: T.card, color: T.text, borderColor: T.inputBorder }} className="flex-1 rounded-2xl border px-4 py-3 text-sm outline-none" />
            <button onClick={() => { if (novoNome.trim()) { onCriarSubsetor(setor, novoNome); setNovoNome(""); setCriando(false); } }} style={{ background: BLUE, color: "#fff" }} className="px-4 rounded-2xl text-sm font-bold">Criar</button>
            <button onClick={() => { setCriando(false); setNovoNome(""); }} style={{ color: T.subtext }} className="px-2 text-sm">✕</button>
          </div>
        ) : (
          <button onClick={() => setCriando(true)} style={{ borderColor: T.inputBorder, color: BLUE }} className="w-full rounded-2xl border-2 border-dashed py-3 text-[13px] font-bold flex items-center justify-center gap-1.5"><Plus size={16} /> Nova subcategoria</button>
        ))}
      </div>
    </div>
  );
}

function SetorDetalheView({ T, setor, items, catalog, rondas, subInicial, onVoltar, onIniciarRonda, onOpenDetail, onLancarValidade, onCadastrarNoSetor, onExcluir, podeGerirProduto, usuario, ehEncarregado, perfil }) {
  const podeVerValores = useValoresVisiveis();
  const [itemParaExcluir, setItemParaExcluir] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos"); // todos | alerta | vencido
  const [subsetorFiltro, setSubsetorFiltro] = useState(!subInicial || subInicial === "__todos__" ? "todos" : subInicial);
  const [ordenarPor, setOrdenarPor] = useState("urgencia"); // urgencia | nome | valor
  const barcodesComItemAtivo = new Set(items.filter((i) => i.setor === setor).map((it) => it.barcode));

  const itensDoSetor = useMemo(() => {
    const ativos = items.filter((i) => i.setor === setor).map((i) => ({ ...i, status: getStatus(i) }));
    const semValidade = Object.entries(catalog || {})
      .filter(([barcode, dados]) => dados.setor === setor && !barcodesComItemAtivo.has(barcode))
      .map(([barcode, dados]) => ({ id: `catalogo-${barcode}`, barcode, semValidade: true, ...dados }));
    return [...ativos, ...semValidade];
  }, [items, catalog, setor]);

  const subsetoresDisponiveis = useMemo(() => {
    const set = new Set(itensDoSetor.filter((i) => i.subsetor).map((i) => i.subsetor));
    return Array.from(set).sort();
  }, [itensDoSetor]);

  const rondasDoSetor = useMemo(() => rondas.filter((r) => r.setor === setor), [rondas, setor]);
  const ultimaRonda = useMemo(() => {
    const finalizadas = rondasDoSetor.filter((r) => r.finalizadoEm).sort((a, b) => new Date(b.finalizadoEm) - new Date(a.finalizadoEm));
    return finalizadas.length ? finalizadas[0].finalizadoEm : null;
  }, [rondasDoSetor]);

  const hoje = new Date().toISOString();
  const rondasHoje = rondasDoSetor.filter((r) => isSameDay(r.iniciadoEm, hoje));
  const parcialHoje = rondasHoje.find((r) => r.status === "parcial");
  const concluidaHoje = rondasHoje.find((r) => r.status === "concluida");

  let filtrados = itensDoSetor.filter((i) => {
    const matchBusca = i.nome.toLowerCase().includes(search.toLowerCase()) || i.barcode.includes(search);
    if (!matchBusca) return false;
    if (subsetorFiltro === "__sem__" ? !!i.subsetor : (subsetorFiltro !== "todos" && i.subsetor !== subsetorFiltro)) return false;
    if (i.semValidade) return statusFiltro === "todos";
    if (statusFiltro === "alerta") return i.status.level === "alert";
    if (statusFiltro === "vencido") return i.status.level === "expired";
    return true;
  });
  filtrados = filtrados.sort((a, b) => {
    if (a.semValidade && !b.semValidade) return 1;
    if (!a.semValidade && b.semValidade) return -1;
    if (a.semValidade && b.semValidade) return a.nome.localeCompare(b.nome);
    if (ordenarPor === "nome") return a.nome.localeCompare(b.nome);
    if (ordenarPor === "valor") {
      const valorA = (Number(a.quantidade) || 1) * (Number(a.precoUnitario) || 0);
      const valorB = (Number(b.quantidade) || 1) * (Number(b.precoUnitario) || 0);
      return valorB - valorA;
    }
    return a.status.d - b.status.d;
  });

  const contagens = {
    vencido: itensDoSetor.filter((i) => !i.semValidade && i.status.level === "expired").length,
    alerta: itensDoSetor.filter((i) => !i.semValidade && i.status.level === "alert").length
  };

  return (
    <div className="px-4 pt-4 lg:px-0 lg:pt-0">
      <SetorDetalheDashboard T={T} setor={setor} itensDoSetor={itensDoSetor} filtrados={filtrados} contagens={contagens} ultimaRonda={ultimaRonda} rondasHoje={rondasHoje}
        parcialHoje={parcialHoje} concluidaHoje={concluidaHoje} search={search} setSearch={setSearch} statusFiltro={statusFiltro} setStatusFiltro={setStatusFiltro}
        subsetorFiltro={subsetorFiltro} setSubsetorFiltro={setSubsetorFiltro} subsetoresDisponiveis={subsetoresDisponiveis} ordenarPor={ordenarPor} setOrdenarPor={setOrdenarPor}
        onVoltar={onVoltar} onOpenDetail={onOpenDetail} ehEncarregado={ehEncarregado} onDesignar={() => onIniciarRonda(setor)} />
      <div className="lg:hidden">
        <motion.button whileTap={{ scale: 0.95 }} onClick={onVoltar} style={{ background: T.card, color: T.text }} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-full pl-2.5 pr-3.5 py-2 shadow-md shadow-black/5">
          <ArrowLeft size={15} /> {subInicial ? setor : "Todos os setores"}
        </motion.button>
        {(() => {
          const IconeSetor = iconeDoSetor(setor);
          const valorEmRisco = itensDoSetor.filter((i) => !i.semValidade && (i.status.level === "expired" || i.status.level === "alert"))
            .reduce((acc, i) => acc + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0), 0);
          const rondaAtrasada = !ultimaRonda || Date.now() - new Date(ultimaRonda).getTime() > 24 * 3600000;
          const nOk = itensDoSetor.filter((i) => !i.semValidade).length - contagens.vencido - contagens.alerta;
          return (
            <PalcoPagina className="mb-4" titulo={subsetorFiltro === "todos" ? setor : `${setor} · ${subsetorFiltro === "__sem__" ? "Sem subcategoria" : subsetorFiltro}`} subtitulo={`${itensDoSetor.length} produto${itensDoSetor.length !== 1 ? "s" : ""}`}
              acao={onCadastrarNoSetor ? (
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => onCadastrarNoSetor(setor)} aria-label="Cadastrar produto neste setor" className="h-11 w-11 rounded-full bg-white flex items-center justify-center shadow-md shrink-0" style={{ color: BLUE_DARK }}><Plus size={22} /></motion.button>
              ) : <span className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,.15)" }}><IconeSetor size={22} color="#fff" /></span>}>
              <div className="grid grid-cols-3 gap-2">
                {[["Vencidos", contagens.vencido, "#E31E24"], ["Em alerta", contagens.alerta, "#F5A524"], ["Em dia", Math.max(0, nOk), "#34C77B"]].map(([rot, n, cor]) => (
                  <div key={rot} className="rounded-2xl py-2.5 text-center" style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.2)" }}>
                    <p className="text-[22px] font-extrabold leading-none tabular-nums">{n}</p>
                    <p className="text-[10.5px] font-semibold text-white/85 mt-1.5 flex items-center justify-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: cor, boxShadow: `0 0 8px ${cor}` }} />{rot}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 rounded-2xl px-3 py-2.5 flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.2)" }}>
                <div className="min-w-0">
                  <p className="text-[9.5px] font-bold uppercase tracking-[.12em] text-white/65">Última ronda</p>
                  <p className="text-[13px] font-extrabold truncate" style={{ color: rondaAtrasada ? "#FFD27A" : "#fff" }}>{tempoDesde(ultimaRonda)}</p>
                </div>
                {valorEmRisco > 0 && podeVerValores && (
                  <div className="text-right shrink-0">
                    <p className="text-[9.5px] font-bold uppercase tracking-[.12em] text-white/65">Valor em risco</p>
                    <p className="text-[13px] font-extrabold">{formatarMoeda(valorEmRisco)}</p>
                  </div>
                )}
              </div>
              {(parcialHoje || (concluidaHoje && !parcialHoje)) && (
                <p className="text-[11px] font-semibold mt-2 text-white/85">
                  {parcialHoje ? `Ronda parcial hoje — iniciada por ${parcialHoje.usuario || "alguém"}${parcialHoje.finalizadoPor && parcialHoje.finalizadoPor !== parcialHoje.usuario ? `, retomada por ${parcialHoje.finalizadoPor}` : ""}.`
                    : `Ronda concluída hoje por ${concluidaHoje.finalizadoPor || concluidaHoje.usuario || "alguém"}.`}
                </p>
              )}
              {ehEncarregado && itensDoSetor.length > 0 && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => onIniciarRonda(setor)} className="mt-3 w-full bg-white rounded-2xl py-3 text-[13px] font-extrabold flex items-center justify-center gap-1.5 shadow-md" style={{ color: BLUE_DARK }}>
                  <ShieldCheck size={16} /> Criar ronda deste setor
                </motion.button>
              )}
            </PalcoPagina>
          );
        })()}

        <div className="relative mb-3">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" color={T.subtext} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto ou código..."
            style={{ background: T.card, color: T.text, borderColor: T.inputBorder }} className="w-full rounded-full pl-11 pr-4 py-3 text-sm border outline-none focus:ring-2 shadow-sm" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 no-scrollbar">
          {[["todos", "Todos"], ["vencido", "Vencidos"], ["alerta", "Em alerta"]].map(([id, label]) => (
            <button key={id} onClick={() => setStatusFiltro(id)} style={statusFiltro === id ? { background: BLUE_DARK, color: "#fff" } : { background: T.card, color: T.text }}
              className="whitespace-nowrap text-xs font-bold px-4 py-2 rounded-full shrink-0 shadow-sm">{label}</button>
          ))}
          {subsetoresDisponiveis.length > 0 && (
            <select value={subsetorFiltro} onChange={(e) => setSubsetorFiltro(e.target.value)} style={{ background: subsetorFiltro !== "todos" ? BLUE_DARK : T.card, color: subsetorFiltro !== "todos" ? "#fff" : T.text }}
              className="whitespace-nowrap text-xs font-bold px-3 py-2 rounded-full shrink-0 outline-none shadow-sm">
              <option value="todos">Todos os subsetores</option>
              {subsetoresDisponiveis.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}
          <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)} style={{ background: T.card, color: T.text }} className="whitespace-nowrap text-xs font-bold px-3 py-2 rounded-full shrink-0 outline-none shadow-sm">
            <option value="urgencia">Urgência</option><option value="nome">Nome</option><option value="valor">Maior valor</option>
          </select>
        </div>

        {filtrados.length === 0 ? (
          <p style={{ color: T.subtext }} className="text-sm text-center py-10">Nenhum produto encontrado com esse filtro.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {agruparItensPorProduto(filtrados.filter((i) => !i.semValidade)).map((g, i) => (
              <LinhaProduto key={g.unico ? g.item.id : `grupo-${i}`} T={T} idx={i} podeVerValores={podeVerValores}
                item={g.unico ? g.item : g.base} lotes={g.unico ? null : g.lotes} totalQuantidade={g.totalQuantidade} piorStatus={g.unico ? g.item.status : g.piorStatus}
                onOpenDetail={onOpenDetail} onExcluir={g.unico && onExcluir && (!podeGerirProduto || podeGerirProduto(g.item)) ? () => setItemParaExcluir(g.item) : null} />
            ))}
            {onLancarValidade && filtrados.filter((i) => i.semValidade).map((item, i) => (
              <LinhaProduto key={item.id} T={T} idx={i} item={item} semValidade onOpenDetail={() => onLancarValidade(item)} />
            ))}
          </div>
        )}
      </div>

      {itemParaExcluir && (
        <ExcluirProdutoSheet T={T} item={itemParaExcluir} onCancel={() => setItemParaExcluir(null)}
          onConfirmar={(motivo) => { onExcluir(itemParaExcluir, motivo); setItemParaExcluir(null); }} />
      )}
    </div>
  );
}

export { ExcluirProdutoSheet, ICONE_SETOR, ItemCardGridAgrupado, ItemCardGridSetor, SetorDetalheDashboard, SetorDetalheView, SetorSubcategoriasView, SetoresDashboard, SetoresView, iconeDoSetor, isSameDay, tempoDesde };

// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ClockIcon, MagnifyingGlassIcon, ChevronRightIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { FireIcon as FireIconSolid } from "@heroicons/react/24/solid";
import { Boxes, AlertTriangle, TrendingDown, Search, X as CloseIcon, SlidersHorizontal, LayoutGrid, List as ListIcon } from "lucide-react";
import { PalcoInicio } from "../Inicio";
import { FUNDO_MARCA } from "../TelasEntrada";
import { EmptyState, FichaFiltro, GrupoFiltro, Thumb } from "../componentes/ItemCards";
import { DashBadge, DashCard, DashDonut, DashHBars, DashKpi, DashPageHeader, DashTable, DashTabs } from "../componentes/dash";
import { CartaoGrade, LinhaProduto } from "../componentes/ui";
import { BLUE, BLUE_DARK, BLUE_SOFT, LOGO_SRC, RED, RED_DARK, RED_SOFT, agruparItensPorProduto, ehPerecivel } from "../lib/constantes";
import { formatarData, formatarMoeda, getStatus, statusStyles, useFormatarMoedaComCamada, useValoresVisiveis } from "../lib/formatos";
import { textoLote } from "../lib/produto";
import { calcularPrioridade, sanitizarTexto } from "../lib/utilidades";

// ============ Home ============
// Item 33: busca "inteligente" — entende algumas expressões em linguagem natural, além de nome/código
function interpretarBusca(query, item) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const valor = (Number(item.quantidade) || 1) * (Number(item.precoUnitario) || 0);

  if (/vence\s*hoje|vencendo\s*hoje/.test(q)) return item.status.d === 0;
  if (/vence\s*amanh[ãa]/.test(q)) return item.status.d === 1;
  if (/venc(ido|idos)/.test(q) && !/vencendo/.test(q)) return item.status.level === "expired";
  const emDias = q.match(/vence(ndo)?\s*em\s*(\d+)\s*dias?/);
  if (emDias) return item.status.d >= 0 && item.status.d <= Number(emDias[2]);
  const acima = q.match(/acima\s*de\s*(?:r\$)?\s*(\d+)/);
  if (acima) return valor > Number(acima[1]);
  const abaixo = q.match(/abaixo\s*de\s*(?:r\$)?\s*(\d+)/);
  if (abaixo) return valor < Number(abaixo[1]);
  if (/sem\s*troca/.test(q)) return item.politicaTroca === "sem_troca";

  return item.nome.toLowerCase().includes(q) || item.barcode.includes(q);
}

// ============ Produtos monitorados — versão dashboard (PC) ============
const NIVEL_BADGE = (level) => level === "expired" ? { bg: RED_SOFT, fg: RED_DARK } : level === "alert" ? { bg: "#FDE8E8", fg: RED } : level === "warning" ? { bg: "#FCF0DD", fg: "#C2760C" } : { bg: "#E4F7EC", fg: "#1F9D55" };

function diasTexto(d) { return d < 0 ? `${Math.abs(d)} dia(s) vencido` : d === 0 ? "vence hoje" : `${d} dia(s)`; }

function TabelaProdutos({ T, itens, onOpenDetail, limite = 60, mostrarSetor = true }) {
  const fmt = useFormatarMoedaComCamada();
  const [mostrar, setMostrar] = useState(limite);
  useEffect(() => { setMostrar(limite); }, [itens.length, limite]);
  const rows = itens.slice(0, mostrar).map((i) => ({ ...i, id: i.id }));
  const cols = [
    { key: "nome", label: "Produto", render: (i) => (
      <div className="flex items-center gap-3 min-w-0">
        <Thumb foto={i.foto} size={36} />
        <div className="min-w-0"><p className="font-semibold truncate max-w-[22rem]">{i.nome}</p>{i.barcode && <p style={{ color: T.subtext }} className="text-[10.5px] font-mono">{i.barcode}</p>}</div>
      </div>) },
    ...(mostrarSetor ? [{ key: "setor", label: "Setor", render: (i) => <span style={{ color: T.subtext }}>{i.setor}</span> }] : []),
    { key: "validade", label: "Validade", render: (i) => <span className="tabular-nums">{formatarData(i.validade)}</span> },
    { key: "lote", label: "Lote", render: (i) => <span style={{ color: T.subtext }} className="tabular-nums">{textoLote(i) || "—"}</span> },
    { key: "dias", label: "Prazo", render: (i) => { const b = NIVEL_BADGE(i.status.level); return <DashBadge bg={b.bg} color={b.fg}>{diasTexto(i.status.d)}</DashBadge>; } },
    { key: "quantidade", label: "Qtd", align: "right", render: (i) => <span className="tabular-nums">{i.quantidade ?? 1}</span> },
    { key: "valor", label: "Valor", align: "right", render: (i) => <span className="tabular-nums font-semibold">{fmt((Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0))}</span> },
    { key: "status", label: "Status", align: "right", render: (i) => { const b = statusStyles(i.status.level); return <span style={{ background: b.bg, color: b.fg }} className="text-[10px] font-bold px-2.5 py-1 rounded-full">{i.status.label}</span>; } },
  ];
  return (
    <>
      <DashTable T={T} rows={rows} cols={cols} onRow={onOpenDetail} empty="Nenhum produto encontrado." />
      {itens.length > mostrar && (
        <div className="pt-6 text-center">
          <button onClick={() => setMostrar((m) => m + 60)} style={{ background: T.chipBg, color: T.text }} className="text-xs font-semibold px-4 py-2 rounded-xl">Mostrar mais ({itens.length - mostrar} restantes)</button>
        </div>
      )}
    </>
  );
}

function DashFiltros({ T, children }) {
  return <div className="flex items-center gap-3 flex-wrap mb-4">{children}</div>;
}

function ProdutosDashboard({ T, items, historico, search, setSearch, filtroSetor, setFiltroSetor, ordenarPor, setOrdenarPor, onOpenDetail, onVerPrioridades }) {
  const fmt = useFormatarMoedaComCamada();
  const [categoria, setCategoria] = useState("todos");
  const enriched = useMemo(() => items.map((it) => ({ ...it, status: getStatus(it) })), [items]);
  const kpi = useMemo(() => {
    const val = (arr) => arr.reduce((a, i) => a + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0), 0);
    const venc = enriched.filter((i) => i.status.level === "expired"), alerta = enriched.filter((i) => i.status.level === "alert"), aten = enriched.filter((i) => i.status.level === "warning");
    return { total: enriched.length, venc: venc.length, alerta: alerta.length, aten: aten.length, risco: val([...venc, ...alerta]) };
  }, [enriched]);
  const setores = useMemo(() => ["Todos", ...Array.from(new Set(enriched.filter((i) => categoria === "todos" || (categoria === "pereciveis" ? ehPerecivel(i.setor) : !ehPerecivel(i.setor))).map((i) => i.setor)))], [enriched, categoria]);
  const lista = useMemo(() => enriched.filter((i) => {
    if (categoria === "pereciveis" && !ehPerecivel(i.setor)) return false;
    if (categoria === "outros" && ehPerecivel(i.setor)) return false;
    if (filtroSetor !== "Todos" && i.setor !== filtroSetor) return false;
    return interpretarBusca(search, i);
  }).sort((a, b) => ordenarPor === "nome" ? a.nome.localeCompare(b.nome) : ordenarPor === "setor" ? a.setor.localeCompare(b.setor) : ordenarPor === "validade" ? b.status.d - a.status.d : a.status.d - b.status.d), [enriched, categoria, filtroSetor, search, ordenarPor]);
  const porSetor = useMemo(() => {
    const m = {};
    enriched.filter((i) => i.status.level === "alert" || i.status.level === "expired").forEach((i) => { m[i.setor] = (m[i.setor] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value, color: RED }));
  }, [enriched]);
  const donut = [{ label: "Vencidos", value: kpi.venc, color: RED_DARK }, { label: "Em alerta", value: kpi.alerta, color: RED }, { label: "Atenção", value: kpi.aten, color: "#C98A0C" }, { label: "OK", value: kpi.total - kpi.venc - kpi.alerta - kpi.aten, color: "#1F9D55" }];
  const sel = { background: T.inputBg, borderColor: T.inputBorder, color: T.text };

  return (
    <div className="hidden lg:block">
      <DashPageHeader T={T} title="Produtos monitorados" subtitle={`${kpi.total} produtos acompanhados na loja`}
        right={<button onClick={onVerPrioridades} style={{ background: T.card, borderColor: T.border, color: T.text }} className="text-xs font-semibold px-3.5 py-2 rounded-xl border">Ver prioridade de perda</button>} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <DashKpi T={T} label="Total monitorado" value={kpi.total} sub="produtos com validade" Icon={Boxes} accent={BLUE} />
        <DashKpi T={T} label="Vencidos" value={kpi.venc} sub="retirar da área de venda" Icon={AlertTriangle} accent={RED_DARK} />
        <DashKpi T={T} label="Em alerta" value={kpi.alerta} sub={`${kpi.aten} em atenção`} Icon={ClockIcon} accent="#C98A0C" />
        <DashKpi T={T} label="Valor em risco" value={fmt(kpi.risco)} sub="vencidos + em alerta" Icon={TrendingDown} accent={RED} />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <DashCard T={T} title="Situação dos produtos" subtitle="Distribuição por status">
          <div className="flex items-center gap-6">
            <DashDonut T={T} size={140} thickness={20} segments={donut} centerValue={kpi.total} centerLabel="produtos" />
            <div className="flex flex-col gap-2 text-xs flex-1">
              {donut.map((s) => <div key={s.label} className="flex items-center gap-2"><i style={{ background: s.color }} className="h-2 w-2 rounded-full" /><span style={{ color: T.subtext }}>{s.label}</span><b className="ml-auto tabular-nums">{s.value}</b></div>)}
            </div>
          </div>
        </DashCard>
        <DashCard T={T} title="Críticos por setor" subtitle="Vencidos + em alerta" className="col-span-2">
          {porSetor.length ? <DashHBars T={T} data={porSetor} /> : <p style={{ color: T.subtext }} className="text-sm py-6 text-center">Nenhum produto crítico. 🎉</p>}
        </DashCard>
      </div>
      <DashCard T={T} title="Lista de produtos" subtitle={`${lista.length} resultado(s)`}
        right={<DashTabs T={T} value={categoria} onChange={(v) => { setCategoria(v); setFiltroSetor("Todos"); }} options={[{ id: "todos", label: "Todos" }, { id: "pereciveis", label: "Perecíveis" }, { id: "outros", label: "Outros" }]} />}>
        <DashFiltros T={T}>
          <div style={{ background: T.inputBg, borderColor: T.inputBorder }} className="flex items-center gap-2 border rounded-xl px-3 py-2 flex-1 min-w-[16rem]">
            <MagnifyingGlassIcon className="w-4 h-4" style={{ color: T.subtext }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, código, setor…" style={{ color: T.text }} className="bg-transparent outline-none text-sm flex-1" />
          </div>
          <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)} style={sel} className="border rounded-xl px-3 py-2 text-sm outline-none">
            {setores.map((s) => <option key={s} value={s}>{s === "Todos" ? "Todos os setores" : s}</option>)}
          </select>
          <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)} style={sel} className="border rounded-xl px-3 py-2 text-sm outline-none">
            <option value="urgencia">Mais urgentes</option><option value="validade">Validade mais longa</option><option value="nome">Nome (A–Z)</option><option value="setor">Setor</option>
          </select>
        </DashFiltros>
        <TabelaProdutos T={T} itens={lista} onOpenDetail={onOpenDetail} />
      </DashCard>
    </div>
  );
}

function HomeView({ T, items, historico, search, setSearch, filtroSetor, setFiltroSetor, ordenarPor, setOrdenarPor, modoVisual, setModoVisual, onScan, onCadastrar, onOpenDetail, onVerPrioridades, comPalco, nomeUsuario, lojaNumero, notifPermission, onToggleNotif, dark, onTema, atualizacaoPendente, onAtualizacao }) {
  const podeVerValores = useValoresVisiveis();
  const enriched = items.map((it) => ({ ...it, status: getStatus(it) }));
  // Item 2: perecíveis e os demais setores nunca aparecem misturados
  const [categoriaFiltro, setCategoriaFiltro] = useState("todos"); // todos | pereciveis | outros
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [modoEmergencia, setModoEmergencia] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState("todos"); // todos | vencido | alerta | ok
  const [trocaFiltro, setTrocaFiltro] = useState("todas"); // todas | sem_troca | com_troca | nao_informado

  // Modo emergência: o valor em risco e os contadores passam a considerar só o que vence em até 2 dias (ou já venceu).
  const baseNumeros = modoEmergencia ? enriched.filter((i) => i.status.d <= 2) : enriched;
  const valorEmRisco = baseNumeros
    .filter((i) => modoEmergencia || i.status.level === "alert" || i.status.level === "expired")
    .reduce((acc, i) => acc + (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0), 0);

  const vencidos = baseNumeros.filter((i) => i.status.level === "expired").length;
  const emAlerta = modoEmergencia ? baseNumeros.length - vencidos : baseNumeros.filter((i) => i.status.level === "alert").length;
  const total = baseNumeros.length;

  // "PRIORIDADE DE PERDA": resumo pro card do dashboard — a lista completa mora na aba Prioridade Inteligente
  const resumoPrioridade = useMemo(() => {
    const todas = items
      .map((it) => ({ item: it, p: calcularPrioridade(it, historico) }))
      .filter((x) => x.p && (x.p.status.level === "alert" || x.p.status.level === "expired"));
    const semTroca = todas.filter((x) => x.p.semTroca);
    const valorEmRisco = todas.reduce((acc, x) => acc + x.p.valor, 0);
    const porSetor = {};
    todas.forEach((x) => { porSetor[x.item.setor] = (porSetor[x.item.setor] || 0) + 1; });
    const topSetores = Object.entries(porSetor).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return { total: todas.length, semTroca: semTroca.length, valorEmRisco, topSetores };
  }, [items, historico]);

  // Item 18: comparação com troca × sem troca × não informado
  const comparativoTroca = useMemo(() => {
    let comTroca = 0, semTroca = 0, naoInformado = 0, valorSemTroca = 0;
    items.forEach((i) => {
      if (i.politicaTroca === "sem_troca") { semTroca++; valorSemTroca += (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0); }
      else if (i.politicaTroca === "com_troca") comTroca++;
      else naoInformado++;
    });
    return { comTroca, semTroca, naoInformado, valorSemTroca };
  }, [items]);

  const itensNaCategoria = items.filter((i) => categoriaFiltro === "todos" || (categoriaFiltro === "pereciveis" ? ehPerecivel(i.setor) : !ehPerecivel(i.setor)));
  const setoresDisponiveis = ["Todos", ...Array.from(new Set(itensNaCategoria.map((i) => i.setor)))];
  const filtrosAtivos = (categoriaFiltro !== "todos" ? 1 : 0) + (filtroSetor !== "Todos" ? 1 : 0) + (ordenarPor !== "urgencia" ? 1 : 0) + (trocaFiltro !== "todas" ? 1 : 0);
  const politicaDe = (i) => (i.politicaTroca === "sem_troca" || i.politicaTroca === "com_troca" ? i.politicaTroca : "nao_informado");
  const nivelDe = (i) => (i.status.level === "expired" ? "vencido" : i.status.level === "alert" ? "alerta" : "ok");
  const passaBase = (i) => {
    if (categoriaFiltro === "pereciveis" && !ehPerecivel(i.setor)) return false;
    if (categoriaFiltro === "outros" && ehPerecivel(i.setor)) return false;
    if (modoEmergencia && i.status.d > 2) return false;
    if (filtroSetor !== "Todos" && i.setor !== filtroSetor) return false;
    if (trocaFiltro !== "todas" && politicaDe(i) !== trocaFiltro) return false;
    try { return interpretarBusca(search, i); } catch { return true; }
  };
  const baseLista = enriched.filter(passaBase);
  const contagemStatus = { todos: baseLista.length, vencido: baseLista.filter((i) => nivelDe(i) === "vencido").length, alerta: baseLista.filter((i) => nivelDe(i) === "alerta").length, ok: baseLista.filter((i) => nivelDe(i) === "ok").length };
  const limparFiltros = () => { setCategoriaFiltro("todos"); setFiltroSetor("Todos"); setOrdenarPor("urgencia"); setTrocaFiltro("todas"); setStatusFiltro("todos"); };

  let filtrados = baseLista.filter((i) => statusFiltro === "todos" || nivelDe(i) === statusFiltro);

  filtrados = filtrados.sort((a, b) => {
    if (ordenarPor === "urgencia") return a.status.d - b.status.d;
    if (ordenarPor === "nome") return a.nome.localeCompare(b.nome);
    if (ordenarPor === "setor") return a.setor.localeCompare(b.setor);
    if (ordenarPor === "validade") return b.status.d - a.status.d;
    return 0;
  });

  const trocaTotal = comparativoTroca.semTroca + comparativoTroca.comTroca + comparativoTroca.naoInformado;
  const mostrarPrioridade = !modoEmergencia && resumoPrioridade.total > 0;
  const mostrarTroca = !modoEmergencia && trocaTotal > 0;
  const pontoTroca = (cor) => <span style={{ background: cor }} className="h-2 w-2 rounded-full shrink-0" />;

  return (
    <div>
      {comPalco && (
        <PalcoInicio logo={LOGO_SRC} nome={nomeUsuario} loja={lojaNumero} valorNum={valorEmRisco} formatarMoeda={formatarMoeda}
          vencidos={vencidos} alerta={emAlerta} total={total} emergencia={modoEmergencia} onEmergencia={() => setModoEmergencia((v) => !v)} atualizacaoPendente={atualizacaoPendente} onAtualizacao={onAtualizacao}
          notifOk={notifPermission === "granted"} onNotif={onToggleNotif} dark={dark} onTema={onTema} />
      )}
      <div style={{ background: T.bg }} className={`relative z-10 px-4 ${comPalco ? "-mt-7 rounded-t-[32px] pt-6" : "pt-4"}`}>
      {(mostrarPrioridade || mostrarTroca) && (
        <div className={`grid gap-3 mb-5 ${mostrarPrioridade && mostrarTroca ? "grid-cols-2" : "grid-cols-1"}`}>
          {mostrarPrioridade && (
            <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} whileTap={{ scale: 0.97 }} onClick={onVerPrioridades}
              style={{ background: T.card }} className="text-left rounded-[24px] p-4 shadow-lg shadow-black/5 flex flex-col">
              <div className="flex items-center justify-between">
                <span style={{ background: RED_SOFT }} className="h-9 w-9 rounded-2xl flex items-center justify-center"><FireIconSolid className="w-[18px] h-[18px]" style={{ color: RED_DARK }} /></span>
                <ChevronRightIcon className="w-4 h-4" style={{ color: T.subtext }} />
              </div>
              <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wide mt-3">Prioridade de perda</p>
              <p style={{ color: T.text }} className="text-[26px] font-extrabold leading-tight tabular-nums">{resumoPrioridade.total}</p>
              <p style={{ color: T.subtext }} className="text-[11.5px] leading-snug">{resumoPrioridade.semTroca > 0 ? `${resumoPrioridade.semTroca} sem troca` : "precisam de atenção"}</p>
              <div className="flex flex-col gap-1 mt-2.5">
                {resumoPrioridade.topSetores.slice(0, 3).map(([setor, n]) => (
                  <p key={setor} style={{ color: T.text }} className="text-[12px] font-semibold flex items-center justify-between gap-2"><span className="truncate">{setor}</span><span style={{ background: RED_SOFT, color: RED_DARK }} className="text-[10.5px] font-bold rounded-full px-2 py-0.5 tabular-nums shrink-0">{n}</span></p>
                ))}
              </div>
            </motion.button>
          )}
          {mostrarTroca && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
              style={{ background: T.card }} className="rounded-[24px] p-4 shadow-lg shadow-black/5 flex flex-col">
              <span style={{ background: BLUE_SOFT }} className="h-9 w-9 rounded-2xl flex items-center justify-center"><ShieldCheckIcon className="w-[18px] h-[18px]" style={{ color: BLUE }} /></span>
              <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wide mt-3">Troca com fornecedor</p>
              <div className="flex flex-col gap-1.5 mt-1.5">
                <p style={{ color: T.text }} className="text-[13px] font-bold flex items-center gap-2 tabular-nums">{pontoTroca(RED_DARK)}{comparativoTroca.semTroca}<span style={{ color: T.subtext }} className="font-medium text-[11.5px]">sem troca</span></p>
                <p style={{ color: T.text }} className="text-[13px] font-bold flex items-center gap-2 tabular-nums">{pontoTroca("#1F9D55")}{comparativoTroca.comTroca}<span style={{ color: T.subtext }} className="font-medium text-[11.5px]">com troca</span></p>
                <p style={{ color: T.text }} className="text-[13px] font-bold flex items-center gap-2 tabular-nums">{pontoTroca("#9AA3B2")}{comparativoTroca.naoInformado}<span style={{ color: T.subtext }} className="font-medium text-[11.5px]">não informado</span></p>
              </div>
              {comparativoTroca.valorSemTroca > 0 && <p style={{ color: RED_DARK }} className="text-[11px] font-bold mt-2">{formatarMoeda(comparativoTroca.valorSemTroca)} sem troca</p>}
            </motion.div>
          )}
        </div>
      )}

      <section className="min-w-0">
      {/* Busca + filtros: tudo numa faixa só, com contagem ao vivo */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" color={T.subtext} />
          <input value={search} onChange={(e) => setSearch(sanitizarTexto(e.target.value, 80))} placeholder="Buscar produto ou código..." enterKeyHint="search"
            style={{ background: T.card, color: T.text, borderColor: T.inputBorder }} className="w-full rounded-full pl-11 pr-10 py-3 text-sm border outline-none focus:ring-2 shadow-sm" />
          {search && <button onClick={() => setSearch("")} aria-label="Limpar busca" style={{ background: T.chipBg }} className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center"><CloseIcon size={12} color={T.subtext} /></button>}
        </div>
        <motion.button whileTap={{ scale: 0.92 }} onClick={() => setFiltrosAbertos(true)} aria-label="Filtros" style={{ background: filtrosAtivos > 0 ? BLUE_DARK : T.card, color: filtrosAtivos > 0 ? "#fff" : T.text }}
          className="h-[46px] w-[46px] rounded-full flex items-center justify-center shrink-0 relative shadow-sm">
          <SlidersHorizontal size={17} />
          {filtrosAtivos > 0 && <span style={{ background: RED }} className="absolute -top-1 -right-1 text-[9px] text-white font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">{filtrosAtivos}</span>}
        </motion.button>
        <motion.button whileTap={{ scale: 0.92 }} onClick={() => setModoVisual(modoVisual === "lista" ? "grade" : "lista")} aria-label="Trocar lista e grade"
          style={{ background: T.card, color: T.text }} className="h-[46px] w-[46px] rounded-full flex items-center justify-center shrink-0 shadow-sm">
          {modoVisual === "lista" ? <LayoutGrid size={17} /> : <ListIcon size={17} />}
        </motion.button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-3">
        {[["todos", "Todos", T.text], ["vencido", "Vencidos", "#E31E24"], ["alerta", "Em alerta", "#E0921C"], ["ok", "Em dia", "#1F9D55"]].map(([id, rot, cor]) => {
          const ativo = statusFiltro === id;
          return (
            <motion.button key={id} whileTap={{ scale: 0.94 }} onClick={() => setStatusFiltro(id)} aria-pressed={ativo}
              style={ativo ? { background: BLUE_DARK, color: "#fff" } : { background: T.card, color: T.text }} className="shrink-0 rounded-full pl-3 pr-2.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm">
              {id !== "todos" && <span className="h-2 w-2 rounded-full" style={{ background: cor }} />}{rot}
              <span style={ativo ? { background: "rgba(255,255,255,.22)", color: "#fff" } : { background: T.chipBg, color: T.subtext }} className="text-[10.5px] font-bold rounded-full px-1.5 min-w-[20px] text-center tabular-nums">{contagemStatus[id]}</span>
            </motion.button>
          );
        })}
      </div>

      {(categoriaFiltro !== "todos" || filtroSetor !== "Todos" || trocaFiltro !== "todas" || ordenarPor !== "urgencia") && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {categoriaFiltro !== "todos" && <FichaFiltro onRemove={() => setCategoriaFiltro("todos")}>{categoriaFiltro === "pereciveis" ? "Perecíveis" : "Outros setores"}</FichaFiltro>}
          {filtroSetor !== "Todos" && <FichaFiltro onRemove={() => setFiltroSetor("Todos")}>{filtroSetor}</FichaFiltro>}
          {trocaFiltro !== "todas" && <FichaFiltro onRemove={() => setTrocaFiltro("todas")}>{trocaFiltro === "sem_troca" ? "Sem troca" : trocaFiltro === "com_troca" ? "Com troca" : "Troca não informada"}</FichaFiltro>}
          {ordenarPor !== "urgencia" && <FichaFiltro onRemove={() => setOrdenarPor("urgencia")}>Ordem: {{ nome: "nome", setor: "setor", validade: "validade distante" }[ordenarPor]}</FichaFiltro>}
          <button onClick={limparFiltros} style={{ color: T.subtext }} className="text-[11.5px] font-bold underline px-1">Limpar tudo</button>
        </div>
      )}

      {createPortal(<AnimatePresence>
        {filtrosAbertos && (
          <motion.div className="fixed inset-0 z-[60] flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div onClick={() => setFiltrosAbertos(false)} className="absolute inset-0 bg-black/55" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}
              style={{ background: T.card }} className="relative w-full max-w-md rounded-t-[30px] flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] overflow-hidden">
              <div style={{ background: FUNDO_MARCA }} className="relative shrink-0 px-5 pt-3 pb-4 text-white">
                <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
                <div className="relative mx-auto h-1 w-10 rounded-full bg-white/40 mb-3" />
                <div className="relative flex items-center justify-between">
                  <div><h3 className="font-extrabold text-[18px] leading-tight">Filtros</h3><p className="text-[12px] text-white/75">{filtrados.length} produto{filtrados.length !== 1 ? "s" : ""} com a seleção atual</p></div>
                  <button onClick={() => setFiltrosAbertos(false)} aria-label="Fechar" className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,.18)" }}><CloseIcon size={16} color="#fff" /></button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4">
                <GrupoFiltro T={T} titulo="Categoria" opcoes={[["todos", "Todos"], ["pereciveis", "Perecíveis"], ["outros", "Outros setores"]]} valor={categoriaFiltro} onChange={(v) => { setCategoriaFiltro(v); setFiltroSetor("Todos"); }} />
                {setoresDisponiveis.length > 1 && <GrupoFiltro T={T} titulo="Setor" opcoes={setoresDisponiveis.map((x) => [x, x])} valor={filtroSetor} onChange={setFiltroSetor} />}
                <GrupoFiltro T={T} titulo="Política de troca" opcoes={[["todas", "Todas"], ["sem_troca", "Sem troca"], ["com_troca", "Com troca"], ["nao_informado", "Não informada"]]} valor={trocaFiltro} onChange={setTrocaFiltro} />
                <GrupoFiltro T={T} titulo="Ordenar por" opcoes={[["urgencia", "Urgência"], ["nome", "Nome"], ["setor", "Setor"], ["validade", "Validade distante"]]} valor={ordenarPor} onChange={setOrdenarPor} />
              </div>
              <div style={{ borderColor: T.border }} className="shrink-0 flex gap-2 px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t">
                <button onClick={limparFiltros} style={{ background: T.chipBg, color: T.text }} className="flex-1 text-sm font-bold py-3.5 rounded-2xl">Limpar</button>
                <button onClick={() => setFiltrosAbertos(false)} style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)`, color: "#fff" }} className="flex-[2] text-sm font-extrabold py-3.5 rounded-2xl">Ver {filtrados.length} produto{filtrados.length !== 1 ? "s" : ""}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {filtrados.length === 0 ? (
        <EmptyState T={T} hasItems={items.length > 0} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-2.5">
            <p style={{ color: T.text }} className="text-[15px] font-extrabold">Produtos monitorados <span style={{ background: T.chipBg, color: T.subtext }} className="ml-1 text-[11px] font-bold rounded-full px-2 py-0.5 tabular-nums align-middle">{filtrados.length}</span></p>
          </div>
          {modoVisual === "lista" ? (
            <div className="flex flex-col gap-2.5 xl:grid xl:grid-cols-2 2xl:grid-cols-3 xl:items-start">
              {agruparItensPorProduto(filtrados).map((g, i) => (
                <LinhaProduto key={g.unico ? g.item.id : `grupo-${i}`} T={T} idx={i} mostrarSetor podeVerValores={podeVerValores}
                  item={g.unico ? g.item : g.base} lotes={g.unico ? null : g.lotes} totalQuantidade={g.totalQuantidade} piorStatus={g.unico ? g.item.status : g.piorStatus} onOpenDetail={onOpenDetail} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
              {filtrados.map((item, i) => <CartaoGrade key={item.id} T={T} item={item} idx={i} onOpenDetail={onOpenDetail} />)}
            </div>
          )}
        </>
      )}
      </section>
      </div>
    </div>
  );
}

export { DashFiltros, HomeView, NIVEL_BADGE, ProdutosDashboard, TabelaProdutos, diasTexto, interpretarBusca };

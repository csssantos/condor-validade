// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { ClockIcon } from "@heroicons/react/24/outline";
import { RefreshCw, Building2, AlertTriangle, Boxes, TrendingDown, Loader2, FileText, Flame, Clock, Repeat, Package, ShieldCheck } from "lucide-react";
import { FUNDO_MARCA } from "../TelasEntrada";
import { DashBadge, DashBars, DashCard, DashDonut, DashHBars, DashKpi, DashPageHeader, DashTable, DashTabs } from "../componentes/dash";
import { EstadoVazioNovo, FaixaChips } from "../componentes/ui";
import { BLUE, BLUE_DARK, BLUE_SOFT, RED, RED_DARK, RED_SOFT } from "../lib/constantes";
import { supaFetchResumoRede } from "../lib/dados";
import { formatarMoeda, useFormatarMoedaComCamada } from "../lib/formatos";
import { gerarRelatorioGerencialPDF, usarDadosGerenciais } from "../lib/relatoriosPDF";
import { AnelRel } from "./Relatorios";
import { tempoDesde } from "./Setores";
import { iniciaisDe } from "./mais/MaisUI";

// ============ Painel da Rede — versão dashboard (PC) ============
function RedeDashboard({ T, lojas, totais, lojasOrdenadas, ordenarPor, setOrdenarPor, lojasDesatualizadas, onAtualizar }) {
  const PURPLE = "#6D4FC2", PURPLE_DARK = "#4B2E9E";
  const rotulo = (l) => `Loja ${l.lojaNumero}`;
  const palette = ["#6D4FC2", BLUE, "#1F9D55", "#C98A0C", RED, "#0E9AA7", "#8A5CF6", "#E0921C", "#5B6B7F", "#B83280"];
  const porRisco = [...lojas].sort((a, b) => b.valorEmRisco - a.valorEmRisco);
  const maisRisco = porRisco[0];
  const semDados = lojas.length === 0;
  const dataExt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const dataFmt = dataExt.charAt(0).toUpperCase() + dataExt.slice(1);

  return (
    <div className="hidden lg:block">
      <DashPageHeader T={T} title="Painel da Rede" subtitle={`${dataFmt} · ${lojas.length} loja(s) reportando`}
        right={<button onClick={onAtualizar} style={{ background: T.card, borderColor: T.border, color: T.text }} className="text-xs font-semibold px-3.5 py-2 rounded-xl border flex items-center gap-1.5"><RefreshCw size={13} /> Atualizar</button>} />

      <div style={{ background: `linear-gradient(110deg, ${PURPLE_DARK} 0%, ${PURPLE} 70%, #8E73DB 100%)` }} className="rounded-2xl px-7 py-6 mb-5 flex items-center justify-between gap-6 shadow-sm overflow-hidden relative">
        <div className="relative z-10">
          <p className="text-white/70 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"><Building2 size={13} /> Visão consolidada da rede</p>
          <p className="text-white text-3xl font-extrabold mt-2 tabular-nums">{formatarMoeda(totais.valorEmRisco)}</p>
          <p className="text-white/75 text-sm mt-1">em risco nas {lojas.length} lojas{maisRisco && maisRisco.valorEmRisco > 0 ? ` · maior exposição: ${rotulo(maisRisco)}${maisRisco.lojaNome ? ` (${maisRisco.lojaNome})` : ""}` : ""}</p>
        </div>
        <Building2 size={150} className="text-white/10 absolute -right-4 -bottom-8" />
      </div>

      {lojasDesatualizadas.length > 0 && (
        <div style={{ background: "#FEF3E0", color: "#8A5A00" }} className="rounded-xl px-4 py-3 mb-5 text-xs font-medium flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{lojasDesatualizadas.length} loja(s) sem atualização há mais de 6h: {lojasDesatualizadas.map((l) => rotulo(l)).join(", ")}.</span>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <DashKpi T={T} label="Valor em risco" value={formatarMoeda(totais.valorEmRisco)} sub="rede inteira" Icon={Boxes} accent={PURPLE} />
        <DashKpi T={T} label="Perda confirmada no mês" value={formatarMoeda(totais.perdaMes)} sub="baixas por vencimento" Icon={TrendingDown} accent={RED_DARK} />
        <DashKpi T={T} label="Críticos / atenção" value={`${totais.criticos} / ${totais.atencao}`} sub="produtos na rede" Icon={AlertTriangle} accent={RED} />
        <DashKpi T={T} label="Rondas pendentes hoje" value={totais.rondasPendentesHoje} sub={`${lojas.filter((l) => l.rondasPendentesHoje === 0).length} loja(s) em dia`} Icon={ClockIcon} accent="#C98A0C" />
      </div>

      {semDados ? (
        <DashCard T={T} title="Sem lojas reportando"><p style={{ color: T.subtext }} className="text-sm">Quando as lojas sincronizarem, os gráficos aparecem aqui.</p></DashCard>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <DashCard T={T} title="Valor em risco por loja" subtitle="Quanto cada loja tem exposto hoje" className="col-span-2">
              <DashBars T={T} data={porRisco.map((l) => ({ label: rotulo(l).replace("Loja ", "L"), parts: [{ value: Math.round(l.valorEmRisco), color: PURPLE }] }))} />
            </DashCard>
            <DashCard T={T} title="Participação no risco" subtitle="% do valor em risco da rede">
              <div className="flex flex-col items-center gap-4">
                <DashDonut T={T} size={170} thickness={22} centerValue={lojas.length} centerLabel="lojas"
                  segments={porRisco.slice(0, 8).map((l, i) => ({ label: rotulo(l), value: l.valorEmRisco, color: palette[i % palette.length] }))} />
                <div className="w-full grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {porRisco.slice(0, 8).map((l, i) => (
                    <div key={l.lojaNumero} className="flex items-center gap-1.5 text-[11px] min-w-0">
                      <span style={{ background: palette[i % palette.length] }} className="h-2 w-2 rounded-full shrink-0" />
                      <span style={{ color: T.subtext }} className="truncate">{rotulo(l)}</span>
                      <span style={{ color: T.text }} className="ml-auto font-semibold tabular-nums">{totais.valorEmRisco > 0 ? Math.round((l.valorEmRisco / totais.valorEmRisco) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </DashCard>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-5">
            <DashCard T={T} title="Críticos e atenção por loja" subtitle="Produtos vencidos/próximos do vencimento">
              <DashBars T={T} W={420} data={[...lojas].sort((a, b) => (b.criticos + b.atencao) - (a.criticos + a.atencao)).map((l) => ({
                label: rotulo(l).replace("Loja ", "L"), parts: [{ value: l.criticos, color: RED_DARK }, { value: l.atencao, color: "#E0921C" }] }))} />
              <div className="flex gap-4 mt-2 text-[11px]" style={{ color: T.subtext }}>
                <span className="flex items-center gap-1.5"><i style={{ background: RED_DARK }} className="h-2 w-2 rounded-full" /> Críticos</span>
                <span className="flex items-center gap-1.5"><i style={{ background: "#E0921C" }} className="h-2 w-2 rounded-full" /> Atenção</span>
              </div>
            </DashCard>
            <DashCard T={T} title="Perda confirmada no mês" subtitle="Por loja">
              <DashHBars T={T} data={[...lojas].sort((a, b) => b.perdaMes - a.perdaMes).slice(0, 8).map((l) => ({ label: rotulo(l), value: l.perdaMes, color: RED_DARK, right: formatarMoeda(l.perdaMes) }))} />
            </DashCard>
            <DashCard T={T} title="Rondas pendentes hoje" subtitle="Setores ainda sem ronda">
              <DashHBars T={T} data={[...lojas].sort((a, b) => b.rondasPendentesHoje - a.rondasPendentesHoje).slice(0, 8).map((l) => ({ label: rotulo(l), value: l.rondasPendentesHoje, color: l.rondasPendentesHoje > 0 ? "#C98A0C" : "#1F9D55", right: `${l.rondasPendentesHoje}` }))} />
            </DashCard>
          </div>

          <DashCard T={T} title="Ranking de lojas" subtitle="Clique em um cabeçalho de ordenação para reordenar"
            right={<DashTabs T={T} value={ordenarPor} onChange={setOrdenarPor} options={[
              { id: "valorEmRisco", label: "Valor em risco" }, { id: "perdaMes", label: "Perda no mês" }, { id: "rondasPendentesHoje", label: "Rondas pendentes" }]} />}>
            <DashTable T={T} rows={lojasOrdenadas.map((l) => ({ ...l, id: l.lojaNumero }))} cols={[
              { key: "pos", label: "#", width: 48, render: (l) => <span style={{ color: T.subtext }} className="tabular-nums">{lojasOrdenadas.findIndex((x) => x.lojaNumero === l.lojaNumero) + 1}</span> },
              { key: "loja", label: "Loja", render: (l) => <div><p className="font-semibold">Loja {l.lojaNumero}</p>{l.lojaNome && <p style={{ color: T.subtext }} className="text-[11px]">{l.lojaNome}</p>}</div> },
              { key: "valorEmRisco", label: "Valor em risco", align: "right", render: (l) => <span className="font-semibold tabular-nums">{formatarMoeda(l.valorEmRisco)}</span> },
              { key: "perdaMes", label: "Perda no mês", align: "right", render: (l) => <span className="tabular-nums">{formatarMoeda(l.perdaMes)}</span> },
              { key: "criticos", label: "Críticos", align: "right", render: (l) => <DashBadge bg={l.criticos > 0 ? RED_SOFT : T.chipBg} color={l.criticos > 0 ? RED_DARK : T.subtext}>{l.criticos}</DashBadge> },
              { key: "atencao", label: "Atenção", align: "right", render: (l) => <DashBadge bg={l.atencao > 0 ? "#FCF0DD" : T.chipBg} color={l.atencao > 0 ? "#C2760C" : T.subtext}>{l.atencao}</DashBadge> },
              { key: "rondasPendentesHoje", label: "Rondas pend.", align: "right", render: (l) => <DashBadge bg={l.rondasPendentesHoje > 0 ? "#FCF0DD" : "#E4F7EC"} color={l.rondasPendentesHoje > 0 ? "#C2760C" : "#1F9D55"}>{l.rondasPendentesHoje}</DashBadge> },
              { key: "atualizadoEm", label: "Atualizado", align: "right", render: (l) => { const velho = Date.now() - new Date(l.atualizadoEm).getTime() > 6 * 3600000; return <span style={{ color: velho ? "#C98A0C" : T.subtext }} className="text-xs">{l.atualizadoEm ? tempoDesde(l.atualizadoEm) : "—"}</span>; } },
            ]} />
          </DashCard>
        </>
      )}
    </div>
  );
}

function RedeView({ T, showToast }) {
  const [lojas, setLojas] = useState(null); // null = carregando
  const [ordenarPor, setOrdenarPor] = useState("valorEmRisco"); // valorEmRisco | perdaMes | rondasPendentesHoje

  async function carregar() {
    const dados = await supaFetchResumoRede();
    setLojas(dados);
  }
  useEffect(() => { carregar(); }, []);

  const lojasOrdenadas = useMemo(() => {
    if (!lojas) return [];
    return [...lojas].sort((a, b) => (b[ordenarPor] || 0) - (a[ordenarPor] || 0));
  }, [lojas, ordenarPor]);

  const totais = useMemo(() => {
    if (!lojas) return null;
    return lojas.reduce((acc, l) => ({
      valorEmRisco: acc.valorEmRisco + l.valorEmRisco, perdaMes: acc.perdaMes + l.perdaMes,
      criticos: acc.criticos + l.criticos, atencao: acc.atencao + l.atencao,
      rondasPendentesHoje: acc.rondasPendentesHoje + l.rondasPendentesHoje,
    }), { valorEmRisco: 0, perdaMes: 0, criticos: 0, atencao: 0, rondasPendentesHoje: 0 });
  }, [lojas]);

  const lojasDesatualizadas = useMemo(() => (lojas || []).filter((l) => Date.now() - new Date(l.atualizadoEm).getTime() > 6 * 3600000), [lojas]);

  return (
    <>
    {lojas === null ? (
      <div className="hidden lg:block text-center py-24"><Loader2 size={26} className="animate-spin mx-auto" color={T.subtext} /></div>
    ) : (
      <RedeDashboard T={T} lojas={lojas} totais={totais} lojasOrdenadas={lojasOrdenadas} ordenarPor={ordenarPor} setOrdenarPor={setOrdenarPor}
        lojasDesatualizadas={lojasDesatualizadas} onAtualizar={carregar} />
    )}
    <div className="px-4 pt-4 pb-4 lg:hidden">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        style={{ background: `linear-gradient(160deg, #6D4FC2 0%, #4B2E9E 75%)` }} className="rounded-[28px] p-4 shadow-lg shadow-black/5 mb-4">
        <p className="text-white/70 text-[10px] font-bold uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Building2 size={14} /> Painel da Rede · {lojas ? `${lojas.length} loja(s) reportando` : "carregando…"}
        </p>
        {totais && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-2xl px-3 py-3">
              <p className="text-white text-lg font-extrabold leading-none">{formatarMoeda(totais.valorEmRisco)}</p>
              <p className="text-white/70 text-[9.5px] mt-1">Valor em risco (rede)</p>
            </div>
            <div className="bg-white/10 rounded-2xl px-3 py-3">
              <p className="text-white text-lg font-extrabold leading-none">{formatarMoeda(totais.perdaMes)}</p>
              <p className="text-white/70 text-[9.5px] mt-1">Perda confirmada no mês</p>
            </div>
            <div className="bg-white/10 rounded-2xl px-3 py-3">
              <p className="text-white text-lg font-extrabold leading-none">{totais.criticos + totais.atencao}</p>
              <p className="text-white/70 text-[9.5px] mt-1">Produtos críticos/atenção</p>
            </div>
            <div className="bg-white/10 rounded-2xl px-3 py-3">
              <p className="text-white text-lg font-extrabold leading-none">{totais.rondasPendentesHoje}</p>
              <p className="text-white/70 text-[9.5px] mt-1">Rondas pendentes hoje</p>
            </div>
          </div>
        )}
      </motion.div>

      {lojasDesatualizadas.length > 0 && (
        <div style={{ background: "#FEF3E0", color: "#C98A0C" }} className="rounded-2xl px-3.5 py-2.5 mb-4 text-[11px] font-medium flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{lojasDesatualizadas.length} loja(s) sem enviar dados há mais de 6h — pode ser app fechado ou sem internet: {lojasDesatualizadas.map((l) => l.lojaNome || `Loja ${l.lojaNumero}`).join(", ")}.</span>
        </div>
      )}

      <div style={{ background: T.chipBg }} className="flex rounded-2xl p-1 mb-4">
        {[["valorEmRisco", "Valor em risco"], ["perdaMes", "Perda no mês"], ["rondasPendentesHoje", "Rondas pendentes"]].map(([id, label]) => (
          <button key={id} onClick={() => setOrdenarPor(id)} style={ordenarPor === id ? { background: T.card, color: T.text } : { color: T.subtext }}
            className="flex-1 text-[10.5px] font-semibold py-2 rounded-xl transition">
            {label}
          </button>
        ))}
      </div>

      {lojas === null ? (
        <div className="text-center py-14"><Loader2 size={24} className="animate-spin mx-auto" color={T.subtext} /></div>
      ) : lojas.length === 0 ? (
        <div className="text-center py-14 px-6">
          <div style={{ background: "#EDE7FA" }} className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center mb-3"><Building2 className="w-6 h-6" style={{ color: "#6D4FC2" }} /></div>
          <p className="font-semibold text-sm">Nenhuma loja reportando ainda</p>
          <p style={{ color: T.subtext }} className="text-xs mt-1">Assim que as lojas abrirem o app com a tabela "resumo_lojas_rede" configurada, elas aparecem aqui.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {lojasOrdenadas.map((l, i) => (
            <div key={l.lojaNumero} style={{ background: T.card }} className="rounded-2xl p-3.5 shadow-lg shadow-black/5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold">{i + 1}. {l.lojaNome || `Loja ${l.lojaNumero}`}</p>
                <span style={{ color: T.subtext }} className="text-[9.5px]">{tempoDesde(l.atualizadoEm)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p style={{ color: RED_DARK }} className="text-sm font-extrabold">{formatarMoeda(l.valorEmRisco)}</p>
                  <p style={{ color: T.subtext }} className="text-[9px]">Em risco</p>
                </div>
                <div>
                  <p className="text-sm font-extrabold">{formatarMoeda(l.perdaMes)}</p>
                  <p style={{ color: T.subtext }} className="text-[9px]">Perda no mês</p>
                </div>
                <div>
                  <p style={{ color: l.rondasPendentesHoje > 0 ? "#C98A0C" : "#1F9D55" }} className="text-sm font-extrabold">{l.rondasPendentesHoje}</p>
                  <p style={{ color: T.subtext }} className="text-[9px]">Rondas pendentes</p>
                </div>
              </div>
              {l.setoresSemRondaHoje?.length > 0 && (
                <p style={{ color: T.subtext, borderColor: T.border }} className="text-[10px] mt-2 pt-2 border-t">
                  Sem ronda hoje: {l.setoresSemRondaHoje.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}

// ============ Torre de Controle — versão dashboard (PC) ============
function TorreDashboard({ T, criticos, atencao, valorEmRisco, previsaoAmanha, riscoPorSetor, setorMaisPerigoso, riscoPorCorredor, tendenciaPerdas, reincidentes, rankingResponsaveis, ultimasAcoes, onGerarPDF }) {
  const fmt = useFormatarMoedaComCamada();
  const v = tendenciaPerdas.variacao;
  return (
    <div className="hidden lg:block">
      <DashPageHeader T={T} title="Torre de controle" subtitle="Visão gerencial da loja em tempo real"
        right={<button onClick={onGerarPDF} style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DARK})` }} className="text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2"><FileText size={14} /> Relatório completo (PDF)</button>} />
      {setorMaisPerigoso && (
        <div style={{ background: RED_SOFT, color: RED_DARK }} className="rounded-xl px-4 py-3 mb-5 text-sm flex items-center gap-2.5">
          <AlertTriangle size={16} /><span><strong>Setor crítico do dia: {setorMaisPerigoso[0]}.</strong> {fmt(setorMaisPerigoso[1])} em valor exposto — comece por aqui.</span>
        </div>
      )}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <DashKpi T={T} label="Produtos críticos" value={criticos.length} sub="já vencidos" Icon={AlertTriangle} accent={RED_DARK} />
        <DashKpi T={T} label="Em atenção" value={atencao.length} sub="dentro do prazo de alerta" Icon={ClockIcon} accent="#C98A0C" />
        <DashKpi T={T} label="Valor em risco" value={fmt(valorEmRisco)} sub="vencidos + em alerta" Icon={Boxes} accent={RED} />
        <DashKpi T={T} label="Perda no mês" value={fmt(tendenciaPerdas.atual)} sub={v === null ? "sem mês anterior" : `${v > 0 ? "+" : ""}${v}% vs mês anterior`} chip={v === null ? null : `${v > 0 ? "+" : ""}${v}%`} chipBom={v !== null && v <= 0} Icon={TrendingDown} accent={BLUE} />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <DashCard T={T} title="Ações prioritárias por setor" subtitle="Maior valor exposto primeiro">
          {riscoPorSetor.length ? <DashHBars T={T} data={riscoPorSetor.slice(0, 7).map(([s, val]) => ({ label: s, value: val, color: RED, right: fmt(val) }))} /> : <p style={{ color: T.subtext }} className="text-sm py-8 text-center">Nada em risco.</p>}
        </DashCard>
        <DashCard T={T} title="Previsão para amanhã" subtitle="Produtos que entram em alerta">
          <p className="text-4xl font-extrabold tabular-nums" style={{ color: BLUE }}>{previsaoAmanha.qtd}</p>
          <p style={{ color: T.subtext }} className="text-sm mt-1">produto(s) · {fmt(previsaoAmanha.valor)}</p>
          <p style={{ color: T.subtext }} className="text-xs mt-4">Planeje as rondas e promoções antes que eles virem perda.</p>
        </DashCard>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <DashCard T={T} title="Produtos reincidentes" subtitle="3+ perdas nos últimos 60 dias">
          <DashTable T={T} rows={reincidentes.map((r, i) => ({ ...r, id: i }))} empty="Nenhum reincidente." cols={[
            { key: "nome", label: "Produto", render: (r) => <div><p className="font-semibold truncate max-w-[14rem]">{r.nome}</p><p style={{ color: T.subtext }} className="text-[11px]">{r.setor}</p></div> },
            { key: "n", label: "Perdas", align: "right", render: (r) => <DashBadge bg={RED_SOFT} color={RED_DARK}>{r.datas.length}x</DashBadge> }]} />
        </DashCard>
        <DashCard T={T} title="Quem registra baixas" subtitle="Ranking de responsáveis">
          {rankingResponsaveis.length ? <DashHBars T={T} data={rankingResponsaveis.map(([n, c]) => ({ label: n, value: c, color: BLUE, right: `${c}` }))} /> : <p style={{ color: T.subtext }} className="text-sm py-8 text-center">Sem registros.</p>}
        </DashCard>
        <DashCard T={T} title="Últimas ações" subtitle="Auditoria recente">
          <div className="flex flex-col gap-3">
            {ultimasAcoes.length === 0 && <p style={{ color: T.subtext }} className="text-sm py-8 text-center">Sem ações.</p>}
            {ultimasAcoes.map((a, i) => (
              <div key={a.id ?? i} className="flex items-start gap-2.5 text-xs">
                <span style={{ background: BLUE_SOFT, color: BLUE }} className="h-7 w-7 rounded-full flex items-center justify-center font-bold shrink-0">{(a.usuario || "?").slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0"><p><b>{a.usuario}</b> {a.acao}</p><p style={{ color: T.subtext }} className="text-[10.5px]">{tempoDesde(a.criadoEm)}</p></div>
              </div>))}
          </div>
        </DashCard>
      </div>
    </div>
  );
}

// ============ Torre de controle (celular) — refeita do zero: painel de comando ============
function TorreMobile({ T, itensTotal, criticos, atencao, valorEmRisco, previsaoAmanha, riscoPorSetor, setorMaisPerigoso, tendenciaPerdas, reincidentes, rankingResponsaveis, ultimasAcoes, onGerarPDF }) {
  const situacao = criticos.length > 0
    ? { rot: "Situação crítica", sub: `${criticos.length} produto(s) vencido(s) pedem retirada agora`, cor: "#FF6B6F" }
    : atencao.length > 0 ? { rot: "Atenção", sub: `${atencao.length} produto(s) perto de vencer`, cor: "#FFC24B" }
    : { rot: "Tudo sob controle", sub: "Nenhum produto em risco no momento", cor: "#34C77B" };
  const maxSetor = Math.max(...riscoPorSetor.map(([, v]) => v), 1);
  const perdaMax = Math.max(tendenciaPerdas.atual, tendenciaPerdas.anterior || 0, 1);
  const alertas = [
    setorMaisPerigoso && { cor: RED_DARK, bg: RED_SOFT, Icone: Flame, t: "Comece por aqui", d: `${setorMaisPerigoso[0]} concentra ${formatarMoeda(setorMaisPerigoso[1])} em valor exposto.` },
    previsaoAmanha.qtd > 0 && { cor: BLUE_DARK, bg: BLUE_SOFT, Icone: Clock, t: "Amanhã", d: `${previsaoAmanha.qtd} produto(s) entram em alerta${previsaoAmanha.valor > 0 ? ` (${formatarMoeda(previsaoAmanha.valor)})` : ""}.` },
    reincidentes.length > 0 && { cor: "#8A5A00", bg: "#FCF0DD", Icone: Repeat, t: "Repetidos", d: `${reincidentes.length} produto(s) voltam a vencer nos últimos 60 dias.` },
  ].filter(Boolean);
  const cap = (titulo, sub, children, i) => (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.05 }} className="mb-5">
      <div className="px-1 mb-2"><h3 style={{ color: T.text }} className="text-[15px] font-extrabold leading-tight">{titulo}</h3>{sub && <p style={{ color: T.subtext }} className="text-[11.5px]">{sub}</p>}</div>
      {children}
    </motion.section>
  );
  return (
    <div className="px-4 pt-4 pb-8 lg:hidden">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ background: FUNDO_MARCA, isolation: "isolate", WebkitMaskImage: "-webkit-radial-gradient(white, black)", transform: "translateZ(0)" }}
        className="relative overflow-hidden rounded-[32px] text-white p-5 shadow-xl shadow-black/15 mb-5">
        <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: situacao.cor }} /><span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: situacao.cor }} /></span>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/75">Torre de controle · ao vivo</p>
          </div>
          <h2 className="text-[26px] font-extrabold leading-tight mt-2">{situacao.rot}</h2>
          <p className="text-[12.5px] text-white/80 mt-0.5">{situacao.sub}</p>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[["Em risco", formatarMoeda(valorEmRisco), true], ["Vencidos", criticos.length], ["Em atenção", atencao.length]].map(([r, v, grande]) => (
              <div key={r} className="rounded-2xl py-2.5 px-2 text-center min-w-0" style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.2)" }}>
                <p className="font-extrabold leading-none tabular-nums truncate" style={{ fontSize: grande ? 15 : 22 }}>{v}</p>
                <p className="text-[10.5px] font-semibold text-white/80 mt-1.5">{r}</p>
              </div>
            ))}
          </div>
          <motion.button whileTap={{ scale: 0.97 }} onClick={onGerarPDF} className="mt-3.5 w-full bg-white rounded-2xl py-3 text-[13px] font-extrabold flex items-center justify-center gap-2" style={{ color: BLUE_DARK }}>
            <FileText size={16} /> Relatório completo para a gerência (PDF)
          </motion.button>
        </div>
      </motion.section>

      {alertas.length > 0 && cap("O que pede sua atenção", "Deslize para ver todos", (
        <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 pb-1">
          {alertas.map((a) => (
            <div key={a.t} style={{ background: a.bg }} className="snap-start shrink-0 w-[78%] rounded-[24px] p-4">
              <span className="h-9 w-9 rounded-2xl flex items-center justify-center bg-white/70"><a.Icone size={18} color={a.cor} /></span>
              <p style={{ color: a.cor }} className="text-[14px] font-extrabold mt-2.5">{a.t}</p>
              <p style={{ color: a.cor }} className="text-[12.5px] leading-snug mt-0.5 opacity-90">{a.d}</p>
            </div>
          ))}
        </div>
      ), 0)}

      {riscoPorSetor.length > 0 && cap("Mapa de risco por setor", "Quanto maior o bloco, mais dinheiro exposto", (
        <div className="grid grid-cols-2 gap-2.5">
          {riscoPorSetor.slice(0, 6).map(([setor, valor], i) => {
            const f = valor / maxSetor;
            const cor = f > 0.66 ? ["#E5484D", "#B42318"] : f > 0.33 ? ["#F5A524", "#C2670C"] : ["#3B82F6", "#1D4ED8"];
            return (
              <div key={setor} className={`relative overflow-hidden rounded-[22px] text-white p-3.5 ${i === 0 ? "col-span-2" : ""}`} style={{ background: `linear-gradient(145deg, ${cor[0]}, ${cor[1]})`, minHeight: i === 0 ? 92 : 78 }}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/80 truncate">#{i + 1} · {setor}</p>
                <p className={`font-extrabold tabular-nums leading-tight mt-1 ${i === 0 ? "text-[24px]" : "text-[17px]"}`}>{formatarMoeda(valor)}</p>
                <div className="h-1.5 rounded-full mt-2 bg-white/25 overflow-hidden"><div className="h-full rounded-full bg-white" style={{ width: `${Math.max(6, f * 100)}%` }} /></div>
              </div>
            );
          })}
        </div>
      ), 1)}

      {cap("Perdas confirmadas", "Este mês contra o anterior", (
        <div style={{ background: T.card }} className="rounded-[26px] shadow-lg shadow-black/5 p-4">
          <div className="flex items-end gap-5">
            <div className="flex-1">
              <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">Este mês</p>
              <p style={{ color: T.text }} className="text-[26px] font-extrabold leading-tight tabular-nums">{formatarMoeda(tendenciaPerdas.atual)}</p>
              {tendenciaPerdas.variacao !== null && <p style={{ color: tendenciaPerdas.variacao <= 0 ? "#1F9D55" : RED_DARK }} className="text-[12px] font-bold mt-1">{tendenciaPerdas.variacao > 0 ? "▲ +" : "▼ "}{tendenciaPerdas.variacao}% vs anterior</p>}
            </div>
            <div className="flex items-end gap-3 h-20">
              {[["Ant.", tendenciaPerdas.anterior || 0, T.chipBg], ["Atual", tendenciaPerdas.atual, RED]].map(([r, v, c]) => (
                <div key={r} className="flex flex-col items-center justify-end h-full gap-1"><div className="w-8 rounded-lg" style={{ background: c, height: `${Math.max(6, (v / perdaMax) * 100)}%` }} /><span style={{ color: T.subtext }} className="text-[10px] font-semibold">{r}</span></div>
              ))}
            </div>
          </div>
        </div>
      ), 2)}

      {reincidentes.length > 0 && cap("Produtos que repetem", "Venceram mais de uma vez em 60 dias", (
        <div className="flex flex-wrap gap-2">
          {reincidentes.map((pr) => (
            <span key={pr.nome + pr.setor} style={{ background: T.card, color: T.text }} className="rounded-full pl-3.5 pr-1.5 py-1.5 text-[12px] font-bold shadow-sm flex items-center gap-2 max-w-full">
              <span className="truncate">{pr.nome}</span><span style={{ background: RED_SOFT, color: RED_DARK }} className="text-[11px] font-extrabold rounded-full px-2 py-0.5 shrink-0">{pr.datas.length}x</span>
            </span>
          ))}
        </div>
      ), 3)}

      {rankingResponsaveis.length > 0 && cap("Quem mais registra", "Ações por pessoa", (
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4">
          {rankingResponsaveis.slice(0, 8).map(([nome, qtd], k) => (
            <div key={nome} style={{ background: T.card }} className="shrink-0 w-[104px] rounded-[22px] shadow-md shadow-black/5 p-3 text-center">
              <span style={{ background: k === 0 ? `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})` : T.chipBg, color: k === 0 ? "#fff" : T.text }} className="h-11 w-11 rounded-full mx-auto flex items-center justify-center text-[14px] font-extrabold">{iniciaisDe(nome)}</span>
              <p style={{ color: T.text }} className="text-[12px] font-bold mt-2 truncate">{String(nome).split(" ")[0]}</p>
              <p style={{ color: T.subtext }} className="text-[11px] font-semibold tabular-nums">{qtd} ação(ões)</p>
            </div>
          ))}
        </div>
      ), 4)}

      {ultimasAcoes.length > 0 && cap("Linha do tempo", "Últimas ações registradas", (
        <div style={{ background: T.card }} className="rounded-[26px] shadow-lg shadow-black/5 p-4">
          <div className="relative pl-5">
            <span aria-hidden className="absolute left-[5px] top-1 bottom-1 w-0.5 rounded-full" style={{ background: T.chipBg }} />
            {ultimasAcoes.map((a, k) => (
              <div key={a.id || k} className="relative pb-3.5 last:pb-0">
                <span className="absolute -left-5 top-1 h-3 w-3 rounded-full border-2" style={{ background: T.card, borderColor: k === 0 ? RED : BLUE }} />
                <p style={{ color: T.text }} className="text-[12.5px] leading-snug"><strong>{a.usuario || "Alguém"}</strong> {a.acao}</p>
                {a.detalhe && <p style={{ color: T.subtext }} className="text-[11.5px] leading-snug">{a.detalhe}</p>}
              </div>
            ))}
          </div>
        </div>
      ), 5)}
    </div>
  );
}

// ============ Prioridade de perda (celular) — refeita do zero: fila de ação ============
function LinhaPrioridade({ T, item, p, pos, podeVerValores, onOpenDetail, aberta, onToggle }) {
  const cor = p.nivel === "urgente" ? "#D92D33" : p.nivel === "alto" ? "#C2760C" : "#2F6FD6";
  const soft = p.nivel === "urgente" ? RED_SOFT : p.nivel === "alto" ? "#FCF0DD" : BLUE_SOFT;
  const quando = p.status.level === "expired" ? `vencido há ${Math.abs(p.dias)}d` : p.dias === 0 ? "vence hoje" : `vence em ${p.dias}d`;
  return (
    <div style={{ background: T.card }} className="rounded-[22px] shadow-md shadow-black/5 overflow-hidden">
      <button onClick={onToggle} aria-expanded={aberta} className="w-full flex items-center gap-3 p-3 text-left">
        {item.foto ? <img src={item.foto} alt="" className="h-12 w-12 rounded-2xl object-cover shrink-0" /> : <span style={{ background: soft }} className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"><Package size={20} color={cor} /></span>}
        <span className="min-w-0 flex-1">
          <span style={{ color: T.text }} className="block text-[13.5px] font-extrabold leading-tight line-clamp-2">{item.nome}</span>
          <span style={{ color: T.subtext }} className="block text-[11.5px] mt-0.5 truncate">{item.setor} · {quando}</span>
        </span>
        <span style={{ background: soft, color: cor }} className="h-11 w-11 rounded-full flex flex-col items-center justify-center shrink-0"><span className="text-[14px] font-extrabold leading-none tabular-nums">{p.score}</span><span className="text-[8px] font-bold uppercase">risco</span></span>
      </button>
      {aberta && (
        <div className="px-3 pb-3 -mt-1">
          <div className="grid grid-cols-3 gap-2">
            {[["Quantidade", `${item.quantidade || 1} un`], ["Valor", podeVerValores && p.valor > 0 ? formatarMoeda(p.valor) : "—"], ["Troca", p.semTroca ? "Sem troca" : p.comTroca ? "Com troca" : "Não definida"]].map(([r, v]) => (
              <div key={r} style={{ background: T.chipBg }} className="rounded-xl px-2 py-2 text-center min-w-0"><p style={{ color: T.subtext }} className="text-[9.5px] font-bold uppercase">{r}</p><p style={{ color: T.text }} className="text-[12px] font-extrabold truncate">{v}</p></div>
            ))}
          </div>
          <div style={{ background: soft }} className="rounded-2xl px-3 py-2.5 mt-2"><p style={{ color: cor }} className="text-[10px] font-extrabold uppercase tracking-wide">O que fazer</p><p style={{ color: T.text }} className="text-[12.5px] font-semibold leading-snug">{p.acao}</p></div>
          {p.reincidencias >= 2 && <p style={{ color: T.subtext }} className="text-[11.5px] mt-2 flex items-center gap-1.5"><Repeat size={12} /> Já foi baixado {p.reincidencias}x nos últimos 60 dias</p>}
          <button onClick={() => onOpenDetail(item)} style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)` }} className="w-full mt-2.5 rounded-xl py-2.5 text-[12.5px] font-extrabold text-white">Abrir produto</button>
        </div>
      )}
    </div>
  );
}

function PrioridadeMobile({ T, prioridades, valorEmRisco, urgenteCount, semTrocaCount, podeVerValores, onOpenDetail }) {
  const [filtro, setFiltro] = useState("todos");
  const [aberto, setAberto] = useState(null);
  const altoCount = prioridades.filter((x) => x.p.nivel === "alto").length;
  const reinCount = prioridades.filter((x) => x.p.reincidencias >= 2).length;
  const lista = prioridades.filter((x) => filtro === "sem_troca" ? x.p.semTroca : filtro === "reinc" ? x.p.reincidencias >= 2 : true);
  const topo = lista[0];
  const grupos = [["urgente", "Urgente", "Aja hoje", "#D92D33"], ["alto", "Alto risco", "Esta semana", "#C2760C"], ["atencao", "Atenção", "Acompanhe", "#2F6FD6"]]
    .map(([id, rot, sub, cor]) => ({ id, rot, sub, cor, itens: lista.filter((x, i) => !(topo && i === 0) && (id === "atencao" ? x.p.nivel !== "urgente" && x.p.nivel !== "alto" : x.p.nivel === id)) }))
    .filter((g) => g.itens.length > 0);
  return (
    <div className="px-4 pt-4 pb-8 lg:hidden">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ background: FUNDO_MARCA, isolation: "isolate", WebkitMaskImage: "-webkit-radial-gradient(white, black)", transform: "translateZ(0)" }}
        className="relative overflow-hidden rounded-[32px] text-white p-5 shadow-xl shadow-black/15 mb-4">
        <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/70">Prioridade de perda</p>
          <p className="font-extrabold leading-tight tabular-nums mt-1" style={{ fontSize: 32 }}>{podeVerValores ? formatarMoeda(valorEmRisco) : "•••"}</p>
          <p className="text-[12.5px] text-white/80">em {prioridades.length} produto(s) que podem virar perda</p>
          <div className="flex h-2.5 rounded-full overflow-hidden mt-3.5" style={{ background: "rgba(255,255,255,.2)" }}>
            <div style={{ width: `${(urgenteCount / Math.max(1, prioridades.length)) * 100}%`, background: "#FF6B6F" }} /><div style={{ width: `${(altoCount / Math.max(1, prioridades.length)) * 100}%`, background: "#FFC24B" }} /><div style={{ flex: 1, background: "#6CB4FF" }} />
          </div>
          <div className="flex gap-4 mt-2.5 text-[11.5px] font-semibold text-white/85">
            {[["Urgentes", urgenteCount, "#FF6B6F"], ["Alto", altoCount, "#FFC24B"], ["Atenção", Math.max(0, prioridades.length - urgenteCount - altoCount), "#6CB4FF"]].map(([r, v, c]) => <span key={r} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{v} {r}</span>)}
          </div>
        </div>
      </motion.section>

      {prioridades.length === 0 ? (
        <EstadoVazioNovo T={T} Icone={ShieldCheck} titulo="Nenhum produto em risco agora" texto="Quando algo entrar em alerta ou vencer, a fila aparece aqui." />
      ) : (
        <>
          <FaixaChips T={T} valor={filtro} onChange={setFiltro} opcoes={[["todos", "Todos", prioridades.length], ["sem_troca", "Sem troca", semTrocaCount], ["reinc", "Repetem", reinCount]]} />
          {topo && (
            <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.985 }} onClick={() => onOpenDetail(topo.item)} style={{ background: T.card }} className="w-full text-left rounded-[28px] shadow-xl shadow-black/10 overflow-hidden mb-5">
              <div className="relative">
                {topo.item.foto ? <img src={topo.item.foto} alt="" className="w-full h-40 object-cover" /> : <div style={{ background: FUNDO_MARCA }} className="w-full h-24" />}
                <span style={{ background: "#D92D33" }} className="absolute top-3 left-3 text-[10.5px] font-extrabold text-white rounded-full px-3 py-1.5 uppercase tracking-wide">Faça isto primeiro</span>
              </div>
              <div className="p-4 flex items-center gap-3.5" style={{ color: T.text }}>
                <AnelRel partes={[{ v: topo.p.score, cor: topo.p.nivel === "urgente" ? "#D92D33" : "#C2760C" }, { v: 100 - topo.p.score, cor: "transparent" }]} tamanho={70} espessura={8} fundo={T.chipBg} centro={topo.p.score} sub="risco" />
                <div className="min-w-0 flex-1" style={{ color: T.text }}>
                  <p className="text-[15px] font-extrabold leading-tight line-clamp-2">{topo.item.nome}</p>
                  <p style={{ color: T.subtext }} className="text-[12px] mt-0.5">{topo.item.setor} · {topo.item.quantidade || 1} un{podeVerValores && topo.p.valor > 0 ? ` · ${formatarMoeda(topo.p.valor)}` : ""}</p>
                  <p style={{ color: "#D92D33" }} className="text-[12px] font-bold mt-1 leading-snug">{topo.p.acao}</p>
                </div>
              </div>
            </motion.button>
          )}
          {lista.length === 0 && <p style={{ color: T.subtext }} className="text-sm text-center py-8">Nenhum produto nesse filtro.</p>}
          {grupos.map((g) => (
            <section key={g.id} className="mb-5">
              <div className="flex items-center gap-2.5 mb-2 px-1">
                <span className="h-5 w-1.5 rounded-full" style={{ background: g.cor }} />
                <h3 style={{ color: T.text }} className="text-[14.5px] font-extrabold">{g.rot}</h3>
                <span style={{ color: T.subtext }} className="text-[11.5px] font-semibold">{g.sub}</span>
                <span style={{ background: T.chipBg, color: T.subtext }} className="ml-auto text-[11px] font-extrabold rounded-full px-2.5 py-0.5 tabular-nums">{g.itens.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {g.itens.map(({ item, p }) => <LinhaPrioridade key={item.id} T={T} item={item} p={p} podeVerValores={podeVerValores} onOpenDetail={onOpenDetail} aberta={aberto === item.id} onToggle={() => setAberto(aberto === item.id ? null : item.id)} />)}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function TorreControleView({ T, items, historico, auditoria, usuario, showToast, rondas, lojaNumero }) {
  const {
    criticos, atencao, valorEmRisco, previsaoAmanha, riscoPorSetor, setorMaisPerigoso,
    riscoPorCorredor, tendenciaPerdas, reincidentes, rankingResponsaveis,
  } = usarDadosGerenciais(items, historico);

  // Item 37 (continuação): últimas ações de auditoria, direto na Torre — mais informação pra gerência
  const ultimasAcoes = useMemo(() => (auditoria || []).slice(0, 6), [auditoria]);

  const gerarRelatorioCompleto = () => gerarRelatorioGerencialPDF({
    items, historico, usuario, showToast, criticos, atencao, valorEmRisco, tendenciaPerdas, riscoPorSetor, riscoPorCorredor, reincidentes, rankingResponsaveis, rondas, lojaNumero,
  });

  return (
    <>
    <TorreDashboard T={T} criticos={criticos} atencao={atencao} valorEmRisco={valorEmRisco} previsaoAmanha={previsaoAmanha} riscoPorSetor={riscoPorSetor}
      setorMaisPerigoso={setorMaisPerigoso} riscoPorCorredor={riscoPorCorredor} tendenciaPerdas={tendenciaPerdas} reincidentes={reincidentes}
      rankingResponsaveis={rankingResponsaveis} ultimasAcoes={ultimasAcoes} onGerarPDF={gerarRelatorioCompleto} />
    <TorreMobile T={T} criticos={criticos} atencao={atencao} valorEmRisco={valorEmRisco} previsaoAmanha={previsaoAmanha} riscoPorSetor={riscoPorSetor} setorMaisPerigoso={setorMaisPerigoso}
      tendenciaPerdas={tendenciaPerdas} reincidentes={reincidentes} rankingResponsaveis={rankingResponsaveis} ultimasAcoes={ultimasAcoes} onGerarPDF={gerarRelatorioCompleto} />
    </>
  );
}

export { LinhaPrioridade, PrioridadeMobile, RedeDashboard, RedeView, TorreControleView, TorreDashboard, TorreMobile };

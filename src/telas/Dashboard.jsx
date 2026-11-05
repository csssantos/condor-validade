// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useMemo } from "react";
import { COR } from "../pdfMarca.js";
import { DollarSign, AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { Thumb } from "../componentes/ItemCards";
import { DashArea, DashBars, DashCard, DashDonut, DashKpi, DashSpark } from "../componentes/dash";
import { BLUE, BLUE_DARK, BLUE_SOFT, RED, RED_DARK, RED_SOFT } from "../lib/constantes";
import { chaveDia, formatarData, formatarDataHoraExtenso, getStatus, saudacaoDoDia, statusStyles, useFormatarMoedaComCamada } from "../lib/formatos";
import { textoLote } from "../lib/produto";
import { isSameDay, tempoDesde } from "./Setores";

function DashboardView({ T, items, historico, rondas, auditoria, nome, lojaNumero, onOpenDetail, onTab, onFlow }) {
  const fmt = useFormatarMoedaComCamada();
  const d = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ddmm = (dt) => `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const lista = (items || []).filter((i) => i && i.validade).map((i) => ({
      ...i, status: getStatus(i), valor: (Number(i.quantidade) || 1) * (Number(i.precoUnitario) || 0),
    })).filter((i) => Number.isFinite(i.status.d));
    const nivel = (lv) => lista.filter((i) => i.status.level === lv);
    const soma = (arr) => arr.reduce((a, i) => a + i.valor, 0);
    const venc = nivel("expired"), alerta = nivel("alert"), atencao = nivel("warning"), ok = nivel("ok");

    // Vencimentos: coluna 0 = já vencidos, 1 = hoje, 2.. = próximos dias
    const dias = Array.from({ length: 15 }, (_, k) => {
      const dt = new Date(hoje); dt.setDate(dt.getDate() + (k - 1));
      return { label: k === 0 ? "Venc." : k === 1 ? "Hoje" : ddmm(dt), expired: 0, alert: 0, warning: 0, ok: 0, valor: 0 };
    });
    lista.forEach((i) => {
      const idx = i.status.d < 0 ? 0 : i.status.d + 1;
      if (idx > 14) return;
      dias[idx][i.status.level] += 1;
      dias[idx].valor += i.valor;
    });

    // Perdas (baixas de produto que já estava vencido) nos últimos 30 dias x 30 dias anteriores
    const serie = Array.from({ length: 30 }, (_, k) => {
      const dt = new Date(hoje); dt.setDate(dt.getDate() - (29 - k));
      return { dt, label: ddmm(dt), value: 0 };
    });
    const indice = {};
    serie.forEach((s, k) => { indice[chaveDia(s.dt)] = k; });
    const ini30 = serie[0].dt.getTime(), ini60 = ini30 - 30 * 86400000;
    let perda30 = 0, perdaPrev = 0, baixas30 = 0;
    const motivos = {};
    (historico || []).forEach((h) => {
      if (!h.dataBaixa) return;
      const t = new Date(h.dataBaixa).getTime();
      if (!Number.isFinite(t)) return;
      if (t >= ini30) { baixas30 += 1; const m = h.motivo || "Sem motivo"; motivos[m] = (motivos[m] || 0) + 1; }
      if (!h.vencidoAntes) return;
      const v = (Number(h.quantidade) || 1) * (Number(h.precoUnitario) || 0);
      const key = chaveDia(h.dataBaixa);
      if (key in indice) { serie[indice[key]].value += v; perda30 += v; }
      else if (t >= ini60 && t < ini30) perdaPrev += v;
    });
    const motivosLista = Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const porSetor = {};
    lista.forEach((i) => {
      const s = i.setor || "Sem setor";
      if (!porSetor[s]) porSetor[s] = { setor: s, total: 0, risco: 0, valor: 0 };
      porSetor[s].total += 1;
      if (i.status.level === "alert" || i.status.level === "expired") { porSetor[s].risco += 1; porSetor[s].valor += i.valor; }
    });
    const setores = Object.values(porSetor).sort((a, b) => b.risco - a.risco || b.total - a.total);

    const agoraISO = new Date().toISOString();
    const rondasSetor = setores.map((s) => {
      const doSetor = (rondas || []).filter((r) => r.setor === s.setor);
      const deHoje = doSetor.filter((r) => isSameDay(r.finalizadoEm || r.iniciadoEm, agoraISO));
      const concluida = deHoje.find((r) => r.status === "concluida");
      const parcial = deHoje.find((r) => r.status === "parcial" || r.status === "em_andamento");
      const ultima = doSetor.map((r) => r.finalizadoEm).filter(Boolean).sort().pop() || null;
      return { ...s, estado: concluida ? "ok" : parcial ? "parcial" : "pendente", ultima };
    });

    const troca = { com: 0, sem: 0, nao: 0, valorSem: 0 };
    lista.forEach((i) => {
      if (i.politicaTroca === "sem_troca") { troca.sem += 1; troca.valorSem += i.valor; }
      else if (i.politicaTroca === "com_troca") troca.com += 1;
      else troca.nao += 1;
    });

    return {
      lista, venc, alerta, atencao, ok, dias, serie, perda30, perdaPrev, baixas30, motivosLista, setores, rondasSetor, troca,
      valorVenc: soma(venc), valorAlerta: soma(alerta),
      criticos: lista.filter((i) => i.status.level !== "ok").sort((a, b) => a.status.d - b.status.d).slice(0, 8),
      feed: [...(auditoria || [])].sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm)).slice(0, 8),
    };
  }, [items, historico, rondas, auditoria]);

  const nomeCurto = (nome || "").trim().split(/\s+/)[0] || "";
  const dataBruta = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const dataHoje = dataBruta.charAt(0).toUpperCase() + dataBruta.slice(1);
  const valorRisco = d.valorVenc + d.valorAlerta;
  const emRisco = d.venc.length + d.alerta.length;
  const deltaPerda = d.perdaPrev > 0 ? ((d.perda30 - d.perdaPrev) / d.perdaPrev) * 100 : null;
  const total = d.lista.length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const COR = { expired: RED_DARK, alert: RED, warning: "#C98A0C", ok: "#1F9D55" };
  const maxSetor = Math.max(...d.setores.map((s) => s.total), 1);
  const maxMotivo = Math.max(...d.motivosLista.map((m) => m[1]), 1);
  const rondasOk = d.rondasSetor.filter((s) => s.estado === "ok").length;

  return (
    <div className="flex flex-col gap-5 pt-6">
      {/* Banner de boas-vindas */}
      <div style={{ background: `linear-gradient(120deg, ${BLUE_DARK} 0%, ${BLUE} 65%, #2F6FC0 100%)` }} className="relative overflow-hidden rounded-2xl px-8 py-7 text-white">
        <svg className="absolute right-0 top-0 h-full w-[46%] pointer-events-none" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <polygon points="400,0 400,200 190,200" fill="#fff" opacity="0.07" />
          <polygon points="400,0 400,120 260,0" fill="#fff" opacity="0.1" />
          <polygon points="330,200 400,90 400,200" fill={RED} opacity="0.85" />
          <circle cx="250" cy="48" r="26" fill="#fff" opacity="0.08" />
        </svg>
        <div className="relative max-w-2xl">
          <p className="text-white/70 text-xs font-semibold">{dataHoje}{lojaNumero ? ` · Loja ${lojaNumero}` : ""}</p>
          <h2 className="text-[26px] font-extrabold leading-tight mt-1">{saudacaoDoDia()}{nomeCurto ? `, ${nomeCurto}` : ""}! 👋</h2>
          <p className="text-white/85 text-sm mt-2 leading-relaxed">
            {total === 0
              ? "Ainda não há produtos monitorados nesta loja."
              : <>Hoje a loja tem <strong>{d.venc.length}</strong> produto(s) vencido(s) e <strong>{d.alerta.length}</strong> em alerta, somando <strong>{fmt(valorRisco)}</strong> em risco.</>}
          </p>
          <div className="flex gap-2.5 mt-5">
            <button onClick={() => onFlow("prioridade")} style={{ background: "#fff", color: BLUE_DARK }} className="px-4 py-2 rounded-xl text-xs font-bold hover:opacity-90 transition">Ver prioridades de perda</button>
            <button onClick={() => onTab("produtos")} style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }} className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/25 transition">Produtos monitorados</button>
          </div>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        <DashKpi T={T} label="Valor em risco" value={fmt(valorRisco)} sub={`${emRisco} produto(s) vencidos ou em alerta`} Icon={DollarSign} accent={RED}>
          <DashSpark data={d.dias.map((x) => x.valor)} color={RED} gid="sp-risco" />
        </DashKpi>
        <DashKpi T={T} label="Vencidos" value={d.venc.length} sub={`${fmt(d.valorVenc)} em produtos vencidos`} chip={`${pct(d.venc.length)}%`} Icon={AlertTriangle} accent={RED_DARK}>
          <div style={{ background: T.chipBg }} className="h-1.5 rounded-full overflow-hidden"><div style={{ width: `${pct(d.venc.length)}%`, background: RED_DARK }} className="h-full rounded-full" /></div>
        </DashKpi>
        <DashKpi T={T} label="Em alerta" value={d.alerta.length} sub={`${d.atencao.length} em atenção · ${d.ok.length} no prazo`} chip={`${pct(d.alerta.length)}%`} Icon={Clock} accent="#C98A0C">
          <div style={{ background: T.chipBg }} className="h-1.5 rounded-full overflow-hidden"><div style={{ width: `${pct(d.alerta.length)}%`, background: "#C98A0C" }} className="h-full rounded-full" /></div>
        </DashKpi>
        <DashKpi T={T} label="Perdas em 30 dias" value={fmt(d.perda30)} sub={`${d.baixas30} baixa(s) registrada(s)`}
          chip={deltaPerda === null ? null : `${deltaPerda > 0 ? "+" : ""}${Math.round(deltaPerda)}%`} chipBom={deltaPerda !== null && deltaPerda <= 0} Icon={TrendingDown} accent={BLUE}>
          <DashSpark data={d.serie.map((x) => x.value)} color={BLUE} gid="sp-perda" />
        </DashKpi>
      </div>

      {/* Vencimentos + status */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <DashCard T={T} className="xl:col-span-2" title="Vencimentos nos próximos 14 dias" subtitle="Quantidade de produtos por data de vencimento"
          right={
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
              {[["Vencido", COR.expired], ["Em alerta", COR.alert], ["Atenção", COR.warning], ["No prazo", COR.ok]].map(([l, c]) => (
                <span key={l} style={{ color: T.subtext }} className="flex items-center gap-1.5 text-[10px] font-semibold"><i style={{ background: c }} className="h-2 w-2 rounded-full inline-block" />{l}</span>
              ))}
            </div>
          }>
          <DashBars T={T} data={d.dias.map((x) => ({ label: x.label, parts: [
            { value: x.expired, color: COR.expired }, { value: x.alert, color: COR.alert }, { value: x.warning, color: COR.warning }, { value: x.ok, color: COR.ok },
          ] }))} />
        </DashCard>
        <DashCard T={T} title="Situação dos produtos" subtitle={`${total} produto(s) monitorados`}>
          <div className="flex flex-col items-center gap-5 pt-1">
            <DashDonut T={T} centerValue={total} centerLabel="produtos" segments={[
              { label: "Vencidos", value: d.venc.length, color: COR.expired }, { label: "Em alerta", value: d.alerta.length, color: COR.alert },
              { label: "Atenção", value: d.atencao.length, color: COR.warning }, { label: "No prazo", value: d.ok.length, color: COR.ok },
            ]} />
            <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2">
              {[["Vencidos", d.venc.length, COR.expired], ["Em alerta", d.alerta.length, COR.alert], ["Atenção", d.atencao.length, COR.warning], ["No prazo", d.ok.length, COR.ok]].map(([l, n, c]) => (
                <div key={l} className="flex items-center gap-2 text-xs">
                  <i style={{ background: c }} className="h-2.5 w-2.5 rounded-full inline-block shrink-0" />
                  <span style={{ color: T.subtext }} className="flex-1">{l}</span>
                  <strong style={{ color: T.text }} className="tabular-nums">{n}</strong>
                </div>
              ))}
            </div>
          </div>
        </DashCard>
      </div>

      {/* Perdas + motivos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <DashCard T={T} className="xl:col-span-2" title="Perdas por dia" subtitle="Valor em R$ de produtos baixados já vencidos — últimos 30 dias"
          right={<span style={{ color: T.text }} className="text-sm font-extrabold tabular-nums">{fmt(d.perda30)}</span>}>
          <DashArea T={T} data={d.serie} color={RED} gid="ar-perda" />
        </DashCard>
        <DashCard T={T} title="Ações registradas" subtitle="Baixas por motivo — últimos 30 dias">
          {d.motivosLista.length === 0 ? (
            <p style={{ color: T.subtext }} className="text-xs py-8 text-center">Nenhuma baixa registrada no período.</p>
          ) : (
            <div className="flex flex-col gap-3.5 pt-1">
              {d.motivosLista.map(([m, n]) => (
                <div key={m}>
                  <div className="flex items-center justify-between text-xs mb-1.5"><span style={{ color: T.text }} className="font-medium truncate pr-2">{m}</span><strong style={{ color: T.text }} className="tabular-nums">{n}</strong></div>
                  <div style={{ background: T.chipBg }} className="h-2 rounded-full overflow-hidden"><div style={{ width: `${(n / maxMotivo) * 100}%`, background: BLUE }} className="h-full rounded-full" /></div>
                </div>
              ))}
            </div>
          )}
        </DashCard>
      </div>

      {/* Tabela de críticos + rondas */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <DashCard T={T} className="xl:col-span-2" title="Produtos mais críticos" subtitle="Os que vencem primeiro e pedem ação"
          right={<button onClick={() => onFlow("prioridade")} style={{ color: BLUE }} className="text-[11px] font-bold hover:underline shrink-0">Ver prioridades →</button>}>
          {d.criticos.length === 0 ? (
            <p style={{ color: T.subtext }} className="text-xs py-8 text-center">Nenhum produto vencido ou em alerta. 🎉</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-left text-xs min-w-[520px]">
                <thead>
                  <tr style={{ color: T.subtext, borderColor: T.border }} className="border-b text-[10px] uppercase tracking-wide">
                    <th className="font-bold py-2 px-1">Produto</th><th className="font-bold py-2 px-1">Setor</th><th className="font-bold py-2 px-1">Validade</th>
                    <th className="font-bold py-2 px-1 text-right">Qtd</th><th className="font-bold py-2 px-1 text-right">Valor</th><th className="font-bold py-2 px-1 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.criticos.map((i) => {
                    const st = statusStyles(i.status.level);
                    return (
                      <tr key={i.id} onClick={() => onOpenDetail(i)} style={{ borderColor: T.border }} className="border-b last:border-0 cursor-pointer hover:opacity-75">
                        <td className="py-2.5 px-1">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Thumb foto={i.foto} size={32} rounded="rounded-lg" />
                            <span style={{ color: T.text }} className="font-semibold truncate max-w-[220px]">{i.nome}</span>
                          </div>
                        </td>
                        <td style={{ color: T.subtext }} className="py-2.5 px-1">{i.setor}</td>
                        <td style={{ color: T.text }} className="py-2.5 px-1 tabular-nums">{formatarData(i.validade)}{textoLote(i) && <span style={{ color: T.subtext }} className="block text-[10px]">{textoLote(i) === "Sem lote" ? "Sem lote" : `Lote ${textoLote(i)}`}</span>}</td>
                        <td style={{ color: T.text }} className="py-2.5 px-1 text-right tabular-nums">{i.quantidade || 1}</td>
                        <td style={{ color: T.text }} className="py-2.5 px-1 text-right tabular-nums font-semibold">{fmt(i.valor)}</td>
                        <td className="py-2.5 px-1 text-right">
                          <span style={{ background: st.bg, color: st.fg }} className="text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap">
                            {i.status.d < 0 ? `${-i.status.d}d vencido` : i.status.d === 0 ? "Vence hoje" : `${i.status.d}d`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashCard>
        <DashCard T={T} title="Rondas de hoje" subtitle={d.rondasSetor.length ? `${rondasOk} de ${d.rondasSetor.length} setores conferidos` : "Sem setores ainda"}
          right={<button onClick={() => onTab("rondas")} style={{ color: BLUE }} className="text-[11px] font-bold hover:underline shrink-0">Abrir →</button>}>
          <div className="flex flex-col gap-1 -mx-1">
            {d.rondasSetor.slice(0, 8).map((s) => {
              const cor = s.estado === "ok" ? "#1F9D55" : s.estado === "parcial" ? "#C98A0C" : T.subtext;
              return (
                <div key={s.setor} className="flex items-center gap-3 px-1 py-2">
                  <i style={{ background: cor }} className="h-2.5 w-2.5 rounded-full shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p style={{ color: T.text }} className="text-xs font-semibold truncate">{s.setor}</p>
                    <p style={{ color: T.subtext }} className="text-[10px]">{s.risco > 0 ? `${s.risco} em risco · ` : ""}última ronda {tempoDesde(s.ultima)}</p>
                  </div>
                  <span style={{ color: cor }} className="text-[10px] font-bold uppercase shrink-0">{s.estado === "ok" ? "Concluída" : s.estado === "parcial" ? "Parcial" : "Pendente"}</span>
                </div>
              );
            })}
            {d.rondasSetor.length === 0 && <p style={{ color: T.subtext }} className="text-xs py-8 text-center">Nenhum setor com produtos.</p>}
          </div>
        </DashCard>
      </div>

      {/* Setores, troca, atividade */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <DashCard T={T} title="Produtos por setor" subtitle="Total monitorado e parte em risco">
          <div className="flex flex-col gap-3.5 pt-1">
            {d.setores.slice(0, 7).map((s) => (
              <div key={s.setor}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span style={{ color: T.text }} className="font-medium truncate pr-2">{s.setor}</span>
                  <span style={{ color: T.subtext }} className="tabular-nums shrink-0"><strong style={{ color: T.text }}>{s.total}</strong>{s.risco > 0 && <> · <span style={{ color: RED_DARK }} className="font-semibold">{s.risco} em risco</span></>}</span>
                </div>
                <div style={{ background: T.chipBg, width: `${(s.total / maxSetor) * 100}%`, minWidth: 8 }} className="h-2 rounded-full overflow-hidden">
                  <div style={{ width: `${(s.risco / s.total) * 100}%`, background: RED }} className="h-full" />
                </div>
              </div>
            ))}
            {d.setores.length === 0 && <p style={{ color: T.subtext }} className="text-xs py-8 text-center">Nenhum produto monitorado.</p>}
          </div>
        </DashCard>
        <DashCard T={T} title="Política de troca com fornecedor" subtitle="Onde a perda não volta pra loja">
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[["Sem troca", d.troca.sem, RED_DARK, RED_SOFT], ["Com troca", d.troca.com, "#1F9D55", "#E6F7ED"], ["Não informado", d.troca.nao, T.subtext, T.chipBg]].map(([l, n, c, bg]) => (
              <div key={l} style={{ background: bg }} className="rounded-xl py-4 px-2 text-center">
                <p style={{ color: c }} className="text-2xl font-extrabold leading-none tabular-nums">{n}</p>
                <p style={{ color: c }} className="text-[10px] font-semibold mt-1.5">{l}</p>
              </div>
            ))}
          </div>
          <div style={{ background: T.chipBg }} className="rounded-xl p-3.5 mt-4 flex items-center justify-between">
            <span style={{ color: T.subtext }} className="text-[11px] font-semibold">Valor sem possibilidade de troca</span>
            <strong style={{ color: RED_DARK }} className="text-sm tabular-nums">{fmt(d.troca.valorSem)}</strong>
          </div>
        </DashCard>
        <DashCard T={T} title="Atividade recente" subtitle="Últimas ações da equipe"
          right={<button onClick={() => onFlow("auditoria")} style={{ color: BLUE }} className="text-[11px] font-bold hover:underline shrink-0">Auditoria →</button>}>
          <div className="flex flex-col gap-3 pt-1">
            {d.feed.map((a, k) => (
              <div key={a.id || k} className="flex items-start gap-3">
                <div style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{(a.usuario || "?").trim()[0]?.toUpperCase()}</div>
                <div className="min-w-0">
                  <p style={{ color: T.text }} className="text-xs leading-snug"><strong>{a.usuario || "Alguém"}</strong> {a.acao}</p>
                  <p style={{ color: T.subtext }} className="text-[10px] mt-0.5">{formatarDataHoraExtenso(a.criadoEm)}</p>
                </div>
              </div>
            ))}
            {d.feed.length === 0 && <p style={{ color: T.subtext }} className="text-xs py-8 text-center">Nenhuma ação registrada ainda.</p>}
          </div>
        </DashCard>
      </div>
    </div>
  );
}

export { DashboardView };

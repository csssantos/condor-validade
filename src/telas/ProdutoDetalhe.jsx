// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Package, Barcode, Percent, Tag, Clock, Layers, DollarSign, Boxes, Target, TrendingDown, ShieldAlert, Users2, ChevronRight, ShieldCheck, PackageX, Edit2, Share2, Trash2, Megaphone, CalendarDays } from "lucide-react";
import { FUNDO_MARCA } from "../TelasEntrada";
import { BLUE, BLUE_DARK, BLUE_SOFT, MOTIVOS_BAIXA, MOTIVOS_EXCLUSAO, RED, RED_DARK, RED_SOFT, gerarCodigoLocalizacao } from "../lib/constantes";
import { supaFetchAlteracoesValidade } from "../lib/dados";
import { descontoSugerido, formatarData, formatarDataHoraExtenso, formatarMoeda, getStatus, statusStyles, useValoresVisiveis } from "../lib/formatos";
import { clampNumero } from "../lib/utilidades";
import { campanhaValida, normalizarCampanha } from "../lib/produto";
import { useTelaLarga } from "../lib/tela";
import { InfoTile } from "./Analises";

// ============ Modal de detalhe do produto ============
function ProductDetailModal({ T, item, outrosLotes, onTrocarLote, onClose, onEdit, onDuplicate, onBaixa, onShare, onAplicarPromocao, onPedido, onPedidoLotes, lotesParaPedido, podeGerirPedido, onExcluir }) {
  const podeVerValores = useValoresVisiveis();
  const pc = useTelaLarga();
  const pedidoRef = useRef(null);
  const [confirmandoBaixa, setConfirmandoBaixa] = useState(false);
  const [subEtapa, setSubEtapa] = useState(null); // null | 'promocao' | 'quantidade' (confirmação da baixa total)
  const [motivoPendente, setMotivoPendente] = useState(null);
  const [precoPromoInput, setPrecoPromoInput] = useState(item.precoPromocional ? String(item.precoPromocional) : "");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState(null);
  const [motivoExclusaoOutro, setMotivoExclusaoOutro] = useState("");
  const [editandoPedido, setEditandoPedido] = useState(false);
  const [pedidoTipo, setPedidoTipo] = useState(item.pedidoTipo || null);
  const [confirmandoRemoverPedido, setConfirmandoRemoverPedido] = useState(false);
  const salvandoPedidoRef = useRef(false);
  const desmarcadosPadrao = () => (lotesParaPedido || []).filter((l) => getStatus(l).d > 30).map((l) => l.id);
  const [desmarcados, setDesmarcados] = useState(desmarcadosPadrao); // lotes que a pessoa tirou da campanha (por padrão todos entram)
  const lotesExtra = (!item.pedidoTipo && lotesParaPedido) ? lotesParaPedido.filter((l) => !desmarcados.includes(l.id)) : [];
  const [pedidoCampanha, setPedidoCampanha] = useState(item.pedidoCampanha || "");
  const [salvandoPedido, setSalvandoPedido] = useState(false);
  const valorTxt0 = (v) => (v != null ? String(v).replace(".", ",") : "");
  const [pedidoValor, setPedidoValor] = useState(valorTxt0(item.pedidoValor));
  const pedidoValorNum = (() => { const n = Number(String(pedidoValor).replace(",", ".")); return /^\d{1,4}([.,]\d{1,2})?$/.test(String(pedidoValor).trim()) && n >= 0.01 && n <= 5000 ? n : null; })();
  const campanhaOk = campanhaValida(pedidoCampanha);
  // Formulário do pedido x tempo real: se o pedido mudar em OUTRO aparelho enquanto a pessoa digita, o formulário
  // NÃO é zerado (antes ela perdia o que digitou); só aparece um aviso para conferir antes de salvar.
  const [pedidoMudouFora, setPedidoMudouFora] = useState(false);
  const editandoRef = useRef(false);
  editandoRef.current = editandoPedido;
  function sincronizarPedido() { setConfirmandoRemoverPedido(false); setPedidoTipo(item.pedidoTipo || null); setPedidoCampanha(item.pedidoCampanha || ""); setPedidoValor(valorTxt0(item.pedidoValor)); }
  useEffect(() => {
    if (editandoRef.current) { if (!salvandoPedidoRef.current) setPedidoMudouFora(true); return; }
    sincronizarPedido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.pedidoTipo, item.pedidoCampanha, item.pedidoValor]);
  useEffect(() => { if (!editandoPedido) { sincronizarPedido(); setPedidoMudouFora(false); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [editandoPedido]);
  async function salvarPedido(tipo, campanha, valor) {
    if (salvandoPedidoRef.current) return;
    salvandoPedidoRef.current = true; setSalvandoPedido(true);
    const ok = tipo && onPedidoLotes && lotesExtra.length ? await onPedidoLotes(item, lotesExtra, tipo, campanha, valor) : await onPedido(item, tipo, campanha, valor);
    salvandoPedidoRef.current = false; setSalvandoPedido(false);
    if (ok) { setEditandoPedido(false); setConfirmandoRemoverPedido(false); }
  }
  const [historicoValidade, setHistoricoValidade] = useState(null);
  const [mostrarHistoricoValidade, setMostrarHistoricoValidade] = useState(false);
  useEffect(() => { supaFetchAlteracoesValidade(item.barcode).then(setHistoricoValidade); }, [item.barcode]);
  const status = getStatus(item);
  const s = statusStyles(status.level);
  const desconto = descontoSugerido(item, status);
  let diasTexto;
  if (status.level === "expired") diasTexto = `Vencido há ${Math.abs(status.d)} dia${Math.abs(status.d) === 1 ? "" : "s"}`;
  else if (status.d === 0) diasTexto = "Vence hoje";
  else diasTexto = `Vence em ${status.d} dia${status.d === 1 ? "" : "s"}`;

  function escolherMotivo(m) {
    if (m === "Promoção aplicada" && !item.emPromocao) { setSubEtapa("promocao"); return; }
    setMotivoPendente(m);
    setSubEtapa("quantidade");
  }

  const corKpi = status.level === "expired" || status.level === "alert" ? s.bg : s.fg;
  const perto10 = status.level !== "expired" && status.d <= 10;
  const mostrarAlertaCampanha = perto10 && !item.pedidoTipo && !!onPedido;
  function lancarCampanha() { setEditandoPedido(true); setTimeout(() => { try { pedidoRef.current && pedidoRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* sem rolagem */ } }, 60); }
  const alertaCampanha = (grande) => mostrarAlertaCampanha && (
    <div role="alert" style={{ background: "#FFF4E0", borderColor: "#F2C879" }} className={`rounded-2xl border flex items-center gap-3 ${grande ? "px-5 py-4" : "px-3.5 py-3 mt-3"}`}>
      <div style={{ background: "#F5A524" }} className={`${grande ? "h-11 w-11" : "h-9 w-9"} rounded-full flex items-center justify-center shrink-0`}><Megaphone size={grande ? 20 : 17} color="#fff" /></div>
      <div className="min-w-0 flex-1">
        <p style={{ color: "#7A4B00" }} className={`${grande ? "text-[15px]" : "text-[13px]"} font-extrabold leading-tight`}>{status.d === 0 ? "Vence hoje" : `Faltam ${status.d} dia${status.d === 1 ? "" : "s"} para vencer`}: lance uma campanha</p>
        <p style={{ color: "#8A5A10" }} className={`${grande ? "text-[12.5px]" : "text-[11px]"} mt-0.5 leading-snug`}>Peça promoção ou preço direto e registre aqui o número da campanha. Depois de salvar, o lote fica travado.</p>
      </div>
      {!editandoPedido && <button onClick={lancarCampanha} style={{ background: "#B86E00", color: "#fff" }} className={`shrink-0 font-bold rounded-full ${grande ? "text-[13px] px-5 py-2.5" : "text-[11.5px] px-3.5 py-2"}`}>Lançar campanha</button>}
    </div>
  );

  const bPromo = item.emPromocao ? (
      <div style={{ background: BLUE_SOFT }} className="rounded-2xl px-3.5 py-3 flex items-center gap-2.5">
        <Percent size={15} color={BLUE} />
        <div>
          <p style={{ color: BLUE_DARK }} className="text-xs font-bold">Em promoção</p>
          <p style={{ color: BLUE }} className="text-[11px]">{formatarMoeda(item.precoPromocional)} <span className="line-through opacity-60">{formatarMoeda(item.precoUnitario)}</span></p>
        </div>
      </div>
  ) : null;
  const bPedido = (item.pedidoTipo || (onPedido && (status.level !== "expired" || editandoPedido))) ? (
      <div ref={pedidoRef} style={{ background: T.chipBg }} className="rounded-2xl px-3.5 py-3">
        <p style={{ color: T.subtext }} className="text-[9px] font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1"><Tag size={11} /> Pedido de promoção ou preço direto</p>
        {item.pedidoTipo && !editandoPedido && (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p style={{ color: "#1F7A45" }} className="text-[13px] font-bold">{item.pedidoTipo === "preco_direto" ? "Preço direto pedido" : "Promoção pedida"}{item.pedidoCampanha ? ` · campanha ${item.pedidoCampanha}` : ""}{item.pedidoValor != null ? ` · R$ ${Number(item.pedidoValor).toFixed(2).replace(".", ",")}` : ""}</p>
              <p style={{ color: T.subtext }} className="text-[10.5px] mt-0.5">{item.pedidoPor || "—"}{item.pedidoEm ? ` · ${formatarDataHoraExtenso(item.pedidoEm)}` : ""}</p>
            </div>
            {onPedido && podeGerirPedido && <button onClick={() => setEditandoPedido(true)} style={{ color: BLUE }} className="text-[11px] font-bold shrink-0 px-1">Alterar</button>}
          </div>
        )}
        {item.pedidoTipo && !editandoPedido && (
          <p style={{ color: T.subtext }} className="text-[10.5px] mt-2 leading-snug">Lote travado: com o pedido registrado não dá para editar, somar quantidade, aplicar promoção nem excluir. {podeGerirPedido ? "Dá para dar baixa, ou remover o pedido (em Alterar) para destravar." : "Peça ao encarregado do setor para dar baixa ou remover o pedido."}</p>
        )}
        {!item.pedidoTipo && !editandoPedido && (
          <>
            <p style={{ color: T.subtext }} className="text-[11.5px] mb-2">Ainda sem pedido registrado. Mesmo perto da validade, registre aqui que a promoção ou o preço direto foi pedido.</p>
            <button onClick={() => setEditandoPedido(true)} style={{ background: BLUE_DARK, color: "#fff" }} className="text-[12px] font-bold rounded-full px-4 py-2">Registrar pedido</button>
          </>
        )}
        {editandoPedido && onPedido && (
          <div>
            <div className="grid grid-cols-2 gap-1.5">
              {[["promocao", "Promoção"], ["preco_direto", "Preço direto"]].map(([v, r]) => (
                <button key={v} onClick={() => setPedidoTipo(v)} aria-pressed={pedidoTipo === v}
                  style={pedidoTipo === v ? { background: BLUE_DARK, color: "#fff" } : { background: T.card, color: T.text }}
                  className="text-[12px] font-semibold py-2 rounded-xl">{r}</button>
              ))}
            </div>
            <input value={pedidoCampanha} onChange={(e) => setPedidoCampanha(e.target.value.replace(/\D/g, "").slice(0, 20))}
              placeholder="Número da campanha (só números, obrigatório)" inputMode="numeric" maxLength={20} aria-label="Número da campanha"
              style={{ background: T.card, color: T.text, borderColor: T.inputBorder }} className="w-full min-w-0 mt-2 border rounded-xl px-3 py-2 text-xs outline-none" />
            <input value={pedidoValor} onChange={(e) => setPedidoValor(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 8))}
              placeholder="Valor pedido em R$ (obrigatório)" inputMode="decimal" maxLength={8} aria-label="Valor pedido em reais"
              style={{ background: T.card, color: T.text, borderColor: T.inputBorder }} className="w-full min-w-0 mt-2 border rounded-xl px-3 py-2 text-xs outline-none" />
            {pedidoMudouFora && (
              <div role="alert" style={{ color: "#7A4B00", background: "#FFF4E0" }} className="text-[10.5px] font-semibold mt-1 rounded-lg px-2 py-1.5">
                Outra pessoa (ou outro aparelho) alterou este pedido enquanto você editava. {item.pedidoTipo ? `Agora: ${item.pedidoTipo === "preco_direto" ? "preço direto" : "promoção"}${item.pedidoCampanha ? ` · campanha ${item.pedidoCampanha}` : ""}${item.pedidoValor != null ? ` · R$ ${Number(item.pedidoValor).toFixed(2).replace(".", ",")}` : ""}.` : "Agora o lote está sem pedido."}
                <button onClick={() => { sincronizarPedido(); setPedidoMudouFora(false); }} style={{ color: BLUE }} className="block mt-1 font-bold underline">Usar os valores atuais</button>
              </div>
            )}
                  {pedidoTipo && !campanhaOk && <p role="alert" style={{ color: RED_DARK }} className="text-[10.5px] font-semibold mt-1">Informe o número da campanha (só números).</p>}
            {pedidoTipo && pedidoValorNum == null && <p role="alert" style={{ color: RED_DARK }} className="text-[10.5px] font-semibold mt-1">Informe o valor pedido (de 0,01 a 5000, com até 2 casas, ex.: 5,90).</p>}
            {!item.pedidoTipo && lotesParaPedido && lotesParaPedido.length > 0 && (
              <div style={{ background: T.card }} className="mt-2 rounded-xl px-3 py-2">
                <p className="text-[11.5px] font-bold mb-1">Lançar esta campanha também nos outros lotes?</p>
                {lotesParaPedido.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 py-1 text-[11.5px]">
                    <input type="checkbox" disabled={salvandoPedido} checked={!desmarcados.includes(l.id)} onChange={(e) => setDesmarcados((d) => e.target.checked ? d.filter((x) => x !== l.id) : [...d, l.id])} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">Validade {formatarData(l.validade)}{l.lote ? ` · Lote ${l.lote}` : ""} · {l.quantidade || 1}{l.porPeso ? "kg" : "un"}</span>
                  </label>
                ))}
                <p style={{ color: T.subtext }} className="text-[10px] mt-0.5">Marcados ficam travados como este. Lotes que vencem em mais de 30 dias vêm desmarcados; vencidos ou com pedido não aparecem (até 10 lotes).</p>
              </div>
            )}
            <p style={{ color: T.subtext }} className="text-[10px] mt-1">O valor é só uma sugestão: depende da central liberar. Campanha (obrigatória): só números, até 20 dígitos.{!item.pedidoTipo && " Atenção: depois de salvar, " + (lotesExtra.length ? "este lote e os marcados ficam travados" : "este lote fica travado") + " (sem editar, somar ou excluir); só o encarregado do setor destrava."}</p>
            <div className="flex gap-2 mt-2.5">
              <button onClick={() => { setDesmarcados(desmarcadosPadrao()); setEditandoPedido(false); setConfirmandoRemoverPedido(false); setPedidoTipo(item.pedidoTipo || null); setPedidoCampanha(item.pedidoCampanha || ""); setPedidoValor(valorTxt0(item.pedidoValor)); }} style={{ color: T.subtext }} className="flex-1 text-[11px] py-1.5">Cancelar</button>
              {item.pedidoTipo && podeGerirPedido && (confirmandoRemoverPedido
                ? <button onClick={() => salvarPedido(null, null, null)} disabled={salvandoPedido} style={{ background: RED_DARK, color: "#fff" }} className="flex-1 text-[11px] font-semibold py-1.5 rounded-xl disabled:opacity-40">Confirmar remoção</button>
                : <button onClick={() => setConfirmandoRemoverPedido(true)} style={{ color: RED_DARK }} className="flex-1 text-[11px] font-semibold py-1.5">Remover</button>)}
              <button onClick={() => salvarPedido(pedidoTipo, normalizarCampanha(pedidoCampanha), pedidoValorNum)} disabled={salvandoPedido || !pedidoTipo || !campanhaOk || pedidoValorNum == null} style={{ background: BLUE_DARK, color: "#fff" }} className="flex-1 text-[11px] font-semibold py-1.5 rounded-xl disabled:opacity-40">{salvandoPedido ? "Salvando…" : lotesExtra.length && !item.pedidoTipo ? `Salvar em ${lotesExtra.length + 1} lotes` : "Salvar"}</button>
            </div>
          </div>
        )}
      </div>
  ) : null;
  const bDesconto = desconto && !item.emPromocao ? (
      <div style={{ background: RED_SOFT }} className="rounded-2xl px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <div style={{ background: "rgba(255,255,255,0.6)" }} className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"><Percent size={14} color={RED_DARK} /></div>
          <p style={{ color: RED_DARK }} className="text-xs font-bold">{desconto.label} · {desconto.pct}% OFF sugerido</p>
        </div>
        {desconto.precoOriginal && (
          <div className="flex items-center gap-2 mt-2 pl-9">
            <span style={{ color: RED_DARK }} className="text-xs line-through opacity-60">{formatarMoeda(desconto.precoOriginal)}</span>
            <span style={{ color: RED_DARK }} className="text-sm font-extrabold">{formatarMoeda(desconto.precoComDesconto)}</span>
            <span style={{ color: RED_DARK }} className="text-[10px] opacity-70">/un sugerido</span>
          </div>
        )}
      </div>
  ) : null;
  const bOutros = outrosLotes && outrosLotes.length > 0 ? (
      <div style={{ background: T.chipBg }} className="rounded-2xl p-3">
        <p style={{ color: T.subtext }} className="text-[10px] font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5"><Layers size={12} /> Outros lotes deste produto ({outrosLotes.length})</p>
        <div className="flex flex-col gap-1.5">
          {outrosLotes.map((l) => {
            const sl = statusStyles(getStatus(l).level);
            return (
              <button key={l.id} onClick={() => onTrocarLote && onTrocarLote(l)} style={{ background: T.card }} className="w-full text-left rounded-xl p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span style={{ background: sl.bg, color: sl.fg }} className="text-[9px] font-bold px-1.5 py-0.5 rounded">{sl.label}</span>
                    <span className="text-xs font-semibold">{formatarData(l.validade)}</span>
                    <span style={{ color: T.subtext }} className="text-[10px]">· {l.lote ? `Lote ${l.lote} · ` : ""}{l.quantidade || 1}{l.porPeso ? "kg" : "un"}{l.pedidoTipo ? " · pedido ✓" : " · sem pedido"}</span>
                  </div>
                  {gerarCodigoLocalizacao(l) && <p style={{ color: T.subtext }} className="text-[10px] mt-0.5 font-mono">{gerarCodigoLocalizacao(l)}</p>}
                </div>
                <ChevronRight size={14} color={T.subtext} className="shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
  ) : null;
  const bHist = historicoValidade && historicoValidade.length > 0 ? (
      <div style={{ background: "#FFF8E8", borderColor: "#F0DDA6" }} className="rounded-2xl p-3 border">
        <button onClick={() => setMostrarHistoricoValidade((v) => !v)} className="w-full flex items-center justify-between">
          <p style={{ color: "#8A6414" }} className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5">
            <ShieldCheck size={12} /> Validade já foi alterada {historicoValidade.length}x
          </p>
          <ChevronRight size={14} color="#8A6414" className={`shrink-0 transition-transform ${mostrarHistoricoValidade ? "rotate-90" : ""}`} />
        </button>
        {mostrarHistoricoValidade && (
          <div className="flex flex-col gap-2 mt-2.5">
            {historicoValidade.map((h) => (
              <div key={h.id} style={{ background: "rgba(255,255,255,0.6)" }} className="rounded-xl p-2.5">
                <p style={{ color: "#8A6414" }} className="text-xs font-semibold">
                  {formatarData(h.validadeAnterior)} → {formatarData(h.validadeNova)}
                </p>
                <p style={{ color: "#8A6414" }} className="text-[10px] mt-0.5 opacity-80">
                  {h.alteradoPor || "—"} · {formatarDataHoraExtenso(h.alteradoEm)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
  ) : null;
  const temEsquerdaPC = !!(bPromo || bPedido || bDesconto || bOutros); // sem nada à esquerda, os dados ocupam a largura toda
  // Orientação: produto vencido (o que fazer) e, para quem não tem os botões, por que eles não aparecem
  const bOrientacao = (status.level === "expired" || (!onBaixa && status.d <= 10)) ? (
    <div className="flex flex-col gap-2">
      {status.level === "expired" && (
        <div role="alert" style={{ background: RED_SOFT, color: RED_DARK }} className="rounded-2xl px-3.5 py-2.5 text-[12px] font-semibold leading-snug">
          Produto vencido: retire da área de venda agora. {onBaixa ? "Depois toque em \"Registrar ação\" e escolha o motivo da baixa." : "Avise o encarregado do setor para registrar a baixa."}
        </div>
      )}
      {!onBaixa && (status.level === "expired" || status.d <= 10) && (
        <p style={{ background: T.chipBg, color: T.subtext }} className="rounded-2xl px-3.5 py-2.5 text-[11.5px] leading-snug">
          Baixa, exclusão e pedido de campanha deste produto (setor {item.setor}) são feitos pelo encarregado desse setor ou por cargo acima.
        </p>
      )}
    </div>
  ) : null;
  const bExclusao = (
    <div style={{ background: RED_SOFT }} className={pc ? "rounded-2xl p-4" : "rounded-xl p-2.5"}>
      <p style={{ color: RED_DARK }} className="text-[11px] font-medium text-center mb-2">Excluir sem registrar no histórico. Qual o motivo?</p>
      <div className="grid grid-cols-2 gap-1.5">
        {MOTIVOS_EXCLUSAO.map((m) => (
          <button key={m} onClick={() => setMotivoExclusao(m)}
            style={motivoExclusao === m ? { background: RED_DARK, color: "#fff" } : { background: "#fff", color: RED_DARK }}
            className="text-[11px] font-medium py-2 rounded-xl border" >
            {m}
          </button>
        ))}
      </div>
      {motivoExclusao === "Outro" && (
        <input value={motivoExclusaoOutro} onChange={(e) => setMotivoExclusaoOutro(e.target.value.slice(0, 80))}
          placeholder="Descreva o motivo..." autoFocus
          style={{ background: "#fff", color: RED_DARK, borderColor: RED_DARK }}
          className="w-full min-w-0 mt-2 border rounded-xl px-3 py-2 text-xs outline-none" />
      )}
      <div className="flex gap-2 mt-2.5">
        <button onClick={() => { setConfirmandoExclusao(false); setMotivoExclusao(null); setMotivoExclusaoOutro(""); }} style={{ color: T.subtext }} className="flex-1 text-[11px] py-1.5">Cancelar</button>
        <button
          onClick={() => onExcluir && onExcluir(item, motivoExclusao === "Outro" ? (motivoExclusaoOutro.trim() || "Outro") : motivoExclusao)}
          disabled={!onExcluir || !motivoExclusao || (motivoExclusao === "Outro" && !motivoExclusaoOutro.trim())}
          style={{ background: RED_DARK, color: "#fff" }} className="flex-1 text-[11px] font-semibold py-1.5 rounded-xl disabled:opacity-40">
          Sim, excluir
        </button>
      </div>
    </div>
  );

  return (
    <>
    {!pc && (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/50" />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 38 }}
        style={{ background: T.card }} className="relative w-full max-w-md rounded-t-[30px] overflow-hidden flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] sm:max-h-[90vh] sm:rounded-[30px]">
        <div style={{ background: FUNDO_MARCA }} className="relative shrink-0">
          {item.foto ? <img src={item.foto} alt="" className="w-full h-36 object-cover" /> : (
            <div style={{ background: FUNDO_MARCA }} className="relative w-full h-28 flex items-center justify-center"><div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} /><Package size={44} color="#fff" className="relative opacity-90" /></div>
          )}
          <button onClick={onClose} aria-label="Fechar" className="absolute top-3 left-3 h-10 w-10 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(255,255,255,.2)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.3)" }}><ArrowLeftIcon className="w-4 h-4 text-white" /></button>
          <span style={{ background: s.bg, color: s.fg }} className="absolute bottom-3 left-4 text-[11px] font-bold px-3 py-1 rounded-full shadow-md">{status.label}</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
          <h2 className="font-bold text-lg leading-tight">{item.nome}</h2>
          <p style={{ color: T.subtext }} className="text-sm font-medium mt-0.5">{diasTexto}{item.tamanho ? ` · ${item.tamanho}${item.unidadeMedida || ""}` : ""}</p>


          {/* Dados essenciais em grade simples — sem elementos decorativos */}
          <div style={{ background: T.chipBg }} className="rounded-2xl mt-3.5 p-3.5 grid grid-cols-2 gap-3">
            <div>
              <p style={{ color: T.subtext }} className="text-[9px] font-bold uppercase tracking-wide mb-0.5">Setor</p>
              <p className="text-[13px] font-bold truncate">{item.setor}{item.subsetor ? ` · ${item.subsetor}` : ""}</p>
            </div>
            <div className="text-right">
              <p style={{ color: T.subtext }} className="text-[9px] font-bold uppercase tracking-wide mb-0.5">Validade</p>
              <p className="text-[13px] font-bold">{formatarData(item.validade)}</p>
              {(item.lote || item.semLote) && <p style={{ color: T.subtext }} className="text-[10.5px] font-semibold mt-0.5">{item.lote ? `Lote ${item.lote}` : "Sem lote"}</p>}
            </div>
            <div className="col-span-2 pt-2.5 border-t" style={{ borderColor: T.border }}>
              <p style={{ color: T.subtext }} className="text-[9px] font-bold uppercase tracking-wide mb-0.5 flex items-center gap-1"><Barcode size={11} /> Código do produto</p>
              <p style={{ color: T.text }} className="text-[13px] font-mono font-semibold tracking-wide">{item.barcode}</p>
            </div>
          </div>

          {bPromo && <div className="mt-3">{bPromo}</div>}

          {bOrientacao && <div className="mt-3">{bOrientacao}</div>}
          {alertaCampanha(false)}
          {bPedido && <div className="mt-3">{bPedido}</div>}

          {bDesconto && <div className="mt-3">{bDesconto}</div>}

          <div className="grid grid-cols-2 gap-2.5 mt-3.5">
            <InfoTile T={T} icon={Clock} label="Alerta" value={[item.diasAlerta, ...(item.diasAlertaExtras || [])].sort((a, b) => b - a).join(", ") + " dias antes"} />
            {!!item.quantidade && <InfoTile T={T} icon={Layers} label="Quantidade" value={item.porPeso ? `${item.quantidade} kg` : item.quantidade} />}
            {!!item.precoUnitario && podeVerValores && <InfoTile T={T} icon={DollarSign} label={item.porPeso ? "Valor total (kg)" : "Valor total"} value={formatarMoeda((item.quantidade || 1) * item.precoUnitario)} />}
            {item.familia && <InfoTile T={T} icon={Boxes} label="Família" value={item.familia} />}
            {gerarCodigoLocalizacao(item) && <InfoTile T={T} icon={Target} label="Localização" value={gerarCodigoLocalizacao(item)} mono />}
            {item.categoriaGiro && <InfoTile T={T} icon={TrendingDown} label="Giro" value={item.categoriaGiro} />}
            {item.politicaTroca && (
              <InfoTile T={T} icon={ShieldAlert} label="Política de troca" value={item.politicaTroca === "sem_troca" ? "Sem troca" : "Com troca"} />
            )}
          </div>

          {(item.cadastradoPor || item.atualizadoPor) && (
            <div style={{ background: T.chipBg }} className="rounded-xl px-3 py-2.5 mt-3 flex items-center gap-2">
              <Users2 size={13} color={T.subtext} />
              <p style={{ color: T.subtext }} className="text-[11px]">
                {item.cadastradoPor && <>Cadastrado por <strong style={{ color: T.text }}>{item.cadastradoPor}</strong></>}
                {item.atualizadoPor && item.atualizadoPor !== item.cadastradoPor && <> · editado por <strong style={{ color: T.text }}>{item.atualizadoPor}</strong></>}
              </p>
            </div>
          )}

          {item.observacoes && (
            <div style={{ background: T.chipBg }} className="rounded-xl px-3 py-2.5 mt-3">
              <p style={{ color: T.subtext }} className="text-[10px] font-semibold uppercase mb-0.5">Observações</p>
              <p className="text-sm">{item.observacoes}</p>
            </div>
          )}

          {/* Outros lotes/validades do mesmo produto neste setor — antes só dava pra ver isso na listagem do setor */}
          {bOutros && <div className="mt-3">{bOutros}</div>}

          {/* Trilha imutável: histórico de alterações de validade deste código — não pode ser apagado, nem por aqui */}
          {bHist && <div className="mt-3">{bHist}</div>}

        </div>
        <div style={{ borderColor: T.border, background: T.card }} className="shrink-0 max-h-[55%] overflow-y-auto px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t">
          {onBaixa && (
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => setConfirmandoBaixa(true)}
            style={{ background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)` }}
            className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-red-900/20">
            <PackageX className="w-5 h-5 text-white" />
            <span className="text-white font-bold text-sm">Registrar ação</span>
          </motion.button>
          )}

          <div className="flex items-center justify-around mt-3.5">
            {onEdit && (
              <button onClick={() => onEdit(item)} className="flex flex-col items-center gap-1.5">
                <div style={{ background: T.chipBg }} className="h-11 w-11 rounded-2xl flex items-center justify-center"><Edit2 size={16} style={{ color: T.text }} /></div>
                <span style={{ color: T.subtext }} className="text-[10px] font-medium">Editar</span>
              </button>
            )}
            {onDuplicate && (
              <button onClick={() => onDuplicate(item)} className="flex flex-col items-center gap-1.5">
                <div style={{ background: T.chipBg }} className="h-11 w-11 rounded-2xl flex items-center justify-center"><Layers size={16} style={{ color: T.text }} /></div>
                <span style={{ color: T.subtext }} className="text-[10px] font-medium">Novo lote</span>
              </button>
            )}
            <button onClick={() => onShare(item)} className="flex flex-col items-center gap-1.5">
              <div style={{ background: T.chipBg }} className="h-11 w-11 rounded-2xl flex items-center justify-center"><Share2 size={16} style={{ color: T.text }} /></div>
              <span style={{ color: T.subtext }} className="text-[10px] font-medium">Compartilhar</span>
            </button>
            {onExcluir && (
            <button onClick={() => setConfirmandoExclusao(true)} className="flex flex-col items-center gap-1.5">
              <div style={{ background: RED_SOFT }} className="h-11 w-11 rounded-2xl flex items-center justify-center"><Trash2 size={16} color={RED_DARK} /></div>
              <span style={{ color: RED_DARK }} className="text-[10px] font-medium">Excluir</span>
            </button>
            )}
          </div>

          {confirmandoExclusao && onExcluir && <div className="mt-2.5">{bExclusao}</div>}
        </div>
      </motion.div>
    </div>
    )}

    {pc && (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/55" />
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }}
        style={{ background: T.card }} className="relative w-[94vw] max-w-[1320px] min-h-[min(640px,88vh)] max-h-[88vh] grid grid-cols-[400px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] rounded-[30px] overflow-hidden ring-1 ring-black/10 shadow-2xl">
        <div style={{ background: FUNDO_MARCA }} className="relative min-h-0 flex flex-col items-center px-8 pt-20 pb-8 overflow-hidden text-white">
          <span aria-hidden className="absolute -right-24 -top-20 h-80 w-80 rounded-full bg-white/10" />
          <span aria-hidden className="absolute -left-12 bottom-10 h-32 w-32 rounded-full bg-white/10" />
          <button onClick={onClose} aria-label="Fechar" className="absolute top-5 left-5 h-11 w-11 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(255,255,255,.2)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.3)" }}><ArrowLeftIcon className="w-4 h-4 text-white" /></button>
          <span style={{ background: s.bg, color: s.fg }} className="absolute top-6 right-6 text-[12px] font-bold px-3.5 py-1.5 rounded-full shadow-md">{status.label}</span>
          {item.foto ? <img src={item.foto} alt="" className="relative h-64 w-64 object-contain bg-white rounded-[28px] p-4 shadow-2xl shadow-black/30" /> : (
            <div className="relative h-64 w-64 rounded-[28px] overflow-hidden ring-1 ring-white/30 flex items-center justify-center" style={{ background: "rgba(255,255,255,.12)" }}><div aria-hidden className="absolute inset-0 opacity-[.15]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} /><Package size={56} color="#fff" className="relative opacity-90" /></div>
          )}
          <h2 className="relative font-extrabold text-[26px] leading-tight text-center mt-7">{item.nome}</h2>
          <p className="relative text-sm font-semibold mt-1.5 opacity-85 text-center">{item.tamanho ? `${item.tamanho}${item.unidadeMedida || ""}` : ""}</p>
          <div className="relative mt-auto w-full rounded-2xl px-4 py-3.5 flex items-center justify-center gap-2" style={{ background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.22)" }}>
            <Barcode size={16} className="opacity-80" /><span className="font-mono text-[15px] font-semibold tracking-wider">{item.barcode}</span>
          </div>
        </div>

        <div className="min-w-0 min-h-0 flex flex-col">
          <div style={{ borderColor: T.border }} className="shrink-0 border-b px-8 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wider">Detalhes do produto</p>
              <p className="text-lg font-extrabold leading-tight truncate">{diasTexto}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onBaixa && (
                <motion.button whileTap={{ scale: 0.98 }} onClick={() => setConfirmandoBaixa(true)} style={{ background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)` }} className="h-11 px-5 rounded-full flex items-center gap-2 shadow-md shadow-red-900/20">
                  <PackageX className="w-4 h-4 text-white" /><span className="text-white font-bold text-sm">Registrar ação</span>
                </motion.button>
              )}
              {onEdit && <button onClick={() => onEdit(item)} style={{ background: T.chipBg, color: T.text }} className="h-11 px-4 rounded-full flex items-center gap-2 text-sm font-semibold hover:brightness-95"><Edit2 size={15} /> Editar</button>}
              {onDuplicate && <button onClick={() => onDuplicate(item)} style={{ background: T.chipBg, color: T.text }} className="h-11 px-4 rounded-full flex items-center gap-2 text-sm font-semibold hover:brightness-95"><Layers size={15} /> Novo lote</button>}
              <button onClick={() => onShare(item)} style={{ background: T.chipBg, color: T.text }} className="h-11 px-4 rounded-full flex items-center gap-2 text-sm font-semibold hover:brightness-95"><Share2 size={15} /> Compartilhar</button>
              {onExcluir && <button onClick={() => setConfirmandoExclusao(true)} style={{ background: RED_SOFT, color: RED_DARK }} className="h-11 px-4 rounded-full flex items-center gap-2 text-sm font-semibold hover:brightness-95"><Trash2 size={15} /> Excluir</button>}
            </div>
          </div>

          {confirmandoExclusao && onExcluir && (
            <div className="shrink-0 px-8 pt-4">
              {bExclusao}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-8 py-6 flex flex-col gap-5">
            <div className={`grid gap-4 ${!!item.precoUnitario && podeVerValores ? "grid-cols-4" : "grid-cols-3"}`}>
              {[
                [CalendarDays, "Validade", formatarData(item.validade), corKpi],
                [Clock, "Situação", status.label, corKpi],
                [Layers, "Quantidade", item.porPeso ? `${item.quantidade || 0} kg` : `${item.quantidade || 1} un`, null],
                ...(!!item.precoUnitario && podeVerValores ? [[DollarSign, item.porPeso ? "Valor total (kg)" : "Valor total", formatarMoeda((item.quantidade || 1) * item.precoUnitario), null]] : []),
              ].map(([Ico, rot, val, cor]) => (
                <div key={rot} style={{ background: T.chipBg }} className="rounded-2xl px-5 py-4 min-w-0">
                  <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5"><Ico size={13} /> {rot}</p>
                  <p style={cor ? { color: cor } : undefined} className="text-[24px] font-extrabold mt-1.5 leading-tight break-words">{val}</p>
                </div>
              ))}
            </div>


            {bOrientacao}
            {alertaCampanha(true)}

            <div className={`grid gap-5 items-start ${temEsquerdaPC ? "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : "grid-cols-1"}`}>
              <div className={`flex-col gap-4 min-w-0 ${temEsquerdaPC ? "flex" : "hidden"}`}>
          {bPromo}
          {bPedido}
          {bDesconto}
          {bOutros}
              </div>
              <div className="flex flex-col gap-4 min-w-0">
                <div style={{ background: T.chipBg }} className="rounded-2xl px-5 py-2">
                  <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wide pt-2 pb-1">Dados do produto</p>
                  {[
                    ["Setor", `${item.setor}${item.subsetor ? " · " + item.subsetor : ""}`],
                    ["Lote", item.lote || (item.semLote ? "Sem lote" : "—")],
                    ["Alerta", [item.diasAlerta, ...(item.diasAlertaExtras || [])].sort((a, b) => b - a).join(", ") + " dias antes"],
                    ["Família", item.familia],
                    ["Localização", gerarCodigoLocalizacao(item)],
                    ["Giro", item.categoriaGiro],
                    ["Política de troca", item.politicaTroca ? (item.politicaTroca === "sem_troca" ? "Sem troca" : "Com troca") : null],
                    ["Cadastrado por", item.cadastradoPor],
                    ["Editado por", item.atualizadoPor && item.atualizadoPor !== item.cadastradoPor ? item.atualizadoPor : null],
                  ].filter(([, v]) => v).map(([r, v], i) => (
                    <div key={r} style={i ? { borderColor: T.border } : undefined} className={`flex items-baseline justify-between gap-4 py-2.5 ${i ? "border-t" : ""}`}>
                      <span style={{ color: T.subtext }} className="text-[12.5px] font-medium shrink-0">{r}</span>
                      <span className={`text-[13.5px] font-bold text-right min-w-0 break-words ${r === "Localização" ? "font-mono" : ""}`}>{v}</span>
                    </div>
                  ))}
                </div>
                {item.observacoes && (
                  <div style={{ background: T.chipBg }} className="rounded-2xl px-5 py-4">
                    <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wide mb-1">Observações</p>
                    <p className="text-sm">{item.observacoes}</p>
                  </div>
                )}
          {bHist}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>

    )}

    {confirmandoBaixa && (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div onClick={() => { setConfirmandoBaixa(false); setSubEtapa(null); }} className="absolute inset-0 bg-black/60" />
        <div style={{ background: T.card }} className="relative w-full max-w-md lg:max-w-lg lg:ring-1 lg:ring-black/10 lg:shadow-2xl rounded-t-[28px] p-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] max-h-[90dvh] overflow-y-auto sm:rounded-2xl">
          <div className="flex items-center gap-2.5 mb-4">
            <div style={{ background: RED_SOFT }} className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"><PackageX size={18} color={RED_DARK} /></div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm">Dar baixa</h3>
              <p style={{ color: T.subtext }} className="text-xs truncate">{item.nome}</p>
            </div>
          </div>

          {subEtapa === null && (
            <>
              <p style={{ color: T.subtext }} className="text-[11px] font-medium mb-2">O que foi feito com o produto?</p>
              <div className="grid grid-cols-2 gap-2">
                {MOTIVOS_BAIXA.filter((m) => m !== "Promoção aplicada" || onAplicarPromocao).map((m) => (
                  <button key={m} onClick={() => escolherMotivo(m)} style={{ background: T.chipBg, color: T.text }} className="text-xs font-medium py-3 rounded-xl">{m}</button>
                ))}
              </div>
              <button onClick={() => setConfirmandoBaixa(false)} style={{ color: T.subtext }} className="w-full text-xs py-2.5 mt-2">Cancelar</button>
            </>
          )}

          {subEtapa === "promocao" && (
            <>
              <p style={{ color: T.subtext }} className="text-[11px] font-medium mb-1.5">Qual o preço promocional? O produto continua sendo monitorado.</p>
              <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus value={precoPromoInput} onChange={(e) => setPrecoPromoInput(e.target.value)}
                placeholder="0,00" style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-xl px-3 py-3 text-sm outline-none focus:ring-2" />
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSubEtapa(null)} style={{ color: T.subtext }} className="flex-1 text-xs py-2.5">Voltar</button>
                <button onClick={() => { onAplicarPromocao(item, clampNumero(precoPromoInput, 0, 999999)); setConfirmandoBaixa(false); setSubEtapa(null); }}
                  disabled={!precoPromoInput} style={{ background: BLUE, color: "#fff" }} className="flex-[2] text-sm font-semibold py-2.5 rounded-xl">
                  Aplicar promoção
                </button>
              </div>
            </>
          )}

          {subEtapa === "quantidade" && (
            <>
              <p className="text-[12px] font-semibold mb-1.5">Baixa total do lote</p>
              <div style={{ background: T.chipBg }} className="rounded-xl px-3 py-2.5">
                <p className="text-sm font-bold">{item.quantidade ? `${item.quantidade}${item.porPeso ? " kg" : " unidade(s)"}` : "Quantidade não informada"} · {motivoPendente}</p>
                <p style={{ color: T.subtext }} className="text-[11px] mt-0.5">Validade {formatarData(item.validade)}{item.lote ? ` · lote ${item.lote}` : ""}</p>
              </div>
              <p style={{ color: T.subtext }} className="text-[10.5px] mt-1.5 leading-snug">A baixa é sempre do lote inteiro: tudo o que está lançado neste lote sai do estoque e vai para o histórico com este motivo.{item.emPromocao ? " Este lote está em promoção: a baixa registra o lote todo, não só o que sobrou." : ""}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSubEtapa(null)} style={{ color: T.subtext }} className="flex-1 text-xs py-2.5">Voltar</button>
                <button onClick={() => onBaixa(item, motivoPendente)}
                  style={{ background: RED_DARK, color: "#fff" }} className="flex-[2] text-sm font-semibold py-2.5 rounded-xl">
                  Confirmar baixa total
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}

export { ProductDetailModal };

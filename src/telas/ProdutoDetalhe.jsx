// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Package, Barcode, Percent, Tag, Clock, Layers, DollarSign, Boxes, Target, TrendingDown, ShieldAlert, Users2, ChevronRight, ShieldCheck, PackageX, Edit2, Share2, Trash2 } from "lucide-react";
import { FUNDO_MARCA } from "../TelasEntrada";
import { BLUE, BLUE_DARK, BLUE_SOFT, MOTIVOS_BAIXA, MOTIVOS_EXCLUSAO, RED, RED_DARK, RED_SOFT, gerarCodigoLocalizacao } from "../lib/constantes";
import { supaFetchAlteracoesValidade } from "../lib/dados";
import { descontoSugerido, formatarData, formatarDataHoraExtenso, formatarMoeda, getStatus, statusStyles, useValoresVisiveis } from "../lib/formatos";
import { clampNumero } from "../lib/utilidades";
import { InfoTile } from "./Analises";
import { diasTexto } from "./Home";

// ============ Modal de detalhe do produto ============
function ProductDetailModal({ T, item, outrosLotes, onTrocarLote, onClose, onEdit, onDuplicate, onBaixa, onShare, onAplicarPromocao, onPedido, podeGerirPedido, onExcluir }) {
  const podeVerValores = useValoresVisiveis();
  const [confirmandoBaixa, setConfirmandoBaixa] = useState(false);
  const [subEtapa, setSubEtapa] = useState(null); // null | 'promocao' | 'quantidadeFinal'
  const [motivoPendente, setMotivoPendente] = useState(null);
  const [precoPromoInput, setPrecoPromoInput] = useState(item.precoPromocional ? String(item.precoPromocional) : "");
  const [quantidadeFinalInput, setQuantidadeFinalInput] = useState(String(item.quantidade || 1));
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState(null);
  const [motivoExclusaoOutro, setMotivoExclusaoOutro] = useState("");
  const [editandoPedido, setEditandoPedido] = useState(false);
  const [pedidoTipo, setPedidoTipo] = useState(item.pedidoTipo || null);
  const [confirmandoRemoverPedido, setConfirmandoRemoverPedido] = useState(false);
  const salvandoPedidoRef = useRef(false);
  const [pedidoCampanha, setPedidoCampanha] = useState(item.pedidoCampanha || "");
  const [salvandoPedido, setSalvandoPedido] = useState(false);
  const valorTxt0 = (v) => (v != null ? String(v).replace(".", ",") : "");
  const [pedidoValor, setPedidoValor] = useState(valorTxt0(item.pedidoValor));
  const pedidoValorNum = (() => { const n = Number(String(pedidoValor).replace(",", ".")); return /^\d{1,4}([.,]\d{1,2})?$/.test(String(pedidoValor).trim()) && n >= 0.01 && n <= 5000 ? n : null; })();
  useEffect(() => { setEditandoPedido(false); setConfirmandoRemoverPedido(false); setPedidoTipo(item.pedidoTipo || null); setPedidoCampanha(item.pedidoCampanha || ""); setPedidoValor(valorTxt0(item.pedidoValor)); }, [item.id, item.pedidoTipo, item.pedidoCampanha, item.pedidoValor]);
  async function salvarPedido(tipo, campanha, valor) {
    if (salvandoPedidoRef.current) return;
    salvandoPedidoRef.current = true; setSalvandoPedido(true);
    const ok = await onPedido(item, tipo, campanha, valor);
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
    setQuantidadeFinalInput(String(item.quantidade || 1));
    setSubEtapa("quantidade");
  }

  return (
    <>
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/50" />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 38 }}
        style={{ background: T.card }} className="relative w-full max-w-md lg:max-w-[1120px] lg:w-[92vw] lg:h-[86vh] lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto] lg:ring-1 lg:ring-black/10 lg:shadow-2xl rounded-t-[30px] overflow-hidden flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] sm:max-h-[90vh] sm:rounded-[30px]">
        <div style={{ background: FUNDO_MARCA }} className="relative shrink-0 lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:flex lg:flex-col lg:items-center lg:px-7 lg:pt-16 lg:pb-5 lg:overflow-hidden">
          <span aria-hidden className="hidden lg:block absolute -right-20 -top-16 h-72 w-72 rounded-full bg-white/10" />
          <span aria-hidden className="hidden lg:block absolute -left-10 bottom-8 h-24 w-24 rounded-full bg-white/10" />
          {item.foto ? <img src={item.foto} alt="" className="w-full h-36 object-cover lg:relative lg:h-60 lg:w-60 lg:object-contain lg:bg-white lg:rounded-[28px] lg:p-4 lg:shadow-2xl lg:shadow-black/30" /> : (
            <div style={{ background: FUNDO_MARCA }} className="relative w-full h-28 lg:h-60 lg:w-60 lg:rounded-[28px] lg:overflow-hidden lg:ring-1 lg:ring-white/30 flex items-center justify-center"><div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} /><Package size={44} color="#fff" className="relative opacity-90" /></div>
          )}
          <button onClick={onClose} aria-label="Fechar" className="absolute top-3 left-3 h-10 w-10 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(255,255,255,.2)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.3)" }}><ArrowLeftIcon className="w-4 h-4 text-white" /></button>
          <span style={{ background: s.bg, color: s.fg }} className="absolute bottom-3 left-4 lg:bottom-auto lg:top-4 lg:left-auto lg:right-4 text-[11px] font-bold px-3 py-1 rounded-full shadow-md">{status.label}</span>
          <div className="hidden lg:block relative w-full text-center mt-6 text-white">
            <h2 className="font-extrabold text-2xl leading-tight">{item.nome}</h2>
            <p className="text-sm font-semibold mt-1 opacity-85">{diasTexto}{item.tamanho ? ` · ${item.tamanho}${item.unidadeMedida || ""}` : ""}</p>
            <p className="text-xs font-mono mt-3 opacity-70 flex items-center justify-center gap-1.5"><Barcode size={13} /> {item.barcode}</p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:p-8 lg:grid lg:grid-cols-2 lg:gap-5 lg:content-start lg:[&>*]:!mt-0">
          <h2 className="font-bold text-lg leading-tight lg:hidden">{item.nome}</h2>
          <p style={{ color: T.subtext }} className="text-sm font-medium mt-0.5 lg:hidden">{diasTexto}{item.tamanho ? ` · ${item.tamanho}${item.unidadeMedida || ""}` : ""}</p>

          <div className="hidden lg:grid lg:col-span-2 grid-cols-4 gap-3">
            {[
              ["Validade", formatarData(item.validade), s.bg],
              ["Situação", diasTexto, s.bg],
              ["Setor", `${item.setor}${item.subsetor ? " · " + item.subsetor : ""}`, null],
              ["Lote", item.lote || (item.semLote ? "Sem lote" : "—"), null],
            ].map(([rot, val, cor]) => (
              <div key={rot} style={{ background: T.chipBg }} className="rounded-2xl px-4 py-3.5 min-w-0">
                <p style={{ color: T.subtext }} className="text-[10px] font-bold uppercase tracking-wide">{rot}</p>
                <p style={cor ? { color: cor } : undefined} className="text-[17px] font-extrabold mt-1 leading-tight break-words">{val}</p>
              </div>
            ))}
          </div>

          {/* Dados essenciais em grade simples — sem elementos decorativos */}
          <div style={{ background: T.chipBg }} className="rounded-2xl mt-3.5 p-3.5 grid grid-cols-2 gap-3 lg:hidden">
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

          {item.emPromocao && (
            <div style={{ background: BLUE_SOFT }} className="rounded-2xl px-3.5 py-3 mt-3 flex items-center gap-2.5">
              <Percent size={15} color={BLUE} />
              <div>
                <p style={{ color: BLUE_DARK }} className="text-xs font-bold">Em promoção</p>
                <p style={{ color: BLUE }} className="text-[11px]">{formatarMoeda(item.precoPromocional)} <span className="line-through opacity-60">{formatarMoeda(item.precoUnitario)}</span></p>
              </div>
            </div>
          )}

          {(item.pedidoTipo || onPedido) && (
            <div style={{ background: T.chipBg }} className="rounded-2xl px-3.5 py-3 mt-3 lg:col-span-2">
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
                  <input value={pedidoCampanha} onChange={(e) => setPedidoCampanha(e.target.value.toUpperCase().replace(/[^A-Z0-9./ -]/g, "").slice(0, 20))}
                    placeholder="Número da campanha (opcional)" inputMode="text" maxLength={20} aria-label="Número da campanha"
                    style={{ background: T.card, color: T.text, borderColor: T.inputBorder }} className="w-full min-w-0 mt-2 border rounded-xl px-3 py-2 text-xs outline-none" />
                  <input value={pedidoValor} onChange={(e) => setPedidoValor(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 8))}
                    placeholder="Valor pedido em R$ (obrigatório)" inputMode="decimal" maxLength={8} aria-label="Valor pedido em reais"
                    style={{ background: T.card, color: T.text, borderColor: T.inputBorder }} className="w-full min-w-0 mt-2 border rounded-xl px-3 py-2 text-xs outline-none" />
                  {pedidoTipo && pedidoValorNum == null && <p role="alert" style={{ color: RED_DARK }} className="text-[10.5px] font-semibold mt-1">Informe o valor pedido (de 0,01 a 5000, com até 2 casas, ex.: 5,90).</p>}
                  <p style={{ color: T.subtext }} className="text-[10px] mt-1">O valor é só uma sugestão: depende da central liberar. Campanha: letras sem acento, números, . / - e até 20 caracteres.{!item.pedidoTipo && " Atenção: depois de salvar, este lote fica travado (sem editar, somar ou excluir); só o encarregado do setor destrava."}</p>
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={() => { setEditandoPedido(false); setConfirmandoRemoverPedido(false); setPedidoTipo(item.pedidoTipo || null); setPedidoCampanha(item.pedidoCampanha || ""); setPedidoValor(valorTxt0(item.pedidoValor)); }} style={{ color: T.subtext }} className="flex-1 text-[11px] py-1.5">Cancelar</button>
                    {item.pedidoTipo && podeGerirPedido && (confirmandoRemoverPedido
                      ? <button onClick={() => salvarPedido(null, null, null)} disabled={salvandoPedido} style={{ background: RED_DARK, color: "#fff" }} className="flex-1 text-[11px] font-semibold py-1.5 rounded-xl disabled:opacity-40">Confirmar remoção</button>
                      : <button onClick={() => setConfirmandoRemoverPedido(true)} style={{ color: RED_DARK }} className="flex-1 text-[11px] font-semibold py-1.5">Remover</button>)}
                    <button onClick={() => salvarPedido(pedidoTipo, pedidoCampanha, pedidoValorNum)} disabled={salvandoPedido || !pedidoTipo || pedidoValorNum == null} style={{ background: BLUE_DARK, color: "#fff" }} className="flex-1 text-[11px] font-semibold py-1.5 rounded-xl disabled:opacity-40">{salvandoPedido ? "Salvando…" : "Salvar"}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {desconto && !item.emPromocao && (
            <div style={{ background: RED_SOFT }} className="rounded-2xl px-3.5 py-3 mt-3">
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
          )}

          <div className="grid grid-cols-2 gap-2.5 mt-3.5 lg:col-span-2 lg:grid-cols-3">
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
          {outrosLotes && outrosLotes.length > 0 && (
            <div style={{ background: T.chipBg }} className="rounded-2xl mt-3.5 p-3 lg:col-span-2">
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
          )}

          {/* Trilha imutável: histórico de alterações de validade deste código — não pode ser apagado, nem por aqui */}
          {historicoValidade && historicoValidade.length > 0 && (
            <div style={{ background: "#FFF8E8", borderColor: "#F0DDA6" }} className="rounded-2xl mt-3.5 p-3 border lg:col-span-2">
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
          )}

        </div>
        <div style={{ borderColor: T.border, background: T.card }} className="shrink-0 max-h-[55%] lg:max-h-none lg:col-start-1 lg:row-start-2 overflow-y-auto px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t">
          {onBaixa && (
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => setConfirmandoBaixa(true)}
            style={{ background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)` }}
            className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-red-900/20">
            <PackageX className="w-5 h-5 text-white" />
            <span className="text-white font-bold text-sm">Registrar ação</span>
          </motion.button>
          )}

          <div className="flex items-center justify-around mt-3.5 lg:grid lg:grid-cols-2 lg:gap-2 lg:mt-3">
            {onEdit && (
              <button onClick={() => onEdit(item)} className="flex flex-col items-center gap-1.5 lg:flex-row lg:gap-2.5 lg:rounded-2xl lg:px-2.5 lg:py-2 lg:border lg:border-black/10 lg:hover:bg-black/[.03]">
                <div style={{ background: T.chipBg }} className="h-11 w-11 rounded-2xl flex items-center justify-center"><Edit2 size={16} style={{ color: T.text }} /></div>
                <span style={{ color: T.subtext }} className="text-[10px] font-medium">Editar</span>
              </button>
            )}
            {onDuplicate && (
              <button onClick={() => onDuplicate(item)} className="flex flex-col items-center gap-1.5 lg:flex-row lg:gap-2.5 lg:rounded-2xl lg:px-2.5 lg:py-2 lg:border lg:border-black/10 lg:hover:bg-black/[.03]">
                <div style={{ background: T.chipBg }} className="h-11 w-11 rounded-2xl flex items-center justify-center"><Layers size={16} style={{ color: T.text }} /></div>
                <span style={{ color: T.subtext }} className="text-[10px] font-medium">Novo lote</span>
              </button>
            )}
            <button onClick={() => onShare(item)} className="flex flex-col items-center gap-1.5 lg:flex-row lg:gap-2.5 lg:rounded-2xl lg:px-2.5 lg:py-2 lg:border lg:border-black/10 lg:hover:bg-black/[.03]">
              <div style={{ background: T.chipBg }} className="h-11 w-11 rounded-2xl flex items-center justify-center"><Share2 size={16} style={{ color: T.text }} /></div>
              <span style={{ color: T.subtext }} className="text-[10px] font-medium">Compartilhar</span>
            </button>
            {onExcluir && (
            <button onClick={() => setConfirmandoExclusao(true)} className="flex flex-col items-center gap-1.5 lg:flex-row lg:gap-2.5 lg:rounded-2xl lg:px-2.5 lg:py-2 lg:border lg:border-black/10 lg:hover:bg-black/[.03]">
              <div style={{ background: RED_SOFT }} className="h-11 w-11 rounded-2xl flex items-center justify-center"><Trash2 size={16} color={RED_DARK} /></div>
              <span style={{ color: RED_DARK }} className="text-[10px] font-medium">Excluir</span>
            </button>
            )}
          </div>

          {confirmandoExclusao && (
            <div style={{ background: RED_SOFT }} className="mt-2.5 rounded-xl p-2.5">
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
                  onClick={() => onExcluir(item, motivoExclusao === "Outro" ? (motivoExclusaoOutro.trim() || "Outro") : motivoExclusao)}
                  disabled={!motivoExclusao || (motivoExclusao === "Outro" && !motivoExclusaoOutro.trim())}
                  style={{ background: RED_DARK, color: "#fff" }} className="flex-1 text-[11px] font-semibold py-1.5 rounded-xl disabled:opacity-40">
                  Sim, excluir
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>

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
              <p className="text-[11px] font-medium mb-1.5">
                Quantas {item.porPeso ? "kg" : "unidade(s)"} de <b>{motivoPendente === "Vencido" || (motivoPendente || "").toLowerCase().includes("venc") ? "vencido" : "baixa"}</b> vão ser dadas?
              </p>
              <p style={{ color: T.subtext }} className="text-[10px] mb-1.5">A quantidade que venceu pode ser diferente da que foi cadastrada/vendida — confira antes de confirmar.</p>
              <input type="number" inputMode="decimal" min={item.porPeso ? 0.001 : 1} step={item.porPeso ? "0.001" : "1"} max={item.quantidade || 99999} autoFocus value={quantidadeFinalInput}
                onChange={(e) => setQuantidadeFinalInput(item.porPeso ? e.target.value.replace(/[^\d.]/g, "") : e.target.value.replace(/[^\d]/g, ""))}
                style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-xl px-3 py-3 text-sm outline-none focus:ring-2" />
              <p style={{ color: T.subtext }} className="text-[10px] mt-1">de {item.quantidade}{item.porPeso ? "kg" : " unidade(s)"} cadastrada(s)</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSubEtapa(null)} style={{ color: T.subtext }} className="flex-1 text-xs py-2.5">Voltar</button>
                <button onClick={() => onBaixa(item, motivoPendente, item.porPeso ? clampNumero(quantidadeFinalInput, 0.001, item.quantidade || 9999) : clampNumero(quantidadeFinalInput, 1, item.quantidade || 99999))}
                  disabled={!quantidadeFinalInput || Number(quantidadeFinalInput) <= 0}
                  style={{ background: RED_DARK, color: "#fff" }} className="flex-[2] text-sm font-semibold py-2.5 rounded-xl disabled:opacity-40">
                  Confirmar baixa
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

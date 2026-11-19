// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState } from "react";
import { motion } from "framer-motion";
import { Package, Plus, Trash2, ChevronRight } from "lucide-react";
import { FUNDO_MARCA } from "../TelasEntrada";
import { Thumb, trocarPorBipi } from "./ItemCards";
import { IconeNivel } from "./IconeNivel";
import { BIPI_SEM_FOTO, BLUE, BLUE_DARK, BLUE_SOFT, RED, RED_SOFT, semFotoUtil } from "../lib/constantes";
import { formatarData, formatarMoeda } from "../lib/formatos";

// ===== Peças novas das páginas internas (celular): mesmo palco, vidro e cartões da tela inicial =====
function PilulasPalco({ itens }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
      {itens.map(([rot, n, cor]) => (
        <div key={rot} className="rounded-2xl py-2.5 px-1 text-center" style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.2)" }}>
          <p className="text-[1.3125rem] font-extrabold leading-none tabular-nums">{n}</p>
          <p className="text-[0.6562rem] font-semibold text-white/85 mt-1.5 flex items-center justify-center gap-1.5">{cor && <span className="h-2 w-2 rounded-full" style={{ background: cor, boxShadow: `0 0 8px ${cor}` }} />}{rot}</p>
        </div>
      ))}
    </div>
  );
}

function ValorPalco({ rotulo, valor }) {
  const tam = Math.max(22, Math.min(36, Math.floor(260 / (String(valor).length * 0.6))));
  return (
    <div className="mb-3">
      <p className="text-[0.6562rem] font-bold uppercase tracking-[.14em] text-white/70">{rotulo}</p>
      <p className="font-extrabold leading-tight tabular-nums mt-0.5 whitespace-nowrap" style={{ fontSize: tam }}>{valor}</p>
    </div>
  );
}

function CartaoNovo({ T, titulo, Icone, cor, children, className = "", idx = 0 }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 26, delay: Math.min(idx * 0.05, 0.3) }}
      style={{ background: T.card }} className={`rounded-[24px] shadow-lg shadow-black/5 p-4 mb-3.5 ${className}`}>
      {titulo && (
        <div className="flex items-center gap-2.5 mb-3">
          {Icone && <span className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: T.chipBg }}><Icone size={16} color={cor || BLUE_DARK} /></span>}
          <p style={{ color: T.text }} className="text-[0.8125rem] font-extrabold leading-tight">{titulo}</p>
        </div>
      )}
      {children}
    </motion.section>
  );
}

function BarraRank({ T, pos, rotulo, pct, texto, cor = RED }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span style={{ background: T.chipBg, color: T.subtext }} className="h-6 w-6 rounded-full text-[0.6562rem] font-extrabold flex items-center justify-center shrink-0">{pos}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><span style={{ color: T.text }} className="text-[0.7812rem] font-bold truncate">{rotulo}</span><span style={{ color: T.subtext }} className="text-[0.7188rem] font-bold tabular-nums shrink-0">{texto}</span></div>
        <div style={{ background: T.chipBg }} className="h-2 rounded-full overflow-hidden mt-1"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(2, Math.min(100, pct))}%` }} transition={{ duration: 0.8, ease: "easeOut" }} style={{ background: cor }} className="h-full rounded-full" /></div>
      </div>
    </div>
  );
}

function FaixaChips({ T, opcoes, valor, onChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-3.5">
      {opcoes.map(([id, rot, n]) => {
        const ativo = valor === id;
        return (
          <motion.button key={id} whileTap={{ scale: 0.94 }} onClick={() => onChange(id)} aria-pressed={ativo}
            style={ativo ? { background: BLUE_DARK, color: "#fff" } : { background: T.card, color: T.text }} className="shrink-0 rounded-full px-3.5 py-2 text-xs font-bold shadow-sm flex items-center gap-1.5">
            {rot}{n != null && <span style={ativo ? { background: "rgba(255,255,255,.22)" } : { background: T.chipBg, color: T.subtext }} className="text-[0.6562rem] rounded-full px-1.5 min-w-[20px] text-center tabular-nums">{n}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

function EstadoVazioNovo({ T, Icone, titulo, texto }) {
  return (
    <div className="text-center py-12 px-6">
      <div style={{ background: T.card }} className="h-16 w-16 rounded-[22px] mx-auto flex items-center justify-center mb-3 shadow-md shadow-black/5"><Icone size={26} color={BLUE} /></div>
      <p style={{ color: T.text }} className="font-extrabold text-[0.9375rem]">{titulo}</p>
      {texto && <p style={{ color: T.subtext }} className="text-xs mt-1">{texto}</p>}
    </div>
  );
}

// Cartão de produto em grade (celular): foto grande, situação, nome e validade
function CartaoGrade({ T, item, idx = 0, onOpenDetail }) {
  const c = corDoNivel(item.status?.level);
  return (
    <motion.button initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 26, delay: Math.min(idx * 0.03, 0.3) }}
      whileTap={{ scale: 0.97 }} onClick={() => onOpenDetail(item)} style={{ background: T.card }} className="rounded-[24px] shadow-lg shadow-black/5 text-left overflow-hidden">
      <div className="relative">
        {!semFotoUtil(item.foto) ? <img src={item.foto} alt="" onError={trocarPorBipi} className="w-full h-28 object-cover" /> : (
          <div style={{ background: FUNDO_MARCA }} className="relative w-full h-28 flex items-center justify-center"><div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "16px 16px" }} /><img src={BIPI_SEM_FOTO} alt="" className="relative h-24 object-contain" /></div>
        )}
        <span style={{ background: c.soft, color: c.cor }} className="absolute top-2 left-2 text-[0.6875rem] font-bold rounded-full px-2.5 py-1 shadow-sm inline-flex items-center gap-1 max-w-[calc(100%-1rem)]"><IconeNivel level={item.status?.level} size={11} />{item.status?.label}</span>
      </div>
      <div className="p-3">
        <p style={{ color: T.text }} className="font-extrabold text-[0.8125rem] leading-tight line-clamp-2 min-h-[32px]">{item.nome}</p>
        <p style={{ color: T.subtext }} className="text-[0.75rem] mt-1.5 truncate">{item.setor}</p>
        <p style={{ color: T.text }} className="text-[0.7188rem] font-bold mt-0.5">{formatarData(item.validade)} <span style={{ color: T.subtext }} className="font-medium">· {item.quantidade || 1} un</span></p>
      </div>
    </motion.button>
  );
}

// Linha de produto (celular): foto, nome, validade, quantidade e situação. Serve para produto único, grupo de lotes e produto sem validade.
function corDoNivel(level) {
  if (level === "expired") return { cor: "#E31E24", soft: RED_SOFT };
  if (level === "alert") return { cor: "#C2760C", soft: "#FCF0DD" };
  if (level === "warning") return { cor: "#C2760C", soft: "#FCF0DD" };
  return { cor: "#1F9D55", soft: "#E4F7EC" };
}

function LinhaProduto({ T, item, idx = 0, lotes, totalQuantidade, piorStatus, semValidade, podeVerValores, mostrarSetor, onOpenDetail, onExcluir }) {
  const [aberto, setAberto] = useState(false);
  const agrupado = !!lotes;
  const c = semValidade ? { cor: BLUE, soft: BLUE_SOFT } : corDoNivel(piorStatus?.level);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 26, delay: Math.min(idx * 0.035, 0.3) }}
      style={{ background: T.card, border: semValidade ? `1.5px dashed ${T.inputBorder}` : "none" }} className="rounded-[22px] shadow-md shadow-black/5 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <button onClick={() => (agrupado ? setAberto((v) => !v) : onOpenDetail(item))} className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <span className="relative shrink-0">
            <Thumb foto={item.foto} size={54} rounded="rounded-[18px]" />
            {!semValidade && <span aria-hidden className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2" style={{ background: c.cor, borderColor: T.card }} />}
          </span>
          <span className="min-w-0 flex-1">
            <span style={{ color: T.text }} className="block font-bold text-[0.875rem] leading-tight line-clamp-2">{item.nome}</span>
            <span style={{ color: T.subtext }} className="block text-[0.7188rem] mt-1">
              {mostrarSetor && !semValidade ? `${item.setor} · ` : ""}{semValidade ? "Sem validade lançada" : agrupado ? `${lotes.length} datas · ${totalQuantidade} un` : `${formatarData(item.validade)} · ${item.quantidade || 1} un`}
            </span>
            {!semValidade && (agrupado ? lotes.some((l) => l.pedidoTipo) : item.pedidoTipo) && (
              <span style={{ background: "#E6F5EC", color: "#1F7A45" }} className="inline-block mt-1 text-[0.6875rem] font-bold rounded-full px-2 py-0.5">
                {agrupado ? `${lotes.filter((l) => l.pedidoTipo).length}/${lotes.length} com pedido` : `${item.pedidoTipo === "preco_direto" ? "Preço direto pedido" : "Promoção pedida"}${item.pedidoCampanha ? ` · ${item.pedidoCampanha}` : ""}`}
              </span>
            )}
            {!semValidade && podeVerValores && !agrupado && Number(item.precoUnitario) > 0 && (
              <span style={{ color: T.subtext }} className="block text-[0.75rem]">{formatarMoeda((Number(item.quantidade) || 1) * Number(item.precoUnitario))}</span>
            )}
          </span>
        </button>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {semValidade ? (
            <button onClick={() => onOpenDetail(item)} style={{ background: BLUE_DARK, color: "#fff" }} className="text-[0.75rem] font-bold rounded-full px-3 py-1.5 flex items-center gap-1"><Plus size={12} /> Lançar</button>
          ) : (
            <span style={{ background: c.soft, color: c.cor }} className="text-[0.6562rem] font-bold rounded-full px-2.5 py-1 whitespace-nowrap inline-flex items-center gap-1"><IconeNivel level={piorStatus?.level} size={11} />{piorStatus?.label}</span>
          )}
          {onExcluir && <button onClick={onExcluir} aria-label="Excluir produto" style={{ color: T.subtext }} className="h-7 w-7 rounded-full flex items-center justify-center"><Trash2 size={14} /></button>}
          {agrupado && <ChevronRight size={15} color={T.subtext} style={{ transform: aberto ? "rotate(90deg)" : "none", transition: "transform .2s" }} />}
        </div>
      </div>
      {agrupado && aberto && (
        <div className="px-3 pb-3 flex flex-col gap-1.5">
          {lotes.map((l) => { const cl = corDoNivel(l.status.level); return (
            <button key={l.id} onClick={() => onOpenDetail(l)} style={{ background: T.chipBg }} className="w-full text-left rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2">
              <span style={{ color: T.text }} className="text-[0.7812rem] font-bold">{formatarData(l.validade)} <span style={{ color: T.subtext }} className="font-medium">· {l.lote ? `Lote ${l.lote} · ` : ""}{l.quantidade || 1} un</span>{l.pedidoTipo ? <span style={{ color: "#1F7A45" }} className="text-[0.6875rem] font-bold"> · pedido{l.pedidoCampanha ? ` ${l.pedidoCampanha}` : ""} ✓</span> : <span style={{ color: T.subtext }} className="text-[0.6875rem] font-medium"> · sem pedido</span>}</span>
              <span style={{ background: cl.soft, color: cl.cor }} className="text-[0.6562rem] font-bold rounded-full px-2.5 py-1">{l.status.label}</span>
            </button>
          ); })}
        </div>
      )}
    </motion.div>
  );
}

export { BarraRank, CartaoGrade, CartaoNovo, EstadoVazioNovo, FaixaChips, LinhaProduto, PilulasPalco, ValorPalco, corDoNivel };

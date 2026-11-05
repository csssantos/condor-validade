// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState } from "react";
import { motion } from "framer-motion";
import { X as CloseIcon, Package, MapPin, Barcode, Percent, ShieldAlert, ChevronRight, Calendar } from "lucide-react";
import { EstadoVazioNovo } from "./ui";
import { BLUE, BLUE_DARK, BLUE_SOFT, RED_DARK, RED_SOFT, gerarCodigoLocalizacao } from "../lib/constantes";
import { formatarData, formatarMoeda, statusStyles, sugestaoDesconto, useValoresVisiveis } from "../lib/formatos";
import { useDesktop } from "../lib/tela";
import { diasTexto } from "../telas/Home";

function FichaFiltro({ children, onRemove }) {
  return (
    <span style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="text-[11.5px] font-bold pl-2.5 pr-1.5 py-1 rounded-full flex items-center gap-1">
      {children}
      <button onClick={onRemove} aria-label="Remover filtro" className="h-4 w-4 rounded-full flex items-center justify-center" style={{ background: "rgba(11,79,158,.15)" }}><CloseIcon size={9} color={BLUE_DARK} /></button>
    </span>
  );
}

function GrupoFiltro({ T, titulo, opcoes, valor, onChange }) {
  return (
    <div className="mb-5">
      <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-[.1em] mb-2">{titulo}</p>
      <div className="flex gap-1.5 flex-wrap">
        {opcoes.map(([id, rot]) => (
          <motion.button key={id} whileTap={{ scale: 0.94 }} onClick={() => onChange(id)} aria-pressed={valor === id}
            style={valor === id ? { background: BLUE_DARK, color: "#fff" } : { background: T.chipBg, color: T.text }} className="text-[12.5px] font-bold px-3.5 py-2 rounded-full">{rot}</motion.button>
        ))}
      </div>
    </div>
  );
}

function StatCard({ T, label, value, color }) {
  return (
    <div style={{ background: T.card }} className="rounded-[22px] px-3 py-3.5 shadow-lg shadow-black/5 text-center">
      <p style={{ color }} className="text-2xl font-extrabold leading-none tabular-nums">{value}</p>
      <p style={{ color: T.subtext }} className="text-[11px] mt-1.5 font-bold">{label}</p>
    </div>
  );
}

function EmptyState({ T, hasItems }) {
  const ehDesktop = useDesktop();
  return (
    <EstadoVazioNovo T={T} Icone={Package} titulo={hasItems ? "Nada encontrado" : "Nenhum produto monitorado"}
      texto={hasItems ? "Ajuste a busca ou os filtros." : (ehDesktop ? "Os produtos aparecem aqui quando a equipe cadastra os alertas de validade pelo celular." : 'Toque em "Bipar produto" para começar a cadastrar alertas de validade.')} />
  );
}

function Thumb({ foto, size = 44, rounded = "rounded-xl" }) {
  return foto ? (
    <img src={foto} alt="" style={{ width: size, height: size }} className={`${rounded} object-cover shrink-0`} />
  ) : (
    <div style={{ width: size, height: size, background: BLUE_SOFT }} className={`${rounded} flex items-center justify-center shrink-0`}>
      <Package size={size * 0.42} color={BLUE} />
    </div>
  );
}

function ItemCard({ T, item, onOpenDetail }) {
  const podeVerValores = useValoresVisiveis();
  const s = statusStyles(item.status.level);
  const desconto = sugestaoDesconto(item.status.d, item.precoUnitario);
  let diasTexto;
  if (item.status.level === "expired") diasTexto = `Vencido há ${Math.abs(item.status.d)} dia${Math.abs(item.status.d) === 1 ? "" : "s"}`;
  else if (item.status.d === 0) diasTexto = "Vence hoje";
  else diasTexto = `Vence em ${item.status.d} dia${item.status.d === 1 ? "" : "s"}`;

  return (
    <button onClick={() => onOpenDetail(item)} style={{ background: T.card, borderColor: T.border }} className="rounded-2xl p-3.5 shadow-lg shadow-black/5 border text-left w-full active:scale-[0.99] transition">
      <div className="flex items-start gap-3">
        <Thumb foto={item.foto} size={48} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{item.nome}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span style={{ color: T.subtext }} className="inline-flex items-center gap-1 text-[11px]"><MapPin size={11} /> {item.setor}</span>
            <span style={{ color: T.subtext }} className="text-[11px]">•</span>
            <span style={{ color: T.subtext }} className="inline-flex items-center gap-1 text-[11px] font-mono"><Barcode size={11} /> {item.barcode}</span>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span style={{ background: s.bg, color: s.fg }} className="text-[10px] font-bold px-2 py-1 rounded-md tracking-wide">{item.status.label}</span>
            <span className="text-[11px] font-medium">{diasTexto}</span>
            {desconto && (
              <span style={{ background: RED_SOFT, color: RED_DARK }} className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-1 rounded-md">
                <Percent size={10} /> {desconto.pct}% sugerido
              </span>
            )}
            {item.politicaTroca === "sem_troca" && (
              <span style={{ background: "#4A1013", color: "#FFD5D8" }} className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-1 rounded-md">
                <ShieldAlert size={10} /> SEM TROCA
              </span>
            )}
          </div>
          <p style={{ color: T.subtext }} className="text-[10px] mt-1.5">
            Validade {formatarData(item.validade)} · alerta {[item.diasAlerta, ...(item.diasAlertaExtras || [])].sort((a, b) => b - a).join("/")}d
            {item.quantidade ? ` · qtd ${item.quantidade}${item.porPeso ? "kg" : ""}` : ""}
            {item.precoUnitario && podeVerValores ? ` · ${formatarMoeda(item.precoUnitario)}${item.porPeso ? "/kg" : "/un"}` : ""}
          </p>
          {gerarCodigoLocalizacao(item) && <p style={{ color: T.subtext }} className="text-[10px] mt-0.5 font-mono flex items-center gap-1"><MapPin size={9} /> {gerarCodigoLocalizacao(item)}</p>}
          {item.cadastradoPor && <p style={{ color: T.subtext }} className="text-[10px] mt-0.5">Cadastrado por {item.cadastradoPor}</p>}
        </div>
        <ChevronRight size={16} color={T.subtext} className="shrink-0 mt-1" />
      </div>
    </button>
  );
}

function ItemCardAgrupado({ T, base, lotes, totalQuantidade, piorStatus, onOpenDetail }) {
  const [aberto, setAberto] = useState(false);
  const s = statusStyles(piorStatus.level);
  const temDeposito = lotes.some((l) => l.local === "deposito");
  const temLoja = lotes.some((l) => (l.local || "loja") === "loja");

  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl shadow-lg shadow-black/5 border overflow-hidden">
      <button onClick={() => setAberto((v) => !v)} className="w-full text-left p-3.5">
        <div className="flex items-start gap-3">
          <Thumb foto={base.foto} size={48} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{base.nome}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span style={{ color: T.subtext }} className="inline-flex items-center gap-1 text-[11px]"><MapPin size={11} /> {base.setor}</span>
              <span style={{ color: T.subtext }} className="text-[11px]">•</span>
              <span style={{ color: T.subtext }} className="inline-flex items-center gap-1 text-[11px] font-mono"><Barcode size={11} /> {base.barcode}</span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span style={{ background: s.bg, color: s.fg }} className="text-[10px] font-bold px-2 py-1 rounded-md tracking-wide">{piorStatus.label}</span>
              <span style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="text-[10px] font-bold px-2 py-1 rounded-md">{lotes.length} datas diferentes</span>
            </div>
            <p style={{ color: T.subtext }} className="text-[10px] mt-1.5">Total {totalQuantidade} unidade{totalQuantidade !== 1 ? "s" : ""} nesse produto</p>
          </div>
          <ChevronRight size={16} color={T.subtext} className={`shrink-0 mt-1 transition-transform ${aberto ? "rotate-90" : ""}`} />
        </div>
      </button>
      {aberto && (
        <div style={{ borderColor: T.border }} className="border-t px-3.5 py-2.5 flex flex-col gap-2">
          {lotes.map((l) => {
            const sl = statusStyles(l.status.level);
            return (
              <button key={l.id} onClick={() => onOpenDetail(l)} style={{ background: T.chipBg }} className="w-full text-left rounded-xl p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span style={{ background: sl.bg, color: sl.fg }} className="text-[9px] font-bold px-1.5 py-0.5 rounded">{sl.label}</span>
                    <span className="text-xs font-semibold">{formatarData(l.validade)}</span>
                    <span style={{ color: T.subtext }} className="text-[10px]">· {l.quantidade || 1} un</span>
                  </div>
                  {gerarCodigoLocalizacao(l) && <p style={{ color: T.subtext }} className="text-[10px] mt-0.5 font-mono">{gerarCodigoLocalizacao(l)}</p>}
                </div>
                <ChevronRight size={14} color={T.subtext} className="shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemCardGrid({ T, item, onOpenDetail }) {
  const s = statusStyles(item.status.level);
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={() => onOpenDetail(item)} style={{ background: T.card }}
      className="rounded-2xl overflow-hidden shadow-lg shadow-black/5 text-left">
      <div className="relative">
        {item.foto ? <img src={item.foto} alt="" className="w-full h-24 object-cover" /> : (
          <div style={{ background: BLUE_SOFT }} className="w-full h-24 flex items-center justify-center"><Package size={26} color={BLUE} /></div>
        )}
        <span style={{ background: s.bg, color: s.fg }} className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md">{item.status.label}</span>
      </div>
      <div className="p-2.5">
        <p className="font-semibold text-xs truncate">{item.nome}</p>
        <p style={{ color: T.subtext }} className="text-[10px] mt-0.5 truncate flex items-center gap-1"><MapPin size={9} /> {item.setor}</p>
        <p style={{ color: T.subtext }} className="text-[10px] mt-1 flex items-center gap-1"><Calendar size={9} /> {formatarData(item.validade)}</p>
      </div>
    </motion.button>
  );
}

export { EmptyState, FichaFiltro, GrupoFiltro, ItemCard, ItemCardAgrupado, ItemCardGrid, StatCard, Thumb };

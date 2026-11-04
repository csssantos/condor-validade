// Avisos (toasts) do app, refeitos no estilo da tela de carregamento: cartão com o degradê da marca,
// três bolinhas animadas e a cor do status SÓ nos detalhes (bolinha, selo e barra de tempo) — sem caixa vermelha.
import React, { useEffect, useState } from "react";
import { Check, X, AlertTriangle, Info } from "lucide-react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { FUNDO_MARCA } from "./TelasEntrada";

// cor = bolinha e barra; luz = rótulo (mais clara, para ler sobre o azul)
export const TONS = {
  ok: { cor: "#34C77B", luz: "#8CF0BC", rotulo: "Pronto", ms: 3200 },
  info: { cor: "#4CC9F0", luz: "#A8E8FA", rotulo: "Informação", ms: 3500 },
  carregando: { cor: "#6AA9FF", luz: "#B5D2FF", rotulo: "Aguarde", ms: 6000 },
  aviso: { cor: "#F5A524", luz: "#FFD58F", rotulo: "Atenção", ms: 4500 },
  erro: { cor: "#FF5A5F", luz: "#FFB8BA", rotulo: "Não deu certo", ms: 5500 },
};
// mensagem longa fica mais tempo (≈ 1 s a cada 18 caracteres), no máximo 12 s
export function duracaoAviso(msg, tom) {
  const base = (TONS[tom] || TONS.ok).ms;
  return Math.min(12000, Math.max(base, 1800 + String(msg || "").length * 55));
}

// Os pontos de chamada usam showToast(msg, tom?): tom pode ser "ok" (forçado), "info", "carregando", "aviso", "erro"
// ou o antigo "warn" (vira erro se o texto for de falha, senão aviso). Sem tom: o texto decide.
// Validação de formulário ("Preencha…", "Escolha…", "No máximo…") é AVISO; falha/recusa é ERRO.
const RE_ERRO = /não foi possível|nao foi possivel|\berro\b|inválid|invalid|falh|recusad|não (foram )?aceit|sem conexão com|algo deu errado|não encontrad|não consegui|não deu|sem permiss|não tem permiss|você não pode|só pode agir|não é do seu|já existe|não suporta/;
export function classificarTom(msg, tom) {
  if (tom === "ok") return "ok";
  if (TONS[tom]) return tom;
  const m = String(msg || "").toLowerCase();
  if (RE_ERRO.test(m)) return "erro";
  if (tom === "warn") return "aviso";
  if (/gerando|sincronizando|aguarde|enviando|carregando/.test(m)) return "carregando";
  if (/copiad|copiei|coletad|salva na pasta|baixad|imagem pronta/.test(m)) return "info";
  return "ok";
}
export const DESFAZER_MS = 5000;

// ---- visual novo (2026-11-04): mesma linguagem da tela de carregamento ----
// bolinhas subindo no fundo do cartão, "orbe" do status com anel que pulsa, três pontinhos que pulam e botão X para fechar antes do tempo.
const BOLHAS = [
  { x: 8, tam: 5, dur: 3.4, atraso: 0 }, { x: 24, tam: 3, dur: 4.2, atraso: 1.1 }, { x: 41, tam: 6, dur: 3.8, atraso: 0.5 },
  { x: 58, tam: 4, dur: 4.6, atraso: 1.7 }, { x: 74, tam: 5, dur: 3.5, atraso: 0.9 }, { x: 90, tam: 3, dur: 4.1, atraso: 0.2 },
];
function Bolhas({ cor }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {BOLHAS.map((b, k) => (
        <motion.span key={k} className="absolute rounded-full" style={{ left: `${b.x}%`, bottom: -8, width: b.tam, height: b.tam, background: k % 3 === 0 ? cor : "rgba(255,255,255,0.7)", opacity: 0 }}
          animate={{ y: [0, -96], opacity: [0, 0.55, 0.55, 0] }} transition={{ duration: b.dur, repeat: Infinity, delay: b.atraso, ease: "linear" }} />
      ))}
    </div>
  );
}
function Pontinhos({ animar }) {
  return (
    <span aria-hidden className="flex items-center gap-1">
      {[0, 1, 2].map((k) => (
        <motion.span key={k} className="block h-1.5 w-1.5 rounded-full bg-white" style={{ opacity: animar ? 0.5 : 0.7 }}
          animate={animar ? { y: [0, -4, 0], opacity: [0.5, 1, 0.5] } : undefined} transition={animar ? { duration: 0.7, repeat: Infinity, delay: k * 0.12 } : undefined} />
      ))}
    </span>
  );
}
function Orbe({ tom, cor, animar }) {
  const Icone = { ok: Check, erro: X, aviso: AlertTriangle, info: Info }[tom];
  return (
    <span aria-hidden className="relative shrink-0 flex items-center justify-center" style={{ width: 38, height: 38 }}>
      {animar && <motion.span className="absolute inset-0 rounded-full" style={{ background: cor }} initial={{ scale: 0.8, opacity: 0.5 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />}
      <motion.span className="relative flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: cor, color: "#082F5E" }}
        initial={animar ? { scale: 0.4, rotate: -20 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 320, damping: 15 }}>
        {tom === "carregando"
          ? <motion.span className="block rounded-full" style={{ width: 18, height: 18, border: "3px solid rgba(8,47,94,0.25)", borderTopColor: "#082F5E" }} animate={animar ? { rotate: 360 } : undefined} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />
          : Icone ? <Icone size={19} strokeWidth={3} /> : null}
      </motion.span>
    </span>
  );
}

const CARTAO = { background: FUNDO_MARCA, boxShadow: "0 14px 34px rgba(6,28,58,0.38)", border: "1px solid rgba(255,255,255,0.14)", isolation: "isolate" };

function BotaoFechar({ onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label="Fechar aviso" className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-full pointer-events-auto active:scale-90 transition-transform"
      style={{ width: 36, height: 36, color: "#FFFFFF", background: "rgba(255,255,255,0.14)" }}><span aria-hidden className="absolute -inset-1" /><X size={16} strokeWidth={2.6} /></button>
  );
}

export function AvisoToast({ msg, tom, id, elevar, onFechar }) {
  const reduzir = useReducedMotion();
  const [saindoId, setSaindoId] = useState(null);
  const saindo = saindoId !== null && saindoId === (id ?? msg + tom);
  const t = TONS[tom] || TONS.ok;
  const carregando = tom === "carregando";
  const animar = !reduzir;
  function fechar() { if (reduzir) { onFechar && onFechar(); return; } setSaindoId(id ?? msg + tom); setTimeout(() => onFechar && onFechar(), 170); }
  // Esc fecha o aviso (teclado no PC)
  useEffect(() => { const k = (e) => { if (e.key === "Escape") fechar(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); });
  return createPortal(
    <div className={`fixed left-0 right-0 ${elevar ? "bottom-44 lg:bottom-24" : "bottom-28 lg:bottom-6"} z-[100] px-4 flex justify-center pointer-events-none lg:pl-64`}>
      <motion.div key={id ?? msg + tom}
        initial={reduzir ? false : { y: 28, opacity: 0, scale: 0.94 }} animate={saindo ? { y: 10, opacity: 0, scale: 0.96 } : { y: 0, opacity: 1, scale: 1 }}
        transition={saindo ? { duration: 0.16 } : { type: "spring", stiffness: 380, damping: 26 }}
        style={CARTAO} className="relative overflow-hidden rounded-2xl text-white w-full max-w-sm">
        {animar && <Bolhas cor={t.cor} />}
        <div className="relative flex items-center gap-3 pl-3.5 pr-12 pt-3 pb-3.5">
          <Orbe tom={tom} cor={t.cor} animar={animar} />
          <div className="min-w-0 flex-1" aria-hidden="true">
            <div className="flex items-center gap-2 mb-1">
              <p style={{ color: t.luz }} className="text-[10px] font-bold uppercase tracking-[0.14em] leading-none">{t.rotulo}</p>
              <Pontinhos animar={animar && (carregando || tom === "erro" || tom === "aviso")} />
            </div>
            <p className="text-[13px] font-medium leading-snug break-words" style={{ display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{msg}</p>
          </div>
        </div>
        <BotaoFechar onClick={fechar} />
        <motion.span aria-hidden className="absolute left-0 bottom-0 h-[3px]" style={{ background: t.cor }}
          initial={{ width: carregando ? "10%" : "100%" }} animate={{ width: carregando ? ["10%", "90%"] : "0%" }}
          transition={{ duration: duracaoAviso(msg, tom) / 1000, ease: "linear" }} />
      </motion.div>
    </div>,
    document.body
  );
}

// Aviso com "Desfazer" (some em 5 s, com a barra de tempo). O X só esconde o aviso: a ação segue valendo no fim dos 5 s.
export function AvisoDesfazer({ mensagem, onDesfazer, onFechar }) {
  const reduzir = useReducedMotion();
  const t = TONS.aviso;
  return createPortal(
    <div className="fixed left-0 right-0 bottom-28 lg:bottom-6 z-[100] px-4 flex justify-center pointer-events-none lg:pl-64">
      <motion.div role="status" initial={reduzir ? false : { y: 28, opacity: 0, scale: 0.94 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}
        style={CARTAO} className="relative overflow-hidden rounded-2xl text-white w-full max-w-sm pointer-events-auto">
        {!reduzir && <Bolhas cor={t.cor} />}
        <div className="relative flex items-center gap-3 pl-3.5 pr-12 py-3">
          <Orbe tom="aviso" cor={t.cor} animar={!reduzir} />
          <p className="text-[13px] font-medium flex-1 min-w-0 leading-snug break-words" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{mensagem}</p>
          <button onClick={onDesfazer} style={{ color: "#FFFFFF", background: "rgba(255,255,255,0.2)" }} className="text-xs font-bold shrink-0 rounded-full px-4 py-2.5">Desfazer</button>
        </div>
        {onFechar && <BotaoFechar onClick={onFechar} />}
        <motion.span aria-hidden className="absolute left-0 bottom-0 h-[3px]" style={{ background: t.cor }} initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: DESFAZER_MS / 1000, ease: "linear" }} />
      </motion.div>
    </div>,
    document.body
  );
}

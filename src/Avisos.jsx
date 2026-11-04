// Avisos (toasts) do app, refeitos no estilo da tela de carregamento: cartão com o degradê da marca,
// três bolinhas animadas e a cor do status SÓ nos detalhes (bolinha, selo e barra de tempo) — sem caixa vermelha.
import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FUNDO_MARCA } from "./TelasEntrada";

export const TONS = {
  ok: { cor: "#34C77B", rotulo: "Pronto", ms: 2800 },
  info: { cor: "#4CC9F0", rotulo: "Informação", ms: 3000 },
  carregando: { cor: "#6AA9FF", rotulo: "Aguarde", ms: 6000 },
  aviso: { cor: "#F5A524", rotulo: "Atenção", ms: 4200 },
  erro: { cor: "#FF5A5F", rotulo: "Não deu certo", ms: 5200 },
};

// Os pontos de chamada continuam usando showToast(msg, "ok"|"warn"); o tom certo sai do texto.
export function classificarTom(msg, tom) {
  if (TONS[tom] && tom !== "ok") return tom;
  const m = String(msg || "").toLowerCase();
  if (tom === "warn") {
    return /não foi possível|nao foi possivel|erro|inválid|invalid|falhou|falha|recusad|não aceit|sem permiss|já existe|não deu|precisa ser|só dá para|só pode|só gerência|escolha|preencha|no máximo|muito curto|não suporta|peça|não tem/.test(m) ? "erro" : "aviso";
  }
  if (/gerando|sincronizando|aguarde|enviando|carregando/.test(m)) return "carregando";
  if (/copiad|copiei|coletad|salva na pasta|baixad|imagem pronta/.test(m)) return "info";
  return "ok";
}

function Bolinhas({ cor, animar }) {
  return (
    <span aria-hidden className="flex items-center gap-1.5 shrink-0">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="block rounded-full" style={{ width: 8, height: 8, background: i === 0 ? cor : "rgba(255,255,255,0.45)" }}
          animate={animar ? { opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85], backgroundColor: [i === 0 ? cor : "rgba(255,255,255,0.45)", cor, i === 0 ? cor : "rgba(255,255,255,0.45)"] } : undefined}
          transition={animar ? { duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" } : undefined} />
      ))}
    </span>
  );
}

const CARTAO = { background: FUNDO_MARCA, boxShadow: "0 14px 34px rgba(6,28,58,0.38)", border: "1px solid rgba(255,255,255,0.14)" };

export function AvisoToast({ msg, tom }) {
  const reduzir = useReducedMotion();
  const t = TONS[tom] || TONS.ok;
  const carregando = tom === "carregando";
  return (
    <div className="fixed left-0 right-0 bottom-20 lg:bottom-6 z-50 px-4 flex justify-center pointer-events-none lg:pl-64">
      <motion.div key={msg + tom} role={tom === "erro" ? "alert" : "status"} aria-live={tom === "erro" ? "assertive" : "polite"}
        initial={reduzir ? false : { y: 24, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 28 }}
        style={CARTAO} className="relative overflow-hidden rounded-2xl text-white w-full max-w-sm">
        <div className="flex items-start gap-3 px-4 pt-3 pb-3.5">
          <div className="pt-1"><Bolinhas cor={t.cor} animar={!reduzir && (carregando || tom === "erro" || tom === "aviso")} /></div>
          <div className="min-w-0 flex-1">
            <p style={{ color: t.cor }} className="text-[10px] font-bold uppercase tracking-[0.14em] leading-none mb-1">{t.rotulo}</p>
            <p className="text-[13px] font-medium leading-snug break-words">{msg}</p>
          </div>
        </div>
        <motion.span aria-hidden className="absolute left-0 bottom-0 h-[3px]" style={{ background: t.cor }}
          initial={{ width: carregando ? "10%" : "100%" }} animate={{ width: carregando ? ["10%", "90%"] : "0%" }}
          transition={{ duration: t.ms / 1000, ease: "linear" }} />
      </motion.div>
    </div>
  );
}

// Aviso com "Desfazer" (some em 5 s, com a barra de tempo)
export function AvisoDesfazer({ mensagem, onDesfazer }) {
  const reduzir = useReducedMotion();
  const t = TONS.aviso;
  return (
    <div className="fixed left-0 right-0 bottom-20 lg:bottom-6 z-50 px-4 flex justify-center lg:pl-64">
      <motion.div role="status" initial={reduzir ? false : { y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 28 }}
        style={CARTAO} className="relative overflow-hidden rounded-2xl text-white w-full max-w-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <Bolinhas cor={t.cor} animar={false} />
          <p className="text-[13px] font-medium flex-1 leading-snug">{mensagem}</p>
          <button onClick={onDesfazer} style={{ color: "#8FC1FF", background: "rgba(255,255,255,0.12)" }} className="text-xs font-bold shrink-0 rounded-full px-3 py-1.5">Desfazer</button>
        </div>
        <motion.span aria-hidden className="absolute left-0 bottom-0 h-[3px]" style={{ background: t.cor }} initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 5, ease: "linear" }} />
      </motion.div>
    </div>
  );
}

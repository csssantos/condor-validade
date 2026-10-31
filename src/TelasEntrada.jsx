// Telas de entrada do app: carregamento e peças visuais do login (palco, campos, botão, avisos).
// Só aparência e animação — toda a lógica do login continua no AuthScreen (App.jsx).
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

const AZUL = "#0B4F9E";
const FUNDO_MARCA = "radial-gradient(120% 85% at 50% 0%, #1B6FD1 0%, #0B4F9E 42%, #061C3A 100%)";
const CORES_STATUS = ["#E31E24", "#F5A524", "#34C77B"]; // vencido · atenção · ok (as mesmas cores do app)

// ───────────────────────── Carregamento ─────────────────────────
const FRASES = ["Conferindo as validades…", "Procurando o que vence hoje…", "Organizando os setores…", "Quase lá…"];

export function TelaCarregando({ logo, mensagem }) {
  const reduzir = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (mensagem || reduzir) return;
    const t = setInterval(() => setI((n) => (n + 1) % FRASES.length), 1900);
    return () => clearInterval(t);
  }, [mensagem, reduzir]);

  // pontinhos que sobem ao fundo (posições fixas por render, sem aleatório a cada frame)
  const particulas = useMemo(() => Array.from({ length: 16 }, (_, k) => ({
    x: (k * 61 + 13) % 100, tam: 3 + (k * 7) % 5, dur: 7 + (k * 13) % 7, atraso: (k * 0.7) % 6, cor: CORES_STATUS[k % 3],
  })), []);

  const orbitas = [
    { raio: 104, dur: 7, cor: CORES_STATUS[0], tam: 12, sentido: 1 },
    { raio: 84, dur: 9, cor: CORES_STATUS[1], tam: 10, sentido: -1 },
    { raio: 64, dur: 5.5, cor: CORES_STATUS[2], tam: 9, sentido: 1 },
  ];
  const texto = mensagem || FRASES[i];

  return (
    <div role="status" aria-live="polite" style={{ background: FUNDO_MARCA }} className="fixed inset-0 overflow-hidden flex flex-col items-center justify-center text-white">
      {/* manchas de luz à deriva */}
      {!reduzir && [
        { c: "#2E86F0", s: 340, x: "-18%", y: "-8%", dx: 40, dy: 30, d: 11 },
        { c: "#E31E24", s: 240, x: "62%", y: "62%", dx: -30, dy: -40, d: 13 },
        { c: "#34C77B", s: 200, x: "70%", y: "-6%", dx: -26, dy: 34, d: 15 },
      ].map((b, k) => (
        <motion.div key={k} aria-hidden style={{ width: b.s, height: b.s, left: b.x, top: b.y, background: b.c, filter: "blur(70px)", opacity: 0.28 }} className="absolute rounded-full"
          animate={{ x: [0, b.dx, 0], y: [0, b.dy, 0] }} transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }} />
      ))}
      {!reduzir && particulas.map((p, k) => (
        <motion.span key={k} aria-hidden style={{ left: `${p.x}%`, width: p.tam, height: p.tam, background: p.cor, bottom: -12 }} className="absolute rounded-full opacity-0"
          animate={{ y: [0, -(typeof window !== "undefined" ? window.innerHeight : 800) - 30], opacity: [0, 0.55, 0.55, 0] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.atraso, ease: "linear" }} />
      ))}

      {/* radar de validade */}
      <div className="relative h-[240px] w-[240px] flex items-center justify-center">
        {!reduzir && [0, 1].map((k) => (
          <motion.span key={k} aria-hidden className="absolute h-[110px] w-[110px] rounded-full border border-white/40"
            initial={{ scale: 0.8, opacity: 0.6 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 2.6, repeat: Infinity, delay: k * 1.3, ease: "easeOut" }} />
        ))}

        {/* régua de dias girando devagar */}
        <motion.svg aria-hidden viewBox="0 0 240 240" className="absolute inset-0" animate={reduzir ? undefined : { rotate: -360 }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}>
          <circle cx="120" cy="120" r="112" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="6" strokeDasharray="1.5 9.2" />
        </motion.svg>
        {/* arco de progresso que varre */}
        <motion.svg aria-hidden viewBox="0 0 240 240" className="absolute inset-0" animate={reduzir ? undefined : { rotate: 360 }} transition={{ duration: 1.7, repeat: Infinity, ease: "linear" }}>
          <defs><linearGradient id="arcoCarga" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" /></linearGradient></defs>
          <motion.circle cx="120" cy="120" r="96" fill="none" stroke="url(#arcoCarga)" strokeWidth="4" strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 0.32 }} transition={{ duration: 1.1, ease: "easeOut" }} />
        </motion.svg>

        {/* produtos em órbita */}
        {orbitas.map((o, k) => (
          <motion.div key={k} aria-hidden className="absolute inset-0 flex justify-center" animate={reduzir ? undefined : { rotate: 360 * o.sentido }} transition={{ duration: o.dur, repeat: Infinity, ease: "linear" }}>
            <span style={{ marginTop: 120 - o.raio - o.tam / 2, width: o.tam, height: o.tam, background: o.cor, boxShadow: `0 0 14px 2px ${o.cor}` }} className="block rounded-full" />
          </motion.div>
        ))}

        {/* logo */}
        <motion.div initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
          className="relative h-[104px] w-[104px] rounded-[30px] bg-white flex items-center justify-center shadow-[0_18px_40px_-10px_rgba(0,0,0,.5)]">
          <motion.img src={logo} alt="Condor" className="h-9 w-auto max-w-[76px]" animate={reduzir ? undefined : { y: [0, -3, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
        </motion.div>
      </div>

      {/* frase */}
      <div className="h-8 mt-6 relative w-full flex justify-center overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={texto} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={{ duration: 0.3 }}
            className="absolute text-[15px] font-semibold tracking-wide">{texto}</motion.p>
        </AnimatePresence>
      </div>

      {/* barra indeterminada */}
      <div className="mt-3 h-1.5 w-44 rounded-full bg-white/15 overflow-hidden" aria-hidden>
        <motion.div className="h-full w-2/5 rounded-full" style={{ background: "linear-gradient(90deg, transparent, #fff, transparent)" }}
          animate={reduzir ? { x: "60%" } : { x: ["-110%", "280%"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} />
      </div>
      <p className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] text-[11px] text-white/55 font-medium tracking-widest uppercase">Condor · Alerta de Validade</p>
    </div>
  );
}

// ───────────────────────── Login: palco (parte de cima) ─────────────────────────
const CHIPS = [
  { t: "Vence hoje", c: CORES_STATUS[0], pos: "top-[9%] left-[5%]", d: 0.5, dur: 3.4 },
  { t: "Vence em 3 dias", c: CORES_STATUS[1], pos: "top-[16%] right-[4%]", d: 0.7, dur: 4 },
  { t: "Validade ok", c: CORES_STATUS[2], pos: "hidden lg:block bottom-[24%] left-[4%]", d: 0.9, dur: 3.8 },
  { t: "Ronda concluída", c: "#6CB4FF", pos: "hidden lg:block bottom-[31%] right-[5%]", d: 1.1, dur: 4.4 },
];

export function AuthPalco({ logo, compacto }) {
  const reduzir = useReducedMotion();
  const palavras = ["Validade", "sob", "controle."];
  return (
    <div style={{ background: FUNDO_MARCA }} className={`relative overflow-hidden text-white ${compacto ? "h-[168px]" : "h-[316px]"} lg:h-auto lg:min-h-screen transition-[height] duration-500 ease-out`}>
      {/* trama de pontos + ondas atrás do logo */}
      <div aria-hidden className="absolute inset-0 opacity-[.14]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "22px 22px" }} />
      {!reduzir && [0, 1, 2].map((k) => (
        <motion.span key={k} aria-hidden className="absolute left-1/2 top-[34%] -ml-[90px] -mt-[90px] h-[180px] w-[180px] rounded-full border border-white/30"
          initial={{ scale: 0.6, opacity: 0.5 }} animate={{ scale: 3, opacity: 0 }} transition={{ duration: 5, repeat: Infinity, delay: k * 1.65, ease: "easeOut" }} />
      ))}

      {/* etiquetas de validade flutuando */}
      {CHIPS.map((c) => (
        <motion.div key={c.t} aria-hidden className={`absolute ${c.pos} transition-opacity duration-300 ${compacto ? "opacity-0" : ""}`}
          initial={{ opacity: 0, scale: 0.5, y: 14 }} animate={{ opacity: compacto ? 0 : 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 18, delay: c.d }}>
          <motion.div animate={reduzir ? undefined : { y: [0, -9, 0], rotate: [-1.5, 1.5, -1.5] }} transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
            className="flex items-center gap-2 rounded-full pl-2.5 pr-3.5 py-1.5 text-[11.5px] font-bold border border-white/25 bg-white/15 backdrop-blur-md shadow-lg shadow-black/10">
            <span className="relative flex h-2.5 w-2.5">
              {!reduzir && <motion.span className="absolute inset-0 rounded-full" style={{ background: c.c }} animate={{ scale: [1, 2.2], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
              <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: c.c }} />
            </span>
            {c.t}
          </motion.div>
        </motion.div>
      ))}

      {/* marca + frase */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-8 lg:pb-0 text-center">
        <motion.div initial={{ scale: 0, rotate: -14 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 280, damping: 16, delay: 0.1 }}
          className={`rounded-[22px] bg-white flex items-center justify-center shadow-[0_16px_36px_-10px_rgba(0,0,0,.55)] ${compacto ? "h-14 w-14" : "h-[68px] w-[68px] lg:h-24 lg:w-24 lg:rounded-[30px]"} transition-all duration-500`}>
          <img src={logo} alt="Condor" className={`${compacto ? "h-6" : "h-7 lg:h-10"} w-auto max-w-[78%] transition-all duration-500`} />
        </motion.div>
        <div className={`overflow-hidden transition-all duration-500 ${compacto ? "max-h-0 opacity-0" : "max-h-48 opacity-100 mt-4"}`}>
          <h2 className="text-[28px] lg:text-5xl font-extrabold leading-tight tracking-tight">
            {palavras.map((p, k) => (
              <motion.span key={p} className="inline-block mr-[.28em]" initial={{ y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.35 + k * 0.1 }}>{p}</motion.span>
            ))}
          </h2>
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="text-[13px] lg:text-base text-white/80 mt-1.5 max-w-[19rem] lg:max-w-sm mx-auto">
            Alertas, rondas e baixas da sua loja num só lugar.
          </motion.p>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Login: peças do formulário ─────────────────────────
const ehEscuro = (T) => T.bg === "#0B1220";
const corLink = (T) => (ehEscuro(T) ? "#7DB8FF" : AZUL);

export const itemForm = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 28 } } };
export const grupoForm = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };

export function AuthTitulo({ T, titulo, sub }) {
  return (
    <motion.div variants={itemForm} className="mb-1">
      <h1 style={{ color: T.text }} className="text-[22px] font-extrabold tracking-tight">{titulo}</h1>
      {sub && <p style={{ color: T.subtext }} className="text-[13px] mt-0.5">{sub}</p>}
    </motion.div>
  );
}

export function AuthCampo({ T, rotulo, value, onChange, type = "text", autoComplete, required, inputMode, autoFocus, maxLength }) {
  const [foco, setFoco] = useState(false);
  const [ver, setVer] = useState(false);
  const senha = type === "password";
  const ativo = foco || (value && String(value).length > 0);
  return (
    <motion.div variants={itemForm} className="relative">
      <input type={senha && ver ? "text" : type} value={value} onChange={onChange} required={required} autoComplete={autoComplete} inputMode={inputMode}
        autoFocus={autoFocus} maxLength={maxLength} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
        style={{ background: T.chipBg || T.inputBg, color: T.text, borderColor: foco ? corLink(T) : (T.inputBorder || T.border), boxShadow: foco ? "0 0 0 4px rgba(11,79,158,.16)" : "none", transition: "box-shadow .2s, border-color .2s", boxSizing: "border-box" }}
        className={`w-full min-w-0 h-[56px] border rounded-2xl px-4 pt-5 pb-1 text-[15px] outline-none ${senha ? "pr-12" : ""}`} />
      <span style={{ color: foco ? corLink(T) : T.subtext, transform: ativo ? "translateY(-11px) scale(.78)" : "translateY(0) scale(1)", transformOrigin: "left top", transition: "transform .18s ease, color .18s" }}
        className="pointer-events-none absolute left-4 top-[17px] text-[15px] font-medium">{rotulo}</span>
      {senha && (
        <button type="button" tabIndex={-1} aria-label={ver ? "Esconder senha" : "Mostrar senha"} onClick={() => setVer((v) => !v)}
          style={{ color: T.subtext }} className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-full">
          {ver ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
    </motion.div>
  );
}

function Pontos() {
  return (
    <span className="flex items-center gap-1.5" aria-label="Carregando">
      {[0, 1, 2].map((k) => (
        <motion.span key={k} className="h-2 w-2 rounded-full bg-white" animate={{ y: [0, -6, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.7, repeat: Infinity, delay: k * 0.12 }} />
      ))}
    </span>
  );
}

export function AuthBotao({ T, carregando, disabled, children, type = "submit", onClick, variante = "cheio" }) {
  const reduzir = useReducedMotion();
  const off = disabled || carregando;
  const cheio = variante === "cheio";
  return (
    <motion.div variants={itemForm}>
      <motion.button type={type} onClick={onClick} disabled={off} whileTap={off ? undefined : { scale: 0.97 }}
        style={cheio ? { background: `linear-gradient(135deg, ${AZUL} 0%, #1B6FD1 100%)`, color: "#fff", boxShadow: "0 12px 24px -10px rgba(11,79,158,.65)" } : { background: "transparent", color: corLink(T), border: `1.5px solid ${T.inputBorder || T.border}` }}
        className="relative overflow-hidden w-full h-[52px] rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-60">
        {cheio && !off && !reduzir && (
          <motion.span aria-hidden className="absolute inset-y-0 w-1/3 -skew-x-12" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent)" }}
            initial={{ left: "-40%" }} animate={{ left: "130%" }} transition={{ duration: 1.3, repeat: Infinity, repeatDelay: 2.6, ease: "easeInOut" }} />
        )}
        {carregando && cheio ? <Pontos /> : children}
      </motion.button>
    </motion.div>
  );
}

export function AuthLink({ T, children, onClick, forte }) {
  return (
    <motion.button variants={itemForm} type="button" onClick={onClick} whileTap={{ scale: 0.96 }}
      style={{ color: forte ? corLink(T) : T.subtext }} className="text-[13px] font-semibold text-center py-1.5 flex items-center justify-center gap-1.5">{children}</motion.button>
  );
}

export function AuthAviso({ tipo, children }) {
  const erro = tipo === "erro";
  return (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.div key={String(children)} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto", x: erro ? [0, -7, 7, -5, 5, 0] : 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden" role={erro ? "alert" : "status"}>
          <p style={{ background: erro ? "#FDEBEC" : "#E8F6EC", color: erro ? "#A81419" : "#1E7D34" }} className="text-xs font-semibold rounded-xl px-3 py-2.5">{children}</p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

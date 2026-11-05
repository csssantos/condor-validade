// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { motion } from "framer-motion";
import { ChevronRight, Loader2, Sun, Moon, SunMoon } from "lucide-react";
import { BLUE, BLUE_DARK, BLUE_SOFT, RED_DARK, RED_SOFT } from "../../lib/constantes";

// ============ Ajustes ============
// ============ Aba "Mais" — refeita do zero (mobile primeiro) ============
// Hub com categorias (cartões animados) → cada categoria abre uma página que desliza da direita.
// No computador a barra lateral já lista as categorias; aqui só aparece a página escolhida.
const APP_VERSAO = "4.1";

const MOLA = { type: "spring", stiffness: 420, damping: 34 };

const MOLA_SUAVE = { type: "spring", stiffness: 260, damping: 26 };

const COR_MAIS = { conta: "#6D4FC2", aparencia: "#C2570C", notificacoes: "#0B4F9E", atalhos: "#1F7A4D", aprovacoes: "#1F7A4D", avisos: "#A81419", balanca: "#0E7C86", privacidade: "#1F7A4D", lgpd: "#6D4FC2", sobre: "#4A5B6A" };

const COR_TEMA = { claro: "#EEF2F9", escuro: "#0B1220" };

function clarearCor(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v + (255 - v) * f);
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

function iniciaisDe(nome) {
  return (nome || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

function forcaSenha(s) {
  let n = 0;
  if (s.length >= 8) n++;
  if (s.length >= 12) n++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) n++;
  if (/\d/.test(s)) n++;
  if (/[^A-Za-z0-9]/.test(s)) n++;
  return Math.min(n, 4);
}

const ROTULOS_FORCA = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];

const CORES_FORCA = ["#A81419", "#C2570C", "#B7791F", "#1F7A4D", "#14573A"];

function MaisSwitch({ ativo, onClick, label }) {
  return (
    <button role="switch" aria-checked={ativo} aria-label={label} onClick={onClick}
      style={{ background: ativo ? BLUE : "#8E99A8", transition: "background .2s" }} className="relative w-12 h-7 rounded-full shrink-0">
      <motion.span animate={{ x: ativo ? 22 : 2 }} transition={MOLA} className="absolute top-0.5 left-0 h-6 w-6 rounded-full bg-white shadow" />
    </button>
  );
}

function MaisBolha({ cor, dark, tamanho = 44, children }) {
  return (
    <div style={{ background: `${cor}26`, color: dark ? clarearCor(cor, 0.45) : cor, width: tamanho, height: tamanho }}
      className="rounded-2xl flex items-center justify-center shrink-0">{children}</div>
  );
}

function MaisBloco({ T, titulo, children, i = 0, className = "" }) {
  return (
    <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...MOLA, delay: 0.04 + i * 0.07 }} className={`mb-4 ${className}`}>
      {titulo && <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1">{titulo}</p>}
      <div style={{ background: T.card }} className="rounded-3xl shadow-lg shadow-black/5 overflow-hidden">{children}</div>
    </motion.section>
  );
}

function MaisLinha({ T, dark, icon: Icon, cor = BLUE, titulo, desc, direita, onClick, ultima }) {
  const conteudo = (
    <>
      <MaisBolha cor={cor} dark={dark} tamanho={40}><Icon size={18} /></MaisBolha>
      <div className="flex-1 min-w-0 text-left">
        <p style={{ color: T.text }} className="text-[14px] font-semibold leading-tight">{titulo}</p>
        {desc && <p style={{ color: T.subtext }} className="text-[12px] mt-0.5 leading-snug">{desc}</p>}
      </div>
      {direita !== undefined ? direita : onClick ? <ChevronRight size={18} style={{ color: T.subtext }} /> : null}
    </>
  );
  const estilo = { borderBottom: ultima ? "none" : `1px solid ${T.chipBg}` };
  const cls = "w-full flex items-center gap-3 px-4 py-3.5";
  return onClick
    ? <motion.button onClick={onClick} whileTap={{ scale: 0.98, backgroundColor: T.chipBg }} style={estilo} className={cls}>{conteudo}</motion.button>
    : <div style={estilo} className={cls}>{conteudo}</div>;
}

function MaisCampo({ T, label, value, onChange, type = "text", placeholder, autoComplete, direita, maxLength, inputMode }) {
  return (
    <label className="block">
      <span style={{ color: T.subtext }} className="text-[11px] font-semibold mb-1 block">{label}</span>
      <div className="relative">
        <input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} autoComplete={autoComplete}
          maxLength={maxLength} inputMode={inputMode}
          style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder, paddingRight: direita ? 44 : undefined }}
          className="w-full border rounded-2xl px-4 py-3 text-[15px] outline-none focus:ring-2" />
        {direita && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{direita}</div>}
      </div>
    </label>
  );
}

function MaisBotao({ children, onClick, carregando, desabilitado, cor = BLUE, tom = "cheio", T }) {
  const off = desabilitado || carregando;
  return (
    <motion.button onClick={onClick} disabled={off} whileTap={off ? undefined : { scale: 0.97 }}
      style={tom === "cheio" ? { background: off ? "#9AA5B4" : cor, color: "#fff" } : { background: `${cor}1F`, color: cor }}
      className="w-full py-3.5 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 disabled:cursor-not-allowed">
      {carregando && <Loader2 size={16} className="animate-spin" />}{children}
    </motion.button>
  );
}

function MaisAviso({ tipo = "info", children }) {
  const est = tipo === "erro" ? { bg: RED_SOFT, fg: RED_DARK } : tipo === "ok" ? { bg: "#E3F4EA", fg: "#14573A" } : { bg: BLUE_SOFT, fg: BLUE_DARK };
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div style={{ background: est.bg, color: est.fg }} className="rounded-2xl px-3.5 py-3 text-[12.5px] leading-relaxed mt-3">{children}</div>
    </motion.div>
  );
}

function MaisCheck({ tamanho = 56, cor = "#1F7A4D" }) {
  return (
    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}
      style={{ background: `${cor}22`, width: tamanho, height: tamanho }} className="rounded-full flex items-center justify-center">
      <svg width={tamanho * 0.5} height={tamanho * 0.5} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <motion.path d="M5 13l4 4L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.4 }} />
      </svg>
    </motion.div>
  );
}

// ---------------- Hub ----------------
function MaisHero({ T, perfil, usuario, tema, onTema }) {
  const nome = perfil?.nome || usuario || "Usuário";
  const cargo = perfil?.cargo_nome_loja || perfil?.cargos?.nome || "";
  const loja = perfil?.lojas?.numero_loja;
  const OPCOES = [["claro", "Claro", Sun], ["escuro", "Escuro", Moon], ["auto", "Auto", SunMoon]];
  return (
    <motion.div initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={MOLA_SUAVE}
      style={{ background: `linear-gradient(135deg, ${BLUE_DARK}, ${BLUE})`, isolation: "isolate", WebkitMaskImage: "-webkit-radial-gradient(white, black)", transform: "translateZ(0)" }} className="relative overflow-hidden rounded-[30px] p-5 text-white shadow-xl shadow-black/10">
      <motion.div aria-hidden="true" className="absolute -right-12 -top-12 w-48 h-48 rounded-full" style={{ background: "rgba(227,30,36,.40)", filter: "blur(34px)" }}
        animate={{ x: [0, -16, 0], y: [0, 14, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div aria-hidden="true" className="absolute -left-10 -bottom-14 w-40 h-40 rounded-full" style={{ background: "rgba(120,170,255,.35)", filter: "blur(30px)" }}
        animate={{ x: [0, 18, 0], y: [0, -10, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
      <div className="relative flex items-center gap-4">
        <motion.div initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 280, damping: 13, delay: 0.1 }}
          className="h-16 w-16 rounded-[22px] bg-white/20 flex items-center justify-center text-[22px] font-extrabold tracking-tight shrink-0">{iniciaisDe(nome)}</motion.div>
        <div className="min-w-0">
          <motion.p initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }} className="text-[19px] font-extrabold leading-tight truncate">{nome}</motion.p>
          <motion.p initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }} className="text-[12.5px] text-white/85 mt-0.5 truncate">
            {[cargo, loja ? `Loja ${loja}` : null].filter(Boolean).join(" · ")}
          </motion.p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Tema" className="relative mt-5 flex p-1 rounded-2xl bg-black/25">
        {OPCOES.map(([id, rotulo, Icone]) => (
          <button key={id} role="radio" aria-checked={tema === id} onClick={(e) => onTema(id, e)} className="relative flex-1 py-2 rounded-xl text-[12.5px] font-bold flex items-center justify-center gap-1.5">
            {tema === id && <motion.span layoutId="mais-tema-hero" transition={MOLA} className="absolute inset-0 rounded-xl bg-white" />}
            <span className="relative flex items-center gap-1.5" style={{ color: tema === id ? BLUE_DARK : "#fff" }}><Icone size={14} />{rotulo}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function MaisTile({ T, dark, i, icon: Icon, cor, titulo, desc, onClick }) {
  return (
    <motion.button onClick={onClick} initial={{ opacity: 0, y: 26, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...MOLA, delay: 0.12 + i * 0.055 }} whileTap={{ scale: 0.95 }} whileHover={{ y: -3 }}
      style={{ background: T.card }} className="relative overflow-hidden rounded-3xl p-4 text-left shadow-lg shadow-black/5 flex flex-col gap-3 min-h-[128px]">
      <motion.div aria-hidden="true" initial={{ rotate: -25, opacity: 0 }} animate={{ rotate: 0, opacity: 0.07 }} transition={{ delay: 0.3 + i * 0.05, duration: 0.6 }}
        style={{ color: cor }} className="absolute -right-3 -bottom-3"><Icon size={84} /></motion.div>
      <MaisBolha cor={cor} dark={dark}><Icon size={21} /></MaisBolha>
      <div className="relative">
        <p style={{ color: T.text }} className="text-[15px] font-bold leading-tight">{titulo}</p>
        <p style={{ color: T.subtext }} className="text-[12px] mt-1 leading-snug">{desc}</p>
      </div>
    </motion.button>
  );
}

export { APP_VERSAO, CORES_FORCA, COR_MAIS, COR_TEMA, MOLA, MOLA_SUAVE, MaisAviso, MaisBloco, MaisBolha, MaisBotao, MaisCampo, MaisCheck, MaisHero, MaisLinha, MaisSwitch, MaisTile, ROTULOS_FORCA, clarearCor, forcaSenha, iniciaisDe };

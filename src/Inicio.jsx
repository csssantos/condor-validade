// Palco da tela inicial (celular), no mesmo estilo da tela de carregamento: degradê azul da marca, anel de status,
// vidro e animações. Só aparência: os números vêm prontos do HomeView (App.jsx).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Bell, BellOff, Moon, Sun, CheckCircle2 } from "lucide-react";
import { FUNDO_MARCA } from "./TelasEntrada";

const VERM = "#E31E24", AMBAR = "#F5A524", VERDE = "#34C77B";
const FUNDO_EMERGENCIA = "radial-gradient(120% 85% at 50% 0%, #D6262B 0%, #8E1418 45%, #3A070A 100%)";
const VIDRO = { background: "rgba(255,255,255,.13)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,.22)" };

// número que "sobe" até o valor final
function useContagem(alvo, ms = 900) {
  const reduzir = useReducedMotion();
  const [v, setV] = useState(reduzir ? alvo : 0);
  const ant = useRef(reduzir ? alvo : 0);
  useEffect(() => {
    if (reduzir) { setV(alvo); ant.current = alvo; return; }
    const de = ant.current, ini = performance.now();
    let raf;
    const passo = (t) => {
      const p = Math.min(1, (t - ini) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(de + (alvo - de) * e);
      if (p < 1) raf = requestAnimationFrame(passo); else ant.current = alvo;
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ms, reduzir]);
  return v;
}

function Anel({ vencidos, alerta, ok, total, children }) {
  const R = 100, C = 2 * Math.PI * R, GAP = total > 0 ? 7 : 0;
  const segs = useMemo(() => {
    if (!total) return [];
    const partes = [[vencidos, VERM], [alerta, AMBAR], [ok, VERDE]].filter(([n]) => n > 0);
    let inicio = 0;
    return partes.map(([n, cor]) => {
      const len = Math.max(2, (n / total) * C - (partes.length > 1 ? GAP : 0));
      const seg = { len, cor, inicio };
      inicio += (n / total) * C;
      return seg;
    });
  }, [vencidos, alerta, ok, total, C, GAP]);
  return (
    <div className="relative h-[250px] w-[250px] mx-auto flex items-center justify-center">
      {/* régua de dias girando devagar, como na tela de carregamento */}
      <motion.svg aria-hidden viewBox="0 0 250 250" className="absolute inset-0" animate={{ rotate: -360 }} transition={{ duration: 60, repeat: Infinity, ease: "linear" }}>
        <circle cx="125" cy="125" r="121" fill="none" stroke="rgba(255,255,255,.26)" strokeWidth="5" strokeDasharray="1.4 8.6" />
      </motion.svg>
      <svg aria-hidden viewBox="0 0 250 250" className="absolute inset-0" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="125" cy="125" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="13" />
        {segs.map((s, k) => (
          <motion.circle key={k} cx="125" cy="125" r={R} fill="none" stroke={s.cor} strokeWidth="13" strokeLinecap="round"
            strokeDasharray={`${s.len} ${C - s.len}`} strokeDashoffset={-s.inicio} style={{ filter: `drop-shadow(0 0 6px ${s.cor}88)` }}
            initial={{ strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: `${s.len} ${C - s.len}` }} transition={{ duration: 1.1, delay: 0.25 + k * 0.18, ease: "easeOut" }} />
        ))}
      </svg>
      <div className="relative text-center px-6">{children}</div>
    </div>
  );
}

function Pilula({ rotulo, valor, cor, atraso }) {
  const n = useContagem(valor, 800);
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 22, delay: atraso }}
      style={VIDRO} className="rounded-[22px] py-3 px-2 text-center">
      <p className="text-[24px] font-extrabold leading-none tabular-nums">{Math.round(n)}</p>
      <p className="text-[11px] font-semibold mt-1.5 flex items-center justify-center gap-1.5 text-white/85">
        <span className="h-2 w-2 rounded-full" style={{ background: cor, boxShadow: `0 0 8px ${cor}` }} />{rotulo}
      </p>
    </motion.div>
  );
}

export function PalcoInicio({
  logo, nome, loja, valorNum, formatarMoeda, vencidos, alerta, total, emergencia, onEmergencia, notifOk, onNotif, dark, onTema,
}) {
  const reduzir = useReducedMotion();
  const ok = Math.max(0, total - vencidos - alerta);
  const valor = useContagem(valorNum, 1100);
  const primeiroNome = String(nome || "").trim().split(/\s+/)[0];
  const hojeTxt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const hoje = hojeTxt.charAt(0).toUpperCase() + hojeTxt.slice(1);
  const atencao = vencidos + alerta;
  const recado = emergencia ? "Modo emergência: só o que vence em até 2 dias."
    : vencidos > 0 ? (vencidos > 1 ? `${vencidos} vencidos pedem ação agora` : "1 vencido pede ação agora")
    : alerta > 0 ? `${alerta} perto de vencer`
    : total > 0 ? "Tudo sob controle" : "Nenhum produto monitorado ainda";
  const BotaoVidro = ({ onClick, label, children, ativo }) => (
    <motion.button type="button" onClick={onClick} aria-label={label} aria-pressed={ativo} whileTap={{ scale: 0.88 }}
      style={ativo ? { background: "#fff", color: VERM, border: "1px solid #fff" } : VIDRO} className="h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0">{children}</motion.button>
  );

  return (
    <section className="relative overflow-hidden text-white pb-12 transition-colors" style={{ background: emergencia ? FUNDO_EMERGENCIA : FUNDO_MARCA }}>
      <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "22px 22px" }} />
      {!reduzir && [
        { c: "#2E86F0", s: 280, x: "-22%", y: "-10%", dx: 30, dy: 24, d: 12 },
        { c: emergencia ? "#FF6A3D" : "#34C77B", s: 190, x: "68%", y: "30%", dx: -24, dy: 30, d: 14 },
      ].map((b, k) => (
        <motion.div key={k} aria-hidden style={{ width: b.s, height: b.s, left: b.x, top: b.y, background: b.c, filter: "blur(70px)", opacity: 0.26 }} className="absolute rounded-full"
          animate={{ x: [0, b.dx, 0], y: [0, b.dy, 0] }} transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }} />
      ))}

      <div className="relative px-4 pt-[calc(env(safe-area-inset-top)+0.9rem)]">
        {/* topo: logo + ações */}
        <div className="flex items-center justify-between">
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="bg-white rounded-2xl h-10 px-3 flex items-center shadow-lg shadow-black/20">
            <img src={logo} alt="Condor" className="h-[22px] w-auto" />
          </motion.div>
          <div className="flex items-center gap-2">
            <BotaoVidro onClick={onEmergencia} label={emergencia ? "Sair do modo emergência" : "Modo emergência"} ativo={emergencia}><AlertTriangle size={17} /></BotaoVidro>
            <BotaoVidro onClick={onNotif} label="Notificações">{notifOk ? <Bell size={17} /> : <BellOff size={17} />}</BotaoVidro>
            <BotaoVidro onClick={onTema} label="Alternar tema">{dark ? <Sun size={17} /> : <Moon size={17} />}</BotaoVidro>
          </div>
        </div>

        {/* saudação */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Olá{primeiroNome ? `, ${primeiroNome}` : ""}</h1>
          <p className="text-[12.5px] text-white/75 mt-0.5">{hoje}{loja ? ` · Loja ${loja}` : ""}</p>
        </motion.div>

        {/* anel de status com o valor em risco no centro */}
        <div className="mt-3">
          <Anel vencidos={vencidos} alerta={alerta} ok={ok} total={total}>
            <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-white/70">Valor em risco</p>
            <p className="text-[32px] font-extrabold leading-tight tabular-nums mt-0.5">{formatarMoeda(valor)}</p>
            <p className="text-[11.5px] font-semibold mt-1 text-white/85 flex items-center justify-center gap-1.5 leading-snug">
              {atencao === 0 && total > 0 && !emergencia && <CheckCircle2 size={13} color={VERDE} />}{recado}
            </p>
          </Anel>
        </div>

        {/* números */}
        <div className="grid grid-cols-3 gap-2.5 mt-1">
          <Pilula rotulo="Vencidos" valor={vencidos} cor={VERM} atraso={0.45} />
          <Pilula rotulo="Em alerta" valor={alerta} cor={AMBAR} atraso={0.55} />
          <Pilula rotulo="Monitorados" valor={total} cor={VERDE} atraso={0.65} />
        </div>
      </div>
    </section>
  );
}

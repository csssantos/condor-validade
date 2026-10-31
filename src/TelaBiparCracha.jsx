// Tela de bipar o crachá (cadastro de primeiro acesso), feita do zero: câmera em tela cheia, moldura com laser,
// painel de vidro embaixo com "Câmera | Digitar matrícula". Só aparência — a leitura do código continua no ScanView (App.jsx).
import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowLeft, Flashlight, FlashlightOff, SwitchCamera, Keyboard, ScanLine, Loader2, AlertTriangle, RotateCcw, ArrowRight } from "lucide-react";

const VERM = "#E31E24";
const VIDRO = { background: "rgba(255,255,255,.13)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,.22)" };

function BotaoRedondo({ onClick, label, children }) {
  return (
    <motion.button type="button" onClick={onClick} aria-label={label} whileTap={{ scale: 0.88 }} style={VIDRO}
      className="h-11 w-11 rounded-full flex items-center justify-center text-white shrink-0">{children}</motion.button>
  );
}

function Canto({ pos, reduzir }) {
  const base = { position: "absolute", width: 34, height: 34, borderColor: "#fff", borderStyle: "solid", borderWidth: 0 };
  const estilo = {
    tl: { top: -2, left: -2, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 22 },
    tr: { top: -2, right: -2, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 22 },
    bl: { bottom: -2, left: -2, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 22 },
    br: { bottom: -2, right: -2, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 22 },
  }[pos];
  return <motion.span aria-hidden style={{ ...base, ...estilo }} animate={reduzir ? undefined : { opacity: [1, 0.55, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />;
}

export default function TelaBiparCracha({
  status, erroMsg, videoRef, manualMode, setManualMode, manualCode, setManualCode,
  torchDisponivel, torchOn, onTorch, onTrocarCamera, onConfirmarManual, onVoltar, onTentarDeNovo, ocupado,
}) {
  const reduzir = useReducedMotion();
  const comCamera = !manualMode;
  const iniciando = comCamera && status === "iniciando";
  const falhou = status === "erro" || status === "sem-suporte";
  const podeConfirmar = manualCode.length >= 4;

  return (
    <motion.div role="dialog" aria-modal="true" aria-label="Bipar crachá" className="fixed inset-0 z-50 overflow-hidden text-white"
      style={{ background: "radial-gradient(120% 85% at 50% 0%, #12427F 0%, #081F3F 60%, #040F22 100%)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

      {/* câmera */}
      {comCamera && <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted autoPlay playsInline webkit-playsinline="true" />}

      {/* moldura: escurece em volta e deixa o centro limpo */}
      {comCamera && !falhou && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: 150 }}>
          <motion.div initial={{ scale: 1.15, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.1 }}
            className="relative w-[84%] max-w-[340px] h-[200px] rounded-[26px]" style={{ boxShadow: "0 0 0 100vmax rgba(3,12,28,.66)" }}>
            <Canto pos="tl" reduzir={reduzir} /><Canto pos="tr" reduzir={reduzir} /><Canto pos="bl" reduzir={reduzir} /><Canto pos="br" reduzir={reduzir} />
            {/* laser */}
            {!reduzir && (
              <motion.span aria-hidden className="absolute left-3 right-3 h-[3px] rounded-full" style={{ background: VERM, boxShadow: `0 0 18px 4px ${VERM}` }}
                initial={{ top: "8%" }} animate={{ top: ["8%", "92%", "8%"] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }} />
            )}
            <p className="absolute -bottom-9 left-0 right-0 text-center text-[13px] font-semibold text-white/90">Aponte para o código de barras do crachá</p>
          </motion.div>
        </div>
      )}

      {/* topo */}
      <div className="absolute top-0 inset-x-0 flex items-center gap-3 px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <BotaoRedondo onClick={onVoltar} label="Voltar"><ArrowLeft size={20} /></BotaoRedondo>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-extrabold leading-tight">Bipe seu crachá</p>
          <p className="text-[12px] text-white/75">Cadastro de primeiro acesso</p>
        </div>
        {comCamera && !falhou && torchDisponivel && <BotaoRedondo onClick={onTorch} label="Lanterna">{torchOn ? <Flashlight size={18} color="#FFD34D" /> : <FlashlightOff size={18} />}</BotaoRedondo>}
        {comCamera && !falhou && <BotaoRedondo onClick={onTrocarCamera} label="Trocar câmera"><SwitchCamera size={18} /></BotaoRedondo>}
      </div>

      {/* abrindo câmera */}
      <AnimatePresence>
        {iniciando && (
          <motion.div key="abrindo" className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(4,15,34,.72)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="relative h-20 w-20 flex items-center justify-center">
              {!reduzir && <motion.span className="absolute inset-0 rounded-full border-2 border-white/60" animate={{ scale: [0.7, 1.4], opacity: [0.8, 0] }} transition={{ duration: 1.4, repeat: Infinity }} />}
              <ScanLine size={34} />
            </div>
            <p className="text-sm font-semibold">Abrindo a câmera…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* câmera com problema */}
      {comCamera && falhou && (
        <div className="absolute inset-x-5 top-1/3 -translate-y-1/4 rounded-3xl p-5 text-center" style={VIDRO}>
          <AlertTriangle size={30} className="mx-auto mb-2" color="#FFB45C" />
          <p className="text-sm font-semibold">{status === "sem-suporte" ? "Este navegador não lê o código pela câmera." : (erroMsg || "Não foi possível abrir a câmera.")}</p>
          <div className="flex gap-2 mt-4">
            {status === "erro" && <button type="button" onClick={onTentarDeNovo} className="flex-1 h-11 rounded-2xl bg-white/15 text-sm font-bold flex items-center justify-center gap-2"><RotateCcw size={15} /> Tentar de novo</button>}
            <button type="button" onClick={() => setManualMode(true)} className="flex-1 h-11 rounded-2xl bg-white text-sm font-bold text-[#0B4F9E] flex items-center justify-center gap-2"><Keyboard size={15} /> Digitar</button>
          </div>
        </div>
      )}

      {/* painel de baixo */}
      <motion.div initial={{ y: 120 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.15 }}
        className="absolute inset-x-0 bottom-0 rounded-t-[30px] px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" style={{ ...VIDRO, background: "rgba(8,24,50,.62)" }}>
        <div className="relative flex rounded-2xl p-1" style={{ background: "rgba(255,255,255,.10)" }} role="tablist">
          {[{ id: false, rot: "Câmera", Ico: ScanLine }, { id: true, rot: "Digitar matrícula", Ico: Keyboard }].map((o) => {
            const ativo = manualMode === o.id;
            return (
              <button key={o.rot} type="button" role="tab" aria-selected={ativo} onClick={() => setManualMode(o.id)} className="relative flex-1 h-10 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5">
                {ativo && <motion.span layoutId="abaCracha" className="absolute inset-0 rounded-xl bg-white" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                <span className="relative flex items-center gap-1.5" style={{ color: ativo ? "#0B4F9E" : "rgba(255,255,255,.85)" }}><o.Ico size={15} />{o.rot}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {manualMode ? (
            <motion.div key="manual" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="mt-4">
              {falhou && (
                <div className="rounded-2xl px-3 py-2.5 mb-3 flex items-start gap-2 text-[12px]" style={{ background: "rgba(255,180,92,.16)", border: "1px solid rgba(255,180,92,.4)" }}>
                  <AlertTriangle size={15} color="#FFB45C" className="mt-0.5 shrink-0" />
                  <div className="flex-1"><p className="font-semibold">{status === "sem-suporte" ? "Este navegador não lê o código pela câmera." : (erroMsg || "Não foi possível abrir a câmera.")}</p>
                    {status === "erro" && <button type="button" onClick={onTentarDeNovo} className="font-bold underline mt-1 inline-flex items-center gap-1"><RotateCcw size={12} /> Tentar a câmera de novo</button>}</div>
                </div>
              )}
              <label className="text-[12px] font-semibold text-white/80 block mb-1.5">Matrícula do crachá (só números)</label>
              <input autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={14} value={manualCode} placeholder="Ex.: 123456"
                onChange={(e) => setManualCode(e.target.value.replace(/\D/g, "").slice(0, 14))}
                onKeyDown={(e) => { if (e.key === "Enter" && podeConfirmar) onConfirmarManual(); }}
                className="w-full h-14 rounded-2xl px-4 text-center text-2xl font-extrabold tracking-[.18em] outline-none text-white placeholder:text-white/35 placeholder:tracking-normal placeholder:text-lg placeholder:font-semibold"
                style={{ background: "rgba(255,255,255,.12)", border: "1.5px solid rgba(255,255,255,.28)" }} />
              <motion.button type="button" onClick={onConfirmarManual} disabled={!podeConfirmar} whileTap={podeConfirmar ? { scale: 0.97 } : undefined}
                className="w-full h-[52px] mt-3 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "#fff", color: "#0B4F9E" }}>Continuar <ArrowRight size={17} /></motion.button>
              <p className="text-[11px] text-white/60 text-center mt-2">{manualCode.length > 0 && manualCode.length < 4 ? "Mínimo de 4 dígitos." : "Ela precisa estar pré-cadastrada pelo encarregado ou pelo CPD."}</p>
            </motion.div>
          ) : (
            <motion.p key="camera" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-4 text-[13px] text-white/80 text-center leading-snug">
              O código fica na frente do crachá. Se estiver sem luz, ligue a lanterna. Na horizontal ou na vertical, tanto faz.
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* procurando a matrícula depois de bipar */}
      <AnimatePresence>
        {ocupado && (
          <motion.div key="ocupado" className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(4,15,34,.8)", backdropFilter: "blur(6px)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14 }} className="h-16 w-16 rounded-full bg-white flex items-center justify-center">
              <Loader2 className="animate-spin" size={28} color="#0B4F9E" />
            </motion.div>
            <p className="text-sm font-bold">Procurando sua matrícula…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

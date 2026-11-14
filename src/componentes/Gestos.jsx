// Lei de Jakob: gestos que a pessoa já conhece de outros apps. Só celular/tablet (toque).
//  - puxar a tela para baixo no topo = atualizar os dados
//  - deslizar da borda esquerda para a direita = voltar (como no iPhone)
// A lógica de decisão está em lib/gestos.js (testada). Os indicadores são atualizados direto no DOM (sem re-render a cada pixel).
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { BLUE, RED_DARK } from "../lib/constantes";
import { LIMITE_PUXAR, puxada, passouDoLimite, gestoDeVoltar, BORDA_PX } from "../lib/gestos";

// Fora do toque: campos de texto, vídeo/câmera, qualquer coisa marcada com data-sem-gesto, e tudo que está em camada fixa (folhas, modais, barra de baixo)
function bloqueado(alvo, raiz) {
  let el = alvo;
  while (el && el !== raiz && el !== document.body) {
    if (el.nodeType === 1) {
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "VIDEO" || tag === "CANVAS") return true;
      if (el.hasAttribute && el.hasAttribute("data-sem-gesto")) return true;
      const cs = window.getComputedStyle(el);
      if (cs.position === "fixed") return true;
      if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true; // lista rolando por dentro
    }
    el = el.parentElement;
  }
  return false;
}

export function Gestos({ T, ligado, podeVoltar, onVoltar, onAtualizar }) {
  const refs = useRef({});
  refs.current = { ligado, podeVoltar, onVoltar, onAtualizar };
  const puxarEl = useRef(null), voltarEl = useRef(null);

  useEffect(() => {
    const raiz = document.getElementById("root");
    if (!raiz || !("ontouchstart" in window)) return;
    let g = null, atualizando = false;
    const reduzir = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const pintaPuxar = (px, girando, pronto) => {
      const e = puxarEl.current; if (!e) return;
      e.style.opacity = px > 4 || girando ? "1" : "0";
      e.style.transform = `translate(-50%, ${px - 44}px)`;
      e.style.transition = g ? "none" : (reduzir ? "none" : "transform .22s ease, opacity .2s ease");
      const seta = e.firstElementChild;
      if (seta) { seta.style.transform = `rotate(${pronto ? 180 : Math.min(180, (px / LIMITE_PUXAR) * 180)}deg)`; seta.style.animation = girando && !reduzir ? "gestoGira .8s linear infinite" : "none"; }
    };
    const pintaVoltar = (px) => {
      const e = voltarEl.current; if (!e) return;
      e.style.opacity = px > 6 ? "1" : "0";
      e.style.transform = `translate(${Math.min(px, 90) - 40}px, -50%)`;
      e.style.transition = g ? "none" : (reduzir ? "none" : "transform .2s ease, opacity .2s ease");
    };
    const inicio = (ev) => {
      const r = refs.current;
      if (!r.ligado || atualizando || ev.touches.length !== 1) { g = null; return; }
      const t = ev.touches[0];
      const borda = r.podeVoltar && t.clientX <= BORDA_PX;
      const alvoEl = ev.target && ev.target.closest ? ev.target.closest("input,textarea,select,video,canvas,[data-sem-gesto]") : null;
      const topo = raiz.scrollTop <= 0 && !bloqueado(ev.target, raiz);
      g = ((borda && !alvoEl) || topo) ? { x0: t.clientX, y0: t.clientY, dx: 0, dy: 0, modo: borda ? "voltar" : "puxar", travado: false, pronto: false } : null;
    };
    const mover = (ev) => {
      if (!g || ev.touches.length !== 1) return;
      const t = ev.touches[0];
      g.dx = t.clientX - g.x0; g.dy = t.clientY - g.y0;
      if (g.modo === "voltar") { if (g.dx > 0 && Math.abs(g.dy) < g.dx * 0.8) pintaVoltar(g.dx * 0.8); else pintaVoltar(0); return; }
      // puxar: só vale se o movimento for para baixo e mais vertical que horizontal; rolou para cima = desiste
      if (!g.travado) {
        if (Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy)) { g = null; return; }
        if (g.dy < -6 || raiz.scrollTop > 0) { g = null; pintaPuxar(0, false, false); return; }
        if (g.dy < 10) return;
        g.travado = true;
      }
      const px = puxada(g.dy);
      const pronto = passouDoLimite(g.dy);
      if (pronto && !g.pronto) { try { navigator.vibrate && navigator.vibrate(8); } catch { /* sem vibração */ } }
      g.pronto = pronto;
      pintaPuxar(px, false, pronto);
    };
    const fim = async () => {
      const x = g; g = null;
      if (!x) return;
      if (x.modo === "voltar") { pintaVoltar(0); if (gestoDeVoltar(x)) refs.current.onVoltar && refs.current.onVoltar(); return; }
      if (!x.travado) return;
      if (passouDoLimite(x.dy) && refs.current.onAtualizar) {
        atualizando = true; pintaPuxar(LIMITE_PUXAR * 0.8, true, false);
        try { await refs.current.onAtualizar(); } catch { /* o aviso de erro é de quem atualiza */ }
        atualizando = false;
      }
      pintaPuxar(0, false, false);
    };
    const cancela = () => { if (g) { g = null; pintaPuxar(0, false, false); pintaVoltar(0); } };
    raiz.addEventListener("touchstart", inicio, { passive: true });
    raiz.addEventListener("touchmove", mover, { passive: true });
    raiz.addEventListener("touchend", fim, { passive: true });
    raiz.addEventListener("touchcancel", cancela, { passive: true });
    return () => {
      raiz.removeEventListener("touchstart", inicio); raiz.removeEventListener("touchmove", mover);
      raiz.removeEventListener("touchend", fim); raiz.removeEventListener("touchcancel", cancela);
    };
  }, []);

  if (typeof document === "undefined" || !("ontouchstart" in window)) return null;
  const bola = { background: T.card, color: BLUE, boxShadow: "0 6px 18px rgba(6,28,58,.25)", border: `1px solid ${T.border}` };
  return createPortal(
    <>
      <style>{"@keyframes gestoGira{to{transform:rotate(360deg)}}"}</style>
      <div ref={puxarEl} aria-hidden="true" data-sem-gesto style={{ ...bola, position: "fixed", left: "50%", top: "calc(env(safe-area-inset-top) + 8px)", width: 38, height: 38, borderRadius: 19, zIndex: 90, opacity: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", transform: "translate(-50%, -44px)" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ transformOrigin: "50% 50%" }}><path d="M12 5v13M6 13l6 6 6-6" /></svg>
      </div>
      <div ref={voltarEl} aria-hidden="true" data-sem-gesto style={{ ...bola, color: RED_DARK, position: "fixed", left: 0, top: "50%", width: 38, height: 38, borderRadius: 19, zIndex: 90, opacity: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", transform: "translate(-40px, -50%)" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
      </div>
    </>,
    document.body
  );
}

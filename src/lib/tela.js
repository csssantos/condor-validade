// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useEffect } from "react";

// Computador de verdade (tela larga + mouse). Tablet em paisagem tem toque (pointer: coarse), então continua
// com câmera e cadastro. No computador não existe bipe nem lançamento manual: o app vira painel de consulta.
function useMediaQuery(query) {
  const [ok, setOk] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const aoMudar = (e) => setOk(e.matches);
    setOk(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", aoMudar); else mq.addListener(aoMudar);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", aoMudar); else mq.removeListener(aoMudar); };
  }, [query]);
  return ok;
}

function useDesktop() { return useMediaQuery("(min-width: 1024px) and (hover: hover) and (pointer: fine)"); }

// Tela larga (>= 1024px), com ou sem mouse: layout de painel (sidebar + dashboard). Tablet entra aqui.
function useTelaLarga() { return useMediaQuery("(min-width: 1024px)"); }

export { useDesktop, useMediaQuery, useTelaLarga };

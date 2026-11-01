import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// iPhone (app instalado): a altura "100vh" às vezes não inclui a área da barrinha de baixo e sobra uma faixa sem conteúdo.
// Aqui a altura do #root passa a ser a da tela inteira do aparelho.
function ajustarAlturaTela() {
  try {
    const raiz = document.getElementById("root");
    if (!raiz) return;
    const instalado = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    const vertical = window.innerHeight >= window.innerWidth;
    const tela = vertical ? Math.max(window.screen.height, window.screen.width) : Math.min(window.screen.height, window.screen.width);
    const h = instalado ? Math.max(window.innerHeight, tela) : window.innerHeight;
    raiz.style.height = h + "px";
  } catch {}
}
ajustarAlturaTela();
["resize", "orientationchange", "pageshow", "visibilitychange"].forEach(ev => window.addEventListener(ev, () => setTimeout(ajustarAlturaTela, 50)));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registra o service worker (permite instalar como app e funcionar offline)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("Falha ao registrar service worker:", err));
  });
}

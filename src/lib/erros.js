// Monitoramento de erros do app: manda ao servidor (RPC registrar_erro_app) uma linha curta quando algo quebra.
// Nunca envia texto digitado, nome de produto ou dado pessoal: só a mensagem técnica, o trecho da pilha, a tela (caminho),
// a versão do pacote e o navegador resumido. Nunca pode causar novo erro: tudo em try/catch, no máximo 8 por sessão.
import { supabase } from "../supabaseClient";

const MAX_POR_SESSAO = 8;
let enviados = 0;
const vistos = new Set();

// Ruído que não é bug do app (rede ruim, extensões do navegador, avisos do próprio navegador)
const RUIDO = /ResizeObserver loop|^Script error\.?$|Failed to fetch|Load failed|NetworkError|network error|Importing a module script failed|AbortError|The operation was aborted|chrome-extension:|moz-extension:|safari-extension:|Non-Error promise rejection/i;

function versaoDoPacote() {
  try {
    const s = document.querySelector('script[type="module"][src*="/assets/"]');
    const m = s && /\/assets\/([^/?#]+)/.exec(s.getAttribute("src") || "");
    return m ? m[1].slice(0, 40) : "dev";
  } catch { return "?"; }
}
const limpaTexto = (t, n) => String(t ?? "").replace(/\s+/g, " ").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]").slice(0, n);

export function registrarErroApp(erro, origem = "") {
  try {
    if (enviados >= MAX_POR_SESSAO) return;
    const mensagem = limpaTexto((erro && erro.message) || erro, 300);
    if (!mensagem || RUIDO.test(mensagem)) return;
    const chave = mensagem + "|" + origem;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    enviados += 1;
    const pilha = String((erro && erro.stack) || "").split("\n").slice(0, 8).join("\n").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]").slice(0, 1500);
    const ua = (navigator.userAgent || "").replace(/\s+/g, " ").slice(0, 160);
    Promise.resolve(supabase.rpc("registrar_erro_app", {
      p_versao: versaoDoPacote(),
      p_rota: ((origem ? origem + " " : "") + (location.pathname || "")).slice(0, 80),
      p_mensagem: mensagem, p_pilha: pilha, p_navegador: ua,
    })).catch(() => {});
  } catch { /* nunca quebra o app */ }
}

export function iniciarMonitorErros() {
  if (typeof window === "undefined" || window.__bipiMonitorErros) return;
  window.__bipiMonitorErros = true;
  window.addEventListener("error", (e) => registrarErroApp(e.error || e.message, "janela"));
  window.addEventListener("unhandledrejection", (e) => registrarErroApp(e.reason, "promessa"));
}

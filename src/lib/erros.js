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
// Máscara: e-mail e qualquer sequência de 6+ dígitos (matrícula, CPF, código de barras, telefone) nunca vão no log
// Corta ANTES de aplicar as expressões (texto gigante não pode travar a aba) e mascara também token (JWT) e a query das URLs
const limpaTexto = (t, n) => String(t ?? "").slice(0, n * 4).replace(/\s+/g, " ")
  .replace(/eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g, "[token]")
  .replace(/(https?:\/\/[^\s?#)]*)[?#][^\s)]*/g, "$1")
  .replace(/[\w.+-]{1,64}@[\w-]{1,64}\.[\w.-]{1,64}/g, "[e-mail]")
  .replace(/\d[\d .\-/]{4,}\d/g, "[número]").slice(0, n);
// Caminho da tela SEM segredos: /promotor/<marca>/<código> é o acesso permanente do promotor
const rotaSegura = (p) => { const seg = String(p || "/").split("/").filter(Boolean)[0] || ""; return "/" + seg.slice(0, 20); };

export function registrarErroApp(erro, origem = "") {
  try {
    if (enviados >= MAX_POR_SESSAO) return;
    const bruto = (erro && erro.message) || (typeof erro === "string" ? erro : "");
    const mensagem = limpaTexto(bruto, 300);
    if (!mensagem || RUIDO.test(mensagem)) return;   // objeto sem message vira "" e é ignorado ("[object Object]" nunca vai)
    const chave = mensagem.replace(/\d+/g, "#") + "|" + origem;   // id variável na mensagem não gasta a cota inteira
    if (vistos.has(chave)) return;
    vistos.add(chave);
    enviados += 1;
    const pilha = limpaTexto(String((erro && erro.stack) || "").split("\n").slice(0, 8).map((l) => l.slice(0, 300)).join(" | "), 1500);
    const ua = (navigator.userAgent || "").replace(/\s+/g, " ").slice(0, 120);
    // Só quem está logado (sem sessão a RPC nega e gastaria a cota): confere a sessão local antes de enviar
    Promise.resolve(supabase.auth.getSession()).then(({ data }) => {
      if (!data || !data.session) return;
      return supabase.rpc("registrar_erro_app", {
        p_versao: versaoDoPacote(),
        p_rota: ((origem ? origem + " " : "") + rotaSegura(location.pathname)).slice(0, 60),
        p_mensagem: mensagem, p_pilha: pilha, p_navegador: ua,
      });
    }).catch(() => {});
  } catch { /* nunca quebra o app */ }
}

export function iniciarMonitorErros() {
  if (typeof window === "undefined" || window.__bipiMonitorErros) return;
  window.__bipiMonitorErros = true;
  window.addEventListener("error", (e) => registrarErroApp(e.error || e.message, "janela"));
  window.addEventListener("unhandledrejection", (e) => registrarErroApp(e.reason, "promessa"));
}

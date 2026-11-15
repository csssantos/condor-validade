import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não encontradas. Configure o arquivo .env (veja .env.example)."
  );
}

// Freio no próprio aparelho: no máximo ~150 chamadas ao servidor a cada 10 s (acima disso as chamadas esperam
// na fila) e, se o servidor responder 429/503, o app espera antes de insistir. Evita laço de requisições
// travar o app ou derrubar o servidor por bug/abuso. O servidor tem limites próprios (ver supabase-seguranca.sql).
const JANELA_MS = 10000, MAX_JANELA = 150;
let marcas = [], pausaAte = 0;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// REDE QUE BLOQUEIA O SERVIDOR (ex.: rede da empresa): se o endereço do Supabase não responde mas o próprio app abre, as chamadas passam a ir
// por "/supa" no endereço do app (a Vercel repassa ao Supabase; ver vercel.json). Só liga depois de a chamada direta FALHAR (erro de rede ou
// sem resposta em 8 s antes do 1º sucesso) e a mesma chamada funcionar pelo caminho do app; fica lembrado por 6 h e depois testa o direto de novo.
// O cliente continua criado com o endereço direto (a chave da sessão não muda); só o fetch é reescrito.
const CHAVE_PROXY = "avdc_via_proxy";
const VALIDADE_PROXY_MS = 6 * 3600 * 1000;
const TEMPO_DIRETO_MS = 8000;
const podeProxy = typeof window !== "undefined" && /^https:$/.test(window.location.protocol) && !!supabaseUrl;
const BASE_PROXY = podeProxy ? `${window.location.origin}/supa` : "";
const lerProxy = () => { try { const t = Number(localStorage.getItem(CHAVE_PROXY)); return t > 0 && Date.now() - t < VALIDADE_PROXY_MS; } catch { return false; } };
let viaProxy = podeProxy && lerProxy();
let diretoOk = false; // já houve uma resposta direta nesta abertura: sem limite de tempo a partir daí
export const usandoProxy = () => viaProxy;
function gravarProxy(ligado) {
  viaProxy = ligado;
  try { if (ligado) localStorage.setItem(CHAVE_PROXY, String(Date.now())); else localStorage.removeItem(CHAVE_PROXY); } catch { /* sem armazenamento: vale só nesta abertura */ }
}
function urlPeloProxy(url) {
  const s = typeof url === "string" ? url : (url && typeof url.href === "string" ? url.href : "");
  return s && s.startsWith(String(supabaseUrl)) ? BASE_PROXY + s.slice(String(supabaseUrl).length) : null;
}
function comLimite(url, opcoes, ms) {
  // um sinal próprio por tentativa (e respeita o sinal que o app já mandou)
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  const externo = opcoes && opcoes.signal;
  if (externo) { if (externo.aborted) c.abort(); else externo.addEventListener("abort", () => c.abort(), { once: true }); }
  return fetch(url, { ...(opcoes || {}), signal: c.signal }).finally(() => clearTimeout(t));
}
async function buscarComRota(url, opcoes) {
  const viaApp = podeProxy ? urlPeloProxy(url) : null;
  if (!viaApp) return fetch(url, opcoes); // outro endereço (ou sem proxy possível): como sempre
  if (viaProxy) return fetch(viaApp, opcoes);
  if (diretoOk) return fetch(url, opcoes);
  try {
    const r = await comLimite(url, opcoes, TEMPO_DIRETO_MS);
    diretoOk = true;
    return r;
  } catch (e) {
    if (opcoes && opcoes.signal && opcoes.signal.aborted) throw e; // o próprio app cancelou
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw e; // sem internet de verdade
    const r = await fetch(viaApp, opcoes); // se também falhar, o erro original de rede segue para o app
    gravarProxy(true);
    return r;
  }
}
async function fetchComFreio(url, opcoes) {
  for (let i = 0; i < 40; i++) {
    const agora = Date.now();
    marcas = marcas.filter((t) => agora - t < JANELA_MS);
    if (agora >= pausaAte && marcas.length < MAX_JANELA) break;
    await dormir(Math.max(200, Math.min(2000, pausaAte - agora, JANELA_MS - (agora - (marcas[0] || agora)))));
  }
  marcas.push(Date.now());
  const resp = await buscarComRota(url, opcoes);
  if (resp.status === 429 || resp.status === 503) pausaAte = Date.now() + 5000;
  return resp;
}

// O link do e-mail ("esqueci minha senha") chega com #...&type=recovery. O Supabase lê e APAGA esse trecho da barra
// ao iniciar, e o aviso PASSWORD_RECOVERY pode sair antes de qualquer tela escutar. Por isso guardamos aqui, ANTES de criar o cliente.
const hashDoLink = typeof window !== "undefined" ? String(window.location.hash || "") : "";
const buscaDoLink = typeof window !== "undefined" ? String(window.location.search || "") : "";
const CHAVE_RECUPERANDO = "avdc_recuperando";
const lerFlag = () => { try { return localStorage.getItem(CHAVE_RECUPERANDO) === "1"; } catch { return false; } };
// Só vale o link de verdade: fragmento com token E type=recovery (a query sozinha, ?type=recovery, é forjável e NÃO liga a tela).
const linkRecuperacao = /(^|[#&])access_token=/.test(hashDoLink) && /(^|[#&])type=recovery(&|$)/.test(hashDoLink);
// Já tem alguém logado neste aparelho (sessão do Supabase DESTE projeto, não anônima)? Então o link do e-mail NÃO assume a conta sozinho:
// o trecho do link sai da barra e o supabase-js é impedido de lê-lo (detectSessionInUrl:false só neste caso); os tokens ficam SÓ na memória
// (linkPendente) e o app pergunta: "Continuar na minha conta" ou "Sair e usar o link" (usarLinkPendente). O token do link é de uso único:
// por isso ele não pode ser apenas apagado.
const REF_PROJETO = (() => { try { return new URL(String(supabaseUrl)).hostname.split(".")[0]; } catch { return ""; } })();
function jaLogadoNoAparelho() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
      if (REF_PROJETO && k !== `sb-${REF_PROJETO}-auth-token`) continue; // sessão de outro projeto não conta
      const v = JSON.parse(localStorage.getItem(k) || "null");
      if (v && v.refresh_token && v.user && !v.user.is_anonymous) return true;
    }
  } catch { /* sem armazenamento: trata como deslogado */ }
  return false;
}
let linkPendente = null;
// Qualquer link com token no fragmento (recovery, signup, magiclink, invite…) com alguém logado: o tipo vem do fragmento e é forjável,
// então a proteção não pode depender dele (senão trocar type=recovery por magiclink trocaria a conta em silêncio).
const linkComToken = /(^|[#&])access_token=/.test(hashDoLink);
const ignorarLink = linkComToken && jaLogadoNoAparelho();
if (ignorarLink) {
  const q = new URLSearchParams(hashDoLink.replace(/^#/, ""));
  const at = q.get("access_token"), rt = q.get("refresh_token");
  if (at && rt) linkPendente = { access_token: at, refresh_token: rt, recuperacao: q.get("type") === "recovery" };
  try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* ok */ }
}
export const linkIgnoradoLogado = ignorarLink;
export const temLinkPendente = () => !!linkPendente;
// E-mail da conta do link (só para mostrar na tela de confirmação; vem do JWT, que o servidor assinou ao gerar o link).
export const emailDoLinkPendente = () => {
  try {
    const b = linkPendente.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const e = JSON.parse(decodeURIComponent(escape(atob(b + "=".repeat((4 - (b.length % 4)) % 4))))).email;
    return typeof e === "string" ? e.slice(0, 120) : "";
  } catch { return ""; }
};
export const descartarLinkPendente = () => { linkPendente = null; };
const veioDoLink = linkRecuperacao && !ignorarLink;
if (veioDoLink) { try { localStorage.setItem(CHAVE_RECUPERANDO, "1"); } catch { /* sem armazenamento */ } }
// Persistido: se a pessoa recarregar/fechar a aba ANTES de trocar a senha, a tela "Nova senha" volta (a sessão do link continua salva).
export const abriuPorRecuperacao = veioDoLink || lerFlag();
export const limparRecuperacao = () => { try { localStorage.removeItem(CHAVE_RECUPERANDO); } catch { /* ok */ } };
export const linkComErro = /(^|[#&?])error(_code)?=/.test(hashDoLink) || /(^|[#&?])error(_code)?=/.test(buscaDoLink); // ex.: otp_expired (link vencido ou já usado)

// Tempo real não passa pelo caminho do app (a Vercel não repassa conexão contínua): em rede bloqueada ele tenta de novo só a cada 60 s
// e as telas seguem atualizando pelas consultas periódicas que já existem.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchComFreio },
  auth: { detectSessionInUrl: !ignorarLink },
  realtime: { reconnectAfterMs: (tentativas) => (viaProxy ? 60000 : [1000, 2000, 5000, 10000][tentativas - 1] || 10000) },
});

// "Sair e usar o link": confere o link ANTES de sair (se estiver vencido/usado a pessoa continua na conta dela), sai SÓ deste aparelho
// (escopo local), entra com a sessão do link e, se for recuperação, liga a tela "Nova senha" (flag gravada ANTES de entrar).
// Uma única execução por vez: chamadas repetidas devolvem a mesma promessa (efeito do React + botão não se atropelam).
let emUso = null;
export function usarLinkPendente() {
  if (emUso) return emUso;
  emUso = (async () => {
    const t = linkPendente;
    if (!t) return false;
    let flagLigada = false;
    try {
      const { error: eUser } = await supabase.auth.getUser(t.access_token);
      if (eUser) { linkPendente = null; return false; }
      if (t.recuperacao) { try { localStorage.setItem(CHAVE_RECUPERANDO, "1"); flagLigada = true; } catch { /* sem armazenamento */ } }
      await supabase.auth.signOut({ scope: "local" });
      const { error } = await supabase.auth.setSession({ access_token: t.access_token, refresh_token: t.refresh_token });
      if (error) { if (flagLigada) limparRecuperacao(); return false; }
      linkPendente = null;
      return true;
    } catch { if (flagLigada) limparRecuperacao(); return false; }
    finally { emUso = null; }
  })();
  return emUso;
}

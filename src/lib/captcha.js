// Captcha (Cloudflare Turnstile) contra criação de contas por robô.
// Só liga se existir VITE_TURNSTILE_SITEKEY (chave PÚBLICA do site). Sem a chave, tudo funciona como antes.
// Uso: `const captchaToken = await pedirCaptcha();` e passar em `options: { captchaToken }` do Supabase Auth
// (signUp, signInWithPassword, signInAnonymously, resetPasswordForEmail). O Supabase confere o token no servidor
// quando "Attack Protection → CAPTCHA" está ligado no painel (a chave SECRETA fica só lá, nunca no app).
const SITEKEY = (import.meta.env && import.meta.env.VITE_TURNSTILE_SITEKEY) || "";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TEMPO_MS = 25000;

let carregando = null;
function carregarScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (carregando) return carregando;
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT; s.async = true; s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile ausente")));
    s.onerror = () => { carregando = null; reject(new Error("falha ao carregar o captcha")); };
    document.head.appendChild(s);
  });
  return carregando;
}

const MENSAGENS = {
  captcha_indisponivel: "A verificação de segurança não abriu. Se você está na rede da loja, ela pode estar bloqueando: tente pelo 4G ou pelo Wi-Fi do celular.",
  captcha_tempo: "A verificação demorou demais. Toque no botão de novo.",
  captcha_erro: "Não foi possível confirmar que você não é um robô. Tente de novo.",
};
export const MENSAGEM_CAPTCHA = MENSAGENS.captcha_erro;
// Texto para mostrar à pessoa conforme o motivo da falha
export const mensagemCaptcha = (e) => MENSAGENS[e && e.message] || MENSAGEM_CAPTCHA;

const comPrazo = (promessa, ms, aoEstourar) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(aoEstourar()), ms);
  promessa.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

// Devolve o token (string), `undefined` se o captcha está desligado, ou LANÇA erro com `.captcha = true`
// (`e.message` = captcha_indisponivel | captcha_tempo | captcha_erro; use `mensagemCaptcha(e)`).
let emAndamento = null;
export function pedirCaptcha() {
  if (!SITEKEY) return Promise.resolve(undefined);
  // Duas chamadas ao mesmo tempo (toque duplo) compartilham UM desafio: nunca empilha caixas na tela
  if (emAndamento) return emAndamento;
  emAndamento = pedirCaptchaUnico().finally(() => { emAndamento = null; });
  return emAndamento;
}
async function pedirCaptchaUnico() {
  const erro = (m) => Object.assign(new Error(m), { captcha: true });
  let turnstile;
  try { turnstile = await comPrazo(carregarScript(), 12000, () => { carregando = null; return erro("captcha_indisponivel"); }); }
  catch { carregando = null; throw erro("captcha_indisponivel"); }
  return new Promise((resolve, reject) => {
    const caixa = document.createElement("div");
    // "interaction-only": fica invisível e só aparece (centralizada, com aviso) se a Cloudflare precisar de um toque
    caixa.setAttribute("data-captcha", "1");
    caixa.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;z-index:2147483000;";
    document.body.appendChild(caixa);
    let id = null, fim = false, timer = null;
    const limpar = () => {
      if (fim) return; fim = true; clearTimeout(timer);
      try { if (id != null) turnstile.remove(id); } catch { /* ok */ }
      caixa.remove();
    };
    const armar = (ms) => { clearTimeout(timer); timer = setTimeout(() => { limpar(); reject(erro("captcha_tempo")); }, ms); };
    armar(TEMPO_MS);
    try {
      id = turnstile.render(caixa, {
        sitekey: SITEKEY, appearance: "interaction-only", theme: "auto", language: "pt-br", retry: "auto",
        callback: (token) => { limpar(); if (token) resolve(token); else reject(erro("captcha_erro")); },
        "error-callback": () => { limpar(); reject(erro("captcha_erro")); },
        "timeout-callback": () => { limpar(); reject(erro("captcha_tempo")); },
        "before-interactive-callback": () => {
          caixa.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;background:rgba(6,28,58,.72);z-index:2147483000;";
          caixa.setAttribute("role", "dialog"); caixa.setAttribute("aria-label", "Verificação de segurança");
          const msg = document.createElement("p");
          msg.textContent = "Toque na caixa abaixo para confirmar que você é uma pessoa.";
          msg.style.cssText = "color:#fff;font:600 1rem system-ui,sans-serif;text-align:center;margin:0;padding:0 1.5rem;";
          caixa.insertBefore(msg, caixa.firstChild);
          armar(60000);
        },
      });
    } catch { limpar(); reject(erro("captcha_erro")); }
  });
}

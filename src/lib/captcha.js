// Captcha (Cloudflare Turnstile) contra criação de contas por robô.
// Só liga se existir VITE_TURNSTILE_SITEKEY (chave PÚBLICA do site). Sem a chave, tudo funciona como antes.
// Uso: `const captchaToken = await pedirCaptcha();` e passar em `options: { captchaToken }` do Supabase Auth
// (signUp, signInWithPassword, signInAnonymously, resetPasswordForEmail). O Supabase confere o token no servidor
// quando "Attack Protection → CAPTCHA" está ligado no painel (a chave SECRETA fica só lá, nunca no app).
const SITEKEY = (import.meta.env && import.meta.env.VITE_TURNSTILE_SITEKEY) || "";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TEMPO_MS = 25000;

export const captchaLigado = () => !!SITEKEY;

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

// Devolve o token (string), `undefined` se o captcha está desligado, ou LANÇA erro com `.captcha = true`
// (quem chama mostra "Não foi possível confirmar que você não é um robô. Tente de novo.").
export async function pedirCaptcha() {
  if (!SITEKEY) return undefined;
  const erro = (m) => Object.assign(new Error(m), { captcha: true });
  let turnstile;
  try { turnstile = await carregarScript(); } catch { throw erro("captcha_indisponivel"); }
  return new Promise((resolve, reject) => {
    const caixa = document.createElement("div");
    // "interaction-only": fica invisível e só aparece se a Cloudflare precisar de um toque da pessoa
    caixa.style.cssText = "position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:2147483000;";
    caixa.setAttribute("data-captcha", "1");
    document.body.appendChild(caixa);
    let id = null, fim = false;
    const limpar = () => {
      if (fim) return; fim = true; clearTimeout(timer);
      try { if (id != null) turnstile.remove(id); } catch { /* ok */ }
      caixa.remove();
    };
    const timer = setTimeout(() => { limpar(); reject(erro("captcha_tempo")); }, TEMPO_MS);
    try {
      id = turnstile.render(caixa, {
        sitekey: SITEKEY, appearance: "interaction-only", theme: "auto", language: "pt-br", retry: "auto",
        callback: (token) => { limpar(); resolve(token); },
        "error-callback": () => { limpar(); reject(erro("captcha_erro")); },
        "timeout-callback": () => { limpar(); reject(erro("captcha_tempo")); },
      });
    } catch { limpar(); reject(erro("captcha_erro")); }
  });
}

export const MENSAGEM_CAPTCHA = "Não foi possível confirmar que você não é um robô. Confira a internet e tente de novo.";

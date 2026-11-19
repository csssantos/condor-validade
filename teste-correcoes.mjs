// Testes das correções da reunião (18/11): captcha, erros do app, nomes→códigos no Gemini, host do push, selos com ícone, jurídico, CSP.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let esbuild; try { esbuild = require("esbuild"); } catch { esbuild = require("/opt/npm-tools/node_modules/esbuild"); }
const ler = (p) => fs.readFileSync(new URL("./" + p, import.meta.url), "utf8");
let ok = 0; const t = async (n, c) => { await c(); ok++; console.log("ok  ", n); };

// ---- captcha: sem chave não muda nada
const capJs = esbuild.transformSync(ler("src/lib/captcha.js"), { format: "esm", loader: "js" }).code;
await t("captcha: sem VITE_TURNSTILE_SITEKEY devolve undefined (nada muda)", async () => {
  const m = await import("data:text/javascript;base64," + Buffer.from(capJs).toString("base64"));
  assert.equal(m.captchaLigado(), false);
  assert.equal(await m.pedirCaptcha(), undefined);
});
await t("captcha: token pedido em signUp, login, recuperação, anônimo e reautenticação", () => {
  const a = ler("src/telas/AuthScreen.jsx");
  assert.equal((a.match(/pedirCaptcha\(\)/g) || []).length, 4, "AuthScreen: signUp, login pós-cadastro, entrar, recuperar");
  assert.match(a, /signUp\(\{[\s\S]{0,200}captchaToken/);
  assert.match(a, /signInWithPassword\(\{ email: email\.trim\(\), password: senha, options: \{ captchaToken \} \}\)/);
  assert.match(a, /resetPasswordForEmail\(email\.trim\(\), \{ redirectTo: SITE_URL, captchaToken \}\)/);
  assert.match(ler("src/App.jsx"), /signInAnonymously\(\{ options: \{ captchaToken \} \}\)/);
  assert.match(ler("src/telas/mais/Conta.jsx"), /signInWithPassword\(\{ email: emailAtual, password: senha, options: \{ captchaToken \} \}\)/);
});
await t("captcha: CSP libera só o Cloudflare (script e frame), não abre o resto", () => {
  const csp = JSON.parse(ler("vercel.json")).headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy" && /default-src 'self'/.test(h.value)).value;
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval' https:\/\/challenges\.cloudflare\.com;/);
  assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com;/);
  assert.ok(!/script-src[^;]*\*/.test(csp), "sem curinga em script-src");
  assert.ok(!/unsafe-inline[^;]*;[^]*script/.test(csp.split("style-src")[0]), "script sem unsafe-inline");
});

// ---- erros do app: ruído, e-mail, limite e dedupe
await t("erros: filtro de ruído, e-mail mascarado e teto por sessão", async () => {
  const js = esbuild.transformSync(ler("src/lib/erros.js").replace('import { supabase } from "../supabaseClient";', "const supabase = globalThis.__sb;"), { format: "esm", loader: "js" }).code;
  const chamadas = []; globalThis.__sb = { rpc: (n, a) => { chamadas.push([n, a]); return Promise.resolve({}); } };
  globalThis.document = { querySelector: () => ({ getAttribute: () => "/assets/index-abc123.js" }) };
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Teste UA" }, configurable: true }); globalThis.location = { pathname: "/produto" };
  const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
  m.registrarErroApp(new Error("Failed to fetch")); m.registrarErroApp("ResizeObserver loop limit exceeded"); m.registrarErroApp(new Error("Load failed"));
  assert.equal(chamadas.length, 0, "ruído de rede não é enviado");
  m.registrarErroApp(new Error("falha com joao@exemplo.com na tela"));
  assert.equal(chamadas.length, 1);
  assert.ok(!JSON.stringify(chamadas[0][1]).includes("joao@exemplo.com"), "e-mail mascarado");
  assert.equal(chamadas[0][1].p_versao, "index-abc123.js");
  m.registrarErroApp(new Error("falha com joao@exemplo.com na tela"));
  assert.equal(chamadas.length, 1, "mesmo erro não repete");
  for (let i = 0; i < 20; i++) m.registrarErroApp(new Error("erro diferente " + i));
  assert.equal(chamadas.length, 8, "no máximo 8 por sessão");
});
await t("erros: SQL fechado (sem acesso direto, só DEV lê, cron de 30 dias, anon sem execute)", () => {
  const q = ler("supabase-erros-app.sql");
  assert.match(q, /revoke all on public\.erros_app from public, anon, authenticated/);
  assert.match(q, /nivel_do_usuario\(\), 99\) > 1 then raise exception 'sem_permissao'/);
  assert.match(q, /interval '30 days'/); assert.match(q, /rl_checar\('erro_app', 12\)/);
  assert.match(q, /revoke all on function public\.registrar_erro_app\(text, text, text, text, text\) from public, anon/);
  assert.match(ler("src/componentes/ErrorBoundary.jsx"), /registrarErroApp\(erro, "tela"\)/);
  assert.match(ler("src/main.jsx"), /iniciarMonitorErros\(\)/);
});

// ---- Gemini nunca recebe nome
await t("assistente-ia: nomes viram 'Pessoa N' estáveis; tabela do usuário segue com nome real", async () => {
  const src = ler("supabase/functions/assistente-ia/index.ts");
  const ini = src.indexOf("const pessoasPorCtx"), fim = src.indexOf("async function executar");
  const js = esbuild.transformSync(src.slice(ini, fim), { loader: "ts" }).code + "\nreturn codigoPessoa;";
  const cod = new Function(js)();
  const c1 = {}, c2 = {};
  assert.equal(cod(c1, "Maria Souza"), "Pessoa 1"); assert.equal(cod(c1, "João"), "Pessoa 2");
  assert.equal(cod(c1, " maria souza "), "Pessoa 1", "mesma pessoa, mesmo código (sem diferenciar caixa/espaço)");
  assert.equal(cod(c2, "João"), "Pessoa 1", "contagem por conversa");
  assert.equal(cod(c1, ""), ""); assert.equal(cod(c1, null), "");
  // todo ponto que devolve nome ao modelo usa o código
  assert.match(src, /responsavel_nome: codigoPessoa\(c, t\.responsavel_nome\)/);
  assert.match(src, /por: codigoPessoa\(c, x\.conferido_por\)/);
  assert.match(src, /criado_por_nome: codigoPessoa\(c, r\.criado_por_nome\)/);
  assert.match(src, /lancamentos: paraModelo/);
  assert.ok(!/lancamentos: linhas/.test(src), "o modelo não recebe as linhas com nome real");
  assert.match(src, /c\.tabelas\.push\(\{[^\n]*linhas \}\)/, "a tabela do usuário continua com as linhas reais");
});

// ---- push: host
await t("salvar_push: só provedores conhecidos e fcm:, com auto-teste e sem anon", () => {
  const q = ler("supabase-push-host.sql");
  assert.match(q, /if not public\._push_endpoint_ok\(p_endpoint\) then raise exception 'endpoint_invalido'/);
  for (const h of ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "notify\\\\.windows\\\\.com"]) assert.ok(q.includes(h.replace(/\\\\/g, "\\")), h);
  assert.match(q, /revoke all on function public\._push_endpoint_ok\(text\) from public, anon, authenticated/);
  assert.match(q, /AUTO-TESTE FALHOU/);
});

// ---- selos com ícone
await t("selos de status têm ícone + texto em todas as telas", () => {
  for (const f of ["src/componentes/ui.jsx", "src/componentes/ItemCards.jsx", "src/telas/Home.jsx", "src/telas/Setores.jsx", "src/telas/ProdutoDetalhe.jsx"]) {
    const s = ler(f); assert.match(s, /import \{ IconeNivel \}/, f); assert.match(s, /<IconeNivel level=/, f);
  }
  const ic = ler("src/componentes/IconeNivel.jsx");
  for (const n of ["XCircle", "AlertTriangle", "Clock", "CheckCircle2"]) assert.ok(ic.includes(n));
  assert.match(ic, /aria-hidden/);
});

// ---- jurídico
await t("Legal: versão nova, Turnstile, erros 30 dias, Gemini com códigos e crédito OFF; Sobre tem o crédito", () => {
  const l = ler("src/Legal.jsx");
  assert.match(l, /TERMOS_VERSAO = "2026-11-18"/); assert.match(l, /versao: "2026-11-18"/);
  for (const k of ["Cloudflare Turnstile", "apagado em 30 dias", "códigos (“Pessoa 1”", "ODbL e CC BY-SA"]) assert.ok(l.includes(k), k);
  assert.match(ler("src/telas/mais/Paginas.jsx"), /<CreditoOFF T=\{T\} \/>[\s\S]*<CreditoOFF T=\{T\} \/>/);
  assert.match(ler("src/componentes/Novidades.jsx"), /id: "2026-11-18-seguranca"/);
});

console.log(`teste-correcoes: ${ok} ok, 0 falha(s)`);

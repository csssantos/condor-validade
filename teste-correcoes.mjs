// Testes das correções da reunião (18/11): captcha, erros do app, nomes→códigos no Gemini, host do push, selos com ícone, jurídico, CSP.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let esbuild; try { esbuild = require("esbuild"); } catch { esbuild = require("/opt/npm-tools/node_modules/esbuild"); }
const ler = (p) => fs.readFileSync(new URL("./" + p, import.meta.url), "utf8");
let ok = 0; const t = async (n, c) => { await c(); ok++; console.log("ok  ", n); };

// ---- captcha: sem chave não muda nada; com chave, comportamento com Turnstile simulado
const capJs = esbuild.transformSync(ler("src/lib/captcha.js"), { format: "esm", loader: "js" }).code;
const capMod = (chave) => import("data:text/javascript;base64," + Buffer.from(capJs.replace(/const SITEKEY = .*;/, "const SITEKEY = " + JSON.stringify(chave || "") + ";")).toString("base64") + "#" + Math.random());
const falsoDom = (turnstile) => {
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, insertBefore() {}, remove() {}, firstChild: null });
  globalThis.window = { turnstile }; globalThis.document = { createElement: el, body: { appendChild() {} }, head: { appendChild() {} } };
};
await t("captcha: sem VITE_TURNSTILE_SITEKEY devolve undefined (nada muda)", async () => {
  const m = await capMod(null);
  assert.equal(await m.pedirCaptcha(), undefined);
});
await t("captcha: com chave devolve o token; token vazio e erro viram erro de captcha; duas chamadas dividem 1 desafio", async () => {
  let renders = 0, cfg;
  falsoDom({ render: (_c, o) => { renders++; cfg = o; return "id1"; }, remove() {} });
  const m = await capMod("chave-teste");
  const p1 = m.pedirCaptcha(), p2 = m.pedirCaptcha();
  await new Promise((r) => setTimeout(r, 5));
  cfg.callback("TOKEN123");
  assert.equal(await p1, "TOKEN123"); assert.equal(await p2, "TOKEN123"); assert.equal(renders, 1, "toque duplo não empilha caixas");
  const p3 = m.pedirCaptcha(); await new Promise((r) => setTimeout(r, 5)); cfg.callback("");
  await assert.rejects(p3, (e) => e.captcha === true && e.message === "captcha_erro", "token vazio é erro");
  const p4 = m.pedirCaptcha(); await new Promise((r) => setTimeout(r, 5)); cfg["error-callback"]();
  await assert.rejects(p4, (e) => e.message === "captcha_erro");
  assert.match(m.mensagemCaptcha(new Error("captcha_indisponivel")), /rede da loja/);
  delete globalThis.window; delete globalThis.document;
});
await t("captcha: token pedido em signUp, login, recuperação, anônimo e reautenticação", () => {
  const a = ler("src/telas/AuthScreen.jsx");
  assert.match(ler("src/telas/Gestao.jsx"), /resetPasswordForEmail\(u\.email, \{ redirectTo: SITE_URL, captchaToken \}\)/);
  assert.equal((a.match(/pedirCaptcha\(\)/g) || []).length, 3, "AuthScreen: cadastro, entrar, recuperar");
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
await t("erros: ruído, e-mail/número/token mascarados, rota sem segredo, texto gigante rápido, teto por sessão", async () => {
  const js = esbuild.transformSync(ler("src/lib/erros.js").replace('import { supabase } from "../supabaseClient";', "const supabase = globalThis.__sb;"), { format: "esm", loader: "js" }).code;
  const chamadas = []; globalThis.__sb = { auth: { getSession: () => Promise.resolve({ data: { session: { ok: 1 } } }) }, rpc: (n, a) => { chamadas.push([n, a]); return Promise.resolve({}); } };
  globalThis.document = { querySelector: () => ({ getAttribute: () => "/assets/index-abc123.js" }) };
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Teste UA" }, configurable: true });
  Object.defineProperty(globalThis, "location", { value: { pathname: "/produto" }, configurable: true });
  const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
  const tick = () => new Promise((r) => setTimeout(r, 10));
  m.registrarErroApp(new Error("Failed to fetch")); m.registrarErroApp("ResizeObserver loop limit exceeded"); m.registrarErroApp(new Error("Load failed")); m.registrarErroApp({ qualquer: 1 }); m.registrarErroApp(null);
  await tick(); assert.equal(chamadas.length, 0, "ruído de rede e objeto sem mensagem não são enviados");
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcdefghijk";
  const e1 = new Error("falha com joao@exemplo.com, matrícula 123456 e código 7891234567890 token " + jwt);
  e1.stack = "Error: x\n at f (https://app.usebipi.com/assets/a.js?token=segredo123&x=1:10:5)";
  m.registrarErroApp(e1);
  await tick(); assert.equal(chamadas.length, 1);
  const env = JSON.stringify(chamadas[0][1]);
  for (const proibido of ["joao@exemplo.com", "123456", "7891234567890", "eyJhbGci", "segredo123"]) assert.ok(!env.includes(proibido), proibido + " não pode ir no log");
  assert.equal(chamadas[0][1].p_versao, "index-abc123.js");
  m.registrarErroApp(e1); await tick(); assert.equal(chamadas.length, 1, "mesmo erro não repete");
  Object.defineProperty(globalThis, "location", { value: { pathname: "/promotor/BAUDUCCO/ABC-1234567890" }, configurable: true });
  m.registrarErroApp(new Error("erro na rota do promotor")); await tick();
  const rota = JSON.stringify(chamadas[1][1]);
  assert.ok(!rota.includes("ABC-1234567890") && !rota.includes("BAUDUCCO") && chamadas[1][1].p_rota === "/promotor", "código do convite do promotor nunca vai no log");
  // texto gigante não trava a aba
  const t0 = Date.now(); m.registrarErroApp(new Error("a".repeat(1_000_000))); await tick();
  assert.ok(Date.now() - t0 < 1500, "texto de 1 MB tratado em menos de 1,5 s");
  // mesmo erro com número diferente na mensagem conta como um só
  m.registrarErroApp(new Error("falha no item 11")); m.registrarErroApp(new Error("falha no item 22")); await tick();
  assert.equal(chamadas.filter((c) => /falha no item/.test(c[1].p_mensagem)).length, 1, "id variável não gasta a cota");
  const antes = chamadas.length;
  for (const w of ["alfa", "beta", "gama", "delta", "epsilon", "zeta", "eta", "teta"]) m.registrarErroApp(new Error("erro " + w));
  await tick(); assert.equal(chamadas.length, 8, "no máximo 8 por sessão"); assert.ok(chamadas.length >= antes);
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
await t("assistente-ia: nomes viram 'Pessoa XXXX' estáveis (sem diferenciar caixa/acento/espaço); tabela do usuário segue com nome real", async () => {
  const src = ler("supabase/functions/assistente-ia/index.ts");
  const ini = src.indexOf("const semAcento"), fim = src.indexOf("async function executar");
  assert.ok(ini > 0 && fim > ini, "trecho do codigoPessoa encontrado");
  const js = esbuild.transformSync(src.slice(ini, fim), { loader: "ts" }).code + "\nreturn { codigoPessoa, mascarar: typeof mascarar === 'function' ? mascarar : null };";
  const { codigoPessoa: cod } = new Function(js)();
  const c1 = { loja: 1 }, c2 = { loja: 1 }, c3 = { loja: 2 };
  const maria = cod(c1, "Maria Souza");
  assert.match(maria, /^Pessoa [0-9A-Z]{4}$/);
  assert.equal(cod(c2, " maria  souza - "), cod(c2, "Maria Souza - ") , "caixa e espaços não mudam o código");
  assert.equal(cod(c1, "João"), cod(c1, "joao"), "acento não muda o código");
  assert.equal(cod(c1, "Maria Souza"), maria, "mesma pessoa, mesmo código (entre conversas)");
  assert.notEqual(cod(c1, "Maria Souza"), cod(c1, "João"));
  assert.notEqual(cod(c3, "Maria Souza"), maria, "outra loja, outro código");
  assert.equal(cod(c1, ""), ""); assert.equal(cod(c1, null), ""); assert.equal(cod(c1, undefined), "");
  // todo ponto que devolve nome ao modelo usa o código
  assert.match(src, /await protegerPessoas\(c, \{ rondas: data \}\)/, "rondas passam pela proteção");
  assert.match(src, /return await protegerPessoas\(c, \{ total: \(data as any\[\]\)\?\.length \|\| 0, tarefas/, "tarefas passam pela proteção");
  assert.match(src, /por: codigoPessoa\(c, x\.conferido_por\)/);
  const campos = /const CAMPOS_NOME = new Set\(\[([^\]]*)\]/.exec(src)[1];
  for (const k of ["responsavel_nome", "criado_por_nome", "conferido_por", "lancado_por", "cadastrado_por"]) assert.ok(campos.includes('"' + k + '"'), k + " coberto");
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
  for (const k of ["Cloudflare Turnstile", "apagado em 30 dias", "códigos (por exemplo, “Pessoa A7K2”", "ODbL e CC BY-SA"]) assert.ok(l.includes(k), k);
  assert.match(ler("src/telas/mais/Paginas.jsx"), /<CreditoOFF T=\{T\} dark=\{dark\} \/>[\s\S]*<CreditoOFF T=\{T\} dark=\{dark\} \/>/);
  assert.match(ler("src/componentes/Novidades.jsx"), /id: "2026-11-18-seguranca"/);
});

console.log(`teste-correcoes: ${ok} ok, 0 falha(s)`);

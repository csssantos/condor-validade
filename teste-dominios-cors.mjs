// Testa o COMPORTAMENTO real do CORS das funções de aviso/desvinculação (carrega o código verdadeiro com Deno falso).
// Cobre: origem nova/antiga/hostil/ausente, OPTIONS/POST/GET, APP_URL válido e inválido e requisições SIMULTÂNEAS (corrida).
// Rodar na raiz do repositório: node teste-dominios-cors.mjs
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const raiz = new URL(".", import.meta.url).pathname;
const ESB = ["/opt/npm-tools/node_modules/esbuild/bin/esbuild", "node_modules/.bin/esbuild"].find((p) => { try { readFileSync(p.startsWith("/") ? p : raiz + p); return true; } catch { return false; } }) || "esbuild";
const A = "https://condor-validade.vercel.app", N = "https://app.usebipi.com";
function carregar(func, appUrl) {
  let js = execSync(`${ESB} --loader=ts`, { encoding: "utf8", input: readFileSync(`${raiz}supabase/functions/${func}/index.ts`, "utf8") }).replace(/^import .*$/gm, "");
  let handler; const avisos = [];
  const Deno = { env: { get: (k) => (k === "APP_URL" ? appUrl : k === "SUPABASE_URL" ? "http://x" : "k") }, serve: (h) => { handler = h; } };
  const chain = new Proxy(function () {}, { get: (t, p) => (p === "then" ? undefined : chain), apply: () => chain });
  const createClient = () => ({ auth: { getUser: async () => { await new Promise((r) => setTimeout(r, 5)); return { data: { user: null }, error: {} }; } }, from: () => chain, rpc: async () => ({ data: null, error: { message: "x" } }) });
  new Function("Deno", "createClient", "fetch", "console", js)(Deno, createClient, async () => ({ ok: false, json: async () => ({}), text: async () => "" }), { warn: (m) => avisos.push(m), log() {}, error() {} });
  handler.avisos = avisos; return handler;
}
const req = (m, o) => new Request("http://x/f", { method: m, headers: o === undefined ? {} : { origin: o, authorization: "Bearer x" }, body: m === "POST" ? "{}" : undefined });
const ao = async (h, m, o) => (await h(req(m, o))).headers.get("access-control-allow-origin");
let ok = 0, falhas = 0; const t = async (n, fn) => { try { await fn(); ok++; console.log("ok  ", n); } catch (e) { falhas++; console.log("FALHA", n, "\n     ", e.message); } };
for (const f of ["telegram-avisar", "telegram-avisar-pedido", "telegram-desvincular"]) {
  await t(`${f}: origem nova e antiga são ecoadas em OPTIONS/POST/GET; hostil, ausente, null e maiúscula caem no SITE`, async () => {
    const h = carregar(f, undefined);
    for (const m of ["OPTIONS", "POST", "GET"]) {
      assert.equal(await ao(h, m, N), N); assert.equal(await ao(h, m, A), A);
      for (const o of ["https://evil.com", undefined, "null", N.toUpperCase()]) assert.equal(await ao(h, m, o), A, `${m} ${o}`);
    }
    assert.equal((await h(req("OPTIONS", N))).status, 204); assert.equal((await h(req("POST", N))).headers.get("vary"), "Origin");
  });
  await t(`${f}: com APP_URL=novo, origem hostil cai no novo e a antiga continua ecoada`, async () => { const h = carregar(f, N); assert.equal(await ao(h, "POST", "https://evil.com"), N); assert.equal(await ao(h, "POST", A), A); });
  await t(`${f}: APP_URL inválido é ignorado (cai no antigo) e deixa aviso no log`, async () => {
    for (const v of [N + "/", N.toUpperCase(), "app.usebipi.com", "http://app.usebipi.com", "https://evil.com"]) { const h = carregar(f, v); assert.equal(await ao(h, "POST", undefined), A, v); assert.equal(h.avisos.length, 1, v); }
  });
  await t(`${f}: requisições SIMULTÂNEAS de origens diferentes não misturam o cabeçalho (corrida)`, async () => {
    const h = carregar(f, undefined); const mk = (o) => new Request("http://x/f", { method: "POST", headers: { origin: o, authorization: "Bearer x", "content-type": "application/json" }, body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }) });
    for (let i = 0; i < 20; i++) { const [rA, rB] = await Promise.all([h(mk(A)), h(mk(N))]); assert.equal(rA.headers.get("access-control-allow-origin"), A); assert.equal(rB.headers.get("access-control-allow-origin"), N); }
  });
}
console.log(`\n${ok} ok, ${falhas} falhas`); process.exit(falhas ? 1 : 0);

// Testes da arquitetura de domínios: app.usebipi.com (app) + domínio antigo da Vercel durante a transição.
// Rodar: node teste-dominios.mjs
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
let ok = 0, falhas = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log("ok  ", nome); } catch (e) { falhas++; console.log("FALHA", nome, "\n     ", e.message); } };
const ler = (p) => readFileSync(p, "utf8");
const F = "supabase/functions";
const ANTIGO = "https://condor-validade.vercel.app", NOVO = "https://app.usebipi.com";

const regexDe = (arq) => { const m = ler(`${F}/${arq}/index.ts`).match(/const ORIGEM_OK = (\/.*\/);/); assert.ok(m, arq); return eval(m[1]); };
for (const f of ["assistente-ia", "identificar-produto", "enviar-push"]) {
  t(`CORS ${f}: aceita app novo, app antigo, previews da Vercel e localhost`, () => {
    const r = regexDe(f);
    for (const o of [NOVO, ANTIGO, "https://condor-validade-git-x-user.vercel.app", "http://localhost:5173", "http://localhost"]) assert.ok(r.test(o), o);
  });
  t(`CORS ${f}: recusa domínios parecidos, http no app novo, raiz institucional e curingas`, () => {
    const r = regexDe(f);
    for (const o of ["https://app.usebipi.com.malicioso.com", "https://malicioso-app.usebipi.com", "https://x.app.usebipi.com", "http://app.usebipi.com", "https://usebipi.com", "https://app.usebipi.com:8443", "https://app.usebipi.com@malicioso.com", "https://app-usebipi.com", "https://mail.usebipi.com", "null", "", "https://usibip.com", "https://app.usebipe.com"]) assert.ok(!r.test(o), o);
  });
}

const hostis = ["https://evil.com#" + NOVO, "https://evil.com/" + NOVO, "https://evil.com?x=" + NOVO, "x" + NOVO, NOVO + "\n", "\n" + NOVO, NOVO + "/", NOVO + " ", " " + NOVO, NOVO.toUpperCase(), "https://APP.usebipi.com", "https://app.usebipi.com.", "https://app%2eusebipi.com", "https://appXusebipi.com", "https://app.usebipi.co", "https://\u0430pp.usebipi.com", "https://app.usebipi.com\u0000", "HTTPS://app.usebipi.com", "https://app.usebipi.com:443", "http://localhost.evil.com", "http://localhost:80a", "http://localhost:", "https://condor-validade.vercel.app.evil.com", "https://condor-validadeXvercel.app", "https://condor-validade-x.vercel-app"];
for (const f of ["assistente-ia", "identificar-produto", "enviar-push"]) t(`CORS ${f}: âncoras ^ e $, ponto escapado, sem injeção de prefixo/sufixo (${hostis.length} casos)`, () => { const r = regexDe(f); for (const o of hostis) assert.ok(!r.test(o), JSON.stringify(o)); });
const comSites = ["telegram-bot", "telegram-avisar", "telegram-avisar-pedido", "telegram-desvincular"];
const siteCom = (f, appUrl) => { // executa só o bloco SITES/SITE/APP_URL da função, com Deno.env e console falsos
  const fonte = ler(`${F}/${f}/index.ts`); const a = fonte.indexOf("const SITES"), fim = fonte.indexOf("\n", fonte.indexOf("console.warn(\"APP_URL ignorado")); assert.ok(a > 0 && fim > a, f);
  const avisos = []; const r = new Function("Deno", "console", `${fonte.slice(a, fim)}; return {SITES, SITE};`)({ env: { get: (k) => (k === "APP_URL" ? appUrl : undefined) } }, { warn: (m) => avisos.push(m) });
  return { ...r, avisos };
};
for (const f of comSites) {
  t(`SITE ${f}: sem APP_URL fica no domínio antigo (nada muda até o secret ser definido)`, () => { const r = siteCom(f, undefined); assert.equal(r.SITE, ANTIGO); assert.deepEqual(r.SITES, [ANTIGO, NOVO]); });
  t(`SITE ${f}: APP_URL=app.usebipi.com muda para o novo; qualquer outro valor é ignorado`, () => {
    assert.equal(siteCom(f, NOVO).SITE, NOVO);
    for (const v of ["https://malicioso.com", "http://app.usebipi.com", "https://app.usebipi.com/", "https://usebipi.com", "HTTPS://APP.USEBIPI.COM", "app.usebipi.com", ""]) assert.equal(siteCom(f, v).SITE, ANTIGO, v);
    assert.equal(siteCom(f, "  https://app.usebipi.com \n").SITE, NOVO, "espaços nas pontas são aceitos");
  });
  t(`SITE ${f}: APP_URL inválido gera aviso no log (nunca falha em silêncio); válido ou ausente não avisa`, () => {
    assert.equal(siteCom(f, "https://app.usebipi.com/").avisos.length, 1); assert.equal(siteCom(f, "https://malicioso.com").avisos.length, 1);
    assert.equal(siteCom(f, NOVO).avisos.length, 0); assert.equal(siteCom(f, undefined).avisos.length, 0); assert.ok(!/malicioso/.test(siteCom(f, "https://malicioso.com").avisos[0]), "o aviso não repete o valor recebido");
  });
}
for (const f of ["telegram-avisar", "telegram-avisar-pedido", "telegram-desvincular"]) {
  t(`CORS ${f}: devolve a origem de quem chamou se for o app novo ou o antigo; senão o SITE (nunca *)`, () => {
    const s = ler(`${F}/${f}/index.ts`);
    assert.ok(/SITES\.includes\(origem\) \? origem : SITE/.test(s)); assert.ok(!/^let cors/m.test(s), "cors não pode ser variável de módulo (corrida entre requisições)"); assert.ok(!/Access-Control-Allow-Origin": "\*"/.test(s)); assert.ok(/"Vary": "Origin"/.test(s));
  });
}

for (const f of ["telegram-avisar", "telegram-avisar-pedido", "telegram-desvincular"]) {
  t(`${f}: a foto do banner usa ${"${SITE}"} (nunca o domínio antigo fixo)`, () => { const x = ler(`${F}/${f}/index.ts`); assert.ok(/photo: `\$\{SITE\}\/bot\//.test(x)); assert.ok(!/photo: ["`']https?:\/\/condor/.test(x)); });
}
const vj = JSON.parse(ler("vercel.json")); const hd = Object.fromEntries(vj.headers[0].headers.map((h) => [h.key, h.value]));
t("CSP: o app novo funciona com 'self' (sem domínio fixo), sem eval e sem curinga em script/connect", () => {
  const csp = hd["Content-Security-Policy"]; assert.ok(/default-src 'self'/.test(csp)); assert.ok(!/'unsafe-eval'/.test(csp)); assert.ok(!/(script|connect)-src[^;]*\*/.test(csp));
  assert.ok(!/vercel\.app|usebipi/.test(csp), "a CSP não deve depender do domínio do app");
});
t("Segurança de cabeçalhos preservada: HSTS, X-Frame DENY, nosniff", () => { assert.match(hd["Strict-Transport-Security"], /max-age=\d+/); assert.equal(hd["X-Frame-Options"], "DENY"); assert.equal(hd["X-Content-Type-Options"], "nosniff"); });
t("Link permanente do promotor (/promotor/:marca/:codigo) continua reescrito para o app", () => { assert.ok(vj.rewrites.some((r) => r.source === "/promotor/:marca/:codigo" && r.destination === "/index.html")); });
t("manifest: start_url e scope relativos (valem em qualquer domínio)", () => { const m = JSON.parse(ler("public/manifest.json")); assert.equal(m.start_url, "/"); assert.equal(m.scope, "/"); });
t("app: SITE_URL vem de VITE_SITE_URL ou da origem atual (nenhum domínio fixo no código da interface)", () => {
  const fontes = ["src/lib/constantes.js", "src/App.jsx"].map((p) => { try { return ler(p); } catch { return ""; } }).join("\n");
  assert.ok(/VITE_SITE_URL \|\| window\.location\.origin/.test(fontes));
});
t("app: nenhum endereço vercel.app fixo no código da interface (src/)", () => {
  let r = ""; try { r = execSync("grep -rn 'vercel\\.app' src || true", { encoding: "utf8" }); } catch { /* */ }
  assert.ok(!r.replace(/^.*\/\/.*vercel\.app.*$/gm, "").trim(), r);
});
t("nenhum domínio errado no repositório (usibip, usebip.com, usebipe)", () => {
  const arqs = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter((x) => x && !/\.(png|jpg|jpeg|ico|mp4|glb|woff2?|gz|lock)$|package-lock/.test(x) && x !== "teste-dominios.mjs");
  const ruins = arqs.filter((a) => { try { return /usibip|usebip\.com|usebipe/i.test(ler(a)); } catch { return false; } }); assert.deepEqual(ruins, []);
});
t("telegram-bot: imagens dos banners usam o SITE configurado (some do domínio antigo ao trocar o secret)", () => { assert.ok(/\$\{SITE\}\/bot\/\$\{banner\}\.jpg/.test(ler(`${F}/telegram-bot/index.ts`))); });
console.log(`\n${ok} ok, ${falhas} falhas`); process.exit(falhas ? 1 : 0);

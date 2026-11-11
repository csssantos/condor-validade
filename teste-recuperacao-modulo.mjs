// Executa o src/supabaseClient.js REAL (com o supabase-js trocado por um stub) em cenários de link de recuperação.
import { build } from "/opt/npm-tools/node_modules/esbuild/lib/main.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
const raiz = new URL(".", import.meta.url).pathname, dir = tmpdir() + "/rec-modulo/";
mkdirSync(dir, { recursive: true });
writeFileSync(dir + "stub.js", "export const createClient = () => ({ stub: true });");
await build({ entryPoints: [raiz + "src/supabaseClient.js"], bundle: true, format: "esm", outfile: dir + "m.mjs", logLevel: "error",
  alias: { "@supabase/supabase-js": dir + "stub.js" }, define: { "import.meta.env.VITE_SUPABASE_URL": '"https://x.supabase.co"', "import.meta.env.VITE_SUPABASE_ANON_KEY": '"k"' } });
let ok = 0, falhas = [], n = 0;
const t = (nome, c) => { c ? ok++ : falhas.push(nome); };
async function cenario({ hash = "", search = "", store = {} }) {
  const mem = { ...store }; const hist = [];
  globalThis.localStorage = { get length() { return Object.keys(mem).length; }, key: (i) => Object.keys(mem)[i] ?? null, getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  globalThis.window = { location: { hash, search, pathname: "/" }, history: { replaceState: (a, b, u) => hist.push(u) } };
  const m = await import(`${dir}m.mjs?c=${n++}`);
  return { m, mem, hist };
}
const LINK = "#access_token=abc&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery";
const LOGADO = { "sb-x-auth-token": JSON.stringify({ access_token: "a", refresh_token: "r", user: { id: "u1", is_anonymous: false } }) };
const ANON = { "sb-x-auth-token": JSON.stringify({ access_token: "a", refresh_token: "r", user: { id: "u2", is_anonymous: true } }) };
let c = await cenario({ hash: LINK });
t("deslogado + link: tela Nova senha liga e a flag persiste", c.m.abriuPorRecuperacao === true && c.mem.avdc_recuperando === "1" && c.m.linkIgnoradoLogado === false && c.hist.length === 0);
c = await cenario({ hash: LINK, store: LOGADO });
t("JÁ LOGADO + link: NÃO assume a conta, não liga a tela, apaga o trecho do link ANTES do supabase ler", c.m.linkIgnoradoLogado === true && c.m.abriuPorRecuperacao === false && !c.mem.avdc_recuperando && c.hist.length === 1 && !/access_token/.test(c.hist[0]));
c = await cenario({ hash: LINK, store: ANON });
t("sessão anônima (convite de promotor) não conta como logado: link funciona", c.m.abriuPorRecuperacao === true && c.m.linkIgnoradoLogado === false);
c = await cenario({ hash: LINK, store: { "sb-x-auth-token": "lixo{" } });
t("armazenamento corrompido não derruba (trata como deslogado)", c.m.abriuPorRecuperacao === true);
c = await cenario({ hash: "", store: { avdc_recuperando: "1" } });
t("recarregou antes de trocar: a flag volta a ligar a tela", c.m.abriuPorRecuperacao === true);
c = await cenario({ hash: "", store: LOGADO });
t("abrir o app normal logado não liga nada", c.m.abriuPorRecuperacao === false && c.m.linkIgnoradoLogado === false);
c = await cenario({ hash: "#access_token=abc&type=signup", store: LOGADO });
t("link de confirmação de cadastro (type=signup) não é tocado", c.m.linkIgnoradoLogado === false && c.hist.length === 0);
c = await cenario({ hash: "#type=recovery" });
t("#type=recovery sem token é ignorado", c.m.abriuPorRecuperacao === false);
c = await cenario({ search: "?type=recovery" });
t("?type=recovery forjado é ignorado", c.m.abriuPorRecuperacao === false);
c = await cenario({ hash: "#error=access_denied&error_code=otp_expired" });
t("link vencido marca linkComErro", c.m.linkComErro === true && c.m.abriuPorRecuperacao === false);
console.log(`${ok} ok, ${falhas.length} falhas`); if (falhas.length) { console.log(falhas.join("\n")); process.exit(1); }

// Roda todos os testes do app: node scripts/rodar-testes.mjs  (ou npm test)
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTRA = "/opt/npm-tools/node_modules"; // ambiente sem node_modules (sandbox)
let esbuild; try { esbuild = require("esbuild"); } catch { esbuild = require(EXTRA + "/esbuild"); }
const rodar = (nome, args) => { process.stdout.write(`\n▶ ${nome}\n`); execFileSync(process.execPath, args, { cwd: RAIZ, stdio: "inherit" }); };
let falhou = false;
const passo = async (nome, fn) => { try { await fn(); } catch (e) { falhou = true; if (!e.status) console.error(String(e.message || e).slice(0, 2000)); console.error(`✖ ${nome} falhou`); } };
await passo("nomes e imports", () => rodar("nomes e imports (checar-nomes)", ["scripts/checar-nomes.cjs"]));
await passo("cópias do bot", () => rodar("cópias do bot (voz.js e subcategorias)", ["scripts/checar-copias.mjs"]));
for (const t of ["teste-voz.mjs", "teste-bot.mjs", "teste-data.mjs", "teste-recuperacao.mjs", "teste-recuperacao-modulo.mjs", "teste-dominios.mjs", "teste-dominios-cors.mjs", "teste-auth-email.mjs", "teste-convite-editar.mjs", "teste-diagnostico.mjs", "teste-resumo-diario.mjs"]) await passo(t, () => { if (!fs.existsSync(path.join(RAIZ, t))) throw new Error("teste da lista não existe: " + t); rodar(t, [t]); });
// testes das funções do app (empacotados com esbuild porque importam .jsx)
for (const f of fs.readdirSync(path.join(RAIZ, "testes")).filter((f) => /^teste-.*\.jsx?$/.test(f))) {
  await passo(f, async () => {
    const saida = path.join(RAIZ, "testes", ".tmp-" + f.replace(/\.jsx?$/, ".mjs"));
    await esbuild.build({ entryPoints: [path.join(RAIZ, "testes", f)], bundle: true, platform: "node", format: "esm", outfile: saida, jsx: "automatic", loader: { ".js": "jsx" }, define: { "import.meta.env": "{\"VITE_SUPABASE_URL\":\"http://teste\",\"VITE_SUPABASE_ANON_KEY\":\"teste\"}" }, nodePaths: [path.join(RAIZ, "node_modules"), EXTRA], logLevel: "error",
      plugins: [{ name: "stubs", setup(b) { // pacotes de tela e de rede viram objetos vazios no teste
        b.onResolve({ filter: /^(@supabase\/|lucide-react|@heroicons\/|framer-motion|recharts|xlsx|jspdf|tesseract\.js)/ }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => { // exporta os mesmos nomes que o app importa do pacote, todos como função vazia
          const nomes = new Set(); const todos = []; (function andar(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) andar(p); else if (/\.jsx?$/.test(f)) todos.push(fs.readFileSync(p, "utf8")); } })(path.join(RAIZ, "src"));
          const esc = a.path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
          for (const t of todos) for (const m of t.matchAll(new RegExp(`import\\s+([^;]*?)\\s+from\\s+["']${esc}["']`, "g"))) { const ch = /\{([^}]*)\}/.exec(m[1]); if (ch) ch[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((n) => nomes.add(n)); }
          return { contents: "const f = () => null; export default f;\n" + [...nomes].map((n) => `export const ${n} = f;`).join("\n"), loader: "js" }; });} }],
      banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url); const __mem = {}; globalThis.window ??= globalThis; globalThis.location ??= { origin: 'http://teste', href: 'http://teste/', pathname: '/' }; globalThis.localStorage ??= { getItem: (k) => __mem[k] ?? null, setItem: (k, v) => { __mem[k] = String(v); }, removeItem: (k) => { delete __mem[k]; } }; if (!globalThis.navigator || globalThis.navigator.onLine === undefined) Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'node' }, configurable: true }); globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });" } });
    try { rodar(f, [saida]); } finally { fs.rmSync(saida, { force: true }); }
  });
}
console.log(falhou ? "\n✖ ALGUM TESTE FALHOU" : "\n✔ todos os testes passaram");
process.exit(falhou ? 1 : 0);

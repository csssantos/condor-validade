// Acusa nome usado e não declarado/importado (o esbuild não acusa). Uso: node scripts/checar-nomes.cjs
const path = require("path"), fs = require("fs");
let ts; try { ts = require("typescript"); } catch { ts = require("/opt/npm-tools/node_modules/typescript"); }
const SRC = path.join(__dirname, "..", "src");
const arquivos = [];
(function andar(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) andar(p); else if (/\.(jsx?|mjs)$/.test(f)) arquivos.push(p); } })(SRC);
const prog = ts.createProgram(arquivos, { allowJs: true, checkJs: true, noEmit: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"], skipLibCheck: true, types: [] });
const CODIGOS = new Set([2304, 2552, 2305, 2614, 2724, 1192, 2306, 2307]); // nome inexistente, export inexistente, módulo local inexistente
const ruins = [];
for (const d of ts.getPreEmitDiagnostics(prog)) {
  if (!CODIGOS.has(d.code) || !d.file) continue;
  const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.code === 2307 && !/Cannot find module '\.\.?\//.test(msg)) continue; // pacote npm não instalado aqui
  if (/Cannot find name '(import|process|__dirname|require|globalThis)'/.test(msg)) continue;
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  ruins.push(`${path.relative(SRC, d.file.fileName)}:${line + 1}  ${msg}`);
}
if (ruins.length) { console.error(ruins.join("\n")); console.error(`\n${ruins.length} problema(s) de nome/import.`); process.exit(1); }
console.log(`ok: ${arquivos.length} arquivos sem nome indefinido nem import quebrado`);

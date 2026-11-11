// Confere as CÓPIAS que o bot de Telegram usa (rodar via npm test). Esquecer de recopiar = o bot aceita o que o app/banco recusam.
//  1) src/voz.js  ==  supabase/functions/telegram-bot/voz.js (byte a byte)
//  2) SUBSETORES_PADRAO (src/lib/constantes.js)  ==  SUBS_PADRAO (supabase/functions/telegram-bot/index.ts)
import fs from "node:fs";
const ler = (p) => fs.readFileSync(p, "utf8");
let falhas = 0;
const ruim = (m) => { falhas++; console.error("✖ " + m); };

if (ler("src/voz.js") !== ler("supabase/functions/telegram-bot/voz.js")) ruim("supabase/functions/telegram-bot/voz.js difere de src/voz.js (recopie: cp src/voz.js supabase/functions/telegram-bot/voz.js)");
else console.log("ok: voz.js do bot idêntico ao do app");

function objeto(texto, nome) {
  const i = texto.search(new RegExp(`(?:const|let)\\s+${nome}\\b[^=]*=\\s*\\{`));
  if (i < 0) return null;
  const ini = texto.indexOf("{", texto.indexOf("=", i));
  let prof = 0, j = ini;
  for (; j < texto.length; j++) { const c = texto[j]; if (c === "{") prof++; else if (c === "}" && --prof === 0) break; }
  try { return new Function(`return (${texto.slice(ini, j + 1)});`)(); } catch { return null; }
}
const app = objeto(ler("src/lib/constantes.js"), "SUBSETORES_PADRAO");
const bot = objeto(ler("supabase/functions/telegram-bot/index.ts"), "SUBS_PADRAO");
if (!app || !bot) ruim("não consegui ler SUBSETORES_PADRAO (app) ou SUBS_PADRAO (bot)");
else if (JSON.stringify(app) !== JSON.stringify(bot)) ruim("SUBS_PADRAO do bot difere de SUBSETORES_PADRAO do app (mantenha igual)");
else console.log(`ok: subcategorias do bot idênticas às do app (${Object.keys(app).length} setores)`);
process.exit(falhas ? 1 : 0);

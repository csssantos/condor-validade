// Testa as regras puras do bot (EAN, lote, datas) lendo as funções direto do index.ts
import fs from "node:fs";
const src = fs.readFileSync("supabase/functions/telegram-bot/index.ts", "utf8");
const pega = (ini, fim) => { const a = src.indexOf(ini); const b = src.indexOf(fim, a); if (a < 0 || b < 0) throw new Error("trecho não achado: " + ini); return src.slice(a, b); };
let code = pega("function eanOk", "// ---------- Produto novo") + pega("const LOTE_RE", "async function lotesDoProduto");
code = code.replace(/: string\)/g, ")").replace(/: string/g, "").replace(/!;/g, ";").replace(/\.pop\(\)!/, ".pop()");
const f = new Function(code + "; return { eanOk, normLote, loteValido, prepararData };")();
let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log("FALHOU:", n)); };
t("EAN-8 kinder", f.eanOk("96385074")); t("UPC-A", f.eanOk("036000291452")); t("EAN-13", f.eanOk("7891000100103"));
t("EAN dígito errado", !f.eanOk("7891000100104")); t("zeros", !f.eanOk("0000000000000") && !f.eanOk("00000000")); t("14 dígitos", !f.eanOk("78910001001030")); t("curto", !f.eanOk("1234"));
t("lote LOTE5 mantém", f.normLote("LOTE5") === "LOTE5"); t("lote: L12", f.normLote("lote: l12") === "L12"); t("lote 123", f.normLote("lote 123") === "123");
t("lote sem dígito", !f.loteValido("OK") && !f.loteValido("SIM")); t("lote ok", f.loteValido("L2410A") && f.loteValido("10"));
t("data 01012026 com produto", f.prepararData("01012026") === "01/01/2026"); t("EAN-8 sem produto intacto", f.prepararData("96385074", true) === "96385074"); t("data 15122026", f.prepararData("15122026") === "15/12/2026"); t("data EAN-13 intacto", f.prepararData("7891000100103") === "7891000100103");
t("data com espaços", f.prepararData("vence 15 12 2026") === "vence 15/12/2026"); t("mm/aaaa", f.prepararData("12/2026") === "31/12/2026");
t("dd/mm/aaaa intacto", f.prepararData("15/12/2026") === "15/12/2026"); t("fev bissexto", f.prepararData("02/2028") === "29/02/2028");
console.log(`bot: ${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);

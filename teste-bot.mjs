// Testa as regras puras do bot (EAN, lote, datas) lendo as funções direto do index.ts
import fs from "node:fs";
import { semAcento } from "./src/voz.js";
const src = fs.readFileSync("supabase/functions/telegram-bot/index.ts", "utf8");
const pega = (ini, fim) => { const a = src.indexOf(ini); const b = src.indexOf(fim, a); if (a < 0 || b < 0) throw new Error("trecho não achado: " + ini); return src.slice(a, b); };
let code = pega("function eanOk", "// ---------- Produto novo") + pega("const LOTE_RE", "async function lotesDoProduto");
code = code.replace(/: Record<string, number>/g, "").replace(/: string\)/g, ")").replace(/: string/g, "").replace(/!;/g, ";").replace(/\.pop\(\)!/, ".pop()");
const f = new Function("semAcento", code + "; return { eanOk, normLote, loteValido, prepararData };")(semAcento);
let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log("FALHOU:", n)); };
t("EAN-8 kinder", f.eanOk("96385074")); t("UPC-A", f.eanOk("036000291452")); t("EAN-13", f.eanOk("7891000100103"));
t("EAN dígito errado", !f.eanOk("7891000100104")); t("zeros", !f.eanOk("0000000000000") && !f.eanOk("00000000")); t("14 dígitos", !f.eanOk("78910001001030")); t("curto", !f.eanOk("1234"));
t("lote LOTE5 mantém", f.normLote("LOTE5") === "LOTE5"); t("lote: L12", f.normLote("lote: l12") === "L12"); t("lote 123", f.normLote("lote 123") === "123");
t("lote sem dígito", !f.loteValido("OK") && !f.loteValido("SIM")); t("lote ok", f.loteValido("L2410A") && f.loteValido("10"));
t("data 01012026 com produto", f.prepararData("01012026") === "01/01/2026"); t("EAN-8 sem produto intacto", f.prepararData("96385074", true) === "96385074"); t("data 15122026", f.prepararData("15122026") === "15/12/2026"); t("data EAN-13 intacto", f.prepararData("7891000100103") === "7891000100103");
t("data com espaços", f.prepararData("vence 15 12 2026") === "vence 15/12/2026"); t("mm/aaaa", f.prepararData("12/2026") === "31/12/2026");
t("dez 2026", f.prepararData("vence dez 2026") === "vence 31/12/2026"); t("dezembro de 2026", f.prepararData("DEZEMBRO de 2026") === "31/12/2026"); t("fev 2028 bissexto", f.prepararData("fev 2028") === "29/02/2028"); t("março", f.prepararData("março 2027") === "31/03/2027"); t("mais 2026 intacto", f.prepararData("mais 2026") === "mais 2026"); t("15 de dezembro de 2026 intacto", f.prepararData("vence 15 de dezembro de 2026") === "vence 15 de dezembro de 2026"); t("15 dez 2026 intacto", f.prepararData("15 dez 2026") === "15 dez 2026"); t("ano passado não vira data", f.prepararData("sal mar 2000") === "sal mar 2000"); t("dd/mm/aaaa intacto", f.prepararData("15/12/2026") === "15/12/2026"); t("fev bissexto", f.prepararData("02/2028") === "29/02/2028");
// voltar uma resposta: pilha de estados (snap/empilhar) sem guardar a foto pesada
let cod2 = pega("const snap", "// refaz a pergunta").replace(/: Dados/g, "").replace(/ as unknown/g, "").replace(/\[\.\.\.\(atual\.pilha \|\| \[\]\)\]/, "[...(atual.pilha || [])]");
const g = new Function(cod2 + "; return { snap, temProgresso, empilhar };")();
{
  let d0 = {}; let d = { ...d0 }; g.empilhar(d, d0); t("sem progresso não empilha", !d.pilha);
  let est = { barcode: "7891000100103", nome: "X", validade: "2026-12-20" };
  let nx = { ...est }; g.empilhar(nx, est); nx.lote = "L1"; t("empilha estado anterior", nx.pilha.length === 1 && JSON.parse(nx.pilha[0]).lote === undefined);
  let nx2 = { ...nx }; g.empilhar(nx2, nx); nx2.quantidade = 3; t("segunda resposta empilha de novo", nx2.pilha.length === 2);
  let rep = { ...nx2 }; g.empilhar(rep, nx2); t("mesmo estado empilhado de novo não duplica", rep.pilha.length === 3 && (() => { const r2 = { ...rep }; g.empilhar(r2, { ...nx2, pilha: rep.pilha }); return r2.pilha.length === 3; })());
  let gr = { ...est, pilha: [], novo: { barcode: "1", nome: "N", foto: "data:image/jpeg;base64,AAAA".repeat(1000), setor: null, etapa: "setor" } }; let nn = { ...gr }; g.empilhar(nn, gr);
  t("foto pesada fica fora da pilha", nn.pilha[0].length < 400 && nn.pilha[0].includes("__keep__"));
  let c = { ...est }; for (let i = 0; i < 10; i++) { const n = { ...c }; g.empilhar(n, c); n.quantidade = i + 1; c = n; } t("pilha limitada a 10", c.pilha.length === 10);
}
// gramagem e preço do Telegram
{
  let c3 = pega("const UNID", "const brl").replace(/: Record<string, string>/g, "").replace(/: string\)/g, ")").replace(/: \{ tam: string; uni: string \} \| null/, "").replace(/: number \| null/, "");
  const h = new Function("semAcento", c3 + "; return { lerGramagem, lerPreco };")((x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  t("gramagem 500 = 500 G", JSON.stringify(h.lerGramagem("500")) === '{"tam":"500","uni":"G"}');
  t("gramagem 1,5 kg", JSON.stringify(h.lerGramagem("1,5 kg")) === '{"tam":"1,5","uni":"KG"}');
  t("gramagem 900ml", h.lerGramagem("900ml")?.uni === "ML"); t("gramagem 2 litros", h.lerGramagem("2 Litros")?.uni === "L");
  t("gramagem inválida", !h.lerGramagem("abc") && !h.lerGramagem("0") && !h.lerGramagem("99999") && !h.lerGramagem("500 xx"));
  t("preço 8,99", h.lerPreco("8,99") === 8.99); t("preço R$ 12", h.lerPreco("R$ 12") === 12); t("preço 8,99 reais", h.lerPreco("8,99 reais") === 8.99); t("preço 5 reais.", h.lerPreco("5 reais.") === 5); t("preço 8.5", h.lerPreco("8.5") === 8.5);
  t("gramagem milhar ambígua recusada", h.lerGramagem("1.500 g") === null && h.lerGramagem("1.500") === null); t("gramagem com ponto final", h.lerGramagem("500g.")?.tam === "500" && h.lerGramagem("2 lts")?.uni === "L");
  t("preço com milhar e centavos", h.lerPreco("1.234,56") === 1234.56); t("preço 1.234,56 sem decimais extras", h.lerPreco("1.234") === 1234);
  t("preço inválido", h.lerPreco("0") === null && h.lerPreco("5001") === null && h.lerPreco("abc") === null && h.lerPreco("1,234") === null);
}
console.log(`bot: ${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);

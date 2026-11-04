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
  let c = { ...est }; for (let i = 0; i < 10; i++) { const n = { ...c }; g.empilhar(n, c); n.quantidade = i + 1; c = n; } t("pilha limitada a 6", c.pilha.length === 6);
}
console.log(`bot: ${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);

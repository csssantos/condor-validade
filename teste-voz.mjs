import { interpretarVoz as I, acharNoCatalogo as C, descreverData } from "./src/voz.js";
const hoje = new Date(2026, 9, 30); // sexta 30/10/2026
let ok = 0, falha = 0;
function t(frase, esperado) {
  const r = I(frase, hoje);
  const errs = Object.entries(esperado).filter(([k, v]) => r[k] !== v).map(([k, v]) => `${k}: esperado ${JSON.stringify(v)} veio ${JSON.stringify(r[k])}`);
  if (errs.length) { falha++; console.log("FALHOU:", frase, "\n  ", errs.join("\n   "), "\n   =>", JSON.stringify(r)); } else ok++;
}
t("Leite vence na próxima sexta", { nome: "Leite", validade: "2026-11-06", setorSugerido: "Frios e Laticínios" });
t("iogurte natural vence sexta, 12 unidades", { nome: "Iogurte Natural", validade: "2026-11-06", quantidade: 12 });
t("12 iogurtes vencem dia 15 de novembro", { nome: "Iogurtes", validade: "2026-11-15", quantidade: 12 });
t("cadastrar pão francês vence amanhã", { nome: "Pão Francês", validade: "2026-10-31", setorSugerido: "Padaria" });
t("queijo mussarela validade 15/11/2026 duas caixas", { nome: "Queijo Mussarela", validade: "2026-11-15", quantidade: 2 });
t("presunto vence daqui a 3 dias", { nome: "Presunto", validade: "2026-11-02" });
t("arroz 5 kg vence 10/03", { nome: "Arroz", validade: "2027-03-10", quantidade: 5, porPeso: true, setorSugerido: "Mercearia" });
t("frango 500 gramas vence hoje", { nome: "Frango", validade: "2026-10-30", quantidade: 0.5, porPeso: true });
t("leite integral vence dia 5", { nome: "Leite Integral", validade: "2026-11-05" });
t("leite integral vence dia 31", { nome: "Leite Integral", validade: "2026-10-31" });
t("café vence em duas semanas", { nome: "Café", validade: "2026-11-13" });
t("pão de queijo vence depois de amanhã", { nome: "Pão de Queijo", validade: "2026-11-01" });
t("detergente vinte e cinco unidades vence 3 de janeiro de 2027", { nome: "Detergente", validade: "2027-01-03", quantidade: 25 });
t("macarrão vence quarta-feira a 4,99 reais", { nome: "Macarrão", validade: "2026-11-04", precoUnitario: 4.99 });
t("refrigerante cola vence no fim do mês", { nome: "Refrigerante Cola", validade: "2026-11-30" === "x" ? null : "2026-10-31" });
t("leite", { nome: "Leite", validade: null });
t("", { nome: "", validade: null });
t("vence sexta", { nome: "", validade: "2026-11-06" });
t("queijo vence 31/02", { nome: "Queijo 31/02", validade: null });
console.log("catálogo:");
const cat = { a: { nome: "Iogurte Natural 170 g" }, b: { nome: "Leite Integral 1L" }, c: { nome: "Queijo Mussarela Fatiado" } };
for (const [q, esp] of [["Iogurte Natural", "a"], ["iogurtes", "a"], ["leite integral", "b"], ["queijo mussarela", "c"], ["arroz", null], ["leite", "b"]]) {
  const r = C(q, cat); const got = r?.chave ?? null;
  if (got === esp) ok++; else { falha++; console.log("CAT FALHOU:", q, esp, got); }
}
console.log(descreverData("2026-11-06", hoje));
console.log(`${ok} ok, ${falha} falhas`);
process.exit(falha ? 1 : 0);

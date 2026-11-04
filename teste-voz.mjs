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
t("Chocolate lacta Intense 40 por cento cacau amêndoas e framboesa vai vencer dia 14/12/2026 com lote CC 0132 6492 e tem 48 U", { nome: "Chocolate Lacta Intense 40% Cacau Amêndoas e Framboesa", validade: "2026-12-14", quantidade: 48, lote: "CC 0132 6492" });
t("leite integral vence 10/12/2026 lote 10/24 20 unidades", { nome: "Leite Integral", validade: "2026-12-10", quantidade: 20, lote: "10/24" });
t("leite integral lote 123 48 unidades vence 10/12/2026", { nome: "Leite Integral", validade: "2026-12-10", quantidade: 48, lote: "123" });
t("biscoito vence 10/12/2026 sem lote 12 unidades", { nome: "Biscoito", validade: "2026-12-10", quantidade: 12, semLote: true, lote: null });
t("biscoito lote cc vence 10/12/2026", { nome: "Biscoito Cc", validade: "2026-12-10", lote: null, falouLote: true });
t("lote CC 0132 6492 chocolate lacta vence 14/12/2026", { nome: "Chocolate Lacta", validade: "2026-12-14", lote: "CC 0132 6492" });
t("lote L123 biscoito maizena 15/12/2026 40 unidades", { nome: "Biscoito Maizena", validade: "2026-12-15", quantidade: 40, lote: "L123" });
t("chocolate lote CC12 lacta vence 14/12/2026", { nome: "Chocolate Lacta", validade: "2026-12-14", lote: "CC12" });
t("lote 12 48 vence 14/12/2026 leite", { nome: "Leite", validade: "2026-12-14", quantidade: 48, lote: "12" });
t("leite lote ab12 20 vence 10/12/2026", { validade: "2026-12-10", lote: "AB12" });
t("pacote lote do arroz 5kg vence 10/12/2026", { lote: null, validade: "2026-12-10" });
t("lote 3 caixas leite vence 10/12/2026", { lote: null, quantidade: 3 });
t("leite vence 15 dez 2026", { nome: "Leite", validade: "2026-12-15" });
t("leite vence dez 2026", { nome: "Leite", validade: "2026-12-31" });
t("leite vence 5 de março de 2027", { nome: "Leite", validade: "2027-03-05" });
t("leite 😀 integral lote AB12 20 unidades vence 10/12/2026", { nome: "Leite 😀 Integral", validade: "2026-12-10", quantidade: 20, lote: "AB12" });
t("queijo 1/2 kg vence 20/12/2026", { nome: "Queijo", validade: "2026-12-20", quantidade: 0.5, porPeso: true });
t("leite vence 15 de dez", { nome: "Leite", validade: "2026-12-15" });
t("presunto vence 15 jan 2027", { nome: "Presunto", validade: "2027-01-15" });
t("suco set laranja vence 20/12/2026", { nome: "Suco Set Laranja", validade: "2026-12-20" });
console.log("catálogo:");
const cat = { a: { nome: "Iogurte Natural 170 g" }, b: { nome: "Leite Integral 1L" }, c: { nome: "Queijo Mussarela Fatiado" } };
for (const [q, esp] of [["Iogurte Natural", "a"], ["iogurtes", "a"], ["leite integral", "b"], ["queijo mussarela", "c"], ["arroz", null], ["leite", "b"]]) {
  const r = C(q, cat); const got = r?.chave ?? null;
  if (got === esp) ok++; else { falha++; console.log("CAT FALHOU:", q, esp, got); }
}
console.log(descreverData("2026-11-06", hoje));
console.log(`${ok} ok, ${falha} falhas`);
// --- travas de segurança da voz ---
import { validarVoz as V, buscarNoCatalogo as BC } from "./src/voz.js";
{
  let ok2 = 0, f2 = 0; const chk = (nome, cond) => { cond ? ok2++ : (f2++, console.log("FALHOU:", nome)); };
  chk("data passada barrada", V(I("leite vence 10/10/2026", hoje), hoje).length > 0);
  chk("ontem barrado", V(I("leite vence ontem", hoje), hoje).length > 0);
  chk("hoje liberado", V(I("leite vence hoje", hoje), hoje).length === 0);
  chk("quantidade absurda", V(I("leite vence amanhã 99999 unidades", hoje), hoje).length > 0);
  chk("quantidade ok", V(I("leite vence amanhã 12 unidades", hoje), hoje).length === 0);
  chk("kg absurdo", V(I("frango vence amanhã 900 kg", hoje), hoje).length > 0);
  chk("preço absurdo", V({ nome: "Leite", precoUnitario: 99999 }, hoje).length > 0);
  chk("data 10 anos", V({ nome: "Leite", validade: "2036-01-01" }, hoje).length > 0);
  const cat = { 1: { nome: "BAUDUCCO - COOKIE TRAD. 100G" }, 2: { nome: "BAUDUCCO - WAFER MORANGO" } };
  chk("palavra solta desconhecida não vira produto novo", BC("Xablau", cat).tipo === "incompleto");
  chk("balduque é marca", BC("Balduque", cat).tipo === "marca");
  chk("bal duco junta", BC("Bal duco", cat).tipo === "marca");
  chk("produto novo com marca+produto", BC("Panetone Xablau Gourmet", cat).tipo === "novo");
  console.log(`travas: ${ok2} ok, ${f2} falhas`);
}
process.exit(falha ? 1 : 0);

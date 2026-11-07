// Testes das funções puras que saíram do App.jsx (rodam com: npm test)
import { eanValido, limiteSomaLote, textoLote } from "../src/lib/produto";
import { diasRestantes, getStatus, sugestaoDesconto } from "../src/lib/formatos";
import { parseCodigoBalanca, celulaCSV, celulaPlanilha } from "../src/lib/utilidades";
import { erroDeRede, definirUsuarioFila, enfileirar, lerFila, gravarFila, processarFila, limparFilaOrfa } from "../src/lib/fila";
import { etapasDoTutorial } from "../src/componentes/TutorialBipi";
import { isoParaBR, brParaISO, mascaraData } from "../src/componentes/CampoData";

let ok = 0, falhas = 0;
const igual = (nome, obtido, esperado) => {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) ok++; else { falhas++; console.error(`FALHOU ${nome}: esperado ${b}, veio ${a}`); }
};
const isoDaqui = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// EAN-8, UPC-A e EAN-13 com dígito verificador; tudo zero recusado
igual("EAN-13 válido", eanValido("7891000315507"), true);
igual("EAN-13 dígito errado", eanValido("7891000315508"), false);
igual("EAN-8 válido (Kinder Ovo)", eanValido("40084107"), true);
igual("UPC-A válido", eanValido("036000291452"), true);
igual("tudo zero", eanValido("0000000000000"), false);
igual("letras", eanValido("78910A0315507"), false);
igual("tamanho 10", eanValido("1234567890"), false);
igual("vazio", eanValido(""), false);
// lote
igual("limite soma lote mínimo 10", limiteSomaLote(4), 10);
igual("limite soma lote metade", limiteSomaLote(41), 21);
igual("texto lote", textoLote({ lote: "L2410A" }), "L2410A");
igual("sem lote", textoLote({ semLote: true }), "Sem lote");
igual("lote ausente", textoLote(null), "");
// datas e status
igual("dias hoje", diasRestantes(isoDaqui(0)), 0);
igual("dias +5", diasRestantes(isoDaqui(5)), 5);
igual("dias -1", diasRestantes(isoDaqui(-1)), -1);
igual("status vencido", getStatus({ validade: isoDaqui(-1), diasAlerta: 5 }).level, "expired");
igual("status alerta", getStatus({ validade: isoDaqui(3), diasAlerta: 5 }).level, "alert");
igual("status atenção", getStatus({ validade: isoDaqui(10), diasAlerta: 5 }).level, "warning");
igual("status ok", getStatus({ validade: isoDaqui(30), diasAlerta: 5 }).level, "ok");
igual("desconto 2 dias", sugestaoDesconto(2, 10).pct, 55);
igual("desconto fora da faixa", sugestaoDesconto(20, 10), null);
// campo de data
igual("iso→br", isoParaBR("2026-12-15"), "15/12/2026");
igual("br→iso", brParaISO("15/12/2026"), "2026-12-15");
igual("data impossível", brParaISO("31/02/2026"), "");
igual("máscara", mascaraData("15122026"), "15/12/2026");
igual("máscara parcial", mascaraData("151"), "15/1");
// balança
igual("balança peso", parseCodigoBalanca("2000123012345", { prefixos: ["20"], tipoValor: "peso" }), { ehBalanca: true, codigoBase: "00123", pesoKg: 1.234, precoEmbutido: null });
igual("balança prefixo errado", parseCodigoBalanca("7891000315507", { prefixos: ["20"], tipoValor: "peso" }), null);
// planilha/CSV não executa fórmula
igual("csv fórmula", celulaCSV("=HYPERLINK(1)"), "'=HYPERLINK(1)");
igual("csv ponto e vírgula", celulaCSV('a;b"c'), '"a;b""c"');
igual("csv número negativo", celulaCSV("-5"), "-5");
igual("planilha fórmula", celulaPlanilha("+1"), "'+1");
// fila offline: erro de rede fica na fila, erro do banco não
globalThis.navigator ??= { onLine: true };
igual("erro de rede", erroDeRede(new Error("Failed to fetch")), true);
igual("limite por minuto", erroDeRede({ message: "limite_excedido", code: "P0001" }), true);
igual("erro do banco", erroDeRede({ message: "lote_invalido", code: "P0001" }), false);

// tutorial do Bipi: no máximo 10 etapas e conteúdo certo por cargo/aparelho
const ids = (o) => etapasDoTutorial(o).map((e) => e.id);
for (const o of [{ nivel: 6, promotor: false, pc: false }, { nivel: 5, promotor: false, pc: false }, { nivel: 1, promotor: false, pc: true }, { nivel: 7, promotor: true, pc: false }])
  igual(`tutorial até 10 etapas ${JSON.stringify(o)}`, ids(o).length <= 10 && ids(o)[0] === "oi" && ids(o).at(-1) === "fim", true);
igual("promotor sem ronda nem pedido", ids({ nivel: 7, promotor: true, pc: false }).some((x) => x === "rondas" || x === "pedido"), false);
igual("computador sem bipar", ids({ nivel: 1, pc: true }).includes("bipar"), false);
igual("celular tem bipar", ids({ nivel: 6, pc: false }).includes("bipar"), true);
igual("encarregado aprova", ids({ nivel: 5, pc: false }).includes("aprovar"), true);

// fila offline: ação guardada leva o dono e nunca vai com a sessão de outra pessoa
gravarFila([]);
definirUsuarioFila("ana"); enfileirar("upsertProduto", { id: "x" });
igual("fila guarda o dono", lerFila()[0].uid, "ana");
definirUsuarioFila("bia");
igual("outra pessoa não envia", await processarFila(), 0);
igual("ação da outra pessoa continua guardada", lerFila().length, 1);
definirUsuarioFila(null);
igual("sem login não envia", await processarFila(), 0);
igual("sem login não guarda", enfileirar("upsertProduto", { id: "y" }), false);
// ação sem dono (versão antiga) é descartada; de outra pessoa recente fica
gravarFila([{ id: "a", tipo: "upsertProduto", payload: {}, criadoEm: new Date().toISOString() }, { id: "b", tipo: "upsertProduto", payload: {}, uid: "bia", criadoEm: new Date().toISOString() }, { id: "c", tipo: "upsertProduto", payload: {}, uid: "bia", criadoEm: "2020-01-01T00:00:00Z" }]);
definirUsuarioFila("ana");
igual("descarta sem dono e vencida de outra pessoa", limparFilaOrfa(), 2);
igual("fica a recente de outra pessoa", lerFila().map((o) => o.id), ["b"]);
// sessão vencida = guarda e tenta depois
igual("jwt vencido fica na fila", erroDeRede({ message: "JWT expired", code: "PGRST301" }), true);
gravarFila([]);

console.log(`teste-lib: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

// Testes das funções puras que saíram do App.jsx (rodam com: npm test)
import { buscarTudo } from "../src/lib/dados";
import { campanhaValida, normalizarCampanha, eanValido, limiteSomaLote, textoLote } from "../src/lib/produto";
import { diasRestantes, getStatus, sugestaoDesconto } from "../src/lib/formatos";
import { parseCodigoBalanca, celulaCSV, celulaPlanilha } from "../src/lib/utilidades";
import { textoFaixaOffline, textoFaixaPendente, contarFilaRonda, CHAVE_FILA_RONDA, contarFilaDaPessoa, filaEnviando, erroDeRede, definirUsuarioFila, enfileirar, lerFila, gravarFila, processarFila, limparFilaOrfa } from "../src/lib/fila";
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
igual("campanha 4821 vale", campanhaValida("4821"), true);
igual("campanha com espacos nas pontas", campanhaValida(" 4821 "), true);
igual("campanha letra", campanhaValida("A1"), false);
igual("campanha so simbolo", campanhaValida("-"), false);
igual("campanha vazia", campanhaValida("  "), false);
igual("campanha com ponto", campanhaValida("12.3"), false);
igual("campanha 20 digitos", campanhaValida("1".repeat(20)), true);
igual("campanha 21 digitos", campanhaValida("1".repeat(21)), false);
igual("campanha normalizar", normalizarCampanha(" 55 "), "55");
{
  // buscarTudo: junta as páginas de 1000 e para na página incompleta
  const linhas = Array.from({ length: 2350 }, (_, i) => i);
  let pedidos = 0;
  const fake = () => ({ range: async (de, ate) => { pedidos++; return { data: linhas.slice(de, ate + 1), error: null }; } });
  const r = await buscarTudo(fake);
  igual("buscarTudo junta tudo", r.data.length, 2350);
  igual("buscarTudo 3 paginas", pedidos, 3);
  const e = await buscarTudo(() => ({ range: async () => ({ data: null, error: { message: "x" } }) }));
  igual("buscarTudo erro", e.data, null);
  const exato = await buscarTudo(() => ({ range: async (de, ate) => ({ data: linhas.slice(0, 2000).slice(de, ate + 1), error: null }) }));
  igual("buscarTudo multiplo exato", exato.data.length, 2000);
}
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

// fila visível: a contagem é só da pessoa logada, e o evento avisa a tela quando a fila muda
let avisos = 0; { const alvo = new EventTarget(); globalThis.window ??= {}; if (!window.addEventListener) { window.addEventListener = alvo.addEventListener.bind(alvo); window.dispatchEvent = alvo.dispatchEvent.bind(alvo); } } globalThis.CustomEvent = globalThis.CustomEvent || class extends Event { constructor(t) { super(t); } };
window.addEventListener("condor-fila-mudou", () => { avisos++; });
definirUsuarioFila("ana"); gravarFila([]);
igual("fila vazia conta 0", contarFilaDaPessoa(), 0);
enfileirar("upsertProduto", { id: "1" }); enfileirar("upsertProduto", { id: "2" });
igual("conta as 2 da pessoa", contarFilaDaPessoa(), 2);
igual("evento disparou ao guardar", avisos >= 3, true);
definirUsuarioFila("bia");
igual("outra pessoa não vê a contagem alheia", contarFilaDaPessoa(), 0);
definirUsuarioFila("ana");
igual("não está enviando parado", filaEnviando(), false);
// ação sem dono não é enviada, então não entra na contagem
gravarFila([{ id: "z", tipo: "upsertProduto", payload: {}, criadoEm: new Date().toISOString() }]);
igual("sem dono não conta", contarFilaDaPessoa(), 0);
// fila da ronda: só a da pessoa logada
globalThis.localStorage ??= { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); } };
localStorage.setItem(CHAVE_FILA_RONDA, JSON.stringify([{ op: 1, uid: "ana" }, { op: 2, uid: "bia" }, { op: 3 }]));
igual("conta só a ronda da pessoa", contarFilaRonda(), 1);
localStorage.setItem(CHAVE_FILA_RONDA, "lixo");
igual("ronda ilegível = 0", contarFilaRonda(), 0);
gravarFila([]);

// textos da faixa
igual("offline vazio é frase completa", textoFaixaOffline(0, 0), "Sem internet. O que você lançar fica guardado neste aparelho e será enviado quando a internet voltar.");
igual("offline 1 registro", textoFaixaOffline(1, 0), "Sem internet. 1 registro guardado neste aparelho será enviado quando a internet voltar.");
igual("offline 2 registros plural", /serão enviados/.test(textoFaixaOffline(2, 0)), true);
igual("offline com ronda", /conferência de ronda guardada/.test(textoFaixaOffline(0, 1)) && /abrir a ronda/.test(textoFaixaOffline(0, 1)), true);
igual("pendente plural", textoFaixaPendente(3, 0), "3 registros ainda não foram enviados.");
igual("pendente misto", textoFaixaPendente(1, 2), "1 registro ainda não foi enviado · 2 conferências de ronda aguardando (abra a ronda para enviar).");


// ---- 2026-11-13: só notificações futuras + tutorial por pessoa ----
{
  const { planejarNotificacoes } = await import("../src/lib/notificacoes.js");
  const cand = [{ chave: "a:warn" }, { chave: "b:expired" }];
  const p1 = planejarNotificacoes({ candidatos: cand, jaAvisadas: [], temBase: false });
  igual("1ª vez (sem base): nada é avisado, tudo é marcado", !!(p1.avisar.length === 0 && p1.marcar.length === 2 && p1.criarBase === true), true);
  const p2 = planejarNotificacoes({ candidatos: [...cand, { chave: "c:warn" }], jaAvisadas: p1.marcar, temBase: true });
  igual("depois da base: só o item novo avisa", !!(p2.avisar.length === 1 && p2.avisar[0].chave === "c:warn" && p2.criarBase === false), true);
  const p3 = planejarNotificacoes({ candidatos: cand, jaAvisadas: p1.marcar, temBase: true });
  igual("nada novo: não repete", !!(p3.avisar.length === 0 && p3.marcar.length === 0), true);
  const { tutorialJaVisto, marcarTutorialVisto } = await import("../src/componentes/TutorialBipi.jsx");
  igual("sem uid nunca está visto", !!(tutorialJaVisto(null) === false), true);
  igual("marca na conta vale em aparelho novo", !!(tutorialJaVisto("u-novo", { user_metadata: { tutorial_visto: true } }) === true), true);
  igual("conta sem marca ainda mostra", !!(tutorialJaVisto("u-novo2", { user_metadata: {} }) === false), true);
  marcarTutorialVisto("u-novo2", { is_anonymous: true }, null);
  igual("promotor (anônimo) visto vale para o próximo link no aparelho", !!(tutorialJaVisto("outro-uid", { is_anonymous: true }) === true), true);
  igual("anônimo visto não vale para quem tem conta", !!(tutorialJaVisto("u-conta", { is_anonymous: false }) === false), true);
  let chamou = null;
  marcarTutorialVisto("u-conta", { is_anonymous: false }, { auth: { updateUser: (d) => { chamou = d; return Promise.resolve({}); } } });
  igual("conta real grava tutorial_visto na conta", !!(chamou?.data?.tutorial_visto === true), true);
}

{
  const { sincronizarTutorialVisto, marcarTutorialVisto } = await import("../src/componentes/TutorialBipi.jsx");
  const { chaveListaNotif, chaveBaseNotif } = await import("../src/lib/notificacoes.js");
  igual("chave por pessoa e loja", [chaveListaNotif("u", 79), chaveBaseNotif("u", 79)], ["condor-validade:notificados:u:79", "condor-validade:notif-base:u:79"]);
  marcarTutorialVisto("u-sinc", { is_anonymous: true }, null);
  let n = 0; const sb = { auth: { updateUser: () => { n++; return Promise.resolve({}); } } };
  sincronizarTutorialVisto("u-sinc", { is_anonymous: false, user_metadata: {} }, sb);
  igual("quem já viu só no aparelho é sincronizado com a conta", n, 1);
  sincronizarTutorialVisto("u-sinc", { is_anonymous: false, user_metadata: { tutorial_visto: true } }, sb);
  sincronizarTutorialVisto("nunca-viu", { is_anonymous: false, user_metadata: {} }, sb);
  igual("não sincroniza se já está na conta ou nunca viu", n, 1);
}
console.log(`teste-lib: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);


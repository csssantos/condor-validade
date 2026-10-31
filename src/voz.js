// Interpretador de frases faladas em português para o cadastro por voz.
// Ex.: "iogurte natural vence sexta, 12 unidades" -> { nome: "Iogurte Natural", validade: "2026-11-06", quantidade: 12 }
// Função pura (sem React): recebe o texto e a data de hoje, devolve o que entendeu. Ver teste-voz.mjs.

const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const DIAS_SEMANA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const NOMES_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const UNIDADES_NUM = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100 };

// minúsculo e sem acento, caractere a caractere (o tamanho do texto não muda, então dá pra mapear posições)
export function semAcento(s) {
  return Array.from(String(s || "")).map((c) => c.normalize("NFD")[0].toLowerCase()).join("");
}
function paraIso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function somarDias(base, n) { const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n); return d; }
function dataValida(ano, mes, dia) {
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia ? d : null;
}
function inicioDoDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// "vinte e cinco" -> "25", "dois" -> "2" (só no texto; o resto da frase fica igual)
function numerosPorExtenso(texto) {
  const re = new RegExp(`\\b(${Object.keys(UNIDADES_NUM).join("|")})(?: e (um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?\\b`);
  let out = texto;
  for (let i = 0; i < 40; i++) {
    const m = re.exec(semAcento(out));
    if (!m) break;
    const valor = UNIDADES_NUM[m[1]] + (m[2] ? UNIDADES_NUM[m[2]] : 0);
    out = out.slice(0, m.index) + String(valor) + out.slice(m.index + m[0].length);
  }
  return out.replace(/\b(dia) primeiro\b/gi, "$1 1");
}

// Remove da frase (texto original + versão sem acento, em paralelo) o trecho que casou.
class Frase {
  constructor(t) { this.orig = t; }
  get norm() { return semAcento(this.orig); }
  achar(re) { return re.exec(this.norm); }
  tirar(m) { this.orig = this.orig.slice(0, m.index) + " " + this.orig.slice(m.index + m[0].length); }
}

function acharData(f, hoje) {
  const h = inicioDoDia(hoje);
  const anoAtual = h.getFullYear();
  let m;

  // 15/11, 15/11/2026, 15-11-26
  if ((m = f.achar(/\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{2,4}))?\b/))) {
    const dia = +m[1], mes = +m[2]; let ano = m[3] ? +m[3] : null;
    if (ano != null && ano < 100) ano += 2000;
    const d = resolverDiaMes(dia, mes, ano, h);
    if (d) { f.tirar(m); return d; }
  }
  // 15 de novembro (de 2026) / dia 15 de novembro / 15 novembro
  const nomesMes = Object.keys(MESES).join("|");
  if ((m = f.achar(new RegExp(`\\b(?:dia\\s+)?(\\d{1,2})\\s*(?:de\\s+)?(${nomesMes})(?:\\s+de\\s+(\\d{4}))?\\b`)))) {
    const d = resolverDiaMes(+m[1], MESES[m[2]], m[3] ? +m[3] : null, h);
    if (d) { f.tirar(m); return d; }
  }
  // daqui a 3 dias / em 2 semanas / daqui 1 mes
  if ((m = f.achar(/\b(?:daqui\s+(?:a\s+)?|em\s+)(\d{1,3})\s*(dias?|semanas?|mes(?:es)?)\b/))) {
    const n = +m[1]; const u = m[2];
    let d;
    if (u.startsWith("dia")) d = somarDias(h, n);
    else if (u.startsWith("sem")) d = somarDias(h, n * 7);
    else d = new Date(h.getFullYear(), h.getMonth() + n, h.getDate());
    f.tirar(m); return d;
  }
  if ((m = f.achar(/\bdepois\s+de\s+amanha\b/))) { f.tirar(m); return somarDias(h, 2); }
  if ((m = f.achar(/\bamanha\b/))) { f.tirar(m); return somarDias(h, 1); }
  if ((m = f.achar(/\bhoje\b/))) { f.tirar(m); return h; }
  if ((m = f.achar(/\b(?:fim|final)\s+do\s+mes\b/))) { f.tirar(m); return new Date(h.getFullYear(), h.getMonth() + 1, 0); }
  // (próxima/essa) sexta(-feira)
  if ((m = f.achar(/\b(?:(?:proxima|proximo|essa|esta|nesta|nessa)\s+)?(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[\s\-]*feira)?\b/))) {
    const alvo = DIAS_SEMANA[m[1]];
    let falta = (alvo - h.getDay() + 7) % 7;
    if (falta === 0) falta = 7; // "sexta" dito numa sexta = a da semana que vem (pra hoje, diga "hoje")
    f.tirar(m); return somarDias(h, falta);
  }
  // dia 15 (sem mês): neste mês, ou no próximo se já passou
  if ((m = f.achar(/\bdia\s+(\d{1,2})\b/))) {
    const dia = +m[1];
    let d = dataValida(anoAtual, h.getMonth() + 1, dia);
    if (!d || d < h) {
      const prox = new Date(h.getFullYear(), h.getMonth() + 1, 1);
      d = dataValida(prox.getFullYear(), prox.getMonth() + 1, dia);
    }
    if (d) { f.tirar(m); return d; }
  }
  return null;
}

// dia/mês sem ano: usa este ano, ou o próximo se a data já passou
function resolverDiaMes(dia, mes, ano, h) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (ano != null) return dataValida(ano, mes, dia);
  let d = dataValida(h.getFullYear(), mes, dia);
  if (d && d < h) d = dataValida(h.getFullYear() + 1, mes, dia);
  return d;
}

const SETORES_PALAVRAS = [
  ["Frios e Laticínios", ["leite", "iogurte", "queijo", "presunto", "mussarela", "muçarela", "requeijao", "manteiga", "margarina", "nata", "mortadela", "salame", "peito de peru", "ricota", "danone", "yakult"]],
  ["Açougue", ["carne", "frango", "bife", "picanha", "linguica", "costela", "patinho", "acem", "coxa", "peixe", "file", "bacon"]],
  ["Padaria", ["pao", "paes", "bolo", "torta", "broa", "sonho", "rosca"]],
  ["Hortifruti", ["alface", "tomate", "banana", "maca", "laranja", "cenoura", "batata", "cebola", "fruta", "verdura", "legume", "limao", "mamao", "uva", "morango", "abacaxi"]],
  ["Congelados", ["sorvete", "congelado", "pizza", "lasanha", "nuggets", "hamburguer", "polpa"]],
  ["Bebidas", ["refrigerante", "suco", "cerveja", "agua", "vinho", "energetico", "cha", "coca", "guarana"]],
  ["Limpeza", ["detergente", "sabao", "amaciante", "desinfetante", "sanitaria", "esponja", "multiuso", "alvejante"]],
  ["Higiene e Perfumaria", ["shampoo", "sabonete", "creme dental", "pasta de dente", "desodorante", "papel higienico", "condicionador", "fralda", "absorvente"]],
  ["Mercearia", ["arroz", "feijao", "macarrao", "acucar", "cafe", "farinha", "oleo", "molho", "biscoito", "bolacha", "cereal", "sal", "extrato", "milho", "ervilha", "achocolatado", "aveia"]],
];
export function adivinharSetor(nome) {
  const n = ` ${semAcento(nome)} `;
  for (const [setor, palavras] of SETORES_PALAVRAS) {
    if (palavras.some((p) => n.includes(` ${semAcento(p)} `) || n.includes(` ${semAcento(p)}s `))) return setor;
  }
  return null;
}

const UNID_QTD = "unidades?|unids?|un|caixas?|pacotes?|pecas?|garrafas?|latas?|potes?|bandejas?|sacos?|sache?s?|fardos?|kg|quilos?|quilogramas?|gramas?|g";

function titulo(s) {
  const peq = new Set(["de", "da", "do", "das", "dos", "e", "com", "sem", "para", "em"]);
  return s.toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => (i > 0 && peq.has(semAcento(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

// Principal. `hoje` só existe para os testes.
export function interpretarVoz(texto, hoje = new Date()) {
  const bruto = String(texto || "").replace(/\s+/g, " ").trim();
  const res = { texto: bruto, nome: "", validade: null, quantidade: null, porPeso: false, precoUnitario: null, setorSugerido: null };
  if (!bruto) return res;

  const f = new Frase(numerosPorExtenso(bruto));

  // 1) validade
  const d = acharData(f, hoje);
  if (d) res.validade = paraIso(d);

  // 2) preço: "5,90 reais", "R$ 5,90"
  let m = f.achar(/\b(?:r\$\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|conto|contos))\b/) || f.achar(/r\$\s*(\d+(?:[.,]\d{1,2})?)/);
  if (m) {
    res.precoUnitario = Number(String(m[1] || m[2]).replace(",", "."));
    f.tirar(m);
  }

  // 3) quantidade: "12 unidades", "2 kg", "500 gramas", "quantidade 12", ou número no começo ("12 iogurtes")
  m = f.achar(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${UNID_QTD})\\b`));
  if (m) {
    let q = Number(m[1].replace(",", "."));
    const un = m[2];
    if (/^(kg|quilo|quilos|quilograma|quilogramas)$/.test(un)) res.porPeso = true;
    else if (/^(g|grama|gramas)$/.test(un)) { res.porPeso = true; q = q / 1000; }
    res.quantidade = q;
    f.tirar(m);
  } else if ((m = f.achar(/\bquantidade\s+(?:de\s+)?(\d+)\b/))) {
    res.quantidade = Number(m[1]); f.tirar(m);
  } else if ((m = f.achar(/^\s*(?:(?:cadastrar|adicionar|lancar|registrar|cadastra|adiciona|lanca|registra|cadastre|adicione|lance|registre)\s+)?(\d{1,4})\s+(?!de\b)/))) {
    res.quantidade = Number(m[1]);
    f.orig = f.orig.slice(0, m.index) + " " + f.orig.slice(m.index + m[0].length);
  }

  // 4) nome = o que sobrou, sem verbos e conectores
  f.orig = f.orig.replace(/[,;.!?"“”]/g, " ");
  const verbos = /\b(?:por favor|cadastrar|cadastra|cadastre|adicionar|adiciona|adicione|lancar|lanca|lance|registrar|registra|registre|novo produto|nova validade|produto|item|vai vencer|vao vencer|vencem|vence|vencimento|vencera|validade|valido ate|valida ate|expiram|expira|com validade|tem|temos)\b/g;
  let norm = f.norm;
  let partes = []; let ult = 0; let mm;
  while ((mm = verbos.exec(norm))) { partes.push(f.orig.slice(ult, mm.index)); ult = mm.index + mm[0].length; }
  partes.push(f.orig.slice(ult));
  let nome = partes.join(" ").replace(/\s+/g, " ").trim();
  const conectores = new Set(["de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "em", "para", "pra", "o", "a", "os", "as", "um", "uma", "ate", "dia", "com", "que", "por", "ao"]);
  let ps = nome.split(" ").filter(Boolean);
  while (ps.length && conectores.has(semAcento(ps[0]))) ps.shift();
  while (ps.length && conectores.has(semAcento(ps[ps.length - 1]))) ps.pop();
  nome = ps.join(" ");
  res.nome = nome ? titulo(nome) : "";
  res.setorSugerido = res.nome ? adivinharSetor(res.nome) : null;
  return res;
}

// Procura o que foi falado entre os produtos já cadastrados. catalogo = { chave: { nome, ... } }
export function acharNoCatalogo(nomeFalado, catalogo) {
  const alvo = semAcento(nomeFalado).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (alvo.length < 3) return null;
  const palavras = alvo.split(" ").filter((p) => p.length > 1);
  const singular = (p) => p.replace(/(es|s)$/, "").replace(/[aeo]$/, "");
  let melhor = null; let melhorPont = 0;
  for (const [chave, e] of Object.entries(catalogo || {})) {
    if (!e?.nome) continue;
    const n = semAcento(e.nome).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    let pont = 0;
    if (n === alvo) pont = 100;
    else {
      const pn = n.split(" ");
      const todas = palavras.length > 0 && palavras.every((p) => pn.some((x) => x === p || singular(x) === singular(p)));
      if (todas) pont = 60 + Math.max(0, 20 - (pn.length - palavras.length) * 4);
      else if (n.includes(alvo) || alvo.includes(n)) pont = 40;
    }
    if (pont > melhorPont) { melhorPont = pont; melhor = { chave, entrada: e, exato: pont === 100 }; }
  }
  return melhorPont >= 40 ? melhor : null;
}

export function descreverData(iso, hoje = new Date()) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1, d);
  const dias = Math.round((alvo - inicioDoDia(hoje)) / 86400000);
  const quando = dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dias === -1 ? "ontem" : dias < 0 ? `venceu há ${-dias} dias` : `em ${dias} dias`;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a} · ${NOMES_DIA[alvo.getDay()]} · ${quando}`;
}

// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import * as XLSX from "xlsx";
import { getStatus } from "./formatos";

// ---------- Validação / sanitização de inputs ----------
function apenasNumeros(v, max = 14) {
  return String(v).replace(/\D/g, "").slice(0, max);
}

function sanitizarTexto(v, max) {
  return String(v).slice(0, max);
}

// ---------- Nome "profissional" no padrão do sistema (tudo maiúsculo, abreviado) ----------
// A API pública (OpenFoodFacts) devolve nomes tipo "Biscoito Nesfit Cacau e Aveia" — jeito de
// embalagem, não de sistema de loja. Essa função tenta chegar perto de "BISC. NESFIT CACAU/AVEIA":
// maiúsculo, "e"/vírgula entre sabores vira "/", preposições soltas somem, e um dicionário abrevia
// as palavras de categoria mais comuns. Edite DICIONARIO_ABREVIACOES livremente pra ir refinando —
// é só uma palavra por linha, não precisa mexer em mais nada.
const DICIONARIO_ABREVIACOES = {
  BISCOITO: "BISC.", BISCOITOS: "BISC.", CHOCOLATE: "CHOC.", ACHOCOLATADO: "ACHOC.",
  REFRIGERANTE: "REFRIG.", MARGARINA: "MARG.", REQUEIJAO: "REQ.", REQUEIJÃO: "REQ.",
  IOGURTE: "IOG.", DETERGENTE: "DETERG.", SABONETE: "SAB.", DESODORANTE: "DESOD.",
  CONDICIONADOR: "COND.", AMACIANTE: "AMAC.", CREMOSO: "CREM.", TRADICIONAL: "TRAD.",
  PRESUNTO: "PRES.", MORTADELA: "MORT.", LINGUICA: "LING.", LINGUIÇA: "LING.",
  MANTEIGA: "MANT.", INTEGRAL: "INT.", DESNATADO: "DESN.", SEMIDESNATADO: "SEMIDESN.",
  ABSORVENTE: "ABS.", MULTIUSO: "MULTIUSO", GRANULADO: "GRAN.", TEMPERADO: "TEMP.",
  CONGELADO: "CONG.", REFRIGERADO: "REFRIG.", PARMESAO: "PARM.", PARMESÃO: "PARM.",
  MUSSARELA: "MUSS.", PROVOLONE: "PROV.", CATUPIRY: "CATUP.", AZEITONA: "AZEIT.",
  VINAGRE: "VINAG.", TEMPEROS: "TEMP.", AMENDOIM: "AMEND.", CASTANHA: "CAST.",
  GRANOLA: "GRAN.", CEREAL: "CER.", MACARRAO: "MACARR.", MACARRÃO: "MACARR.",
  SALGADINHO: "SALG.", REFRESCO: "REFR.", SUCO: "SUCO", ENERGETICO: "ENERG.", ENERGÉTICO: "ENERG."
};

function formatarNomeProfissional(nomeBruto) {
  if (!nomeBruto) return "";
  let n = " " + nomeBruto.toUpperCase().trim() + " ";
  n = n.replace(/\s*,\s*/g, "/").replace(/\s+E\s+/g, "/"); // "cacau e aveia" -> "cacau/aveia"
  n = n.replace(/\s+(DE|DO|DA|DOS|DAS|COM)\s+/g, " "); // preposições soltas somem
  Object.entries(DICIONARIO_ABREVIACOES).forEach(([palavra, abrev]) => {
    n = n.replace(new RegExp(`\\b${palavra}\\b`, "g"), abrev);
  });
  return n.replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
}

// ---------- Família de produto (categoria inteira, ex: "todos os biscoitos") — 100% automático ----------
// Detectado por palavra-chave no nome (já formatado/abreviado), sem IA e sem custo — roda na hora do
// cadastro. Não cobre 100% dos casos (é um dicionário, vai crescer com o tempo), mas não bloqueia nada:
// produto sem família reconhecida fica com familia = null e continua funcionando normalmente.
// Editável: só adicionar/ajustar os grupos abaixo, nenhum outro lugar do código precisa mudar.
const FAMILIAS_PRODUTO = [
  { familia: "Biscoitos e Bolachas", palavras: ["BISC", "WAFER", "BOLACHA"] },
  { familia: "Chocolates e Achocolatados", palavras: ["CHOC", "ACHOC", "BOMBOM"] },
  { familia: "Iogurtes", palavras: ["IOG"] },
  { familia: "Queijos", palavras: ["MUSS", "PARM", "PROV", "QUEIJO", "REQ", "CATUP"] },
  { familia: "Leite e Derivados", palavras: ["LEITE", "MANT", "NATA"] },
  { familia: "Frios e Embutidos", palavras: ["PRES", "MORT", "LING", "SALSICHA", "SALAME", "BACON"] },
  { familia: "Refrigerantes", palavras: ["REFRIG"] },
  { familia: "Sucos e Refrescos", palavras: ["SUCO", "REFR", "NECTAR"] },
  { familia: "Bebidas Alcoólicas", palavras: ["CERVEJA", "VINHO", "VODKA", "WHISKY", "CACHACA"] },
  { familia: "Higiene Pessoal", palavras: ["SAB", "DESOD", "SHAMP", "COND", "ABS"] },
  { familia: "Limpeza", palavras: ["DETERG", "AMAC", "MULTIUSO", "DESINFETANTE", "SAPONACEO"] },
  { familia: "Massas e Grãos", palavras: ["MACARR", "ARROZ", "FEIJAO", "GRAN", "CER"] },
  { familia: "Óleos, Temperos e Condimentos", palavras: ["AZEIT", "VINAG", "TEMP", "OLEO", "MOLHO"] },
  { familia: "Congelados", palavras: ["CONG"] },
  { familia: "Hortifruti", palavras: ["FRUTA", "VERDURA", "LEGUME"] },
  { familia: "Padaria", palavras: ["PAO", "BOLO", "TORTA"] },
  { familia: "Salgadinhos e Snacks", palavras: ["SALG", "AMEND", "CAST"] },
];

function detectarFamilia(nomeFormatado) {
  if (!nomeFormatado) return null;
  const nome = nomeFormatado.toUpperCase();
  for (const grupo of FAMILIAS_PRODUTO) {
    // \b + prefixo (sem \b de fechamento) casa tanto a forma abreviada ("BISC.") quanto a palavra
    // inteira não abreviada ("BISCOITO") — útil pros produtos já cadastrados antes dessa função existir.
    if (grupo.palavras.some((p) => new RegExp(`\\b${p}`).test(nome))) return grupo.familia;
  }
  return null;
}

// Unidade padrão por setor: cosmético/higiene costuma vir em gramas, líquido (bebida) em ML,
// e Mercearia (mistura os dois tipos) tem G como padrão, com ML logo em seguida na lista —
// evita o funcionário ter que trocar manualmente toda vez. Ajustável na hora se não for o caso.
function ordemUnidadesPeloSetor(setor) {
  return ["G", "KG", "ML", "L"]; // G (grama) sempre primeiro e padrão, em qualquer setor (pedido do dono)
}

// ---------- Item 8: código de balança (etiqueta do açougue/padaria/hortifruti) ----------
// Padrão mais comum no Brasil (Toledo, Filizola, Urano etc.): EAN-13 com prefixo "20"-"29",
// 5 dígitos de código do produto, 5 dígitos de valor embutido (peso em gramas OU preço em centavos)
// e 1 dígito verificador. A convenção exata (prefixos aceitos e o que o valor representa) varia por
// rede/balança, por isso é configurável em Ajustes > Balança (config_loja.balanca_config).
const CONFIG_BALANCA_PADRAO = { prefixos: ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"], tipoValor: "preco" };

function parseCodigoBalanca(codigo, config) {
  const cfg = config || CONFIG_BALANCA_PADRAO;
  if (!codigo || codigo.length !== 13 || !/^\d{13}$/.test(codigo)) return null;
  if (!cfg.prefixos.includes(codigo.slice(0, 2))) return null;
  const codigoBase = codigo.slice(2, 7);
  const valorNumerico = Number(codigo.slice(7, 12));
  if (Number.isNaN(valorNumerico) || valorNumerico <= 0) return null;
  if (cfg.tipoValor === "preco") return { ehBalanca: true, codigoBase, pesoKg: null, precoEmbutido: valorNumerico / 100 };
  return { ehBalanca: true, codigoBase, pesoKg: valorNumerico / 1000, precoEmbutido: null };
}

function clampNumero(v, min, max) {
  const n = Number(v);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// ---------- Imagem / som ----------
function compressImage(file, maxW = 480, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function playBeep(enabled) {
  if (enabled === false) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1600;
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.stop(ctx.currentTime + 0.18);
  } catch {}
  if (navigator.vibrate) navigator.vibrate(60);
}

// Neutraliza fórmula do Excel (= + @ e "-" que não é número) e protege ; " e quebra de linha.
function celulaCSV(v) {
  let t = v == null ? "" : String(v);
  if (/^[=+@\t\r]/.test(t) || /^-(?!\d)/.test(t)) t = "'" + t;
  return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function celulaPlanilha(v) { return typeof v === "string" && (/^[=+@\t\r]/.test(v) || /^-(?!\d)/.test(v)) ? "'" + v : v; }

function downloadCSV(rows, header, filename) {
  const csv = [header.map(celulaCSV).join(";"), ...rows.map((r) => r.map(celulaCSV).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function downloadPlanilha(linhas, filename, sheetName = "Dados") {
  try {
    const ws = XLSX.utils.json_to_sheet(linhas.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, celulaPlanilha(v)]))));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
    return true;
  } catch (e) {
    console.error("Erro ao gerar planilha", e);
    return false;
  }
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Motor de priorização ("PRIORIDADE DE PERDA"): índice de risco 0-100 ----------
// Risco = urgência + valor + quantidade + política de troca do fornecedor + reincidência
// Um produto SEM TROCA entra na frente de um produto mais urgente mas COM TROCA,
// porque o sem-troca representa perda real garantida — é exatamente o que o item 15 pede.
function calcularPrioridade(item, historico) {
  const st = getStatus(item);
  if (st.level === "ok") return null;
  const qtd = Number(item.quantidade) || 1;
  const valor = qtd * (Number(item.precoUnitario) || 0);
  const reincidencias = (historico || []).filter(
    (h) => h.barcode === item.barcode && Date.now() - new Date(h.dataBaixa).getTime() < 60 * 86400000
  ).length;
  const semTroca = item.politicaTroca === "sem_troca";
  const comTroca = item.politicaTroca === "com_troca";

  const urgenciaScore = st.level === "expired" ? 100 : Math.max(0, 100 - st.d * 10);
  const valorScore = Math.min(100, (valor / 500) * 100);
  const qtdScore = Math.min(100, (qtd / 50) * 100);
  const trocaScore = semTroca ? 100 : comTroca ? 0 : 50;
  const reincidenciaScore = Math.min(100, reincidencias * 25);

  const score = Math.round(
    urgenciaScore * 0.35 + valorScore * 0.25 + qtdScore * 0.15 + trocaScore * 0.2 + reincidenciaScore * 0.05
  );

  let nivel = "atenção";
  if (st.level === "expired" || score >= 80) nivel = "urgente";
  else if (score >= 55) nivel = "alto";

  let acao;
  if (st.level === "expired") acao = "Retirar de venda e registrar a baixa imediatamente";
  else if (semTroca && nivel === "urgente") acao = "Reduzir preço agressivamente agora — sem possibilidade de troca com o fornecedor";
  else if (comTroca && nivel === "urgente") acao = "Verificar prazo de devolução ao fornecedor antes de agir";
  else if (nivel === "urgente") acao = "Verificar exposição / remanejamento / redução de preço";
  else if (nivel === "alto") acao = "Avaliar promoção e conferir giro";
  else acao = "Monitorar";

  return { score, nivel, acao, valor, reincidencias, dias: st.d, status: st, semTroca, comTroca };
}

export { CONFIG_BALANCA_PADRAO, DICIONARIO_ABREVIACOES, FAMILIAS_PRODUTO, apenasNumeros, calcularPrioridade, celulaCSV, celulaPlanilha, clampNumero, compressImage, detectarFamilia, downloadCSV, downloadJSON, downloadPlanilha, formatarNomeProfissional, ordemUnidadesPeloSetor, parseCodigoBalanca, playBeep, sanitizarTexto };

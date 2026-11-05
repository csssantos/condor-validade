// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { createContext, useContext } from "react";
import { BG, BLUE_DARK, BLUE_SOFT, DIAS_ALERTA_BASE, INK, RED, RED_DARK, RED_SOFT } from "./constantes";

// ---------- Helpers de data ----------
function diasRestantes(validadeISO) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [y, m, d] = validadeISO.split("-").map(Number);
  const v = new Date(y, m - 1, d);
  v.setHours(0, 0, 0, 0);
  return Math.round((v - hoje) / 86400000);
}

function formatarData(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}/${m}/${y}`;
}

function formatarDataHora(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Formato "00 de mês de 0000 às 00h00", usado na Auditoria e nos Relatórios
const MESES_EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function formatarDataHoraExtenso(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = MESES_EXTENSO[d.getMonth()];
  const ano = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dia} de ${mes} de ${ano} às ${hora}h${min}`;
}

function formatarHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatarDataExtenso(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} de ${MESES_EXTENSO[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatarMoeda(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------- Informação em camadas por cargo ----------
// Desligado por padrão (config_loja.ocultar_valores_funcionarios = false) — só passa a esconder
// valor em R$ de quem não é encarregado/corporativo quando a loja ligar isso em Ajustes, na hora
// que decidirem começar a usar o app "pra valer". Usa Context pra não precisar passar prop em
// cada componente que mostra dinheiro — só os que de fato exibem valor chamam useValoresVisiveis().
const PermissoesContext = createContext({ podeVerValores: true });

function useValoresVisiveis() {
  return useContext(PermissoesContext).podeVerValores;
}

// Substituto de formatarMoeda() sensível à camada — usa isso em vez de formatarMoeda() direto em
// qualquer tela que um funcionário comum acessa no dia a dia (Home, Setores, detalhe do produto,
// Prioridade Inteligente). Relatórios/Torre de Controle/Rede continuam só pra encarregado+ de outro jeito.
function useFormatarMoedaComCamada() {
  const podeVer = useValoresVisiveis();
  return (v) => (podeVer ? formatarMoeda(v) : "•••");
}

function getStatus(item) {
  const d = diasRestantes(item.validade);
  if (d < 0) return { label: "VENCIDO", d, level: "expired" };
  if (d <= item.diasAlerta) return { label: "EM ALERTA", d, level: "alert" };
  if (d <= item.diasAlerta + 7) return { label: "ATENÇÃO", d, level: "warning" };
  return { label: "OK", d, level: "ok" };
}

function statusStyles(level) {
  switch (level) {
    case "expired": return { bg: RED_DARK, fg: "#fff" };
    case "alert": return { bg: RED, fg: "#fff" };
    case "warning": return { bg: RED_SOFT, fg: RED_DARK };
    default: return { bg: BLUE_SOFT, fg: BLUE_DARK };
  }
}

// ---------- Sistema ERP de sugestão de desconto (curva de precificação por proximidade do vencimento) ----------
// Baseado em práticas reais de precificação de perecíveis: desconto cresce conforme o produto se aproxima da data.
// Só entra em ação a partir de 10 dias restantes, independente do valor de "dias de alerta" escolhido pelo usuário.
const FAIXAS_DESCONTO = [
  { min: 8, max: 10, pct: 10, label: "Giro preventivo" },
  { min: 5, max: 7, pct: 25, label: "Promoção relâmpago" },
  { min: 3, max: 4, pct: 40, label: "Promoção relâmpago" },
  { min: 1, max: 2, pct: 55, label: "Liquidação urgente" },
  { min: 0, max: 0, pct: 70, label: "Vence hoje — liquidação máxima" }
];

function sugestaoDesconto(diasRestantesAtual, precoUnitario) {
  if (diasRestantesAtual === null || diasRestantesAtual === undefined) return null;
  if (diasRestantesAtual < 0 || diasRestantesAtual > 10) return null;
  const faixa = FAIXAS_DESCONTO.find((f) => diasRestantesAtual >= f.min && diasRestantesAtual <= f.max);
  if (!faixa) return null;
  const preco = Number(precoUnitario) || 0;
  const precoComDesconto = preco > 0 ? preco * (1 - faixa.pct / 100) : null;
  return { pct: faixa.pct, label: faixa.label, precoOriginal: preco || null, precoComDesconto };
}

// mantido por compatibilidade com o modal de detalhe (agora delega pra curva ERP)
function descontoSugerido(item, status) {
  if (status.level === "expired") return null;
  return sugestaoDesconto(status.d, item.precoUnitario);
}

// Gatilho de notificação (local, no dispositivo com o app aberto): dispara por vencimento
// ("EM ALERTA"/vencido) OU sempre que faltarem 15 dias ou menos — janela pedida pela loja
// (10 a 15 dias), independente do valor de "dias de alerta" escolhido no cadastro.
function precisaNotificar(item) {
  const st = getStatus(item);
  return st.level === "expired" || st.d <= 15;
}

// ---------- Regra dinâmica de dias de alerta ----------
// A antecedência do alerta não pode ser maior ou igual aos dias restantes até o vencimento,
// para que o produto nunca entre em alerta no exato momento em que é cadastrado.
// Faltando só 1 dia pra vencer, o único alerta possível é o de 1 dia (vale para perecível e não perecível).
function calcularOpcoesAlerta(validadeISO, perecivel) {
  if (!validadeISO) return { opcoes: DIAS_ALERTA_BASE, maxPermitido: 15, restritivo: false, diasRestantesAtual: null };
  const dias = diasRestantes(validadeISO);
  const maxPermitido = dias - 1;
  if (maxPermitido >= 10) {
    return { opcoes: DIAS_ALERTA_BASE.filter((n) => n <= maxPermitido), maxPermitido, restritivo: false, diasRestantesAtual: dias };
  }
  if (maxPermitido >= 1) {
    return { opcoes: [maxPermitido], maxPermitido, restritivo: true, diasRestantesAtual: dias };
  }
  if (dias >= 1) { // falta só 1 dia: qualquer produto (perecível ou não) pode ser lançado com alerta de 1 dia, senão o botão ficava cinza sem explicação
    return { opcoes: [1], maxPermitido: 1, restritivo: true, diasRestantesAtual: dias, motivoUmDia: true };
  }
  return { opcoes: [], maxPermitido: 0, restritivo: true, diasRestantesAtual: dias };
}

// ---------- Tema ----------
function getTokens(dark) {
  // Sem hairline nas bordas dos cards em lugar nenhum do app — elevação só por sombra (shadow),
  // que é o traço mais visível da troca de visual pedida. Um único ponto de ajuste (aqui) já
  // reflete em todos os cards do app, porque todos herdam a cor de borda a partir daqui.
  return dark
    ? { bg: "#0B1220", card: "#151F30", border: "transparent", inputBorder: "rgba(255,255,255,0.15)", text: "#EEF2F9", subtext: "#93A0B8", inputBg: "#1B2740", chipBg: "#1B2740" }
    : { bg: BG, card: "#FFFFFF", border: "transparent", inputBorder: "#DDE2ED", text: INK, subtext: "#6B7280", inputBg: "#FFFFFF", chipBg: "#F3F5F9" };
}

// ============ Dashboard (computador) — gráficos em SVG puro, sem biblioteca ============
function saudacaoDoDia() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function chaveDia(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function abreviarNumero(v) {
  const n = Number(v) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return String(Math.round(n));
}

export { FAIXAS_DESCONTO, MESES_EXTENSO, PermissoesContext, abreviarNumero, calcularOpcoesAlerta, chaveDia, descontoSugerido, diasRestantes, formatarData, formatarDataExtenso, formatarDataHora, formatarDataHoraExtenso, formatarHora, formatarMoeda, getStatus, getTokens, precisaNotificar, saudacaoDoDia, statusStyles, sugestaoDesconto, useFormatarMoedaComCamada, useValoresVisiveis };

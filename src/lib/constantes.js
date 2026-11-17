// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.


// ---------- Paleta Bipi ----------
// Logo oficial do Bipi (PNG em base64 gerado por scripts/gerar-logo.py, embutido no bundle — sem asset externo)
import { LOGO_BIPI_PNG, LOGO_BIPI_PROPORCAO } from "./logoBipi";

const BLUE = "#0B4F9E";

const BLUE_DARK = "#082F5E";

const BLUE_SOFT = "#EAF1FB";

const RED = "#E31E24";

const RED_DARK = "#A81419";

const RED_SOFT = "#FDEBEC";

const INK = "#12131A";

const BG = "#EEF2F9";

const LOGO_SRC = LOGO_BIPI_PNG;

const SETORES = [
  "Hortifruti", "Açougue", "Padaria", "Frios e Laticínios", "Mercearia",
  "Bebidas", "Congelados", "Limpeza", "Higiene e Perfumaria", "Bazar",
  "CPD / Depósito", "Outro"
];

// "Mercearia leve", "Mercearia doce e salgado" etc. são subsetores: contam como o setor principal ("Mercearia").
function setorPrincipal(s) {
  const t = String(s || "").trim().toLowerCase();
  const achado = SETORES.filter((c) => c !== "Outro").sort((x, y) => y.length - x.length).find((c) => t === c.toLowerCase() || t.startsWith(c.toLowerCase() + " "));
  return achado || s;
}

// Subsetor do produto: coluna subsetor, ou o que sobra no nome do setor ("Mercearia leve" -> "leve"). Igual à função subsetor_efetivo do banco.
function subsetorEfetivo(setor, subsetor) {
  const s = String(subsetor || "").trim(); if (s) return s;
  const sp = setorPrincipal(setor); const t = String(setor || "").trim();
  return t !== sp ? t.slice(sp.length).trim() || null : null;
}

// Item 2: perecíveis nunca se misturam com os outros setores nos filtros/telas
const SETORES_PERECIVEIS = ["Hortifruti", "Açougue", "Padaria", "Frios e Laticínios", "Congelados"];

function ehPerecivel(setor) { return SETORES_PERECIVEIS.includes(setor) || SETORES_PERECIVEIS_EXTRA.includes(setor); }

let SETORES_PERECIVEIS_EXTRA = [];

 function definirSetoresPereciveisExtra(lista) { SETORES_PERECIVEIS_EXTRA = lista; }

 // atualizado pelo App conforme setores customizados são carregados/criados
// Item 5: subsetores de Mercearia
const SUBSETORES_PADRAO = {
  "Mercearia": ["Seca leve", "Seca pesada", "Seca doce", "Seca salgada", "Saudáveis", "Bolachas", "Perfumaria"],
  "Hortifruti": ["Frutas", "Verduras", "Legumes", "Ovos"],
  "Açougue": ["Bovinos", "Suínos", "Aves", "Linguiças e embutidos"],
  "Padaria": ["Pães", "Bolos e doces", "Salgados"],
  "Frios e Laticínios": ["Queijos", "Frios fatiados", "Iogurtes e leites", "Manteiga e margarina"],
  "Bebidas": ["Refrigerantes", "Sucos", "Águas", "Cervejas e vinhos"],
  "Congelados": ["Pratos prontos", "Sorvetes", "Carnes congeladas"],
  "Limpeza": ["Roupas", "Casa", "Cozinha"],
  "Higiene e Perfumaria": ["Cabelo", "Corpo", "Higiene bucal"],
  "Bazar": ["Utilidades", "Papelaria"],
};

// Item 11/28: hierarquia de localização — Setor -> Subsetor -> Corredor | Lado -> Módulo -> Prateleira
const CATEGORIAS_GIRO = ["Alto giro", "Médio giro", "Baixo giro"];

const POLITICAS_TROCA = [
  { valor: "com_troca", label: "Com troca", desc: "Fornecedor aceita troca mesmo vencido" },
  { valor: "sem_troca", label: "Sem troca", desc: "Fornecedor não aceita troca após vencimento" }
];

function gerarCodigoLocalizacao(item) {
  return null; // localização (corredor/módulo/prateleira/depósito) desativada por enquanto
  if (item.local === "deposito") {
    if (!item.corredorDeposito && !item.moduloDeposito && !item.nivelDeposito && !item.vaoDeposito) return null;
    const partes = ["DEP"];
    if (item.corredorDeposito) partes.push("C" + String(item.corredorDeposito).padStart(2, "0"));
    if (item.moduloDeposito) partes.push("M" + String(item.moduloDeposito).padStart(2, "0"));
    if (item.nivelDeposito) partes.push("N" + String(item.nivelDeposito).padStart(2, "0"));
    if (item.vaoDeposito) partes.push("V" + String(item.vaoDeposito).padStart(2, "0"));
    return partes.join("-");
  }
  if (!item.corredor && !item.modulo && !item.prateleira) return null;
  const sigla = (item.setor || "XXX").normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 3).toUpperCase();
  const partes = [sigla];
  if (item.corredor) partes.push("C" + String(item.corredor).padStart(2, "0"));
  if (item.modulo) partes.push("M" + String(item.modulo).padStart(2, "0"));
  if (item.ladoCorredor) partes.push(item.ladoCorredor);
  if (item.prateleira) partes.push("P" + String(item.prateleira).padStart(2, "0"));
  return partes.join("-");
}

// Agrupa itens do mesmo produto (mesmo código de barras + setor) que tenham datas de validade
// diferentes e/ou estejam em locais diferentes (loja/depósito) — pra mostrar um card só com o
// resumo "3 datas diferentes" em vez de um card repetido pra cada lote.
function agruparItensPorProduto(items) {
  const mapa = {};
  items.forEach((it) => {
    const chave = `${it.barcode}__${it.setor}__${it.subsetor || ""}`;
    if (!mapa[chave]) mapa[chave] = [];
    mapa[chave].push(it);
  });
  return Object.values(mapa).map((lotes) => {
    if (lotes.length === 1) return { unico: true, item: lotes[0] };
    const ordenados = [...lotes].sort((a, b) => a.status.d - b.status.d);
    const totalQuantidade = lotes.reduce((acc, i) => acc + (Number(i.quantidade) || 1), 0);
    const piorStatus = ordenados[0].status;
    return { unico: false, base: ordenados[0], lotes: ordenados, totalQuantidade, piorStatus };
  });
}

const DIAS_ALERTA_BASE = [10, 11, 12, 13, 14, 15];

// Taxonomia de ação: o que foi feito com o produto (não só "motivo", mas a decisão tomada)
const MOTIVOS_BAIXA = [
  "Retirado da área de venda", "Enviado para descarte", "Devolução ao fornecedor",
  "Ajuste de estoque", "Promoção aplicada", "Erro de cadastro"
];

const MOTIVOS_EXCLUSAO = [
  "Erro de cadastro", "Produto duplicado", "Código de barras errado",
  "Cadastrado no setor errado", "Teste/experimento", "Outro"
];


const CATALOG_KEY = "condor-validade:catalogo";

const ITEMS_KEY = "condor-validade:itens";

const HIST_KEY = "condor-validade:historico";

const PREFS_KEY = "condor-validade:preferencias";

const NOTIF_KEY = "condor-validade:notificados";

const USER_KEY = "condor-validade:usuario";

const SNAPSHOT_KEY = "condor-validade:instantaneo-offline";

// URL pública do app usada nos links dos e-mails (confirmação / recuperação). Defina VITE_SITE_URL no deploy
// (ex: https://seu-app.vercel.app) pra nunca depender do localhost. Cai no endereço atual se não estiver definida.
const SITE_URL = String(import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");

// TEMPORÁRIO (apresentação 2026-11-17): produto sem foto utilizável fica FORA da tela de início. Para voltar: ESCONDER_SEM_FOTO = false.
// "Sem foto utilizável" = sem foto ou só com link do Open Food Facts (que não abre); o banco guarda o mesmo critério em produtos.invisivel (1 = escondido, 0 = aparece).
const ESCONDER_SEM_FOTO = true;
const BIPI_SEM_FOTO = "/bipi-acenando.png";
function semFotoUtil(foto) { return !foto || /openfoodfacts\.org/i.test(String(foto)); }
function invisivelNoInicio(item) { return ESCONDER_SEM_FOTO && (item?.invisivel != null ? Number(item.invisivel) === 1 : semFotoUtil(item?.foto)); }

export { ESCONDER_SEM_FOTO, BIPI_SEM_FOTO, semFotoUtil, invisivelNoInicio, BG, BLUE, BLUE_DARK, BLUE_SOFT, CATALOG_KEY, CATEGORIAS_GIRO, DIAS_ALERTA_BASE, HIST_KEY, INK, ITEMS_KEY, LOGO_BIPI_PROPORCAO, LOGO_SRC, MOTIVOS_BAIXA, MOTIVOS_EXCLUSAO, NOTIF_KEY, POLITICAS_TROCA, PREFS_KEY, RED, RED_DARK, RED_SOFT, SETORES, SETORES_PERECIVEIS, SETORES_PERECIVEIS_EXTRA, SITE_URL, SNAPSHOT_KEY, SUBSETORES_PADRAO, USER_KEY, agruparItensPorProduto, definirSetoresPereciveisExtra, ehPerecivel, gerarCodigoLocalizacao, setorPrincipal, subsetorEfetivo };

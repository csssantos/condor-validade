// @ts-nocheck
// Edge Function: telegram-bot — lançamento de validade pelo Telegram (funcionário e promotor).
// Webhook do Telegram -> valida segredo -> identifica quem é (vínculo) -> conversa em etapas -> confirma -> lancar_validade (mesma regra do app).
// Mascote: Bipi (banners em public/bot/*.jpg, gerados por scripts/gerar-banners-bot.py). TODA mensagem sai com banner.
// Foto do usuário só é aceita no produto novo sem imagem na internet (etapa "foto"). Produto que não existe no app: o bot busca nome e imagem na internet (Open Food Facts),
// o funcionário confirma e o produto vai para a fila de aprovação de um encarregado (telegram_enviar_aprovacao).
// Segredos (Supabase → Edge Functions → Secrets): TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.
// verify_jwt = false (o Telegram não manda JWT); a proteção é o cabeçalho secreto + vínculo + limites.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { interpretarVoz, buscarNoCatalogo, validarVoz, semAcento, adivinharSetor, formatarNomeNovo } from "./voz.js";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SEGREDO = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// data de hoje em Brasília (meio-dia UTC daquele dia, para os getUTC* darem a data certa)
const hoje = () => { const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number); return new Date(Date.UTC(a, m - 1, d, 12)); };
const limpa = (e: unknown) => (TOKEN ? String(e).split(TOKEN).join("***") : String(e)); // nunca deixa o token do bot nos logs
const iguais = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const fmtData = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };
const num = (n: number) => String(n).replace(".", ",");
const SETORES = ["Hortifruti", "Açougue", "Padaria", "Frios e Laticínios", "Mercearia", "Bebidas", "Congelados", "Limpeza", "Higiene e Perfumaria", "Bazar"];

// ---------- Telegram (toda mensagem leva banner do Bipi) ----------
type Banner = "codigo" | "vinculado" | "produto" | "validade" | "quantidade" | "lote" | "conferir" | "sucesso" | "lancada" | "aprovacao" | "atencao" | "cancelado" | "novo" | "ajuda";
const SITE = "https://condor-validade.vercel.app";
async function tg(method: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    return await r.json();
  } catch (e) { console.error("telegram", method, limpa(e)); return null; }
}
const teclado = (botoes?: { t: string; d: string }[][]) =>
  botoes ? { reply_markup: { inline_keyboard: botoes.map((l) => l.map((b) => ({ text: b.t.slice(0, 60), callback_data: b.d }))) } } : {};
async function falar(chat: number, texto: string, botoes?: { t: string; d: string }[][], banner: Banner = "ajuda") {
  const r = await tg("sendPhoto", { chat_id: chat, photo: `${SITE}/bot/${banner}.jpg`, caption: texto.slice(0, 1000), ...teclado(botoes) });
  if (r?.ok) return r;
  return tg("sendMessage", { chat_id: chat, text: texto.slice(0, 3500), ...teclado(botoes) }); // sem o banner, manda só o texto
}

// Auditoria: tudo que o bot faz de relevante aparece na Auditoria do app (nunca bloqueia a conversa se falhar)
const auditar = async (chat: number, acao: string, detalhe?: string, barcode?: string) => {
  try { await sb.rpc("telegram_auditar", { p_chat_id: chat, p_acao: acao, p_detalhe: detalhe ?? null, p_barcode: barcode ?? null }); }
  catch (e) { console.error("auditar", limpa(e)); }
};

function eanOk(c: string) {
  if (!/^\d+$/.test(c) || ![8, 12, 13].includes(c.length) || /^0+$/.test(c)) return false; // EAN-8, UPC-A ou EAN-13, com dígito verificador
  const d = c.split("").map(Number); const chk = d.pop()!; let s = 0;
  d.reverse().forEach((x, i) => { s += x * (i % 2 === 0 ? 3 : 1); });
  return (10 - (s % 10)) % 10 === chk;
}

// ---------- Produto novo: nome e imagem da internet (Open Food Facts, base pública; só o código de barras é enviado) ----------
const hostOk = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && (x.hostname === "openfoodfacts.org" || x.hostname.endsWith(".openfoodfacts.org")); } catch { return false; } };
async function baixarImagem(url: string): Promise<string | null> {
  try {
    if (!hostOk(url)) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 500 || buf.length > 350000) return null;
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8; const png = buf[0] === 0x89 && buf[1] === 0x50;
    if (!jpeg && !png) return null;
    let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
    return `data:image/${jpeg ? "jpeg" : "png"};base64,${btoa(bin)}`;
  } catch (e) { console.error("imagem", limpa(e)); return null; }
}
async function buscarNaInternet(bc: string) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${bc}.json?fields=product_name,brands,image_front_url,image_front_small_url`, {
      headers: { "User-Agent": "CondorValidade/1.0" }, signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.status === 1 ? j.product : null;
    const prod = String(p?.product_name || "").replace(/[<>{}\[\]\\|^`]/g, " ").replace(/\s+/g, " ").trim();
    if (!prod) return null;
    const marca = String(p?.brands || "").split(",")[0].replace(/[<>{}\[\]\\|^`]/g, " ").replace(/\s+/g, " ").trim();
    const nome = (marca && !semAcento(prod).includes(semAcento(marca)) ? `${marca} - ${prod}` : prod).slice(0, 80);
    let urlImg: string | null = null; let dataUrl: string | null = null;
    for (const u of [p?.image_front_url, p?.image_front_small_url]) {
      if (typeof u !== "string" || !hostOk(u)) continue;
      const d = await baixarImagem(u);
      if (d) { urlImg = u; dataUrl = d; break; }
    }
    return { nome, urlImg, dataUrl };
  } catch (e) { console.error("openfoodfacts", limpa(e)); return null; }
}

// ---------- Catálogo e sessão ----------
type Novo = { barcode: string; nome: string; foto: string | null; urlImg?: string; fotoUsuario?: boolean; setor: string | null; etapa: "imagem" | "nome" | "foto" | "setor" | null };
type Dados = { pilha?: string[]; cancelando?: boolean; avisou?: boolean; fotoStash?: { barcode: string; foto: string }; barcode?: string; nome?: string; porPeso?: boolean; validade?: string; quantidade?: number; lote?: string; semLote?: boolean; opcoes?: { barcode: string; nome: string }[]; dupAsk?: boolean; novo?: Novo; criouProduto?: boolean;
  // dados extras do lançamento de produto já cadastrado (gramagem, preço, troca, subcategoria)
  cad?: Cad; cadLote?: string; semExtras?: boolean; pergunta?: "gram" | "preco" | "troca" | "sub"; subOps?: string[]; tamPulado?: boolean; tam?: string; uni?: string; preco?: number | null; precoOk?: boolean; troca?: "com_troca" | "sem_troca" | "nao_sei"; trocaOk?: boolean; sub?: string; subOk?: boolean };
type Cad = { barcode: string; setor: string; sub: string | null; tam: string | null; uni: string | null; preco: number; troca: string | null };
type Ctx = { vinculo_id: string; tipo: "funcionario" | "promotor"; usuario_id?: string; convite_id?: string; loja_id: number; nome: string; marca?: string; marcas?: string[]; acesso_total?: boolean };
// marca casa só como palavra inteira, sem diferenciar acento/maiúscula (igual ao banco: _marca_casa)
const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function marcaCasa(nome: string, marca: string) {
  const m = semAcento(marca).toUpperCase().trim();
  if (m.length < 3) return false;
  return new RegExp("(^|[^A-Z0-9])" + escRe(m) + "([^A-Z0-9]|$)").test(semAcento(nome).toUpperCase());
}
const marcasDoCtx = (ctx: Ctx) => (Array.isArray(ctx.marcas) && ctx.marcas.length ? ctx.marcas : [ctx.marca || ""]).map((m) => String(m).trim()).filter((m) => m.length >= 3);
const textoMarcas = (ctx: Ctx) => ctx.acesso_total ? "todas as marcas" : marcasDoCtx(ctx).join(", ");

const cacheCat = new Map<number, { t: number; rows: { barcode: string; nome: string; por_peso: boolean }[] }>(); // catálogo por loja, 60 s (evita ~40 consultas por mensagem)
async function carregarCatalogo(ctx: Ctx) {
  const marcas = marcasDoCtx(ctx);
  if (ctx.tipo === "promotor" && !ctx.acesso_total && !marcas.length) return {}; // marca vazia/curta casaria com tudo
  let c = cacheCat.get(ctx.loja_id);
  if (!c || Date.now() - c.t > 60000) {
    const rows: { barcode: string; nome: string; por_peso: boolean }[] = [];
    for (let p = 0; p < 40; p++) {
      const { data, error } = await sb.from("catalogo").select("barcode, nome, por_peso").eq("loja_id", ctx.loja_id).range(p * 1000, p * 1000 + 999);
      if (error || !data) break;
      for (const r of data) if (r.barcode && r.nome) rows.push({ barcode: r.barcode, nome: r.nome, por_peso: !!r.por_peso });
      if (data.length < 1000) break;
    }
    c = { t: Date.now(), rows }; cacheCat.set(ctx.loja_id, c);
    if (cacheCat.size > 50) cacheCat.delete(cacheCat.keys().next().value);
  }
  const cat: Record<string, { nome: string; por_peso: boolean; barcode: string }> = {};
  for (const r of c.rows) {
    if (ctx.tipo === "promotor" && !ctx.acesso_total && !marcas.some((m) => marcaCasa(String(r.nome), m))) continue;
    cat[r.barcode] = { nome: r.nome, por_peso: r.por_peso, barcode: r.barcode };
  }
  return cat;
}

// cada resposta tem 5 minutos; passou disso, o lançamento em andamento é cancelado (e a pessoa é avisada na próxima mensagem)
const TEMPO_RESPOSTA_MS = 5 * 60000;
// descarta o produto novo, mas guarda a foto (uma só) para o "voltar" poder recuperá-la
function descartarNovo(d: Dados) { if (d.novo?.foto) d.fotoStash = { barcode: d.novo.barcode, foto: d.novo.foto }; delete d.novo; }
async function sessaoExpirada(chat: number): Promise<Dados | null> {
  const agora = new Date().toISOString();
  await sb.from("telegram_sessoes").update({ estado: "expirada", atualizado_em: agora })
    .eq("chat_id", chat).in("estado", ["aguardando_info", "aguardando_confirmacao"]).lt("expira_em", agora);
  // o cron também marca sessões como expiradas: avisa uma única vez (flag "avisou") a sessão com progresso que expirou na última hora, se não há outra em andamento
  const { count } = await sb.from("telegram_sessoes").select("id", { count: "exact", head: true }).eq("chat_id", chat).in("estado", ["aguardando_info", "aguardando_confirmacao", "confirmado"]);
  if (count) return null;
  const { data } = await sb.from("telegram_sessoes").select("id,dados").eq("chat_id", chat).eq("estado", "expirada")
    .gt("atualizado_em", new Date(Date.now() - 3600000).toISOString()).order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const d = (data.dados || {}) as Dados;
  if (d.avisou || !temProgresso(d)) return null; // conversa vazia que expirou não precisa de aviso
  const { data: ganhou } = await sb.from("telegram_sessoes").update({ dados: { ...d, avisou: true } }).eq("id", data.id).or("dados->>avisou.is.null,dados->>avisou.neq.true").select("id"); // atômico: só um avisa
  return ganhou?.length ? d : null;
}
async function avisarExpirou(chat: number, d: Dados) {
  const nome = d.nome ?? d.novo?.nome;
  await auditar(chat, "cancelou lançamento no Telegram", `${nome ?? "produto não definido"} (tempo esgotado: 5 min sem resposta)`, d.barcode ?? d.novo?.barcode);
  return falar(chat, `⏱️ Passaram mais de 5 minutos sem resposta, então cancelei o lançamento${nome ? " de " + nome : ""}. Nada foi lançado.\n\nPara começar de novo, mande o código de barras ou o nome do produto.`, undefined, "cancelado");
}
async function sessaoAtiva(chat: number) {
  const { data } = await sb.from("telegram_sessoes").select("*").eq("chat_id", chat)
    .in("estado", ["aguardando_info", "aguardando_confirmacao", "confirmado"]).maybeSingle();
  if (!data) return null;
  if (new Date(data.expira_em) < new Date()) {
    await sb.from("telegram_sessoes").update({ estado: "expirada", atualizado_em: new Date().toISOString() }).eq("id", data.id);
    return null;
  }
  return data;
}
async function garantirSessao(ctx: Ctx, chat: number) {
  const s = await sessaoAtiva(chat);
  if (s) return s;
  const { data } = await sb.from("telegram_sessoes").insert({ chat_id: chat, vinculo_id: ctx.vinculo_id, estado: "aguardando_info", dados: {}, expira_em: new Date(Date.now() + TEMPO_RESPOSTA_MS).toISOString() }).select("*").single();
  return data ?? (await sessaoAtiva(chat));
}
const salvar = (id: string, estado: string, dados: Dados, erro?: string) =>
  sb.from("telegram_sessoes").update({ estado, dados, erro: erro ?? null, atualizado_em: new Date().toISOString(), expira_em: new Date(Date.now() + TEMPO_RESPOSTA_MS).toISOString() }).eq("id", id);

// ---------- Lote (número impresso na embalagem) ----------
const LOTE_RE = /^[A-Z0-9][A-Z0-9./ -]{0,19}$/;
const normLote = (t: string) => String(t || "").replace(/^\s*lote(?:\s*[:\-]\s*|\s+)/i, "").replace(/\s+/g, " ").trim().toUpperCase();
const loteValido = (lt: string) => LOTE_RE.test(lt) && /\d/.test(lt); // lote real tem pelo menos um número
// datas escritas "do jeito do povo": 15122026, 15 12 2026, 12/2026 (último dia do mês) -> dd/mm/aaaa
function prepararData(t: string, semProduto = false) { // semProduto: ainda não há produto na conversa, então 8 dígitos válidos são EAN-8, não data
  let x = t.replace(/\b(\d{2})(\d{2})(\d{4})\b/g, (m, d, mo, a) => (!(semProduto && eanOk(m)) && +d >= 1 && +d <= 31 && +mo >= 1 && +mo <= 12 && +a >= 2000 && +a <= 2100) ? `${d}/${mo}/${a}` : m);
  x = x.replace(/\b(\d{1,2})[ ](\d{1,2})[ ](20\d{2})\b/g, (m, d, mo, a) => (+d >= 1 && +d <= 31 && +mo >= 1 && +mo <= 12) ? `${d}/${mo}/${a}` : m);
  x = x.replace(/(?<![\w\/])(\d{1,2})\/(20\d{2})\b/g, (m, mo, a) => { if (+mo < 1 || +mo > 12) return m; const u = new Date(Date.UTC(+a, +mo, 0)).getUTCDate(); return `${u}/${String(mo).padStart(2, "0")}/${a}`; });
  return x;
}
async function lotesDoProduto(ctx: Ctx, barcode: string) {
  const { data } = await sb.from("produtos").select("lote, sem_lote, validade, quantidade").eq("loja_id", ctx.loja_id).eq("barcode", barcode).order("validade").limit(6);
  const l = data || [];
  if (!l.length) return "";
  return `\n\nJá tem ${l.length === 6 ? "6+" : l.length} lote(s) lançado(s) desse produto:\n` + l.map((x: any) => `• ${x.lote ? "Lote " + x.lote : "Sem lote"} · vence ${fmtData(x.validade)} · ${x.quantidade} un`).join("\n") + "\nSe o lote for um destes (com a mesma validade), a quantidade é SOMADA ao lote, até um limite por vez. Se for outro lote, ele entra como lote novo.";
}

// ---------- Conversa ----------
const diasAte = (iso: string) => { const h = hoje(); const [vy, vm, vd] = iso.split("-").map(Number); return Math.round((Date.UTC(vy, vm - 1, vd) - Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate())) / 86400000); };
const MSG_SEM_LOTE = "Sem lote não dá para lançar pelo Telegram. Confira a embalagem: o lote fica impresso perto da validade. Se o produto realmente não tem lote, avise o encarregado para lançar pelo app.\n\nPara desistir, envie /cancelar.";
const MSG_PERTO = (nome: string | undefined, validade: string, dias: number) =>
  `⚠️ ${nome ? nome + "\n" : ""}Esse produto ${dias <= 0 ? "vence HOJE" : dias === 1 ? "vence AMANHÃ" : "vence em 2 dias"} (${fmtData(validade)}).\n\nProduto com até 2 dias para vencer não é lançado pelo Telegram. Leve o produto ao gerente o mais rápido possível, para pedir o preço direto.\n\nNada foi lançado.\n\nSe digitou a data errada, mande a data certa. Para desistir, envie /cancelar.`;
function perguntarSetor(chat: number, sid: string, pre = "") {
  const linhas: { t: string; d: string }[][] = [];
  SETORES.forEach((s, i) => { if (i % 2 === 0) linhas.push([]); linhas[linhas.length - 1].push({ t: s, d: `st:${sid}:${i}` }); });
  return falar(chat, pre + "Em qual setor esse produto novo fica?", linhas, "novo");
}

// ---------- Dados extras do lançamento: gramagem, preço, troca, subcategoria ----------
const SUBS_PADRAO: Record<string, string[]> = {
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
const UNID: Record<string, string> = { g: "G", gr: "G", grama: "G", gramas: "G", kg: "KG", quilo: "KG", quilos: "KG", ml: "ML", l: "L", lt: "L", lts: "L", litro: "L", litros: "L" };
// "500", "500g", "1,5 kg", "900 ml", "2 l": sem unidade vale grama (G)
function lerGramagem(t: string): { tam: string; uni: string } | null {
  const m = semAcento(t).toLowerCase().replace(/[.!\s]+$/, "").trim().match(/^(\d{1,4}(?:[.,]\d{1,3})?)\s*(g|gr|gramas?|kg|quilos?|ml|l|lts?|litros?)?$/);
  if (!m) return null;
  if (/^\d{1,3}\.\d{3}$/.test(m[1])) return null; // "1.500" é ambíguo (milhar ou decimal): pede de novo sem ponto
  const n = Number(m[1].replace(",", "."));
  if (!(n > 0) || n > 9999) return null;
  return { tam: m[1], uni: m[2] ? UNID[m[2]] : "G" };
}
// "8,99", "R$ 8,99", "8.99"
function lerPreco(t: string): number | null {
  const m = semAcento(t).toLowerCase().replace(/^r\$\s*/, "").replace(/\s*(reais|real|rs)?\s*[.!]*\s*$/, "").trim().replace(/^(\d{1,2})\.(\d{3})(,\d{1,2})?$/, "$1$2$3").match(/^(\d{1,4})(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const n = Number(m[1] + "." + (m[2] ?? "0"));
  return n >= 0.01 && n <= 5000 ? n : null;
}
const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");
const TXT_TROCA: Record<string, string> = { com_troca: "Com troca", sem_troca: "Sem troca", nao_sei: "Não sei" };
function limparExtras(d: Dados) { for (const k of ["cad", "cadLote", "semExtras", "pergunta", "subOps", "tamPulado", "tam", "uni", "preco", "precoOk", "troca", "trocaOk", "sub", "subOk"]) delete (d as any)[k]; }
// pergunta de extras só para produto já cadastrado, sem ser por peso e que NÃO é soma em lote que já existe
const extrasCorrecao = (ctx: Ctx, d: Dados): "nenhum" | "prom" | "todos" => (d.novo || d.porPeso || d.semExtras) ? "nenhum" : ctx.tipo === "funcionario" ? "todos" : "prom";
async function carregarCad(ctx: Ctx, d: Dados) {
  if (d.cad && d.cad.barcode !== d.barcode) limparExtras(d);
  if (!d.cad) {
    const { data } = await sb.from("catalogo").select("setor, subsetor, tamanho, unidade_medida, preco_unitario, politica_troca").eq("loja_id", ctx.loja_id).eq("barcode", d.barcode).maybeSingle();
    d.cad = { barcode: d.barcode!, setor: data?.setor ?? "", sub: data?.subsetor ? String(data.subsetor) : null, tam: data?.tamanho ? String(data.tamanho) : null, uni: data?.unidade_medida ? String(data.unidade_medida) : null, preco: Number(data?.preco_unitario) || 0, troca: data?.politica_troca ?? null };
    if (ctx.tipo === "funcionario" && (d.cad.troca === "com_troca" || d.cad.troca === "sem_troca")) { d.troca = d.cad.troca; d.trocaOk = true; } // o que já está no cadastro entra sozinho (dá para corrigir)
    if (ctx.tipo === "funcionario" && d.cad.sub && subValido(d.cad.sub)) { d.sub = d.cad.sub; d.subOk = true; }
  }
  if (d.cadLote !== (d.lote ?? "")) { // lote que já existe: a quantidade é SOMADA ao lote, então não pergunta nada de novo
    d.cadLote = d.lote ?? "";
    if (d.lote) { const { data: l } = await sb.from("produtos").select("id").eq("loja_id", ctx.loja_id).eq("barcode", d.barcode).eq("lote", d.lote).limit(1); d.semExtras = !!l?.length; } else d.semExtras = false;
    if (d.semExtras) for (const k of ["pergunta", "subOps", "tamPulado", "tam", "uni", "preco", "precoOk", "troca", "trocaOk", "sub", "subOk"]) delete (d as any)[k]; // soma em lote que já existe: nada disso é gravado
  }
}
const extrasValidos = (d: Dados) => !d.novo && !d.porPeso && !d.semExtras && !!d.cad && d.cad.barcode === d.barcode;
const subValido = (t: string) => t.length <= 40 && /^[A-Za-zÀ-ÿ0-9 ,.&\/()-]+$/.test(t);
const setorPrincipalBot = (d: Dados) => Object.keys(SUBS_PADRAO).find((k) => d.cad && (d.cad.setor === k || d.cad.setor.startsWith(k + " "))) ?? "";
async function opcoesSub(ctx: Ctx, d: Dados): Promise<string[]> {
  const principal = setorPrincipalBot(d);
  if (!principal) return [];
  const { data } = await sb.from("subsetores_customizados").select("nome").eq("loja_id", ctx.loja_id).eq("setor", principal).order("nome").limit(30);
  const todos = [...SUBS_PADRAO[principal], ...((data || []).map((x: any) => String(x.nome)).filter((n: string) => n && subValido(n)))];
  return [...new Set(todos)].slice(0, 20);
}
// faz a próxima pergunta de extras que falta; true = fez uma pergunta (a conversa espera a resposta)
async function extrasPasso(ctx: Ctx, chat: number, s: { id: string }, d: Dados, pre: string): Promise<boolean> {
  if (d.novo || d.porPeso) { limparExtras(d); return false; }
  await carregarCad(ctx, d);
  if (d.semExtras) { delete d.pergunta; return false; }
  const cab = `${pre}Produto: ${d.nome}\nValidade: ${fmtData(d.validade!)}${d.lote ? `\nLote: ${d.lote}` : ""}\n\n`;
  const func = ctx.tipo === "funcionario";
  const cad = d.cad!;
  if (!d.tam && !d.tamPulado) {
    d.pergunta = "gram"; await salvar(s.id, "aguardando_info", d);
    const bt = [[...(cad.tam ? [{ t: `Usar ${cad.tam} ${cad.uni || "G"} do cadastro`, d: `gm:${s.id}:1` }] : []), { t: "Não sei a gramagem", d: `gm:${s.id}:p` }]];
    await falar(chat, cab + "Qual a gramagem (ou volume) da embalagem? Ex.: 500 g, 1 kg, 900 ml, 2 l.\nSó o número vale como grama (g).", bt, "quantidade"); return true;
  }
  if (!d.precoOk) {
    d.pergunta = "preco"; await salvar(s.id, "aguardando_info", d);
    const bt = [[...(cad.preco > 0 && cad.preco <= 5000 ? [{ t: `Usar ${brl(cad.preco)} do cadastro`, d: `pc:${s.id}:u` }] : []), { t: "Pular preço", d: `pc:${s.id}:p` }]];
    await falar(chat, cab + "Qual o preço de venda? Ex.: 8,99", bt, "quantidade"); return true;
  }
  if (!d.trocaOk) {
    d.pergunta = "troca"; await salvar(s.id, "aguardando_info", d);
    await falar(chat, cab + "Esse produto tem troca com o fornecedor?", [[{ t: "✅ Com troca", d: `tc:${s.id}:c` }, { t: "🚫 Sem troca", d: `tc:${s.id}:s` }], [{ t: "Não sei", d: `tc:${s.id}:n` }]], "produto"); return true;
  }
  if (func && !d.subOk) {
    const ops = await opcoesSub(ctx, d);
    if (!ops.length) { d.subOk = true; delete d.subOps; }
    else {
      d.pergunta = "sub"; d.subOps = ops; await salvar(s.id, "aguardando_info", d);
      const linhas: { t: string; d: string }[][] = [];
      ops.forEach((o, i) => { if (i % 2 === 0) linhas.push([]); linhas[linhas.length - 1].push({ t: o, d: `sc:${s.id}:${i}` }); });
      linhas.push([{ t: "Pular subcategoria", d: `sc:${s.id}:x` }]);
      await falar(chat, cab + `Em qual subcategoria de ${setorPrincipalBot(d)} esse produto fica?`, linhas, "produto"); return true;
    }
  }
  delete d.pergunta;
  return false;
}
async function proximoPasso(ctx: Ctx, chat: number, s: { id: string }, d: Dados, aviso = "") {
  // travas (mesmas da voz): data passada, quantidade absurda...
  const probs = validarVoz({ validade: d.validade ?? null, quantidade: d.quantidade ?? null, porPeso: !!d.porPeso }, hoje());
  if (probs.length) {
    if (probs.some((p: string) => /validade/i.test(p))) delete d.validade;
    if (probs.some((p: string) => /quantidade/i.test(p))) delete d.quantidade;
    await salvar(s.id, "aguardando_info", d);
    await auditar(chat, "dado barrado no Telegram", `${d.nome ?? "produto não definido"}: ${probs.join(" ")}`, d.barcode);
    return falar(chat, "⚠️ " + probs.join("\n") + "\n\nMande o dado certo.", undefined, "atencao");
  }
  // validade com até 2 dias (hoje, amanhã, depois de amanhã): não lança pelo Telegram, tem que levar ao gerente
  if (d.validade) {
    const dias = diasAte(d.validade);
    if (dias <= 2) {
      const vd = d.validade; delete d.validade; await salvar(s.id, "aguardando_info", d); // não lança, mas não perde a conversa (pode ter digitado a data errada)
      await auditar(chat, "lançamento barrado no Telegram", `${d.nome ?? "produto não definido"}: validade ${fmtData(vd)} (${dias <= 0 ? "vence hoje" : dias + " dia(s)"}), levar ao gerente`, d.barcode);
      return falar(chat, MSG_PERTO(d.nome, vd, dias), undefined, "atencao");
    }
  }
  const pre = aviso ? aviso + "\n\n" : "";
  if (d.cad && d.cad.barcode !== d.barcode) limparExtras(d); // trocou de produto: nada do anterior vai junto
  if (d.pergunta && (!d.barcode || !d.validade || (d.lote === undefined && !d.semLote && !d.porPeso) || d.quantidade == null)) { delete d.pergunta; delete d.subOps; } // pergunta de extras só existe depois de produto, validade, lote e quantidade
  if (!d.barcode) { await salvar(s.id, "aguardando_info", d); return falar(chat, pre + "Qual é o produto? Envie o código de barras ou o nome.", undefined, "produto"); }
  if (!d.validade) { await salvar(s.id, "aguardando_info", d); return falar(chat, pre + `Produto: ${d.nome}\nQual a data de validade? (ex.: 15/12/2026)`, undefined, "validade"); }
  if (!d.porPeso && d.lote === undefined && !d.semLote) {
    await salvar(s.id, "aguardando_info", d);
    const ex = d.novo ? "" : await lotesDoProduto(ctx, d.barcode);
    return falar(chat, pre + `Produto: ${d.nome}\nValidade: ${fmtData(d.validade)}\n\nQual o lote? Está impresso na embalagem, perto da validade (ex.: L2410A).\nSem lote não dá para lançar pelo Telegram.${ex}`, undefined, "lote");
  }
  if (d.quantidade == null) { await salvar(s.id, "aguardando_info", d); return falar(chat, pre + `Produto: ${d.nome}\nValidade: ${fmtData(d.validade)}\n${d.porPeso ? "Quantos kg? (ex.: 2,5)" : "Quantas unidades?"}`, undefined, "quantidade"); }
  if (await extrasPasso(ctx, chat, s, d, pre)) return;
  await salvar(s.id, "aguardando_confirmacao", d);
  const { data: loja } = await sb.from("lojas").select("numero_loja").eq("id", ctx.loja_id).maybeSingle();
  const novoTxt = d.novo ? `\n🆕 Produto novo: vai para aprovação de um encarregado\nSetor: ${d.novo.setor}\nImagem: ${d.novo.fotoUsuario ? "foto enviada por você" : d.novo.foto ? "da internet (confirmada por você)" : "sem imagem"}` : "";
  const resumo = `${pre}Confira os dados:\n\nProduto: ${d.nome}\nCódigo: ${d.barcode}\nValidade: ${fmtData(d.validade)}\n${d.porPeso ? "" : `Lote: ${d.lote ?? "sem lote"}\n`}Quantidade: ${num(d.quantidade)} ${d.porPeso ? "kg" : "unidades"}\n${d.novo || d.porPeso || d.semExtras ? "" : (d.tam ? `Embalagem: ${d.tam} ${d.uni ?? "G"}\n` : "")}${d.novo || d.porPeso || d.semExtras ? "" : d.precoOk ? `Preço: ${d.preco != null ? brl(d.preco) : "não informado"}\n` : ""}${d.trocaOk ? `Troca: ${TXT_TROCA[d.troca ?? "nao_sei"]}\n` : ""}${d.sub ? `Subcategoria: ${d.sub}\n` : ""}Loja: ${loja?.numero_loja ?? "—"}${novoTxt}\n\n${d.novo ? "Confirma o envio para aprovação?" : "Confirma o lançamento?"}`;
  return falar(chat, resumo, [[{ t: "✅ Confirmar", d: `ok:${s.id}` }, { t: "❌ Cancelar", d: `no:${s.id}` }], [{ t: "✏️ Corrigir", d: `fx:${s.id}` }]], "conferir");
}

async function escolherProduto(ctx: Ctx, chat: number, s: { id: string }, d: Dados, nomeFalado: string) {
  const cat = await carregarCatalogo(ctx);
  const r = buscarNoCatalogo(String(nomeFalado).split(/\s+/).slice(0, 14).join(" ").slice(0, 120), cat); // limite de tamanho: busca fonética é pesada
  if (r.tipo === "encontrado") {
    const e = r.candidatos[0].entrada; d.barcode = e.barcode; d.nome = e.nome; d.porPeso = e.por_peso; delete d.opcoes; descartarNovo(d); delete d.lote; delete d.semLote;
    return proximoPasso(ctx, chat, s, d);
  }
  if (r.tipo === "varios" || r.tipo === "marca") {
    d.opcoes = r.candidatos.slice(0, 8).map((c: { entrada: { barcode: string; nome: string } }) => ({ barcode: c.entrada.barcode, nome: c.entrada.nome }));
    await salvar(s.id, "aguardando_info", d);
    return falar(chat, "Qual destes?", d.opcoes!.map((o, i) => [{ t: o.nome, d: `pr:${s.id}:${i}` }]), "produto");
  }
  await salvar(s.id, "aguardando_info", d);
  return falar(chat, ctx.tipo === "promotor"
    ? `Não achei esse produto (${textoMarcas(ctx)}) no cadastro da loja. Envie o código de barras ou o nome completo.`
    : "Não achei esse produto no cadastro da loja. Se ele for novo, envie o código de barras dele: eu busco a imagem na internet e você confirma.", undefined, "novo");
}

async function porBarcode(ctx: Ctx, chat: number, s: { id: string }, d: Dados, bc: string) {
  descartarNovo(d);
  const cat = await carregarCatalogo(ctx);
  const e = cat[bc];
  if (e) { d.barcode = e.barcode; d.nome = e.nome; d.porPeso = e.por_peso; delete d.opcoes; delete d.lote; delete d.semLote; return proximoPasso(ctx, chat, s, d); }
  delete d.barcode; delete d.nome;
  if (ctx.tipo === "promotor") { await salvar(s.id, "aguardando_info", d); return falar(chat, "Esse código não é de um produto das suas marcas nesta loja. Confira o número.", undefined, "atencao"); }
  if (!eanOk(bc)) { await salvar(s.id, "aguardando_info", d); return falar(chat, "Esse código de barras não é válido: aceito EAN-8 (8 dígitos), UPC-A (12) ou EAN-13 (13), e o último dígito é o de verificação. Confira o número e envie de novo.", undefined, "atencao"); }
  // produto novo: busca nome e imagem na internet e pede a confirmação do funcionário
  const { data: lim } = await sb.rpc("rl_servico", { p_chave: String(chat), p_bucket: "tg_web", p_max: 6 });
  if (lim === false) { await salvar(s.id, "aguardando_info", d); return falar(chat, "Muitas buscas em pouco tempo. Aguarde 1 minuto.", undefined, "atencao"); }
  await auditar(chat, "consultou produto na internet (Open Food Facts)", bc, bc);
  const achou = await buscarNaInternet(bc);
  if (!achou) {
    d.novo = { barcode: bc, nome: "", foto: null, setor: null, etapa: "nome" };
    await salvar(s.id, "aguardando_info", d);
    return falar(chat, "Esse código ainda não está no app e não achei o produto na internet.\n\nSe for um produto novo, envie o nome completo (marca + produto); depois eu peço uma foto legível da embalagem. Ou confira o número do código.", undefined, "novo");
  }
  const nome = formatarNomeNovo(achou.nome, cat).nomeNovo;
  delete d.fotoStash; // só uma foto pesada por conversa
  d.novo = { barcode: bc, nome, foto: achou.dataUrl, urlImg: achou.dataUrl ? (achou.urlImg ?? undefined) : undefined, setor: adivinharSetor(nome), etapa: "imagem" };
  await salvar(s.id, "aguardando_info", d);
  const legenda = `Esse produto não está no app. Achei na internet:\n\n${nome}\nCódigo: ${bc}${achou.dataUrl ? "" : "\n(sem imagem disponível: vou pedir uma foto sua)"}\n\nÉ esse o produto${achou.dataUrl ? " e posso usar essa imagem no cadastro do app" : ""}?`;
  const botoes = [[{ t: "✅ Sim, é esse", d: `im:${s.id}:1` }, { t: "❌ Não é", d: `im:${s.id}:0` }]];
  if (achou.dataUrl && achou.urlImg) {
    const r = await tg("sendPhoto", { chat_id: chat, photo: achou.urlImg, caption: legenda.slice(0, 1000), ...teclado(botoes) });
    if (r?.ok) return r;
    d.novo.foto = null; await salvar(s.id, "aguardando_info", d); // o Telegram não conseguiu mostrar a imagem: segue sem ela, mas só com a sua confirmação
    return falar(chat, legenda.replace(" e posso usar essa imagem no cadastro do app", "") + "\n(não consegui mostrar a imagem)", botoes, "novo");
  }
  return falar(chat, legenda, botoes, "novo");
}

// Foto enviada pelo funcionario (so no produto novo sem imagem na internet): baixa do Telegram, valida e guarda como data URL
async function baixarFotoTelegram(fotos: any[]): Promise<{ ok: true; dataUrl: string } | { ok: false; motivo: string }> {
  try {
    const lista = (fotos || []).filter((f) => f?.file_id);
    const boas = lista.filter((f) => (f.file_size ?? 0) <= 320000).sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const f = boas[0];
    if (!f) return { ok: false, motivo: "A foto ficou pesada demais. Tire de novo, mais de perto e sem zoom." };
    if (Math.min(f.width || 0, f.height || 0) < 300) return { ok: false, motivo: "A foto ficou pequena e sem nitidez. Chegue mais perto da embalagem e tire de novo." };
    const r = await tg("getFile", { file_id: f.file_id });
    const path = r?.result?.file_path;
    if (!path || !/^photos\/[\w./-]+$/.test(path)) return { ok: false, motivo: "N\u00e3o consegui receber a foto. Envie de novo." };
    const resp = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${path}`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return { ok: false, motivo: "N\u00e3o consegui receber a foto. Envie de novo." };
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length < 3000 || buf.length > 330000) return { ok: false, motivo: "A foto n\u00e3o p\u00f4de ser usada. Envie outra, \u00fanica e n\u00edtida." };
    if (!(buf[0] === 0xff && buf[1] === 0xd8)) return { ok: false, motivo: "Formato de foto n\u00e3o aceito. Envie como foto (n\u00e3o como arquivo)." };
    let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
    return { ok: true, dataUrl: `data:image/jpeg;base64,${btoa(bin)}` };
  } catch (e) { console.error("foto", limpa(e)); return { ok: false, motivo: "N\u00e3o consegui receber a foto. Envie de novo." }; }
}
const MSG_PEDIR_FOTO = "N\u00e3o consegui uma imagem desse produto na internet.\n\nEnvie uma FOTO leg\u00edvel da embalagem (frente do produto, de perto, com boa luz e sem tremer). Ela vai para o cadastro do app depois que o encarregado aprovar.\n\nPara desistir, envie /cancelar.";

async function novoConfirmado(ctx: Ctx, chat: number, s: { id: string }, d: Dados) {
  const n = d.novo!;
  d.barcode = n.barcode; d.nome = n.nome; d.porPeso = false; delete d.lote; delete d.semLote;
  if (!n.foto) { n.etapa = "foto"; await salvar(s.id, "aguardando_info", d); return falar(chat, MSG_PEDIR_FOTO, undefined, "novo"); }
  n.etapa = null;
  if (!n.setor) { n.etapa = "setor"; await salvar(s.id, "aguardando_info", d); return perguntarSetor(chat, s.id); }
  return proximoPasso(ctx, chat, s, d);
}

async function tratarTexto(ctx: Ctx, chat: number, texto: string) {
  const low0 = semAcento(texto).replace(/[!.,;:?]+\s*$/g, "").trim();
  if (/^(cancelar|cancela|voltar|volta|corrigir anterior|errei)$/.test(low0) && !(await sessaoAtiva(chat))) return falar(chat, "Não há lançamento em andamento. Para começar, envie o código de barras ou o nome do produto.", undefined, "ajuda");
  const s = await garantirSessao(ctx, chat);
  if (!s) return falar(chat, "Não consegui iniciar agora. Tente de novo em instantes.", undefined, "atencao");
  const d: Dados = { ...(s.dados || {}) };
  const low = semAcento(texto).replace(/[!.,;:?]+\s*$/g, "").trim();
  if (texto.length > 300) return falar(chat, "Mensagem muito longa. Envie só o código de barras ou o nome do produto.", undefined, "atencao");
  await sb.from("telegram_sessoes").update({ expira_em: new Date(Date.now() + TEMPO_RESPOSTA_MS).toISOString() }).eq("id", s.id); // mensagem recebida renova os 5 minutos
  // pergunta "quer mesmo cancelar?" aberta: "sim" cancela, "não" continua; nada mais é aceito até responder
  if (d.cancelando && !/^(voltar|volta|corrigir anterior|errei)$/.test(low)) {
    if (/^(sim|s|isso|cancelar|cancela)$/.test(low)) return cancelar(chat, s.id);
    if (/^(nao|n|continuar|continua)$/.test(low)) { delete d.cancelando; return reperguntar(ctx, chat, s, d, "Ok, vamos continuar."); }
    return falar(chat, "Antes de seguir: quer mesmo cancelar? Toque num dos botões acima, ou escreva SIM para cancelar ou NÃO para continuar.", undefined, "atencao");
  }
  // "cancelar" vale em qualquer etapa (inclusive na pergunta do lote), mas pede confirmação; "voltar" desfaz a última resposta
  if (/^(cancelar|cancela)$/.test(low)) return pedirCancelar(chat, s);
  if (/^(voltar|volta|corrigir anterior|errei)$/.test(low)) return voltar(ctx, chat, s);
  empilhar(d, (s.dados || {}) as Dados);
  const aguardaLote = s.estado === "aguardando_info" && !!d.barcode && !!d.validade && d.lote === undefined && !d.semLote && !d.porPeso && !d.novo?.etapa && !d.pergunta;
  // "sem lote" em qualquer lugar da frase: Telegram não lança sem lote ("não tem" solto só vale quando a pergunta aberta é a do lote)
  if (/\b(sem|nao tem|nao possui)\s+lote\b/.test(low) || (aguardaLote && /^(sem numero|nao tem|sem)$/.test(low))) return falar(chat, MSG_SEM_LOTE, undefined, "atencao");
  // pergunta do lote em aberto: a resposta (mesmo só números) é o lote, a não ser que traga data ou quantidade
  if (aguardaLote) {
    const pl = interpretarVoz(prepararData(texto), hoje());
    const temKw = /quantidade|unidade|\bun\b|\bkg\b/i.test(texto);
    if (!pl.validade && !temKw && !/^\/(?!\w)/.test(texto)) {
      const lt = normLote(texto);
      if (!loteValido(lt)) return falar(chat, "Lote inválido. Use só letras, números, ponto, barra ou traço (até 20 caracteres) e pelo menos um número, como está na embalagem.", undefined, "atencao");
      d.lote = lt; return proximoPasso(ctx, chat, s, d);
    }
  }
  let textoSemLote = texto;
  const ml = texto.match(/\blote\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9./-]{0,19})/i);
  if (ml) { const lt = normLote(ml[1]); if (loteValido(lt)) { d.lote = lt; textoSemLote = texto.replace(ml[0], " "); } }
  textoSemLote = prepararData(textoSemLote, !d.barcode);
  const mb = textoSemLote.match(/\b\d{8,14}\b/);

  if (s.estado === "aguardando_confirmacao") {
    if (/^(sim|s|confirmar|confirmo|confirma|pode lancar|pode lancar sim|isso|ok)$/.test(low)) return confirmar(ctx, chat, s.id, false);
    if (/^(nao|n)$/.test(low)) return pedirCancelar(chat, s);
    if (/^(corrigir|corrige)$/.test(low)) return perguntarCorrecao(chat, s.id, !!d.novo, extrasCorrecao(ctx, d));
  }
  // pergunta de gramagem / preço / troca / subcategoria em aberto
  if (!d.novo && d.pergunta && s.estado === "aguardando_info" && !(mb && eanOk(mb[0]))) { // código de barras válido = trocar de produto
    if (d.pergunta === "gram") {
      const g = lerGramagem(texto);
      if (!g) return falar(chat, "Não entendi a gramagem. Envie o número com a unidade, como 500 g, 1 kg, 900 ml ou 2 l (só o número vale como grama). Para milhar, escreva 1500, sem ponto. Para voltar uma resposta, envie /voltar.", undefined, "atencao");
      d.tam = g.tam; d.uni = g.uni; delete d.pergunta; return proximoPasso(ctx, chat, s, d);
    }
    if (d.pergunta === "preco") {
      const pr = lerPreco(texto);
      if (pr == null) return falar(chat, "Não entendi o preço. Envie só o valor, entre R$ 0,01 e R$ 5.000,00. Ex.: 8,99. Para voltar uma resposta, envie /voltar.", undefined, "atencao");
      d.preco = pr; d.precoOk = true; delete d.pergunta; return proximoPasso(ctx, chat, s, d);
    }
    if (d.pergunta === "troca") {
      const t = low;
      const v = /^(com troca|tem troca|tem|sim|s)$/.test(t) ? "com_troca" : /^(sem troca|nao tem troca|nao tem|nao|n)$/.test(t) ? "sem_troca" : /^(nao sei|ns)$/.test(t) ? "nao_sei" : null;
      if (v) { d.troca = v; d.trocaOk = true; delete d.pergunta; return proximoPasso(ctx, chat, s, d); }
    }
    if (d.pergunta === "sub" && ctx.tipo === "funcionario") {
      const o = (d.subOps || []).find((x) => semAcento(x).toLowerCase() === low);
      if (o) { d.sub = o; d.subOk = true; delete d.subOps; delete d.pergunta; return proximoPasso(ctx, chat, s, d); }
    }
    return falar(chat, "Responda com os botões da mensagem acima (ou escreva a resposta), ou envie /voltar ou /cancelar.", undefined, "atencao");
  }
  // produto novo: etapa do nome (sem imagem) ou respostas que precisam de botão
  if (d.novo?.etapa && !mb) {
    if (d.novo.etapa === "nome") {
      const t = texto.replace(/\s+/g, " ").trim();
      if (t.split(" ").length < 2 || t.length < 5 || t.length > 80 || !/[A-Za-zÀ-ÿ]{3}/.test(t) || /[<>{}\[\]\\|^`]/.test(t)) {
        return falar(chat, "Envie o nome completo do produto, com marca e produto (ex.: Bauducco Biscoito Maria 200g).", undefined, "atencao");
      }
      const cat = await carregarCatalogo(ctx);
      d.novo.nome = formatarNomeNovo(t, cat).nomeNovo; d.novo.foto = null; d.novo.setor = adivinharSetor(d.novo.nome);
      return novoConfirmado(ctx, chat, s, d);
    }
    if (d.novo.etapa === "foto") return falar(chat, "Preciso de uma FOTO do produto (não texto). Envie a foto da embalagem, de perto e nítida, ou /cancelar.", undefined, "atencao");
    return falar(chat, "Responda com os botões da mensagem acima, ou envie /cancelar.", undefined, "atencao");
  }
  // escolha de opção por número ("2")
  if (d.opcoes?.length && /^\d{1,2}$/.test(low)) {
    const o = d.opcoes[Number(low) - 1];
    if (o) return porBarcode(ctx, chat, s, d, o.barcode);
  }

  const resto = mb ? textoSemLote.replace(mb[0], " ") : textoSemLote;
  const p = interpretarVoz(resto, hoje());
  const soNumero = /^\s*\d+(?:[.,]\d+)?\s*(?:kg|un|unidades?)?\s*$/i.test(resto) && !mb;
  let mudou = false;
  if (p.validade) { d.validade = p.validade; mudou = true; }
  if (p.quantidade != null) { d.quantidade = p.quantidade; if (p.porPeso && !d.barcode) d.porPeso = true; mudou = true; }
  else if (soNumero && d.barcode && d.quantidade == null) { d.quantidade = Number(resto.replace(/[^\d.,]/g, "").replace(",", ".")); mudou = true; }

  if (mb) return porBarcode(ctx, chat, s, d, mb[0]);
  if (!d.barcode && p.nome && !soNumero) return escolherProduto(ctx, chat, s, d, p.nome);
  if (!mudou && !d.barcode) return falar(chat, "Não entendi. Envie o código de barras ou o nome do produto.", undefined, "atencao");
  return proximoPasso(ctx, chat, s, d);
}

// ---------- Voltar uma resposta / cancelar com confirmação ----------
// cada resposta guarda uma "foto" do estado anterior (sem a imagem do produto novo, que é pesada)
const snap = (d: Dados) => JSON.stringify({ ...d, pilha: undefined, cancelando: undefined, avisou: undefined, fotoStash: undefined, novo: d.novo ? { ...d.novo, foto: d.novo.foto ? "__keep__" : null } : undefined });
const temProgresso = (d: Dados) => !!(d.barcode || d.novo || d.validade || d.quantidade != null || d.lote || d.semLote);
function empilhar(d: Dados, atual: Dados) {
  if (!temProgresso(atual)) return;
  const p = [...(atual.pilha || [])];
  const sn = snap(atual);
  if (p[p.length - 1] !== sn) p.push(sn);
  d.pilha = p.slice(-10);
}
// refaz a pergunta da etapa em que a conversa está (usado ao voltar ou ao desistir de cancelar)
async function reperguntar(ctx: Ctx, chat: number, s: { id: string }, d: Dados, aviso = "") {
  const pre = aviso ? aviso + "\n\n" : "";
  const n = d.novo;
  if (n && !n.foto && n.etapa !== "nome" && n.etapa !== "imagem") n.etapa = "foto"; // sem imagem recuperada: pede a foto de novo em vez de mandar para aprovação sem imagem
  if (n?.etapa === "imagem") {
    await salvar(s.id, "aguardando_info", d);
    const comImg = !!(n.foto && n.urlImg);
    const leg = pre + `Esse produto não está no app. Achei este na internet:\n\n${n.nome}\nCódigo: ${n.barcode}${n.foto ? "" : "\n(sem imagem disponível: vou pedir uma foto sua)"}\n\nÉ esse o produto${comImg ? " e posso usar essa imagem no cadastro do app" : ""}?`;
    const bt = [[{ t: "✅ Sim, é esse", d: `im:${s.id}:1` }, { t: "❌ Não é", d: `im:${s.id}:0` }]];
    if (comImg) { const r = await tg("sendPhoto", { chat_id: chat, photo: n.urlImg, caption: leg.slice(0, 1000), ...teclado(bt) }); if (r?.ok) return r; }
    return falar(chat, leg.replace(" e posso usar essa imagem no cadastro do app", ""), bt, "novo");
  }
  if (n?.etapa === "nome") { await salvar(s.id, "aguardando_info", d); return falar(chat, pre + "Envie o nome completo do produto, com marca e produto (ex.: Bauducco Biscoito Maria 200g).", undefined, "novo"); }
  if (n?.etapa === "foto") { await salvar(s.id, "aguardando_info", d); return falar(chat, pre + MSG_PEDIR_FOTO, undefined, "novo"); }
  if (n?.etapa === "setor") { await salvar(s.id, "aguardando_info", d); return perguntarSetor(chat, s.id, pre); }
  return proximoPasso(ctx, chat, s, d, aviso);
}
async function voltar(ctx: Ctx, chat: number, s: { id: string; dados: Dados }) {
  const d = (s.dados || {}) as Dados;
  const pilha = [...(d.pilha || [])];
  const atual = snap(d);
  while (pilha.length && pilha[pilha.length - 1] === atual) pilha.pop(); // ignora respostas que não mudaram nada
  const ant = pilha.pop();
  if (!ant) return falar(chat, "Não há resposta anterior para voltar. Para desistir do lançamento, envie /cancelar.", undefined, "atencao");
  const r = JSON.parse(ant) as Dados;
  if (r.novo) r.novo.foto = (r.novo.foto as unknown) === "__keep__" ? (d.novo?.barcode === r.novo.barcode ? d.novo.foto : null) : r.novo.foto;
  if (r.novo && !r.novo.foto && d.fotoStash && d.fotoStash.barcode === r.novo.barcode) r.novo.foto = d.fotoStash.foto; // recupera a foto guardada
  if (!r.novo?.foto && d.fotoStash) r.fotoStash = d.fotoStash;
  r.pilha = pilha;
  return reperguntar(ctx, chat, s, r, "↩️ Voltei uma resposta. Pode corrigir.");
}
// "cancelar": se já há dados na conversa, confirma antes (cancelar, voltar uma resposta ou continuar)
async function pedirCancelar(chat: number, s: { id: string; dados: Dados; estado?: string }) {
  const d = { ...((s.dados || {}) as Dados) };
  if (s.estado === "confirmado") return falar(chat, "Seu lançamento já está sendo gravado, não dá mais para cancelar.", undefined, "atencao");
  if (!temProgresso(d)) return cancelar(chat, s.id);
  d.cancelando = true;
  await salvar(s.id, s.estado === "aguardando_confirmacao" ? "aguardando_confirmacao" : "aguardando_info", d);
  const atual = snap(d); const p = [...(d.pilha || [])];
  while (p.length && p[p.length - 1] === atual) p.pop();
  const nome = d.nome ?? d.novo?.nome;
  const linha2 = p.length ? [{ t: "↩️ Voltar uma resposta", d: `cc:${s.id}:v` }, { t: "▶️ Continuar", d: `cc:${s.id}:c` }] : [{ t: "▶️ Continuar", d: `cc:${s.id}:c` }];
  return falar(chat, `Quer mesmo cancelar${nome ? " o lançamento de " + nome : " o lançamento"}? O que já respondeu será perdido.\n\nToque num botão ou escreva SIM (cancelar) ou NÃO (continuar).`,
    [[{ t: "🗑️ Sim, cancelar", d: `cc:${s.id}:s` }], linha2], "atencao");
}

async function perguntarCorrecao(chat: number, sid: string, novo = false, extras: "nenhum" | "prom" | "todos" = "nenhum") {
  const linhas = [[{ t: "Produto", d: `cx:${sid}:p` }, { t: "Validade", d: `cx:${sid}:v` }], [{ t: "Quantidade", d: `cx:${sid}:q` }, { t: "Lote", d: `cx:${sid}:l` }]];
  if (novo) linhas.push([{ t: "Setor", d: `cx:${sid}:s` }]);
  if (extras !== "nenhum") { linhas.push([{ t: "Gramagem", d: `cx:${sid}:g` }, { t: "Preço", d: `cx:${sid}:r` }]); linhas.push([{ t: "Troca", d: `cx:${sid}:t` }, ...(extras === "todos" ? [{ t: "Subcategoria", d: `cx:${sid}:b` }] : [])]); }
  return falar(chat, "O que você quer corrigir?", linhas, "conferir");
}
async function cancelar(chat: number, sid: string) {
  const { data: cx } = await sb.from("telegram_sessoes").update({ estado: "cancelado", atualizado_em: new Date().toISOString() }).eq("id", sid).in("estado", ["aguardando_info", "aguardando_confirmacao"]).select("dados").maybeSingle();
  if (!cx) return falar(chat, "Esse lançamento já foi gravado ou cancelado.", undefined, "atencao");
  if (cx?.dados?.barcode || cx?.dados?.novo?.barcode) await auditar(chat, "cancelou lançamento no Telegram", cx.dados.nome ?? cx.dados.novo?.nome, cx.dados.barcode ?? cx.dados.novo?.barcode);
  return falar(chat, "Lançamento cancelado. Quando quiser, é só mandar um novo produto.", undefined, "cancelado");
}

const ERROS: Record<string, string> = {
  produto_travado_pedido: "Esse lote já tem pedido de promoção ou preço direto e está travado: não dá para somar nem alterar. Fale com o encarregado do setor.",
  produto_nao_encontrado: "Esse produto não está no cadastro desta loja.",
  produto_fora_da_marca: "Esse produto não é de uma das suas marcas.",
  validade_vencida: "A validade informada já passou. Só lanço de hoje em diante.",
  validade_invalida: "A validade está longe demais. Confira a data.",
  validade_obrigatoria: "Falta a validade.",
  quantidade_invalida: "Quantidade inválida. Confira o número.",
  usuario_fora_da_loja: "Seu acesso não está mais ativo nesta loja. Fale com o encarregado.",
  limite_excedido: "Muitas ações em pouco tempo. Aguarde um pouco e tente de novo.",
  validade_muito_proxima: "Esse produto vence em até 2 dias. Leve ao gerente o mais rápido possível, para pedir o preço direto.",
  lote_obrigatorio_telegram: "Falta o lote. Sem lote não dá para lançar pelo Telegram.",
  lote_invalido: "Lote inválido. Use letras, números, ponto, barra ou traço (até 20).",
  lote_obrigatorio: "Falta o lote. Sem lote não dá para lançar pelo Telegram.",
  lote_validade_diferente: "Esse lote já está lançado com outra validade. Confira o lote e a validade da embalagem.",
  aumento_excessivo: "Esse lote já existe e a quantidade a somar é grande demais para um lançamento só. Fale com o encarregado para ajustar o lote.",
};
const ERROS_NOVO: Record<string, string> = {
  sem_permissao: "Só funcionários podem cadastrar produto novo.",
  codigo_invalido: "O código de barras não é válido.",
  nome_invalido: "O nome do produto não é válido. Corrija o produto e tente de novo.",
  setor_invalido: "O setor não é válido. Corrija o setor.",
  foto_invalida: "A imagem não pôde ser usada. Corrija o produto para seguir sem imagem.",
  usuario_fora_da_loja: "Seu acesso não está mais ativo nesta loja. Fale com o encarregado.",
  limite_excedido: "Muitos produtos novos em pouco tempo. Aguarde um pouco.",
  pendente_ja_existe: "Esse produto novo já está aguardando aprovação de um encarregado.",
  muitas_pendencias: "Você já tem 10 produtos novos aguardando aprovação. Espere a resposta do encarregado.",
  fila_cheia: "A fila de aprovação da loja está cheia. Avise o encarregado.",
  validade_vencida: "A validade informada já passou.",
  validade_muito_proxima: "O produto vence em até 2 dias. Leve ao gerente o mais rápido possível, para pedir o preço direto.",
  validade_invalida: "A validade está longe demais. Confira a data.",
  quantidade_invalida: "Quantidade inválida. Confira o número.",
  lote_invalido: "Lote inválido. Corrija o lote.",
  lote_obrigatorio: "Falta o lote. Corrija o lote.",
  lote_ja_lancado: "Esse lote já está lançado nesse produto. Corrija o lote.",
};
// se o banco ainda não recebeu o SQL do lote (função sem os parâmetros novos), segue sem eles em vez de parar o bot
async function rpcLote(fn: string, args: Record<string, unknown>) {
  const r = await sb.rpc(fn, args);
  if (r.error && /PGRST202|Could not find the function/i.test(`${r.error.code} ${r.error.message}`)) {
    const { p_lote, p_sem_lote, ...resto } = args as any;
    console.error("sql do lote ainda nao aplicado:", fn);
    return await sb.rpc(fn, resto);
  }
  return r;
}
async function confirmar(ctx: Ctx, chat: number, sid: string, forcarDup: boolean) {
  // "pega" a sessão de forma atômica: confirmação repetida não grava duas vezes
  const { data: s } = await sb.from("telegram_sessoes").update({ estado: "confirmado", atualizado_em: new Date().toISOString() })
    .eq("id", sid).eq("chat_id", chat).eq("estado", "aguardando_confirmacao").select("*").maybeSingle();
  if (!s) return falar(chat, "Esse lançamento já foi tratado.", undefined, "atencao");
  const d: Dados = s.dados || {};
  if (!d.barcode || !d.validade || d.quantidade == null) { await salvar(s.id, "aguardando_info", d); return proximoPasso(ctx, chat, s, d); }

  // produto novo: NÃO entra direto. Vai para a fila de aprovação de um encarregado+ (que pode editar o produto, aprovar ou recusar com motivo)
  if (d.novo) {
    const { error: ec } = await rpcLote("telegram_enviar_aprovacao", { p_chat_id: chat, p_barcode: d.novo.barcode, p_nome: d.novo.nome, p_setor: d.novo.setor, p_foto: d.novo.foto, p_validade: d.validade, p_quantidade: d.quantidade, p_lote: d.lote ?? null, p_sem_lote: false });
    const mc = ec?.message || "";
    if (!ec) {
      await salvar(s.id, "registrado", d);
      // avisa por push os encarregados da loja (app fechado também); falha aqui nunca atrapalha o lançamento
      try {
        const { data: ap } = await sb.from("aprovacoes_produto").select("id").eq("loja_id", ctx.loja_id).eq("barcode", d.novo.barcode).eq("status", "pendente").order("criado_em", { ascending: false }).limit(1).maybeSingle();
        if (ap?.id) { const { error: ep } = await sb.functions.invoke("enviar-push", { body: { aprovacaoId: ap.id } }); if (ep) console.error("push aprovacao", limpa(ep)); }
      } catch (e) { console.error("push aprovacao", limpa(e)); }
      return falar(chat, `⏳ Enviado para aprovação!\n${d.nome}\nValidade ${fmtData(d.validade)} · ${d.lote ? `Lote ${d.lote} · ` : "Sem lote · "}${num(d.quantidade)} un\n\nUm encarregado vai conferir o produto novo. Eu aviso aqui quando ele aprovar ou se recusar.`, undefined, "aprovacao");
    }
    if (mc.includes("produto_ja_existe")) { descartarNovo(d); await salvar(s.id, "confirmado", d); } // alguém cadastrou nesse meio tempo: lança direto
    else {
      await salvar(s.id, "aguardando_confirmacao", d);
      const k = Object.keys(ERROS_NOVO).find((x) => mc.includes(x));
      if (k === "validade_muito_proxima") { const vd = d.validade!; delete d.validade; await salvar(s.id, "aguardando_info", d); await auditar(chat, "lançamento barrado no Telegram", `${d.novo.nome}: ${ERROS_NOVO[k]}`, d.novo.barcode); return falar(chat, MSG_PERTO(d.novo.nome, vd, diasAte(vd)), undefined, "atencao"); }
      await auditar(chat, "lançamento barrado no Telegram", `${d.novo.nome}: ${k ? ERROS_NOVO[k] : "erro ao enviar produto novo"}`, d.novo.barcode);
      return falar(chat, "⚠️ " + (k ? ERROS_NOVO[k] : "Não consegui enviar o produto novo agora. Nada foi lançado, tente de novo em instantes."), [[{ t: "✅ Tentar de novo", d: `ok:${s.id}` }, { t: "✏️ Corrigir", d: `fx:${s.id}` }, { t: "❌ Cancelar", d: `no:${s.id}` }]], "atencao");
    }
  }

  const { data: idLancado, error } = await rpcLote("lancar_validade", {
    p_loja: ctx.loja_id, p_usuario: ctx.usuario_id ?? null, p_barcode: d.barcode, p_validade: d.validade, p_quantidade: d.quantidade,
    p_origem: "telegram", p_foto: null, p_obs: "Via Telegram", p_tamanho: extrasValidos(d) ? (d.tam ?? null) : null, p_unidade: extrasValidos(d) ? (d.uni ?? null) : null,
    p_op: s.id, p_confirmar_duplicado: forcarDup, p_convite: ctx.convite_id ?? null, p_lote: d.lote ?? null, p_sem_lote: false,
  });
  if (error) {
    const m = error.message || "";
    if (m.includes("duplicado")) {
      d.dupAsk = true; await salvar(s.id, "aguardando_confirmacao", d);
      return falar(chat, m.includes("lote_duplicado") ? `O lote ${d.lote} já está lançado nesse produto. Quer lançar mesmo assim (por exemplo, mais unidades do mesmo lote)?` : "Já existe esse produto com essa validade e sem lote na loja. Quer lançar mesmo assim?", [[{ t: "Lançar mesmo assim", d: `dp:${s.id}` }, { t: "❌ Cancelar", d: `no:${s.id}` }]], "atencao");
    }
    const chave = Object.keys(ERROS).find((k) => m.includes(k));
    if (chave === "produto_travado_pedido") { // lote travado: não adianta pedir outra data
      await auditar(chat, "lançamento barrado no Telegram", `${d.nome ?? ""}: ${ERROS[chave]}`, d.barcode);
      await salvar(s.id, "cancelado", d, m.slice(0, 300));
      return falar(chat, "⚠️ " + ERROS[chave] + "\n\nNada foi lançado.", undefined, "atencao");
    }
    if (chave === "validade_muito_proxima") {
      const vd = d.validade!; delete d.validade; await salvar(s.id, "aguardando_info", d);
      await auditar(chat, "lançamento barrado no Telegram", `${d.nome ?? ""}: ${ERROS[chave]}`, d.barcode);
      return falar(chat, MSG_PERTO(d.nome, vd, diasAte(vd)), undefined, "atencao");
    }
    if (chave) await auditar(chat, "lançamento barrado no Telegram", `${d.nome ?? ""}: ${ERROS[chave]}`, d.barcode);
    if (chave && chave !== "usuario_fora_da_loja" && chave !== "limite_excedido") { if (chave.startsWith("lote_")) { delete d.lote; delete d.semLote; } else if (chave !== "aumento_excessivo") delete d.validade; if (chave === "quantidade_invalida" || chave === "aumento_excessivo") delete d.quantidade; await salvar(s.id, "aguardando_info", d); return falar(chat, "⚠️ " + ERROS[chave], undefined, "atencao"); }
    if (chave === "usuario_fora_da_loja") { await salvar(s.id, "cancelado", d, m.slice(0, 300)); return falar(chat, "⚠️ " + ERROS[chave], undefined, "atencao"); }
    await salvar(s.id, "aguardando_confirmacao", d, m.slice(0, 300)); // volta para a confirmação: a pessoa pode tentar de novo sem recomeçar
    return falar(chat, chave ? "⚠️ " + ERROS[chave] : "Não consegui gravar agora. Nada foi lançado — tente de novo em instantes.", [[{ t: "✅ Tentar de novo", d: `ok:${s.id}` }, { t: "❌ Cancelar", d: `no:${s.id}` }]], "atencao");
  }
  // preço, troca e subcategoria: segunda gravação (só do lote recém-criado); se falhar, o lançamento fica e avisa
  let avisoExtra = "";
  const trocaGrava = d.troca === "com_troca" || d.troca === "sem_troca" ? d.troca : null;
  const trocaMudou = !!trocaGrava && trocaGrava !== d.cad?.troca;
  const precoMudou = d.preco != null && d.preco !== d.cad?.preco;
  const subMudou = ctx.tipo === "funcionario" && !!d.sub && subValido(d.sub) && d.sub !== d.cad?.sub;
  if (extrasValidos(d) && idLancado && (precoMudou || trocaMudou || subMudou)) {
    let { error: ex } = await sb.rpc("telegram_complementar_lote", { p_chat_id: chat, p_id: String(idLancado), p_preco: precoMudou ? d.preco! : null, p_troca: trocaMudou ? trocaGrava : null, p_subsetor: subMudou ? d.sub! : null });
    if (ex && String(ex.message || "").includes("preco_fora_da_faixa")) {
      // preço do promotor muito diferente do cadastro: guarda só troca/subcategoria e avisa
      d.preco = null;
      avisoExtra = "\n\n⚠️ O preço informado é muito diferente do cadastrado, então não foi salvo. O encarregado confere pelo app.";
      ex = (trocaMudou || subMudou) ? (await sb.rpc("telegram_complementar_lote", { p_chat_id: chat, p_id: String(idLancado), p_preco: null, p_troca: trocaMudou ? trocaGrava : null, p_subsetor: subMudou ? d.sub! : null })).error : null;
    }
    if (ex) { console.error("complemento", limpa(ex)); avisoExtra = "\n\n⚠️ A validade foi lançada, mas não consegui salvar preço, troca ou subcategoria. Peça ao encarregado para completar pelo app."; }
  }
  await salvar(s.id, "registrado", d);
  if (forcarDup) await auditar(chat, "confirmou lançamento duplicado no Telegram", `${d.nome} · validade ${fmtData(d.validade)}`, d.barcode);
  return falar(chat, `✅ Validade lançada!\n${d.nome}\nValidade ${fmtData(d.validade)} · ${d.porPeso ? "" : (d.lote ? `Lote ${d.lote} · ` : "Sem lote · ")}${num(d.quantidade)} ${d.porPeso ? "kg" : "un"}${extrasValidos(d) ? `${d.tam ? `\nEmbalagem ${d.tam} ${d.uni ?? "G"}` : ""}${d.preco != null ? ` · ${brl(d.preco)}` : ""}${d.trocaOk && d.troca && d.troca !== "nao_sei" ? ` · ${TXT_TROCA[d.troca]}` : ""}${d.sub ? ` · ${d.sub}` : ""}` : ""}${avisoExtra}`, undefined, "lancada");
}

// ---------- Vínculo ----------
const ERRO_VINC: Record<string, string> = {
  codigo_invalido: "Código inválido ou vencido. Gere um novo no app (Mais → Conta → Telegram) ou confira o código do promotor.",
  usuario_invalido: "Esse cadastro não está ativo. Fale com o encarregado.",
  chat_ja_vinculado: "Este Telegram já está vinculado.",
  codigo_ja_vinculado: "Esse código de promotor já está vinculado a outro Telegram. Peça ao responsável da loja para remover o vínculo antigo.",
  convite_revogado: "Esse acesso de promotor foi cancelado pela loja.",
  convite_pausado: "Esse acesso de promotor está pausado pela loja.",
  convite_expirado: "Esse acesso de promotor expirou. Peça um novo à loja.",
};
async function vincular(chat: number, texto: string) {
  const t = texto.trim().replace(/^\/start(@\w+)?\s*/i, "").trim();
  if (!t) return falar(chat, "👋 Oi! Para começar, me envie o seu código de acesso:\n\n🧑‍💼 Funcionário: gere no app em Mais → Conta → Telegram (8 letras e números)\n🏷️ Promotor: envie o código da sua marca (ex.: BAU-7K3QP8M2XC)\n\nO código do app vale por 10 minutos.", undefined, "codigo");
  const func = /^[A-Za-z0-9]{4}[\s-]?[A-Za-z0-9]{4}$/.test(t) && /\d/.test(t) && !/^[A-Za-z]{3}-/.test(t); // o código do app sempre tem ao menos 1 número: palavra comum de 8 letras ("obrigado") não conta como tentativa
  const prom = /^[A-Za-z]{3}-[A-Za-z0-9]{5,10}$/.test(t);
  if (!func && !prom) return falar(chat, "Não reconheci esse código. Funcionário: 8 letras e números do app. Promotor: código tipo BAU-7K3QP8M2XC.", undefined, "atencao");
  // trava por erros: depois de 5 códigos errados o chat espera (15 min, 1 h, 24 h). Quem acerta de primeira nunca é afetado
  const { data: seg } = await sb.rpc("telegram_vinc_bloqueio", { p_chat_id: chat });
  if (typeof seg === "number" && seg > 0) return falar(chat, `Muitos códigos errados. Tente de novo em ${seg >= 3600 ? Math.ceil(seg / 3600) + " h" : Math.ceil(seg / 60) + " min"}.`, undefined, "atencao");
  const a = await sb.rpc("rl_servico", { p_chave: String(chat), p_bucket: "tg_vinc", p_max: 8 });
  if (a.data === false) return falar(chat, "Muitas tentativas. Aguarde 1 minuto.", undefined, "atencao");
  const { data, error } = func
    ? await sb.rpc("telegram_vincular_funcionario", { p_chat_id: chat, p_codigo: t })
    : await sb.rpc("telegram_vincular_promotor", { p_chat_id: chat, p_codigo: t.toUpperCase() });
  if (error) {
    if ((error.message || "").includes("codigo_invalido")) {
      const { data: bl } = await sb.rpc("telegram_vinc_falha", { p_chat_id: chat });
      if (typeof bl === "number" && bl > 0) return falar(chat, `⚠️ Código inválido. Foram 5 erros seguidos: este chat ficou bloqueado por ${bl >= 3600 ? Math.round(bl / 3600) + " h" : Math.round(bl / 60) + " min"}, mesmo que você mande o código certo depois.`, undefined, "atencao");
      return falar(chat, "⚠️ " + ERRO_VINC.codigo_invalido + "\n\n(5 erros seguidos bloqueiam este chat por 15 minutos.)", undefined, "atencao");
    }
    const k = Object.keys(ERRO_VINC).find((x) => (error.message || "").includes(x));
    return falar(chat, k ? "⚠️ " + ERRO_VINC[k] : "Não consegui vincular agora. Tente de novo.", undefined, "atencao");
  }
  await sb.rpc("telegram_vinc_ok", { p_chat_id: chat });
  return falar(chat, `✅ Pronto, ${String(data?.nome || "").split(" ")[0]}! Seu Telegram está vinculado.\n\nAgora é só me mandar o código de barras ou o nome do produto.`, undefined, "vinculado");
}

const AJUDA = "Como usar:\n\n🔢 Mande o código de barras ou o nome do produto\n🏷️ Eu pergunto o lote (impresso na embalagem, perto da validade). Sem lote não lanço\n⚠️ Produto que vence em até 2 dias não é lançado: leve ao gerente para pedir preço direto\n🔢 O código de barras precisa ser válido (EAN-8, UPC-A ou EAN-13)\n💬 Ou escreva tudo de uma vez: “7891234567890 validade 20/11/2026 quantidade 8”\n🆕 Produto que não está no app? Mande o código de barras: eu busco a imagem na internet (se não achar, peço uma foto legível sua), você confirma e o produto vai para aprovação de um encarregado\n✅ Só lanço depois do seu “sim”\n\n/voltar – desfaz a última resposta para corrigir\n/cancelar – cancela o lançamento atual (peço confirmação)\n⏱️ Cada resposta tem 5 minutos; passou disso, cancelo o lançamento\n/sair – desvincula este Telegram";

// ---------- Entrada ----------
async function processar(up: Record<string, any>) {
  const cb = up.callback_query;
  const msg = up.message;
  const chatObj = msg?.chat ?? cb?.message?.chat;
  if (!chatObj || chatObj.type !== "private") return;
  const chat: number = chatObj.id;
  const texto: string = String(msg?.text ?? msg?.caption ?? "").slice(0, 500);

  const { data: lim } = await sb.rpc("rl_servico", { p_chave: String(chat), p_bucket: "tg", p_max: 30 });
  if (lim === false) return; // excesso: ignora sem gravar nada (não deixa encher a tabela)
  const { error: eDup } = await sb.from("telegram_mensagens").insert({ update_id: up.update_id, chat_id: chat, tipo: cb ? "botao" : msg?.photo ? "foto" : msg?.text ? "texto" : "outro", texto: cb ? String(cb.data).slice(0, 100) : texto });
  if (eDup) { if (eDup.code === "23505") return; console.error(eDup); return; }
  const marcar = (status: string, erro?: string) => sb.from("telegram_mensagens").update({ status_proc: status, erro: erro?.slice(0, 500) ?? null }).eq("update_id", up.update_id);


  const { data: ctxRaw } = await sb.rpc("telegram_contexto", { p_chat_id: chat });
  if (!ctxRaw) { if (cb) await tg("answerCallbackQuery", { callback_query_id: cb.id }); if (msg) await vincular(chat, texto); await marcar("processada"); return; }
  if (ctxRaw.motivo) {
    await falar(chat, ctxRaw.motivo === "convite" ? "Seu acesso de promotor não está mais ativo. Peça um novo à loja." : "Seu cadastro não está ativo. Fale com o encarregado.", undefined, "atencao");
    await marcar("ignorada", ctxRaw.motivo); return;
  }
  const ctx = ctxRaw as Ctx;

  if (cb) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    const [acao, sid, extra] = String(cb.data || "").split(":");
    const tirarBotoes = () => tg("editMessageReplyMarkup", { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
    const exp = await sessaoExpirada(chat);
    if (exp) { await tirarBotoes(); await avisarExpirou(chat, exp); await marcar("processada"); return; }
    const s = await sessaoAtiva(chat);
    if (!s || s.id !== sid) { await tirarBotoes(); await falar(chat, "Esse lançamento já foi tratado ou expirou.", undefined, "atencao"); await marcar("processada"); return; }
    await tirarBotoes();
    const d: Dados = s.dados || {};
    await sb.from("telegram_sessoes").update({ expira_em: new Date(Date.now() + TEMPO_RESPOSTA_MS).toISOString() }).eq("id", s.id);
    if (acao === "cc" && !d.cancelando) { await falar(chat, "Esse pedido de cancelamento já foi tratado.", undefined, "atencao"); await marcar("processada"); return; }
    if (d.cancelando && acao !== "cc") { await pedirCancelar(chat, { ...s, dados: { ...d, cancelando: false } }); await marcar("processada"); return; }
    if (["cx", "pr", "im", "st", "gm", "pc", "tc", "sc"].includes(acao)) empilhar(d, s.dados || {}); // dá para voltar depois desta escolha
    if (acao === "ok") await confirmar(ctx, chat, s.id, false);
    else if (acao === "dp") await confirmar(ctx, chat, s.id, true);
    else if (acao === "no") await pedirCancelar(chat, s);
    else if (acao === "cc") {
      if (extra === "s") await cancelar(chat, s.id);
      else if (extra === "v") await voltar(ctx, chat, s);
      else { delete d.cancelando; await reperguntar(ctx, chat, s, d, "Ok, vamos continuar."); }
    }
    else if (acao === "fx") await perguntarCorrecao(chat, s.id, !!d.novo, extrasCorrecao(ctx, d));
    else if (acao === "cx") {
      if (extra === "p") { delete d.barcode; delete d.nome; delete d.porPeso; limparExtras(d); descartarNovo(d); delete d.criouProduto; delete d.lote; delete d.semLote; await salvar(s.id, "aguardando_info", d); await falar(chat, "Certo. Qual é o produto? Código de barras ou nome.", undefined, "produto"); }
      else if (extra === "v") { delete d.validade; await salvar(s.id, "aguardando_info", d); await falar(chat, "Certo. Qual a data de validade? (ex.: 15/12/2026)", undefined, "validade"); }
      else if (extra === "l") { delete d.lote; delete d.semLote; await salvar(s.id, "aguardando_info", d); await falar(chat, "Certo. Qual o lote? (impresso na embalagem, perto da validade)", undefined, "lote"); }
      else if (extra === "q") { delete d.quantidade; await salvar(s.id, "aguardando_info", d); await falar(chat, d.porPeso ? "Certo. Quantos kg?" : "Certo. Quantas unidades?", undefined, "quantidade"); }
      else if (extra === "g" && !d.novo) { delete d.tam; delete d.uni; delete d.tamPulado; await proximoPasso(ctx, chat, s, d); }
      else if (extra === "r" && !d.novo) { delete d.preco; delete d.precoOk; await proximoPasso(ctx, chat, s, d); }
      else if (extra === "t" && !d.novo) { delete d.troca; delete d.trocaOk; await proximoPasso(ctx, chat, s, d); }
      else if (extra === "b" && !d.novo && ctx.tipo === "funcionario") {
        if (!(await opcoesSub(ctx, d)).length) { await falar(chat, "Esse setor não tem subcategorias para escolher.", undefined, "atencao"); await perguntarCorrecao(chat, s.id, false, extrasCorrecao(ctx, d)); }
        else { delete d.sub; delete d.subOk; await proximoPasso(ctx, chat, s, d); }
      }
      else if (extra === "s" && d.novo) { d.novo.setor = null; d.novo.etapa = "setor"; await salvar(s.id, "aguardando_info", d); await perguntarSetor(chat, s.id); }
      else await reperguntar(ctx, chat, s, d, "Essa opção não está disponível agora.");
    } else if (acao === "gm" && d.pergunta === "gram" && (extra === "p" || d.cad?.tam)) {
      if (extra === "p") { d.tamPulado = true; delete d.tam; delete d.uni; } else { d.tam = d.cad!.tam!; d.uni = d.cad!.uni || "G"; delete d.tamPulado; }
      delete d.pergunta; await proximoPasso(ctx, chat, s, d);
    } else if (acao === "pc" && d.pergunta === "preco") {
      d.preco = extra === "u" && d.cad && d.cad.preco > 0 ? d.cad.preco : null; d.precoOk = true; delete d.pergunta; await proximoPasso(ctx, chat, s, d);
    } else if (acao === "tc" && d.pergunta === "troca") {
      d.troca = extra === "c" ? "com_troca" : extra === "s" ? "sem_troca" : "nao_sei"; d.trocaOk = true; delete d.pergunta; await proximoPasso(ctx, chat, s, d);
    } else if (acao === "sc" && d.pergunta === "sub" && ctx.tipo === "funcionario") {
      const ops = d.subOps || [];
      if (extra === "x") { delete d.sub; d.subOk = true; delete d.subOps; delete d.pergunta; await proximoPasso(ctx, chat, s, d); }
      else { const o = /^\d{1,2}$/.test(extra || "") ? ops[Number(extra)] : undefined; if (o) { d.sub = o; d.subOk = true; delete d.subOps; delete d.pergunta; await proximoPasso(ctx, chat, s, d); } else await reperguntar(ctx, chat, s, d, "Essa opção não está mais disponível."); }
    } else if (["gm", "pc", "tc", "sc"].includes(acao)) {
      await reperguntar(ctx, chat, s, d, "Essa pergunta já foi respondida.");
    } else if (acao === "sl") {
      await falar(chat, MSG_SEM_LOTE, undefined, "atencao");
    } else if (acao === "pr") {
      const o = d.opcoes?.[Number(extra)];
      if (o) { const cat = await carregarCatalogo(ctx); const e = cat[o.barcode]; if (e) { d.barcode = e.barcode; d.nome = e.nome; d.porPeso = e.por_peso; delete d.opcoes; descartarNovo(d); delete d.lote; delete d.semLote; await proximoPasso(ctx, chat, s, d); } }
    } else if (acao === "im" && d.novo?.etapa === "imagem") {
      if (extra === "1") await novoConfirmado(ctx, chat, s, d);
      else { descartarNovo(d); await salvar(s.id, "aguardando_info", d); await falar(chat, "Ok, descartei esse produto. Confira o código ou envie outro produto.", undefined, "produto"); }
    } else if (acao === "st" && d.novo?.etapa === "setor") {
      const setor = SETORES[Number(extra)];
      if (setor) { d.novo.setor = setor; d.novo.etapa = null; await proximoPasso(ctx, chat, s, d); }
    }
    await marcar("processada"); return;
  }

  if (!msg) return;
  if (/^\/start/i.test(texto)) { await falar(chat, `Olá, ${String(ctx.nome).split(" ")[0]}! 👋\nPode mandar o código de barras ou o nome do produto.`, undefined, "produto"); await marcar("processada"); return; }
  if (/^\/ajuda/i.test(texto)) { await falar(chat, AJUDA, undefined, "ajuda"); await marcar("processada"); return; }
  { // 5 minutos sem resposta: avisa que o lançamento anterior foi cancelado (e segue com a mensagem como conversa nova)
    const exp = await sessaoExpirada(chat);
    if (exp) {
      await avisarExpirou(chat, exp);
      if (!/^\/sair/i.test(texto) && !(msg.text && eanOk(texto.match(/\b\d{8,14}\b/)?.[0] ?? ""))) { await marcar("processada"); return; } // mensagem tardia (sim, data, foto...) não abre conversa nova
    }
  }
  if (/^\/voltar/i.test(texto)) { const s = await sessaoAtiva(chat); if (s) await voltar(ctx, chat, s); else await falar(chat, "Não há lançamento em andamento.", undefined, "ajuda"); await marcar("processada"); return; }
  if (/^\/cancelar/i.test(texto)) { const s = await sessaoAtiva(chat); if (s) await pedirCancelar(chat, s); else await falar(chat, "Não há lançamento em andamento.", undefined, "ajuda"); await marcar("processada"); return; }
  if (/^\/sair/i.test(texto)) { await auditar(chat, "desvinculou o Telegram (/sair)", ctx.nome); await sb.from("telegram_sessoes").update({ estado: "cancelado", atualizado_em: new Date().toISOString() }).eq("chat_id", chat).in("estado", ["aguardando_info", "aguardando_confirmacao", "confirmado"]); await sb.from("telegram_vinculos").delete().eq("chat_id", chat); await falar(chat, "Telegram desvinculado. Para usar de novo, vincule outra vez com um código.", undefined, "cancelado"); await marcar("processada"); return; }
  if (texto.startsWith("/")) { await falar(chat, AJUDA, undefined, "ajuda"); await marcar("processada"); return; }

  // foto: so e aceita na etapa "foto" do produto novo (sem imagem na internet). Em qualquer outro momento nao recebe fotos nem arquivos.
  if (msg.photo?.length || msg.document || msg.video || msg.sticker) {
    const s = (msg.photo?.length || msg.document) ? await sessaoAtiva(chat) : null;
    const dd: Dados = s?.dados || {};
    if (s && !msg.photo?.length && msg.document && s.estado === "aguardando_info" && dd.novo?.etapa === "foto") { await falar(chat, "Envie como FOTO (não como arquivo): toque no clipe e escolha a câmera ou a galeria.", undefined, "atencao"); await marcar("ignorada", "foto_como_arquivo"); return; }
    if (s && dd.cancelando && msg.photo?.length) { await pedirCancelar(chat, { ...s, dados: { ...dd, cancelando: false } }); await marcar("processada"); return; }
    if (s && s.estado === "aguardando_info" && dd.novo?.etapa === "foto" && ctx.tipo === "funcionario") {
      const f = await baixarFotoTelegram(msg.photo);
      if (!f.ok) { await falar(chat, "⚠️ " + f.motivo, undefined, "atencao"); await marcar("ignorada", "foto_invalida"); return; }
      empilhar(dd, dd); // dá para voltar depois da foto
      delete dd.fotoStash;
      dd.novo.foto = f.dataUrl; dd.novo.fotoUsuario = true;
      await novoConfirmado(ctx, chat, s, dd);
      await marcar("processada"); return;
    }
    await falar(chat, "Eu só recebo foto quando você cadastra um produto novo que não tem imagem na internet. Envie o código de barras ou o nome do produto.", undefined, "atencao");
    await marcar("ignorada", "foto_nao_aceita"); return;
  }
  if (!msg.text) { await falar(chat, "Envie o código de barras ou o nome do produto em texto.", undefined, "atencao"); await marcar("ignorada", "tipo"); return; }
  await tratarTexto(ctx, chat, texto);
  await marcar("processada");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const seg = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!TOKEN || !SEGREDO || !iguais(seg, SEGREDO)) return new Response("forbidden", { status: 403 });
  let up: Record<string, any>;
  try { up = await req.json(); } catch { return new Response("ok"); }
  try { await processar(up); } catch (e) { console.error("telegram-bot", limpa(e)); }
  return new Response("ok"); // sempre 200: o Telegram não reenvia, e a duplicidade é barrada por update_id
});

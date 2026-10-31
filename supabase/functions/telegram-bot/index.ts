// @ts-nocheck
// Edge Function: telegram-bot — lançamento de validade pelo Telegram (funcionário e promotor).
// Webhook do Telegram -> valida segredo -> identifica quem é (vínculo) -> conversa em etapas -> confirma -> lancar_validade (mesma regra do app).
// Mascote: Bipi (banners em public/bot/*.jpg, gerados por scripts/gerar-banners-bot.py). TODA mensagem sai com banner.
// Foto enviada pelo usuário NÃO é aceita. Produto que não existe no app: o bot busca nome e imagem na internet (Open Food Facts),
// o funcionário confirma e o produto é cadastrado no app (telegram_criar_produto) junto com o lançamento.
// Segredos (Supabase → Edge Functions → Secrets): TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.
// verify_jwt = false (o Telegram não manda JWT); a proteção é o cabeçalho secreto + vínculo + limites.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { interpretarVoz, buscarNoCatalogo, validarVoz, semAcento, adivinharSetor, formatarNomeNovo } from "./voz.js";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SEGREDO = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const hoje = () => new Date(Date.now() - 3 * 3600 * 1000); // horário de Brasília
const iguais = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const fmtData = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };
const num = (n: number) => String(n).replace(".", ",");
const SETORES = ["Hortifruti", "Açougue", "Padaria", "Frios e Laticínios", "Mercearia", "Bebidas", "Congelados", "Limpeza", "Higiene e Perfumaria", "Bazar"];

// ---------- Telegram (toda mensagem leva banner do Bipi) ----------
type Banner = "codigo" | "vinculado" | "produto" | "validade" | "quantidade" | "conferir" | "sucesso" | "atencao" | "cancelado" | "novo" | "ajuda";
const SITE = "https://condor-validade.vercel.app";
async function tg(method: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    return await r.json();
  } catch (e) { console.error("telegram", method, String(e)); return null; }
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
  catch (e) { console.error("auditar", String(e)); }
};

function eanOk(c: string) {
  if (![8, 12, 13, 14].includes(c.length)) return false;
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
  } catch (e) { console.error("imagem", String(e)); return null; }
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
  } catch (e) { console.error("openfoodfacts", String(e)); return null; }
}

// ---------- Catálogo e sessão ----------
type Novo = { barcode: string; nome: string; foto: string | null; setor: string | null; etapa: "imagem" | "nome" | "setor" | null };
type Dados = { barcode?: string; nome?: string; porPeso?: boolean; validade?: string; quantidade?: number; opcoes?: { barcode: string; nome: string }[]; dupAsk?: boolean; novo?: Novo; criouProduto?: boolean };
type Ctx = { vinculo_id: string; tipo: "funcionario" | "promotor"; usuario_id?: string; convite_id?: string; loja_id: number; nome: string; marca?: string };

async function carregarCatalogo(ctx: Ctx) {
  const cat: Record<string, { nome: string; por_peso: boolean; barcode: string }> = {};
  for (let p = 0; p < 40; p++) {
    const { data, error } = await sb.from("catalogo").select("barcode, nome, por_peso").eq("loja_id", ctx.loja_id).range(p * 1000, p * 1000 + 999);
    if (error || !data) break;
    for (const r of data) {
      if (!r.barcode || !r.nome) continue;
      if (ctx.tipo === "promotor" && !String(r.nome).toUpperCase().includes(String(ctx.marca || "").trim().toUpperCase())) continue;
      cat[r.barcode] = { nome: r.nome, por_peso: !!r.por_peso, barcode: r.barcode };
    }
    if (data.length < 1000) break;
  }
  return cat;
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
  const { data } = await sb.from("telegram_sessoes").insert({ chat_id: chat, vinculo_id: ctx.vinculo_id, estado: "aguardando_info", dados: {} }).select("*").single();
  return data ?? (await sessaoAtiva(chat));
}
const salvar = (id: string, estado: string, dados: Dados, erro?: string) =>
  sb.from("telegram_sessoes").update({ estado, dados, erro: erro ?? null, atualizado_em: new Date().toISOString(), expira_em: new Date(Date.now() + 30 * 60000).toISOString() }).eq("id", id);

// ---------- Conversa ----------
function perguntarSetor(chat: number, sid: string) {
  const linhas: { t: string; d: string }[][] = [];
  SETORES.forEach((s, i) => { if (i % 2 === 0) linhas.push([]); linhas[linhas.length - 1].push({ t: s, d: `st:${sid}:${i}` }); });
  return falar(chat, "Em qual setor esse produto novo fica?", linhas, "novo");
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
  const pre = aviso ? aviso + "\n\n" : "";
  if (!d.barcode) { await salvar(s.id, "aguardando_info", d); return falar(chat, pre + "Qual é o produto? Envie o código de barras ou o nome.", undefined, "produto"); }
  if (!d.validade) { await salvar(s.id, "aguardando_info", d); return falar(chat, pre + `Produto: ${d.nome}\nQual a data de validade? (ex.: 15/12/2026)`, undefined, "validade"); }
  if (d.quantidade == null) { await salvar(s.id, "aguardando_info", d); return falar(chat, pre + `Produto: ${d.nome}\nValidade: ${fmtData(d.validade)}\n${d.porPeso ? "Quantos kg? (ex.: 2,5)" : "Quantas unidades?"}`, undefined, "quantidade"); }
  await salvar(s.id, "aguardando_confirmacao", d);
  const { data: loja } = await sb.from("lojas").select("numero_loja").eq("id", ctx.loja_id).maybeSingle();
  const novoTxt = d.novo ? `\n🆕 Produto novo: será cadastrado no app\nSetor: ${d.novo.setor}\nImagem: ${d.novo.foto ? "da internet (confirmada por você)" : "sem imagem"}` : "";
  const resumo = `${pre}Confira os dados:\n\nProduto: ${d.nome}\nCódigo: ${d.barcode}\nValidade: ${fmtData(d.validade)}\nQuantidade: ${num(d.quantidade)} ${d.porPeso ? "kg" : "unidades"}\nLoja: ${loja?.numero_loja ?? "—"}${novoTxt}\n\nConfirma o lançamento?`;
  return falar(chat, resumo, [[{ t: "✅ Confirmar", d: `ok:${s.id}` }, { t: "❌ Cancelar", d: `no:${s.id}` }], [{ t: "✏️ Corrigir", d: `fx:${s.id}` }]], "conferir");
}

async function escolherProduto(ctx: Ctx, chat: number, s: { id: string }, d: Dados, nomeFalado: string) {
  const cat = await carregarCatalogo(ctx);
  const r = buscarNoCatalogo(nomeFalado, cat);
  if (r.tipo === "encontrado") {
    const e = r.candidatos[0].entrada; d.barcode = e.barcode; d.nome = e.nome; d.porPeso = e.por_peso; delete d.opcoes; delete d.novo;
    return proximoPasso(ctx, chat, s, d);
  }
  if (r.tipo === "varios" || r.tipo === "marca") {
    d.opcoes = r.candidatos.slice(0, 8).map((c: { entrada: { barcode: string; nome: string } }) => ({ barcode: c.entrada.barcode, nome: c.entrada.nome }));
    await salvar(s.id, "aguardando_info", d);
    return falar(chat, "Qual destes?", d.opcoes!.map((o, i) => [{ t: o.nome, d: `pr:${s.id}:${i}` }]), "produto");
  }
  await salvar(s.id, "aguardando_info", d);
  return falar(chat, ctx.tipo === "promotor"
    ? `Não achei esse produto da marca ${ctx.marca} no cadastro da loja. Envie o código de barras ou o nome completo.`
    : "Não achei esse produto no cadastro da loja. Se ele for novo, envie o código de barras dele: eu busco a imagem na internet e você confirma.", undefined, "novo");
}

async function porBarcode(ctx: Ctx, chat: number, s: { id: string }, d: Dados, bc: string) {
  delete d.novo;
  const cat = await carregarCatalogo(ctx);
  const e = cat[bc];
  if (e) { d.barcode = e.barcode; d.nome = e.nome; d.porPeso = e.por_peso; delete d.opcoes; return proximoPasso(ctx, chat, s, d); }
  delete d.barcode; delete d.nome;
  if (ctx.tipo === "promotor") { await salvar(s.id, "aguardando_info", d); return falar(chat, "Esse código não é de um produto da sua marca nesta loja. Confira o número.", undefined, "atencao"); }
  if (!eanOk(bc)) { await salvar(s.id, "aguardando_info", d); return falar(chat, "Esse código de barras não é válido. Confira o número e envie de novo.", undefined, "atencao"); }
  // produto novo: busca nome e imagem na internet e pede a confirmação do funcionário
  const { data: lim } = await sb.rpc("rl_servico", { p_chave: String(chat), p_bucket: "tg_web", p_max: 6 });
  if (lim === false) { await salvar(s.id, "aguardando_info", d); return falar(chat, "Muitas buscas em pouco tempo. Aguarde 1 minuto.", undefined, "atencao"); }
  await auditar(chat, "consultou produto na internet (Open Food Facts)", bc, bc);
  const achou = await buscarNaInternet(bc);
  if (!achou) {
    d.novo = { barcode: bc, nome: "", foto: null, setor: null, etapa: "nome" };
    await salvar(s.id, "aguardando_info", d);
    return falar(chat, "Esse código ainda não está no app e não achei o produto na internet.\n\nSe for um produto novo, envie o nome completo (marca + produto) e eu cadastro sem imagem. Ou confira o número do código.", undefined, "novo");
  }
  const nome = formatarNomeNovo(achou.nome, cat).nomeNovo;
  d.novo = { barcode: bc, nome, foto: achou.dataUrl, setor: adivinharSetor(nome), etapa: "imagem" };
  await salvar(s.id, "aguardando_info", d);
  const legenda = `Esse produto não está no app. Achei na internet:\n\n${nome}\nCódigo: ${bc}${achou.dataUrl ? "" : "\n(sem imagem disponível)"}\n\nÉ esse o produto${achou.dataUrl ? " e posso usar essa imagem no cadastro do app" : ""}?`;
  const botoes = [[{ t: "✅ Sim, é esse", d: `im:${s.id}:1` }, { t: "❌ Não é", d: `im:${s.id}:0` }]];
  if (achou.dataUrl && achou.urlImg) {
    const r = await tg("sendPhoto", { chat_id: chat, photo: achou.urlImg, caption: legenda.slice(0, 1000), ...teclado(botoes) });
    if (r?.ok) return r;
    d.novo.foto = null; await salvar(s.id, "aguardando_info", d); // o Telegram não conseguiu mostrar a imagem: segue sem ela, mas só com a sua confirmação
    return falar(chat, legenda.replace(" e posso usar essa imagem no cadastro do app", "") + "\n(não consegui mostrar a imagem)", botoes, "novo");
  }
  return falar(chat, legenda, botoes, "novo");
}

async function novoConfirmado(ctx: Ctx, chat: number, s: { id: string }, d: Dados) {
  const n = d.novo!;
  d.barcode = n.barcode; d.nome = n.nome; d.porPeso = false; n.etapa = null;
  if (!n.setor) { n.etapa = "setor"; await salvar(s.id, "aguardando_info", d); return perguntarSetor(chat, s.id); }
  return proximoPasso(ctx, chat, s, d);
}

async function tratarTexto(ctx: Ctx, chat: number, texto: string) {
  const s = await garantirSessao(ctx, chat);
  if (!s) return falar(chat, "Não consegui iniciar agora. Tente de novo em instantes.", undefined, "atencao");
  const d: Dados = { ...(s.dados || {}) };
  const low = semAcento(texto).trim();
  const mb = texto.match(/\b\d{8,14}\b/);

  if (s.estado === "aguardando_confirmacao") {
    if (/^(sim|s|confirmar|confirmo|confirma|pode lancar|pode lancar sim|isso|ok)$/.test(low)) return confirmar(ctx, chat, s.id, false);
    if (/^(nao|n|cancelar|cancela)$/.test(low)) return cancelar(chat, s.id);
    if (/^(corrigir|corrige)$/.test(low)) return perguntarCorrecao(chat, s.id, !!d.novo);
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
    return falar(chat, "Responda com os botões da mensagem acima, ou envie /cancelar.", undefined, "atencao");
  }
  // escolha de opção por número ("2")
  if (d.opcoes?.length && /^\d{1,2}$/.test(low)) {
    const o = d.opcoes[Number(low) - 1];
    if (o) return porBarcode(ctx, chat, s, d, o.barcode);
  }

  const resto = mb ? texto.replace(mb[0], " ") : texto;
  const p = interpretarVoz(resto, hoje());
  const soNumero = /^\s*\d+(?:[.,]\d+)?\s*(?:kg|un|unidades?)?\s*$/i.test(resto) && !mb;
  let mudou = false;
  if (p.validade) { d.validade = p.validade; mudou = true; }
  if (p.quantidade != null) { d.quantidade = p.quantidade; if (p.porPeso) d.porPeso = true; mudou = true; }
  else if (soNumero && d.barcode && d.quantidade == null) { d.quantidade = Number(resto.replace(/[^\d.,]/g, "").replace(",", ".")); mudou = true; }

  if (mb) return porBarcode(ctx, chat, s, d, mb[0]);
  if (!d.barcode && p.nome && !soNumero) return escolherProduto(ctx, chat, s, d, p.nome);
  if (!mudou && !d.barcode) return falar(chat, "Não entendi. Envie o código de barras ou o nome do produto.", undefined, "atencao");
  return proximoPasso(ctx, chat, s, d);
}

async function perguntarCorrecao(chat: number, sid: string, novo = false) {
  const linha = [{ t: "Produto", d: `cx:${sid}:p` }, { t: "Validade", d: `cx:${sid}:v` }, { t: "Quantidade", d: `cx:${sid}:q` }];
  if (novo) linha.push({ t: "Setor", d: `cx:${sid}:s` });
  return falar(chat, "O que você quer corrigir?", [linha], "conferir");
}
async function cancelar(chat: number, sid: string) {
  const { data: cx } = await sb.from("telegram_sessoes").update({ estado: "cancelado", atualizado_em: new Date().toISOString() }).eq("id", sid).in("estado", ["aguardando_info", "aguardando_confirmacao"]).select("dados").maybeSingle();
  if (cx?.dados?.barcode || cx?.dados?.novo?.barcode) await auditar(chat, "cancelou lançamento no Telegram", cx.dados.nome ?? cx.dados.novo?.nome, cx.dados.barcode ?? cx.dados.novo?.barcode);
  return falar(chat, "Lançamento cancelado. Quando quiser, é só mandar um novo produto.", undefined, "cancelado");
}

const ERROS: Record<string, string> = {
  produto_nao_encontrado: "Esse produto não está no cadastro desta loja.",
  produto_fora_da_marca: "Esse produto não é da sua marca.",
  validade_vencida: "A validade informada já passou. Só lanço de hoje em diante.",
  validade_invalida: "A validade está longe demais. Confira a data.",
  validade_obrigatoria: "Falta a validade.",
  quantidade_invalida: "Quantidade inválida. Confira o número.",
  usuario_fora_da_loja: "Seu acesso não está mais ativo nesta loja. Fale com o encarregado.",
  limite_excedido: "Muitas ações em pouco tempo. Aguarde um pouco e tente de novo.",
};
const ERROS_NOVO: Record<string, string> = {
  sem_permissao: "Só funcionários podem cadastrar produto novo.",
  codigo_invalido: "O código de barras não é válido.",
  nome_invalido: "O nome do produto não é válido. Corrija o produto e tente de novo.",
  setor_invalido: "O setor não é válido. Corrija o setor.",
  foto_invalida: "A imagem não pôde ser usada. Corrija o produto para seguir sem imagem.",
  usuario_fora_da_loja: "Seu acesso não está mais ativo nesta loja. Fale com o encarregado.",
  limite_excedido: "Muitos produtos novos em pouco tempo. Aguarde um pouco.",
};
async function confirmar(ctx: Ctx, chat: number, sid: string, forcarDup: boolean) {
  // "pega" a sessão de forma atômica: confirmação repetida não grava duas vezes
  const { data: s } = await sb.from("telegram_sessoes").update({ estado: "confirmado", atualizado_em: new Date().toISOString() })
    .eq("id", sid).eq("chat_id", chat).eq("estado", "aguardando_confirmacao").select("*").maybeSingle();
  if (!s) return falar(chat, "Esse lançamento já foi tratado.", undefined, "atencao");
  const d: Dados = s.dados || {};
  if (!d.barcode || !d.validade || d.quantidade == null) { await salvar(s.id, "aguardando_info", d); return proximoPasso(ctx, chat, s, d); }

  // produto novo: cadastra no app (com a imagem confirmada) antes de lançar a validade
  if (d.novo && !d.criouProduto) {
    const { error: ec } = await sb.rpc("telegram_criar_produto", { p_chat_id: chat, p_barcode: d.novo.barcode, p_nome: d.novo.nome, p_setor: d.novo.setor, p_foto: d.novo.foto });
    const mc = ec?.message || "";
    if (ec && !mc.includes("produto_ja_existe")) {
      await salvar(s.id, "aguardando_confirmacao", d);
      const k = Object.keys(ERROS_NOVO).find((x) => mc.includes(x));
      await auditar(chat, "lançamento barrado no Telegram", `${d.novo.nome}: ${k ? ERROS_NOVO[k] : "erro ao cadastrar produto novo"}`, d.novo.barcode);
      return falar(chat, "⚠️ " + (k ? ERROS_NOVO[k] : "Não consegui cadastrar o produto novo agora. Nada foi lançado, tente de novo em instantes."), [[{ t: "✅ Tentar de novo", d: `ok:${s.id}` }, { t: "✏️ Corrigir", d: `fx:${s.id}` }, { t: "❌ Cancelar", d: `no:${s.id}` }]], "atencao");
    }
    d.criouProduto = true; await salvar(s.id, "confirmado", d);
  }

  const { error } = await sb.rpc("lancar_validade", {
    p_loja: ctx.loja_id, p_usuario: ctx.usuario_id ?? null, p_barcode: d.barcode, p_validade: d.validade, p_quantidade: d.quantidade,
    p_origem: "telegram", p_foto: null, p_obs: "Via Telegram",
    p_op: s.id, p_confirmar_duplicado: forcarDup, p_convite: ctx.convite_id ?? null,
  });
  if (error) {
    const m = error.message || "";
    if (m.includes("duplicado")) {
      d.dupAsk = true; await salvar(s.id, "aguardando_confirmacao", d);
      return falar(chat, "Já existe esse produto com essa validade na loja. Quer lançar mesmo assim?", [[{ t: "Lançar mesmo assim", d: `dp:${s.id}` }, { t: "❌ Cancelar", d: `no:${s.id}` }]], "atencao");
    }
    const chave = Object.keys(ERROS).find((k) => m.includes(k));
    if (chave) await auditar(chat, "lançamento barrado no Telegram", `${d.nome ?? ""}: ${ERROS[chave]}`, d.barcode);
    if (chave && chave !== "usuario_fora_da_loja" && chave !== "limite_excedido") { delete d.validade; if (chave === "quantidade_invalida") delete d.quantidade; await salvar(s.id, "aguardando_info", d); return falar(chat, "⚠️ " + ERROS[chave], undefined, "atencao"); }
    await salvar(s.id, "erro", d, m.slice(0, 300));
    return falar(chat, chave ? "⚠️ " + ERROS[chave] : "Não consegui gravar agora. Nada foi lançado — tente de novo em instantes.", undefined, "atencao");
  }
  await salvar(s.id, "registrado", d);
  if (forcarDup) await auditar(chat, "confirmou lançamento duplicado no Telegram", `${d.nome} · validade ${fmtData(d.validade)}`, d.barcode);
  return falar(chat, `✅ Lançamento realizado!\n${d.nome}\nValidade ${fmtData(d.validade)} · ${num(d.quantidade)} ${d.porPeso ? "kg" : "un"}${d.criouProduto ? "\n🆕 Produto novo cadastrado no app." : ""}`, undefined, "sucesso");
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
  if (!t) return falar(chat, "👋 Oi! Para começar, me envie o seu código de acesso:\n\n🧑‍💼 Funcionário: gere no app em Mais → Conta → Telegram (8 números)\n🏷️ Promotor: envie o código da sua marca (ex.: BAU-7K3QP)\n\nO código do app vale por 10 minutos.", undefined, "codigo");
  const func = /^\d{4}\s?-?\s?\d{4}$/.test(t);
  const prom = /^[A-Za-z]{3}-[A-Za-z0-9]{5}$/.test(t);
  if (!func && !prom) return falar(chat, "Não reconheci esse código. Funcionário: 8 dígitos do app. Promotor: código tipo BAU-7K3QP.", undefined, "atencao");
  const [a, b] = await Promise.all([
    sb.rpc("rl_servico", { p_chave: String(chat), p_bucket: "tg_vinc", p_max: 8 }),
    sb.rpc("rl_servico", { p_chave: "global", p_bucket: "tg_vinc", p_max: 200 }),
  ]);
  if (a.data === false || b.data === false) return falar(chat, "Muitas tentativas. Aguarde 1 minuto.", undefined, "atencao");
  const { data, error } = func
    ? await sb.rpc("telegram_vincular_funcionario", { p_chat_id: chat, p_codigo: t })
    : await sb.rpc("telegram_vincular_promotor", { p_chat_id: chat, p_codigo: t.toUpperCase() });
  if (error) {
    const k = Object.keys(ERRO_VINC).find((x) => (error.message || "").includes(x));
    return falar(chat, k ? "⚠️ " + ERRO_VINC[k] : "Não consegui vincular agora. Tente de novo.", undefined, "atencao");
  }
  return falar(chat, `✅ Pronto, ${String(data?.nome || "").split(" ")[0]}! Seu Telegram está vinculado.\n\nAgora é só me mandar o código de barras ou o nome do produto.`, undefined, "vinculado");
}

const AJUDA = "Como usar:\n\n🔢 Mande o código de barras ou o nome do produto\n💬 Ou escreva tudo de uma vez: “7891234567890 validade 20/11/2026 quantidade 8”\n🆕 Produto que não está no app? Mande o código de barras: eu busco a imagem na internet e você confirma\n✅ Só lanço depois do seu “sim”\n\n/cancelar – cancela o lançamento atual\n/sair – desvincula este Telegram";

// ---------- Entrada ----------
async function processar(up: Record<string, any>) {
  const cb = up.callback_query;
  const msg = up.message;
  const chatObj = msg?.chat ?? cb?.message?.chat;
  if (!chatObj || chatObj.type !== "private") return;
  const chat: number = chatObj.id;
  const texto: string = String(msg?.text ?? msg?.caption ?? "").slice(0, 500);

  const { error: eDup } = await sb.from("telegram_mensagens").insert({ update_id: up.update_id, chat_id: chat, tipo: cb ? "botao" : msg?.photo ? "foto" : msg?.text ? "texto" : "outro", texto: cb ? String(cb.data).slice(0, 100) : texto });
  if (eDup) { if (eDup.code === "23505") return; console.error(eDup); return; }
  const marcar = (status: string, erro?: string) => sb.from("telegram_mensagens").update({ status_proc: status, erro: erro?.slice(0, 500) ?? null }).eq("update_id", up.update_id);

  const { data: lim } = await sb.rpc("rl_servico", { p_chave: String(chat), p_bucket: "tg", p_max: 30 });
  if (lim === false) { await marcar("ignorada", "limite"); return; }

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
    const s = await sessaoAtiva(chat);
    const tirarBotoes = () => tg("editMessageReplyMarkup", { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
    if (!s || s.id !== sid) { await tirarBotoes(); await falar(chat, "Esse lançamento já foi tratado ou expirou.", undefined, "atencao"); await marcar("processada"); return; }
    await tirarBotoes();
    const d: Dados = s.dados || {};
    if (acao === "ok") await confirmar(ctx, chat, s.id, false);
    else if (acao === "dp") await confirmar(ctx, chat, s.id, true);
    else if (acao === "no") await cancelar(chat, s.id);
    else if (acao === "fx") await perguntarCorrecao(chat, s.id, !!d.novo);
    else if (acao === "cx") {
      if (extra === "p") { delete d.barcode; delete d.nome; delete d.porPeso; delete d.novo; delete d.criouProduto; await salvar(s.id, "aguardando_info", d); await falar(chat, "Certo. Qual é o produto? Código de barras ou nome.", undefined, "produto"); }
      else if (extra === "v") { delete d.validade; await salvar(s.id, "aguardando_info", d); await falar(chat, "Certo. Qual a data de validade? (ex.: 15/12/2026)", undefined, "validade"); }
      else if (extra === "q") { delete d.quantidade; await salvar(s.id, "aguardando_info", d); await falar(chat, d.porPeso ? "Certo. Quantos kg?" : "Certo. Quantas unidades?", undefined, "quantidade"); }
      else if (extra === "s" && d.novo) { d.novo.setor = null; d.novo.etapa = "setor"; await salvar(s.id, "aguardando_info", d); await perguntarSetor(chat, s.id); }
    } else if (acao === "pr") {
      const o = d.opcoes?.[Number(extra)];
      if (o) { const cat = await carregarCatalogo(ctx); const e = cat[o.barcode]; if (e) { d.barcode = e.barcode; d.nome = e.nome; d.porPeso = e.por_peso; delete d.opcoes; delete d.novo; await proximoPasso(ctx, chat, s, d); } }
    } else if (acao === "im" && d.novo?.etapa === "imagem") {
      if (extra === "1") await novoConfirmado(ctx, chat, s, d);
      else { delete d.novo; await salvar(s.id, "aguardando_info", d); await falar(chat, "Ok, descartei esse produto. Confira o código ou envie outro produto.", undefined, "produto"); }
    } else if (acao === "st" && d.novo?.etapa === "setor") {
      const setor = SETORES[Number(extra)];
      if (setor) { d.novo.setor = setor; d.novo.etapa = null; await proximoPasso(ctx, chat, s, d); }
    }
    await marcar("processada"); return;
  }

  if (!msg) return;
  if (/^\/start/i.test(texto)) { await falar(chat, `Olá, ${String(ctx.nome).split(" ")[0]}! 👋\nPode mandar o código de barras ou o nome do produto.`, undefined, "produto"); await marcar("processada"); return; }
  if (/^\/ajuda/i.test(texto)) { await falar(chat, AJUDA, undefined, "ajuda"); await marcar("processada"); return; }
  if (/^\/cancelar/i.test(texto)) { const s = await sessaoAtiva(chat); if (s) await cancelar(chat, s.id); else await falar(chat, "Não há lançamento em andamento.", undefined, "ajuda"); await marcar("processada"); return; }
  if (/^\/sair/i.test(texto)) { await auditar(chat, "desvinculou o Telegram (/sair)", ctx.nome); await sb.from("telegram_vinculos").delete().eq("chat_id", chat); await falar(chat, "Telegram desvinculado. Para usar de novo, vincule outra vez com um código.", undefined, "cancelado"); await marcar("processada"); return; }
  if (texto.startsWith("/")) { await falar(chat, AJUDA, undefined, "ajuda"); await marcar("processada"); return; }

  // fotos NÃO são aceitas: o produto é identificado pelo código de barras ou pelo nome (a imagem do produto novo vem da internet)
  if (msg.photo?.length || msg.document || msg.video || msg.sticker) {
    await falar(chat, "Eu não recebo fotos nem arquivos. Envie o código de barras ou o nome do produto.\n\nSe o produto não estiver no app, mande o código de barras: eu busco a imagem na internet e você confirma.", undefined, "atencao");
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
  try { await processar(up); } catch (e) { console.error("telegram-bot", String(e)); }
  return new Response("ok"); // sempre 200: o Telegram não reenvia, e a duplicidade é barrada por update_id
});

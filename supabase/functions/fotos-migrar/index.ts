// @ts-nocheck
// Edge Function: fotos-migrar — tira as fotos de produto de DENTRO das tabelas (texto base64) e põe no
// armazenamento de arquivos (bucket público "fotos"), deixando só o link na coluna.
// verify_jwt = true. Não recebe dado nenhum: lê as pendências do banco (RPC fotos_pendentes), envia cada foto
// uma vez (nome = loja/md5 do conteúdo) e troca a coluna pela RPC foto_trocar. Só a chave de serviço grava no bucket.
// O app chama ao abrir e a cada 10 min; rodar de novo não faz mal (idempotente). Foto que a função não aceita
// (formato, tamanho) nem entra na lista: fotos_pendentes só devolve o que dá para mover.
// 2ª etapa (migrarOff): links antigos do Open Food Facts (site de fora, que troca/derruba imagens) viram uma cópia no bucket,
// buscando a foto ATUAL pela API deles com o código de barras. Produto que o OFF não tem fica registrado em fotos_off_tentativas
// (não repete por alguns dias). Exige supabase-fotos-off.sql; sem ele, só pula esta etapa.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SITES = ["https://condor-validade.vercel.app", "https://app.usebipi.com", "https://bipi-validade.vercel.app"];
const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_BASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 500_000;

function decodificar(dataUrl: string): { bytes: Uint8Array; tipo: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    if (bin.length === 0 || bin.length > MAX_BYTES) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // confere a assinatura do arquivo (não confia só no rótulo)
    const ini = (...b: number[]) => b.every((v, i) => bytes[i] === v);
    const jpg = ini(0xff, 0xd8, 0xff), png = ini(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    const webp = ini(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // "RIFF....WEBP"
    if ((m[1] === "image/jpeg" && !jpg) || (m[1] === "image/png" && !png) || (m[1] === "image/webp" && !webp)) return null;
    return { bytes, tipo: m[1] };
  } catch { return null; }
}

// ---------- Fotos do Open Food Facts: pede a foto ATUAL pelo código de barras e guarda uma cópia no nosso bucket ----------
// Só hosts exatos do OFF (nada de curinga), sem seguir redirect, corpo lido com teto de bytes, assinatura do arquivo conferida.
const HOSTS_OFF = new Set(["images.openfoodfacts.org", "static.openfoodfacts.org", "world.openfoodfacts.org"]);
const hostOk = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && x.port === "" && !x.username && !x.password && HOSTS_OFF.has(x.hostname); } catch { return false; } };
const UA = "BipiValidade/1.0 (+https://app.usebipi.com)";
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
const OFF_LOTE = 4; // poucas por vez: a API do OFF limita por IP (e o IP desta função é compartilhado)

async function lerLimitado(r: Response, max: number): Promise<Uint8Array | null> {
  const cl = Number(r.headers.get("content-length") || 0);
  if (cl > max) return null;
  const rd = r.body?.getReader();
  if (!rd) return null;
  const partes: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    total += value.length;
    if (total > max) { try { await rd.cancel(); } catch { /* */ } return null; }
    partes.push(value);
  }
  const out = new Uint8Array(total); let o = 0;
  for (const x of partes) { out.set(x, o); o += x.length; }
  return out;
}

// resultado: { foto } achou; { semFoto:true } o OFF respondeu e NÃO tem foto utilizável (vale registrar a tentativa);
// { erro:true } falha de rede/limite/5xx (não é culpa do produto: não registra, tenta depois)
async function fotoAtualOff(bc: string): Promise<{ foto?: { bytes: Uint8Array; tipo: string }; semFoto?: boolean; erro?: boolean }> {
  const consulta = async (c: string): Promise<{ p: any } | { erro: true }> => {
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=image_front_url,image_front_small_url`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000), redirect: "error" });
      if (r.status === 404) return { p: null };
      if (!r.ok) return { erro: true };
      const corpo = await lerLimitado(r, 100_000);
      if (!corpo) return { erro: true };
      const j = JSON.parse(new TextDecoder().decode(corpo));
      return { p: j?.status === 1 ? j.product : null };
    } catch { return { erro: true }; }
  };
  let q = await consulta(bc);
  if ("erro" in q) return { erro: true };
  if (!q.p && bc.length === 12) { q = await consulta("0" + bc); if ("erro" in q) return { erro: true }; } // UPC-A guardado como EAN-13
  if (!q.p) return { semFoto: true };
  let falhaRede = false;
  for (const u of [q.p.image_front_url, q.p.image_front_small_url]) {
    if (typeof u !== "string" || !hostOk(u)) continue;
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000), redirect: "error" });
      if (!r.ok) { if (r.status >= 500 || r.status === 429) falhaRede = true; continue; }
      const bytes = await lerLimitado(r, MAX_BYTES);
      if (!bytes || bytes.length < 500) continue;
      const ini = (...b: number[]) => b.every((v, i) => bytes[i] === v);
      if (ini(0xff, 0xd8, 0xff)) return { foto: { bytes, tipo: "image/jpeg" } };
      if (ini(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { foto: { bytes, tipo: "image/png" } };
    } catch { falhaRede = true; }
  }
  return falhaRede ? { erro: true } : { semFoto: true };
}

async function migrarOff(): Promise<{ migradas: number; puladas: number; lote: number }> {
  const vazio = { migradas: 0, puladas: 0, lote: 0 };
  // limite próprio e baixo para a API de fora (falha fechada)
  const { data: lo, error: eLo } = await sb.rpc("rl_servico", { p_chave: "geral", p_bucket: "fotos_off", p_max: 3 });
  if (eLo || lo !== true) return vazio;
  const { data: pend, error } = await sb.rpc("fotos_off_pendentes", { p_limite: OFF_LOTE });
  if (error) { if (!/PGRST202|42883|does not exist|Could not find/i.test(`${error.code} ${error.message}`)) console.error("fotos_off_pendentes", error.code); return vazio; } // SQL ainda não aplicado: segue sem
  const lista = pend || [];
  const rs = await Promise.all(lista.map(async (p: any) => {
    try {
      const loja = Number(p.loja_id), bc = String(p.barcode), antigo = String(p.antigo);
      if (!Number.isInteger(loja) || !/^[0-9]{8,14}$/.test(bc) || !/^https:\/\/([a-z0-9-]+\.)*openfoodfacts\.org\//.test(antigo)) return false;
      const f = await fotoAtualOff(bc);
      if (f.semFoto) { await sb.rpc("foto_off_falhou", { p_loja: loja, p_barcode: bc }); return false; }
      if (!f.foto) return false;
      const nome = hex(await crypto.subtle.digest("SHA-256", f.foto.bytes)).slice(0, 32);
      const caminho = `${loja}/${nome}.${TIPOS[f.foto.tipo]}`;
      const { error: eUp } = await sb.storage.from("fotos").upload(caminho, f.foto.bytes, { contentType: f.foto.tipo, upsert: true, cacheControl: "31536000" });
      if (eUp) { console.error("upload foto off", eUp.message); return false; }
      const { data: n, error: eTr } = await sb.rpc("foto_off_trocar", { p_loja: loja, p_antigo: antigo, p_url: `${URL_BASE}/storage/v1/object/public/fotos/${caminho}` });
      if (eTr) { console.error("foto_off_trocar", eTr.code); return false; }
      return Number(n) > 0; // só conta se trocou de verdade
    } catch (e) { console.error("migrarOff", String((e as Error)?.message || e).slice(0, 120)); return false; }
  }));
  const migradas = rs.filter(Boolean).length;
  return { migradas, puladas: lista.length - migradas, lote: lista.length };
}

Deno.serve(async (req: Request) => {
  const origem = req.headers.get("origin") || "";
  const cors = { "Access-Control-Allow-Origin": SITES.includes(origem) ? origem : SITES[0], "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Vary": "Origin" };
  const resp = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return resp({ erro: "metodo" }, 405);
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return resp({ erro: "nao_autenticado" }, 401);
  if (u.user.is_anonymous) return resp({ ok: true, migradas: 0, puladas: 0, pode_ter_mais: false }); // convite de promotor não dispara a migração

  // limites (falha fechada): por pessoa e geral
  const { data: l1, error: e1 } = await sb.rpc("rl_servico", { p_chave: u.user.id, p_bucket: "fotos_migrar", p_max: 6 });
  if (e1 || l1 !== true) return resp({ erro: "limite_excedido" }, 429);
  const { data: l2, error: e2 } = await sb.rpc("rl_servico", { p_chave: "geral", p_bucket: "fotos_migrar_geral", p_max: 30 });
  if (e2 || l2 !== true) return resp({ erro: "limite_excedido" }, 429);

  const { data: pend, error } = await sb.rpc("fotos_pendentes", { p_limite: 12 });
  if (error) return resp({ erro: "banco" }, 500);
  let migradas = 0, puladas = 0;
  for (const p of pend || []) {
    const d = decodificar(String(p.foto || ""));
    if (!d || !/^[a-f0-9]{32}$/.test(String(p.hash)) || !Number.isInteger(Number(p.loja_id))) { puladas++; continue; }
    const caminho = `${Number(p.loja_id)}/${p.hash}.${TIPOS[d.tipo]}`;
    const { error: eUp } = await sb.storage.from("fotos").upload(caminho, d.bytes, { contentType: d.tipo, upsert: true, cacheControl: "31536000" });
    if (eUp) { puladas++; continue; }
    const url = `${URL_BASE}/storage/v1/object/public/fotos/${caminho}`;
    const { error: eTr } = await sb.rpc("foto_trocar", { p_loja: Number(p.loja_id), p_hash: p.hash, p_url: url });
    if (eTr) puladas++; else migradas++;
  }
  const off = await migrarOff();
  const progresso = migradas + off.migradas;
  return resp({ ok: true, migradas: progresso, puladas: puladas + off.puladas, pode_ter_mais: progresso > 0 && ((pend || []).length >= 12 || off.lote >= OFF_LOTE) }); // sem progresso = não insistir
});

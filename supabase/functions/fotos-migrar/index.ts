// @ts-nocheck
// Edge Function: fotos-migrar — tira as fotos de produto de DENTRO das tabelas (texto base64) e põe no
// armazenamento de arquivos (bucket público "fotos"), deixando só o link na coluna.
// verify_jwt = true. Não recebe dado nenhum: lê as pendências do banco (RPC fotos_pendentes), envia cada foto
// uma vez (nome = loja/md5 do conteúdo) e troca a coluna pela RPC foto_trocar. Só a chave de serviço grava no bucket.
// O app chama ao abrir e a cada 10 min; rodar de novo não faz mal (idempotente). Foto que a função não aceita
// (formato, tamanho) nem entra na lista: fotos_pendentes só devolve o que dá para mover.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SITES = ["https://condor-validade.vercel.app", "https://app.usebipi.com"];
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
  return resp({ ok: true, migradas, puladas, pode_ter_mais: migradas > 0 && (pend || []).length >= 12 }); // sem progresso = não insistir
});

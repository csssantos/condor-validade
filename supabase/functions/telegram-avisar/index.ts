// @ts-nocheck
// Edge Function: telegram-avisar — depois que um encarregado+ aprova/recusa um produto novo no app,
// avisa pelo Telegram quem lançou (com banner do Bipi e, se recusado, o motivo).
// verify_jwt = true. Só aceita {id}; lê tudo do banco; só avisa se QUEM CHAMA foi quem decidiu e ainda não foi avisado.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SITE = "https://condor-validade.vercel.app";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Vary": "Origin" };
const resp = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const fmt = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };

async function tg(method: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return await r.json();
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return resp({ erro: "metodo" }, 405);
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return resp({ erro: "nao_autenticado" }, 401);
  let id = "";
  try { id = String((await req.json())?.id || ""); } catch { return resp({ erro: "pedido" }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return resp({ erro: "pedido" }, 400);

  // "pega" o aviso de forma atômica: só quem decidiu, só uma vez
  const { data: a } = await sb.from("aprovacoes_produto").update({ notificado: true })
    .eq("id", id).eq("decidido_por_id", u.user.id).eq("notificado", false).in("status", ["aprovado", "recusado"])
    .select("chat_id, status, nome, motivo, decidido_por, validade, quantidade").maybeSingle();
  if (!a) return resp({ ok: true, enviado: false });

  const texto = a.status === "aprovado"
    ? `✅ Produto aprovado!\n${a.nome}\n\nCadastrado no app por ${a.decidido_por}. Sua validade ${fmt(a.validade)} · ${a.quantidade} un foi lançada.`
    : `❌ Produto rejeitado por ${a.decidido_por}.\n${a.nome}\n\nMotivo: ${a.motivo}\n\nNada foi lançado. Se quiser, confira o produto e envie de novo.`;
  const banner = a.status === "aprovado" ? "aprovado" : "rejeitado";
  let r = await tg("sendPhoto", { chat_id: a.chat_id, photo: `${SITE}/bot/${banner}.jpg`, caption: texto.slice(0, 1000) });
  if (!r?.ok) r = await tg("sendMessage", { chat_id: a.chat_id, text: texto.slice(0, 3500) });
  if (!r?.ok) await sb.from("aprovacoes_produto").update({ notificado: false }).eq("id", id); // tenta de novo na próxima vez
  return resp({ ok: true, enviado: !!r?.ok });
});

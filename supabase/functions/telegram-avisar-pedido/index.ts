// @ts-nocheck
// Edge Function: telegram-avisar-pedido — quando alguém registra um pedido de promoção/preço direto (campanha) num lote
// que foi lançado pelo Telegram, avisa no Telegram quem lançou (com banner do Bipi), com o valor pedido e o aviso de que
// o valor é só uma sugestão (depende da central liberar). verify_jwt = true. Só aceita {id}; lê tudo do banco.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SITE = "https://condor-validade.vercel.app";
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Vary": "Origin" };
const resp = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const fmt = (iso: string) => { if (!iso) return "sem data"; const [a, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
const reais = (v: number) => "R$ " + Number(v).toFixed(2).replace(".", ",");
const limpaTxt = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/https?:\/\/\S+|www\.\S+/gi, "[link]").slice(0, n);

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
  if (!id || id.length > 80) return resp({ erro: "pedido" }, 400);

  // quem chama precisa enxergar o lote (RLS da loja/cargo, com o JWT dele)
  const userSb = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: vis, error: eVis } = await userSb.from("produtos").select("id").eq("id", id).maybeSingle();
  if (eVis || !vis) return resp({ ok: true, enviado: false });

  // limite por usuário (falha fechada)
  const { data: lim, error: eLim } = await sb.rpc("rl_servico", { p_chave: u.user.id, p_bucket: "pedido_aviso", p_max: 20 });
  if (eLim || lim !== true) return resp({ erro: "limite_excedido" }, 429);

  // teto por lote (evita encher a conversa de alguém com alterações seguidas): 6 por minuto, falha fechada
  const { data: limA, error: eLimA } = await sb.rpc("rl_servico", { p_chave: "chat:" + id.slice(0, 40), p_bucket: "pedido_aviso_prod", p_max: 6 });
  if (eLimA || limA !== true) return resp({ ok: true, enviado: false });
  const { data: a, error: eA } = await sb.rpc("telegram_pedido_aviso", { p_id: id, p_quem: u.user.id });
  if (eA || !a?.enviar) return resp({ ok: true, enviado: false });

  const preco = a.tipo === "preco_direto";
  const linhas = [
    `🏷️ ${preco ? "Preço direto pedido" : "Promoção pedida"}${a.atualizado ? " (pedido atualizado)" : ""}!`,
    limpaTxt(a.nome, 120),
    `${a.lote ? `Lote ${limpaTxt(a.lote, 20)}` : "Sem lote"} · validade ${fmt(a.validade)}`,
    "",
    `Pedido por ${limpaTxt(a.por, 60) || "um colega"}${a.campanha ? ` · campanha ${limpaTxt(a.campanha, 20)}` : ""}.`,
  ];
  if (a.valor != null) linhas.push(`Valor pedido: ${reais(a.valor)}`, "", "⚠️ Esse valor é só uma sugestão: vai depender da central liberar.");
  else linhas.push("", "⚠️ Vai depender da central liberar.");
  linhas.push("O lote fica travado no app até o encarregado remover o pedido ou dar baixa.");
  const texto = linhas.join("\n");
  let r = await tg("sendPhoto", { chat_id: a.chat_id, photo: `${SITE}/bot/campanha.jpg`, caption: texto.slice(0, 1000) });
  if (!r?.ok) r = await tg("sendMessage", { chat_id: a.chat_id, text: texto.slice(0, 3500) });
  if (!r?.ok) await sb.from("pedido_avisos").delete().eq("produto_id", id); // libera para tentar de novo
  return resp({ ok: true, enviado: !!r?.ok });
});

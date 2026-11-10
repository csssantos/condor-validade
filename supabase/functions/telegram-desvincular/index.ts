// @ts-nocheck
// Edge Function: telegram-desvincular — remove o vínculo do Telegram (mesma regra de permissão da RPC remover_telegram)
// e AVISA no próprio Telegram, com banner do Bipi, que ele foi desvinculado e que precisa vincular de novo.
// verify_jwt = true. A permissão continua sendo decidida pelo banco: a RPC roda com o login de quem chamou.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
// Domínios do app: o antigo continua valendo durante a transição; APP_URL (secret) escolhe o principal (só aceita um da lista).
const SITES = ["https://condor-validade.vercel.app", "https://app.usebipi.com"];
const SITE = SITES.includes(Deno.env.get("APP_URL") || "") ? Deno.env.get("APP_URL")! : SITES[0];
const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
let cors = { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Vary": "Origin" };
const resp = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;

async function tg(method: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return await r.json();
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  { const o = req.headers.get("origin") || ""; cors = { ...cors, "Access-Control-Allow-Origin": SITES.includes(o) ? o : SITE }; } // aceita o domínio antigo e o novo
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return resp({ erro: "metodo" }, 405);
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return resp({ erro: "nao_autenticado" }, 401);
  let usuario: string | null = null, convite: string | null = null;
  let b: any; try { b = await req.json(); } catch { return resp({ erro: "pedido" }, 400); }
  usuario = uuid(b?.usuario); convite = uuid(b?.convite);
  if (usuario && convite) return resp({ erro: "informe_so_um" }, 400); // ou usuário, ou convite: os dois juntos deixavam o alvo ambíguo
  if ((b?.usuario != null && !usuario) || (b?.convite != null && !convite)) return resp({ erro: "id_invalido" }, 400); // id inválido nunca vira "a própria pessoa"

  // quem é o alvo (guarda o chat ANTES de apagar; isso não é devolvido a quem chamou)
  let q = admin.from("telegram_vinculos").select("id, chat_id, tipo");
  if (usuario) q = q.eq("usuario_id", usuario); else if (convite) q = q.eq("convite_id", convite); else q = q.eq("usuario_id", u.user.id);
  const { data: alvo } = await q.maybeSingle();

  // a remoção em si: RPC com o login de quem chamou (a permissão é decidida lá: própria pessoa, DEV/Diretor, gerência, encarregado do setor)
  const sbUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { error } = await sbUser.rpc("remover_telegram", { p_usuario: usuario, p_convite: convite });
  if (error) return resp({ erro: String(error.message || "erro").slice(0, 120) }, /sem_permissao/.test(error.message || "") ? 403 : 400);

  let avisou = false;
  if (alvo?.chat_id) {
    const { data: ainda } = await admin.from("telegram_vinculos").select("id").eq("id", alvo.id).maybeSingle();
    if (!ainda) {
      const como = alvo.tipo === "promotor"
        ? "Para continuar lançando validade, vincule de novo: envie aqui o código da sua marca (ex.: BAU-7K3QP8M2XC)."
        : "Para continuar lançando validade, vincule de novo: gere um novo código no app (Mais → Conta → Telegram) e envie aqui.";
      const texto = `🔒 Seu Telegram foi desvinculado do aplicativo.\n\nEnquanto não vincular de novo, eu não consigo lançar validade.\n\n${como}`;
      const r = await tg("sendPhoto", { chat_id: alvo.chat_id, photo: `${SITE}/bot/codigo.jpg`, caption: texto.slice(0, 1000) });
      if (!r?.ok) await tg("sendMessage", { chat_id: alvo.chat_id, text: texto });
      avisou = true;
    }
  }
  return resp({ ok: true, avisou });
});

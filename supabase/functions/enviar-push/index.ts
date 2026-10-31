// Edge Function: enviar-push (versão 8 — endurecida)
// Aviso: recebe só { avisoId } (criado pela função enviar_aviso) e envia exatamente aquele aviso.
// Produto (trigger do banco): recebe só { id }; o conteúdo vem do BANCO, nunca do chamador, e só vai para a loja do produto.
// Limites: 2 pushes/min por produto e 300/min no total (rl_servico). Sem o SQL de segurança aplicado, o limite é ignorado (fail-open).
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@condor.com.br";
webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
const MAX_CORPO = 20_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return resposta(req, { ok: false, erro: "metodo" }, 405);
  try {
    const bruto = await req.text();
    if (bruto.length > MAX_CORPO) return resposta(req, { ok: false, erro: "corpo_grande" }, 413);
    const corpoReq = JSON.parse(bruto || "{}");
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let payload: string;
    let inscricoes: any[] = [];

    if (corpoReq.avisoId) {
      if (!(await dentroDoLimite(supabase, "global", "push_total", 300))) return resposta(req, { ok: false, erro: "limite" }, 429);
      const { data: aviso, error: eMarca } = await supabase.from("avisos")
        .update({ push_enviado_em: new Date().toISOString() })
        .eq("id", String(corpoReq.avisoId)).is("push_enviado_em", null)
        .gte("criado_em", new Date(Date.now() - 15 * 60_000).toISOString())
        .select("id, titulo, mensagem, tipo, alvo_tipo, alvo_setor, alvo_usuarios, loja_id").maybeSingle();
      if (eMarca) throw eMarca;
      if (!aviso) return resposta(req, { ok: false, erro: "aviso_inexistente_ou_ja_enviado" }, 409);
      payload = montarPayloadAviso(aviso);

      let q = supabase.from("push_subscriptions").select("*");
      if (aviso.loja_id) q = q.eq("loja_id", aviso.loja_id);
      if (aviso.alvo_tipo === "setor" || aviso.alvo_tipo === "usuarios") {
        let u = supabase.from("usuarios").select("id").eq("ativo", true);
        if (aviso.loja_id) u = u.eq("loja_id", aviso.loja_id);
        u = aviso.alvo_tipo === "setor" ? u.eq("setor", aviso.alvo_setor) : u.in("matricula", aviso.alvo_usuarios || []);
        const { data: alvos, error: eU } = await u;
        if (eU) throw eU;
        const ids = (alvos || []).map((x: any) => x.id);
        if (ids.length === 0) return resposta(req, { ok: true, enviados: 0, total: 0 });
        q = q.in("usuario_id", ids);
      }
      const { data, error } = await q;
      if (error) throw error;
      inscricoes = data || [];
    } else if (corpoReq.aviso) {
      return resposta(req, { ok: false, erro: "formato_antigo_nao_aceito" }, 400);
    } else {
      // produto: só o id vale; título, validade, setor, foto etc. vêm do banco
      const id = String(corpoReq?.id ?? "").slice(0, 80);
      if (!id) return resposta(req, { ok: false, erro: "id_obrigatorio" }, 400);
      if (!(await dentroDoLimite(supabase, "produto:" + id, "push_produto", 2))) return resposta(req, { ok: false, erro: "limite_produto" }, 429);
      if (!(await dentroDoLimite(supabase, "global", "push_total", 300))) return resposta(req, { ok: false, erro: "limite" }, 429);
      const { data: prod, error: eP } = await supabase.from("produtos")
        .select("id, nome, setor, foto, validade, quantidade, preco_unitario, loja_id").eq("id", id).maybeSingle();
      if (eP) throw eP;
      if (!prod) return resposta(req, { ok: false, erro: "produto_inexistente" }, 404);
      let q = supabase.from("push_subscriptions").select("*");
      if (prod.loja_id) q = q.eq("loja_id", prod.loja_id);
      const { data, error } = await q;
      if (error) throw error;
      inscricoes = data || [];
      payload = montarPayloadProduto(prod);
    }

    const resultados = await Promise.allSettled(
      inscricoes.map((linha) =>
        webpush.sendNotification(linha.subscription, payload).catch(async (err) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", linha.endpoint);
          }
          throw err;
        })
      )
    );
    const enviados = resultados.filter((r) => r.status === "fulfilled").length;
    return resposta(req, { ok: true, enviados, total: inscricoes.length });
  } catch (e) {
    console.error("enviar-push:", e);
    return resposta(req, { ok: false, erro: "falha_interna" }, 500);
  }
});

async function dentroDoLimite(sb: any, chave: string, bucket: string, max: number) {
  try {
    const { data, error } = await sb.rpc("rl_servico", { p_chave: chave, p_bucket: bucket, p_max: max });
    if (error) { console.error("rl_servico:", error.message); return true; } // SQL de segurança ainda não aplicado
    return data !== false;
  } catch { return true; }
}
function resposta(req: Request, corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}
function montarPayloadProduto(produto: any) {
  const dias = Math.round((new Date(produto.validade + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  const valor = (Number(produto.quantidade) || 1) * (Number(produto.preco_unitario) || 0);
  return JSON.stringify({
    title: `⚠️ ${produto.nome}`,
    body: dias < 0 ? "Produto vencido — retire de venda e registre a baixa."
      : dias === 0 ? `Vence hoje · Setor ${produto.setor} · Valor estimado ${formatarMoeda(valor)}`
      : `Vence em ${dias} dia(s) · Setor ${produto.setor} · Valor estimado ${formatarMoeda(valor)}`,
    icon: "/icon-192.png", image: produto.foto || undefined, tag: `produto-${produto.id}`,
    data: { itemId: produto.id, url: `/?produto=${produto.id}` },
  });
}
const EMOJI_TIPO: Record<string, string> = { info: "📣", aviso: "⚠️", urgente: "🚨" };
function montarPayloadAviso(aviso: any) {
  const emoji = EMOJI_TIPO[aviso.tipo] || EMOJI_TIPO.info;
  return JSON.stringify({ title: `${emoji} ${aviso.titulo}`, body: aviso.mensagem, icon: "/icon-192.png", tag: `aviso-${aviso.id}`,
    requireInteraction: aviso.tipo === "urgente", data: { avisoId: aviso.id, url: "/" } });
}
function formatarMoeda(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
const ORIGEM_OK = /^https:\/\/condor-validade[a-z0-9-]*\.vercel\.app$|^http:\/\/localhost(:\d+)?$/;
function corsHeaders(req: Request) {
  const o = req.headers.get("origin") || "";
  const h: Record<string, string> = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Vary": "Origin" };
  if (ORIGEM_OK.test(o)) h["Access-Control-Allow-Origin"] = o;
  return h;
}

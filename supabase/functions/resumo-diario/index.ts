// @ts-nocheck
// Edge Function: resumo-diario — manda a cada encarregado (que ligou, em Mais → Notificações) o resumo do dia por Telegram, push e/ou e-mail.
// verify_jwt = FALSE: quem chama é o agendador do banco (pg_cron → resumo_diario_disparar), com o cabeçalho `x-resumo-segredo`.
// O segredo mora no Vault do banco e é conferido PELO BANCO (RPC resumo_diario_validar, só chave de serviço): não existe secret desta função para vazar.
// Garantias: 1 envio por pessoa/dia/canal (RPC resumo_diario_reservar; falhou = liberar para a nova tentativa das 08:00), nunca manda resumo vazio,
// cada pessoa recebe só o setor dela (o cálculo é do banco), limite de execuções por minuto (rl_servico, falha fechada), textos do banco sempre limpos.
// Secrets usados: TELEGRAM_BOT_TOKEN, RESEND_API_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (já existem para as outras funções); opcional APP_URL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { modeloAviso, REMETENTE } from "../auth-email/templates.ts";
import { normalizar, temConteudo, textoTelegram, corpoPush, mensagemEmail, detalhesEmail } from "./formato.ts";

const SITES = ["https://condor-validade.vercel.app", "https://app.usebipi.com"];
const appUrl = (Deno.env.get("APP_URL") || "").trim();
const SITE = SITES.includes(appUrl) ? appUrl : SITES[0];
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const vapidOk = !!(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY"));
if (vapidOk) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:contato@condor.com.br", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
const resp = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

async function tg(method: string, body: Record<string, unknown>) {
  try { const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }); return await r.json(); }
  catch { return { ok: false, semResposta: true }; }
}
async function enviarTelegram(chat: number, texto: string) {
  if (!TOKEN) return false;
  let r = await tg("sendPhoto", { chat_id: chat, photo: `${SITE}/bot/resumo.jpg`, caption: texto.slice(0, 1000) });
  // só cai para texto se o Telegram RESPONDEU que não deu; sem resposta (tempo esgotado) pode ter entregue: não repete
  if (!r?.ok && !r?.semResposta) r = await tg("sendMessage", { chat_id: chat, text: texto.slice(0, 3500) }); // sem o banner, manda só o texto
  return !!r?.ok;
}
async function enviarEmail(para: string, m: { subject: string; html: string; text: string }, idem: string) {
  if (!RESEND) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json", "Idempotency-Key": idem },
      body: JSON.stringify({ from: `Bipi Tech <${REMETENTE.aviso}@mail.usebipi.com>`, to: [para], subject: m.subject, html: m.html, text: m.text, headers: { "X-Entity-Ref-ID": idem } }) });
    return r.ok;
  } catch { return false; }
}
async function enviarPush(usuarioId: string, payload: string) {
  if (!vapidOk) return false;
  const { data: subs, error } = await sb.from("push_subscriptions").select("endpoint, subscription").eq("usuario_id", usuarioId);
  if (error || !subs?.length) return false;
  const rs = await Promise.allSettled(subs.map((s: any) => webpush.sendNotification(s.subscription, payload, { TTL: 6 * 3600, urgency: "normal", timeout: 8000 }).catch(async (e: any) => {
    if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    throw e;
  })));
  return rs.some((x) => x.status === "fulfilled");
}
async function dentroDoLimite(chave: string, bucket: string, max: number) {
  try { const { data, error } = await sb.rpc("rl_servico", { p_chave: chave, p_bucket: bucket, p_max: max }); return !error && data === true; } catch { return false; }
}
// reserva o envio do dia; se enviar falhar, libera para a nova tentativa
async function comReserva(usuario: string, canal: string, enviar: () => Promise<boolean>) {
  const { data: ok, error } = await sb.rpc("resumo_diario_reservar", { p_usuario: usuario, p_canal: canal });
  if (error || ok !== true) return "ja_enviado";
  let sucesso = false;
  try { sucesso = await enviar(); } catch { sucesso = false; }
  if (!sucesso) { await sb.rpc("resumo_diario_liberar", { p_usuario: usuario, p_canal: canal }); return "falhou"; }
  return "enviado";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return resp({ erro: "metodo" }, 405);
  const segredo = req.headers.get("x-resumo-segredo") || "";
  if (segredo.length < 20 || segredo.length > 200) return resp({ erro: "nao_autorizado" }, 403);
  const { data: valido, error: eV } = await sb.rpc("resumo_diario_validar", { p_segredo: segredo });
  if (eV || valido !== true) { console.warn("resumo-diario: segredo inválido"); return resp({ erro: "nao_autorizado" }, 403); }
  if (!(await dentroDoLimite("global", "resumo_diario_exec", 3))) return resp({ erro: "limite" }, 429);

  const { data: dests, error: eD } = await sb.rpc("resumo_diario_destinatarios");
  if (eD) { console.error("resumo-diario: destinatarios", eD.message); return resp({ erro: "falha_interna" }, 500); }
  const inicio = Date.now();
  const total = { telegram: 0, push: 0, email: 0, falhas: 0, sem_conteudo: 0, ja_enviado: 0 };
  for (const d of dests || []) {
    if (Date.now() - inicio > 110_000) { console.warn("resumo-diario: tempo esgotado, o restante fica para a nova tentativa"); break; }
    try {
      const { data: bruto, error: eC } = await sb.rpc("resumo_diario_calcular", { p_usuario: d.usuario_id });
      if (eC) { total.falhas++; continue; }
      const r = normalizar(bruto);
      if (!r || !temConteudo(r)) { total.sem_conteudo++; continue; }
      const marca = { assets: "https://app.usebipi.com/email", nome: "Bipi Tech", suporte: "" };
      const tarefas: [string, boolean, () => Promise<boolean>][] = [
        ["telegram", !!(d.quer_telegram && d.chat_id), () => enviarTelegram(Number(d.chat_id), textoTelegram(r))],
        ["push", !!d.quer_push, () => enviarPush(d.usuario_id, JSON.stringify({ title: "🗓️ Resumo do dia", body: corpoPush(r), icon: "/icon-192.png", tag: `resumo-${r.hoje_data}`, data: { url: "/" } }))],
        ["email", !!(d.quer_email && d.email), () => enviarEmail(d.email, modeloAviso({ titulo: "Resumo do dia", mensagem: mensagemEmail(r), detalhes: detalhesEmail(r), botao: { texto: "Abrir o Bipi", url: "https://app.usebipi.com" } }, marca), `resumo-${d.usuario_id}-${r.hoje_data}`)],
      ];
      for (const [canal, quer, fn] of tarefas) {
        if (!quer) continue;
        const s = await comReserva(d.usuario_id, canal, fn);
        if (s === "enviado") total[canal]++; else if (s === "falhou") total.falhas++; else total.ja_enviado++;
      }
    } catch (e) { total.falhas++; console.error("resumo-diario: pessoa falhou", (e as Error).message); } // nunca registra dado da pessoa
  }
  return resp({ ok: true, destinatarios: (dests || []).length, ...total });
});

// Edge Function "auth-email": Send Email Hook do Supabase Auth → Resend.
// verify_jwt = FALSE (o Supabase chama sem JWT; a autenticação é a assinatura Standard Webhooks do corpo).
// Segredos (Supabase → Edge Functions → Secrets): RESEND_API_KEY, SEND_EMAIL_HOOK_SECRET (v1,whsec_…).
// Opcionais: EMAIL_DOMINIO (padrão mail.usebipi.com; precisa ser usebipi.com ou subdomínio), ASSET_BASE_URL (padrão https://usebipi.com/email), SITE_URL,
// SITE_URL (padrão https://usebipi.com), AMBIENTE_DEV ("true" libera localhost só em desenvolvimento),
// EMAIL_CHANGE_ENABLED ("true" liga a troca de e-mail; padrão DESLIGADA),
// REDIRECT_HOSTS (lista de hosts aceitos), LINK_VALIDADE_MIN (padrão 60 = OTP_EXPIRY do Auth).
// Nunca registra token, link nem corpo do pedido.
import { modelo, REMETENTE, type Tipo } from "./templates.ts";

// Domínio oficial ÚNICO: remetentes, Resend e URLs dos templates saem daqui (nenhum outro é aceito).
export const DOMINIO_ENVIO = "mail.usebipi.com"; // verificado no Resend
export const DOMINIO_SITE = "usebipi.com";
export const SITE_PADRAO = `https://${DOMINIO_SITE}`; // produção; localhost só com AMBIENTE_DEV=true
export const ASSETS_PADRAO = `https://${DOMINIO_SITE}/email`;
const dominioOficial = (host: string) => host === DOMINIO_SITE || host.endsWith("." + DOMINIO_SITE);

const TIPOS = new Set(["signup", "recovery", "invite", "magiclink", "email_change", "reauthentication"]);
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function igual(a: string, b: string) { // comparação em tempo constante
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function assinaturaValida(corpo: string, h: { id: string | null; ts: string | null; sig: string | null }, segredo: string, agora = Date.now()) {
  if (!h.id || !h.ts || !h.sig || !segredo) return false;
  const t = Number(h.ts);
  if (!Number.isFinite(t) || Math.abs(agora / 1000 - t) > 300) return false; // 5 min: barra reenvio de pedido antigo
  try { return await conferir(corpo, h as { id: string; ts: string; sig: string }, segredo); } catch { return false; } // segredo/assinatura malformados = inválida (nunca derruba a função)
}
async function conferir(corpo: string, h: { id: string; ts: string; sig: string }, segredo: string) {
  const chave = await crypto.subtle.importKey("raw", deB64(segredo.replace(/^v1,whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = b64(new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(`${h.id}.${h.ts}.${corpo}`))));
  return h.sig.split(" ").some((s) => igual(s.replace(/^v1,/, ""), esperado));
}

export function linkDeVerificacao(supabaseUrl: string, tokenHash: string, tipo: string, redirect: string | undefined, hostsOk: string[], siteUrl: string) {
  let r = "";
  try {
    const u = new URL(redirect || "");
    const origemSite = siteUrl ? new URL(siteUrl).origin : "";
    const semCredencial = !u.username && !u.password;
    const httpsOficial = u.protocol === "https:" && (u.origin === origemSite || hostsOk.includes(u.host)); // https OBRIGATÓRIO (host igual com http:// não passa)
    const localDev = u.protocol === "http:" && u.hostname === "localhost" && hostsOk.includes(u.host); // só quando AMBIENTE_DEV listou o localhost
    if (semCredencial && (httpsOficial || localDev)) r = u.toString();
  } catch { /* redirect inválido */ }
  if (!r && siteUrl) r = siteUrl;
  const q = `token=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(tipo)}${r ? `&redirect_to=${encodeURIComponent(r)}` : ""}`;
  return `${supabaseUrl.replace(/\/$/, "")}/auth/v1/verify?${q}`;
}

async function enviar(chave: string, de: string, para: string, m: { subject: string; html: string; text: string }, idem: string, limiteMs = 4000) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), limiteMs); // o hook do Supabase desiste em ~5 s: não deixar o envio pendurado
  let r: Response;
  try {
  r = await fetch("https://api.resend.com/emails", {
    signal: ctl.signal,
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json", "Idempotency-Key": idem },
    body: JSON.stringify({ from: de, to: [para], subject: m.subject, html: m.html, text: m.text, headers: { "X-Entity-Ref-ID": idem } }),
  });
  } catch (e) { throw new Error((e as Error).name === "AbortError" ? "resend_timeout" : "resend_rede"); } finally { clearTimeout(timer); }
  if (!r.ok) throw new Error(`resend_${r.status}`);
}

const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const falha = (status: number, msg: string) => resp(status, { error: { http_code: status, message: msg } });

export async function tratar(req: Request, env: (k: string) => string | undefined): Promise<Response> {
  if (req.method !== "POST") return falha(405, "metodo_invalido");
  if (Number(req.headers.get("content-length") || 0) > 20000) return falha(413, "corpo_grande"); // barra antes de ler o corpo
  const corpo = await req.text();
  if (corpo.length > 20000) return falha(413, "corpo_grande");
  const ok = await assinaturaValida(corpo, { id: req.headers.get("webhook-id"), ts: req.headers.get("webhook-timestamp"), sig: req.headers.get("webhook-signature") }, env("SEND_EMAIL_HOOK_SECRET") || "");
  if (!ok) { console.warn("auth-email: assinatura_invalida"); return falha(401, "assinatura_invalida"); } // só o evento, nunca o corpo
  const idWebhook = req.headers.get("webhook-id") || "";
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(idWebhook)) return falha(400, "webhook_id_invalido"); // vira Idempotency-Key (Resend: até 256)

  let p: any; try { p = JSON.parse(corpo); } catch { return falha(400, "json_invalido"); }
  const tipo = String(p?.email_data?.email_action_type || "");
  const email = String(p?.user?.email || "");
  if (!TIPOS.has(tipo)) return falha(400, "tipo_nao_suportado");
  const emailOk = (e: string) => /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(e) && e.length <= 254;
  if (!emailOk(email)) return falha(400, "email_invalido");
  const novoEmail = String(p?.user?.new_email || "");
  if (tipo === "email_change" && novoEmail && !emailOk(novoEmail)) return falha(400, "email_invalido");

  const chave = env("RESEND_API_KEY"); const supaUrl = env("SUPABASE_URL") || "";
  if (!chave || !/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(supaUrl)) return falha(500, "configuracao_incompleta"); // link de verificação só para o projeto Supabase (https)
  const dominio = env("EMAIL_DOMINIO") || DOMINIO_ENVIO;
  const siteUrl = (env("SITE_URL") || SITE_PADRAO).replace(/\/$/, "");
  const assets = (env("ASSET_BASE_URL") || ASSETS_PADRAO).replace(/\/$/, "");
  let hostAssets = ""; try { hostAssets = new URL(assets).host; } catch { /* inválido */ }
  let hostSite = ""; try { const s = new URL(siteUrl); if (s.protocol === "https:") hostSite = s.host; } catch { /* inválido */ }
  if (!dominioOficial(dominio) || !dominioOficial(hostAssets) || !dominioOficial(hostSite.split(":")[0])) return falha(500, "dominio_nao_oficial"); // barra configuração com domínio misturado
  const marca = { assets, nome: "Bipi Tech", suporte: "" };
  const dev = env("AMBIENTE_DEV") === "true"; // localhost só em desenvolvimento (nunca em produção)
  const hostsOk = [...(env("REDIRECT_HOSTS") || "").split(",").map((s) => s.trim()).filter(Boolean), ...(dev ? ["localhost:3000", "localhost:5173"] : [])];
  if (hostsOk.some((h) => !dominioOficial(h.split(":")[0]) && !(dev && h.startsWith("localhost")))) return falha(500, "redirect_nao_oficial");
  const validadeMin = Math.max(1, Number(env("LINK_VALIDADE_MIN")) || 60);
  // o nome vem do cadastro (controlado por quem cria a conta): sem quebra de linha/controle e sem endereços, no máx. 40 caracteres
  const nome = String(p?.user?.user_metadata?.nome || "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\S*(:\/\/|www\.|@)\S*/gi, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  const de = `Bipi Tech <${REMETENTE[tipo]}@${dominio}>`;
  const idem = idWebhook; // o Supabase repete o pedido com o mesmo id: o Resend ignora a repetição
  const ed = p.email_data;
  const limiteMs = Math.min(4500, Math.max(50, Number(env("RESEND_TIMEOUT_MS")) || 4000));

  if (tipo === "email_change" && env("EMAIL_CHANGE_ENABLED") !== "true") return falha(403, "troca_de_email_desabilitada"); // desligada até validar em ambiente de teste

  try {
    if (tipo === "reauthentication") {
      await enviar(chave, de, email, modelo("reauthentication", { nome, codigo: String(ed.token || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 12), validadeMin }, marca), idem, limiteMs);
    } else if (tipo === "email_change" && ed.token_hash_new && ed.token_hash) {
      // troca segura de e-mail: dois pedidos. Nomes INVERTIDOS no Supabase (confirmado na documentação):
      // token_hash_new → e-mail ATUAL (user.email); token_hash → e-mail NOVO (user.new_email).
      if (!novoEmail) return falha(400, "novo_email_ausente");
      await enviar(chave, de, email, modelo("email_change", { nome, link: linkDeVerificacao(supaUrl, ed.token_hash_new, tipo, ed.redirect_to, hostsOk, siteUrl), validadeMin }, marca), `${idem}-a`, limiteMs);
      await enviar(chave, de, novoEmail, modelo("email_change", { nome, link: linkDeVerificacao(supaUrl, ed.token_hash, tipo, ed.redirect_to, hostsOk, siteUrl), validadeMin }, marca), `${idem}-b`, limiteMs);
    } else if (tipo === "email_change") {
      // sem troca segura: um único e-mail, só para o endereço NOVO, usando token_hash. Qualquer outra combinação é recusada.
      if (!ed.token_hash || ed.token_hash_new || !novoEmail) return falha(400, "troca_email_combinacao_invalida");
      await enviar(chave, de, novoEmail, modelo("email_change", { nome, link: linkDeVerificacao(supaUrl, String(ed.token_hash), tipo, ed.redirect_to, hostsOk, siteUrl), validadeMin }, marca), idem, limiteMs);
    } else {
      const th = String(ed.token_hash || "");
      if (!th) return falha(400, "token_ausente");
      await enviar(chave, de, email, modelo(tipo as Tipo, { nome, link: linkDeVerificacao(supaUrl, th, tipo, ed.redirect_to, hostsOk, siteUrl), validadeMin }, marca), idem, limiteMs);
    }
  } catch (e) {
    console.error("auth-email falhou:", (e as Error).message); // só o código, sem dados do usuário
    return falha((e as Error).message === "resend_timeout" ? 504 : 502, "envio_falhou"); // nunca 2xx se o Resend não confirmou
  }
  return resp(200, {});
}

// @ts-ignore Deno (ausente no ambiente de teste)
if (typeof Deno !== "undefined" && (globalThis as any).Deno?.serve) Deno.serve((req: Request) => tratar(req, (k) => Deno.env.get(k)));

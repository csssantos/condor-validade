// Envio de push para o APK Android pelo Firebase Cloud Messaging (HTTP v1), sem dependências.
// Segredo: FCM_SERVICE_ACCOUNT = JSON da chave de serviço do projeto Firebase (só no Supabase → Edge Functions → Secrets).
// Usado por enviar-push e resumo-diario via import relativo ("../_compartilhado/fcm.ts"): o commit fixado no wrapper precisa conter este arquivo.
let conta: { client_email: string; private_key: string; project_id: string } | null = null;
let carregou = false;
let tokenAcesso: { valor: string; expira: number } | null = null;
let pedindo: Promise<string | null> | null = null; // uma só renovação por vez (disparo em massa não assina N vezes)

function lerConta() {
  if (carregou) return conta;
  carregou = true;
  try {
    const bruto = Deno.env.get("FCM_SERVICE_ACCOUNT") || "";
    if (!bruto) return null;
    const j = JSON.parse(bruto);
    if (j?.client_email && j?.private_key && j?.project_id) conta = { client_email: j.client_email, private_key: j.private_key, project_id: j.project_id };
  } catch { console.error("fcm: FCM_SERVICE_ACCOUNT inválido"); }
  return conta;
}
export const fcmAtivo = () => !!lerConta();

const b64url = (b: ArrayBuffer | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function chaveAssinatura(pem: string) {
  const corpo = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
function acesso(): Promise<string | null> {
  if (tokenAcesso && tokenAcesso.expira > Date.now() + 60_000) return Promise.resolve(tokenAcesso.valor);
  if (!pedindo) pedindo = renovar().finally(() => { pedindo = null; });
  return pedindo;
}
async function renovar(): Promise<string | null> {
  const c = lerConta(); if (!c) return null;
  const agora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const carga = b64url(JSON.stringify({ iss: c.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3300 }));
  const assin = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await chaveAssinatura(c.private_key), new TextEncoder().encode(`${cab}.${carga}`));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cab}.${carga}.${b64url(assin)}` }) });
  if (!r.ok) { console.error("fcm: token", r.status); return null; }
  const j = await r.json();
  tokenAcesso = { valor: String(j.access_token), expira: Date.now() + (Number(j.expires_in) || 3300) * 1000 };
  return tokenAcesso.valor;
}

export type ResultadoFcm = { ok: boolean; invalido: boolean };
/** payload no mesmo formato do Web Push (JSON com title, body, tag, data.url). Só texto: sem imagem remota. */
export async function enviarFcm(token: string, payloadJson: string): Promise<ResultadoFcm> {
  const c = lerConta(); if (!c) return { ok: false, invalido: false };
  try {
    const p = JSON.parse(payloadJson);
    const at = await acesso(); if (!at) return { ok: false, invalido: false };
    const url = typeof p?.data?.url === "string" && /^\/(?![\/\\])[\x21-\x7e]*$/.test(p.data.url) ? p.data.url : "/";
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, { method: "POST", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token,
        // SÓ dados (sem bloco "notification"): quem desenha o aviso é o BipiMessagingService do APK (cartão do Bipi).
        data: {
          titulo: String(p.title || "Bipi").replace(/^[^\p{L}\p{N}]+/u, "").slice(0, 120) || "Bipi",
          corpo: String(p.body || "").slice(0, 300),
          selo: String(p.selo || "").slice(0, 30), cor: /^(vermelho|ambar|azul|verde)$/.test(String(p.cor)) ? String(p.cor) : "azul",
          tag: p.tag ? String(p.tag).slice(0, 60) : "", url },
        android: { priority: "HIGH", ttl: "21600s" } } }) });
    if (r.ok) return { ok: true, invalido: false };
    const t = await r.text();
    if (r.status === 401) tokenAcesso = null; // token de acesso revogado: pede outro no próximo envio
    // só apaga o aparelho quando o Google diz que ESTE token morreu (UNREGISTERED ou token malformado);
    // 404 genérico (projeto errado, API desligada) NÃO apaga ninguém
    let codigo = "", msg = "", status = "";
    try { const e = JSON.parse(t)?.error; status = String(e?.status || ""); msg = String(e?.message || ""); codigo = JSON.stringify(e?.details || ""); } catch { /* corpo não é JSON */ }
    const invalido = /UNREGISTERED/.test(codigo) || (status === "INVALID_ARGUMENT" && /registration token/i.test(msg));
    if (!invalido) console.error("fcm: envio", r.status, t.slice(0, 200));
    return { ok: false, invalido };
  } catch (e) { console.error("fcm: falha", (e as Error)?.message); return { ok: false, invalido: false }; }
}

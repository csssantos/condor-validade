// Envio de push para o APK Android pelo Firebase Cloud Messaging (HTTP v1), sem dependências.
// Segredo: FCM_SERVICE_ACCOUNT = JSON da chave de serviço do projeto Firebase (só no Supabase → Edge Functions → Secrets).
// Cópia deste arquivo vive junto de cada função que envia push (função não importa de outra pasta no deploy por commit fixo:
// aqui o import relativo "../_compartilhado/fcm.ts" funciona porque o wrapper importa o commit inteiro).
let conta: { client_email: string; private_key: string; project_id: string } | null = null;
let carregou = false;
let tokenAcesso: { valor: string; expira: number } | null = null;

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
async function acesso(): Promise<string | null> {
  const c = lerConta(); if (!c) return null;
  if (tokenAcesso && tokenAcesso.expira > Date.now() + 60_000) return tokenAcesso.valor;
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
    const url = typeof p?.data?.url === "string" && p.data.url.startsWith("/") && !p.data.url.startsWith("//") ? p.data.url : "/";
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, { method: "POST", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token,
        notification: { title: String(p.title || "Bipi").slice(0, 120), body: String(p.body || "").slice(0, 300) },
        data: { url },
        android: { priority: "HIGH", ttl: "21600s", notification: { tag: p.tag ? String(p.tag).slice(0, 60) : undefined } } } }) });
    if (r.ok) return { ok: true, invalido: false };
    const t = await r.text();
    const invalido = r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*token|NOT_FOUND/i.test(t);
    if (!invalido) console.error("fcm: envio", r.status, t.slice(0, 200));
    return { ok: false, invalido };
  } catch (e) { console.error("fcm: falha", (e as Error)?.message); return { ok: false, invalido: false }; }
}

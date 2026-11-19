// Defesa em profundidade contra SSRF no Web Push: só envia para provedores de notificação conhecidos,
// e SEMPRE usa o endereço da coluna `endpoint` (validada no banco por `_push_endpoint_ok`), nunca o do JSON.
const HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
export function hostPushOk(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  if (!/^https:\/\/[a-z0-9.-]+(:443)?\/[^\s]*$/.test(endpoint)) return false;
  const host = /^https:\/\/([a-z0-9.-]+)/.exec(endpoint)![1];
  return HOSTS.has(host) || /^[a-z0-9-]+\.push\.services\.mozilla\.com$/.test(host) || /^[a-z0-9-]+\.push\.apple\.com$/.test(host) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
}
// Inscrição segura para o web-push: endereço da coluna + chaves do JSON (formato base64url e tamanho conferidos)
export function inscricaoWebPush(endpoint: string, subscription: any): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  if (!hostPushOk(endpoint)) return null;
  const k = subscription?.keys;
  const b64 = (v: unknown, min: number, max: number) => typeof v === "string" && v.length >= min && v.length <= max && /^[A-Za-z0-9_-]+={0,2}$/.test(v);
  if (!k || !b64(k.p256dh, 60, 120) || !b64(k.auth, 12, 40)) return null;
  return { endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}

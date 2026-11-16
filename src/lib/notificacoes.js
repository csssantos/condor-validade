// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { supabase } from "../supabaseClient";
import { LOJA_ID_ATIVA } from "./dados";

// ---------- Push de verdade (chega mesmo com o app fechado) ----------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function inscreverPush(usuario) {
  try {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
    const { data: au } = await supabase.auth.getUser();
    const base = { endpoint: sub.endpoint, subscription: sub.toJSON(), usuario: usuario || null, loja_id: LOJA_ID_ATIVA };
    if (!au?.user?.id) return;
    const { error: errPush } = await supabase.rpc("salvar_push", { p_endpoint: base.endpoint, p_subscription: base.subscription, p_usuario: base.usuario, p_loja: base.loja_id });
    if (errPush) console.error("Falha ao salvar push:", errPush.message);
  } catch (e) { console.error("Falha ao inscrever push:", e); }
}


// ---------- Push nativo do APK Android (FCM; 2026-11-15) ----------
// O APK é uma casca (Capacitor) que abre o app publicado. O Android WebView não tem Web Push nem a API Notification,
// então no APK a permissão e o registro passam pelo plugin nativo PushNotifications (carregado pela ponte do Capacitor,
// sem pacote no app). O token FCM é guardado na MESMA tabela `push_subscriptions`: endpoint "fcm:<token>" e subscription {"fcm": token}.
const ehNativo = () => { try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } };
function pluginPush() {
  try {
    const C = window.Capacitor;
    return C?.Plugins?.PushNotifications || C?.registerPlugin?.("PushNotifications") || null;
  } catch { return null; }
}
const normPerm = (r) => (r === "granted" ? "granted" : r === "denied" ? "denied" : "default");
async function permissaoPushNativa() {
  try { const P = pluginPush(); if (!P) return "unsupported"; return normPerm((await P.checkPermissions())?.receive); } catch { return "default"; }
}
async function pedirPermissaoPushNativa() {
  try { const P = pluginPush(); if (!P) return "unsupported"; return normPerm((await P.requestPermissions())?.receive); } catch { return "default"; }
}
let usuarioNativo = null;
let iniciandoOuvintes = null;
const avisarFalhaPush = (m) => { try { window.dispatchEvent(new CustomEvent("condor-aviso-erro", { detail: { mensagem: m } })); } catch { /* ok */ } };
function prepararOuvintesNativos(P) {
  if (!iniciandoOuvintes) {
    iniciandoOuvintes = (async () => {
      await P.addListener("registration", async (t) => {
        try {
          const token = String(t?.value || "");
          if (token.length < 20 || token.length > 400) return;
          const { data: au } = await supabase.auth.getUser();
          if (!au?.user?.id) return;
          const { error } = await supabase.rpc("salvar_push", { p_endpoint: "fcm:" + token, p_subscription: { fcm: token }, p_usuario: usuarioNativo, p_loja: LOJA_ID_ATIVA });
          if (error) { console.error("Falha ao salvar push nativo:", error.message); avisarFalhaPush("Não foi possível ativar os avisos neste aparelho. Confira a internet e toque no sino de novo."); }
        } catch (e) { console.error("push nativo:", e); avisarFalhaPush("Não foi possível ativar os avisos neste aparelho. Confira a internet e toque no sino de novo."); }
      });
      await P.addListener("registrationError", (e) => { console.error("Falha ao registrar push nativo:", e?.error || e); avisarFalhaPush("Não foi possível ativar os avisos neste aparelho. Confira a internet e toque no sino de novo."); });
      await P.addListener("pushNotificationActionPerformed", (a) => { // toque no aviso: abre o produto/tela indicado (só caminhos do próprio app)
        try {
          const u = String(a?.notification?.data?.url || "");
          if (u.startsWith("/") && !u.startsWith("//") && !u.includes("\\")) window.location.assign(window.location.origin + u);
        } catch { /* ok */ }
      });
    })().catch((e) => { iniciandoOuvintes = null; throw e; }); // se falhar, a próxima tentativa refaz
  }
  return iniciandoOuvintes;
}
/** registra o aparelho no FCM e grava o token pelo servidor (RPC salvar_push); precisa de permissão já concedida */
async function inscreverPushNativo(usuario) {
  try {
    const P = pluginPush(); if (!P) return;
    usuarioNativo = usuario || null;
    await prepararOuvintesNativos(P); // os ouvintes existem ANTES do register (o evento do token não se perde)
    await P.register();
  } catch (e) { console.error("Falha ao inscrever push nativo:", e); }
}
// ---------- Desligar notificações neste aparelho (2026-11-16) ----------
// A permissão do sistema continua concedida; quem desliga é o app: tira a inscrição do aparelho (o servidor apaga a linha
// no próximo envio, quando o serviço de push responde "inscrição inválida") e guarda a escolha para não registrar de novo.
// A escolha vale POR PESSOA (chave com o id da conta): quem entra depois no mesmo aparelho não herda o "desligado".
const chaveNotifOff = (uid) => `avdc_notif_off:${uid}`;
function notifDesligadas(uid) { if (!uid) return false; try { return localStorage.getItem(chaveNotifOff(uid)) === "1"; } catch { return false; } }
function definirNotifDesligadas(uid, v) { if (!uid) return; try { if (v) localStorage.setItem(chaveNotifOff(uid), "1"); else localStorage.removeItem(chaveNotifOff(uid)); } catch { /* sem armazenamento */ } }
async function desativarPushDoAparelho() {
  try {
    if (ehNativo()) { await desinscreverPushNativo(); return; }
    const reg = await navigator.serviceWorker?.ready;
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (e) { console.error("Falha ao desligar push:", e); }
}
/** ao sair da conta: apaga o token do aparelho para não receber avisos da pessoa anterior */
async function desinscreverPushNativo() {
  try { const P = pluginPush(); if (!P) return; await P.unregister(); } catch { /* ok */ }
}

// ---------- Só notificações FUTURAS (2026-11-13) ----------
// Antes, a lista de "já avisados" era uma só por aparelho: conta nova, aparelho novo ou notificação recém-ativada
// disparava de uma vez TUDO que já estava no prazo (notificação tardia). Agora cada pessoa tem a sua lista e,
// na primeira vez (sem "linha de base"), tudo que já existe é registrado em silêncio; só o que mudar depois avisa.
const chaveListaNotif = (uid, loja) => `condor-validade:notificados:${uid}${loja ? ":" + loja : ""}`;
const chaveBaseNotif = (uid, loja) => `condor-validade:notif-base:${uid}${loja ? ":" + loja : ""}`;
/** apaga lista e base da pessoa (todas as lojas) — ao sair ou ao perder a permissão */
function limparNotifDaPessoa(uid, apenasBase = false) {
  if (!uid) return;
  try {
    const apagar = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith(`condor-validade:notif-base:${uid}`) || (!apenasBase && k.startsWith(`condor-validade:notificados:${uid}`))) apagar.push(k);
    }
    apagar.forEach((k) => localStorage.removeItem(k));
  } catch { /* sem armazenamento */ }
}
const chaveNotifItem = (item, nivel) => `${item.id}:${nivel}`;
/** items já filtrados por precisaNotificar: [{ chave }]. Devolve o que avisar agora e o que só marcar. */
function planejarNotificacoes({ candidatos, jaAvisadas, temBase }) {
  const vistas = new Set(jaAvisadas || []);
  const novos = (candidatos || []).filter((c) => !vistas.has(c.chave));
  if (!temBase) return { avisar: [], marcar: novos.map((c) => c.chave), criarBase: true };
  return { avisar: novos, marcar: novos.map((c) => c.chave), criarBase: false };
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

// ---------- Notificações "bonitas" (usa o Service Worker quando disponível, com ícone/imagem/ações) ----------
async function dispararNotificacao(titulo, { corpo, icone, imagem, tag, dados } = {}) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const opcoes = {
    body: corpo,
    icon: icone || "/icon-192.png",
    badge: "/icon-192.png",
    tag: tag,
    renotify: true,
    vibrate: [80, 40, 80],
    data: dados || {},
    ...(imagem ? { image: imagem } : {}),
    actions: [
      { action: "ver", title: "Ver produto" },
      { action: "fechar", title: "Dispensar" }
    ]
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) { await reg.showNotification(titulo, opcoes); return; }
    }
  } catch {}
  try { new Notification(titulo, opcoes); } catch {}
}

async function buscarProdutoPorCodigo(barcode) {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?lc=pt&fields=product_name,product_name_pt,brands,image_front_small_url,image_small_url`
    );
    const data = await res.json();
    if (data && data.status === 1 && data.product) {
      const p = data.product;
      const nomeBase = p.product_name_pt || p.product_name || "";
      if (nomeBase) {
        const marca = (p.brands || "").split(",")[0].trim();
        const nomeFinal = marca && !nomeBase.toLowerCase().includes(marca.toLowerCase()) ? `${marca} - ${nomeBase}` : nomeBase;
        return { nome: nomeFinal, foto: p.image_front_small_url || p.image_small_url || null };
      }
    }
  } catch {}
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`);
    const data = await res.json();
    if (data && data.status === 1 && data.product) {
      const p = data.product;
      const nome = p.product_name_pt || p.product_name || p.generic_name || "";
      if (nome) return { nome, foto: p.image_front_small_url || p.image_small_url || null };
    }
  } catch {}
  return null;
}

export { notifDesligadas, definirNotifDesligadas, desativarPushDoAparelho, buscarProdutoPorCodigo, limparNotifDaPessoa, chaveBaseNotif, chaveNotifItem, planejarNotificacoes, chaveListaNotif, dispararNotificacao, inscreverPush, ehNativo, permissaoPushNativa, pedirPermissaoPushNativa, inscreverPushNativo, desinscreverPushNativo, isIOS, isStandalone, urlBase64ToUint8Array };

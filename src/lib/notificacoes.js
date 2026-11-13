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

// ---------- Só notificações FUTURAS (2026-11-13) ----------
// Antes, a lista de "já avisados" era uma só por aparelho: conta nova, aparelho novo ou notificação recém-ativada
// disparava de uma vez TUDO que já estava no prazo (notificação tardia). Agora cada pessoa tem a sua lista e,
// na primeira vez (sem "linha de base"), tudo que já existe é registrado em silêncio; só o que mudar depois avisa.
const chaveListaNotif = (uid) => `condor-validade:notificados:${uid}`;
const chaveBaseNotif = (uid) => `condor-validade:notif-base:${uid}`;
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

export { buscarProdutoPorCodigo, chaveBaseNotif, chaveNotifItem, planejarNotificacoes, chaveListaNotif, dispararNotificacao, inscreverPush, isIOS, isStandalone, urlBase64ToUint8Array };

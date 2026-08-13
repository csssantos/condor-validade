const CACHE_NAME = "condor-validade-v5";
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Estratégia: network-first para navegação/API, cache-first pra estáticos.
// Assim o app abre offline (última versão salva) mas prioriza dados atualizados do Supabase quando há internet.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin.includes("supabase.co")) return; // nunca cachear chamadas ao Supabase

  event.respondWith(
    fetch(request)
      .then((resp) => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, respClone)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
  );
});

// Recebe o push de verdade (mandado pela Edge Function enviar-push) e exibe a notificação com som/vibração
self.addEventListener("push", (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch { dados = { title: "Condor · Alerta de Validade", body: event.data ? event.data.text() : "" }; }
  const titulo = dados.title || "Condor · Alerta de Validade";
  const opcoes = {
    body: dados.body,
    icon: dados.icon || "/icon-192.png",
    badge: "/icon-192.png",
    image: dados.image,
    tag: dados.tag,
    renotify: true,
    vibrate: [100, 50, 100, 50, 200],
    data: dados.data || {},
    actions: [
      { action: "ver", title: "Ver produto" },
      { action: "fechar", title: "Dispensar" }
    ]
  };
  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

// Clique na notificação (ou em uma das ações "Ver produto" / "Dispensar"): foca ou abre o app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "fechar") return;
  const urlAlvo = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlAlvo);
    })
  );
});
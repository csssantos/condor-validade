const CACHE_NAME = "condor-validade-v4";
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

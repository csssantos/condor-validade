// Condor · Alerta de Validade — service worker v7.1
// Modelo de atualização: o app instalado SEMPRE abre a versão que está em cache (rápido e funciona offline).
// Quem descobre que existe versão nova é o próprio app (compara com o que está publicado) e mostra o aviso
// "Atualizar". Só quando a pessoa toca no botão o app baixa a versão nova para o cache e reinicia.
// Este arquivo NUNCA troca a versão sozinho.
const CACHE_SHELL = "condor-shell-v10";
const CACHE_ASSETS = "condor-assets-v10";

function assetsDoHtml(html) {
  const achados = new Set();
  const re = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) achados.add(m[1]);
  return Array.from(achados);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cacheShell = await caches.open(CACHE_SHELL);
      if (!(await cacheShell.match("/index.html"))) {
        const resp = await fetch("/index.html", { cache: "reload" });
        if (resp.ok) {
          const html = await resp.clone().text();
          const cacheAssets = await caches.open(CACHE_ASSETS);
          await Promise.all(assetsDoHtml(html).map(async (u) => {
            const r = await fetch(u, { cache: "reload" });
            if (r.ok) await cacheAssets.put(u, r);
          }));
          await cacheShell.put("/index.html", resp.clone());
          await cacheShell.put("/", resp);
        }
      }
    } catch {}
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_SHELL && n !== CACHE_ASSETS).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, fontes etc.: direto na rede

  // Abrir o app (navegação): serve a versão já instalada. Sem cache ainda → rede.
  // Só a ABERTURA do app (navegação) usa a versão guardada. Consultas do próprio app ao /index.html (checagem de
  // versão nova) precisam ir direto à rede, senão sempre enxergariam a versão antiga.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cacheShell = await caches.open(CACHE_SHELL);
      const guardado = await cacheShell.match("/index.html");
      if (guardado) return guardado;
      try {
        const resp = await fetch(request);
        if (resp.ok) { cacheShell.put("/index.html", resp.clone()).catch(() => {}); }
        return resp;
      } catch { return new Response("Sem conexão", { status: 503 }); }
    })());
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") return; // consulta de versão do app: rede direta, sem cache

  // Arquivos do app (hash no nome, nunca mudam): cache primeiro.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cacheAssets = await caches.open(CACHE_ASSETS);
      const guardado = await cacheAssets.match(url.pathname);
      if (guardado) return guardado;
      try {
        const resp = await fetch(request);
        if (resp.ok) cacheAssets.put(url.pathname, resp.clone()).catch(() => {});
        else if (resp.status === 404) caches.delete(CACHE_SHELL); // casca apontava para arquivo que não existe mais → próxima abertura busca a versão atual
        return resp;
      } catch { return new Response("", { status: 504 }); }
    })());
    return;
  }

  // Resto (manifest, ícones): rede primeiro, cache como reserva.
  event.respondWith(
    fetch(request).then((resp) => {
      if (resp.ok) { const c = resp.clone(); caches.open(CACHE_SHELL).then((ca) => ca.put(request, c)).catch(() => {}); }
      return resp;
    }).catch(() => caches.match(request).then((c) => c || new Response("", { status: 504 })))
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
    requireInteraction: !!dados.requireInteraction,
    vibrate: dados.requireInteraction ? [150, 60, 150, 60, 150, 60, 250] : [100, 50, 100, 50, 200],
    data: dados.data || {},
    actions: [
      { action: "ver", title: "Ver produto" },
      { action: "fechar", title: "Dispensar" }
    ]
  };
  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

// Clique na notificação (ou em uma das ações "Ver produto" / "Dispensar"): abre o app direto no produto
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "fechar") return;
  const dadosNotif = event.notification.data || {};
  const produtoId = dadosNotif.itemId;
  const urlAlvo = produtoId ? `/?produto=${produtoId}` : (dadosNotif.url || "/");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          // Se o navegador suporta navigate(), leva a aba já aberta direto pro produto.
          if ("navigate" in client) {
            return client.navigate(urlAlvo).then((c) => (c ? c.focus() : client.focus())).catch(() => client.focus());
          }
          // iOS/Safari não suporta navigate() em Window client: avisa o app já aberto por mensagem.
          client.postMessage({ type: "abrirProduto", produtoId, url: urlAlvo });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlAlvo);
    })
  );
});

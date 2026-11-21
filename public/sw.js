// Bipi Validade — service worker v10.1
// Modelo de atualização: o app instalado SEMPRE abre a versão que está em cache (rápido e funciona offline).
// Quem descobre que existe versão nova é o próprio app (compara com o que está publicado) e mostra o aviso
// "Atualizar". Só quando a pessoa toca no botão o app baixa a versão nova para o cache e reinicia.
// Este arquivo NUNCA troca a versão sozinho.
const CACHE_SHELL = "condor-shell-v10";
const CACHE_ASSETS = "condor-assets-v10";
// Fotos de produto (nome de arquivo = hash do conteúdo, nunca muda): guardadas para abrir offline. Cache à parte e SEM versão de casca:
// trocar CACHE_SHELL/CACHE_ASSETS não apaga as fotos. O app (lib/pacoteOffline.js) usa o MESMO nome.
const CACHE_FOTOS = "condor-fotos-v1";
const MAX_FOTOS = 800;
// Versões antigas do APP gravavam a atualização em caches "v7" (nome diferente do deste arquivo), então o botão
// "Atualizar" baixava e recarregava na versão velha, em loop. Aqui o SW passa a adotar o que o app antigo gravou.
const LEGADO_SHELL = "condor-shell-v7";
const LEGADO_ASSETS = "condor-assets-v7";
async function adotarAtualizacaoLegada() {
  try {
    if (!(await caches.has(LEGADO_SHELL))) return null;
    const velhoShell = await caches.open(LEGADO_SHELL);
    const html = await velhoShell.match("/index.html");
    if (!html) { await caches.delete(LEGADO_SHELL); await caches.delete(LEGADO_ASSETS); return null; }
    const cacheShell = await caches.open(CACHE_SHELL);
    const cacheAssets = await caches.open(CACHE_ASSETS);
    if (await caches.has(LEGADO_ASSETS)) {
      const velhoAssets = await caches.open(LEGADO_ASSETS);
      for (const req of await velhoAssets.keys()) { const r = await velhoAssets.match(req); if (r) await cacheAssets.put(req, r); }
    }
    await cacheShell.put("/index.html", html.clone());
    await cacheShell.put("/", html.clone());
    await caches.delete(LEGADO_SHELL); await caches.delete(LEGADO_ASSETS);
    return html;
  } catch { return null; }
}

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
    adotarAtualizacaoLegada().then(() => caches.keys()).then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_SHELL && n !== CACHE_ASSETS && n !== CACHE_FOTOS).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

const HOST_SUPABASE = "fbovltxucooeoldjfckk.supabase.co";
let diretoBloqueadoAte = 0; // depois de uma falha, as próximas fotos vão direto pelo caminho do app por 10 min
// a cópia da resposta é feita AGORA (antes de devolver o corpo à página) e o service worker é mantido vivo até gravar
function guardarEmSegundoPlano(event, url, r) {
  try { const p = guardarFoto(url, r.clone()); if (event && event.waitUntil) event.waitUntil(p); } catch { /* corpo já usado: só não guarda */ }
}
async function guardarFoto(url, resp) {
  try {
    if (!resp || !resp.ok || resp.type === "opaque") return;
    if (!/^image\//i.test(resp.headers.get("content-type") || "")) return; // página de bloqueio da rede (HTML com status 200) nunca vira "foto"
    const c = await caches.open(CACHE_FOTOS);
    await c.put(url.origin + url.pathname, resp);
    const chaves = await c.keys();
    if (chaves.length > MAX_FOTOS) for (const k of chaves.slice(0, chaves.length - MAX_FOTOS)) await c.delete(k);
  } catch { /* sem espaço: a foto só não fica guardada */ }
}
async function buscarFoto(request, url, event) {
  try { // já guardada (pacote offline ou visita anterior): abre na hora, com ou sem internet
    const c = await caches.open(CACHE_FOTOS);
    const g = await c.match(url.origin + url.pathname);
    if (g) return g;
  } catch { /* segue para a rede */ }
  const pelaCasa = () => fetch(`${self.location.origin}/supa${url.pathname}${url.search}`, { mode: request.mode === "cors" ? "cors" : "same-origin" });
  if (Date.now() < diretoBloqueadoAte) { try { const r = await pelaCasa(); guardarEmSegundoPlano(event, url, r); return r; } catch { /* tenta o direto abaixo */ } }
  try {
    // <img> sem crossOrigin pede em "no-cors" (resposta opaca, que não dá para guardar): refaz como CORS (o Storage público libera) e devolve a resposta normal
    const pedido = new Request(url.href, { mode: "cors", credentials: "omit" });
    const r = await Promise.race([
      fetch(pedido),
      new Promise((_, rej) => setTimeout(() => rej(new Error("sem_resposta")), 6000)),
    ]);
    guardarEmSegundoPlano(event, url, r);
    return r;
  } catch {
    diretoBloqueadoAte = Date.now() + 10 * 60 * 1000;
    try { const r = await pelaCasa(); guardarEmSegundoPlano(event, url, r); return r; } catch { return new Response("", { status: 504 }); }
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Fotos de produto (Storage do Supabase): em rede que bloqueia o Supabase (ex.: rede da empresa) pedem pelo caminho /supa do próprio app
  // (a Vercel repassa; ver vercel.json). Se o direto funciona, nada muda; se falhar ou não responder em 6 s, usa o caminho do app.
  if (url.hostname === HOST_SUPABASE && request.destination === "image" && url.pathname.startsWith("/storage/v1/object/public/")) {
    event.respondWith(buscarFoto(request, url, event));
    return;
  }
  if (url.origin !== self.location.origin) return; // Supabase, fontes etc.: direto na rede

  // Abrir o app (navegação): serve a versão já instalada. Sem cache ainda → rede.
  // Só a ABERTURA do app (navegação) usa a versão guardada. Consultas do próprio app ao /index.html (checagem de
  // versão nova) precisam ir direto à rede, senão sempre enxergariam a versão antiga.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const adotado = await adotarAtualizacaoLegada(); // atualização feita por versão antiga do app (caches v7)
      if (adotado) return adotado;
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

  if (url.pathname.startsWith("/supa/")) return; // chamadas à API pelo caminho do app: direto na rede, NUNCA no cache
  if (url.pathname === "/" || url.pathname === "/index.html") return; // consulta de versão do app: rede direta, sem cache

  // Arquivos do app (hash no nome, nunca mudam): cache primeiro.
  // Inclui os pedaços carregados sob demanda (PDF, planilha, gráficos): entram no cache na 1ª vez que alguém usa (precisa de internet nessa vez).
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
  try { dados = event.data ? event.data.json() : {}; } catch { dados = { title: "Bipi Validade", body: event.data ? event.data.text() : "" }; }
  const titulo = dados.title || "Bipi Validade";
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
  const urlSegura = typeof dadosNotif.url === "string" && /^\/(?![\/\\])/.test(dadosNotif.url) ? dadosNotif.url : "/"; // só caminho do próprio app
  const urlAlvo = produtoId ? `/?produto=${encodeURIComponent(produtoId)}` : urlSegura;

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

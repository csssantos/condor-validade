// Pacote offline: baixa de uma vez o que o app precisa para abrir e funcionar sem internet.
//  1) o programa (arquivos do app, inclusive os pedaços de PDF/planilha/gráficos/leitor, que antes só entravam no cache no 1º uso);
//  2) as fotos dos produtos da loja (cache de fotos do sw.js);
//  3) os dados da loja (catálogo, lotes, histórico), que o app já guarda no aparelho em SNAPSHOT_KEY.
// Tudo é por PESSOA neste aparelho; sair da conta apaga a marca (e o instantâneo de dados já é apagado pelo app).
import { CACHE_FOTOS_NOME } from "./constantes";

const CHAVE_PREFIXO = "condor-validade:pacote-offline:";
const HOST_FOTOS = "fbovltxucooeoldjfckk.supabase.co";
const CAMINHO_FOTOS = "/storage/v1/object/public/";
const MAX_ARQUIVOS_PROGRAMA = 120;
const MAX_FOTOS = 600;
const PRAZO_MS = 20000;
const buscar = (u, opc) => fetch(u, { ...(opc || {}), signal: AbortSignal.timeout(PRAZO_MS) });

const lerMarca = (uid) => { try { return JSON.parse(localStorage.getItem(CHAVE_PREFIXO + uid) || "null"); } catch { return null; } };
export function pacoteBaixado(uid) { return !!uid && !!lerMarca(uid)?.em; }
export function dataDoPacote(uid) { const m = uid ? lerMarca(uid) : null; return m?.em ? new Date(m.em) : null; }
export function esquecerPacote(uid) { try { if (uid) localStorage.removeItem(CHAVE_PREFIXO + uid); } catch { /* sem armazenamento */ } }
function gravarMarca(uid, extra) { try { localStorage.setItem(CHAVE_PREFIXO + uid, JSON.stringify({ em: Date.now(), ...extra })); } catch { /* sem armazenamento */ } }

// links de foto do nosso armazenamento (a única origem que o app guarda offline; links do Open Food Facts ficam de fora)
export function fotosDoPacote(listas) {
  const vistos = new Set();
  for (const lista of listas) {
    for (const x of Array.isArray(lista) ? lista : Object.values(lista || {})) {
      const f = x && x.foto;
      if (typeof f !== "string" || !f.startsWith("https://")) continue;
      try { const u = new URL(f); if (u.hostname === HOST_FOTOS && u.pathname.startsWith(CAMINHO_FOTOS)) vistos.add(u.origin + u.pathname); } catch { /* link inválido */ }
      if (vistos.size >= MAX_FOTOS) return [...vistos];
    }
  }
  return [...vistos];
}

// arquivos citados por um texto de página ou de script do app (/assets/nome-hash.js|css)
export function arquivosCitados(texto) {
  const achados = new Set();
  // só nomes entre aspas ("assets/x.js" na lista de dependências do Vite ou src/href do HTML): evita pegar texto solto de bibliotecas
  const re = /["'(]\/?(assets\/[A-Za-z0-9_.\-]+\.(?:js|css))["')]/g;
  let m;
  while ((m = re.exec(String(texto || "")))) achados.add("/" + m[1]);
  return [...achados];
}

async function listarPrograma() {
  const fila = []; const vistos = new Set();
  const r = await buscar("/index.html", { cache: "no-store" });
  if (!r.ok) throw new Error("programa_indisponivel");
  const html = await r.text();
  for (const u of arquivosCitados(html)) { if (!vistos.has(u)) { vistos.add(u); fila.push(u); } }
  // os pedaços carregados sob demanda aparecem dentro do arquivo principal (lista de dependências do Vite): 1 nível basta
  for (const u of fila.filter((x) => x.endsWith(".js")).slice(0, 6)) {
    try {
      const t = await (await buscar(u)).text();
      for (const v of arquivosCitados(t)) { if (!vistos.has(v) && vistos.size < MAX_ARQUIVOS_PROGRAMA) { vistos.add(v); fila.push(v); } }
    } catch { /* arquivo some: segue */ }
  }
  return fila.slice(0, MAX_ARQUIVOS_PROGRAMA);
}

async function emLotes(itens, paralelo, fazer) {
  let i = 0;
  const trabalhadores = Array.from({ length: Math.min(paralelo, itens.length) }, async () => {
    while (i < itens.length) { const meu = itens[i++]; await fazer(meu); }
  });
  await Promise.all(trabalhadores);
}

// a foto é pedida como IMAGEM (o service worker intercepta, usa o caminho do app se o direto estiver bloqueado e guarda no cache)
function carregarFoto(url) {
  return new Promise((ok) => {
    const img = new Image(); let fim = false;
    const terminar = (v) => { if (fim) return; fim = true; img.onload = img.onerror = null; ok(v); };
    img.onload = () => terminar(true); img.onerror = () => terminar(false);
    setTimeout(() => terminar(false), 15000);
    img.src = url;
  });
}

export async function jaTemFoto(url) {
  try { const c = await caches.open(CACHE_FOTOS_NOME); return !!(await c.match(url)); } catch { return false; }
}

// onProgresso({ fase: "programa"|"fotos"|"dados", feitos, total })  (feitos/total = andamento GERAL: programa + fotos que faltam)
// Devolve { programa, fotos, fotosTotal, completo }; só marca o pacote como baixado se o PROGRAMA veio inteiro.
export async function baixarPacote({ uid, catalogo, itens, historico, onProgresso, sinal }) {
  if (!uid) throw new Error("sem_sessao");
  const cancelado = () => !!(sinal && sinal.cancelado);
  const fila = await listarPrograma();
  const todas = fotosDoPacote([catalogo, itens, historico]);
  const poucoDados = !!(typeof navigator !== "undefined" && navigator.connection && navigator.connection.saveData); // "economia de dados" ligada: só o programa
  const faltam = [];
  if (!poucoDados) for (const u of todas) { if (!(await jaTemFoto(u))) faltam.push(u); }
  const total = fila.length + faltam.length; let feitos = 0;
  const avisar = (fase) => { try { onProgresso && onProgresso({ fase, feitos, total }); } catch { /* tela fechou */ } };
  avisar("programa");
  let programaOk = 0;
  await emLotes(fila, 4, async (u) => {
    if (cancelado()) return;
    try { const r = await buscar(u); if (r.ok) programaOk++; } catch { /* um arquivo a menos */ }
    feitos++; avisar("programa");
  });
  let fotosNovas = 0;
  await emLotes(faltam, 4, async (u) => {
    if (cancelado()) return;
    if (await carregarFoto(u) && await jaTemFoto(u)) fotosNovas++; // só conta se a foto realmente ficou guardada
    feitos++; avisar("fotos");
  });
  avisar("dados");
  const fotos = (todas.length - faltam.length) + fotosNovas;
  const completo = fila.length > 0 && programaOk >= fila.length && !cancelado();
  if (completo) gravarMarca(uid, { programa: programaOk, fotos, fotosTotal: todas.length });
  return { programa: programaOk, programaTotal: fila.length, fotos, fotosTotal: todas.length, completo, poucoDados };
}

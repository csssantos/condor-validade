// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { motion } from "framer-motion";
import { Sparkles, RefreshCw } from "lucide-react";
import { FUNDO_MARCA } from "../TelasEntrada";
import { BLUE_DARK, RED } from "../lib/constantes";

// ============ Atualização do app (versão nova publicada no Vercel) ============
// O service worker serve SEMPRE a versão já instalada (cache) e o app compara, em segundo plano, com o que
// está publicado. Se for diferente, aparece o aviso; só quando a pessoa toca em "Atualizar" o app baixa a
// versão nova (com barra de progresso), troca o cache e reinicia. Nunca atualiza sozinho.
// ATENÇÃO: estes nomes TÊM de ser iguais aos de public/sw.js (o SW só lê estes caches). Ao trocar um, troque o outro.
const CACHE_SHELL = "condor-shell-v10";

const CACHE_ASSETS = "condor-assets-v10";

function assetsDoDocumento(doc) {
  return Array.from(doc.querySelectorAll("script[src], link[href]"))
    .map((el) => { try { return new URL(el.getAttribute("src") || el.getAttribute("href"), window.location.origin).pathname; } catch { return null; } })
    .filter((u) => u && u.startsWith("/assets/"))
    .sort();
}

async function buscarVersaoPublicada() {
  const atuais = assetsDoDocumento(document);
  if (!atuais.length) return null; // modo desenvolvimento: sem build, nada a comparar
  const resp = await fetch(`/index.html?__v=${Date.now()}`, { cache: "no-store", signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
  if (!resp.ok) throw new Error("index indisponível"); // erro de rede/deploy NÃO é "sem versão nova": quem chama decide (null = igual à que roda)
  const html = await resp.text();
  const novos = assetsDoDocumento(new DOMParser().parseFromString(html, "text/html"));
  if (!novos.length) throw new Error("resposta que não é o app"); // ex.: página de erro
  if (novos.join("|") === atuais.join("|")) return null;
  return { html, assets: novos, assinatura: novos.join("|") };
}

async function baixarVersaoNova(versao, aoProgredir) {
  if (!("caches" in window)) { aoProgredir(1); return; }
  const cacheAssets = await caches.open(CACHE_ASSETS);
  const total = versao.assets.length;
  for (let i = 0; i < total; i++) {
    const url = versao.assets[i];
    if (await cacheAssets.match(url)) { aoProgredir(((i + 1) / total) * 0.95); continue; } // nome tem hash: arquivo já guardado não muda
    const resp = await fetch(url, { cache: "reload" });
    if (!resp.ok) throw new Error(`Falha ao baixar ${url}`);
    const tamanho = Number(resp.headers.get("content-length")) || 0;
    const partes = []; let lido = 0;
    if (resp.body && resp.body.getReader) {
      const leitor = resp.body.getReader();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        partes.push(value); lido += value.length;
        const fracao = tamanho ? Math.min(0.98, lido / (tamanho * 3)) : 0.5; // tamanho vem comprimido; lido, não
        aoProgredir(((i + fracao) / total) * 0.95);
      }
    } else { partes.push(new Uint8Array(await resp.arrayBuffer())); }
    await cacheAssets.put(url, new Response(new Blob(partes), { headers: { "content-type": resp.headers.get("content-type") || "application/octet-stream" } }));
    aoProgredir(((i + 1) / total) * 0.95);
  }
  // só agora troca a "casca" do app: se algo acima falhar, a versão antiga continua intacta
  const cacheShell = await caches.open(CACHE_SHELL);
  const htmlResp = () => new Response(versao.html, { headers: { "content-type": "text/html; charset=utf-8" } });
  await cacheShell.put("/index.html", htmlResp());
  await cacheShell.put("/", htmlResp());
  const manter = new Set(versao.assets);
  for (const req of await cacheAssets.keys()) { if (!manter.has(new URL(req.url).pathname)) await cacheAssets.delete(req); }
  aoProgredir(1);
}

// ============ Banner "Nova versão disponível" — aparece na hora, sem precisar fechar o app ============
function NovaVersaoBanner({ T, estado, progresso, erro, onAtualizar, onFechar, solto }) {
  const baixando = estado === "baixando";
  const pct = Math.round((progresso || 0) * 100);
  return (
    <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
      className={`fixed ${solto ? "bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-0 right-0" : "bottom-[calc(env(safe-area-inset-bottom)*0.12+5.4rem)] lg:bottom-6 left-0 right-0 lg:left-64"} z-[70] px-3`}>
      <div style={{ background: BLUE_DARK }} className="max-w-md mx-auto rounded-2xl px-4 py-3 shadow-lg shadow-black/20">
        <div className="flex items-center gap-3">
          <Sparkles size={18} color="#fff" className="shrink-0" />
          <p className="text-white text-xs font-medium flex-1">
            {baixando ? (pct >= 100 ? "Pronto! Reiniciando o app…" : `Baixando a atualização… ${pct}%`) : erro ? "Não deu pra baixar a atualização. Tente de novo." : "Tem uma versão nova do app. Atualizar agora?"}
          </p>
          {!baixando && !solto && <button onClick={onFechar} className="text-white/70 text-[11px] font-medium shrink-0 px-1">Depois</button>}
          {!baixando && <button onClick={onAtualizar} style={{ background: "#fff", color: BLUE_DARK }} className="text-[11px] font-bold px-3 py-1.5 rounded-full shrink-0">{erro ? "Tentar de novo" : "Atualizar"}</button>}
        </div>
        {baixando && (
          <div className="h-1.5 rounded-full bg-white/20 mt-2.5 overflow-hidden">
            <div style={{ width: `${pct}%`, background: "#fff", transition: "width .25s ease" }} className="h-full rounded-full" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Depois de tocar em "Depois": fica um ícone de atualização pendente ao lado do sino; ao tocar, o aviso de atualizar volta.
function BotaoAtualizacao({ onClick, claro }) {
  return (
    <motion.button type="button" onClick={onClick} initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.88 }} aria-label="Há uma atualização do app. Toque para atualizar." title="Atualização disponível"
      className="relative h-9 w-9 rounded-2xl flex items-center justify-center shrink-0"
      style={claro ? { background: "#fff", color: BLUE_DARK } : { background: BLUE_DARK, color: "#fff" }}>
      <RefreshCw size={16} />
      <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3"><span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ background: RED, opacity: 0.6 }} /><span className="relative inline-flex h-3 w-3 rounded-full border-2" style={{ background: RED, borderColor: claro ? "#fff" : BLUE_DARK }} /></span>
    </motion.button>
  );
}

// Deslogado: não dá pra entrar com o app velho. Tela cheia por cima do login até atualizar.
function AtualizacaoObrigatoria({ logo, estado, progresso, erro, onAtualizar }) {
  const baixando = estado === "baixando";
  const pct = Math.round((progresso || 0) * 100);
  return (
    <div role="dialog" aria-modal="true" aria-label="Atualização necessária" className="fixed inset-0 z-[80] flex flex-col items-center justify-center px-8 text-center text-white" style={{ background: FUNDO_MARCA }}>
      <div className="bg-white rounded-2xl px-6 py-4 shadow-xl shadow-black/25"><img src={logo} alt="Condor" className="h-9 w-auto" /></div>
      <Sparkles size={30} color="#fff" className="mt-8" />
      <h1 className="text-[24px] font-extrabold mt-3">Nova versão disponível</h1>
      <p className="text-[14px] text-white/80 mt-2 max-w-xs">Para entrar no app, atualize primeiro. É rapidinho.</p>
      {erro && !baixando && <p className="text-[12.5px] mt-3 font-semibold" style={{ color: "#FFD27A" }}>Não deu pra baixar. Confira a internet e tente de novo.</p>}
      {baixando ? (
        <div className="w-full max-w-xs mt-7">
          <p className="text-[13px] font-semibold">{pct >= 100 ? "Pronto! Reiniciando…" : `Baixando… ${pct}%`}</p>
          <div className="h-2 rounded-full bg-white/20 mt-2 overflow-hidden"><div className="h-full rounded-full bg-white" style={{ width: `${pct}%`, transition: "width .25s ease" }} /></div>
        </div>
      ) : (
        <button onClick={onAtualizar} className="mt-7 bg-white font-extrabold text-[15px] px-9 py-3.5 rounded-2xl shadow-lg" style={{ color: BLUE_DARK }}>{erro ? "Tentar de novo" : "Atualizar agora"}</button>
      )}
    </div>
  );
}

export { AtualizacaoObrigatoria, BotaoAtualizacao, CACHE_ASSETS, CACHE_SHELL, NovaVersaoBanner, assetsDoDocumento, baixarVersaoNova, buscarVersaoPublicada };

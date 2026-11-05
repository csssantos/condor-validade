// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "../../supabaseClient";
import { Loader2, Package, ChevronRight, ImagePlus, ImageOff, Check, X } from "lucide-react";
import { BLUE, RED, RED_SOFT, SETORES, SUBSETORES_PADRAO } from "../../lib/constantes";
import { compressImage } from "../../lib/utilidades";
import { MOLA_SUAVE, MaisBloco } from "./MaisUI";

// ---------------- Aprovação de produto novo (lançado pelo Telegram) ----------------
const SETORES_APROVACAO = SETORES.slice(0, 10);

const ERROS_APROVACAO = {
  sem_permissao: "Só encarregado ou superior pode decidir.", ja_decidido: "Esse pedido já foi decidido por outra pessoa.", nao_encontrado: "Pedido não encontrado.",
  nome_invalido: "Nome inválido (5 a 80 caracteres, com letras).", setor_invalido: "Escolha um setor.", foto_invalida: "Imagem inválida ou grande demais.",
  motivo_invalido: "Escreva o motivo (5 a 300 caracteres).", validade_vencida: "A validade lançada já venceu. Recuse o pedido e explique o motivo.",
  produto_nao_encontrado: "Produto não encontrado.", usuario_fora_da_loja: "Quem lançou não está mais ativo nesta loja. Recuse o pedido.",
  validade_muito_proxima: "A validade lançada agora está a 2 dias ou menos. Recuse o pedido e explique o motivo.", lote_obrigatorio_telegram: "O pedido não tem lote. Recuse o pedido e explique o motivo.", ean_invalido: "O código de barras não é um código válido (EAN-8, UPC-A ou EAN-13). Recuse o pedido e explique o motivo.",
  gramagem_invalida: "Informe a gramagem (número maior que zero).", unidade_invalida: "Escolha a unidade da gramagem.", preco_invalido: "Informe o preço (de R$ 0,01 a R$ 5.000).", subsetor_invalido: "Escolha a subcategoria.",
};

function PaginaAprovacoes({ T, dark, perfil, showToast, subsetoresExtra = [] }) {
  const [lista, setLista] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [ed, setEd] = useState({});            // edição do produto aberto: nome, setor, foto, trocouFoto
  const [recusando, setRecusando] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState("pendente");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("aprovacoes_produto")
      .select("id, solicitante, barcode, nome, setor, validade, quantidade, lote, sem_lote, status, motivo, decidido_por, decidido_em, criado_em, notificado, decidido_por_id") // sem a foto: ela é pesada, só vem ao abrir o pedido
      .order("criado_em", { ascending: false }).limit(60);
    if (error) { setLista((l) => l ?? []); return; }
    setLista(data || []);
  }, []);
  // tempo real: pedido novo/decidido aparece na hora (a tabela está na publicação supabase_realtime); poll de 60 s e eventos da janela como segurança
  useEffect(() => {
    carregar();
    const ch = supabase.channel("aprovacoes_produto_" + (perfil?.loja_id ?? "x")).on("postgres_changes", { event: "*", schema: "public", table: "aprovacoes_produto" }, () => carregar()).subscribe();
    const t = setInterval(carregar, 60000);
    const volta = () => { if (document.visibilityState === "visible") carregar(); };
    document.addEventListener("visibilitychange", volta); window.addEventListener("online", carregar); window.addEventListener("focus", carregar);
    return () => { clearInterval(t); supabase.removeChannel(ch); document.removeEventListener("visibilitychange", volta); window.removeEventListener("online", carregar); window.removeEventListener("focus", carregar); };
  }, [carregar, perfil?.loja_id]);

  const avisar = (id) => supabase.functions.invoke("telegram-avisar", { body: { id } }).catch(() => {});
  // se uma decisão minha ficou sem aviso (falha de rede), tenta de novo
  useEffect(() => { (lista || []).filter((a) => a.status !== "pendente" && !a.notificado && a.decidido_por_id === perfil?.id).forEach((a) => avisar(a.id)); }, [lista, perfil?.id]);

  const msgErro = (e) => { const m = e?.message || ""; const k = Object.keys(ERROS_APROVACAO).find((x) => m.includes(x)); return k ? ERROS_APROVACAO[k] : "Não consegui agora. Tente de novo."; };
  const abrir = async (a) => {
    if (aberto === a.id) { setAberto(null); return; }
    setAberto(a.id); setRecusando(null); setMotivo(""); setEd({ nome: a.nome, setor: a.setor, tam: "", uni: "G", preco: "", sub: "", foto: null, trocouFoto: false, carregandoFoto: true });
    const { data } = await supabase.from("aprovacoes_produto").select("foto").eq("id", a.id).maybeSingle();
    setEd((e) => (e.nome === a.nome && !e.trocouFoto ? { ...e, foto: data?.foto || null, carregandoFoto: false } : e));
  };
  async function trocarFoto(file) {
    if (!file) return;
    try { const d = await compressImage(file, 480, 0.62); setEd((e) => ({ ...e, foto: d, trocouFoto: true })); } catch { showToast?.("Não consegui ler a imagem", "warn"); }
  }
  // preço: 8,99 / 8.99 / 1.234,56 (ponto só é milhar quando vêm 3 dígitos depois e a vírgula decide); outro formato é inválido
  const precoNum = (v) => { const t = String(v || "").trim(); let m; if ((m = t.match(/^(\d{1,4})(?:[.,](\d{1,2}))?$/))) return Number(m[1] + "." + (m[2] ?? "0")); if ((m = t.match(/^(\d{1,2})\.(\d{3}),(\d{1,2})$/))) return Number(m[1] + m[2] + "." + m[3]); return null; };
  const tamNum = (v) => { const t = String(v || "").trim(); if (/^\d{1,3}\.\d{3}$/.test(t)) return null; return /^\d{1,6}(?:[.,]\d{1,3})?$/.test(t) ? Number(t.replace(",", ".")) : null; };
  const opcoesSub = (setor) => [...(SUBSETORES_PADRAO[setor] || []), ...subsetoresExtra.filter((x) => x.setor === setor && !(SUBSETORES_PADRAO[setor] || []).includes(x.nome)).map((x) => x.nome)];
  const faltas = () => { const f = []; const t = tamNum(ed.tam); const pr = precoNum(ed.preco); if ((ed.nome || "").trim().length < 5) f.push("nome (mín. 5 letras)"); if (!ed.sub || !opcoesSub(ed.setor).includes(ed.sub)) f.push("subcategoria"); if (!(t > 0)) f.push(/^\d{1,3}\.\d{3}$/.test(String(ed.tam || "").trim()) ? "gramagem (use 1500 ou 1,5, sem ponto de milhar)" : "gramagem"); if (!(pr != null && pr >= 0.01 && pr <= 5000)) f.push("preço (ex.: 8,99)"); return f; };
  const camposOk = () => { const t = tamNum(ed.tam); const pr = precoNum(ed.preco); return (ed.nome || "").trim().length >= 5 && t > 0 && !!ed.uni && pr != null && pr >= 0.01 && pr <= 5000 && !!ed.sub && opcoesSub(ed.setor).includes(ed.sub); };
  async function aprovar(a) {
    if (!camposOk()) { showToast?.("Falta: " + faltas().join(", "), "aviso"); return; }
    setOcupado(true);
    const { error } = await supabase.rpc("aprovar_produto_novo", { p_id: a.id, p_nome: ed.nome, p_setor: ed.setor, p_foto: ed.trocouFoto ? ed.foto : null, p_trocar_foto: !!ed.trocouFoto, p_tamanho: String(tamNum(ed.tam)), p_unidade: ed.uni || "G", p_preco: precoNum(ed.preco), p_subsetor: ed.sub || "" });
    setOcupado(false);
    if (error) { showToast?.(msgErro(error), "warn"); carregar(); return; }
    avisar(a.id); showToast?.("Produto aprovado e validade lançada", "ok"); setAberto(null); carregar();
  }
  async function recusar(a) {
    setOcupado(true);
    const { error } = await supabase.rpc("recusar_produto_novo", { p_id: a.id, p_motivo: motivo });
    setOcupado(false);
    if (error) { showToast?.(msgErro(error), "warn"); carregar(); return; }
    avisar(a.id); showToast?.("Lançamento recusado. Se a pessoa estiver com o Telegram vinculado, o motivo chega a ela.", "aviso"); setAberto(null); setRecusando(null); setMotivo(""); carregar();
  }

  const pend = (lista || []).filter((a) => a.status === "pendente");
  const hist = (lista || []).filter((a) => a.status !== "pendente");
  const itens = aba === "pendente" ? pend : hist;
  const fmt = (iso) => { const [y, m, d] = String(iso).split("-"); return `${d}/${m}/${y}`; };
  const campo = { background: T.chipBg, color: T.text, border: `1px solid ${T.inputBorder}` };

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-x-6 lg:items-start">
      <MaisBloco T={T} i={0} className="lg:col-span-2">
        <div className="p-4">
          <p style={{ color: T.subtext }} className="text-[12.5px] leading-relaxed">Produto novo lançado pelo Telegram só entra no catálogo depois da sua aprovação. Você corrige nome, setor e imagem e informa subcategoria, gramagem e preço (obrigatórios). A validade e a quantidade lançadas não mudam. Se recusar, o motivo volta para quem lançou.</p>
          <div className="flex gap-2 mt-3">
            {[["pendente", `Pendentes (${pend.length})`], ["historico", "Decididos"]].map(([k, t]) => (
              <button key={k} onClick={() => setAba(k)} style={{ background: aba === k ? BLUE : T.chipBg, color: aba === k ? "#fff" : T.subtext }} className="px-3.5 py-1.5 rounded-full text-[12.5px] font-bold">{t}</button>
            ))}
          </div>
        </div>
      </MaisBloco>
      {lista === null && <div className="flex justify-center py-8 lg:col-span-2"><Loader2 size={22} className="animate-spin" style={{ color: T.subtext }} /></div>}
      {lista !== null && itens.length === 0 && (
        <MaisBloco T={T} i={1} className="lg:col-span-2"><p style={{ color: T.subtext }} className="text-[13px] text-center py-8 px-4">{aba === "pendente" ? "Nenhum produto novo aguardando aprovação." : "Nada decidido ainda."}</p></MaisBloco>
      )}
      {itens.map((a, k) => (
        <MaisBloco T={T} key={a.id} i={k + 1}>
          <button onClick={() => a.status === "pendente" && abrir(a)} className="w-full flex items-center gap-3 p-3.5 text-left">
            <div style={{ background: T.chipBg }} className="h-14 w-14 rounded-2xl overflow-hidden flex items-center justify-center shrink-0">
              <Package size={22} style={{ color: T.subtext }} />
            </div>
            <div className="min-w-0 flex-1">
              <p style={{ color: T.text }} className="text-[13.5px] font-bold leading-tight break-words">{a.nome}</p>
              <p style={{ color: T.subtext }} className="text-[11.5px] mt-0.5">{a.setor} · {a.barcode}</p>
              <p style={{ color: T.subtext }} className="text-[11.5px]">Validade {fmt(a.validade)} · {a.sem_lote || !a.lote ? "sem lote" : `lote ${a.lote}`} · {a.quantidade} un · por {a.solicitante}</p>
              {a.status !== "pendente" && (
                <p style={{ color: a.status === "aprovado" ? "#1F7A4D" : RED }} className="text-[11.5px] font-bold mt-1">{a.status === "aprovado" ? "Aprovado" : "Recusado"} por {a.decidido_por}{a.status === "recusado" && a.motivo ? ` · ${a.motivo}` : ""}</p>
              )}
            </div>
            {a.status === "pendente" && <ChevronRight size={16} style={{ color: T.subtext }} />}
          </button>
          <AnimatePresence initial={false}>
            {aberto === a.id && a.status === "pendente" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={MOLA_SUAVE} className="overflow-hidden">
                <div className="px-3.5 pb-4 flex flex-col gap-3" style={{ borderTop: `1px solid ${T.chipBg}` }}>
                  <label className="pt-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: T.subtext }}>Nome do produto
                    <input value={ed.nome || ""} maxLength={80} onChange={(e) => setEd({ ...ed, nome: e.target.value })} style={campo} className="mt-1 w-full rounded-xl px-3 py-2.5 text-[14px] font-semibold normal-case tracking-normal uppercase" />
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: T.subtext }}>Setor
                    <select value={ed.setor || ""} onChange={(e) => { const ns = e.target.value; const manter = opcoesSub(ns).includes(ed.sub); if (ed.sub && !manter) showToast?.("Setor mudou: escolha a subcategoria de novo", "aviso"); setEd({ ...ed, setor: ns, sub: manter ? ed.sub : "" }); }} style={campo} className="mt-1 w-full rounded-xl px-3 py-2.5 text-[14px] font-semibold normal-case tracking-normal">
                      {SETORES_APROVACAO.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: T.subtext }}>Subcategoria (obrigatória)
                    <select value={ed.sub || ""} onChange={(e) => setEd({ ...ed, sub: e.target.value })} style={campo} className="mt-1 w-full rounded-xl px-3 py-2.5 text-[14px] font-semibold normal-case tracking-normal">
                      <option value="">Escolha…</option>
                      {opcoesSub(ed.setor).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <label className="flex-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: T.subtext }}>Gramagem (obrigatória)
                      <input inputMode="decimal" value={ed.tam || ""} maxLength={10} placeholder="500" onChange={(e) => setEd({ ...ed, tam: e.target.value.replace(/[^0-9.,]/g, "") })} style={campo} className="mt-1 w-full rounded-xl px-3 py-2.5 text-[14px] font-semibold normal-case tracking-normal" />
                    </label>
                    <label className="w-24 text-[11px] font-bold uppercase tracking-wide" style={{ color: T.subtext }}>Unidade
                      <select value={ed.uni || "G"} onChange={(e) => setEd({ ...ed, uni: e.target.value })} style={campo} className="mt-1 w-full rounded-xl px-3 py-2.5 text-[14px] font-semibold normal-case tracking-normal">
                        {["G", "KG", "ML", "L"].map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: T.subtext }}>Preço (obrigatório)
                    <input inputMode="decimal" value={ed.preco || ""} maxLength={9} placeholder="8,99" onChange={(e) => setEd({ ...ed, preco: e.target.value.replace(/[^0-9.,]/g, "") })} style={campo} className="mt-1 w-full rounded-xl px-3 py-2.5 text-[14px] font-semibold normal-case tracking-normal" />
                  </label>
                  <div className="flex items-center gap-2">
                    <label style={{ background: T.chipBg, color: BLUE }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold cursor-pointer"><ImagePlus size={15} />Trocar imagem
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { trocarFoto(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    {ed.foto && <button onClick={() => setEd({ ...ed, foto: null, trocouFoto: true })} style={{ background: T.chipBg, color: T.subtext }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold"><ImageOff size={15} />Sem imagem</button>}
                    {ed.foto && <img src={ed.foto} alt="" className="h-10 w-10 rounded-lg object-cover ml-auto" />}
                  </div>
                  {recusando === a.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea value={motivo} maxLength={300} rows={3} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da recusa (volta para quem lançou)" style={campo} className="w-full rounded-xl px-3 py-2.5 text-[14px]" />
                      <div className="flex gap-2">
                        <button disabled={ocupado || motivo.trim().length < 5} onClick={() => recusar(a)} style={{ background: RED }} className="flex-1 py-2.5 rounded-xl text-white text-[13.5px] font-bold disabled:opacity-40">{ocupado ? "Enviando…" : "Confirmar recusa"}</button>
                        <button onClick={() => { setRecusando(null); setMotivo(""); }} style={{ background: T.chipBg, color: T.text }} className="px-4 py-2.5 rounded-xl text-[13.5px] font-bold">Voltar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {faltas().length > 0 && <p className="w-full text-[12px] font-semibold" style={{ color: RED }}>Falta: {faltas().join(", ")}</p>}
                      <button disabled={ocupado || !camposOk()} onClick={() => aprovar(a)} style={{ background: "#1F7A4D" }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-[13.5px] font-bold disabled:opacity-40"><Check size={16} />{ocupado ? "Aprovando…" : "Aprovar e lançar"}</button>
                      <button disabled={ocupado} onClick={() => setRecusando(a.id)} style={{ background: RED_SOFT, color: RED }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13.5px] font-bold"><X size={16} />Recusar</button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </MaisBloco>
      ))}
    </div>
  );
}

export { ERROS_APROVACAO, PaginaAprovacoes, SETORES_APROVACAO };

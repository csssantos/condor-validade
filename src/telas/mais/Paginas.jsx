// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { abrirTutorial } from "../../componentes/TutorialBipi";
import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../supabaseClient";
import { Sun, Moon, SunMoon, Check, Bell, BellOff, Volume2, VolumeX, Sparkles, Radar, Flame, FileText, History, ListChecks, Ticket, Building2, Wrench, Send, ChevronRight } from "lucide-react";
import { FUNDO_MARCA } from "../../TelasEntrada";
import { NOVIDADES } from "../../componentes/Novidades";
import { DashCard } from "../../componentes/dash";
import { BLUE, LOGO_SRC, RED_DARK, RED_SOFT, SETORES } from "../../lib/constantes";
import { supaFetchFuncionariosVisiveis } from "../../lib/dados";
import { formatarMoeda } from "../../lib/formatos";
import { isIOS, isStandalone } from "../../lib/notificacoes";
import { useTelaLarga } from "../../lib/tela";
import { apenasNumeros, parseCodigoBalanca, sanitizarTexto } from "../../lib/utilidades";
import { ResumoDiarioControles } from "./ResumoDiario";
import { APP_VERSAO, COR_MAIS, COR_TEMA, MOLA, MOLA_SUAVE, MaisAviso, MaisBloco, MaisBolha, MaisBotao, MaisCampo, MaisCheck, MaisLinha, MaisSwitch, clarearCor } from "./MaisUI";

function PaginaAparencia({ T, dark, tema, onTema }) {
  const pc = useTelaLarga();
  const previa = (id) => {
    const claro = { bg: COR_TEMA.claro, card: "#fff", linha: "#D5DCE6", texto: "#12131A" };
    const escuro = { bg: COR_TEMA.escuro, card: "#151F30", linha: "#2A3753", texto: "#EEF2F9" };
    const miolo = (p) => (
      <div style={{ background: p.bg }} className="h-full w-full p-2.5 flex flex-col gap-1.5">
        <div style={{ background: p.card }} className="rounded-lg p-2"><div style={{ background: p.texto, opacity: 0.85 }} className="h-1.5 w-8 rounded-full" /><div style={{ background: p.linha }} className="h-1.5 w-12 rounded-full mt-1.5" /></div>
        <div style={{ background: p.card }} className="rounded-lg p-2 flex-1"><div style={{ background: p.linha }} className="h-1.5 w-10 rounded-full" /><div style={{ background: BLUE }} className="h-2.5 w-5 rounded-full mt-2" /></div>
      </div>
    );
    if (id === "claro") return miolo(claro);
    if (id === "escuro") return miolo(escuro);
    return (
      <div className="relative h-full w-full">
        <div className="absolute inset-0">{miolo(claro)}</div>
        <div className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}>{miolo(escuro)}</div>
      </div>
    );
  };
  const OPCOES = [["claro", "Claro", "Fundo claro, ideal para ambientes iluminados", Sun], ["escuro", "Escuro", "Descansa a vista à noite e economiza bateria", Moon], ["auto", "Automático", "Acompanha o tema do seu celular", SunMoon]];
  if (pc) {
    return (
      <div role="radiogroup" aria-label="Tema do aplicativo" className="grid grid-cols-3 gap-5">
        {OPCOES.map(([id, nome, desc, Icone]) => {
          const sel = tema === id;
          return (
            <button key={id} type="button" role="radio" aria-checked={sel} onClick={(e) => onTema(id, e)}
              style={{ background: T.card, borderColor: sel ? BLUE : T.chipBg }} className="relative text-left rounded-2xl border-2 p-4 shadow-sm transition-transform hover:-translate-y-0.5">
              <div className="h-44 w-full rounded-xl overflow-hidden ring-1 ring-black/10">{previa(id)}</div>
              <div className="flex items-start justify-between gap-3 mt-4">
                <div className="min-w-0">
                  <p style={{ color: T.text }} className="text-[15px] font-bold flex items-center gap-1.5"><Icone size={16} />{nome}</p>
                  <p style={{ color: T.subtext }} className="text-[12.5px] mt-1 leading-snug">{desc}</p>
                </div>
                {sel && <span style={{ background: BLUE }} className="h-7 w-7 rounded-full flex items-center justify-center text-white shrink-0"><Check size={16} /></span>}
              </div>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <MaisBloco T={T} i={0}>
      <div role="radiogroup" aria-label="Tema do aplicativo" className="p-4 flex flex-col gap-3">
        {OPCOES.map(([id, nome, desc, Icone], k) => {
          const sel = tema === id;
          return (
            <motion.button key={id} role="radio" aria-checked={sel} onClick={(e) => onTema(id, e)} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              transition={{ ...MOLA, delay: 0.08 + k * 0.08 }} whileTap={{ scale: 0.97 }}
              style={{ background: sel ? `${BLUE}14` : T.chipBg, borderColor: sel ? BLUE : "transparent" }} className="relative border-2 rounded-3xl p-3 flex items-center gap-4 text-left">
              <div className="h-[86px] w-[64px] rounded-2xl overflow-hidden shrink-0 ring-1 ring-black/10">{previa(id)}</div>
              <div className="flex-1 min-w-0">
                <p style={{ color: T.text }} className="text-[15px] font-bold flex items-center gap-1.5"><Icone size={15} />{nome}</p>
                <p style={{ color: T.subtext }} className="text-[12px] mt-1 leading-snug">{desc}</p>
              </div>
              <AnimatePresence>
                {sel && (
                  <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    style={{ background: BLUE }} className="h-7 w-7 rounded-full flex items-center justify-center text-white shrink-0"><Check size={16} /></motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </MaisBloco>
  );
}

function PaginaNotificacoes({ T, dark, som, setSom, notifPermission, onToggleNotif, ehEncarregado, perfil, showToast }) {
  const iosSemInstalar = isIOS() && !isStandalone();
  const ativa = notifPermission === "granted";
  const bloqueada = notifPermission === "denied";
  const suportada = notifPermission !== "unsupported";
  const pc = useTelaLarga();
  const controleNotif = (
            ativa ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 14 }} className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: "#E3F4EA", color: "#14573A" }}>Ligadas</motion.span>
            : suportada && !bloqueada && !iosSemInstalar ? <motion.button whileTap={{ scale: 0.94 }} onClick={onToggleNotif} style={{ background: BLUE, color: "#fff" }} className="text-[12px] font-bold px-4 py-2 rounded-full">Ativar</motion.button> : null
  );
  const resumo = ehEncarregado && perfil?.id ? <ResumoDiarioControles T={T} dark={dark} usuarioId={perfil.id} showToast={showToast} notifAtiva={ativa} temEmail={!!perfil?.email} /> : null;
  if (pc) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <DashCard T={T} title="Alertas de validade" subtitle="Aviso do navegador quando um produto entra em alerta">
          <div className="flex items-center gap-4">
            <MaisBolha cor={COR_MAIS.notificacoes} dark={dark} tamanho={52}>{ativa ? <Bell size={22} /> : <BellOff size={22} />}</MaisBolha>
            <div className="flex-1 min-w-0">
              <p style={{ color: T.text }} className="text-[15px] font-bold">Notificações do app</p>
              <p style={{ color: T.subtext }} className="text-[12.5px] mt-0.5">{ativa ? "Ativadas neste aparelho" : bloqueada ? "Bloqueadas no navegador" : !suportada ? "Este aparelho não suporta" : "Avise quando um produto entrar em alerta"}</p>
            </div>
            {controleNotif}
          </div>
          <AnimatePresence>
          {iosSemInstalar && !ativa && <div className="px-4 pb-4"><MaisAviso>No iPhone, as notificações só funcionam depois de instalar o app: toque em <strong>Compartilhar</strong> no Safari → <strong>Adicionar à Tela de Início</strong> → abra pelo ícone criado e volte aqui para ativar.</MaisAviso></div>}
          {bloqueada && <div className="px-4 pb-4"><MaisAviso tipo="erro">Você bloqueou as notificações. Para ativar, libere nas configurações do navegador (ícone do cadeado ao lado do endereço) e abra o app de novo.</MaisAviso></div>}
        </AnimatePresence>
        </DashCard>
        {resumo && <DashCard T={T} title="Resumo diário" subtitle="O que vence e o que precisa de campanha, todo dia às 7h">{resumo}</DashCard>}
        <DashCard T={T} title="Som" subtitle="Feedback ao escanear com a câmera do celular">
          <div className="flex items-center gap-4">
            <MaisBolha cor="#C2570C" dark={dark} tamanho={52}>{som ? <Volume2 size={22} /> : <VolumeX size={22} />}</MaisBolha>
            <div className="flex-1 min-w-0">
              <p style={{ color: T.text }} className="text-[15px] font-bold">Som ao bipar</p>
              <p style={{ color: T.subtext }} className="text-[12.5px] mt-0.5">Toca um beep e vibra ao escanear</p>
            </div>
            <MaisSwitch ativo={som} onClick={() => setSom(!som)} label="Som ao bipar" />
          </div>
        </DashCard>
      </div>
    );
  }
  return (
    <>
      <MaisBloco T={T} titulo="Alertas" i={0}>
        <MaisLinha T={T} dark={dark} icon={ativa ? Bell : BellOff} cor={COR_MAIS.notificacoes} titulo="Notificações do app"
          desc={ativa ? "Ativadas neste aparelho" : bloqueada ? "Bloqueadas no navegador" : !suportada ? "Este aparelho não suporta" : "Avise quando um produto entrar em alerta"}
          direita={controleNotif} ultima />
        <AnimatePresence>
          {iosSemInstalar && !ativa && <div className="px-4 pb-4"><MaisAviso>No iPhone, as notificações só funcionam depois de instalar o app: toque em <strong>Compartilhar</strong> no Safari → <strong>Adicionar à Tela de Início</strong> → abra pelo ícone criado e volte aqui para ativar.</MaisAviso></div>}
          {bloqueada && <div className="px-4 pb-4"><MaisAviso tipo="erro">Você bloqueou as notificações. Para ativar, libere nas configurações do navegador (ícone do cadeado ao lado do endereço) e abra o app de novo.</MaisAviso></div>}
        </AnimatePresence>
      </MaisBloco>
      {resumo && <MaisBloco T={T} titulo="Resumo diário (7h)" i={1}>{resumo}</MaisBloco>}
      <MaisBloco T={T} titulo="Som" i={2}>
        <MaisLinha T={T} dark={dark} icon={som ? Volume2 : VolumeX} cor="#C2570C" titulo="Som ao bipar" desc="Toca um beep e vibra ao escanear"
          direita={<MaisSwitch ativo={som} onClick={() => setSom(!som)} label="Som ao bipar" />} ultima />
      </MaisBloco>
    </>
  );
}

function PaginaAtalhos({ T, dark, historico, ehEncarregado, ehCorporativo, ehDev, acoes }) {
  const grupos = [
    { t: "Inteligência", itens: [
      ...(ehEncarregado ? [
        { Icon: Sparkles, cor: "#5B3FB0", titulo: "Assistente IA", desc: "Pergunte sobre perdas, setores e rondas", ir: () => acoes.modulo("assistente") },
        { Icon: Radar, cor: BLUE, titulo: "Previsão Operacional", desc: "Riscos com base no histórico", ir: () => acoes.modulo("previsao") },
        { Icon: Flame, cor: RED_DARK, titulo: "Prevenção de Perdas", desc: "Painel de perdas e ações preventivas", ir: () => acoes.modulo("prevencao") },
      ] : []),
    ] },
    { t: "Análise", itens: [
      { Icon: Radar, cor: BLUE, titulo: "Torre de Controle", desc: "Visão geral de risco para a liderança", ir: acoes.torre },
      { Icon: FileText, cor: BLUE, titulo: "Relatórios", desc: "Resumo geral, setores e itens — com PDF e exportação", ir: acoes.relatorios },
      { Icon: Flame, cor: RED_DARK, titulo: "Prioridade de Perda", desc: "Produtos que exigem ação imediata", ir: acoes.prioridade },
      { Icon: History, cor: BLUE, titulo: "Histórico de baixas", desc: `${historico.length} baixa(s) registradas`, ir: acoes.historico },
      { Icon: ListChecks, cor: BLUE, titulo: "Auditoria", desc: "Quem fez o quê, com data e hora", ir: acoes.auditoria },
    ] },
    { t: "Gestão", itens: [
      ...(ehEncarregado ? [{ Icon: Ticket, cor: "#C2570C", titulo: "Convites de promotor", desc: "Gerar link de acesso temporário", ir: acoes.convites }] : []),
      ...(ehCorporativo ? [{ Icon: Building2, cor: "#6D4FC2", titulo: "Painel da Rede", desc: "Todas as lojas — risco, perdas e rondas", ir: acoes.rede }] : []),
      ...(ehDev ? [{ Icon: Wrench, cor: "#3B4656", titulo: "Gestão do Aplicativo", desc: "Funcionários, lojas e produtos", ir: acoes.gestao }] : []),
    ] },
  ].filter((g) => g.itens.length > 0);
  return grupos.map((g, gi) => (
    <MaisBloco key={g.t} T={T} titulo={g.t} i={gi}>
      {g.itens.map((it, k) => (
        <motion.div key={it.titulo} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ ...MOLA, delay: 0.06 + gi * 0.08 + k * 0.04 }}>
          <MaisLinha T={T} dark={dark} icon={it.Icon} cor={it.cor} titulo={it.titulo} desc={it.desc} onClick={it.ir} ultima={k === g.itens.length - 1} />
        </motion.div>
      ))}
    </MaisBloco>
  ));
}

// ---- Avisos (só desenvolvedor) ----
const TIPOS_AVISO = [{ id: "info", rotulo: "Aviso", cor: BLUE }, { id: "aviso", rotulo: "Atenção", cor: "#B7791F" }, { id: "urgente", rotulo: "Urgente", cor: RED_DARK }];

function resumoAlvoAviso(a, lojasPorId) {
  const onde = a.loja_id ? `Loja ${lojasPorId[a.loja_id] ?? a.loja_id}` : "Toda a rede";
  const quem = a.alvo_tipo === "setor" ? `setor ${a.alvo_setor}` : a.alvo_tipo === "usuarios" ? `${(a.alvo_usuarios || []).length} pessoa(s)` : "todos";
  return `${onde} · ${quem}`;
}

async function supaEnviarAvisoRpc({ titulo, mensagem, tipo, alvoTipo, alvoSetor, alvoUsuarios, lojaId }) {
  const { data, error } = await supabase.rpc("enviar_aviso", {
    p_titulo: titulo, p_mensagem: mensagem, p_tipo: tipo, p_alvo_tipo: alvoTipo,
    p_alvo_setor: alvoTipo === "setor" ? alvoSetor : null, p_alvo_usuarios: alvoTipo === "usuarios" ? alvoUsuarios : null, p_loja: lojaId || null,
  });
  if (error) {
    const m = error.message || "";
    if (m.includes("sem_permissao")) return { ok: false, erro: "Só desenvolvedores podem enviar avisos." };
    if (error.code === "PGRST202" || /could not find the function/i.test(m)) return { ok: false, erro: "O banco ainda não tem a função de avisos (falta rodar o supabase-mais.sql)." };
    return { ok: false, erro: "Não foi possível enviar o aviso agora." };
  }
  // push de verdade (celular com o app fechado); a função confere o aviso no banco
  try { await supabase.functions.invoke("enviar-push", { body: { avisoId: data, aviso: { id: data, titulo, mensagem, tipo, alvoTipo, alvoSetor, alvoUsuarios, lojaId: lojaId || null } } }); } catch (e) { console.error("Erro ao disparar push do aviso:", e); }
  return { ok: true, id: data };
}

function PaginaAvisos({ T, dark, perfil, showToast }) {
  const [tipo, setTipo] = useState("info");
  const [titulo, setTitulo] = useState(""); const [mensagem, setMensagem] = useState("");
  const [onde, setOnde] = useState("rede"); const [lojaSel, setLojaSel] = useState("");
  const [quem, setQuem] = useState("todos"); const [setor, setSetor] = useState(""); const [pessoas, setPessoas] = useState([]);
  const [lojas, setLojas] = useState([]); const [funcs, setFuncs] = useState(null); const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false); const [erro, setErro] = useState(""); const [enviado, setEnviado] = useState(false);
  const [recentes, setRecentes] = useState(null);
  const lojasPorId = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.numero_loja])), [lojas]);

  useEffect(() => { supabase.from("lojas").select("id, numero_loja").order("numero_loja").then(({ data }) => setLojas(data || [])); }, []);
  const carregarRecentes = useCallback(() => {
    supabase.from("avisos").select("id, titulo, tipo, alvo_tipo, alvo_setor, alvo_usuarios, loja_id, criado_em, criado_por").order("criado_em", { ascending: false }).limit(8).then(({ data }) => setRecentes(data || []));
  }, []);
  useEffect(() => { carregarRecentes(); }, [carregarRecentes]);
  useEffect(() => { if (quem === "pessoas" && funcs === null) supaFetchFuncionariosVisiveis(perfil).then((d) => setFuncs(d || [])); }, [quem]);

  const tipoAtual = TIPOS_AVISO.find((t) => t.id === tipo);
  const lista = (funcs || []).filter((f) => f.matricula && (!busca.trim() || f.nome.toLowerCase().includes(busca.trim().toLowerCase())));
  function alternar(m) { setPessoas((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m])); }
  async function enviar() {
    setErro("");
    if (!titulo.trim() || !mensagem.trim()) { setErro("Preencha o título e a mensagem."); return; }
    if (onde === "loja" && !lojaSel) { setErro("Escolha a loja."); return; }
    if (quem === "setor" && !setor) { setErro("Escolha o setor."); return; }
    if (quem === "pessoas" && pessoas.length === 0) { setErro("Escolha pelo menos uma pessoa."); return; }
    setEnviando(true);
    const r = await supaEnviarAvisoRpc({
      titulo: sanitizarTexto(titulo.trim(), 60), mensagem: sanitizarTexto(mensagem.trim(), 300), tipo,
      alvoTipo: quem === "pessoas" ? "usuarios" : quem, alvoSetor: setor, alvoUsuarios: pessoas, lojaId: onde === "loja" ? Number(lojaSel) : null,
    });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setEnviado(true); showToast?.("Aviso enviado.");
    setTitulo(""); setMensagem(""); setPessoas([]); setSetor(""); carregarRecentes();
    setTimeout(() => setEnviado(false), 2200);
  }
  const segmento = ({ valor, onChange, opcoes, id }) => (
    <div style={{ background: T.chipBg }} className="flex p-1 rounded-2xl">
      {opcoes.map(([v, r]) => (
        <button key={v} onClick={() => onChange(v)} className="relative flex-1 py-2.5 rounded-xl text-[12.5px] font-bold" style={{ color: valor === v ? "#fff" : T.subtext }}>
          {valor === v && <motion.span layoutId={id} transition={MOLA} className="absolute inset-0 rounded-xl" style={{ background: BLUE }} />}
          <span className="relative">{r}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-x-6 lg:items-start">
      <MaisBloco T={T} titulo="Mensagem" i={1} className="lg:col-span-5 lg:col-start-1">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            {TIPOS_AVISO.map((t) => (
              <motion.button key={t.id} whileTap={{ scale: 0.95 }} onClick={() => setTipo(t.id)} style={tipo === t.id ? { background: t.cor, color: "#fff" } : { background: T.chipBg, color: T.text }} className="flex-1 py-2.5 rounded-2xl text-[12.5px] font-bold">{t.rotulo}</motion.button>
            ))}
          </div>
          <MaisCampo T={T} label="Título" value={titulo} onChange={(v) => setTitulo(v.slice(0, 60))} placeholder="Ex.: Reunião às 15h no CPD" maxLength={60} />
          <label className="block">
            <span style={{ color: T.subtext }} className="text-[11px] font-semibold mb-1 flex justify-between"><span>Mensagem</span><span>{mensagem.length}/300</span></span>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value.slice(0, 300))} rows={4} placeholder="Escreva o aviso…"
              style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-2xl px-4 py-3 text-[15px] outline-none focus:ring-2 resize-none" />
          </label>
        </div>
      </MaisBloco>

      <MaisBloco T={T} titulo="Para quem vai" i={2} className="lg:col-span-4 lg:col-start-6 lg:row-start-1">
        <div className="p-4 flex flex-col gap-3">
          {segmento({ id: "av-onde", valor: onde, onChange: setOnde, opcoes: [["rede", "Toda a rede"], ["loja", "Uma loja"]] })}
          <AnimatePresence initial={false}>
            {onde === "loja" && (
              <motion.div key="loja" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <select value={lojaSel} onChange={(e) => setLojaSel(e.target.value)} aria-label="Loja" style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-2xl px-4 py-3 text-[15px] outline-none">
                  <option value="">Escolha a loja…</option>
                  {lojas.map((l) => <option key={l.id} value={l.id}>Loja {l.numero_loja}</option>)}
                </select>
              </motion.div>
            )}
          </AnimatePresence>
          {segmento({ id: "av-quem", valor: quem, onChange: setQuem, opcoes: [["todos", "Todos"], ["setor", "Um setor"], ["pessoas", "Pessoas"]] })}
          <AnimatePresence initial={false}>
            {quem === "setor" && (
              <motion.div key="setor" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <select value={setor} onChange={(e) => setSetor(e.target.value)} aria-label="Setor" style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-2xl px-4 py-3 text-[15px] outline-none">
                  <option value="">Escolha o setor…</option>
                  {SETORES.filter((s) => s !== "Outro").map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </motion.div>
            )}
            {quem === "pessoas" && (
              <motion.div key="pessoas" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <MaisCampo T={T} label="Buscar pessoa" value={busca} onChange={setBusca} placeholder="Nome…" />
                <div className="mt-2 max-h-48 overflow-y-auto flex flex-col gap-1.5">
                  {funcs === null ? <p style={{ color: T.subtext }} className="text-xs py-2">Carregando equipe…</p>
                    : lista.length === 0 ? <p style={{ color: T.subtext }} className="text-xs py-2">Ninguém encontrado nesta loja.</p>
                    : lista.map((f) => {
                      const sel = pessoas.includes(f.matricula);
                      return (
                        <motion.button key={f.id} whileTap={{ scale: 0.98 }} onClick={() => alternar(f.matricula)} aria-pressed={sel}
                          style={sel ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }} className="w-full text-left px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold flex items-center justify-between">
                          <span className="truncate">{f.nome}</span>{sel && <Check size={15} />}
                        </motion.button>
                      );
                    })}
                </div>
                {pessoas.length > 0 && <p style={{ color: T.subtext }} className="text-[12px] mt-2">{pessoas.length} pessoa(s) escolhida(s)</p>}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>{erro && <MaisAviso tipo="erro">{erro}</MaisAviso>}</AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            {enviado ? (
              <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2 py-3"><MaisCheck /><p style={{ color: T.text }} className="text-sm font-bold">Aviso enviado!</p></motion.div>
            ) : (
              <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <MaisBotao T={T} onClick={enviar} carregando={enviando}><Send size={16} />Enviar aviso</MaisBotao>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </MaisBloco>

      <div className="max-lg:contents lg:col-span-3 lg:col-start-10 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto flex flex-col">
      <MaisBloco T={T} titulo="Prévia" i={0} className="max-lg:order-first">
        <div className="p-4">
          <motion.div layout style={{ background: `${tipoAtual.cor}1A`, borderColor: tipoAtual.cor }} className="rounded-2xl border-l-4 p-4">
            <p style={{ color: dark ? clarearCor(tipoAtual.cor, 0.5) : tipoAtual.cor }} className="text-[11px] font-extrabold uppercase tracking-wide">{tipoAtual.rotulo}</p>
            <p style={{ color: T.text }} className="text-[15px] font-bold mt-1 break-words">{titulo || "Título do aviso"}</p>
            <p style={{ color: T.subtext }} className="text-[13px] mt-1 leading-snug break-words whitespace-pre-line">{mensagem || "A mensagem aparece aqui para quem receber."}</p>
          </motion.div>
        </div>
      </MaisBloco>

      <MaisBloco T={T} titulo="Enviados recentemente" i={3}>
        {recentes === null ? <p style={{ color: T.subtext }} className="text-xs p-4">Carregando…</p>
          : recentes.length === 0 ? <p style={{ color: T.subtext }} className="text-xs p-4">Nenhum aviso enviado ainda.</p>
          : recentes.map((a, k) => {
            const t = TIPOS_AVISO.find((x) => x.id === a.tipo) || TIPOS_AVISO[0];
            return (
              <motion.div key={a.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ ...MOLA, delay: 0.05 * k }}
                style={{ borderBottom: k < recentes.length - 1 ? `1px solid ${T.chipBg}` : "none" }} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span style={{ background: t.cor }} className="h-2 w-2 rounded-full shrink-0" />
                  <p style={{ color: T.text }} className="text-[13.5px] font-bold truncate">{a.titulo}</p>
                </div>
                <p style={{ color: T.subtext }} className="text-[11.5px] mt-0.5">{resumoAlvoAviso(a, lojasPorId)} · {new Date(a.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
              </motion.div>
            );
          })}
      </MaisBloco>
      </div>
    </div>
  );
}

// ---- Código de balança (só desenvolvedor) ----
async function supaSalvarBalancaRpc(lojasNumeros, cfg) {
  const { data, error } = await supabase.rpc("salvar_balanca", { p_lojas: lojasNumeros, p_config: cfg });
  if (error) {
    const m = error.message || "";
    if (m.includes("sem_permissao")) return { ok: false, erro: "Só desenvolvedores podem alterar o código de balança." };
    if (error.code === "PGRST202" || /could not find the function/i.test(m)) return { ok: false, erro: "O banco ainda não tem a função da balança (falta rodar o supabase-mais.sql)." };
    return { ok: false, erro: "Não foi possível salvar agora." };
  }
  return { ok: true, total: data };
}

function PaginaBalanca({ T, dark, perfil, configBalanca, onSalvou, showToast }) {
  const [tipo, setTipo] = useState(configBalanca?.tipoValor || "peso");
  const [texto, setTexto] = useState((configBalanca?.prefixos || []).join(", "));
  const [escopo, setEscopo] = useState("loja");
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState(""); const [ok, setOk] = useState(false);
  const [teste, setTeste] = useState("");
  const partes = texto.split(/[\s,;]+/).filter(Boolean);
  const validos = [...new Set(partes.filter((p) => /^\d{2}$/.test(p)))];
  const invalidos = partes.filter((p) => !/^\d{2}$/.test(p));
  const resultado = teste.length === 13 ? parseCodigoBalanca(teste, { prefixos: validos, tipoValor: tipo }) : undefined;
  const lojaNum = perfil?.lojas?.numero_loja;
  async function salvar() {
    setErro("");
    if (validos.length === 0) { setErro("Informe ao menos um prefixo de 2 dígitos (ex.: 20, 21)."); return; }
    if (invalidos.length > 0) { setErro(`Prefixo inválido: ${invalidos.join(", ")}. Use 2 dígitos.`); return; }
    setSalvando(true);
    const cfg = { tipoValor: tipo, prefixos: validos };
    const r = await supaSalvarBalancaRpc(escopo === "todas" ? null : [String(lojaNum)], cfg);
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    onSalvou(cfg); setOk(true); showToast?.(escopo === "todas" ? "Balança salva em todas as lojas." : "Balança salva.");
    setTimeout(() => setOk(false), 1800);
  }
  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-x-6 lg:items-start">
      <MaisBloco T={T} titulo="O que o código embute" i={0}>
        <div className="p-4 flex flex-col gap-3">
          <p style={{ color: T.subtext }} className="text-[12.5px] leading-relaxed">Em etiquetas de balança (açougue, padaria, hortifruti), os 5 dígitos do meio podem ser o <strong>peso</strong> ou o <strong>preço</strong>. Escolha o que a balança da rede imprime.</p>
          <div style={{ background: T.chipBg }} className="flex p-1 rounded-2xl">
            {[["peso", "Peso (kg)"], ["preco", "Preço (R$)"]].map(([v, r]) => (
              <button key={v} onClick={() => setTipo(v)} className="relative flex-1 py-2.5 rounded-xl text-[13px] font-bold" style={{ color: tipo === v ? "#fff" : T.subtext }}>
                {tipo === v && <motion.span layoutId="bal-tipo" transition={MOLA} className="absolute inset-0 rounded-xl" style={{ background: COR_MAIS.balanca }} />}
                <span className="relative">{r}</span>
              </button>
            ))}
          </div>
        </div>
      </MaisBloco>
      <MaisBloco T={T} titulo="Prefixos aceitos" i={1}>
        <div className="p-4 flex flex-col gap-3">
          <MaisCampo T={T} label="Os 2 primeiros dígitos (separe por vírgula)" value={texto} onChange={setTexto} placeholder="20, 21, 22…" />
          <div className="flex flex-wrap gap-1.5" aria-label="Prefixos">
            <AnimatePresence>
              {validos.map((p) => <motion.span key={p} layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={MOLA} style={{ background: `${COR_MAIS.balanca}26`, color: dark ? clarearCor(COR_MAIS.balanca, 0.5) : COR_MAIS.balanca }} className="px-3 py-1 rounded-full text-[13px] font-bold font-mono">{p}</motion.span>)}
              {invalidos.map((p, k) => <motion.span key={`i${p}${k}`} layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} style={{ background: RED_SOFT, color: RED_DARK }} className="px-3 py-1 rounded-full text-[13px] font-bold font-mono">{p} ✕</motion.span>)}
            </AnimatePresence>
          </div>
        </div>
      </MaisBloco>
      <MaisBloco T={T} titulo="Testar um código" i={2}>
        <div className="p-4 flex flex-col gap-3">
          <MaisCampo T={T} label="Código de 13 dígitos da etiqueta" value={teste} onChange={(v) => setTeste(apenasNumeros(v, 13))} inputMode="numeric" placeholder="2012345012349" />
          <AnimatePresence mode="wait" initial={false}>
            {teste.length === 13 && (
              <motion.div key={resultado ? "sim" : "nao"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {resultado ? (
                  <MaisAviso tipo="ok">É código de balança. Produto <strong>{resultado.codigoBase}</strong> · {resultado.pesoKg != null ? <><strong>{resultado.pesoKg.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg</strong></> : <><strong>{formatarMoeda(resultado.precoEmbutido)}</strong></>}</MaisAviso>
                ) : <MaisAviso tipo="erro">Esse código não é lido como balança com as regras acima.</MaisAviso>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </MaisBloco>
      <MaisBloco T={T} titulo="Onde aplicar" i={3}>
        <div className="p-4 flex flex-col gap-3">
          <div style={{ background: T.chipBg }} className="flex p-1 rounded-2xl">
            {[["loja", lojaNum ? `Só a Loja ${lojaNum}` : "Só esta loja"], ["todas", "Todas as lojas"]].map(([v, r]) => (
              <button key={v} onClick={() => setEscopo(v)} className="relative flex-1 py-2.5 rounded-xl text-[12.5px] font-bold" style={{ color: escopo === v ? "#fff" : T.subtext }}>
                {escopo === v && <motion.span layoutId="bal-escopo" transition={MOLA} className="absolute inset-0 rounded-xl" style={{ background: BLUE }} />}
                <span className="relative">{r}</span>
              </button>
            ))}
          </div>
          <AnimatePresence>{erro && <MaisAviso tipo="erro">{erro}</MaisAviso>}</AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            {ok ? <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center py-2"><MaisCheck tamanho={48} /></motion.div>
              : <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><MaisBotao T={T} onClick={salvar} carregando={salvando} cor={COR_MAIS.balanca}>Salvar configuração</MaisBotao></motion.div>}
          </AnimatePresence>
        </div>
      </MaisBloco>
    </div>
  );
}

function PaginaSobre({ T, dark, perfil }) {
  const [aberto, setAberto] = useState(null);
  const pc = useTelaLarga();
  const nivel = perfil?.cargos?.nivel ?? 7;
  const versoes = NOVIDADES.map((v) => ({ ...v, itens: v.itens.filter((it) => nivel <= it.ate) })).filter((v) => v.itens.length > 0).slice(0, 4);
  const loja = perfil?.lojas?.numero_loja;
  if (pc) {
    const todas = NOVIDADES.map((v) => ({ ...v, itens: v.itens.filter((it) => nivel <= it.ate) })).filter((v) => v.itens.length > 0).slice(0, 10);
    return (
      <div className="grid grid-cols-12 gap-5 items-start">
        <aside className="col-span-5 xl:col-span-4 flex flex-col gap-5">
          <section style={{ background: FUNDO_MARCA, isolation: "isolate" }} className="relative overflow-hidden rounded-3xl text-white p-7 shadow-sm text-center">
            <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
            <div className="relative flex flex-col items-center">
              <div className="bg-white rounded-2xl h-14 px-5 flex items-center shadow-lg shadow-black/20"><img src={LOGO_SRC} alt="Condor Supermercados" className="h-8 w-auto" /></div>
              <p className="text-2xl font-extrabold mt-5">Alerta de Validade</p>
              <span className="text-[12px] font-bold px-3 py-1 rounded-full mt-2" style={{ background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)" }}>Versão {APP_VERSAO}{loja ? ` · Loja ${loja}` : ""}</span>
              <p className="text-[13px] text-white/80 mt-4 leading-relaxed">Controle de validade, rondas e prevenção de perdas para as lojas Condor — com câmera, alertas, histórico de baixas e análise por setor.</p>
              <button type="button" onClick={abrirTutorial} className="mt-4 h-10 px-4 rounded-full bg-white text-[#0B2A55] text-[13px] font-extrabold flex items-center gap-2"><img src="/bipi-acenando.png" alt="" className="h-7 w-7 -ml-1" />Ver o tutorial do Bipi</button>
            </div>
          </section>
          <DashCard T={T} title="Créditos">
            <div className="flex flex-col gap-3.5">
              <div><p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">Idealizadora</p><p style={{ color: T.text }} className="text-[14px] font-semibold">Francisca Gisleuda</p><p style={{ color: T.subtext }} className="text-[12px]">Encarregada de Reposição · Loja 79</p></div>
              <div><p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">Desenvolvimento e idealização</p><p style={{ color: T.text }} className="text-[14px] font-semibold">Cauã Silva</p><p style={{ color: T.subtext }} className="text-[12px]">CPD · Loja 79</p></div>
            </div>
          </DashCard>
        </aside>
        <DashCard T={T} className="col-span-7 xl:col-span-8" title="Novidades" subtitle="O que mudou nas últimas atualizações">
          <ol className="flex flex-col">
            {todas.map((v, k) => (
              <li key={v.id} className="flex gap-4">
                <div className="flex flex-col items-center shrink-0"><span style={{ background: BLUE }} className="h-3 w-3 rounded-full mt-1.5" />{k < todas.length - 1 && <span style={{ background: T.chipBg }} className="w-0.5 flex-1 mt-1" />}</div>
                <div className="pb-5 min-w-0">
                  <p style={{ color: T.text }} className="text-[13.5px] font-bold">{v.data}</p>
                  <ul className="mt-1.5 flex flex-col gap-1.5">{v.itens.map((it, j) => <li key={j} style={{ color: T.subtext }} className="text-[13px] leading-relaxed">{it.texto}</li>)}</ul>
                </div>
              </li>
            ))}
          </ol>
        </DashCard>
      </div>
    );
  }
  return (
    <>
      <MaisBloco T={T} i={0}>
        <div className="p-6 flex flex-col items-center text-center">
          <motion.img src={LOGO_SRC} alt="Condor Supermercados" initial={{ scale: 0.4, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 220, damping: 14 }} className="h-12 w-auto" />
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} style={{ color: T.text }} className="text-[19px] font-extrabold mt-4">Alerta de Validade</motion.p>
          <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} style={{ background: T.chipBg, color: T.subtext }} className="text-[12px] font-bold px-3 py-1 rounded-full mt-2">Versão {APP_VERSAO}{loja ? ` · Loja ${loja}` : ""}</motion.span>
          <p style={{ color: T.subtext }} className="text-[13px] mt-4 leading-relaxed">Controle de validade, rondas e prevenção de perdas para as lojas Condor — com câmera, alertas, histórico de baixas e análise por setor.</p>
          <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={abrirTutorial} style={{ background: BLUE }} className="mt-4 h-11 px-5 rounded-full text-white text-[13.5px] font-extrabold flex items-center gap-2"><img src="/bipi-acenando.png" alt="" className="h-7 w-7 -ml-1" />Ver o tutorial do Bipi</motion.button>
        </div>
      </MaisBloco>
      <MaisBloco T={T} titulo="Novidades" i={1}>
        {versoes.map((v, k) => (
          <div key={v.id} style={{ borderBottom: k < versoes.length - 1 ? `1px solid ${T.chipBg}` : "none" }}>
            <button onClick={() => setAberto(aberto === v.id ? null : v.id)} aria-expanded={aberto === v.id} className="w-full flex items-center justify-between px-4 py-3.5">
              <span style={{ color: T.text }} className="text-[14px] font-semibold">{v.data}</span>
              <span className="flex items-center gap-2"><span style={{ color: T.subtext }} className="text-[12px]">{v.itens.length} item(ns)</span>
                <motion.span animate={{ rotate: aberto === v.id ? 90 : 0 }} transition={MOLA}><ChevronRight size={16} style={{ color: T.subtext }} /></motion.span></span>
            </button>
            <AnimatePresence initial={false}>
              {aberto === v.id && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={MOLA_SUAVE} className="overflow-hidden px-4">
                  {v.itens.map((it, j) => <li key={j} style={{ color: T.subtext }} className="text-[12.5px] leading-relaxed pb-2.5 pl-3 relative"><span style={{ background: BLUE }} className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full" />{it.texto}</li>)}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        ))}
      </MaisBloco>
      <MaisBloco T={T} titulo="Créditos" i={2}>
        <div className="p-4 flex flex-col gap-3">
          <div><p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">Idealizadora</p><p style={{ color: T.text }} className="text-[14px] font-semibold">Francisca Gisleuda</p><p style={{ color: T.subtext }} className="text-[12px]">Encarregada de Reposição · Loja 79</p></div>
          <div><p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">Desenvolvimento e idealização</p><p style={{ color: T.text }} className="text-[14px] font-semibold">Cauã Silva</p><p style={{ color: T.subtext }} className="text-[12px]">CPD · Loja 79</p></div>
        </div>
      </MaisBloco>
    </>
  );
}

export { PaginaAparencia, PaginaAtalhos, PaginaAvisos, PaginaBalanca, PaginaNotificacoes, PaginaSobre, TIPOS_AVISO, resumoAlvoAviso, supaEnviarAvisoRpc, supaSalvarBalancaRpc };

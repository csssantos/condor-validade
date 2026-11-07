// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { usuarioFila } from "../lib/fila";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "../supabaseClient";
import { ClockIcon } from "@heroicons/react/24/outline";
import { AlertTriangle, X, Camera, Loader2, Check, ShieldCheck, Barcode, Plus } from "lucide-react";
import { PalcoPagina } from "../Inicio";
import { SeloRisco, MODOS_RONDA } from "../inteligencia";
import { CampoData, hojeISOLocal } from "../componentes/CampoData";
import { Thumb } from "../componentes/ItemCards";
import { DashBadge, DashBars, DashCard, DashHBars, DashKpi, DashTabs } from "../componentes/dash";
import { BLUE, BLUE_DARK, BLUE_SOFT, RED, RED_DARK, RED_SOFT, setorPrincipal, subsetorEfetivo } from "../lib/constantes";
import { formatarData, formatarDataHoraExtenso, formatarHora } from "../lib/formatos";
import { useDesktop } from "../lib/tela";
import { compressImage } from "../lib/utilidades";
import { GestaoCampo, GestaoSheet } from "./Gestao";
import { ScanView } from "./Scan";
import { iconeDoSetor } from "./Setores";

// ============================================================================
// RONDA OPERACIONAL + RONDA INTELIGENTE
// Tudo que muda dados passa por funções do banco (supabase-ronda.sql), que validam cargo, setor e estado da ronda.
// A tela só mostra e pede; quem decide é o servidor.
// ============================================================================
const RONDA_STATUS = {
  agendada: { label: "Agendada", bg: "#EAF1FB", color: BLUE },
  aguardando_inicio: { label: "Aguardando início", bg: "#FCF0DD", color: "#C2760C" },
  em_andamento: { label: "Em andamento", bg: "#E6F0FF", color: "#1F5FBF" },
  finalizada: { label: "Finalizada", bg: "#E6F7ED", color: "#1F9D55" },
  encerrada_antecipada: { label: "Encerrada antecipadamente", bg: RED_SOFT, color: RED_DARK },
  cancelada: { label: "Cancelada", bg: "#EEF0F3", color: "#4B5563" },
};

const RONDA_RESULTADO = {
  pendente: { label: "Não conferido", bg: "#EEF0F3", color: "#4B5563", emoji: "⚪" },
  ok: { label: "OK", bg: "#E6F7ED", color: "#1F9D55", emoji: "🟢" },
  atencao: { label: "Atenção", bg: "#FCF0DD", color: "#C2760C", emoji: "🟡" },
  irregular: { label: "Irregular", bg: RED_SOFT, color: RED_DARK, emoji: "🔴" },
};

const MOTIVOS_ENCERRAMENTO = ["Necessidade operacional", "Troca de funcionário", "Erro na definição da ronda", "Interrupção da atividade", "Solicitação da gerência", "Outros"];

const CATEGORIAS_OCORRENCIA = [
  { id: "validade", label: "Validade" }, { id: "precificacao", label: "Precificação" }, { id: "abastecimento", label: "Abastecimento" },
  { id: "organizacao", label: "Organização" }, { id: "limpeza", label: "Limpeza" }, { id: "ruptura", label: "Ruptura" },
  { id: "exposicao", label: "Exposição" }, { id: "outros", label: "Outros" },
];

const PRIORIDADES = [
  { id: "baixa", label: "Baixa", color: "#4B5563", bg: "#EEF0F3" }, { id: "media", label: "Média", color: "#1F5FBF", bg: "#E6F0FF" },
  { id: "alta", label: "Alta", color: "#C2760C", bg: "#FCF0DD" }, { id: "urgente", label: "Urgente", color: RED_DARK, bg: RED_SOFT },
];

const OCORRENCIA_STATUS = {
  rascunho: { label: "Rascunho", bg: "#EEF0F3", color: "#4B5563" },
  pendente: { label: "Pendente", bg: "#EEF0F3", color: "#4B5563" },
  em_andamento: { label: "Em andamento", bg: "#E6F0FF", color: "#1F5FBF" },
  aguardando_aprovacao: { label: "Aguardando aprovação", bg: "#F1E9FB", color: "#6B3FB0" },
  concluida: { label: "Concluída", bg: "#E6F7ED", color: "#1F9D55" },
  reprovada: { label: "Reprovada · corrigir", bg: RED_SOFT, color: RED_DARK },
};

const EVENTO_TEXTO = {
  criada: "Criada", designada: "Designada", prazo_alterado: "Prazo alterado", status: "Status alterado",
  concluida_pelo_funcionario: "Concluída pelo funcionário", aprovada: "Aprovada", reprovada: "Reprovada",
};

function erroRonda(error) {
  const m = (error?.message || "").toString();
  const mapa = [
    ["sem_permissao", "Você não tem permissão para isso."],
    ["setor_nao_permitido", "Você só pode agir no setor pelo qual é responsável."],
    ["participante_fora_do_setor", "Esse funcionário não é do seu setor."],
    ["participante_invalido", "Funcionário inválido ou inativo."],
    ["participante_obrigatorio", "Escolha pelo menos um funcionário."],
    ["responsavel_fora_do_setor", "Esse funcionário não é do setor da ocorrência."],
    ["responsavel_invalido", "Responsável inválido ou inativo."],
    ["responsavel_obrigatorio", "Escolha o funcionário responsável."],
    ["responsavel_e_prazo_obrigatorios", "Escolha o responsável e o prazo."],
    ["prazo_obrigatorio", "Defina o prazo."],
    ["prazo_invalido", "O prazo precisa ser depois do início."],
    ["varios_setores_so_gerencia", "Só a gerência pode criar ronda de vários setores."],
    ["setor_sem_produtos", "Esse setor (ou os subsetores escolhidos) não tem produtos cadastrados."],
    ["subsetor_so_um_setor", "Escolha subsetores só quando for criar a ronda de um único setor."],
    ["setor_obrigatorio", "Escolha o setor."],
    ["ronda_encerrada", "Essa ronda já foi encerrada. Nada mais pode ser registrado nela."],
    ["ronda_ainda_nao_comecou", "Essa ronda ainda não chegou no horário de início."],
    ["ronda_ja_iniciada", "Essa ronda já começou, então não dá pra cancelar. Use Finalizar."],
    ["ronda_nao_esta_em_andamento", "Essa ronda não está em andamento."],
    ["ja_conferido", "Esse produto já foi conferido."],
    ["item_fora_da_ronda", "Esse produto não faz parte desta ronda."],
    ["validade_obrigatoria", "Informe a validade encontrada."],
    ["validade_incompativel", "A validade informada já venceu. Marque como Irregular."],
    ["lote_invalido", "Lote inválido. Use letras, números, ponto, barra ou traço (até 20)."],
    ["lotes_demais", "Lotes demais em uma conferência (máximo 10)."],
    ["irregular_exige_obs", "Para marcar como irregular, escreva uma observação ou anexe uma foto."],
    ["motivo_obrigatorio", "Informe o motivo."],
    ["justificativa_obrigatoria", "Escreva a justificativa da reprovação."],
    ["nao_pode_aprovar_propria", "Você não pode aprovar a própria tarefa."],
    ["tarefa_ja_concluida", "Essa tarefa já foi concluída."],
    ["status_invalido", "A tarefa não está num estado que permita isso."],
    ["foto_grande", "A foto ficou grande demais. Tente de novo."],
    ["descricao_obrigatoria", "Escreva a descrição."],
  ];
  for (const [k, v] of mapa) if (m.includes(k)) return v;
  if (m.includes("does not exist") || m.includes("Could not find the function")) return "Falta rodar o SQL supabase-ronda.sql no Supabase.";
  return "Não foi possível concluir. Tente de novo.";
}

const ehErroDeRede = (error) => !!error && (!navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|PGRST301|jwt expired|invalid jwt|nao_autenticado/i.test((error.message || "") + " " + (error.code || "")));

const fmtDuracao = (ms) => {
  if (!ms || ms < 0) return "0min";
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min}min`;
};

const pctDe = (conf, tot) => (tot ? Math.round((conf * 100) / tot) : 0);

const paraInputDataHora = (d) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };

const statusOcorrenciaEfetivo = (o) => {
  const aberta = ["pendente", "em_andamento", "reprovada"].includes(o.status);
  if (aberta && o.prazo && new Date(o.prazo) < new Date()) return { chave: "atrasada", label: "Atrasada", bg: RED_SOFT, color: RED_DARK };
  if (aberta && o.prazo && new Date(o.prazo) - Date.now() < 3 * 3600000) return { chave: o.status, label: OCORRENCIA_STATUS[o.status].label + " · vence logo", bg: "#FEF3E0", color: "#C98A0C" };
  return { chave: o.status, ...OCORRENCIA_STATUS[o.status] };
};

// ---------- carga da equipe do setor (para escolher participantes/responsáveis) ----------
async function carregarEquipeLoja(lojaId) {
  if (!lojaId) return [];
  const { data, error } = await supabase.from("usuarios").select("id, nome, setor, cargo_nome_loja, cargos(nome, nivel)")
    .eq("loja_id", lojaId).eq("ativo", true).eq("promotor", false).order("nome");
  if (error) { console.error(error); return []; }
  return data || [];
}

// ---------- hook: uma ronda ao vivo (dados + realtime + reconexão) ----------
function useRondaAoVivo(rondaId) {
  const [ronda, setRonda] = useState(null);
  const [itens, setItens] = useState(null);
  const [conectado, setConectado] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const carregar = useCallback(async () => {
    if (!rondaId) return;
    const [r, i] = await Promise.all([
      supabase.from("rondas").select("*, ronda_participantes(usuario_id, nome)").eq("id", rondaId).maybeSingle(),
      supabase.from("ronda_itens").select("*").eq("ronda_id", rondaId).order("ordem", { ascending: true, nullsFirst: false }).order("nome"),
    ]);
    if (!r.error && r.data) setRonda(r.data);
    if (!i.error && i.data) {
      // não deixa um recarregamento apagar uma conferência que ainda está na fila de envio
      setItens((prev) => i.data.map((x) => { const p = prev?.find((y) => y.id === x.id); return p?._pendente && x.resultado === "pendente" ? p : x; }));
    }
    setAtualizadoEm(new Date().toISOString());
  }, [rondaId]);
  useEffect(() => {
    if (!rondaId) return;
    setRonda(null); setItens(null);
    carregar();
    const canal = supabase.channel(`ronda-${rondaId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rondas", filter: `id=eq.${rondaId}` },
        (p) => { setRonda((prev) => ({ ...(prev || {}), ...p.new })); setAtualizadoEm(new Date().toISOString()); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ronda_itens", filter: `ronda_id=eq.${rondaId}` },
        (p) => { setItens((prev) => (prev ? prev.map((x) => (x.id === p.new.id && (p.new.versao ?? 0) >= (x.versao ?? 0) ? { ...x, ...p.new, _pendente: false } : x)) : prev)); setAtualizadoEm(new Date().toISOString()); })
      .subscribe((st) => {
        if (st === "SUBSCRIBED") { setConectado(true); carregar(); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") setConectado(false);
      });
    const recarregar = () => { if (document.visibilityState !== "hidden") carregar(); };
    window.addEventListener("online", recarregar);
    document.addEventListener("visibilitychange", recarregar);
    const t = setInterval(recarregar, 60000); // rede de segurança, além do tempo real
    return () => { supabase.removeChannel(canal); window.removeEventListener("online", recarregar); document.removeEventListener("visibilitychange", recarregar); clearInterval(t); };
  }, [rondaId, carregar]);
  return { ronda, itens, setItens, conectado, atualizadoEm, recarregar: carregar };
}

// ---------- fila de conferências feitas sem internet (sincroniza sozinha, sem duplicar) ----------
const FILA_CHAVE = "avdc_ronda_fila";

const lerFilaRonda = () => { try { return JSON.parse(localStorage.getItem(FILA_CHAVE) || "[]"); } catch { return []; } };

const gravarFilaRonda = (f) => { try { localStorage.setItem(FILA_CHAVE, JSON.stringify(f)); } catch {} };

const novoOp = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));

async function enviarConferencia(a) {
  return supabase.rpc("registrar_conferencia", {
    p_ronda: a.ronda, p_item: a.item, p_resultado: a.resultado, p_validade: a.validade || null, p_obs: a.obs || null,
    p_foto: a.foto || null, p_lotes: a.lotes && a.lotes.length ? a.lotes : null, p_corrigir: !!a.corrigir, p_op: a.op,
  });
}

// devolve { enviadas, rejeitadas:[{op,motivo}] }
let SINCRONIZANDO_RONDA = false;
// envia só as conferências da pessoa logada; no fim relê a fila e tira só o que foi resolvido (o que entrou no meio continua)
// conferência sem dono (versão antiga) ou de outra pessoa há mais de 7 dias é descartada
async function sincronizarFila(rondaId) {
  const eu = usuarioFila();
  if (!eu || SINCRONIZANDO_RONDA) return { enviadas: 0, rejeitadas: [] };
  SINCRONIZANDO_RONDA = true;
  const resolvidos = new Set(), rejeitadas = []; let enviadas = 0;
  try {
    const agora = Date.now();
    for (const a of lerFilaRonda()) {
      if (!a.uid || (a.uid !== eu && agora - (a.criadoEm || 0) > 7 * 86400000)) { resolvidos.add(a.op); continue; }
      if (a.uid !== eu || (rondaId && a.ronda !== rondaId)) continue; // de outra pessoa ou de outra ronda: fica
      if (usuarioFila() !== eu) break; // trocou de conta no meio
      const { error } = await enviarConferencia(a);
      if (!error) { enviadas++; resolvidos.add(a.op); continue; }
      if (ehErroDeRede(error)) continue;
      const m = error.message || "";
      if (m.includes("ja_conferido")) { enviadas++; resolvidos.add(a.op); continue; } // já está no servidor
      resolvidos.add(a.op); rejeitadas.push({ op: a.op, nome: a.nome, motivo: erroRonda(error) });
    }
  } finally {
    const resto = lerFilaRonda().filter((a) => !resolvidos.has(a.op));
    gravarFilaRonda(resto);
    SINCRONIZANDO_RONDA = false;
  }
  return { enviadas, rejeitadas, restantes: lerFilaRonda().length };
}

// ---------- avisos em tempo real (ronda encerrada, ronda/tarefa designada...) — ficam ativos no app inteiro ----------
function RondaAvisosHost({ T, usuarioId, onIrParaRondas, showToast }) {
  const [fila, setFila] = useState([]);
  const vistos = useRef(new Set());
  const empilhar = useCallback((a) => {
    if (!a || vistos.current.has(a.id)) return;
    vistos.current.add(a.id);
    if (a.tipo === "encerrada" || a.tipo === "cancelada" || a.tipo === "tarefa_reprovada") setFila((f) => [...f, a]);
    else {
      const d = a.dados || {};
      const msg = a.tipo === "designada" ? `Nova ronda para você: ${d.nome || d.setor}` :
        a.tipo === "tarefa" ? `Nova tarefa: ${d.descricao || ""}` :
        a.tipo === "tarefa_aprovada" ? "Sua tarefa foi aprovada." :
        a.tipo === "tarefa_concluida" ? `${d.por || "Um funcionário"} concluiu uma tarefa para aprovar.` : null;
      if (msg) showToast(msg, "info"); // texto de outra pessoa: tom fixo, nunca decidido pelo conteúdo
      supabase.rpc("marcar_aviso_lido", { p_id: a.id });
    }
  }, [showToast]);
  useEffect(() => {
    if (!usuarioId) return;
    let ativo = true;
    const buscar = async () => {
      const { data } = await supabase.from("ronda_avisos").select("*").eq("usuario_id", usuarioId).is("lido_em", null).order("criado_em");
      if (ativo) (data || []).forEach(empilhar);
    };
    buscar(); // avisos que chegaram com o app fechado
    const canal = supabase.channel(`avisos-ronda-${usuarioId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ronda_avisos", filter: `usuario_id=eq.${usuarioId}` }, (p) => empilhar(p.new))
      .subscribe((st) => { if (st === "SUBSCRIBED") buscar(); });
    const rec = () => { if (document.visibilityState !== "hidden") buscar(); };
    window.addEventListener("online", rec); document.addEventListener("visibilitychange", rec);
    return () => { ativo = false; supabase.removeChannel(canal); window.removeEventListener("online", rec); document.removeEventListener("visibilitychange", rec); };
  }, [usuarioId, empilhar]);

  const atual = fila[0];
  if (!atual) return null;
  const d = atual.dados || {};
  function confirmar() {
    supabase.rpc("marcar_aviso_lido", { p_id: atual.id });
    setFila((f) => f.slice(1));
    onIrParaRondas();
  }
  const encerrada = atual.tipo === "encerrada";
  const linhas = encerrada ? [
    ["Ronda", d.nome], ["Setor", d.setor], ["Finalizada por", d.por], ["Cargo", d.cargo], ["Horário", d.quando ? formatarHora(d.quando) : null],
    ["Progresso no encerramento", d.pct != null ? `${d.pct}%` : null], ["Produtos conferidos", d.total != null ? `${d.conferidos} de ${d.total}` : null], ["Produtos pendentes", d.pendentes],
  ] : atual.tipo === "cancelada" ? [["Ronda", d.nome], ["Setor", d.setor], ["Cancelada por", d.por]] : [["Tarefa", d.descricao], ["Setor", d.setor], ["Reprovada por", d.por]];
  const titulo = encerrada ? (d.antecipada === false ? "RONDA FINALIZADA" : "RONDA FINALIZADA") : atual.tipo === "cancelada" ? "RONDA CANCELADA" : "TAREFA REPROVADA";
  const subtitulo = encerrada ? (d.antecipada === false ? "A ronda foi finalizada pelo responsável." : "Esta ronda foi encerrada pelo encarregado.") :
    atual.tipo === "cancelada" ? "Esta ronda foi cancelada antes de ser executada." : "O encarregado pediu uma correção.";
  const motivo = atual.tipo === "tarefa_reprovada" ? d.justificativa : d.motivo;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: T.card, color: T.text }} className="w-full max-w-md rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div style={{ background: encerrada ? RED_DARK : "#C2760C" }} className="px-5 py-4 rounded-t-3xl flex items-center gap-3">
          <AlertTriangle size={22} color="#fff" />
          <div><p className="text-white font-extrabold text-base tracking-wide">{titulo}</p><p className="text-white/85 text-[12px]">{subtitulo}</p></div>
        </div>
        <div className="p-5">
          <div className="flex flex-col gap-1.5">
            {linhas.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-[13px]"><span style={{ color: T.subtext }}>{k}</span><span className="font-semibold text-right">{String(v)}</span></div>
            ))}
          </div>
          {motivo && (
            <div style={{ background: T.chipBg }} className="rounded-2xl p-3 mt-4">
              <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide mb-1">{atual.tipo === "tarefa_reprovada" ? "Justificativa" : "Motivo do encerramento"}</p>
              <p className="text-sm font-semibold">{motivo}</p>
              {d.obs && <p style={{ color: T.subtext }} className="text-[12px] mt-1">{d.obs}</p>}
            </div>
          )}
          <button onClick={confirmar} style={{ background: BLUE, color: "#fff" }} className="w-full mt-5 py-3 rounded-2xl text-sm font-bold">ENTENDI</button>
        </div>
      </motion.div>
    </div>
  );
}

// ---------- barra de progresso e cartões de contagem reutilizados ----------
function BarraProgressoRonda({ T, conf, total, cor = BLUE }) {
  const pct = pctDe(conf, total);
  return (
    <div>
      <div style={{ background: T.chipBg }} className="h-2.5 rounded-full overflow-hidden">
        <div style={{ background: cor, width: `${pct}%`, transition: "width .5s" }} className="h-full rounded-full" />
      </div>
      <p style={{ color: T.subtext }} className="text-[11px] mt-1 tabular-nums">{conf} de {total} conferidos · {pct}%</p>
    </div>
  );
}

function ContagemRonda({ T, itens }) {
  const c = { ok: 0, atencao: 0, irregular: 0, pendente: 0 };
  (itens || []).forEach((x) => { c[x.resultado] = (c[x.resultado] || 0) + 1; });
  return (
    <div className="grid grid-cols-4 gap-2">
      {["ok", "atencao", "irregular", "pendente"].map((k) => (
        <div key={k} style={{ background: RONDA_RESULTADO[k].bg, color: RONDA_RESULTADO[k].color }} className="rounded-xl py-2 text-center">
          <p className="text-lg font-extrabold leading-none tabular-nums">{c[k]}</p>
          <p className="text-[9.5px] font-bold mt-1">{RONDA_RESULTADO[k].label}</p>
        </div>
      ))}
    </div>
  );
}

const cascaPC = "fixed inset-0 z-50 flex flex-col lg:inset-5 lg:rounded-3xl lg:overflow-hidden lg:shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]";

 // PC: área de trabalho quase em tela cheia (ronda ao vivo / conferência)
const casca = "fixed inset-0 z-50 flex flex-col lg:inset-y-8 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-[60rem] lg:max-w-[calc(100vw-4rem)] lg:rounded-2xl lg:overflow-hidden lg:shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]";

// ---------- sheet de conferência de UM produto (a leitura do código nunca aprova sozinha) ----------
function ConferenciaSheet({ T, item, corrigir, onConfirmar, onClose }) {
  const cadastrados = Array.isArray(item.lotes_cadastrados) ? item.lotes_cadastrados : [];
  const [lotes, setLotes] = useState(() => (Array.isArray(item.lotes) && item.lotes.length > 0
    ? item.lotes.map((l) => ({ validade: l.validade || "", lote: l.lote || "" }))
    : [{ validade: item.validade_encontrada || "", lote: "" }]));
  const loteOkRonda = (l) => !l.lote || /^[A-Z0-9][A-Z0-9./ -]{0,19}$/.test(l.lote);
  const lotesValidos = lotes.every(loteOkRonda);
  const [resultado, setResultado] = useState(item.resultado !== "pendente" ? item.resultado : "");
  const [obs, setObs] = useState(item.observacao || "");
  const [foto, setFoto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const validades = lotes.map((l) => l.validade).filter(Boolean);
  const menor = validades.length ? [...validades].sort()[0] : "";
  const hoje = hojeISOLocal();
  const vencida = !!menor && menor < hoje;
  const linhaIncompleta = lotes.some((l) => !l.validade && l.lote.trim()); // lote digitado sem data completa e válida: seria descartado em silêncio
  const anoRuim = validades.some((v) => Number(v.slice(0, 4)) > new Date().getFullYear() + 10 || Number(v.slice(0, 4)) < new Date().getFullYear() - 1);
  const podeOk = !!menor && !vencida && lotesValidos && !linhaIncompleta && !anoRuim;
  const obsOuFoto = (obs.trim().length > 0 || !!foto) && !linhaIncompleta && !anoRuim;
  const pronto = resultado === "irregular" ? obsOuFoto : (resultado === "ok" || resultado === "atencao") ? podeOk : false;
  async function pegarFoto(e) {
    const f = e.target.files?.[0]; if (!f) return;
    try { setFoto(await compressImage(f, 640, 0.6)); } catch { /* ignora */ }
  }
  async function confirmar() {
    setEnviando(true);
    await onConfirmar({ resultado, validade: menor || null, lotes: lotes.filter((l) => l.validade).map((l) => ({ validade: l.validade, ...(l.lote ? { lote: l.lote.trim() } : {}) })), obs: obs.trim() || null, foto, corrigir });
    setEnviando(false);
  }
  const campo = { background: T.inputBg, color: T.text, borderColor: T.inputBorder };
  return (
    <GestaoSheet T={T} title={item.nome} subtitle={`${item.barcode || "sem código"}${item.subsetor ? ` · ${item.subsetor}` : ""}`} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <Thumb foto={item.foto} size={52} />
          <div className="text-[12px]" style={{ color: T.subtext }}>
            <p>Validade no cadastro: <b style={{ color: T.text }}>{item.validade_cadastrada ? formatarData(item.validade_cadastrada) : "não informada"}</b></p>
            {cadastrados.length > 0 && <p className="mt-0.5">No cadastro: <b style={{ color: T.text }}>{cadastrados.slice(0, 4).map((c) => `${c.lote ? "Lote " + c.lote : "Sem lote"} (${formatarData(c.validade)} · ${c.quantidade} un)`).join(" · ")}{cadastrados.length > 4 ? " …" : ""}</b></p>}
            {corrigir && <p style={{ color: "#C2760C" }} className="font-semibold mt-0.5">Correção: a conferência anterior fica guardada no histórico.</p>}
          </div>
        </div>
        <GestaoCampo T={T} label="Validade encontrada" hint="Confira a embalagem e informe a data. Lotes com datas diferentes: adicione mais de uma.">
          <div className="flex flex-col gap-2">
            {lotes.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 min-w-0"><CampoData T={T} value={l.validade} onChange={(v) => setLotes((p) => p.map((x, j) => (j === i ? { ...x, validade: v } : x)))} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" /></div>
                <input type="text" value={l.lote} maxLength={20} list="lotes-cadastrados-ronda" placeholder="Lote" autoCapitalize="characters"
                  onChange={(e) => setLotes((p) => p.map((x, j) => (j === i ? { ...x, lote: e.target.value.toUpperCase() } : x)))}
                  style={{ ...campo, borderColor: loteOkRonda(l) ? campo.borderColor : RED }} className="w-[7.5rem] border rounded-xl px-3 py-2.5 text-sm outline-none uppercase" />
                {lotes.length > 1 && <button onClick={() => setLotes((p) => p.filter((_, j) => j !== i))} style={{ background: T.chipBg, color: T.subtext }} className="h-10 w-10 rounded-xl flex items-center justify-center"><X size={15} /></button>}
              </div>
            ))}
            {lotes.length < 5 && <button onClick={() => setLotes((p) => [...p, { validade: "", lote: "" }])} style={{ color: BLUE }} className="text-xs font-semibold text-left">+ outro lote / outra data</button>}
          </div>
          <datalist id="lotes-cadastrados-ronda">{cadastrados.filter((c) => c.lote).map((c) => <option key={c.lote} value={c.lote} />)}</datalist>
          {!lotesValidos && <p style={{ color: RED_DARK }} className="text-[11px] font-semibold mt-1.5">Lote inválido: use letras, números, ponto, barra ou traço (até 20).</p>}
          {lotes.map((l, i) => {
            if (!l.lote || !loteOkRonda(l) || !cadastrados.length) return null;
            const c = cadastrados.find((x) => x.lote === l.lote);
            if (!c) return <p key={i} style={{ color: "#C2760C" }} className="text-[11px] font-semibold mt-1.5">Lote {l.lote} não está lançado nesse produto. Se for lote novo, lance a validade depois da ronda.</p>;
            if (l.validade && c.validade && l.validade !== c.validade) return <p key={i} style={{ color: "#C2760C" }} className="text-[11px] font-semibold mt-1.5">O lote {l.lote} está cadastrado com validade {formatarData(c.validade)}.</p>;
            return null;
          })}
          {vencida && <p style={{ color: RED_DARK }} className="text-[11px] font-semibold mt-1.5">Essa data já passou: esse produto só pode ser marcado como Irregular.</p>}
        </GestaoCampo>
        <GestaoCampo T={T} label="Resultado da conferência">
          <div className="grid grid-cols-3 gap-2">
            {["ok", "atencao", "irregular"].map((k) => {
              const r = RONDA_RESULTADO[k]; const desab = (k !== "irregular") && !podeOk; const sel = resultado === k;
              return (
                <button key={k} disabled={desab} onClick={() => setResultado(k)} style={sel ? { background: r.color, color: "#fff" } : { background: r.bg, color: r.color }}
                  className="rounded-xl py-3 text-[12.5px] font-bold disabled:opacity-40">{r.emoji} {r.label}</button>
              );
            })}
          </div>
          <p style={{ color: T.subtext }} className="text-[10.5px] mt-1.5">OK = validade conferida e dentro do padrão · Atenção = perto de vencer · Irregular = vencido ou com problema.</p>
        </GestaoCampo>
        <GestaoCampo T={T} label={resultado === "irregular" ? "Observação (obrigatória se não houver foto)" : "Observação (opcional)"}>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={300} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
        </GestaoCampo>
        <div className="flex items-center gap-3">
          <label style={{ background: T.chipBg, color: T.text }} className="rounded-xl px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 cursor-pointer">
            <Camera size={15} /> {foto ? "Trocar foto" : "Anexar foto"}
            <input type="file" accept="image/*" capture="environment" onChange={pegarFoto} className="hidden" />
          </label>
          {foto && <img src={foto} alt="" className="h-12 w-12 rounded-lg object-cover" />}
        </div>
        {(linhaIncompleta || anoRuim) && <p style={{ color: RED_DARK }} className="text-[11.5px] font-semibold">{linhaIncompleta ? "Tem um lote sem data completa (dd/mm/aaaa). Complete a data ou apague o lote." : "Confira o ano da validade (precisa ser de 4 dígitos, perto do ano atual)."}</p>}
        <button onClick={confirmar} disabled={!pronto || enviando} style={{ background: pronto ? BLUE : "#C7CEDA", color: "#fff" }} className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Confirmar conferência
        </button>
      </div>
    </GestaoSheet>
  );
}

// ---------- EXECUÇÃO (funcionário designado) ----------
function RondaExecucao({ T, rondaId, perfil, catalog, showToast, onFechar }) {
  const { ronda, itens, setItens, conectado, recarregar } = useRondaAoVivo(rondaId);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState("pendentes");
  const semCamera = useDesktop(); // no PC não há leitura por câmera nem bipe
  const [scan, setScan] = useState(false);
  const [aberto, setAberto] = useState(null); // { item, corrigir }
  const [aviso, setAviso] = useState(null); // resposta de leitura (não pertence / já conferido)
  const [naFila, setNaFila] = useState(() => lerFilaRonda().filter((a) => a.ronda === rondaId).length);
  const [iniciando, setIniciando] = useState(false);
  const aberta = ronda && ["agendada", "aguardando_inicio", "em_andamento"].includes(ronda.status);
  const encerrada = ronda && !aberta;

  // sincroniza o que ficou salvo no aparelho quando a internet volta
  useEffect(() => {
    let vivo = true;
    const sync = async () => {
      if (!navigator.onLine || !lerFilaRonda().some((a) => a.ronda === rondaId)) return;
      const r = await sincronizarFila(rondaId);
      if (!vivo) return;
      setNaFila(lerFilaRonda().filter((a) => a.ronda === rondaId).length);
      if (r.enviadas) { showToast(`${r.enviadas} conferência(s) enviada(s).`); recarregar(); }
      if (r.rejeitadas.length) showToast(`${r.rejeitadas.length} conferência(s) não foram aceitas: ${r.rejeitadas[0].motivo}`, "warn");
    };
    sync();
    window.addEventListener("online", sync);
    const t = setInterval(sync, 20000);
    return () => { vivo = false; window.removeEventListener("online", sync); clearInterval(t); };
  }, [rondaId]);

  async function iniciar() {
    setIniciando(true);
    const { error } = await supabase.rpc("iniciar_ronda", { p_id: rondaId });
    setIniciando(false);
    if (error) { showToast(erroRonda(error), "warn"); return; }
    recarregar();
  }
  async function conferir(item, dados) {
    if (encerrada) { showToast("Essa ronda já foi encerrada.", "warn"); return false; }
    const args = { ronda: rondaId, item: item.id, ...dados, op: novoOp(), nome: item.nome };
    const antes = item;
    setItens((prev) => prev.map((x) => (x.id === item.id ? { ...x, resultado: dados.resultado, validade_encontrada: dados.validade, lotes: dados.lotes && dados.lotes.length ? dados.lotes : null, observacao: dados.obs, conferido_por: perfil?.nome, conferido_em: new Date().toISOString(), _pendente: true } : x)));
    const { error } = await enviarConferencia(args);
    if (!error) { setItens((prev) => prev.map((x) => (x.id === item.id ? { ...x, _pendente: false } : x))); setAberto(null); return true; }
    if (ehErroDeRede(error)) {
      if (!usuarioFila()) { showToast("Sua sessão terminou. Entre de novo e confira outra vez.", "erro"); return false; }
      gravarFilaRonda([...lerFilaRonda(), { ...args, uid: usuarioFila(), criadoEm: Date.now() }]); setNaFila((n) => n + 1);
      showToast("Sem internet: conferência guardada no aparelho. Ela é enviada sozinha quando a conexão voltar.", "aviso");
      setAberto(null); return true;
    }
    setItens((prev) => prev.map((x) => (x.id === item.id ? antes : x)));
    showToast(erroRonda(error), "warn"); recarregar();
    if ((error.message || "").includes("ronda_encerrada")) setAberto(null);
    return false;
  }
  function aoLerCodigo(codigo) {
    setScan(false);
    const c = String(codigo || "").trim(); if (!c) return;
    const sem0 = (s) => String(s || "").replace(/^0+/, "");
    const item = (itens || []).find((x) => x.barcode === c || sem0(x.barcode) === sem0(c));
    if (!item) {
      const outro = catalog?.[c] || Object.values(catalog || {}).find((p) => sem0(p.barcode) === sem0(c));
      setAviso({ tipo: "fora", texto: outro ? `${outro.nome} não faz parte desta conferência (é do setor ${outro.setor}).` : `O código ${c} não está nesta ronda nem no cadastro.` });
      return;
    }
    if (item.resultado !== "pendente") { setAviso({ tipo: "ja", item }); return; }
    setAviso(null); setAberto({ item, corrigir: false });
  }

  if (!ronda || !itens) return <div className={cascaPC} style={{ background: T.bg }}><div className="m-auto"><Loader2 className="animate-spin" color={T.subtext} /></div></div>;
  const total = itens.length, conf = itens.filter((x) => x.resultado !== "pendente").length;
  const termo = busca.trim().toLowerCase();
  const lista = itens.filter((x) => (aba === "pendentes" ? x.resultado === "pendente" : aba === "conferidos" ? x.resultado !== "pendente" : true)
    && (!termo || x.nome.toLowerCase().includes(termo) || (x.barcode || "").includes(termo)));
  const podeComecar = ["agendada", "aguardando_inicio"].includes(ronda.status) && !(ronda.inicio_previsto && new Date(ronda.inicio_previsto) > new Date());

  return (
    <div className={cascaPC} style={{ background: T.bg, color: T.text }}>
      <div style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)` }} className="px-4 pb-4 shrink-0 pt-[calc(env(safe-area-inset-top)+16px)] lg:px-8 lg:pb-6 lg:pt-7 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-x-8 lg:items-center">
        <div className="flex items-start justify-between gap-3 lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <div className="min-w-0">
            <p className="text-white/70 text-[11px] font-medium">CONFERÊNCIA · {ronda.setor}</p>
            <h2 className="text-white font-bold text-lg lg:text-3xl leading-tight">{ronda.titulo}</h2>
            <p className="text-white/70 text-[11px] lg:text-sm mt-0.5">Encarregado: {ronda.criado_por_nome || "—"}{ronda.prazo ? ` · prazo ${formatarDataHoraExtenso(ronda.prazo)}` : ""}</p>
          </div>
          <button onClick={onFechar} className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center shrink-0"><X size={18} color="#fff" /></button>
        </div>
        <div className="mt-3 lg:mt-0 rounded-2xl bg-white/12 p-3 lg:col-start-2 lg:row-start-1">
          <div className="flex items-end justify-between text-white">
            <p className="text-3xl font-extrabold leading-none tabular-nums">{pctDe(conf, total)}%</p>
            <p className="text-[11px] text-white/80 text-right tabular-nums">{total} produtos · {conf} conferidos · {total - conf} pendentes</p>
          </div>
          <div className="h-2.5 rounded-full bg-white/20 overflow-hidden mt-2"><div style={{ background: "#fff", width: `${pctDe(conf, total)}%`, transition: "width .5s" }} className="h-full rounded-full" /></div>
        </div>
        <div className="flex items-center gap-2 mt-2.5 lg:mt-3 flex-wrap lg:col-start-2 lg:row-start-2">
          <span style={{ background: conectado ? "rgba(31,157,85,.25)" : "rgba(224,146,28,.35)" }} className="text-white text-[10.5px] font-bold px-2.5 py-1 rounded-full">{conectado ? "● Ao vivo" : "● Sem conexão — reconectando"}</span>
          {naFila > 0 && <span className="text-white text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-white/20">{naFila} aguardando envio</span>}
        </div>
      </div>

      {encerrada && (
        <div style={{ background: RED_SOFT, color: RED_DARK }} className="px-4 py-3 text-sm font-bold flex items-center gap-2"><AlertTriangle size={16} /> Ronda {RONDA_STATUS[ronda.status]?.label.toLowerCase()} — não é mais possível conferir.</div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
        {podeComecar && (
          <button onClick={iniciar} disabled={iniciando} style={{ background: "#1F9D55", color: "#fff" }} className="w-full py-3 rounded-2xl text-sm font-bold mb-4 flex items-center justify-center gap-2">
            {iniciando ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Iniciar conferência
          </button>
        )}
        {["agendada", "aguardando_inicio"].includes(ronda.status) && !podeComecar && (
          <div style={{ background: "#FCF0DD", color: "#C2760C" }} className="rounded-2xl p-3 text-xs font-semibold mb-4">Esta ronda começa em {formatarDataHoraExtenso(ronda.inicio_previsto)}.</div>
        )}
        {ronda.observacoes && <div style={{ background: T.chipBg }} className="rounded-2xl p-3 text-[12.5px] mb-4"><b>Instruções:</b> {ronda.observacoes}</div>}

        {aberta && (
          <div className="flex gap-2 mb-3">
            <div style={{ background: T.inputBg, borderColor: T.inputBorder }} className="flex items-center gap-2 border rounded-xl px-3 flex-1">
              <Barcode size={16} style={{ color: T.subtext }} />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && busca.trim()) { aoLerCodigo(busca); setBusca(""); } }}
                placeholder={semCamera ? "Digite o código ou busque pelo nome" : "Bipe, digite o código ou busque pelo nome"} inputMode="search" style={{ color: T.text }} className="bg-transparent outline-none text-sm flex-1 min-w-0 py-2.5" />
            </div>
            {!semCamera && <button onClick={() => setScan(true)} style={{ background: BLUE, color: "#fff" }} className="px-4 rounded-xl text-sm font-semibold flex items-center gap-1.5"><Camera size={16} /> Bipar</button>}
          </div>
        )}
        {aviso && (
          <div style={{ background: aviso.tipo === "fora" ? RED_SOFT : "#FCF0DD", color: aviso.tipo === "fora" ? RED_DARK : "#C2760C" }} className="rounded-2xl p-3 text-[12.5px] font-semibold mb-3 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              {aviso.tipo === "fora" ? aviso.texto : <>
                {aviso.item.nome} já foi conferido: {RONDA_RESULTADO[aviso.item.resultado].label}{aviso.item.validade_encontrada ? ` · validade ${formatarData(aviso.item.validade_encontrada)}` : ""} por {aviso.item.conferido_por || "—"}.
                {aberta && <button onClick={() => { setAberto({ item: aviso.item, corrigir: true }); setAviso(null); }} className="block underline mt-1">Corrigir conferência</button>}
              </>}
            </div>
            <button onClick={() => setAviso(null)}><X size={14} /></button>
          </div>
        )}
        <div className="mb-3"><DashTabs T={T} value={aba} onChange={setAba} options={[{ id: "pendentes", label: `Pendentes (${total - conf})` }, { id: "conferidos", label: `Conferidos (${conf})` }, { id: "todos", label: "Todos" }]} /></div>
        <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
          {lista.length === 0 && <p style={{ color: T.subtext }} className="text-sm text-center py-8 lg:col-span-full">{aba === "pendentes" ? "Nada pendente. Bom trabalho!" : "Nenhum produto aqui."}</p>}
          {lista.map((x) => {
            const r = RONDA_RESULTADO[x.resultado];
            return (
              <button key={x.id} disabled={!aberta && x.resultado === "pendente"} onClick={() => aberta && setAberto({ item: x, corrigir: x.resultado !== "pendente" })}
                style={{ background: T.card, borderColor: T.border }} className="border rounded-2xl p-3 flex items-center gap-3 text-left">
                <Thumb foto={x.foto} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{x.nome}</p>
                  <p style={{ color: T.subtext }} className="text-[11px] truncate flex items-center gap-1.5"><SeloRisco risco={x.risco} nivel={x.risco_nivel} /><span className="truncate">{x.barcode}{x.validade_encontrada ? ` · validade ${formatarData(x.validade_encontrada)}` : ""}{Array.isArray(x.lotes) && x.lotes.some((l) => l.lote) ? ` · lote ${x.lotes.filter((l) => l.lote).map((l) => l.lote).join("/")}` : ""}</span></p>
                </div>
                <DashBadge bg={r.bg} color={r.color}>{x._pendente ? "enviando…" : r.label}</DashBadge>
              </button>
            );
          })}
        </div>
      </div>
      {scan && <ScanView T={T} onDetected={aoLerCodigo} onCancel={() => setScan(false)} />}
      {aberto && <ConferenciaSheet T={T} item={aberto.item} corrigir={aberto.corrigir} onClose={() => setAberto(null)} onConfirmar={(d) => conferir(aberto.item, d)} />}
    </div>
  );
}

// ---------- modal de FINALIZAR RONDA (encerramento antecipado) ----------
function FinalizarRondaModal({ T, ronda, itens, onClose, onFeito, showToast }) {
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const conf = itens.filter((x) => x.resultado !== "pendente").length, total = itens.length;
  async function confirmar() {
    setOcupado(true);
    const { error } = await supabase.rpc("finalizar_ronda", { p_id: ronda.id, p_motivo: motivo, p_obs: obs.trim() || null });
    setOcupado(false);
    if (error) { showToast(erroRonda(error), "warn"); return; }
    showToast("Ronda finalizada. Os funcionários foram avisados na hora.");
    onFeito();
  }
  const campo = { background: T.inputBg, color: T.text, borderColor: T.inputBorder };
  return (
    <GestaoSheet T={T} title="Finalizar ronda" subtitle={`${ronda.titulo} · ${conf} de ${total} conferidos (${pctDe(conf, total)}%)`} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {total - conf > 0 && <div style={{ background: "#FCF0DD", color: "#C2760C" }} className="rounded-xl p-3 text-xs font-semibold">Ainda faltam {total - conf} produto(s). Eles ficam como “não conferidos” e os já conferidos são mantidos. Quem está executando verá um aviso na hora.</div>}
        <GestaoCampo T={T} label="Motivo da finalização">
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none">
            <option value="">Selecione…</option>{MOTIVOS_ENCERRAMENTO.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </GestaoCampo>
        <GestaoCampo T={T} label="Observação complementar (opcional)"><textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={300} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" /></GestaoCampo>
        <button onClick={confirmar} disabled={!motivo || ocupado} style={{ background: motivo ? RED_DARK : "#C7CEDA", color: "#fff" }} className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
          {ocupado && <Loader2 size={15} className="animate-spin" />} Confirmar finalização
        </button>
      </div>
    </GestaoSheet>
  );
}

// ---------- PAINEL do encarregado (tempo real) e relatório da ronda ----------
function RondaPainel({ T, rondaId, perfil, showToast, onFechar, onExecutar }) {
  const { ronda, itens, conectado, atualizadoEm, recarregar } = useRondaAoVivo(rondaId);
  const [, tic] = useState(0);
  const [filtro, setFiltro] = useState("todos");
  const [finalizar, setFinalizar] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [item, setItem] = useState(null);
  const [eventos, setEventos] = useState([]);
  useEffect(() => { const t = setInterval(() => tic((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!ronda || ["agendada", "aguardando_inicio", "em_andamento"].includes(ronda.status)) return;
    supabase.from("ronda_eventos").select("*").eq("ronda_id", rondaId).order("criado_em").then(({ data }) => setEventos(data || []));
  }, [ronda?.status, rondaId]);
  if (!ronda || !itens) return <div className={cascaPC} style={{ background: T.bg }}><div className="m-auto"><Loader2 className="animate-spin" color={T.subtext} /></div></div>;

  const total = itens.length, conf = itens.filter((x) => x.resultado !== "pendente").length;
  const ativa = ronda.status === "em_andamento", naoComecou = ["agendada", "aguardando_inicio"].includes(ronda.status);
  const st = RONDA_STATUS[ronda.status] || RONDA_STATUS.finalizada;
  const sou = (ronda.ronda_participantes || []).some((p) => p.usuario_id === perfil?.id);
  const recentes = itens.filter((x) => x.conferido_em).sort((a, b) => new Date(b.conferido_em) - new Date(a.conferido_em));
  const ultimo = recentes[0];
  const fim = ronda.finalizado_em ? new Date(ronda.finalizado_em) : new Date();
  const decorrido = ronda.iniciado_em ? fim - new Date(ronda.iniciado_em) : 0;
  const lista = itens.filter((x) => filtro === "todos" || x.resultado === filtro);
  async function cancelarRonda() {
    const { error } = await supabase.rpc("cancelar_ronda", { p_id: rondaId, p_motivo: motivoCancel });
    if (error) { showToast(erroRonda(error), "warn"); return; }
    showToast("Ronda cancelada."); setCancelar(false); recarregar();
  }
  return (
    <div className={cascaPC} style={{ background: T.bg, color: T.text }}>
      <div style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)` }} className="px-4 pb-4 shrink-0 pt-[calc(env(safe-area-inset-top)+16px)] lg:px-8 lg:pb-6 lg:pt-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white/70 text-[11px] font-medium">{ativa ? "RONDA ATIVA" : "RONDA"} · {ronda.setor}</p>
            <h2 className="text-white font-bold text-lg lg:text-3xl leading-tight">{ronda.titulo}</h2>
            <p className="text-white/75 text-[11.5px] mt-0.5">Responsável: {ronda.usuario || "—"}</p>
          </div>
          <button onClick={onFechar} className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center shrink-0"><X size={18} color="#fff" /></button>
        </div>
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <DashBadge bg={st.bg} color={st.color}>{st.label}</DashBadge>
          {ativa && <span style={{ background: conectado ? "rgba(31,157,85,.3)" : "rgba(224,146,28,.4)" }} className="text-white text-[10.5px] font-bold px-2.5 py-1 rounded-full">{conectado ? "● Tempo real" : "● Reconectando…"}</span>}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 lg:px-8 lg:py-7 lg:items-start lg:content-start">
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-0">
        <div style={{ background: T.card, borderColor: T.border }} className="border rounded-2xl p-4">
          <div className="flex items-end justify-between mb-2.5">
            <p className="text-4xl lg:text-6xl font-extrabold tabular-nums leading-none">{pctDe(conf, total)}%</p>
            <p style={{ color: T.subtext }} className="text-xs text-right tabular-nums">{total} produtos no total<br />{conf} conferidos · {total - conf} pendentes</p>
          </div>
          <BarraProgressoRonda T={T} conf={conf} total={total} cor={ativa ? BLUE : st.color} />
          <div className="mt-3"><ContagemRonda T={T} itens={itens} /></div>
          <div style={{ color: T.subtext }} className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] mt-3">
            <span>Início: <b style={{ color: T.text }}>{ronda.iniciado_em ? formatarHora(ronda.iniciado_em) : naoComecou ? `previsto ${formatarDataHoraExtenso(ronda.inicio_previsto)}` : "—"}</b></span>
            <span>{ronda.finalizado_em ? "Duração" : "Tempo decorrido"}: <b style={{ color: T.text }}>{fmtDuracao(decorrido)}</b></span>
            <span className="col-span-2">Último produto: <b style={{ color: T.text }}>{ultimo ? `${ultimo.nome} (${RONDA_RESULTADO[ultimo.resultado].label}, ${formatarHora(ultimo.conferido_em)})` : "nenhum ainda"}</b></span>
            {ativa && <span className="col-span-2">Atualizado às {atualizadoEm ? formatarHora(atualizadoEm) : "—"}</span>}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {sou && (ativa || naoComecou) && <button onClick={onExecutar} style={{ background: BLUE, color: "#fff" }} className="flex-1 min-w-[10rem] py-3 rounded-2xl text-sm font-bold">Conferir itens</button>}
          {ativa && <button onClick={() => setFinalizar(true)} style={{ background: RED_DARK, color: "#fff" }} className="flex-1 min-w-[10rem] py-3 rounded-2xl text-sm font-bold">FINALIZAR RONDA</button>}
          {naoComecou && <button onClick={() => setCancelar(true)} style={{ background: T.chipBg, color: RED_DARK }} className="flex-1 min-w-[10rem] py-3 rounded-2xl text-sm font-bold">Cancelar ronda</button>}
        </div>

        {!ativa && !naoComecou && (
          <div style={{ background: T.card, borderColor: T.border }} className="border rounded-2xl p-4">
            <p className="text-sm font-bold mb-2">Relatório da ronda</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
              {[["Criada por", `${ronda.criado_por_nome || "—"}${ronda.criado_por_cargo ? ` (${ronda.criado_por_cargo})` : ""}`], ["Designados", (ronda.ronda_participantes || []).map((p) => p.nome).join(", ") || "—"],
                ["Setor", ronda.setor], ["Início", ronda.iniciado_em ? formatarDataHoraExtenso(ronda.iniciado_em) : "não iniciada"], ["Encerramento", ronda.finalizado_em ? formatarDataHoraExtenso(ronda.finalizado_em) : "—"],
                ["Tempo de execução", fmtDuracao(decorrido)], ["Total de produtos", total], ["Conferidos", conf], ["Pendentes", total - conf],
                ["Conclusão", `${ronda.encerrada_pct ?? pctDe(conf, total)}%`],
                ...(ronda.status === "encerrada_antecipada" ? [["Encerrada por", `${ronda.encerrada_por_nome || "—"}${ronda.encerrada_por_cargo ? ` (${ronda.encerrada_por_cargo})` : ""}`], ["Motivo", ronda.encerrada_motivo], ...(ronda.encerrada_obs ? [["Observação", ronda.encerrada_obs]] : [])] : []),
                ...(ronda.status === "cancelada" ? [["Motivo do cancelamento", ronda.cancelada_motivo]] : [])]
                .map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span style={{ color: T.subtext }}>{k}</span><span className="font-semibold text-right">{String(v)}</span></div>)}
            </div>
            {eventos.length > 0 && (
              <details className="mt-3"><summary style={{ color: BLUE }} className="text-xs font-semibold cursor-pointer">Histórico completo ({eventos.length} registros)</summary>
                <div className="mt-2 flex flex-col gap-1 max-h-60 overflow-y-auto">
                  {eventos.map((e) => <p key={e.id} style={{ color: T.subtext }} className="text-[11px]">{formatarDataHoraExtenso(e.criado_em)} · <b style={{ color: T.text }}>{e.usuario_nome || "—"}</b> · {e.tipo}{e.dados?.nome ? ` · ${e.dados.nome}` : ""}{e.dados?.resultado ? ` → ${e.dados.resultado}` : ""}{e.dados?.motivo ? ` · ${e.dados.motivo}` : ""}</p>)}
                </div>
              </details>
            )}
          </div>
        )}

        {recentes.length > 0 && (
          <div style={{ background: T.card, borderColor: T.border }} className="border rounded-2xl p-4">
            <p className="text-sm font-bold mb-2">Atividade recente</p>
            <div className="flex flex-col gap-1.5">
              {recentes.slice(0, 8).map((x) => <p key={x.id} className="text-[12.5px]"><span style={{ color: T.subtext }} className="tabular-nums">{formatarHora(x.conferido_em)}</span> — {x.nome} — <b style={{ color: RONDA_RESULTADO[x.resultado].color }}>{RONDA_RESULTADO[x.resultado].label.toUpperCase()}</b>{x.conferido_por ? <span style={{ color: T.subtext }}> · {x.conferido_por}</span> : null}</p>)}
            </div>
          </div>
        )}

        </div>
        <div className="lg:col-start-1 lg:row-start-1 lg:min-w-0">
          <div className="mb-2.5"><DashTabs T={T} value={filtro} onChange={setFiltro} options={[{ id: "todos", label: "Todos" }, { id: "ok", label: "OK" }, { id: "atencao", label: "Atenção" }, { id: "irregular", label: "Irregulares" }, { id: "pendente", label: "Pendentes" }]} /></div>
          <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
            {lista.map((x) => { const r = RONDA_RESULTADO[x.resultado]; return (
              <button key={x.id} onClick={() => setItem(x)} style={{ background: T.card, borderColor: T.border }} className="border rounded-2xl p-3 flex items-center gap-3 text-left">
                <Thumb foto={x.foto} size={40} />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{x.nome}</p><p style={{ color: T.subtext }} className="text-[11px] truncate">{x.barcode}{x.validade_encontrada ? ` · validade ${formatarData(x.validade_encontrada)}` : ""}{Array.isArray(x.lotes) && x.lotes.some((l) => l.lote) ? ` · lote ${x.lotes.filter((l) => l.lote).map((l) => l.lote).join("/")}` : ""}</p></div>
                <DashBadge bg={r.bg} color={r.color}>{r.label}</DashBadge>
              </button>); })}
            {lista.length === 0 && <p style={{ color: T.subtext }} className="text-sm text-center py-6">Nenhum produto nesse filtro.</p>}
          </div>
        </div>
      </div>
      {finalizar && <FinalizarRondaModal T={T} ronda={ronda} itens={itens} showToast={showToast} onClose={() => setFinalizar(false)} onFeito={() => { setFinalizar(false); recarregar(); }} />}
      {cancelar && (
        <GestaoSheet T={T} title="Cancelar ronda" subtitle="Só dá pra cancelar antes de começar." onClose={() => setCancelar(false)}>
          <GestaoCampo T={T} label="Justificativa (obrigatória)"><textarea value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} rows={3} style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" /></GestaoCampo>
          <button onClick={cancelarRonda} disabled={!motivoCancel.trim()} style={{ background: motivoCancel.trim() ? RED_DARK : "#C7CEDA", color: "#fff" }} className="w-full mt-4 py-3 rounded-2xl text-sm font-bold">Cancelar ronda</button>
        </GestaoSheet>
      )}
      {item && (
        <GestaoSheet T={T} title={item.nome} subtitle={item.barcode} onClose={() => setItem(null)}>
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex items-center gap-3"><Thumb foto={item.foto} size={56} /><DashBadge bg={RONDA_RESULTADO[item.resultado].bg} color={RONDA_RESULTADO[item.resultado].color}>{RONDA_RESULTADO[item.resultado].label}</DashBadge></div>
            <p>Validade no cadastro: <b>{item.validade_cadastrada ? formatarData(item.validade_cadastrada) : "—"}</b></p>
            <p>Validade encontrada: <b>{item.validade_encontrada ? formatarData(item.validade_encontrada) : "—"}</b></p>
            {Array.isArray(item.lotes_cadastrados) && item.lotes_cadastrados.length > 0 && <p>Lotes no cadastro: <b>{item.lotes_cadastrados.map((l) => `${l.lote ? "Lote " + l.lote : "Sem lote"} (${formatarData(l.validade)} · ${l.quantidade} un)`).join(" · ")}</b></p>}
            {Array.isArray(item.lotes) && item.lotes.length > 0 && (item.lotes.length > 1 || item.lotes[0].lote) && <p>Lotes encontrados: <b>{item.lotes.map((l) => `${l.lote ? "Lote " + l.lote + " · " : ""}${formatarData(l.validade)}`).join(" · ")}</b></p>}
            {item.conferido_por && <p>Conferido por <b>{item.conferido_por}</b> às {formatarHora(item.conferido_em)}{item.versao > 1 ? ` · corrigido ${item.versao - 1}x` : ""}</p>}
            {item.observacao && <p style={{ background: T.chipBg }} className="rounded-xl p-3">{item.observacao}</p>}
            {item.foto_conferencia && <img src={item.foto_conferencia} alt="foto da conferência" className="rounded-xl max-h-64 object-contain" />}
          </div>
        </GestaoSheet>
      )}
    </div>
  );
}

// ---------- NOVA RONDA ----------
function NovaRondaSheet({ T, perfil, lojaAtiva, catalog, equipe, showToast, preSetor, preConfig, onClose, onCriada }) {
  const nivel = perfil?.cargos?.nivel ?? 99;
  const meuSetor = (perfil?.setor || "").toLowerCase();
  // setores = os que têm produtos cadastrados no banco (nada de lista fixa)
  const setoresDoBanco = useMemo(() => {
    const cont = {};
    Object.values(catalog || {}).forEach((p) => { if (p?.setor) { const sp = setorPrincipal(p.setor); cont[sp] = (cont[sp] || 0) + 1; } });
    return Object.entries(cont).sort((a, b) => a[0].localeCompare(b[0])).filter(([s]) => nivel <= 4 || s.toLowerCase() === meuSetor);
  }, [catalog, nivel, meuSetor]);
  const [setores, setSetores] = useState(preSetor && setoresDoBanco.some(([s]) => s === preSetor) ? [preSetor] : (setoresDoBanco.length === 1 ? [setoresDoBanco[0][0]] : []));
  const [subSel, setSubSel] = useState([]); // vazio = todos os subsetores
  const subsetoresDoSetor = useMemo(() => {
    if (setores.length !== 1) return [];
    const m = {};
    Object.values(catalog || {}).forEach((p) => { if (p?.setor && setorPrincipal(p.setor) === setores[0]) { const k = subsetorEfetivo(p.setor, p.subsetor) || "(sem subsetor)"; m[k] = (m[k] || 0) + 1; } });
    const ks = Object.keys(m); return ks.length > 1 || (ks.length === 1 && ks[0] !== "(sem subsetor)") ? ks.sort().map((k) => [k, m[k]]) : [];
  }, [catalog, setores.join("|")]);
  useEffect(() => { setSubSel([]); }, [setores.join("|")]);
  const [nome, setNome] = useState(preConfig?.nome || "");
  const [sel, setSel] = useState([]);
  // Ronda inteligente: modo de conferência + risco por produto (calculado no banco a partir do histórico)
  const [modo, setModo] = useState(preConfig?.modo || "completa");
  const [quantidade, setQuantidade] = useState(String(preConfig?.quantidade || 10));
  const [escolhidos, setEscolhidos] = useState(preConfig?.barcodes || []);
  const [buscaProd, setBuscaProd] = useState("");
  const [riscos, setRiscos] = useState({});
  useEffect(() => {
    if (setores.length !== 1 || !lojaAtiva?.id) { setRiscos({}); return; }
    let vivo = true;
    supabase.rpc("analise_risco_produtos", { p_loja: lojaAtiva.id, p_setor: setores[0] }).then(({ data }) => {
      if (vivo) setRiscos(Object.fromEntries((data || []).map((r) => [r.barcode, r])));
    });
    return () => { vivo = false; };
  }, [setores.join("|"), lojaAtiva?.id]);
  const produtosDoSetor = useMemo(() => {
    if (setores.length !== 1) return [];
    return Object.entries(catalog || {}).map(([cod, p]) => ({ ...p, barcode: p?.barcode || cod })).filter((p) => p?.setor && setorPrincipal(p.setor) === setores[0]
      && (!subSel.length || subSel.includes(subsetorEfetivo(p.setor, p.subsetor) || "(sem subsetor)")))
      .map((p) => ({ barcode: p.barcode, nome: p.nome, risco: riscos[p.barcode]?.score ?? null, nivel: riscos[p.barcode]?.nivel }))
      .sort((a, b) => (b.risco ?? -1) - (a.risco ?? -1) || a.nome.localeCompare(b.nome));
  }, [catalog, setores.join("|"), subSel.join("|"), riscos]);
  const [outrosSetores, setOutrosSetores] = useState(false);
  const [inicio, setInicio] = useState(paraInputDataHora(new Date()));
  const [prazo, setPrazo] = useState("");
  const [obs, setObs] = useState(preConfig?.obs || "");
  const [ocupado, setOcupado] = useState(false);
  const setoresLower = setores.map((s) => s.toLowerCase());
  const candidatos = (equipe || []).filter((u) => (nivel <= 4 && outrosSetores) || setoresLower.includes((u.setor || "").toLowerCase()));
  useEffect(() => { setSel((p) => p.filter((id) => candidatos.some((u) => u.id === id))); }, [setores.join("|"), outrosSetores]);
  const totalProdutos = subSel.length ? subsetoresDoSetor.filter(([k]) => subSel.includes(k)).reduce((a, [, n]) => a + n, 0) : setores.reduce((a, s) => a + (setoresDoBanco.find(([x]) => x === s)?.[1] || 0), 0);
  const campo = { background: T.inputBg, color: T.text, borderColor: T.inputBorder };
  async function criar() {
    setOcupado(true);
    // um setor → ronda inteligente (modos completa/priorizada/amostragem/manual, com risco por item);
    // vários setores (gerência) → fluxo original, uma ronda completa por setor
    const { error } = setores.length === 1
      ? await supabase.rpc("criar_ronda_inteligente", {
          p_setor: setores[0], p_nome: nome.trim() || null, p_participantes: sel, p_inicio: new Date(inicio).toISOString(),
          p_prazo: prazo ? new Date(prazo).toISOString() : null, p_obs: obs.trim() || null, p_loja: lojaAtiva?.id || null,
          p_subsetores: subSel.length ? subSel : null, p_modo: modo,
          p_quantidade: modo === "amostragem" ? Math.max(1, parseInt(quantidade, 10) || 0) : null,
          p_barcodes: modo === "manual" ? escolhidos : null, p_acao: preConfig?.acaoId || null,
        })
      : await supabase.rpc("criar_ronda", {
          p_setores: setores, p_nome: nome.trim() || null, p_participantes: sel, p_inicio: new Date(inicio).toISOString(),
          p_prazo: prazo ? new Date(prazo).toISOString() : null, p_obs: obs.trim() || null, p_loja: lojaAtiva?.id || null,
          p_subsetores: subSel.length ? subSel : null,
        });
    setOcupado(false);
    if (error) { showToast(erroRonda(error), "warn"); return; }
    showToast(setores.length > 1 ? `${setores.length} rondas criadas.` : "Ronda criada. Os funcionários já foram avisados.");
    onCriada();
  }
  const modoOk = setores.length !== 1 || modo === "completa" || modo === "priorizada" || (modo === "amostragem" && parseInt(quantidade, 10) > 0) || (modo === "manual" && escolhidos.length > 0);
  const pronto = setores.length > 0 && sel.length > 0 && !!inicio && modoOk;
  return (
    <GestaoSheet T={T} larga title="Iniciar nova ronda" subtitle={`Loja ${lojaAtiva?.numero_loja ?? "—"} · a lista de produtos é congelada agora`} onClose={onClose}>
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-4 lg:items-start">
        <div className="flex flex-col gap-3.5">
        {setoresDoBanco.length === 0 ? (
          <div style={{ background: "#FCF0DD", color: "#C2760C" }} className="rounded-xl p-3 text-xs font-semibold">{nivel === 5 ? "Seu setor não tem produtos cadastrados (ou você não tem setor definido no cadastro)." : "Nenhum setor com produtos cadastrados nessa loja."}</div>
        ) : (
          <GestaoCampo T={T} label={nivel <= 4 ? "Setores fiscalizados" : "Setor"} hint={nivel <= 4 ? "Marque mais de um para criar uma ronda por setor." : "Você cria rondas só para o seu setor."}>
            <div className="flex flex-wrap gap-2">
              {setoresDoBanco.map(([s, n]) => {
                const on = setores.includes(s);
                return <button key={s} onClick={() => setSetores((p) => (nivel <= 4 ? (on ? p.filter((x) => x !== s) : [...p, s]) : [s]))} style={on ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }} className="rounded-xl px-3 py-2 text-xs font-semibold">{s} <span className="opacity-70">· {n}</span></button>;
              })}
            </div>
          </GestaoCampo>
        )}
        {subsetoresDoSetor.length > 0 && (
          <GestaoCampo T={T} label={`Subsetores de ${setores[0]}`} hint="Toque para escolher quais entram na ronda. Sem escolher nenhum, entram todos.">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSubSel([])} style={subSel.length === 0 ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }} className="rounded-xl px-3 py-2 text-xs font-semibold">Todos</button>
              {subsetoresDoSetor.map(([k, n]) => {
                const on = subSel.includes(k);
                return <button key={k} onClick={() => setSubSel((p) => (on ? p.filter((x) => x !== k) : [...p, k]))} style={on ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }} className="rounded-xl px-3 py-2 text-xs font-semibold">{k} <span className="opacity-70">· {n}</span></button>;
              })}
            </div>
          </GestaoCampo>
        )}
        {setores.length === 1 && (
          <GestaoCampo T={T} label="Tipo de conferência" hint="O risco de cada produto vem do histórico (vencimentos, irregularidades, perdas, lote atual e tempo sem conferir). Risco alto não quer dizer que está vencido.">
            <div className="grid grid-cols-2 gap-2">
              {MODOS_RONDA.map((m) => (
                <button key={m.id} onClick={() => setModo(m.id)} style={modo === m.id ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }} className="rounded-xl px-3 py-2 text-left">
                  <p className="text-xs font-bold">{m.label}</p><p className="text-[10.5px] opacity-75 leading-tight">{m.desc}</p>
                </button>
              ))}
            </div>
            {modo === "amostragem" && (
              <div className="mt-2 flex items-center gap-2 text-xs"><span>Quantos produtos?</span>
                <input value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" style={campo} className="w-20 border rounded-xl px-2.5 py-2 text-sm outline-none" />
                <span style={{ color: T.subtext }}>de {produtosDoSetor.length}</span></div>
            )}
            {modo === "manual" && (
              <div className="mt-2 flex flex-col gap-1.5">
                <input value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)} placeholder="Buscar produto" style={campo} className="w-full border rounded-xl px-3 py-2 text-sm outline-none" />
                <p style={{ color: T.subtext }} className="text-[10.5px]">{escolhidos.length} selecionado(s) · ordenados do maior para o menor risco</p>
                <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                  {produtosDoSetor.filter((p) => !buscaProd.trim() || p.nome.toLowerCase().includes(buscaProd.toLowerCase()) || (p.barcode || "").includes(buscaProd.trim())).slice(0, 150).map((p) => {
                    const on = escolhidos.includes(p.barcode);
                    return <label key={p.barcode} style={{ background: on ? BLUE_SOFT : T.chipBg }} className="rounded-xl px-3 py-2 flex items-center gap-2 text-[12.5px] cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => setEscolhidos((x) => (on ? x.filter((b) => b !== p.barcode) : [...x, p.barcode]))} />
                      <span className="flex-1 min-w-0 truncate">{p.nome}</span><SeloRisco risco={p.risco} nivel={p.nivel} /></label>;
                  })}
                </div>
              </div>
            )}
          </GestaoCampo>
        )}
        </div>
        <div className="flex flex-col gap-3.5">
        <GestaoCampo T={T} label="Nome da ronda (opcional)"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={setores[0] ? `Conferência de ${setores[0]}` : "Ex.: Conferência de validade"} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" /></GestaoCampo>
        <GestaoCampo T={T} label="Quem vai executar" hint={setores.length ? `Só aparecem funcionários vinculados ao setor${setores.length > 1 ? "s escolhidos" : ""}.` : "Escolha o setor primeiro."}>
          <div className="flex flex-col gap-1.5">
            {setores.length > 0 && candidatos.length > 0 && <button onClick={() => setSel(sel.length === candidatos.length ? [] : candidatos.map((u) => u.id))} style={{ color: BLUE }} className="text-xs font-semibold text-left">{sel.length === candidatos.length ? "Desmarcar todos" : "Selecionar equipe inteira"}</button>}
            {candidatos.map((u) => {
              const on = sel.includes(u.id);
              return <label key={u.id} style={{ background: on ? BLUE_SOFT : T.chipBg }} className="rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-sm cursor-pointer"><input type="checkbox" checked={on} onChange={() => setSel((p) => (on ? p.filter((x) => x !== u.id) : [...p, u.id]))} /><span className="flex-1 min-w-0 truncate font-medium">{u.nome}</span><span style={{ color: T.subtext }} className="text-[10.5px]">{u.setor || "sem setor"}</span></label>;
            })}
            {setores.length > 0 && candidatos.length === 0 && <p style={{ color: "#C2760C" }} className="text-xs font-semibold">Nenhum funcionário vinculado a esse setor. Defina o setor dele em Funcionários.</p>}
            {nivel <= 4 && setores.length > 0 && <label className="text-[11px] flex items-center gap-2" style={{ color: T.subtext }}><input type="checkbox" checked={outrosSetores} onChange={(e) => setOutrosSetores(e.target.checked)} /> Mostrar funcionários de outros setores (gerência)</label>}
          </div>
        </GestaoCampo>
        <div className="grid grid-cols-1 gap-3">
          <GestaoCampo T={T} label="Início"><input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} style={campo} className="w-full border rounded-xl px-2.5 py-2.5 text-sm outline-none" /></GestaoCampo>
          <GestaoCampo T={T} label="Prazo (opcional)"><input type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={campo} className="w-full border rounded-xl px-2.5 py-2.5 text-sm outline-none" /></GestaoCampo>
        </div>
        <GestaoCampo T={T} label="Instruções (opcional)"><textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={300} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" /></GestaoCampo>
        </div>
        {setores.length > 0 && <p style={{ color: T.subtext }} className="text-[11.5px] lg:col-span-2">{setores.length === 1 && modo === "amostragem" ? `${Math.min(parseInt(quantidade, 10) || 0, totalProdutos)} de ${totalProdutos} produto(s) entram na amostra` : setores.length === 1 && modo === "manual" ? `${escolhidos.length} produto(s) escolhido(s)` : `${totalProdutos} produto(s) cadastrado(s) serão carregados${setores.length > 1 ? " (somando os setores)" : ""}`}{setores.length === 1 && modo !== "completa" ? " — os de maior risco aparecem primeiro para o funcionário" : ""}. Produtos cadastrados depois não entram nesta ronda.</p>}
        <button onClick={criar} disabled={!pronto || ocupado} style={{ background: pronto ? "#1F9D55" : "#C7CEDA", color: "#fff" }} className="lg:col-span-2 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
          {ocupado ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Criar ronda
        </button>
      </div>
    </GestaoSheet>
  );
}

// ============================================================================
// RONDA OPERACIONAL: ocorrências, tarefas, aprovação e relatórios
// ============================================================================
function usarOcorrencias(lojaId) {
  const [lista, setLista] = useState(null);
  const carregar = useCallback(async () => {
    if (!lojaId) { setLista([]); return; }
    const { data, error } = await supabase.from("ocorrencias").select("*").eq("loja_id", lojaId).order("criado_em", { ascending: false }).limit(1000);
    if (!error) setLista(data || []); else setLista((p) => p || []);
  }, [lojaId]);
  useEffect(() => {
    carregar();
    let t = null;
    const agenda = () => { clearTimeout(t); t = setTimeout(carregar, 400); };
    const canal = supabase.channel(`ocorrencias-${lojaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ocorrencias" }, agenda)
      .subscribe();
    const vis = () => { if (document.visibilityState !== "hidden") carregar(); };
    document.addEventListener("visibilitychange", vis); window.addEventListener("online", vis);
    return () => { clearTimeout(t); supabase.removeChannel(canal); document.removeEventListener("visibilitychange", vis); window.removeEventListener("online", vis); };
  }, [lojaId, carregar]);
  return { lista, recarregar: carregar };
}

const PRIO = Object.fromEntries(PRIORIDADES.map((p) => [p.id, p]));

const CAT = Object.fromEntries(CATEGORIAS_OCORRENCIA.map((c) => [c.id, c.label]));

function BadgeOcorrencia({ o }) {
  const ef = statusOcorrenciaEfetivo(o);
  const s = ef === "atrasada" ? { label: "Atrasada", bg: RED_SOFT, color: RED_DARK } : ef === "vence_logo" ? { label: "Vence logo", bg: "#FCF0DD", color: "#C2760C" } : OCORRENCIA_STATUS[o.status];
  return <DashBadge bg={s.bg} color={s.color}>{s.label}</DashBadge>;
}

function CartaoOcorrencia({ T, o, onClick }) {
  const p = PRIO[o.prioridade];
  const ef = statusOcorrenciaEfetivo(o);
  return (
    <button onClick={onClick} style={{ background: T.card, borderColor: ef === "atrasada" ? RED : T.border, borderLeftWidth: 4, borderLeftColor: p.color }} className="border rounded-2xl p-3 text-left w-full">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug line-clamp-2">{o.descricao}</p>
        <BadgeOcorrencia o={o} />
      </div>
      <div style={{ color: T.subtext }} className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] mt-1.5">
        <span>{o.setor} · {CAT[o.categoria]}</span>
        <span style={{ color: p.color }} className="font-bold">{p.label}</span>
        <span>{o.responsavel_nome ? `👤 ${o.responsavel_nome}` : "sem responsável"}</span>
        {o.prazo && <span>⏰ {formatarDataHoraExtenso(o.prazo)}</span>}
      </div>
    </button>
  );
}

// ---------- NOVA OCORRÊNCIA ----------
function NovaOcorrenciaSheet({ T, perfil, lojaAtiva, catalog, equipe, rondaId, showToast, onClose, onCriada }) {
  const nivel = perfil?.cargos?.nivel ?? 99;
  const meuSetor = (perfil?.setor || "").toLowerCase();
  const setores = useMemo(() => [...new Set(Object.values(catalog || {}).map((p) => p?.setor && setorPrincipal(p.setor)).filter(Boolean))].sort().filter((s) => nivel <= 4 || s.toLowerCase() === meuSetor), [catalog, nivel, meuSetor]);
  const [setor, setSetor] = useState(setores.length === 1 ? setores[0] : "");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [resp, setResp] = useState("");
  const [prazo, setPrazo] = useState("");
  const [foto, setFoto] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const candidatos = (equipe || []).filter((u) => (nivel <= 4) ? true : (u.setor || "").toLowerCase() === setor.toLowerCase()).filter((u) => nivel > 4 || !setor || (u.setor || "").toLowerCase() === setor.toLowerCase());
  const campo = { background: T.inputBg, color: T.text, borderColor: T.inputBorder };
  async function pegarFoto(e) { const f = e.target.files?.[0]; if (f) try { setFoto(await compressImage(f, 800, 0.6)); } catch { /* ignora */ } }
  async function salvar(rascunho) {
    setOcupado(true);
    const { error } = await supabase.rpc("criar_ocorrencia", {
      p_setor: setor, p_categoria: categoria, p_descricao: descricao, p_prioridade: prioridade, p_responsavel: resp || null,
      p_prazo: prazo ? new Date(prazo).toISOString() : null, p_foto: foto, p_ronda: rondaId || null, p_rascunho: rascunho, p_loja: lojaAtiva?.id || null,
    });
    setOcupado(false);
    if (error) { showToast(erroRonda(error), "warn"); return; }
    showToast(rascunho ? "Rascunho salvo." : "Tarefa criada. O funcionário foi avisado.");
    onCriada();
  }
  const base = !!setor && !!categoria && descricao.trim().length > 2;
  const completo = base && !!resp && !!prazo;
  return (
    <GestaoSheet T={T} title="Nova ocorrência" subtitle="Registre o problema e designe quem resolve" onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <GestaoCampo T={T} label="Setor"><select value={setor} onChange={(e) => { setSetor(e.target.value); setResp(""); }} style={campo} className="w-full border rounded-xl px-2.5 py-2.5 text-sm outline-none"><option value="">Selecione…</option>{setores.map((s) => <option key={s}>{s}</option>)}</select></GestaoCampo>
          <GestaoCampo T={T} label="Categoria"><select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={campo} className="w-full border rounded-xl px-2.5 py-2.5 text-sm outline-none"><option value="">Selecione…</option>{CATEGORIAS_OCORRENCIA.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></GestaoCampo>
        </div>
        <GestaoCampo T={T} label="O que está acontecendo?"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={500} placeholder="Ex.: Banana prata sem etiqueta de preço na gôndola central" style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" /></GestaoCampo>
        <GestaoCampo T={T} label="Prioridade">
          <div className="grid grid-cols-4 gap-2">{PRIORIDADES.map((p) => <button key={p.id} onClick={() => setPrioridade(p.id)} style={prioridade === p.id ? { background: p.color, color: "#fff" } : { background: p.bg, color: p.color }} className="rounded-xl py-2.5 text-xs font-bold">{p.label}</button>)}</div>
        </GestaoCampo>
        <GestaoCampo T={T} label="Responsável" hint={nivel === 5 ? "Você só pode designar funcionários do seu setor." : undefined}>
          <select value={resp} onChange={(e) => setResp(e.target.value)} disabled={!setor} style={campo} className="w-full border rounded-xl px-2.5 py-2.5 text-sm outline-none"><option value="">{setor ? "Selecione…" : "Escolha o setor primeiro"}</option>{candidatos.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.setor ? ` · ${u.setor}` : ""}</option>)}</select>
        </GestaoCampo>
        <GestaoCampo T={T} label="Prazo"><input type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={campo} className="w-full border rounded-xl px-2.5 py-2.5 text-sm outline-none" /></GestaoCampo>
        <div className="flex items-center gap-3">
          <label style={{ background: T.chipBg, color: T.text }} className="rounded-xl px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 cursor-pointer"><Camera size={15} /> {foto ? "Trocar foto" : "Anexar foto"}<input type="file" accept="image/*" capture="environment" onChange={pegarFoto} className="hidden" /></label>
          {foto && <img src={foto} alt="" className="h-12 w-12 rounded-lg object-cover" />}
        </div>
        <div className="flex gap-2">
          <button onClick={() => salvar(true)} disabled={!base || ocupado} style={{ background: T.chipBg, color: T.text }} className="flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-50">Salvar rascunho</button>
          <button onClick={() => salvar(false)} disabled={!completo || ocupado} style={{ background: completo ? BLUE : "#C7CEDA", color: "#fff" }} className="flex-[1.4] py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2">{ocupado && <Loader2 size={15} className="animate-spin" />} Criar e designar</button>
        </div>
      </div>
    </GestaoSheet>
  );
}

// ---------- DETALHE: histórico + ações ----------
function OcorrenciaDetalhe({ T, id, perfil, equipe, showToast, onClose, onMudou }) {
  const [o, setO] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [modo, setModo] = useState(null); // concluir | reprovar | reatribuir
  const [texto, setTexto] = useState(""); const [foto, setFoto] = useState(null);
  const [novoResp, setNovoResp] = useState(""); const [novoPrazo, setNovoPrazo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from("ocorrencias").select("*").eq("id", id).maybeSingle(), supabase.from("ocorrencia_eventos").select("*").eq("ocorrencia_id", id).order("criado_em")]);
    if (a.data) setO(a.data); setEventos(b.data || []);
  }, [id]);
  useEffect(() => {
    carregar();
    const c = supabase.channel(`oc-${id}`).on("postgres_changes", { event: "*", schema: "public", table: "ocorrencias", filter: `id=eq.${id}` }, carregar).subscribe();
    return () => supabase.removeChannel(c);
  }, [id, carregar]);
  if (!o) return <GestaoSheet T={T} title="Ocorrência" onClose={onClose}><Loader2 className="animate-spin mx-auto" color={T.subtext} /></GestaoSheet>;
  const nivel = perfil?.cargos?.nivel ?? 99;
  const souResp = o.responsavel_id === perfil?.id;
  const gestor = nivel <= 5;
  const pode_aprovar = gestor && !souResp && o.status === "aguardando_aprovacao";
  const campo = { background: T.inputBg, color: T.text, borderColor: T.inputBorder };
  async function chamar(fn, args, ok) {
    setOcupado(true);
    const { error } = await supabase.rpc(fn, args);
    setOcupado(false);
    if (error) { showToast(erroRonda(error), "warn"); carregar(); return; }
    showToast(ok); setModo(null); setTexto(""); setFoto(null); await carregar(); onMudou();
  }
  async function pegarFoto(e) { const f = e.target.files?.[0]; if (f) try { setFoto(await compressImage(f, 800, 0.6)); } catch { /* ignora */ } }
  const candidatos = (equipe || []).filter((u) => nivel <= 4 || (u.setor || "").toLowerCase() === (o.setor || "").toLowerCase());
  return (
    <GestaoSheet T={T} title="Ocorrência" subtitle={`${o.setor} · ${CAT[o.categoria]}`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-[13px]">
        <div className="flex gap-2 flex-wrap"><BadgeOcorrencia o={o} /><DashBadge bg={PRIO[o.prioridade].bg} color={PRIO[o.prioridade].color}>{PRIO[o.prioridade].label}</DashBadge></div>
        <p className="text-sm font-semibold">{o.descricao}</p>
        {o.foto && <img src={o.foto} alt="" className="rounded-xl max-h-56 object-contain" />}
        <div style={{ color: T.subtext }} className="grid grid-cols-2 gap-y-1 text-[12px]">
          <span>Responsável: <b style={{ color: T.text }}>{o.responsavel_nome || "—"}</b></span><span>Prazo: <b style={{ color: T.text }}>{o.prazo ? formatarDataHoraExtenso(o.prazo) : "—"}</b></span>
          <span>Criada por: <b style={{ color: T.text }}>{o.criado_por_nome}</b></span><span>Reprovações: <b style={{ color: T.text }}>{o.reprovacoes}</b></span>
        </div>
        {o.obs_execucao && <div style={{ background: T.chipBg }} className="rounded-xl p-3"><b>Retorno do funcionário:</b> {o.obs_execucao}{o.foto_conclusao && <img src={o.foto_conclusao} alt="" className="rounded-lg mt-2 max-h-48 object-contain" />}</div>}
        {o.justificativa_reprovacao && o.status === "reprovada" && <div style={{ background: RED_SOFT, color: RED_DARK }} className="rounded-xl p-3 font-semibold">Reprovada: {o.justificativa_reprovacao}</div>}

        <div className="flex gap-2 flex-wrap">
          {souResp && (o.status === "pendente" || o.status === "reprovada") && <button disabled={ocupado} onClick={() => chamar("iniciar_tarefa", { p_id: id }, "Tarefa iniciada.")} style={{ background: BLUE, color: "#fff" }} className="flex-1 min-w-[9rem] py-2.5 rounded-2xl text-sm font-bold">Iniciar tarefa</button>}
          {souResp && (o.status === "em_andamento" || o.status === "pendente" || o.status === "reprovada") && <button onClick={() => setModo("concluir")} style={{ background: "#1F9D55", color: "#fff" }} className="flex-1 min-w-[9rem] py-2.5 rounded-2xl text-sm font-bold">Concluir tarefa</button>}
          {pode_aprovar && <button disabled={ocupado} onClick={() => chamar("aprovar_tarefa", { p_id: id }, "Tarefa aprovada.")} style={{ background: "#1F9D55", color: "#fff" }} className="flex-1 min-w-[9rem] py-2.5 rounded-2xl text-sm font-bold">Aprovar</button>}
          {pode_aprovar && <button onClick={() => setModo("reprovar")} style={{ background: RED_DARK, color: "#fff" }} className="flex-1 min-w-[9rem] py-2.5 rounded-2xl text-sm font-bold">Reprovar</button>}
          {gestor && o.status !== "concluida" && <button onClick={() => { setModo("reatribuir"); setNovoResp(o.responsavel_id || ""); setNovoPrazo(o.prazo ? paraInputDataHora(new Date(o.prazo)) : ""); }} style={{ background: T.chipBg, color: T.text }} className="flex-1 min-w-[9rem] py-2.5 rounded-2xl text-sm font-bold">{o.status === "rascunho" ? "Designar" : "Reatribuir / prazo"}</button>}
        </div>

        {modo === "concluir" && <div className="flex flex-col gap-2"><textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="O que foi feito? (opcional)" style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
          <div className="flex items-center gap-3"><label style={{ background: T.chipBg }} className="rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-2 cursor-pointer"><Camera size={14} /> Foto da solução<input type="file" accept="image/*" capture="environment" onChange={pegarFoto} className="hidden" /></label>{foto && <img src={foto} alt="" className="h-10 w-10 rounded object-cover" />}</div>
          <button disabled={ocupado} onClick={() => chamar("concluir_tarefa", { p_id: id, p_obs: texto.trim() || null, p_foto: foto }, "Enviada para aprovação.")} style={{ background: "#1F9D55", color: "#fff" }} className="py-2.5 rounded-xl text-sm font-bold">Enviar para aprovação</button></div>}
        {modo === "reprovar" && <div className="flex flex-col gap-2"><textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Justificativa (obrigatória)" style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
          <button disabled={ocupado || !texto.trim()} onClick={() => chamar("reprovar_tarefa", { p_id: id, p_justificativa: texto }, "Tarefa devolvida para correção.")} style={{ background: texto.trim() ? RED_DARK : "#C7CEDA", color: "#fff" }} className="py-2.5 rounded-xl text-sm font-bold">Confirmar reprovação</button></div>}
        {modo === "reatribuir" && <div className="flex flex-col gap-2">
          <select value={novoResp} onChange={(e) => setNovoResp(e.target.value)} style={campo} className="w-full border rounded-xl px-2.5 py-2.5 text-sm outline-none"><option value="">Selecione o responsável…</option>{candidatos.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.setor ? ` · ${u.setor}` : ""}</option>)}</select>
          <input type="datetime-local" value={novoPrazo} onChange={(e) => setNovoPrazo(e.target.value)} style={campo} className="w-full border rounded-xl px-2.5 py-2.5 text-sm outline-none" />
          <button disabled={ocupado || !novoResp || !novoPrazo} onClick={() => chamar("designar_ocorrencia", { p_id: id, p_responsavel: novoResp, p_prazo: new Date(novoPrazo).toISOString() }, "Designação salva.")} style={{ background: novoResp && novoPrazo ? BLUE : "#C7CEDA", color: "#fff" }} className="py-2.5 rounded-xl text-sm font-bold">Salvar</button></div>}

        <div>
          <p className="text-xs font-bold mb-2">Histórico</p>
          <div style={{ borderColor: T.border }} className="border-l-2 pl-3 flex flex-col gap-2.5">
            {eventos.map((e) => (
              <div key={e.id} className="text-[12px]">
                <p><b>{EVENTO_TEXTO[e.tipo] || e.tipo}</b>{e.dados?.responsavel ? ` → ${e.dados.responsavel}` : ""}{e.dados?.para ? ` → ${e.dados.para}` : ""}{e.dados?.justificativa ? `: ${e.dados.justificativa}` : ""}</p>
                <p style={{ color: T.subtext }} className="text-[10.5px]">{e.usuario_nome || "—"} · {formatarDataHoraExtenso(e.criado_em)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GestaoSheet>
  );
}

// ---------- PAINEL DE OCORRÊNCIAS (gestor) ----------
function OcorrenciasPainel({ T, perfil, lojaAtiva, catalog, equipe, showToast }) {
  const { lista, recarregar } = usarOcorrencias(lojaAtiva?.id);
  const [fSetor, setFSetor] = useState(""); const [fFunc, setFFunc] = useState(""); const [fStatus, setFStatus] = useState("");
  const [fPrio, setFPrio] = useState(""); const [fPeriodo, setFPeriodo] = useState(""); const [busca, setBusca] = useState("");
  const [nova, setNova] = useState(false); const [aberta, setAberta] = useState(null);
  if (!lista) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin" color={T.subtext} /></div>;
  const ef = (o) => statusOcorrenciaEfetivo(o);
  const dias = fPeriodo ? Number(fPeriodo) : null;
  const filtrada = lista.filter((o) => (!fSetor || o.setor === fSetor) && (!fFunc || o.responsavel_id === fFunc)
    && (!fStatus || (fStatus === "atrasada" ? ef(o) === "atrasada" : o.status === fStatus))
    && (!fPrio || o.prioridade === fPrio) && (!dias || Date.now() - new Date(o.criado_em).getTime() <= dias * 86400000)
    && (!busca || o.descricao.toLowerCase().includes(busca.toLowerCase()) || (o.responsavel_nome || "").toLowerCase().includes(busca.toLowerCase())));
  const k = { pendente: 0, em_andamento: 0, aguardando_aprovacao: 0, concluida: 0, atrasada: 0 };
  lista.forEach((o) => { if (o.status !== "rascunho") { k[o.status] = (k[o.status] || 0) + 1; if (ef(o) === "atrasada") k.atrasada++; } });
  const setoresLista = [...new Set(lista.map((o) => o.setor))].sort();
  const funcs = [...new Map(lista.filter((o) => o.responsavel_id).map((o) => [o.responsavel_id, o.responsavel_nome])).entries()];
  const sel = { background: T.inputBg, color: T.text, borderColor: T.inputBorder };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <DashKpi T={T} label="Total" value={lista.filter((o) => o.status !== "rascunho").length} accent={BLUE} />
        <DashKpi T={T} label="Pendentes" value={k.pendente} accent="#4B5563" />
        <DashKpi T={T} label="Em andamento" value={k.em_andamento} accent="#1F5FBF" />
        <DashKpi T={T} label="Aguardando aprovação" value={k.aguardando_aprovacao} accent="#6B3FB0" />
        <DashKpi T={T} label="Concluídas" value={k.concluida} accent="#1F9D55" />
        <DashKpi T={T} label="Atrasadas" value={k.atrasada} accent={RED_DARK} />
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição ou funcionário" style={sel} className="border rounded-xl px-3 py-2 text-xs outline-none flex-1 min-w-[10rem]" />
        <select value={fSetor} onChange={(e) => setFSetor(e.target.value)} style={sel} className="border rounded-xl px-2 py-2 text-xs"><option value="">Setor</option>{setoresLista.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={fFunc} onChange={(e) => setFFunc(e.target.value)} style={sel} className="border rounded-xl px-2 py-2 text-xs"><option value="">Funcionário</option>{funcs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={sel} className="border rounded-xl px-2 py-2 text-xs"><option value="">Status</option>{Object.entries(OCORRENCIA_STATUS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}<option value="atrasada">Atrasadas</option></select>
        <select value={fPrio} onChange={(e) => setFPrio(e.target.value)} style={sel} className="border rounded-xl px-2 py-2 text-xs"><option value="">Prioridade</option>{PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <select value={fPeriodo} onChange={(e) => setFPeriodo(e.target.value)} style={sel} className="border rounded-xl px-2 py-2 text-xs"><option value="">Período</option><option value="1">Hoje</option><option value="7">7 dias</option><option value="30">30 dias</option></select>
        <button onClick={() => setNova(true)} style={{ background: BLUE, color: "#fff" }} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"><Plus size={14} /> Nova ocorrência</button>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {filtrada.map((o) => <CartaoOcorrencia key={o.id} T={T} o={o} onClick={() => setAberta(o.id)} />)}
        {filtrada.length === 0 && <p style={{ color: T.subtext }} className="text-sm text-center py-10 col-span-full">Nenhuma ocorrência nesses filtros.</p>}
      </div>
      {nova && <NovaOcorrenciaSheet T={T} perfil={perfil} lojaAtiva={lojaAtiva} catalog={catalog} equipe={equipe} showToast={showToast} onClose={() => setNova(false)} onCriada={() => { setNova(false); recarregar(); }} />}
      {aberta && <OcorrenciaDetalhe T={T} id={aberta} perfil={perfil} equipe={equipe} showToast={showToast} onClose={() => setAberta(null)} onMudou={recarregar} />}
    </div>
  );
}

// ---------- MINHAS TAREFAS (funcionário) ----------
function MinhasTarefas({ T, perfil, lojaAtiva, equipe, showToast }) {
  const { lista, recarregar } = usarOcorrencias(lojaAtiva?.id);
  const [aberta, setAberta] = useState(null);
  const [aba, setAba] = useState("abertas");
  if (!lista) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin" color={T.subtext} /></div>;
  const minhas = lista.filter((o) => o.responsavel_id === perfil?.id && o.status !== "rascunho");
  const abertas = minhas.filter((o) => o.status !== "concluida"), feitas = minhas.filter((o) => o.status === "concluida");
  const mostrar = aba === "abertas" ? abertas : feitas;
  return (
    <div className="flex flex-col gap-3">
      <DashTabs T={T} value={aba} onChange={setAba} options={[{ id: "abertas", label: `Abertas (${abertas.length})` }, { id: "feitas", label: `Concluídas (${feitas.length})` }]} />
      {mostrar.length === 0 && <p style={{ color: T.subtext }} className="text-sm text-center py-10">{aba === "abertas" ? "Nenhuma tarefa para você agora." : "Nada concluído ainda."}</p>}
      <div className="grid gap-2 lg:grid-cols-2">{mostrar.map((o) => <CartaoOcorrencia key={o.id} T={T} o={o} onClick={() => setAberta(o.id)} />)}</div>
      {aberta && <OcorrenciaDetalhe T={T} id={aberta} perfil={perfil} equipe={equipe} showToast={showToast} onClose={() => setAberta(null)} onMudou={recarregar} />}
    </div>
  );
}

// ---------- RELATÓRIOS ----------
function RelatoriosRonda({ T, lojaAtiva, rondasLista }) {
  const { lista } = usarOcorrencias(lojaAtiva?.id);
  const [per, setPer] = useState("30");
  if (!lista) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin" color={T.subtext} /></div>;
  const base = lista.filter((o) => o.status !== "rascunho" && Date.now() - new Date(o.criado_em).getTime() <= Number(per) * 86400000);
  const conc = base.filter((o) => o.status === "concluida");
  const atras = base.filter((o) => statusOcorrenciaEfetivo(o) === "atrasada");
  const pctConc = pctDe(conc.length, base.length);
  const tempos = conc.filter((o) => o.designado_em && o.concluido_em).map((o) => new Date(o.concluido_em) - new Date(o.designado_em));
  const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;
  const agrupa = (fn) => { const m = {}; base.forEach((o) => { const k2 = fn(o) || "—"; m[k2] = (m[k2] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const porSetor = agrupa((o) => o.setor), porCat = agrupa((o) => CAT[o.categoria]);
  const porFunc = {}; base.forEach((o) => { const n = o.responsavel_nome || "—"; porFunc[n] = porFunc[n] || { t: 0, c: 0 }; porFunc[n].t++; if (o.status === "concluida") porFunc[n].c++; });
  const semanas = {}; base.forEach((o) => { const d = new Date(o.criado_em); d.setDate(d.getDate() - d.getDay()); const key = d.toISOString().slice(0, 10); semanas[key] = (semanas[key] || 0) + 1; });
  const evol = Object.entries(semanas).sort();
  const rd = (rondasLista || []).filter((r) => Date.now() - new Date(r.criado_em).getTime() <= Number(per) * 86400000);
  return (
    <div className="flex flex-col gap-4">
      <DashTabs T={T} value={per} onChange={setPer} options={[{ id: "7", label: "7 dias" }, { id: "30", label: "30 dias" }, { id: "90", label: "90 dias" }]} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <DashKpi T={T} label="Ocorrências" value={base.length} accent={BLUE} />
        <DashKpi T={T} label="Conclusão" value={`${pctConc}%`} accent="#1F9D55" />
        <DashKpi T={T} label="Atrasadas" value={atras.length} accent={RED_DARK} />
        <DashKpi T={T} label="Tempo médio" value={tempoMedio ? fmtDuracao(tempoMedio) : "—"} accent="#6B3FB0" />
        <DashKpi T={T} label="Rondas" value={rd.length} sub={`${rd.filter((r) => r.status === "finalizada").length} finalizadas · ${rd.filter((r) => r.status === "encerrada_antecipada").length} antecipadas`} accent="#C98A0C" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DashCard T={T} title="Ocorrências por setor"><DashHBars T={T} data={porSetor.map(([l, v]) => ({ label: l, value: v, color: BLUE, right: String(v) }))} /></DashCard>
        <DashCard T={T} title="Ocorrências por categoria"><DashHBars T={T} data={porCat.map(([l, v]) => ({ label: l, value: v, color: "#6B3FB0", right: String(v) }))} /></DashCard>
        <DashCard T={T} title="Por funcionário (concluídas / total)"><DashHBars T={T} data={Object.entries(porFunc).sort((a, b) => b[1].t - a[1].t).slice(0, 10).map(([l, v]) => ({ label: l, value: v.t, color: "#1F9D55", right: `${v.c}/${v.t}` }))} /></DashCard>
        <DashCard T={T} title="Evolução semanal"><DashBars T={T} data={evol.map(([d, v]) => ({ label: d.slice(5).split("-").reverse().join("/"), parts: [{ value: v, color: BLUE }] }))} /></DashCard>
      </div>
      {base.length === 0 && <p style={{ color: T.subtext }} className="text-sm text-center">Sem ocorrências no período.</p>}
    </div>
  );
}

// ============================================================================
// TELA PRINCIPAL DA ABA "RONDAS"
// ============================================================================
function RondasView({ T, perfil, lojaAtiva, catalog, showToast, intent, onIntentUsada }) {
  const nivel = perfil?.cargos?.nivel ?? 99;
  const gestor = nivel <= 5;
  const [aba, setAba] = useState(gestor ? "rondas" : "minhas");
  const [lista, setLista] = useState(null);
  const [progresso, setProgresso] = useState({});
  const [equipe, setEquipe] = useState([]);
  const [nova, setNova] = useState(null); // null | { setor }
  const [aberta, setAberta] = useState(null); // { id, modo: "painel" | "exec" }
  const [filtro, setFiltro] = useState("todas");
  const lojaId = lojaAtiva?.id;

  const carregar = useCallback(async () => {
    if (!lojaId) { setLista([]); return; }
    const { data, error } = await supabase.from("rondas").select("*, ronda_participantes(usuario_id, nome)").eq("loja_id", lojaId).not("status", "in", "(concluida,parcial,pendente)").order("criado_em", { ascending: false }).limit(150);
    if (error) { console.error(error); setLista((p) => p || []); return; }
    setLista(data || []);
    const ativas = (data || []).filter((r) => ["agendada", "aguardando_inicio", "em_andamento"].includes(r.status)).map((r) => r.id);
    if (ativas.length) {
      const { data: it } = await supabase.from("ronda_itens").select("ronda_id, resultado").in("ronda_id", ativas).limit(20000);
      const p = {}; (it || []).forEach((x) => { p[x.ronda_id] = p[x.ronda_id] || { t: 0, c: 0 }; p[x.ronda_id].t++; if (x.resultado !== "pendente") p[x.ronda_id].c++; });
      setProgresso(p);
    }
  }, [lojaId]);
  useEffect(() => {
    carregar();
    let t = null; const agenda = () => { clearTimeout(t); t = setTimeout(carregar, 500); };
    const canal = supabase.channel(`rondas-lista-${lojaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rondas" }, agenda)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ronda_participantes" }, agenda)
      .subscribe();
    const vis = () => { if (document.visibilityState !== "hidden") carregar(); };
    document.addEventListener("visibilitychange", vis); window.addEventListener("online", vis);
    return () => { clearTimeout(t); supabase.removeChannel(canal); document.removeEventListener("visibilitychange", vis); window.removeEventListener("online", vis); };
  }, [lojaId, carregar]);
  useEffect(() => { if (gestor && lojaId) carregarEquipeLoja(lojaId).then(setEquipe); }, [gestor, lojaId]);
  useEffect(() => { if (intent?.novaSetor && gestor) { setNova({ setor: intent.novaSetor, modo: intent.modo, quantidade: intent.quantidade, barcodes: intent.barcodes, acaoId: intent.acaoId, nome: intent.nome, obs: intent.obs }); onIntentUsada?.(); } }, [intent]);

  function abrir(r) {
    const souPart = (r.ronda_participantes || []).some((p) => p.usuario_id === perfil?.id);
    const gerencia = r.criado_por === perfil?.id || gestor;
    setAberta({ id: r.id, modo: gerencia ? "painel" : souPart ? "exec" : "painel" });
  }
  if (!lista) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" color={T.subtext} /></div>;

  const emCurso = (r) => ["agendada", "aguardando_inicio", "em_andamento"].includes(r.status);
  const minhasRondas = lista.filter((r) => (r.ronda_participantes || []).some((p) => p.usuario_id === perfil?.id));
  const base = aba === "minhas" ? minhasRondas : lista;
  const filtrada = base.filter((r) => filtro === "todas" || (filtro === "ativas" ? emCurso(r) : !emCurso(r)));
  const abas = gestor ? [{ id: "rondas", label: "Rondas" }, { id: "minhas", label: "Minhas" }, { id: "ocorrencias", label: "Ocorrências" }, { id: "relatorios", label: "Relatórios" }]
    : [{ id: "minhas", label: "Minhas rondas" }, { id: "tarefas", label: "Minhas tarefas" }];
  return (
    <div className="px-4 pt-4 pb-6 lg:px-0 lg:pt-0">
      <PalcoPagina className="lg:hidden mb-4" titulo="Rondas" subtitulo={`Loja ${lojaAtiva?.numero_loja ?? "—"}${gestor ? "" : " · só o que foi designado a você"}`}
        acao={gestor && <motion.button whileTap={{ scale: 0.95 }} onClick={() => setNova({ setor: null })} className="bg-white px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 shadow-md shrink-0" style={{ color: BLUE_DARK }}><Plus size={14} /> Iniciar ronda</motion.button>}>
        <div className="grid grid-cols-3 gap-2">
          {[["Em curso", lista.filter(emCurso).length], ["Minhas", minhasRondas.length], ["Encerradas", lista.length - lista.filter(emCurso).length]].map(([r, n]) => (
            <div key={r} className="rounded-2xl py-2 text-center" style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.2)" }}>
              <p className="text-[20px] font-extrabold leading-none tabular-nums">{n}</p><p className="text-[10.5px] font-semibold text-white/80 mt-1">{r}</p>
            </div>
          ))}
        </div>
      </PalcoPagina>
      <div className="hidden lg:flex items-center justify-between gap-3 mb-4">
        <div><h2 className="text-lg font-extrabold">Ronda</h2><p style={{ color: T.subtext }} className="text-xs">Loja {lojaAtiva?.numero_loja ?? "—"}{gestor ? "" : " · só o que foi designado a você"}</p></div>
        {gestor && <button onClick={() => setNova({ setor: null })} style={{ background: "#1F9D55", color: "#fff" }} className="px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5"><Plus size={14} /> Iniciar ronda</button>}
      </div>
      {lista && (
        <div className="hidden lg:grid grid-cols-3 gap-4 mb-4">
          {[["Em curso", lista.filter(emCurso).length, "#1F9D55"], ["Minhas", minhasRondas.length, BLUE], ["Encerradas", lista.length - lista.filter(emCurso).length, T.subtext]].map(([r, n, cor]) => (
            <div key={r} style={{ background: T.card, borderColor: T.chipBg }} className="rounded-2xl border p-4 shadow-sm">
              <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wide">{r}</p>
              <p style={{ color: cor }} className="text-3xl font-extrabold tabular-nums mt-1">{n}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mb-4"><DashTabs T={T} value={aba} onChange={setAba} options={abas} /></div>

      {(aba === "rondas" || aba === "minhas") && (
        <>
          <div className="mb-3"><DashTabs T={T} value={filtro} onChange={setFiltro} options={[{ id: "todas", label: "Todas" }, { id: "ativas", label: "Em curso" }, { id: "encerradas", label: "Encerradas" }]} /></div>
          <div className="grid gap-2.5 lg:grid-cols-2 xl:grid-cols-3">
            {filtrada.map((r) => {
              const st = RONDA_STATUS[r.status] || RONDA_STATUS.finalizada; const Icone = iconeDoSetor(r.setor);
              const pr = progresso[r.id]; const conf = pr ? pr.c : (r.encerrada_conferidos ?? 0); const tot = pr ? pr.t : r.total_itens;
              return (
                <button key={r.id} onClick={() => abrir(r)} style={{ background: T.card, borderColor: T.border }} className="border rounded-[22px] p-3.5 text-left shadow-md shadow-black/5">
                  <div className="flex items-start gap-3">
                    <div style={{ background: st.bg }} className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"><Icone size={18} color={st.color} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold leading-tight">{r.titulo}</p><DashBadge bg={st.bg} color={st.color}>{st.label}</DashBadge></div>
                      <p style={{ color: T.subtext }} className="text-[11px] mt-0.5">{r.setor} · por {r.criado_por_nome || r.usuario || "—"} · {formatarDataHoraExtenso(r.criado_em)}</p>
                      <p style={{ color: T.subtext }} className="text-[11px]">👥 {(r.ronda_participantes || []).map((p) => p.nome).join(", ") || "—"}</p>
                      <div className="mt-2"><BarraProgressoRonda T={T} conf={conf} total={tot} cor={st.color} /></div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filtrada.length === 0 && (
              <div className="text-center py-14 px-6 col-span-full">
                <div style={{ background: BLUE_SOFT }} className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center mb-3"><ClockIcon className="w-6 h-6" style={{ color: BLUE }} /></div>
                <p className="font-semibold text-sm">Nenhuma ronda por aqui</p>
                <p style={{ color: T.subtext }} className="text-xs mt-1">{gestor ? "Toque em “Iniciar ronda” para criar a primeira." : "Quando um encarregado designar uma ronda para você, ela aparece aqui na hora."}</p>
              </div>
            )}
          </div>
        </>
      )}
      {aba === "ocorrencias" && gestor && <OcorrenciasPainel T={T} perfil={perfil} lojaAtiva={lojaAtiva} catalog={catalog} equipe={equipe} showToast={showToast} />}
      {aba === "tarefas" && <MinhasTarefas T={T} perfil={perfil} lojaAtiva={lojaAtiva} equipe={equipe} showToast={showToast} />}
      {aba === "relatorios" && gestor && <RelatoriosRonda T={T} lojaAtiva={lojaAtiva} rondasLista={lista} />}

      {nova && <NovaRondaSheet T={T} perfil={perfil} lojaAtiva={lojaAtiva} catalog={catalog} equipe={equipe} showToast={showToast} preSetor={nova.setor} preConfig={nova} onClose={() => setNova(null)} onCriada={() => { setNova(null); carregar(); }} />}
      {aberta?.modo === "painel" && <RondaPainel T={T} rondaId={aberta.id} perfil={perfil} showToast={showToast} onFechar={() => { setAberta(null); carregar(); }} onExecutar={() => setAberta({ id: aberta.id, modo: "exec" })} />}
      {aberta?.modo === "exec" && <RondaExecucao T={T} rondaId={aberta.id} perfil={perfil} catalog={catalog} showToast={showToast} onFechar={() => { setAberta(null); carregar(); }} />}
    </div>
  );
}

export { BadgeOcorrencia, BarraProgressoRonda, CAT, CATEGORIAS_OCORRENCIA, CartaoOcorrencia, ConferenciaSheet, ContagemRonda, EVENTO_TEXTO, FILA_CHAVE, FinalizarRondaModal, MOTIVOS_ENCERRAMENTO, MinhasTarefas, NovaOcorrenciaSheet, NovaRondaSheet, OCORRENCIA_STATUS, OcorrenciaDetalhe, OcorrenciasPainel, PRIO, PRIORIDADES, RONDA_RESULTADO, RONDA_STATUS, RelatoriosRonda, RondaAvisosHost, RondaExecucao, RondaPainel, RondasView, carregarEquipeLoja, casca, cascaPC, ehErroDeRede, enviarConferencia, erroRonda, fmtDuracao, gravarFilaRonda, lerFilaRonda, novoOp, paraInputDataHora, pctDe, sincronizarFila, statusOcorrenciaEfetivo, usarOcorrencias, useRondaAoVivo };

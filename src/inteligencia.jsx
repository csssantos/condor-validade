// ============================================================================
// INTELIGÊNCIA OPERACIONAL
//   • Previsão Operacional      (PrevisaoOperacionalView)
//   • Prevenção de Perdas       (PrevencaoPerdasView + RegistrarPerdaSheet)
//   • Assistente de IA          (AssistenteIAView)
// Todos os dados vêm de funções do banco (analise_*, previsoes_operacionais,
// indicadores_prevencao, registrar_perda, criar_acao_preventiva...) que aplicam
// as mesmas regras de cargo/setor/loja do restante do app.
// ============================================================================
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import {
  Loader2, X, AlertTriangle, TrendingUp, TrendingDown, Minus, ShieldCheck, Sparkles, Send, Camera, Barcode,
  ClipboardList, Target, Radar, Flame, PackageX, ChevronRight, MessageSquare, Plus, CheckCircle2, Info, RefreshCw,
  ImagePlus, History, ListChecks, BarChart3, Trash2,
} from "lucide-react";

const BLUE = "#0B4F9E", BLUE_DARK = "#082F5E", BLUE_SOFT = "#EAF1FB";
const RED = "#E31E24", RED_DARK = "#A81419", RED_SOFT = "#FDEBEC";
const VERDE = "#1F9D55", VERDE_SOFT = "#E6F7ED", LARANJA = "#C2760C", LARANJA_SOFT = "#FCF0DD";

export const MOTIVOS_PERDA = [
  { id: "vencimento", label: "Vencimento" }, { id: "avaria", label: "Avaria" }, { id: "embalagem", label: "Embalagem danificada" },
  { id: "quebra", label: "Quebra" }, { id: "improprio", label: "Produto impróprio" }, { id: "outros", label: "Outros" },
];
const MOTIVO_LABEL = Object.fromEntries(MOTIVOS_PERDA.map((m) => [m.id, m.label]));
const UNIDADES = ["UN", "KG", "G", "L", "ML", "CX", "PCT"];
const NIVEL_COR = {
  alta: { label: "Alto", bg: RED_SOFT, color: RED_DARK }, alto: { label: "Alto", bg: RED_SOFT, color: RED_DARK },
  media: { label: "Médio", bg: LARANJA_SOFT, color: LARANJA }, medio: { label: "Médio", bg: LARANJA_SOFT, color: LARANJA },
  baixa: { label: "Baixo", bg: VERDE_SOFT, color: VERDE }, baixo: { label: "Baixo", bg: VERDE_SOFT, color: VERDE },
};
const CONFIANCA = { alta: "Confiança alta", media: "Confiança média", baixa: "Confiança baixa" };
const STATUS_ACAO = {
  aberta: { label: "Aberta", bg: "#EEF0F3", color: "#4B5563" }, em_andamento: { label: "Em andamento", bg: BLUE_SOFT, color: BLUE },
  concluida: { label: "Concluída", bg: VERDE_SOFT, color: VERDE }, cancelada: { label: "Cancelada", bg: "#EEF0F3", color: "#9CA3AF" },
};

const moeda = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso) => (iso ? new Date(String(iso).length <= 10 ? iso + "T12:00:00" : iso).toLocaleDateString("pt-BR") : "—");
const dataHoraBR = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

export function erroInteligencia(error) {
  const m = String(error?.message || error || "");
  const mapa = [
    ["sem_permissao", "Você não tem permissão para isso."], ["setor_nao_permitido", "Esse setor não está sob sua responsabilidade."],
    ["codigo_obrigatorio", "Informe o código de barras do produto."], ["produto_obrigatorio", "Informe o nome do produto."],
    ["quantidade_invalida", "Quantidade inválida."], ["motivo_invalido", "Escolha o motivo da perda."], ["data_futura", "A data não pode ser no futuro."],
    ["foto_grande", "A foto ficou grande demais. Tente de novo."], ["outros_exige_obs", "Para o motivo \"Outros\", descreva nas observações."],
    ["problema_obrigatorio", "Descreva o problema."], ["produto_nao_encontrado", "Produto não encontrado no cadastro desta loja."],
    ["responsavel_obrigatorio", "Escolha o responsável."], ["prazo_obrigatorio", "Defina o prazo."], ["responsavel_fora_do_setor", "O responsável precisa ser do mesmo setor."],
    ["descricao_obrigatoria", "Descreva a tarefa."], ["Failed to fetch", "Sem conexão com o servidor."],
  ];
  const achado = mapa.find(([k]) => m.includes(k));
  return achado ? achado[1] : (m || "Algo deu errado.");
}

function comprimirFoto(file, maxW = 720, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const esc = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas"); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// --------------------------------------------------------------------------- UI base
function Cartao({ T, titulo, sub, direita, children, className = "" }) {
  return (
    <div style={{ background: T.card }} className={`rounded-2xl shadow-lg shadow-black/5 p-4 lg:p-5 ${className}`}>
      {(titulo || direita) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {titulo && <p className="text-sm font-bold">{titulo}</p>}
            {sub && <p style={{ color: T.subtext }} className="text-[11px] mt-0.5">{sub}</p>}
          </div>
          {direita}
        </div>
      )}
      {children}
    </div>
  );
}
function Kpi({ T, label, valor, sub, cor = T.text }) {
  const tam = String(valor ?? "").length;
  const fonte = tam > 12 ? "text-base lg:text-lg" : tam > 8 ? "text-lg lg:text-xl" : "text-2xl";
  return (
    <div style={{ background: T.card }} className="rounded-2xl shadow-lg shadow-black/5 p-3.5 min-w-0 overflow-hidden">
      <p style={{ color: cor }} className={`${fonte} font-extrabold tabular-nums leading-tight whitespace-nowrap overflow-hidden text-ellipsis`} title={String(valor ?? "")}>{valor}</p>
      <p style={{ color: T.subtext }} className="text-[11px] font-medium mt-0.5">{label}</p>
      {sub && <p style={{ color: T.subtext }} className="text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}
function Selo({ bg, color, children }) {
  return <span style={{ background: bg, color }} className="text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">{children}</span>;
}
function Abas({ T, valor, onChange, opcoes }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
      {opcoes.map((o) => {
        const on = o.id === valor;
        return <button key={o.id} onClick={() => onChange(o.id)} style={on ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }}
          className="rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0">{o.label}</button>;
      })}
    </div>
  );
}
function Folha({ T, titulo, sub, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/45" />
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg, color: T.text }}
        className="relative w-full lg:max-w-lg max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-t-3xl lg:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div><p className="text-base font-bold">{titulo}</p>{sub && <p style={{ color: T.subtext }} className="text-xs mt-0.5">{sub}</p>}</div>
          <button onClick={onClose} style={{ background: T.chipBg }} className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Campo({ T, label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span style={{ color: T.subtext }} className="text-[10.5px] mt-1 block">{hint}</span>}
    </label>
  );
}
const estiloCampo = (T) => ({ background: T.inputBg, color: T.text, borderColor: T.inputBorder });
function Carregando({ T, texto = "Carregando…" }) {
  return <div className="py-14 flex flex-col items-center gap-2"><Loader2 className="animate-spin" color={T.subtext} /><p style={{ color: T.subtext }} className="text-xs">{texto}</p></div>;
}
function Vazio({ T, texto }) {
  return <p style={{ color: T.subtext }} className="text-[12.5px] text-center py-6">{texto}</p>;
}
function Tendencia({ t }) {
  if (t === "subindo") return <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: RED_DARK }}><TrendingUp size={13} /> Subindo</span>;
  if (t === "caindo") return <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: VERDE }}><TrendingDown size={13} /> Caindo</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "#6B7280" }}><Minus size={13} /> Estável</span>;
}
function BarraRisco({ score }) {
  const cor = score >= 60 ? RED : score >= 30 ? LARANJA : VERDE;
  return (
    <div className="flex items-center gap-2 min-w-[96px]">
      <div className="h-1.5 rounded-full bg-black/10 flex-1 overflow-hidden"><div style={{ width: `${Math.max(3, score)}%`, background: cor }} className="h-full rounded-full" /></div>
      <span style={{ color: cor }} className="text-[11px] font-extrabold tabular-nums w-6 text-right">{score}</span>
    </div>
  );
}

// gráfico simples (barras/linha) a partir de dados reais vindos do banco
export function GraficoSimples({ T, tipo = "barras", dados, formato, altura = 210, cor = BLUE }) {
  if (!dados?.length) return <Vazio T={T} texto="Sem dados para o gráfico." />;
  const fmt = (v) => (formato === "moeda" ? moeda(v) : Number(v).toLocaleString("pt-BR"));
  const comum = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,150,.18)" vertical={false} />
      <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: T.subtext }} interval={0} angle={dados.length > 6 ? -30 : 0} textAnchor={dados.length > 6 ? "end" : "middle"} height={dados.length > 6 ? 58 : 26} />
      <YAxis tick={{ fontSize: 10, fill: T.subtext }} width={formato === "moeda" ? 62 : 32} tickFormatter={(v) => (formato === "moeda" ? `R$${Math.round(v / 100) / 10}k` : v)} />
      <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: T.card, border: "none", borderRadius: 12, fontSize: 12, color: T.text }} labelStyle={{ color: T.text }} />
    </>
  );
  return (
    <div style={{ width: "100%", height: altura }}>
      <ResponsiveContainer>
        {tipo === "linha" ? (
          <LineChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>{comum}<Line type="monotone" dataKey="valor" stroke={cor} strokeWidth={2.5} dot={{ r: 2.5 }} /></LineChart>
        ) : (
          <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>{comum}
            <Bar dataKey="valor" radius={[6, 6, 0, 0]}>{dados.map((d, i) => <Cell key={i} fill={i === 0 && dados.length > 1 && tipo === "ranking" ? RED : cor} />)}</Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// --------------------------------------------------------------------------- equipe (para tarefas)
async function carregarEquipe(lojaId) {
  if (!lojaId) return [];
  const { data } = await supabase.from("usuarios").select("id, nome, setor").eq("loja_id", lojaId).eq("ativo", true).or("promotor.is.null,promotor.eq.false").order("nome");
  return data || [];
}

// --------------------------------------------------------------------------- Tarefa (via criar_ocorrencia)
export function NovaTarefaSheet({ T, perfil, lojaAtiva, inicial, showToast, onClose, onCriada }) {
  const nivel = perfil?.cargos?.nivel ?? 99;
  const [equipe, setEquipe] = useState([]);
  const [setor, setSetor] = useState(inicial?.setor || perfil?.setor || "");
  const [descricao, setDescricao] = useState(inicial?.descricao || "");
  const [prioridade, setPrioridade] = useState(inicial?.prioridade || "media");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState(() => { const d = new Date(Date.now() + 2 * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); });
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { carregarEquipe(lojaAtiva?.id).then(setEquipe); }, [lojaAtiva?.id]);
  const candidatos = equipe.filter((u) => nivel <= 4 || (u.setor || "").toLowerCase() === (setor || "").toLowerCase());
  async function criar() {
    setOcupado(true);
    const { data, error } = await supabase.rpc("criar_ocorrencia", {
      p_setor: setor, p_categoria: inicial?.categoria || "validade", p_descricao: descricao, p_prioridade: prioridade,
      p_responsavel: responsavel || null, p_prazo: prazo ? new Date(prazo).toISOString() : null, p_foto: null, p_ronda: null, p_rascunho: false, p_loja: lojaAtiva?.id || null,
    });
    setOcupado(false);
    if (error) { showToast(erroInteligencia(error), "warn"); return; }
    showToast("Tarefa criada e enviada ao responsável.");
    onCriada?.(data);
  }
  const campo = estiloCampo(T);
  return (
    <Folha T={T} titulo="Criar tarefa" sub="Revise antes de confirmar — o responsável é avisado na hora." onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <Campo T={T} label="Setor"><input value={setor} onChange={(e) => setSetor(e.target.value)} disabled={nivel === 5} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" /></Campo>
        <Campo T={T} label="O que precisa ser feito"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={400} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" /></Campo>
        <Campo T={T} label="Prioridade">
          <div className="flex gap-1.5 flex-wrap">{["baixa", "media", "alta", "urgente"].map((p) => (
            <button key={p} onClick={() => setPrioridade(p)} style={prioridade === p ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }} className="rounded-xl px-3 py-2 text-xs font-semibold capitalize">{p === "media" ? "Média" : p}</button>
          ))}</div>
        </Campo>
        <Campo T={T} label="Responsável" hint={nivel === 5 ? "Só aparecem funcionários do seu setor." : undefined}>
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none">
            <option value="">Selecione…</option>{candidatos.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.setor ? ` · ${u.setor}` : ""}</option>)}
          </select>
        </Campo>
        <Campo T={T} label="Prazo"><input type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={{ ...campo, WebkitAppearance: "none", appearance: "none", minWidth: 0, maxWidth: "100%" }} className="block w-full min-w-0 border rounded-xl px-3 py-2.5 text-sm outline-none" /></Campo>
        <button onClick={criar} disabled={ocupado || !descricao.trim() || !responsavel || !setor} style={{ background: descricao.trim() && responsavel ? VERDE : "#C7CEDA", color: "#fff" }} className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
          {ocupado ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Confirmar e criar tarefa
        </button>
      </div>
    </Folha>
  );
}

// --------------------------------------------------------------------------- Ação preventiva (criar)
export function NovaAcaoPreventivaSheet({ T, lojaAtiva, inicial, setores, showToast, onClose, onCriada }) {
  const [alvoTipo, setAlvoTipo] = useState(inicial?.alvo_tipo || "setor");
  const [setor, setSetor] = useState(inicial?.setor || setores?.[0] || "");
  const [codigo, setCodigo] = useState(inicial?.codigo || "");
  const [alvoNome, setAlvoNome] = useState(inicial?.alvo_nome || "");
  const [problema, setProblema] = useState(inicial?.problema || "");
  const [acoes, setAcoes] = useState(inicial?.acoes?.length ? inicial.acoes : ["Aumentar a frequência das conferências", "Revisar a validade dos produtos com maior incidência", "Criar ronda priorizada por risco"]);
  const [nova, setNova] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function criar() {
    setOcupado(true);
    const { data, error } = await supabase.rpc("criar_acao_preventiva", {
      p_alvo_tipo: alvoTipo, p_setor: setor, p_barcode: alvoTipo === "produto" ? codigo || null : null, p_alvo_nome: alvoNome || setor,
      p_problema: problema, p_evidencias: inicial?.evidencias || {}, p_acoes: acoes, p_origem: inicial?.origem || "manual", p_loja: lojaAtiva?.id || null,
    });
    setOcupado(false);
    if (error) { showToast(erroInteligencia(error), "warn"); return; }
    showToast("Plano de ação criado. A situação atual ficou registrada para comparar depois.");
    onCriada?.(data);
  }
  const campo = estiloCampo(T);
  return (
    <Folha T={T} titulo="Plano de ação preventiva" sub="Ao criar, o app guarda as perdas dos últimos 30 dias como ponto de partida." onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <Abas T={T} valor={alvoTipo} onChange={setAlvoTipo} opcoes={[{ id: "setor", label: "Setor" }, { id: "produto", label: "Produto" }]} />
        <Campo T={T} label="Setor">
          {setores?.length ? (
            <select value={setor} onChange={(e) => setSetor(e.target.value)} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none">{setores.map((s) => <option key={s}>{s}</option>)}</select>
          ) : <input value={setor} onChange={(e) => setSetor(e.target.value)} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" />}
        </Campo>
        {alvoTipo === "produto" && (
          <div className="grid grid-cols-2 gap-2">
            <Campo T={T} label="Código"><input value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" /></Campo>
            <Campo T={T} label="Produto"><input value={alvoNome} onChange={(e) => setAlvoNome(e.target.value)} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" /></Campo>
          </div>
        )}
        <Campo T={T} label="Problema identificado"><textarea value={problema} onChange={(e) => setProblema(e.target.value)} rows={2} maxLength={400} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" /></Campo>
        <Campo T={T} label="Ações">
          <div className="flex flex-col gap-1.5">
            {acoes.map((a, i) => (
              <div key={i} style={{ background: T.chipBg }} className="rounded-xl px-3 py-2 text-[12.5px] flex items-start gap-2">
                <ListChecks size={14} className="mt-0.5 shrink-0" color={BLUE} /><span className="flex-1">{a}</span>
                <button onClick={() => setAcoes((p) => p.filter((_, j) => j !== i))}><X size={13} /></button>
              </div>
            ))}
            <div className="flex gap-2"><input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Adicionar ação" style={campo} className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none" />
              <button onClick={() => { if (nova.trim()) { setAcoes((p) => [...p, nova.trim()]); setNova(""); } }} style={{ background: BLUE, color: "#fff" }} className="px-3 rounded-xl"><Plus size={16} /></button></div>
          </div>
        </Campo>
        <button onClick={criar} disabled={ocupado || !problema.trim() || !setor} style={{ background: problema.trim() ? VERDE : "#C7CEDA", color: "#fff" }} className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
          {ocupado ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Confirmar plano de ação
        </button>
      </div>
    </Folha>
  );
}

// --------------------------------------------------------------------------- Registrar perda
export function RegistrarPerdaSheet({ T, perfil, lojaAtiva, catalog, showToast, onClose, onFeito, ScanView, inicial }) {
  const nivel = perfil?.cargos?.nivel ?? 99;
  const setoresCatalogo = useMemo(() => [...new Set(Object.values(catalog || {}).map((p) => p?.setor).filter(Boolean))].sort(), [catalog]);
  const [codigo, setCodigo] = useState(inicial?.barcode || "");
  const [nome, setNome] = useState(inicial?.nome || "");
  const [setor, setSetor] = useState(inicial?.setor || (nivel > 5 ? perfil?.setor || "" : ""));
  const [qtd, setQtd] = useState("1");
  const [unidade, setUnidade] = useState("UN");
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState("");
  const [foto, setFoto] = useState(null);
  const [scan, setScan] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef(null);

  function aplicarCodigo(c) {
    const limpo = String(c || "").replace(/\D/g, "");
    setCodigo(limpo);
    const sem0 = (s) => String(s || "").replace(/^0+/, "");
    const p = catalog?.[limpo] || Object.entries(catalog || {}).find(([cod]) => sem0(cod) === sem0(limpo))?.[1];
    if (p) {
      setNome(p.nome || ""); if (nivel <= 5 || !perfil?.setor) setSetor(p.setor || "");
      if (p.porPeso || p.por_peso) setUnidade("KG");
    }
  }
  async function escolherFoto(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try { setFoto(await comprimirFoto(f)); } catch { showToast("Não foi possível ler a foto.", "warn"); }
  }
  async function salvar() {
    setOcupado(true);
    const { error } = await supabase.rpc("registrar_perda", {
      p_barcode: codigo, p_nome: nome, p_setor: setor, p_quantidade: Number(String(qtd).replace(",", ".")), p_unidade: unidade,
      p_tipo: motivo, p_data: data || null, p_foto: foto, p_obs: obs.trim() || null, p_loja: lojaAtiva?.id || null,
    });
    setOcupado(false);
    if (error) { showToast(erroInteligencia(error), "warn"); return; }
    showToast("Perda registrada.");
    onFeito?.();
  }
  const pronto = codigo && nome.trim() && setor && Number(String(qtd).replace(",", ".")) > 0 && motivo && (motivo !== "outros" || obs.trim());
  const campo = estiloCampo(T);
  return (
    <Folha T={T} titulo="Registrar perda" sub={`Loja ${lojaAtiva?.numero_loja ?? "—"} · não altera o estoque, só registra a ocorrência`} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <Campo T={T} label="Código de barras">
          <div className="flex gap-2">
            <div style={campo} className="flex items-center gap-2 border rounded-xl px-3 flex-1">
              <Barcode size={16} style={{ color: T.subtext }} />
              <input value={codigo} onChange={(e) => aplicarCodigo(e.target.value)} inputMode="numeric" placeholder="Bipe ou digite" style={{ color: T.text }} className="bg-transparent outline-none text-sm flex-1 min-w-0 py-2.5" />
            </div>
            {ScanView && <button onClick={() => setScan(true)} style={{ background: BLUE, color: "#fff" }} className="px-4 rounded-xl text-sm font-semibold flex items-center gap-1.5"><Camera size={16} /> Bipar</button>}
          </div>
        </Campo>
        <Campo T={T} label="Produto"><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={140} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" /></Campo>
        <Campo T={T} label="Setor" hint={nivel > 5 ? "Funcionários registram perdas do próprio setor." : undefined}>
          {nivel > 5 ? <input value={setor} disabled style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none opacity-70" />
            : <select value={setor} onChange={(e) => setSetor(e.target.value)} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none">
                <option value="">Selecione…</option>{setoresCatalogo.map((s) => <option key={s}>{s}</option>)}
              </select>}
        </Campo>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Campo T={T} label="Quantidade"><input value={qtd} onChange={(e) => setQtd(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" /></Campo>
          <Campo T={T} label="Unidade"><select value={unidade} onChange={(e) => setUnidade(e.target.value)} style={campo} className="border rounded-xl px-3 py-2.5 text-sm outline-none">{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></Campo>
        </div>
        <Campo T={T} label="Motivo da perda">
          <div className="flex flex-wrap gap-1.5">{MOTIVOS_PERDA.map((m) => (
            <button key={m.id} onClick={() => setMotivo(m.id)} style={motivo === m.id ? { background: RED, color: "#fff" } : { background: T.chipBg, color: T.text }} className="rounded-xl px-3 py-2 text-xs font-semibold">{m.label}</button>
          ))}</div>
        </Campo>
        <Campo T={T} label="Data"><input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} style={{ ...campo, WebkitAppearance: "none", appearance: "none", minWidth: 0, maxWidth: "100%" }} className="block w-full min-w-0 border rounded-xl px-3 py-2.5 text-sm outline-none" /></Campo>
        <Campo T={T} label="Foto (opcional)">
          <input ref={arquivo} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherFoto} />
          {foto ? (
            <div className="relative"><img src={foto} alt="" className="w-full max-h-48 object-cover rounded-xl" />
              <button onClick={() => setFoto(null)} className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center"><X size={15} /></button></div>
          ) : <button onClick={() => arquivo.current?.click()} style={{ background: T.chipBg }} className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2"><ImagePlus size={16} /> Tirar ou escolher foto</button>}
        </Campo>
        <Campo T={T} label={motivo === "outros" ? "Observações (obrigatório)" : "Observações (opcional)"}><textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={300} style={campo} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" /></Campo>
        <p style={{ color: T.subtext }} className="text-[11px]">Responsável pelo registro: <b>{perfil?.nome || "—"}</b></p>
        <button onClick={salvar} disabled={!pronto || ocupado} style={{ background: pronto ? RED : "#C7CEDA", color: "#fff" }} className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
          {ocupado ? <Loader2 size={16} className="animate-spin" /> : <PackageX size={16} />} Registrar perda
        </button>
      </div>
      {scan && ScanView && <div className="fixed inset-0 z-[80]" style={{ background: T.bg }}><ScanView T={T} onDetected={(c) => { setScan(false); aplicarCodigo(c); }} onCancel={() => setScan(false)} /></div>}
    </Folha>
  );
}

// --------------------------------------------------------------------------- Produto (histórico)
function ProdutoAnaliseSheet({ T, barcode, lojaAtiva, onClose, onCriarAcao }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    supabase.rpc("analise_produto", { p_barcode: barcode, p_loja: lojaAtiva?.id || null }).then(({ data, error }) => (error ? setErro(erroInteligencia(error)) : setD(data)));
  }, [barcode]);
  const r = d?.risco;
  return (
    <Folha T={T} titulo={d?.nome || "Produto"} sub={d ? `${d.setor} · ${d.barcode}` : barcode} onClose={onClose}>
      {erro ? <Vazio T={T} texto={erro} /> : !d ? <Carregando T={T} /> : (
        <div className="flex flex-col gap-3">
          {r && (
            <div style={{ background: T.card }} className="rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-2"><p className="text-xs font-bold">Indicador de risco</p><Selo {...(NIVEL_COR[r.nivel] || NIVEL_COR.baixa)}>{(NIVEL_COR[r.nivel] || NIVEL_COR.baixa).label}</Selo></div>
              <BarraRisco score={r.score} />
              <p style={{ color: T.subtext }} className="text-[10.5px] mt-2">Risco é uma indicação baseada no histórico — não significa que o produto esteja vencido ou irregular.</p>
              <FatoresRisco T={T} f={r.fatores} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Kpi T={T} label="Perdas registradas" valor={d.perdas.length} />
            <Kpi T={T} label="Conferências" valor={d.conferencias.length} />
            <Kpi T={T} label="Irregularidades" valor={d.conferencias.filter((c) => c.resultado === "irregular").length} cor={RED_DARK} />
          </div>
          <Cartao T={T} titulo="Perdas">
            {d.perdas.length === 0 ? <Vazio T={T} texto="Nenhuma perda registrada para este produto." /> : (
              <div className="flex flex-col gap-1.5">{d.perdas.slice(0, 15).map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[12px]"><span>{dataBR(p.data)} · {MOTIVO_LABEL[p.tipo] || p.tipo}</span><span style={{ color: T.subtext }}>{Number(p.quantidade).toLocaleString("pt-BR")} {p.unidade} · {moeda(p.valor)}</span></div>
              ))}</div>
            )}
          </Cartao>
          <Cartao T={T} titulo="Conferências em rondas">
            {d.conferencias.length === 0 ? <Vazio T={T} texto="Este produto ainda não foi conferido em ronda." /> : (
              <div className="flex flex-col gap-1.5">{d.conferencias.slice(0, 15).map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[12px]"><span>{dataBR(c.data)} · {c.ronda}</span>
                  <Selo bg={c.resultado === "irregular" ? RED_SOFT : c.resultado === "atencao" ? LARANJA_SOFT : VERDE_SOFT} color={c.resultado === "irregular" ? RED_DARK : c.resultado === "atencao" ? LARANJA : VERDE}>{c.resultado}</Selo></div>
              ))}</div>
            )}
          </Cartao>
          {d.lotes_ativos?.length > 0 && (
            <Cartao T={T} titulo="Lotes ativos">{d.lotes_ativos.map((l, i) => <p key={i} className="text-[12px]">Validade {dataBR(l.validade)} · {l.quantidade} un.</p>)}</Cartao>
          )}
          {onCriarAcao && <button onClick={() => onCriarAcao({ alvo_tipo: "produto", setor: d.setor, codigo: d.barcode, alvo_nome: d.nome, problema: `Ocorrências recorrentes em ${d.nome}`, origem: "produto" })}
            style={{ background: BLUE, color: "#fff" }} className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"><ShieldCheck size={16} /> Gerar plano de ação para este produto</button>}
        </div>
      )}
    </Folha>
  );
}
function FatoresRisco({ T, f }) {
  if (!f) return null;
  const linhas = [
    f.vencimentos_90d && `${f.vencimentos_90d} vencimento(s) em 90 dias`,
    f.irregularidades_90d && `${f.irregularidades_90d} irregularidade(s) em rondas`,
    f.atencao_90d && `${f.atencao_90d} conferência(s) com atenção`,
    f.outras_perdas_90d && `${f.outras_perdas_90d} outra(s) perda(s) (avaria, quebra…)`,
    f.dias_para_vencer_lote != null && (f.dias_para_vencer_lote < 0 ? `lote cadastrado vencido há ${Math.abs(f.dias_para_vencer_lote)} dia(s)` : `lote atual vence em ${f.dias_para_vencer_lote} dia(s)`),
    f.nunca_conferido ? "nunca conferido em ronda" : f.dias_sem_conferir != null && `${f.dias_sem_conferir} dia(s) desde a última conferência`,
  ].filter(Boolean);
  if (!linhas.length) return <p style={{ color: T.subtext }} className="text-[11px] mt-2">Sem ocorrências no histórico.</p>;
  return <ul className="mt-2 flex flex-col gap-0.5">{linhas.map((l, i) => <li key={i} style={{ color: T.subtext }} className="text-[11px]">• {l}</li>)}</ul>;
}

// ============================================================================ PREVISÃO OPERACIONAL
export function PrevisaoOperacionalView({ T, perfil, lojaAtiva, showToast, onCriarRonda }) {
  const [dados, setDados] = useState(null);
  const [risco, setRisco] = useState(null);
  const [erro, setErro] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [acao, setAcao] = useState(null);
  const [produto, setProduto] = useState(null);
  const carregar = useCallback(async () => {
    setErro(null);
    const [p, r] = await Promise.all([
      supabase.rpc("previsoes_operacionais", { p_loja: lojaAtiva?.id || null }),
      supabase.rpc("analise_risco_produtos", { p_loja: lojaAtiva?.id || null, p_setor: null }).limit(15),
    ]);
    if (p.error) { setErro(erroInteligencia(p.error)); return; }
    setDados(p.data); setRisco(r.data || []);
  }, [lojaAtiva?.id]);
  useEffect(() => { carregar(); }, [carregar]);
  if (erro) return <div className="px-4 pt-4"><Cartao T={T}><Vazio T={T} texto={erro} /></Cartao></div>;
  if (!dados) return <Carregando T={T} texto="Analisando o histórico da loja…" />;
  const cards = (dados.cards || []).filter((c) => filtro === "todos" || (filtro === "alto" ? c.nivel === "alto" : c.tipo_alvo === filtro));
  const base = dados.base || {};
  const setores = [...new Set((dados.cards || []).map((c) => c.setor).filter(Boolean))];
  return (
    <div className="px-4 pt-4 lg:px-0 flex flex-col gap-4">
      <div style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)` }} className="rounded-3xl p-5 text-white">
        <p className="text-[11px] font-bold tracking-[0.16em] text-white/70 flex items-center gap-1.5"><Radar size={14} /> PREVISÃO OPERACIONAL</p>
        <p className="text-lg font-bold mt-1">O que pode dar problema — antes de acontecer</p>
        <p className="text-[12px] text-white/75 mt-1">Baseado em {base.eventos_120_dias ?? 0} ocorrência(s) dos últimos 120 dias ({base.dias_de_historico ?? 0} dia(s) de histórico). Última análise: {dataHoraBR(dados.gerado_em)}.</p>
        {!base.suficiente && <p className="mt-2 text-[12px] font-semibold bg-white/15 rounded-xl px-3 py-2">Ainda não existe histórico suficiente para previsões confiáveis em toda a loja. Os cards abaixo só aparecem onde há dados.</p>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Abas T={T} valor={filtro} onChange={setFiltro} opcoes={[{ id: "todos", label: `Todos (${dados.cards?.length || 0})` }, { id: "alto", label: "Risco alto" }, { id: "setor", label: "Setores" }, { id: "produto", label: "Produtos" }]} />
        <button onClick={carregar} style={{ background: T.chipBg }} className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" title="Atualizar"><RefreshCw size={15} /></button>
      </div>
      {cards.length === 0 ? <Cartao T={T}><Vazio T={T} texto="Nenhuma previsão nesse filtro — não há padrão de risco com dados suficientes." /></Cartao> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cards.map((c, i) => {
            const n = NIVEL_COR[c.nivel] || NIVEL_COR.baixo;
            return (
              <div key={i} style={{ background: T.card, borderLeft: `4px solid ${n.color}` }} className="rounded-2xl shadow-lg shadow-black/5 p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">{c.tipo_alvo === "setor" ? "Setor" : `Produto · ${c.setor}`}</p>
                    <p className="text-sm font-bold leading-snug">{c.alvo}</p>
                  </div>
                  <Selo bg={n.bg} color={n.color}>Risco {n.label.toLowerCase()}</Selo>
                </div>
                <div className="flex items-center gap-3 flex-wrap"><span className="text-[11.5px] font-semibold">{c.tipo_risco}</span><Tendencia t={c.tendencia} /></div>
                <p style={{ color: T.subtext }} className="text-[12px]"><b style={{ color: T.text }}>Por quê:</b> {c.justificativa}</p>
                <p className="text-[12px]"><b>Recomendação:</b> {c.recomendacao}</p>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span style={{ color: T.subtext }} className="text-[10.5px] flex items-center gap-1"><Info size={11} /> {CONFIANCA[c.confianca] || "—"}</span>
                  <div className="flex gap-1.5">
                    {c.barcode && <button onClick={() => setProduto(c.barcode)} style={{ background: T.chipBg }} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">Histórico</button>}
                    <button onClick={() => setAcao({ alvo_tipo: c.tipo_alvo, setor: c.setor, codigo: c.barcode, alvo_nome: c.alvo, problema: `${c.tipo_risco}: ${c.justificativa}`, evidencias: c.dados, origem: "previsao" })}
                      style={{ background: T.chipBg }} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">Plano de ação</button>
                    {onCriarRonda && <button onClick={() => onCriarRonda(c.tipo_alvo === "produto" ? { setor: c.setor, modo: "manual", barcodes: [c.barcode], nome: `Ronda preventiva · ${c.alvo}`.slice(0, 80) } : { setor: c.setor, modo: "priorizada", nome: `Ronda preventiva · ${c.setor}` })}
                      style={{ background: BLUE, color: "#fff" }} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">Criar ronda</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {dados.sem_dados_suficientes?.length > 0 && (
        <Cartao T={T} titulo="Sem base suficiente para prever" sub="Precisam de pelo menos 4 ocorrências em 3 semanas diferentes.">
          <div className="flex flex-wrap gap-1.5">{dados.sem_dados_suficientes.map((s, i) => <Selo key={i} bg={T.chipBg} color={T.subtext}>{s.alvo} · {s.eventos} ocorr.</Selo>)}</div>
        </Cartao>
      )}
      <Cartao T={T} titulo="Produtos com maior risco" sub="Indicador 0–100 calculado do histórico real. Risco não é o mesmo que vencido.">
        {!risco?.length ? <Vazio T={T} texto="Sem produtos para analisar." /> : (
          <div className="flex flex-col divide-y" style={{ borderColor: T.chipBg }}>
            {risco.map((p) => (
              <button key={p.barcode} onClick={() => setProduto(p.barcode)} className="flex items-center gap-3 py-2 text-left">
                <div className="min-w-0 flex-1"><p className="text-[12.5px] font-semibold truncate">{p.nome}</p><p style={{ color: T.subtext }} className="text-[10.5px] truncate">{p.setor}{p.validade_lote ? ` · lote ${dataBR(p.validade_lote)}` : ""}</p></div>
                <BarraRisco score={p.score} /><ChevronRight size={14} style={{ color: T.subtext }} />
              </button>
            ))}
          </div>
        )}
      </Cartao>
      {acao && <NovaAcaoPreventivaSheet T={T} lojaAtiva={lojaAtiva} inicial={acao} setores={setores.length ? setores : null} showToast={showToast} onClose={() => setAcao(null)} onCriada={() => setAcao(null)} />}
      {produto && <ProdutoAnaliseSheet T={T} barcode={produto} lojaAtiva={lojaAtiva} onClose={() => setProduto(null)} onCriarAcao={(a) => { setProduto(null); setAcao(a); }} />}
    </div>
  );
}

// ============================================================================ PREVENÇÃO DE PERDAS
export function PrevencaoPerdasView({ T, perfil, lojaAtiva, catalog, showToast, onCriarRonda, ScanView }) {
  const [aba, setAba] = useState("painel");
  const [dias, setDias] = useState(30);
  const [setor, setSetor] = useState("");
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [acoes, setAcoes] = useState(null);
  const [ind, setInd] = useState(null);
  const [registrar, setRegistrar] = useState(false);
  const [novaAcao, setNovaAcao] = useState(null);
  const [tarefa, setTarefa] = useState(null);
  const [produto, setProduto] = useState(null);
  const [busca, setBusca] = useState("");
  const [riscoLista, setRiscoLista] = useState(null);
  const setoresCatalogo = useMemo(() => {
    const s = new Set(); Object.values(catalog || {}).forEach((p) => { if (p?.setor) s.add(p.setor); });
    return [...s].sort();
  }, [catalog]);

  const carregarPainel = useCallback(async () => {
    setErro(null); setD(null);
    const { data, error } = await supabase.rpc("analise_perdas", { p_loja: lojaAtiva?.id || null, p_dias: dias, p_setor: setor || null });
    if (error) setErro(erroInteligencia(error)); else setD(data);
  }, [lojaAtiva?.id, dias, setor]);
  const carregarAcoes = useCallback(async () => {
    let q = supabase.from("acoes_preventivas").select("*").order("criado_em", { ascending: false }).limit(100);
    if (lojaAtiva?.id) q = q.eq("loja_id", lojaAtiva.id);
    const [a, i] = await Promise.all([q, supabase.rpc("indicadores_prevencao", { p_loja: lojaAtiva?.id || null })]);
    setAcoes(a.data || []); setInd(i.data || null);
  }, [lojaAtiva?.id]);
  useEffect(() => { carregarPainel(); }, [carregarPainel]);
  useEffect(() => { carregarAcoes(); }, [carregarAcoes]);
  useEffect(() => {
    if (aba !== "produtos" || riscoLista) return;
    supabase.rpc("analise_risco_produtos", { p_loja: lojaAtiva?.id || null, p_setor: null }).limit(400).then(({ data }) => setRiscoLista(data || []));
  }, [aba]);

  async function mudarStatus(a, status) {
    const { error } = await supabase.rpc("atualizar_acao_preventiva", { p_id: a.id, p_status: status, p_ronda: null, p_ocorrencia: null });
    if (error) { showToast(erroInteligencia(error), "warn"); return; }
    showToast(status === "concluida" ? "Ação concluída." : "Status atualizado."); carregarAcoes();
  }
  const setoresDoPainel = (d?.por_setor || []).map((s) => s.setor);

  return (
    <div className="px-4 pt-4 lg:px-0 flex flex-col gap-4">
      <div style={{ background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)` }} className="rounded-3xl p-5 text-white flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] text-white/75 flex items-center gap-1.5"><Flame size={14} /> PREVENÇÃO DE PERDAS</p>
          <p className="text-lg font-bold mt-1">Onde a loja está perdendo — e o que fazer</p>
        </div>
        <button onClick={() => setRegistrar(true)} className="bg-white text-[12px] font-bold px-3 py-2 rounded-xl shrink-0 flex items-center gap-1.5" style={{ color: RED_DARK }}><PackageX size={15} /> Registrar perda</button>
      </div>
      <Abas T={T} valor={aba} onChange={setAba} opcoes={[{ id: "painel", label: "Painel" }, { id: "produtos", label: "Produtos" }, { id: "acoes", label: `Ações preventivas${acoes ? ` (${acoes.filter((a) => ["aberta", "em_andamento"].includes(a.status)).length})` : ""}` }, { id: "resultados", label: "Resultados" }]} />

      {aba === "painel" && (
        <>
          <div className="flex gap-2 flex-wrap items-center">
            {[7, 30, 90].map((n) => <button key={n} onClick={() => setDias(n)} style={dias === n ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }} className="rounded-xl px-3 py-2 text-xs font-semibold">{n} dias</button>)}
            <select value={setor} onChange={(e) => setSetor(e.target.value)} style={estiloCampo(T)} className="border rounded-xl px-3 py-2 text-xs outline-none">
              <option value="">Todos os setores</option>{[...new Set([...setoresDoPainel, ...setoresCatalogo.map((s) => s)])].sort().map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {erro ? <Cartao T={T}><Vazio T={T} texto={erro} /></Cartao> : !d ? <Carregando T={T} /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-2">
                <Kpi T={T} label={`Ocorrências (${d.periodo_dias}d)`} valor={d.total_registros} />
                <Kpi T={T} label="Valor perdido" valor={moeda(d.valor_total)} cor={RED_DARK} />
                <Kpi T={T} label="Irregularidades em rondas" valor={d.irregularidades_rondas} />
                <Kpi T={T} label="Quebras" valor={d.quebras} />
                <Kpi T={T} label="Vencidos agora" valor={d.vencidos_agora} cor={RED_DARK} />
                <Kpi T={T} label="Vencem em 7 dias" valor={d.proximos_7_dias} cor={LARANJA} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Cartao T={T} titulo="Evolução semanal" sub="Registros de perda nas últimas 12 semanas"><GraficoSimples T={T} tipo="linha" dados={(d.semanal || []).map((x) => ({ rotulo: x.semana, valor: x.registros }))} cor={RED} /></Cartao>
                <Cartao T={T} titulo="Evolução mensal" sub="Valor perdido por mês (R$)"><GraficoSimples T={T} formato="moeda" dados={(d.mensal || []).map((x) => ({ rotulo: x.mes.slice(0, 2) + "/" + x.mes.slice(5), valor: Number(x.valor) }))} /></Cartao>
                <Cartao T={T} titulo="Perdas por setor" sub={`R$ nos últimos ${d.periodo_dias} dias`}><GraficoSimples T={T} formato="moeda" dados={(d.por_setor || []).map((x) => ({ rotulo: x.setor, valor: Number(x.valor) }))} /></Cartao>
                <Cartao T={T} titulo="Por motivo">
                  {!d.por_tipo?.length ? <Vazio T={T} texto="Sem perdas no período." /> : (
                    <div className="flex flex-col gap-2">{d.por_tipo.map((t) => {
                      const max = Math.max(...d.por_tipo.map((x) => x.registros));
                      return <div key={t.tipo} className="text-[12px]"><div className="flex justify-between mb-1"><span className="font-semibold">{MOTIVO_LABEL[t.tipo] || t.tipo}</span><span style={{ color: T.subtext }}>{t.registros} · {moeda(t.valor)}</span></div>
                        <div className="h-2 rounded-full bg-black/10 overflow-hidden"><div style={{ width: `${(t.registros / max) * 100}%`, background: RED }} className="h-full rounded-full" /></div></div>;
                    })}</div>
                  )}
                </Cartao>
              </div>
              <Cartao T={T} titulo="Produtos com mais perdas" sub="Toque para ver o histórico completo">
                {!d.top_produtos?.length ? <Vazio T={T} texto="Sem perdas no período." /> : (
                  <div className="flex flex-col">{d.top_produtos.map((p, i) => (
                    <button key={p.barcode + i} onClick={() => setProduto(p.barcode)} className="flex items-center gap-3 py-2 text-left">
                      <span style={{ background: i < 3 ? RED_SOFT : T.chipBg, color: i < 3 ? RED_DARK : T.subtext }} className="h-7 w-7 rounded-lg text-[11px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1"><p className="text-[12.5px] font-semibold truncate">{p.nome}</p><p style={{ color: T.subtext }} className="text-[10.5px]">{p.setor}</p></div>
                      <div className="text-right"><p className="text-[12px] font-bold">{p.registros}x</p><p style={{ color: T.subtext }} className="text-[10.5px]">{moeda(p.valor)}</p></div>
                    </button>
                  ))}</div>
                )}
              </Cartao>
              {d.por_setor?.length > 0 && (
                <Cartao T={T} titulo="Setores com mais ocorrências">
                  <div className="flex flex-col gap-2">{d.por_setor.map((s) => (
                    <div key={s.setor} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="font-semibold">{s.setor}</span>
                      <div className="flex items-center gap-2">
                        <span style={{ color: T.subtext }}>{s.registros} perda(s) · {s.irregularidades} irreg.</span>
                        <button onClick={() => setNovaAcao({ alvo_tipo: "setor", setor: s.setor, alvo_nome: s.setor, problema: `${s.registros} perda(s) (${moeda(s.valor)}) e ${s.irregularidades} irregularidade(s) em ${d.periodo_dias} dias em ${s.setor}.`, evidencias: s, origem: "painel" })}
                          style={{ background: T.chipBg }} className="text-[11px] font-semibold px-2 py-1 rounded-lg">Plano</button>
                      </div>
                    </div>
                  ))}</div>
                </Cartao>
              )}
            </>
          )}
        </>
      )}

      {aba === "produtos" && (
        <Cartao T={T} titulo="Análise por produto" sub="Risco calculado do histórico: vencimentos, irregularidades, perdas, lote atual e tempo sem conferência.">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou código" style={estiloCampo(T)} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none mb-3" />
          {!riscoLista ? <Carregando T={T} /> : (
            <div className="flex flex-col">
              {riscoLista.filter((p) => !busca.trim() || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.barcode.includes(busca.trim())).slice(0, 80).map((p) => (
                <button key={p.barcode} onClick={() => setProduto(p.barcode)} className="flex items-center gap-3 py-2 text-left">
                  <div className="min-w-0 flex-1"><p className="text-[12.5px] font-semibold truncate">{p.nome}</p><p style={{ color: T.subtext }} className="text-[10.5px] truncate">{p.setor} · {p.eventos} ocorrência(s)</p></div>
                  <BarraRisco score={p.score} />
                </button>
              ))}
            </div>
          )}
        </Cartao>
      )}

      {aba === "acoes" && (
        <>
          <button onClick={() => setNovaAcao({ origem: "manual" })} style={{ background: BLUE, color: "#fff" }} className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"><Plus size={16} /> Nova ação preventiva</button>
          {!acoes ? <Carregando T={T} /> : acoes.length === 0 ? <Cartao T={T}><Vazio T={T} texto="Nenhuma ação preventiva ainda. Crie a partir do painel, da previsão ou do assistente." /></Cartao> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {acoes.map((a) => {
                const st = STATUS_ACAO[a.status] || STATUS_ACAO.aberta;
                return (
                  <div key={a.id} style={{ background: T.card }} className="rounded-2xl shadow-lg shadow-black/5 p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase">{a.alvo_tipo === "setor" ? "Setor" : `Produto · ${a.setor}`}</p><p className="text-sm font-bold">{a.alvo_nome}</p></div>
                      <Selo bg={st.bg} color={st.color}>{st.label}</Selo>
                    </div>
                    <p className="text-[12px]"><b>Problema:</b> {a.problema}</p>
                    {Array.isArray(a.acoes) && a.acoes.length > 0 && <ul className="flex flex-col gap-0.5">{a.acoes.map((x, i) => <li key={i} style={{ color: T.subtext }} className="text-[11.5px]">• {x}</li>)}</ul>}
                    <p style={{ color: T.subtext }} className="text-[10.5px]">Criada por {a.criado_por_nome || "—"} em {dataBR(a.criado_em)}{a.linha_base ? ` · ponto de partida: ${a.linha_base.perdas} perda(s) em 30 dias` : ""}{a.ronda_id ? " · ronda vinculada" : ""}{a.ocorrencia_id ? " · tarefa vinculada" : ""}</p>
                    {["aberta", "em_andamento"].includes(a.status) && (
                      <div className="flex gap-1.5 flex-wrap">
                        {onCriarRonda && <button onClick={() => onCriarRonda(a.alvo_tipo === "produto" && a.barcode ? { setor: a.setor, modo: "manual", barcodes: [a.barcode], acaoId: a.id, nome: `Ronda preventiva · ${a.alvo_nome}`.slice(0, 80) } : { setor: a.setor, modo: "priorizada", acaoId: a.id, nome: `Ronda preventiva · ${a.setor}` })}
                          style={{ background: BLUE, color: "#fff" }} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">Criar ronda</button>}
                        <button onClick={() => setTarefa({ setor: a.setor, descricao: `${a.problema}\n${(a.acoes || []).map((x) => "• " + x).join("\n")}`.slice(0, 400), prioridade: "alta", acaoId: a.id })} style={{ background: T.chipBg }} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">Criar tarefa</button>
                        <button onClick={() => mudarStatus(a, "concluida")} style={{ background: VERDE_SOFT, color: VERDE }} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">Concluir</button>
                        <button onClick={() => mudarStatus(a, "cancelada")} style={{ background: T.chipBg, color: T.subtext }} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">Cancelar</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {aba === "resultados" && (!ind ? <Carregando T={T} /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Kpi T={T} label="Ações em aberto" valor={ind.acoes_abertas} />
            <Kpi T={T} label="Ações concluídas" valor={ind.acoes_concluidas} cor={VERDE} />
            <Kpi T={T} label="Setores que melhoraram" valor={(ind.setores || []).filter((s) => s.situacao === "melhorou").length} cor={VERDE} sub="30 dias x 30 anteriores" />
            <Kpi T={T} label="Produtos que continuam com perdas" valor={(ind.produtos_persistentes || []).length} cor={RED_DARK} />
          </div>
          <Cartao T={T} titulo="Antes x depois de cada ação" sub="Só compara quando a ação tem pelo menos 14 dias.">
            {!ind.acoes?.length ? <Vazio T={T} texto="Nenhuma ação preventiva criada ainda." /> : (
              <div className="flex flex-col gap-2.5">{ind.acoes.map((a) => (
                <div key={a.id} style={{ background: T.chipBg }} className="rounded-xl p-3 text-[12px]">
                  <div className="flex justify-between gap-2"><b className="truncate">{a.alvo}</b><Selo {...(STATUS_ACAO[a.status] || STATUS_ACAO.aberta)}>{(STATUS_ACAO[a.status] || STATUS_ACAO.aberta).label}</Selo></div>
                  {a.avaliavel ? (
                    <p className="mt-1">Antes: <b>{a.antes?.perdas}</b> perda(s) em {a.antes?.dias} dias · Depois: <b>{a.depois?.perdas}</b> em {a.depois?.dias} dias
                      {a.antes?.perdas > 0 && a.depois?.dias >= 14 ? <> · <b style={{ color: a.depois.perdas / a.depois.dias < a.antes.perdas / a.antes.dias ? VERDE : RED_DARK }}>{a.depois.perdas / a.depois.dias < a.antes.perdas / a.antes.dias ? "redução" : "sem redução"}</b> no ritmo diário</> : null}</p>
                  ) : <p style={{ color: T.subtext }} className="mt-1">{a.nota} (criada há {a.dias_desde} dia(s))</p>}
                </div>
              ))}</div>
            )}
          </Cartao>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Cartao T={T} titulo="Setores: últimos 30 dias x 30 anteriores">
              {!ind.setores?.length ? <Vazio T={T} texto="Sem perdas nos últimos 60 dias." /> : ind.setores.map((s) => (
                <div key={s.setor} className="flex items-center justify-between py-1.5 text-[12.5px]"><span className="font-semibold">{s.setor}</span>
                  <span className="flex items-center gap-2"><span style={{ color: T.subtext }}>{s.anteriores_30} → {s.ultimos_30}</span>
                    <Selo bg={s.situacao === "melhorou" ? VERDE_SOFT : s.situacao === "piorou" ? RED_SOFT : T.chipBg} color={s.situacao === "melhorou" ? VERDE : s.situacao === "piorou" ? RED_DARK : T.subtext}>{s.situacao === "dados_insuficientes" ? "poucos dados" : s.situacao}</Selo></span></div>
              ))}
            </Cartao>
            <Cartao T={T} titulo="Produtos que continuam com problemas" sub="Tiveram perdas nos dois últimos períodos de 30 dias">
              {!ind.produtos_persistentes?.length ? <Vazio T={T} texto="Nenhum produto com perdas repetidas nos dois períodos." /> : ind.produtos_persistentes.map((p) => (
                <button key={p.barcode} onClick={() => setProduto(p.barcode)} className="w-full flex items-center justify-between py-1.5 text-[12.5px] text-left"><span className="truncate font-semibold">{p.nome}</span><span style={{ color: T.subtext }}>{p.registros_60d}x</span></button>
              ))}
            </Cartao>
          </div>
        </>
      ))}

      {registrar && <RegistrarPerdaSheet T={T} perfil={perfil} lojaAtiva={lojaAtiva} catalog={catalog} showToast={showToast} ScanView={ScanView} onClose={() => setRegistrar(false)} onFeito={() => { setRegistrar(false); carregarPainel(); carregarAcoes(); }} />}
      {novaAcao && <NovaAcaoPreventivaSheet T={T} lojaAtiva={lojaAtiva} inicial={novaAcao} setores={[...new Set([...setoresDoPainel, ...setoresCatalogo.map((s) => s)])].sort()} showToast={showToast} onClose={() => setNovaAcao(null)} onCriada={() => { setNovaAcao(null); carregarAcoes(); setAba("acoes"); }} />}
      {tarefa && <NovaTarefaSheet T={T} perfil={perfil} lojaAtiva={lojaAtiva} inicial={tarefa} showToast={showToast} onClose={() => setTarefa(null)}
        onCriada={async (id) => { if (tarefa.acaoId && id) await supabase.rpc("atualizar_acao_preventiva", { p_id: tarefa.acaoId, p_status: null, p_ronda: null, p_ocorrencia: id }); setTarefa(null); carregarAcoes(); }} />}
      {produto && <ProdutoAnaliseSheet T={T} barcode={produto} lojaAtiva={lojaAtiva} onClose={() => setProduto(null)} onCriarAcao={(a) => { setProduto(null); setNovaAcao(a); }} />}
    </div>
  );
}

// ============================================================================ ASSISTENTE DE IA
const SUGESTOES = [
  "Quais produtos mais apresentaram problemas de validade esta semana?",
  "Qual setor teve mais irregularidades nos últimos 30 dias?",
  "Quais produtos precisam de uma nova ronda?",
  "Quais funcionários possuem tarefas atrasadas?",
  "Quais produtos estão apresentando maior incidência de perdas?",
  "Qual foi a evolução das perdas neste mês?",
  "Quais produtos devo priorizar amanhã?",
  "Quais setores precisam de mais atenção?",
  "O que melhorou depois das últimas rondas?",
  "Quais problemas estão se repetindo?",
  "Gere um plano de ação para reduzir perdas na Mercearia.",
  "Compare as ocorrências desta semana com a semana anterior.",
];

// texto da IA com negrito e tópicos simples (sem HTML vindo de fora)
function TextoIA({ texto }) {
  const linhas = String(texto || "").split("\n");
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={k + "-" + i}>{p.slice(2, -2)}</b> : <React.Fragment key={k + "-" + i}>{p}</React.Fragment>));
  return (
    <div className="flex flex-col gap-1 text-[13px] leading-relaxed">
      {linhas.map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (/^#{1,4}\s/.test(t)) return <p key={i} className="font-bold mt-1">{inline(t.replace(/^#{1,4}\s/, ""), i)}</p>;
        if (/^[-*•]\s/.test(t)) return <p key={i} className="pl-3 relative"><span className="absolute left-0">•</span>{inline(t.replace(/^[-*•]\s/, ""), i)}</p>;
        if (/^\d+[.)]\s/.test(t)) return <p key={i} className="pl-1">{inline(t, i)}</p>;
        return <p key={i}>{inline(t, i)}</p>;
      })}
    </div>
  );
}

export function AssistenteIAView({ T, perfil, lojaAtiva, showToast, onCriarRonda }) {
  const [conversas, setConversas] = useState([]);
  const [conversaId, setConversaId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [tarefa, setTarefa] = useState(null);
  const [acao, setAcao] = useState(null);
  const [historico, setHistorico] = useState(false);
  const [qtdSugestoes, setQtdSugestoes] = useState(3);
  const fim = useRef(null);

  const carregarConversas = useCallback(async () => {
    const { data } = await supabase.from("ia_conversas").select("id, titulo, atualizado_em").order("atualizado_em", { ascending: false }).limit(30);
    setConversas(data || []);
  }, []);
  useEffect(() => { carregarConversas(); }, [carregarConversas]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, pensando]);

  async function abrirConversa(id) {
    setHistorico(false); setConversaId(id); setMsgs([]);
    const { data } = await supabase.from("ia_mensagens").select("id, papel, conteudo, extras, criado_em").eq("conversa_id", id).order("criado_em");
    setMsgs((data || []).map((m) => ({ ...m, ...(m.extras || {}) })));
  }
  function novaConversa() { setConversaId(null); setMsgs([]); setHistorico(false); setAviso(null); }

  async function perguntar(p) {
    const pergunta = (p ?? texto).trim();
    if (!pergunta || pensando) return;
    setTexto(""); setAviso(null);
    setMsgs((m) => [...m, { id: "u" + Date.now(), papel: "usuario", conteudo: pergunta }]);
    setPensando(true);
    // nunca fica girando para sempre: depois de 75 s o app desiste e avisa
    const limite = new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: "tempo_limite" } }), 75000));
    const { data, error } = await Promise.race([
      supabase.functions.invoke("assistente-ia", { body: { pergunta, conversa_id: conversaId, loja_id: lojaAtiva?.id || null } }),
      limite,
    ]);
    setPensando(false);
    if (error) {
      let corpo = null; try { corpo = await error.context?.json?.(); } catch {}
      const msg = corpo?.erro || (error.message === "tempo_limite" ? "A IA demorou demais para responder (o serviço gratuito do Google pode estar sobrecarregado). Tente de novo em instantes."
        : String(error.message || "").includes("Failed to send") ? "Sem conexão com o servidor da IA." : "Não foi possível falar com o assistente agora.");
      if (corpo?.conversa_id) setConversaId(corpo.conversa_id);
      setMsgs((m) => [...m, { id: "e" + Date.now(), papel: "erro", conteudo: msg }]);
      if (corpo?.codigo === "sem_chave") setAviso("sem_chave");
      return;
    }
    setConversaId(data.conversa_id);
    setMsgs((m) => [...m, { id: "a" + Date.now(), papel: "assistente", conteudo: data.resposta, graficos: data.graficos, propostas: data.propostas, ferramentas: data.ferramentas }]);
    carregarConversas();
  }

  async function registrar(tipo, dados, resultado) {
    await supabase.rpc("ia_registrar_acao", { p_tipo: tipo, p_dados: dados, p_resultado: resultado, p_conversa: conversaId });
  }
  function executarProposta(p) {
    if (p.tipo === "ronda") {
      registrar("abrir_ronda", p, "aberta para confirmação");
      onCriarRonda?.({ setor: p.setor, modo: p.modo, quantidade: p.quantidade, barcodes: p.codigos, nome: `Ronda sugerida · ${p.setor}`, obs: p.motivo });
    } else if (p.tipo === "tarefa") setTarefa(p);
    else if (p.tipo === "acao_preventiva") setAcao({ ...p, origem: "assistente" });
  }

  return (
    <div className="px-4 pt-4 lg:px-0 flex flex-col gap-3 lg:grid lg:grid-cols-[260px_1fr] lg:gap-5 lg:items-start">
      {/* histórico de conversas (lateral no PC, gaveta no celular) */}
      <div className={`${historico ? "flex" : "hidden"} lg:flex flex-col gap-2`}>
        <button onClick={novaConversa} style={{ background: BLUE, color: "#fff" }} className="py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"><Plus size={15} /> Nova conversa</button>
        <div style={{ background: T.card }} className="rounded-2xl p-2 flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
          {conversas.length === 0 ? <Vazio T={T} texto="Nenhuma conversa ainda." /> : conversas.map((c) => (
            <button key={c.id} onClick={() => abrirConversa(c.id)} style={c.id === conversaId ? { background: BLUE_SOFT, color: BLUE } : { color: T.text }} className="text-left rounded-xl px-3 py-2">
              <p className="text-[12px] font-semibold truncate">{c.titulo || "Conversa"}</p><p style={{ color: T.subtext }} className="text-[10px]">{dataHoraBR(c.atualizado_em)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 min-w-0">
        <div style={{ background: `linear-gradient(135deg, ${BLUE_DARK} 0%, #1d1240 100%)` }} className="rounded-3xl p-4 lg:p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold tracking-[0.16em] text-white/70 flex items-center gap-1.5"><Sparkles size={14} /> ASSISTENTE IA — INTELIGÊNCIA OPERACIONAL</p>
              <p className="text-base lg:text-lg font-bold mt-1">Pergunte sobre a operação da loja</p>
              <p className="hidden lg:block text-[11.5px] text-white/70 mt-1">Responde só com os dados que você tem permissão de ver. Nada é criado sem a sua confirmação.</p>
            </div>
            <button onClick={() => setHistorico((h) => !h)} className="lg:hidden bg-white/15 rounded-xl px-2.5 py-2 text-[11px] font-semibold flex items-center gap-1 shrink-0"><History size={14} /> Conversas</button>
          </div>
        </div>
        {aviso === "sem_chave" && (
          <div style={{ background: LARANJA_SOFT, color: LARANJA }} className="rounded-2xl p-3 text-[12px] font-semibold">O assistente ainda não foi ativado no servidor: falta o secret GEMINI_API_KEY nas Edge Functions do Supabase.</div>
        )}

        <div style={{ background: T.card }} className="rounded-3xl shadow-lg shadow-black/5 flex flex-col overflow-hidden h-[calc(100dvh-300px)] min-h-[400px] lg:h-[calc(100vh-250px)]">
        <div className="flex-1 min-h-0 overflow-y-auto p-3 lg:p-5 flex flex-col gap-3">
          {msgs.length === 0 && !pensando && (
            <div className="flex flex-col gap-2">
              <p style={{ color: T.subtext }} className="text-xs font-semibold flex items-center gap-1.5"><MessageSquare size={13} /> Sugestões de perguntas</p>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5">{SUGESTOES.slice(0, qtdSugestoes).map((s) => (
                <button key={s} onClick={() => perguntar(s)} style={{ background: T.chipBg }} className="text-left rounded-xl px-3 py-2.5 text-[12.5px] font-medium">{s}</button>
              ))}</div>
              {qtdSugestoes < SUGESTOES.length && (
                <button onClick={() => setQtdSugestoes((n) => Math.min(SUGESTOES.length, n + 3))} style={{ color: BLUE }} className="self-start text-[12px] font-bold flex items-center gap-1 px-1 py-1"><Plus size={13} /> Sugerir mais</button>
              )}
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.papel === "usuario" ? "justify-end" : "justify-start"}`}>
              {m.papel === "usuario" ? (
                <div style={{ background: BLUE, color: "#fff" }} className="rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] max-w-[85%] whitespace-pre-wrap">{m.conteudo}</div>
              ) : m.papel === "erro" ? (
                <div style={{ background: RED_SOFT, color: RED_DARK }} className="rounded-2xl px-3.5 py-2.5 text-[12.5px] font-semibold max-w-[90%] flex items-start gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" />{m.conteudo}</div>
              ) : (
                <div className="max-w-full lg:max-w-[92%] w-full flex flex-col gap-2">
                  <div style={{ background: T.chipBg }} className="rounded-2xl rounded-bl-md px-3.5 py-3"><TextoIA texto={m.conteudo} /></div>
                  {m.graficos?.map((g, i) => (
                    <div key={i} style={{ background: T.bg }} className="rounded-2xl p-3"><p className="text-[12px] font-bold mb-1 flex items-center gap-1.5"><BarChart3 size={13} /> {g.titulo}</p><GraficoSimples T={T} tipo={g.tipo} formato={g.formato} dados={g.dados} altura={190} /></div>
                  ))}
                  {m.propostas?.length > 0 && (
                    <div className="flex flex-col gap-1.5">{m.propostas.map((p, i) => (
                      <div key={i} style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="rounded-2xl p-3 flex items-center gap-3">
                        <Target size={18} className="shrink-0" />
                        <div className="flex-1 min-w-0 text-[12px]">
                          <p className="font-bold">{p.tipo === "ronda" ? `Ronda ${p.modo} em ${p.setor}${p.quantidade ? ` (${p.quantidade} produtos)` : ""}` : p.tipo === "tarefa" ? `Tarefa em ${p.setor} · prioridade ${p.prioridade}` : `Plano de ação · ${p.alvo_nome || p.setor}`}</p>
                          <p className="opacity-80 line-clamp-2">{p.motivo || p.descricao || p.problema}</p>
                        </div>
                        <button onClick={() => executarProposta(p)} style={{ background: BLUE, color: "#fff" }} className="text-[11.5px] font-bold px-3 py-2 rounded-xl shrink-0">Revisar e criar</button>
                      </div>
                    ))}</div>
                  )}
                  {m.ferramentas?.length > 0 && <p style={{ color: T.subtext }} className="text-[10px]">Dados consultados: {m.ferramentas.join(", ").replace(/_/g, " ")}</p>}
                </div>
              )}
            </div>
          ))}
          {pensando && <div style={{ color: T.subtext }} className="flex items-center gap-2 text-[12.5px]"><Loader2 size={15} className="animate-spin" /> Consultando os dados da loja… (pode levar até 1 minuto)</div>}
          <div ref={fim} />
        </div>
        <div style={{ borderTop: `1px solid ${T.chipBg}` }} className="p-2 flex items-end gap-2 shrink-0">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(); } }}
            rows={1} maxLength={1500} placeholder="Pergunte sobre perdas, setores, rondas, tarefas…" style={{ color: T.text, background: T.inputBg }} className="flex-1 rounded-xl outline-none text-sm resize-none px-3 py-2.5 max-h-32" />
          <button onClick={() => perguntar()} disabled={!texto.trim() || pensando} style={{ background: texto.trim() && !pensando ? BLUE : "#C7CEDA", color: "#fff" }} className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"><Send size={16} /></button>
        </div>
        </div>
      </div>

      {tarefa && <NovaTarefaSheet T={T} perfil={perfil} lojaAtiva={lojaAtiva} inicial={tarefa} showToast={showToast} onClose={() => setTarefa(null)}
        onCriada={(id) => { registrar("criar_tarefa", tarefa, `criada ${id}`); setTarefa(null); }} />}
      {acao && <NovaAcaoPreventivaSheet T={T} lojaAtiva={lojaAtiva} inicial={acao} showToast={showToast} onClose={() => setAcao(null)}
        onCriada={(id) => { registrar("criar_acao_preventiva", acao, `criada ${id}`); setAcao(null); }} />}
    </div>
  );
}

// ============================================================================ indicador de risco (rondas)
export function SeloRisco({ risco, nivel }) {
  if (risco == null) return null;
  const n = NIVEL_COR[nivel] || (risco >= 60 ? NIVEL_COR.alta : risco >= 30 ? NIVEL_COR.media : NIVEL_COR.baixa);
  return <span title="Risco calculado pelo histórico (não significa que está vencido)" style={{ background: n.bg, color: n.color }} className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-md tabular-nums whitespace-nowrap">RISCO {risco}</span>;
}
export const MODOS_RONDA = [
  { id: "completa", label: "Completa", desc: "Todos os produtos do setor" },
  { id: "priorizada", label: "Por risco", desc: "Todos, com os de maior risco primeiro" },
  { id: "amostragem", label: "Amostragem", desc: "Metade pelos maiores riscos, metade sorteada" },
  { id: "manual", label: "Manual", desc: "Só os produtos que você escolher" },
];

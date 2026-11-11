// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "../supabaseClient";
import { ClockIcon } from "@heroicons/react/24/outline";
import { X, Wrench, Building2, Users2, Loader2, Check, Plus, Edit2, Search, Lock, Send, Pencil, Mail, Trash2, Ticket, Copy, Clock, Link2, AlertTriangle, Share2 } from "lucide-react";
import { DashBadge, DashCard, DashKpi, DashPageHeader, DashTable, DashTabs } from "../componentes/dash";
import { BLUE, BLUE_DARK, BLUE_SOFT, RED_DARK, RED_SOFT, SETORES, SITE_URL } from "../lib/constantes";
import { formatarDataHoraExtenso } from "../lib/formatos";
import { removerTelegramComAviso } from "../lib/produto";
import { CampoData } from "../componentes/CampoData";
import { tempoDesde } from "./Setores";

// ============ Painel da Rede (item 1) — visão corporativa somando todas as lojas ============
// Pressupõe uma tabela compartilhada "resumo_lojas_rede" (ver supaEnviarResumoRede/supaFetchResumoRede)
// alimentada por cada loja periodicamente. Visível só pra quem tem cargo de nível corporativo (ehCorporativo).
// ============ Gestão do Aplicativo (item: painel de dev) ============
// Só quem tem cargo DESENVOLVEDOR (nivel 1) enxerga essa tela. Ponto único pra gerenciar funcionários,
// e (próximos passos) produtos e notificações de todas as lojas.
function GestaoSheet({ T, title, subtitle, onClose, children, larga = false }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/55" />
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ background: T.card }}
        className={`relative w-full ${larga ? "max-w-lg lg:max-w-5xl lg:w-[92vw]" : "max-w-lg"} rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl lg:ring-1 lg:ring-black/10`}>
        <div className="sticky top-0 z-10 px-5 pt-3 pb-3" style={{ background: T.card }}>
          <div style={{ background: T.border }} className="h-1 w-10 rounded-full mx-auto mb-3 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="text-base font-extrabold">{title}</h3>{subtitle && <p style={{ color: T.subtext }} className="text-xs mt-0.5">{subtitle}</p>}</div>
            <button onClick={onClose} style={{ background: T.chipBg, color: T.subtext }} className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"><X size={15} /></button>
          </div>
        </div>
        <div className="px-5 pb-6 pt-1">{children}</div>
      </motion.div>
    </div>
  );
}

function GestaoCampo({ T, label, children, hint }) {
  return (
    <label className="block">
      <span style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span style={{ color: T.subtext }} className="text-[10.5px] mt-1 block">{hint}</span>}
    </label>
  );
}

function GestaoStat({ T, label, value, Icon, color }) {
  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border p-3 min-w-0">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-extrabold leading-none tabular-nums">{value}</p>
        <div style={{ background: `${color}1F`, color }} className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"><Icon size={15} /></div>
      </div>
      <p style={{ color: T.subtext }} className="text-[10.5px] mt-2 leading-tight font-medium">{label}</p>
    </div>
  );
}

function GestaoAplicativoView({ T, showToast, lojaAtiva, lojas, onTrocarLoja, onRecarregarLojas, nivelUsuario }) {
  const [aba, setAba] = useState("lojas");
  const ABAS = [{ id: "lojas", label: "Lojas" }, { id: "funcionarios", label: "Funcionários" }];
  const ativas = (lojas || []).filter((l) => l.ativo !== false).length;
  const lojaEmUso = (lojas || []).find((l) => l.id === lojaAtiva?.id);
  return (
    <div className="px-4 pt-4 pb-6 lg:px-0 lg:pt-0">
      <div className="hidden lg:block">
        <DashPageHeader T={T} title="Gestão do aplicativo" subtitle={`Loja em uso: ${lojaAtiva?.numero_loja || "—"} · área de desenvolvedor e diretoria`}
          right={<DashTabs T={T} value={aba} onChange={setAba} options={ABAS} />} />
      </div>
      <div className="lg:hidden">
        <div style={{ background: "linear-gradient(150deg, #1B2233 0%, #0B0D12 100%)" }} className="rounded-3xl p-5 mb-4 relative overflow-hidden shadow-lg">
          <Wrench size={110} className="absolute -right-5 -bottom-6 text-white/5" />
          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"><Wrench size={12} /> Gestão do aplicativo</p>
          <p className="text-white text-xl font-extrabold mt-2">{lojaAtiva?.numero_loja ? `Loja ${lojaAtiva.numero_loja}` : "Nenhuma loja em uso"}</p>
          <p className="text-white/60 text-xs mt-0.5">{lojaEmUso ? [lojaEmUso.bairro, lojaEmUso.cidade].filter(Boolean).join(" · ") : "Escolha uma loja na aba Lojas"}</p>
          <div className="flex gap-2 mt-4">
            <span className="bg-white/10 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">{(lojas || []).length} loja(s)</span>
            <span className="bg-white/10 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">{ativas} ativa(s)</span>
          </div>
        </div>
        <div style={{ background: T.chipBg }} className="flex rounded-2xl p-1 mb-4">
          {ABAS.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} style={aba === a.id ? { background: T.card, color: RED_DARK, boxShadow: "0 1px 3px rgba(0,0,0,.1)" } : { color: T.subtext }}
              className="flex-1 text-sm font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5">
              {a.id === "lojas" ? <Building2 size={15} /> : <Users2 size={15} />} {a.label}
            </button>
          ))}
        </div>
      </div>
      {aba === "lojas" && <GestaoLojas T={T} lojas={lojas} lojaAtiva={lojaAtiva} onTrocarLoja={onTrocarLoja} onRecarregarLojas={onRecarregarLojas} showToast={showToast} />}
      {aba === "funcionarios" && <GestaoFuncionarios T={T} showToast={showToast} lojas={lojas || []} lojaAtiva={lojaAtiva} nivelUsuario={nivelUsuario} />}
    </div>
  );
}

function LojaFormSheet({ T, loja, onClose, onSalvo, showToast }) {
  const editando = !!loja;
  const [f, setF] = useState({
    numero_loja: loja?.numero_loja ?? "", rua: loja?.rua || "", numero: loja?.numero || "", complemento: loja?.complemento || "",
    bairro: loja?.bairro || "", cidade: loja?.cidade || "", estado: loja?.estado || "", ativo: loja?.ativo !== false,
  });
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const inp = { background: T.inputBg, color: T.text, borderColor: T.inputBorder };
  const cls = "w-full border rounded-xl px-3 py-2.5 text-sm outline-none";
  async function salvar() {
    const n = parseInt(f.numero_loja, 10);
    if (!Number.isInteger(n) || n < 1 || n > 1000) { showToast("O número da loja precisa ser entre 1 e 1000.", "warn"); return; }
    const dados = {
      numero_loja: n, rua: f.rua.trim() || null, numero: f.numero.trim() || null, complemento: f.complemento.trim() || null,
      bairro: f.bairro.trim() || null, cidade: f.cidade.trim() || null, estado: f.estado.trim().toUpperCase().slice(0, 2) || null, ativo: f.ativo,
    };
    setSalvando(true);
    const { data, error } = editando
      ? await supabase.from("lojas").update({ ...dados, updated_at: new Date().toISOString() }).eq("id", loja.id).select().single()
      : await supabase.from("lojas").insert(dados).select().single();
    setSalvando(false);
    if (error) {
      console.error(error);
      showToast(error.code === "23505" ? `Já existe a loja ${n}.` :
        error.code === "22023" ? (error.message || "Setor inválido.") :
        error.code === "42501" ? "Sem permissão pra criar/editar lojas. Rode o SQL supabase-gestao-lojas.sql no Supabase." :
        "Não foi possível salvar a loja.", "warn");
      return;
    }
    showToast(editando ? `Loja ${n} atualizada.` : `Loja ${n} criada.`);
    onSalvo(data);
  }
  return (
    <GestaoSheet T={T} title={editando ? `Editar loja ${loja.numero_loja}` : "Nova loja"} subtitle="Dados da unidade" onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <GestaoCampo T={T} label="Número da loja" hint="Entre 1 e 1000. Não pode repetir."><input value={f.numero_loja} onChange={(e) => setF((p) => ({ ...p, numero_loja: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="Ex.: 79" style={inp} className={cls} /></GestaoCampo>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><GestaoCampo T={T} label="Rua"><input value={f.rua} onChange={set("rua")} style={inp} className={cls} /></GestaoCampo></div>
          <GestaoCampo T={T} label="Nº"><input value={f.numero} onChange={set("numero")} style={inp} className={cls} /></GestaoCampo>
        </div>
        <GestaoCampo T={T} label="Complemento"><input value={f.complemento} onChange={set("complemento")} style={inp} className={cls} /></GestaoCampo>
        <GestaoCampo T={T} label="Bairro"><input value={f.bairro} onChange={set("bairro")} style={inp} className={cls} /></GestaoCampo>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><GestaoCampo T={T} label="Cidade"><input value={f.cidade} onChange={set("cidade")} style={inp} className={cls} /></GestaoCampo></div>
          <GestaoCampo T={T} label="UF"><input value={f.estado} onChange={set("estado")} maxLength={2} placeholder="SC" style={inp} className={`${cls} uppercase`} /></GestaoCampo>
        </div>
        {editando && (
          <button onClick={() => setF((p) => ({ ...p, ativo: !p.ativo }))} style={{ background: T.chipBg }} className="flex items-center justify-between rounded-xl px-3.5 py-3">
            <span className="text-sm font-semibold">Loja ativa</span>
            <span style={{ background: f.ativo ? "#1F9D55" : T.border }} className="w-11 h-6 rounded-full relative transition"><span style={{ left: f.ativo ? 22 : 3 }} className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all shadow" /></span>
          </button>
        )}
        <button onClick={salvar} disabled={salvando} style={{ background: BLUE }} className="text-white font-bold text-sm py-3 rounded-2xl mt-1 flex items-center justify-center gap-2 disabled:opacity-60">
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {editando ? "Salvar alterações" : "Criar loja"}
        </button>
      </div>
    </GestaoSheet>
  );
}

function GestaoLojas({ T, lojas, lojaAtiva, onTrocarLoja, onRecarregarLojas, showToast }) {
  const [form, setForm] = useState(null); // null | "nova" | loja
  const lista = lojas || [];
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div><h2 className="text-base font-extrabold lg:text-lg">Lojas da rede</h2><p style={{ color: T.subtext }} className="text-xs mt-0.5">Toque em "Usar esta loja" para ver os dados dela no app.</p></div>
        <button onClick={() => setForm("nova")} style={{ background: BLUE }} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl flex items-center gap-1.5 shrink-0 shadow-md"><Plus size={16} /> Nova loja</button>
      </div>
      {lista.length === 0 ? (
        <div style={{ background: T.card, borderColor: T.border }} className="rounded-3xl border p-8 text-center">
          <div style={{ background: BLUE_SOFT }} className="h-14 w-14 rounded-2xl mx-auto flex items-center justify-center mb-3"><Building2 size={24} color={BLUE} /></div>
          <p className="font-bold text-sm">Nenhuma loja cadastrada</p>
          <p style={{ color: T.subtext }} className="text-xs mt-1">Crie a primeira loja para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {lista.map((l) => {
            const emUso = lojaAtiva?.id === l.id;
            const endereco = [l.rua, l.numero].filter(Boolean).join(", ");
            return (
              <div key={l.id} style={{ background: T.card, borderColor: emUso ? BLUE : T.border }} className={`rounded-3xl border p-4 flex flex-col gap-3 ${emUso ? "ring-2 ring-[#0B4F9E]/30" : ""}`}>
                <div className="flex items-start gap-3">
                  <div style={{ background: emUso ? BLUE : BLUE_SOFT, color: emUso ? "#fff" : BLUE_DARK }} className="h-14 w-14 rounded-2xl flex flex-col items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold uppercase leading-none opacity-70">Loja</span><span className="text-xl font-extrabold leading-tight tabular-nums">{l.numero_loja}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{l.bairro || "Sem bairro"}</p>
                    <p style={{ color: T.subtext }} className="text-xs truncate">{[l.cidade, l.estado].filter(Boolean).join(" - ") || "Cidade não informada"}</p>
                    {endereco && <p style={{ color: T.subtext }} className="text-[11px] truncate mt-0.5">{endereco}</p>}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {emUso && <DashBadge bg={BLUE_SOFT} color={BLUE_DARK}>Em uso agora</DashBadge>}
                  <DashBadge bg={l.ativo !== false ? "#E4F7EC" : "#EEF0F3"} color={l.ativo !== false ? "#1F9D55" : "#4B5563"}>{l.ativo !== false ? "Ativa" : "Inativa"}</DashBadge>
                </div>
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => onTrocarLoja(l)} disabled={emUso} style={emUso ? { background: T.chipBg, color: T.subtext } : { background: BLUE, color: "#fff" }} className="flex-1 text-xs font-bold py-2.5 rounded-xl disabled:opacity-70">{emUso ? "Loja em uso" : "Usar esta loja"}</button>
                  <button onClick={() => setForm(l)} style={{ background: T.chipBg, color: T.text }} className="px-3.5 rounded-xl flex items-center justify-center"><Edit2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {form && <LojaFormSheet T={T} loja={form === "nova" ? null : form} showToast={showToast} onClose={() => setForm(null)}
        onSalvo={async (nova) => { setForm(null); await onRecarregarLojas?.(); if (form === "nova" && nova && !lojaAtiva?.id) onTrocarLoja(nova); }} />}
    </div>
  );
}

function GestaoFuncionarios({ T, showToast, lojas, lojaAtiva, nivelUsuario }) {
  const [subaba, setSubaba] = useState("ativos");
  const [lojaSel, setLojaSel] = useState(lojaAtiva?.id || null);
  const [ativos, setAtivos] = useState(null);
  const [pendentes, setPendentes] = useState(null);
  const [cargos, setCargos] = useState([]);
  const [busca, setBusca] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [f, setF] = useState({ nome: "", matricula: "", cargoLoja: "", cargoId: "", setor: "" });
  const [salvando, setSalvando] = useState(false);
  const [convites, setConvites] = useState(null);
  const [pedidos, setPedidos] = useState(null);
  const [meuId, setMeuId] = useState(null);
  const [acaoUsuario, setAcaoUsuario] = useState(null); // funcionário aberto no menu de ações
  const [acaoConvite, setAcaoConvite] = useState(null); // convite aberto no menu de ações
  const [meuSetor, setMeuSetor] = useState(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMeuId(data?.user?.id || null)); }, []);
  useEffect(() => { if (meuId) supabase.from("usuarios").select("setor").eq("id", meuId).maybeSingle().then(({ data }) => setMeuSetor((data?.setor || "").trim() || null)); }, [meuId]);
  const souEncarregado = nivelUsuario === 5;

  // Sem loja escolhida (ex.: dev sem loja própria) => assume a primeira da lista, pra nunca travar o pré-cadastro.
  useEffect(() => { if (!lojaSel && lojas.length) setLojaSel(lojaAtiva?.id || lojas[0].id); }, [lojas, lojaAtiva?.id]);
  const lojaObj = lojas.find((l) => l.id === lojaSel);
  const cgSel = cargos.find((c) => String(c.id) === String(f.cargoId));

  async function carregar() {
    if (!lojaSel) { setAtivos([]); setPendentes([]); return; }
    setAtivos(null); setPendentes(null); setConvites(null); setPedidos(null);
    carregarExtras();
    const [{ data: u, error: eu }, { data: p, error: ep }, { data: c }] = await Promise.all([
      supabase.from("usuarios").select("id, nome, email, telefone, matricula, cargo_id, cargo_nome_loja, ativo, setor, cargos(nome, nivel)").eq("loja_id", lojaSel).eq("promotor", false).order("nome"),
      supabase.from("funcionarios_pendentes").select("*").eq("loja_id", lojaSel).eq("usado", false).order("criado_em", { ascending: false }),
      supabase.from("cargos").select("*").order("nivel"),
    ]);
    if (eu || ep) { console.error(eu || ep); showToast("Não foi possível carregar a equipe. Tente de novo.", "warn"); }
    setAtivos(u || []); setPendentes(p || []);
    setCargos((c || []).filter((x) => x.nome !== "PROMOTOR" && (nivelUsuario === 1 || x.nivel > (nivelUsuario ?? 99))));
  }
  async function carregarExtras() {
    if (!lojaSel) { setConvites([]); setPedidos([]); return; }
    const [{ data: cv }, { data: pr }, { data: pd }] = await Promise.all([
      supabase.from("convites_promotor").select("id, loja_id, token, codigo, nome, marca, marcas, acesso_total, expira_em, criado_em, revogado, pausado, usos, ultimo_uso").eq("loja_id", lojaSel).order("criado_em", { ascending: false }).limit(100),
      supabase.from("usuarios").select("id, convite_id, ativo").eq("loja_id", lojaSel).eq("promotor", true),
      supabase.from("solicitacoes_exclusao").select("*").eq("loja_id", lojaSel).eq("status", "pendente").order("criado_em", { ascending: false }),
    ]);
    setConvites((cv || []).map((c) => ({ ...c, pessoas: (pr || []).filter((x) => x.convite_id === c.id).length })));
    setPedidos(pd || []);
  }
  useEffect(() => { carregar(); }, [lojaSel]);
  const [, setRelogio] = useState(0); // convite que vence com a tela aberta vira "Expirado" sozinho
  useEffect(() => { const t = setInterval(() => setRelogio((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  // tempo real: mudanças de outros gestores aparecem sem recarregar
  useEffect(() => {
    if (!lojaSel) return;
    let t; const r = () => { clearTimeout(t); t = setTimeout(() => carregar(), 500); };
    const ch = supabase.channel(`gestao-func-${lojaSel}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, r)
      .on("postgres_changes", { event: "*", schema: "public", table: "convites_promotor" }, r)
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitacoes_exclusao" }, r)
      .on("postgres_changes", { event: "*", schema: "public", table: "funcionarios_pendentes" }, r)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [lojaSel]);

  async function criarPendente() {
    const mat = (f.matricula.replace(/\D/g, "").replace(/^0+/, "")) || "";
    if (!lojaSel) { showToast("Escolha a loja do funcionário.", "warn"); return; }
    if (!f.nome.trim() || !mat || !f.cargoId) { showToast("Preencha nome, matrícula (só números) e cargo no app.", "warn"); return; }
    const cg = cargos.find((c) => String(c.id) === String(f.cargoId));
    const setorFinal = souEncarregado ? (meuSetor || "") : f.setor.trim();
    if (souEncarregado && !meuSetor) { showToast("Seu usuário não tem setor. Peça à gerência para definir o seu setor.", "warn"); return; }
    if (cg && cg.nivel >= 6 && !setorFinal) { showToast("Escolha o setor do funcionário.", "warn"); return; }
    setSalvando(true);
    const { error } = await supabase.from("funcionarios_pendentes").insert({
      matricula: mat, nome: f.nome.trim(), cargo_nome_loja: f.cargoLoja.trim() || null, cargo_id: Number(f.cargoId),
      setor: setorFinal || null, loja_id: lojaSel, criado_por: "gestao-app",
    });
    setSalvando(false);
    if (error) {
      console.error(error);
      showToast(error.code === "23505" ? "Já existe um pré-cadastro ou conta com essa matrícula (pode ser de outra loja ou já usada)." :
        error.code === "42501" ? "Você não tem permissão para cadastrar nesse cargo ou nessa loja." :
        error.code === "22023" && error.message ? error.message :
        "Não foi possível pré-cadastrar agora. Confira os dados e tente de novo.", "warn");
      return;
    }
    showToast(`${f.nome} pré-cadastrado(a) na loja ${lojaObj?.numero_loja}. Já pode bipar o crachá pra criar a conta.`, "ok");
    setF({ nome: "", matricula: "", cargoLoja: "", cargoId: "", setor: "" }); setNovoAberto(false); setSubaba("pendentes");
    carregar();
  }
  async function removerPendente(matricula) {
    const { error } = await supabase.from("funcionarios_pendentes").delete().eq("matricula", matricula);
    if (error) { console.error(error); showToast("Não foi possível remover.", "warn"); return; }
    setPendentes((prev) => prev.filter((p) => p.matricula !== matricula));
  }
  async function resolverPedido(pd, aprovar) {
    const { error } = await supabase.rpc("resolver_exclusao", { p_id: pd.id, p_aprovar: aprovar });
    if (error) { console.error(error); showToast(erroAcao(error), "warn"); return; }
    showToast(aprovar ? `${pd.nome} foi excluído(a).` : "Pedido recusado.", aprovar ? "ok" : "aviso");
    carregar();
  }

  const termo = busca.trim().toLowerCase();
  const filtra = (x) => !termo || (x.nome || "").toLowerCase().includes(termo) || (x.matricula || "").includes(termo);
  const listaAtivos = (ativos || []).filter(filtra), listaPend = (pendentes || []).filter(filtra);
  const bloqueados = (ativos || []).filter((u) => !u.ativo).length;
  const inp = { background: T.inputBg, color: T.text, borderColor: T.inputBorder };
  const cls = "w-full border rounded-xl px-3 py-2.5 text-sm outline-none";
  const iniciais = (n) => (n || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  if (lojas.length === 0) return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-3xl border p-8 text-center">
      <div style={{ background: BLUE_SOFT }} className="h-14 w-14 rounded-2xl mx-auto flex items-center justify-center mb-3"><Building2 size={24} color={BLUE} /></div>
      <p className="font-bold text-sm">Crie uma loja primeiro</p>
      <p style={{ color: T.subtext }} className="text-xs mt-1">Vá na aba Lojas e toque em "Nova loja". Depois você pré-cadastra os funcionários nela.</p>
    </div>
  );

  return (
    <div>
      <div style={{ background: T.card, borderColor: T.border }} className="rounded-3xl border p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"><Building2 size={20} /></div>
        <div className="flex-1 min-w-[10rem]">
          <p style={{ color: T.subtext }} className="text-[10px] font-bold uppercase tracking-wide">Loja dos funcionários</p>
          <select value={lojaSel || ""} onChange={(e) => setLojaSel(Number(e.target.value))} style={inp} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm font-semibold outline-none">
            {lojas.map((l) => <option key={l.id} value={l.id}>Loja {l.numero_loja}{l.bairro ? ` — ${l.bairro}` : ""}{l.ativo === false ? " (inativa)" : ""}</option>)}
          </select>
        </div>
        <button onClick={() => setNovoAberto(true)} style={{ background: "#1F9D55" }} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md w-full sm:w-auto justify-center"><Plus size={16} /> Pré-cadastrar</button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <GestaoStat T={T} label="Contas ativas" value={ativos ? ativos.length - bloqueados : "…"} Icon={Users2} color="#1F9D55" />
        <GestaoStat T={T} label="Bloqueadas" value={ativos ? bloqueados : "…"} Icon={X} color={RED_DARK} />
        <GestaoStat T={T} label="Aguardando 1º acesso" value={pendentes ? pendentes.length : "…"} Icon={ClockIcon} color="#C98A0C" />
      </div>

      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <div className="max-w-full min-w-0 w-full lg:w-auto"><DashTabs T={T} value={subaba} onChange={setSubaba} options={[{ id: "ativos", label: `Contas (${ativos?.length ?? 0})` }, { id: "pendentes", label: `Aguardando (${pendentes?.length ?? 0})` }, { id: "promotores", label: `Promotores (${convites?.length ?? 0})` }, { id: "pedidos", label: `Aprovações${pedidos?.length ? ` (${pedidos.length})` : ""}` }]} /></div>
        <div style={{ background: T.inputBg, borderColor: T.inputBorder }} className="flex items-center gap-2 border rounded-xl px-3 py-2 flex-1 min-w-[10rem] lg:max-w-xs lg:ml-auto">
          <Search size={14} style={{ color: T.subtext }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou matrícula" style={{ color: T.text }} className="bg-transparent outline-none text-sm flex-1 min-w-0" />
        </div>
      </div>

      {subaba === "promotores" ? (
        <PromotoresLista T={T} convites={convites} termo={termo} onAbrir={setAcaoConvite} showToast={showToast} />
      ) : subaba === "pedidos" ? (
        <PedidosExclusaoLista T={T} pedidos={pedidos} meuId={meuId} nivelUsuario={nivelUsuario} onResolver={resolverPedido} />
      ) : (subaba === "ativos" ? ativos : pendentes) === null ? (
        <div className="text-center py-12"><Loader2 size={22} className="animate-spin mx-auto" color={T.subtext} /></div>
      ) : (subaba === "ativos" ? listaAtivos : listaPend).length === 0 ? (
        <div style={{ background: T.card, borderColor: T.border }} className="rounded-3xl border p-8 text-center">
          <p className="font-bold text-sm">{subaba === "ativos" ? "Nenhuma conta nessa loja ainda" : "Ninguém aguardando o primeiro acesso"}</p>
          <p style={{ color: T.subtext }} className="text-xs mt-1">Use "Pré-cadastrar" para liberar o crachá de um funcionário.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {subaba === "ativos" && listaAtivos.map((u) => (
            <div key={u.id} style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border p-3.5 flex items-center gap-3">
              <div style={{ background: u.ativo ? BLUE_SOFT : "#EEF0F3", color: u.ativo ? BLUE_DARK : "#6B7280" }} className="h-11 w-11 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0">{iniciais(u.nome)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{u.nome}</p>
                <p style={{ color: T.subtext }} className="text-[11px] truncate">{u.matricula ? `Mat. ${u.matricula} · ` : ""}{u.cargo_nome_loja || "—"}</p>
                <p className="mt-1"><DashBadge bg={BLUE_SOFT} color={BLUE_DARK}>{u.cargos?.nome || "sem cargo"}</DashBadge></p>
              </div>
              <DashBadge bg={u.ativo ? "#E6F7ED" : RED_SOFT} color={u.ativo ? "#1F9D55" : RED_DARK}>{u.ativo ? "Ativo" : "Bloqueado"}</DashBadge>
              {u.id !== meuId && (nivelUsuario === 1 || (u.cargos?.nivel ?? 99) > (nivelUsuario ?? 0)) && (
                <button onClick={() => setAcaoUsuario(u)} aria-label={`Ações de ${u.nome}`} style={{ background: T.chipBg, color: T.text }} className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-lg font-bold leading-none">⋯</button>
              )}
            </div>
          ))}
          {subaba === "pendentes" && listaPend.map((p) => (
            <div key={p.matricula} style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border p-3.5 flex items-center gap-3">
              <div style={{ background: "#FCF0DD", color: "#C2760C" }} className="h-11 w-11 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0">{iniciais(p.nome)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{p.nome}</p>
                <p style={{ color: T.subtext }} className="text-[11px] truncate">Mat. {p.matricula} · {p.cargo_nome_loja || "—"}</p>
                <p style={{ color: "#C2760C" }} className="text-[10.5px] font-semibold mt-0.5">Aguardando 1º acesso</p>
              </div>
              <button onClick={() => removerPendente(p.matricula)} style={{ background: RED_SOFT, color: RED_DARK }} className="text-[11px] font-bold px-3 py-1.5 rounded-full shrink-0">Remover</button>
            </div>
          ))}
        </div>
      )}

      {acaoUsuario && <AcoesFuncionarioSheet T={T} u={acaoUsuario} nivelUsuario={nivelUsuario} cargos={cargos} showToast={showToast} onClose={() => setAcaoUsuario(null)} onFeito={() => { setAcaoUsuario(null); carregar(); }} />}
      {acaoConvite && <AcoesConviteSheet T={T} c={acaoConvite} nivelUsuario={nivelUsuario} showToast={showToast} onClose={() => setAcaoConvite(null)} onFeito={() => { setAcaoConvite(null); carregar(); }} />}
      {novoAberto && (
        <GestaoSheet T={T} title="Pré-cadastrar funcionário" subtitle={`Loja ${lojaObj?.numero_loja ?? "—"}${lojaObj?.bairro ? ` — ${lojaObj.bairro}` : ""}`} onClose={() => setNovoAberto(false)}>
          <div className="flex flex-col gap-3.5">
            <GestaoCampo T={T} label="Loja">
              <select value={lojaSel || ""} onChange={(e) => setLojaSel(Number(e.target.value))} style={inp} className={cls}>
                {lojas.map((l) => <option key={l.id} value={l.id}>Loja {l.numero_loja}{l.bairro ? ` — ${l.bairro}` : ""}</option>)}
              </select>
            </GestaoCampo>
            <GestaoCampo T={T} label="Nome completo"><input value={f.nome} onChange={(e) => setF((p) => ({ ...p, nome: e.target.value }))} style={inp} className={cls} /></GestaoCampo>
            <GestaoCampo T={T} label="Matrícula (crachá)" hint="Só números."><input value={f.matricula} onChange={(e) => setF((p) => ({ ...p, matricula: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" style={inp} className={cls} /></GestaoCampo>
            <GestaoCampo T={T} label="Cargo no app (nível de acesso)">
              <select value={f.cargoId} onChange={(e) => { const cg = cargos.find((c) => String(c.id) === e.target.value); setF((p) => ({ ...p, cargoId: e.target.value, setor: souEncarregado ? "" : (cg?.setor_padrao || p.setor) })); }} style={inp} className={cls}>
                <option value="">Selecione…</option>{cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </GestaoCampo>
            <GestaoCampo T={T} label="Cargo na loja (opcional)"><input value={f.cargoLoja} onChange={(e) => setF((p) => ({ ...p, cargoLoja: e.target.value }))} placeholder="Ex.: CPD, Repositor" style={inp} className={cls} /></GestaoCampo>
            {souEncarregado
              ? <GestaoCampo T={T} label="Setor" hint="O funcionário entra no seu setor automaticamente."><div style={inp} className={cls}>{meuSetor || "Seu usuário está sem setor"}</div></GestaoCampo>
              : <GestaoCampo T={T} label={cgSel && cgSel.nivel >= 6 ? "Setor (obrigatório)" : "Setor (opcional)"} hint={cgSel && cgSel.nivel === 5 ? "A conta do encarregado já começa com este setor." : undefined}><select value={f.setor} onChange={(e) => setF((p) => ({ ...p, setor: e.target.value }))} style={inp} className={cls}><option value="">{cgSel && cgSel.nivel >= 6 ? "Escolha o setor…" : "Sem setor"}</option>{[...SETORES.filter((s) => s !== "Outro"), "Frente Caixa", ...(f.setor && !SETORES.includes(f.setor) && f.setor !== "Frente Caixa" ? [f.setor] : [])].map((s) => <option key={s} value={s}>{s}</option>)}</select></GestaoCampo>}
            <button onClick={criarPendente} disabled={salvando} style={{ background: "#1F9D55" }} className="text-white font-bold text-sm py-3 rounded-2xl mt-1 flex items-center justify-center gap-2 disabled:opacity-60">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Pré-cadastrar
            </button>
          </div>
        </GestaoSheet>
      )}
    </div>
  );
}

function erroAcao(error) {
  const m = error?.message || "";
  return m.includes("nao_pode_si_mesmo") ? "Você não pode fazer isso com a sua própria conta." :
    m.includes("sem_permissao") ? "Você não tem permissão pra essa ação." :
    m.includes("ja_solicitado") ? "Já existe um pedido de exclusão pendente pra essa pessoa." :
    m.includes("pedido_invalido") ? "Esse pedido já foi resolvido." :
    m.includes("nome_vazio") ? "O nome não pode ficar vazio." :
    m.includes("acesso_total_exige_gerencia") ? "Só gerência ou diretoria mexe em convite de acesso total." :
    m.includes("marcas_demais") ? "No máximo 5 marcas por convite." :
    m.includes("marca_invalida") ? "Informe de 1 a 5 marcas válidas (3 a 30 letras ou números)." :
    m.includes("expira_invalida") ? "A nova data precisa ser no futuro (no máximo 100 anos). Para cortar o acesso agora, use Pausar (volta depois) ou Bloquear (não volta)." :
    m.includes("convite_revogado") ? "Esse convite está bloqueado e não pode ser editado." :
    m.includes("atualizar_convite") && (m.includes("PGRST202") || m.includes("schema cache") || m.includes("does not exist")) ? "Falta rodar o SQL supabase-convite-editar.sql no Supabase." :
    m.includes("function") && m.includes("does not exist") ? "Falta rodar o SQL supabase-funcionarios-acoes.sql no Supabase." :
    "Não foi possível concluir. Tente de novo.";
}

// Botão de ação com confirmação em dois toques (evita bloquear/excluir sem querer)
function BotaoAcao({ T, Icon, titulo, desc, cor, bg, onConfirmar, confirmaTexto, ocupado }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => { if (!armado) return; const t = setTimeout(() => setArmado(false), 5000); return () => clearTimeout(t); }, [armado]);
  return (
    <button disabled={ocupado} onClick={() => (armado ? (setArmado(false), onConfirmar()) : (confirmaTexto ? setArmado(true) : onConfirmar()))}
      style={{ background: armado ? cor : bg, color: armado ? "#fff" : cor }} className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left disabled:opacity-60 transition-colors">
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold">{armado ? confirmaTexto : titulo}</span>
        {!armado && desc && <span className="block text-[11px] opacity-80 mt-0.5">{desc}</span>}
      </span>
    </button>
  );
}

function AcoesFuncionarioSheet({ T, u, nivelUsuario, cargos, showToast, onClose, onFeito }) {
  const [modo, setModo] = useState("menu"); // menu | editar
  const [ocupado, setOcupado] = useState(false);
  const [f, setF] = useState({ nome: u.nome || "", cargoId: String(u.cargo_id || ""), cargoLoja: u.cargo_nome_loja || "", setor: u.setor || "", telefone: u.telefone || "" });
  const admin = nivelUsuario != null && nivelUsuario <= 2;
  const inp = { background: T.inputBg, color: T.text, borderColor: T.inputBorder };
  const cls = "w-full border rounded-xl px-3 py-2.5 text-sm outline-none";

  async function executar(fn, msgOk) {
    setOcupado(true);
    const { error } = await fn();
    setOcupado(false);
    if (error) { console.error(error); showToast(erroAcao(error), "warn"); return; }
    showToast(msgOk); onFeito();
  }
  const alternar = () => executar(() => supabase.rpc("alternar_acesso_usuario", { p_id: u.id, p_ativo: !u.ativo }), u.ativo ? `${u.nome} foi bloqueado(a).` : `${u.nome} foi desbloqueado(a).`);
  const excluir = () => executar(() => supabase.rpc("excluir_usuario", { p_id: u.id }), `${u.nome} foi excluído(a).`);
  const pedirExclusao = () => executar(() => supabase.rpc("solicitar_exclusao", { p_id: u.id }), "Pedido enviado. Um gerente, a diretoria ou o dev precisa aprovar.");
  const redefinir = () => {
    if (!u.email) { showToast("Essa conta não tem e-mail cadastrado.", "warn"); return Promise.resolve(); }
    return executar(() => supabase.auth.resetPasswordForEmail(u.email, { redirectTo: SITE_URL }), `Link de nova senha enviado para ${u.email}.`);
  };
  const salvar = () => {
    if (!f.nome.trim() || !f.cargoId) { showToast("Preencha nome e cargo.", "warn"); return Promise.resolve(); }
    return executar(() => supabase.rpc("editar_usuario", { p_id: u.id, p_nome: f.nome, p_cargo_id: Number(f.cargoId), p_cargo_nome_loja: f.cargoLoja, p_setor: f.setor, p_telefone: f.telefone }), "Dados atualizados.");
  };

  return (
    <GestaoSheet T={T} title={modo === "editar" ? "Editar funcionário" : u.nome} subtitle={modo === "editar" ? `Mat. ${u.matricula || "—"}` : `${u.cargos?.nome || "sem cargo"}${u.matricula ? ` · Mat. ${u.matricula}` : ""}`} onClose={onClose}>
      {modo === "menu" ? (
        <div className="flex flex-col gap-2.5">
          <BotaoAcao T={T} ocupado={ocupado} Icon={u.ativo ? Lock : Check} titulo={u.ativo ? "Bloquear acesso" : "Desbloquear acesso"} desc={u.ativo ? "A pessoa perde o acesso ao app na hora." : "Devolve o acesso ao app."}
            cor={u.ativo ? "#C98A0C" : "#1F9D55"} bg={u.ativo ? "#FCF0DD" : "#E6F7ED"} confirmaTexto={u.ativo ? "Toque de novo para bloquear" : "Toque de novo para desbloquear"} onConfirmar={alternar} />
          <BotaoAcao T={T} ocupado={ocupado} Icon={Send} titulo="Remover Telegram" desc="Desvincula o Telegram desta pessoa (se houver)." cor={BLUE_DARK} bg={BLUE_SOFT}
            confirmaTexto="Toque de novo para remover" onConfirmar={() => executar(() => removerTelegramComAviso({ usuario: u.id }), "Telegram removido.")} />
          {admin && (
            <>
              <button onClick={() => setModo("editar")} style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left">
                <Pencil size={18} className="shrink-0" /><span><span className="block text-sm font-bold">Editar dados</span><span className="block text-[11px] opacity-80 mt-0.5">Nome, cargo, setor e telefone.</span></span>
              </button>
              <BotaoAcao T={T} ocupado={ocupado} Icon={Mail} titulo="Enviar redefinição de senha" desc={u.email ? `Manda o link para ${u.email}.` : "Sem e-mail cadastrado."} cor={BLUE_DARK} bg={BLUE_SOFT} confirmaTexto="Toque de novo para enviar o e-mail" onConfirmar={redefinir} />
              <BotaoAcao T={T} ocupado={ocupado} Icon={Trash2} titulo="Excluir funcionário" desc="Apaga a conta de vez. Não dá pra desfazer." cor={RED_DARK} bg={RED_SOFT} confirmaTexto="Toque de novo para EXCLUIR" onConfirmar={excluir} />
            </>
          )}
          {!admin && (
            <BotaoAcao T={T} ocupado={ocupado} Icon={Trash2} titulo="Pedir exclusão" desc="Vai para aprovação de gerente, diretoria ou dev." cor={RED_DARK} bg={RED_SOFT} confirmaTexto="Toque de novo para enviar o pedido" onConfirmar={pedirExclusao} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <GestaoCampo T={T} label="Nome completo"><input value={f.nome} onChange={(e) => setF((p) => ({ ...p, nome: e.target.value }))} style={inp} className={cls} /></GestaoCampo>
          <GestaoCampo T={T} label="Cargo no app (nível de acesso)">
            <select value={f.cargoId} onChange={(e) => setF((p) => ({ ...p, cargoId: e.target.value }))} style={inp} className={cls}>
              {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              {!cargos.some((c) => String(c.id) === f.cargoId) && <option value={f.cargoId}>{u.cargos?.nome || "atual"}</option>}
            </select>
          </GestaoCampo>
          <GestaoCampo T={T} label="Cargo na loja"><input value={f.cargoLoja} onChange={(e) => setF((p) => ({ ...p, cargoLoja: e.target.value }))} style={inp} className={cls} /></GestaoCampo>
          <GestaoCampo T={T} label="Setor"><select value={f.setor} onChange={(e) => setF((p) => ({ ...p, setor: e.target.value }))} style={inp} className={cls}><option value="">Sem setor</option>{[...SETORES.filter((s) => s !== "Outro"), "Frente Caixa", ...(f.setor && !SETORES.includes(f.setor) && f.setor !== "Frente Caixa" ? [f.setor] : [])].map((s) => <option key={s} value={s}>{s}</option>)}</select></GestaoCampo>
          <GestaoCampo T={T} label="Telefone"><input value={f.telefone} onChange={(e) => setF((p) => ({ ...p, telefone: e.target.value }))} inputMode="tel" style={inp} className={cls} /></GestaoCampo>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button onClick={() => setModo("menu")} style={{ background: T.chipBg, color: T.text }} className="py-3 rounded-2xl text-sm font-bold">Voltar</button>
            <button onClick={salvar} disabled={ocupado} style={{ background: BLUE, color: "#fff" }} className="py-3 rounded-2xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2">{ocupado && <Loader2 size={15} className="animate-spin" />} Salvar</button>
          </div>
        </div>
      )}
    </GestaoSheet>
  );
}

const statusConvite = (c, T) =>
  c.revogado ? { id: "cancelado", label: "Cancelado", bg: RED_SOFT, color: RED_DARK } :
  c.pausado ? { id: "pausado", label: "Pausado", bg: "#FCF0DD", color: "#C2760C" } :
  new Date(c.expira_em) <= new Date() ? { id: "expirado", label: "Expirado", bg: T.chipBg, color: T.subtext } :
  { id: "ativo", label: "Ativo", bg: "#E6F7ED", color: "#1F9D55" };

function PromotoresLista({ T, convites, termo, onAbrir }) {
  if (convites === null) return <div className="text-center py-12"><Loader2 size={22} className="animate-spin mx-auto" color={T.subtext} /></div>;
  const lista = convites.filter((c) => !termo || (c.nome || "").toLowerCase().includes(termo) || marcasConvite(c).toLowerCase().includes(termo));
  if (lista.length === 0) return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-3xl border p-8 text-center">
      <p className="font-bold text-sm">Nenhum promotor nessa loja</p>
      <p style={{ color: T.subtext }} className="text-xs mt-1">Gere um link no menu "Convites de promotor". Eles aparecem aqui pra você pausar, bloquear ou excluir.</p>
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
      {lista.map((c) => {
        const st = statusConvite(c, T);
        return (
          <div key={c.id} style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border p-3.5 flex items-center gap-3">
            <div style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="h-11 w-11 rounded-full flex items-center justify-center shrink-0"><Ticket size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{c.nome}</p>
              <p style={{ color: T.subtext }} className="text-[11px] truncate">{marcasConvite(c)} · {st.id === "expirado" ? "venceu" : "vale até"} {formatarDataHoraExtenso(c.expira_em)}</p>
              <p style={{ color: T.subtext }} className="text-[10.5px] mt-0.5">{c.usos ? `${c.usos} abertura(s) · ${tempoDesde(c.ultimo_uso)}` : "ainda não aberto"}</p>
            </div>
            <DashBadge bg={st.bg} color={st.color}>{st.label}</DashBadge>
            <button onClick={() => onAbrir(c)} aria-label={`Ações de ${c.nome}`} style={{ background: T.chipBg, color: T.text }} className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-lg font-bold leading-none">⋯</button>
          </div>
        );
      })}
    </div>
  );
}

function AcoesConviteSheet({ T, c, nivelUsuario, showToast, onClose, onFeito }) {
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(false);
  const st = statusConvite(c, T);
  async function executar(fn, msgOk) {
    setOcupado(true); const { error } = await fn(); setOcupado(false);
    if (error) { console.error(error); showToast(erroAcao(error), "warn"); return; }
    showToast(msgOk); onFeito();
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(linkDoConvite(c)); showToast("Link copiado."); } catch { showToast("Não deu pra copiar.", "warn"); }
  }
  if (editando) return <EditarConviteSheet T={T} c={c} nivelUsuario={nivelUsuario} showToast={showToast} onClose={() => setEditando(false)} onFeito={onFeito} />;
  const podeEditar = !c.revogado && !(c.acesso_total && !(nivelUsuario != null && nivelUsuario <= 4));
  return (
    <GestaoSheet T={T} title={c.nome} subtitle={`${marcasConvite(c)} · ${st.label}`} onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        {podeEditar && (
          <button onClick={() => setEditando(true)} style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left"><Pencil size={18} /><span className="flex-1 min-w-0"><span className="block text-sm font-bold">Editar validade e marcas</span><span className="block text-[11px] opacity-80 mt-0.5">Mudar a data de vencimento, tirar o acesso total ou trocar as marcas.</span></span></button>
        )}
        {c.codigo && <p style={{ background: T.chipBg, color: T.text }} className="text-xs rounded-xl px-3 py-2">Código do promotor: <b className="font-mono select-all">{c.codigo}</b></p>}
        {st.id === "ativo" && (
          <button onClick={copiar} style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left"><Copy size={18} /><span className="text-sm font-bold">Copiar link do convite</span></button>
        )}
        <BotaoAcao T={T} ocupado={ocupado} Icon={Send} titulo="Remover Telegram do promotor" desc="Desvincula o Telegram deste código. O promotor pode vincular outro depois." cor={BLUE_DARK} bg={BLUE_SOFT}
          confirmaTexto="Toque de novo para remover" onConfirmar={() => executar(() => removerTelegramComAviso({ convite: c.id }), "Telegram do promotor removido.")} />
        {!c.revogado && (
          <BotaoAcao T={T} ocupado={ocupado} Icon={c.pausado ? Check : Clock} titulo={c.pausado ? "Retomar convite" : "Pausar convite"}
            desc={c.pausado ? "Devolve o acesso ao promotor." : "Suspende o acesso por enquanto. Dá pra retomar depois."} cor={c.pausado ? "#1F9D55" : "#C2760C"} bg={c.pausado ? "#E6F7ED" : "#FCF0DD"}
            confirmaTexto={c.pausado ? "Toque de novo para retomar" : "Toque de novo para pausar"} onConfirmar={() => executar(() => supabase.rpc("pausar_convite", { p_id: c.id, p_pausar: !c.pausado }), c.pausado ? "Convite retomado." : "Convite pausado.")} />
        )}
        {!c.revogado && (
          <BotaoAcao T={T} ocupado={ocupado} Icon={Lock} titulo="Bloquear de vez" desc="Cancela o link e derruba quem entrou por ele. Não volta." cor="#C98A0C" bg="#FCF0DD"
            confirmaTexto="Toque de novo para bloquear" onConfirmar={() => executar(() => supabase.rpc("revogar_convite", { p_id: c.id }), "Convite bloqueado.")} />
        )}
        <BotaoAcao T={T} ocupado={ocupado} Icon={Trash2} titulo="Excluir convite" desc="Apaga o convite e o acesso do promotor." cor={RED_DARK} bg={RED_SOFT}
          confirmaTexto="Toque de novo para EXCLUIR" onConfirmar={() => executar(() => supabase.rpc("excluir_convite", { p_id: c.id }), "Convite excluído.")} />
      </div>
    </GestaoSheet>
  );
}

// Edita um convite de promotor já criado (validade e marcas). A regra de quem pode vale no banco (RPC atualizar_convite).
function EditarConviteSheet({ T, c, nivelUsuario, showToast, onClose, onFeito }) {
  const [total, setTotal] = useState(!!c.acesso_total);
  const [marcas, setMarcas] = useState(Array.isArray(c.marcas) ? c.marcas : []);
  const [txt, setTxt] = useState("");
  const [modo, setModo] = useState("manter"); // manter | id de DURACOES_CONVITE | data
  const [dataISO, setDataISO] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const podeTotal = nivelUsuario != null && nivelUsuario <= 4;
  const salvandoRef = useRef(false);
  const inputCls = "border rounded-xl px-3 py-2.5 text-sm outline-none w-full";
  const inputStyle = { background: T.inputBg, color: T.text, borderColor: T.inputBorder, boxSizing: "border-box" };
  async function salvar() {
    if (ocupado || salvandoRef.current) return;
    let lista = marcas;
    if (!total) {
      const pend = normalizarMarca(txt);
      if (pend && !lista.includes(pend)) {
        if (pend.length < 3 || pend.length > 30) { showToast("A marca digitada precisa ter de 3 a 30 letras.", "warn"); return; }
        if (lista.length >= 5) { showToast("No máximo 5 marcas por convite.", "warn"); return; }
        lista = [...lista, pend];
      }
      if (lista.length === 0) { showToast("Informe pelo menos uma marca (ou marque acesso total).", "warn"); return; }
    }
    let expira = null;
    if (modo === "data") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) { showToast("Informe a data completa (dd/mm/aaaa).", "warn"); return; }
      const d = new Date(`${dataISO}T23:59:59`);
      if (isNaN(d.getTime()) || d.getTime() <= Date.now()) { showToast("A data precisa ser no futuro. Para cortar o acesso agora, use Pausar (volta depois) ou Bloquear (não volta).", "warn"); return; }
      expira = d.toISOString();
    } else if (modo !== "manter") {
      const horas = DURACOES_CONVITE.find((x) => x.id === modo)?.horas;
      if (!horas) return;
      expira = new Date(Date.now() + horas * 3600000).toISOString();
    }
    if (modo === "manter" && new Date(c.expira_em) <= new Date()) { showToast("Esse convite está vencido. Escolha uma nova validade para reativar.", "warn"); return; }
    salvandoRef.current = true;
    setOcupado(true);
    const { data, error } = await supabase.rpc("atualizar_convite", { p_id: c.id, p_expira_em: expira, p_marcas: total || (!c.acesso_total && JSON.stringify(lista) === JSON.stringify(c.marcas || [])) ? null : lista, p_acesso_total: total });
    setOcupado(false);
    salvandoRef.current = false;
    if (error) { console.error(error); showToast(erroAcao(error), "warn"); return; }
    showToast(data?.mudou === false ? "Nada mudou." : "Convite atualizado.", "ok");
    onFeito();
  }
  return (
    <GestaoSheet T={T} title={`Editar convite de ${c.nome}`} subtitle={`${marcasConvite(c)} · ${validadeConvite(c)}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <MarcasPicker T={T} lojaId={c.loja_id} marcas={marcas} setMarcas={setMarcas} acessoTotal={total} setAcessoTotal={setTotal} podeTotal={podeTotal} inputStyle={inputStyle} inputCls={inputCls} showToast={showToast} txt={txt} setTxt={setTxt} />
        <div className="flex flex-col gap-1.5">
          <label style={{ color: T.subtext }} className="text-[11px] font-medium">Validade do convite</label>
          <select value={modo} onChange={(e) => setModo(e.target.value)} style={inputStyle} className={inputCls}>
            <option value="manter">Manter ({validadeConvite(c)})</option>
            {DURACOES_CONVITE.map((d) => <option key={d.id} value={d.id}>A partir de agora: {d.label}</option>)}
            <option value="data">Escolher uma data…</option>
          </select>
          {modo === "data" && <CampoData T={T} value={dataISO} onChange={setDataISO} style={inputStyle} className={inputCls} />}
          {modo === "data" && <p style={{ color: T.subtext }} className="text-[10.5px]">O acesso vale até o fim desse dia (23:59).</p>}
        </div>
        <p style={{ color: T.subtext }} className="text-[10.5px]">O código do promotor continua o mesmo e links antigos seguem valendo. A mudança já vale no servidor; a tela de quem está com o app aberto atualiza ao recarregar. Fica registrado na auditoria.</p>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={ocupado} style={{ color: T.subtext }} className="flex-1 text-sm py-2.5">Voltar</button>
          <button onClick={salvar} disabled={ocupado} style={{ background: BLUE, color: "#fff" }} className="flex-[2] py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">{ocupado ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar alterações</button>
        </div>
      </div>
    </GestaoSheet>
  );
}

function PedidosExclusaoLista({ T, pedidos, meuId, nivelUsuario, onResolver }) {
  if (pedidos === null) return <div className="text-center py-12"><Loader2 size={22} className="animate-spin mx-auto" color={T.subtext} /></div>;
  if (pedidos.length === 0) return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-3xl border p-8 text-center">
      <p className="font-bold text-sm">Nenhum pedido de exclusão pendente</p>
      <p style={{ color: T.subtext }} className="text-xs mt-1">Quando um encarregado pedir pra excluir alguém, o pedido aparece aqui pra gerente, diretoria ou dev aprovar.</p>
    </div>
  );
  const podeAprovar = nivelUsuario != null && nivelUsuario <= 4;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
      {pedidos.map((pd) => (
        <div key={pd.id} style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border p-3.5 flex flex-col gap-2.5">
          <div>
            <p className="text-sm font-bold">Excluir {pd.nome}</p>
            <p style={{ color: T.subtext }} className="text-[11px]">{pd.matricula ? `Mat. ${pd.matricula} · ` : ""}{pd.cargo_nome || "—"}</p>
            <p style={{ color: T.subtext }} className="text-[11px] mt-0.5">Pedido por {pd.solicitante_nome || "—"} · {tempoDesde(pd.criado_em)}</p>
          </div>
          {podeAprovar && pd.solicitante_id !== meuId ? (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onResolver(pd, false)} style={{ background: T.chipBg, color: T.text }} className="py-2.5 rounded-xl text-xs font-bold">Recusar</button>
              <BotaoAcao T={T} Icon={Trash2} titulo="Aprovar" cor={RED_DARK} bg={RED_SOFT} confirmaTexto="Confirmar exclusão" onConfirmar={() => onResolver(pd, true)} />
            </div>
          ) : (
            <p style={{ color: "#C2760C" }} className="text-[11px] font-semibold">{pd.solicitante_id === meuId ? "Aguardando um gerente, a diretoria ou o dev aprovar." : "Só gerente, diretoria ou dev aprovam."}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ Convites de promotor ============
// Encarregado+ gera um link com nome, marca e validade. Quem abre o link entra direto (sessão anônima)
// com o cargo PROMOTOR até a data de expiração. "Cancelar" derruba o link e todo aparelho que entrou por ele.
const DURACOES_CONVITE = [
  { id: "4h", label: "4 horas", horas: 4 },
  { id: "8h", label: "1 turno (8h)", horas: 8 },
  { id: "1d", label: "1 dia", horas: 24 },
  { id: "3d", label: "3 dias", horas: 72 },
  { id: "7d", label: "7 dias", horas: 168 },
  { id: "15d", label: "15 dias", horas: 360 },
  { id: "30d", label: "30 dias", horas: 720 },
  { id: "perm", label: "Permanente (link fixo)", horas: 876000 },
];

const marcasConvite = (c) => c.acesso_total ? "Todas as marcas" : (Array.isArray(c.marcas) && c.marcas.length ? c.marcas.join(", ") : (c.marca || ""));

const normalizarMarca = (bruto) => String(bruto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 .&'-]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

const COLUNAS_CONVITE = "id, token, codigo, nome, marca, marcas, acesso_total, expira_em, criado_em, revogado, pausado, usos, ultimo_uso";

// Escolha de 1 a 5 marcas (com sugestões das marcas já registradas na loja e quantos produtos casam) ou acesso total
function MarcasPicker({ T, lojaId, marcas, setMarcas, acessoTotal, setAcessoTotal, podeTotal, inputStyle, inputCls, showToast, txt, setTxt }) {
  const [sug, setSug] = useState([]);
  const [conta, setConta] = useState({});
  useEffect(() => {
    if (!lojaId || acessoTotal) { setSug([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("listar_marcas", { p_loja: lojaId, p_busca: txt.trim() });
      setSug(Array.isArray(data) ? data.filter((m) => !marcas.includes(m.nome)).slice(0, 8) : []);
    }, 250);
    return () => clearTimeout(t);
  }, [txt, lojaId, acessoTotal, marcas.length]);
  async function adicionar(bruto) {
    const m = normalizarMarca(bruto);
    if (m.length < 3 || m.length > 30) { showToast("A marca precisa ter de 3 a 30 letras.", "warn"); return; }
    if (marcas.includes(m)) { setTxt(""); return; }
    if (marcas.length >= 5) { showToast("No máximo 5 marcas por convite.", "warn"); return; }
    setMarcas([...marcas, m]); setTxt("");
    const { data } = await supabase.rpc("contar_produtos_marca", { p_loja: lojaId, p_marca: m });
    setConta((c) => ({ ...c, [m]: typeof data === "number" ? data : null }));
  }
  return (
    <div className="flex flex-col gap-2">
      {podeTotal && (
        <label style={{ background: acessoTotal ? RED_SOFT : T.chipBg, color: acessoTotal ? RED_DARK : T.text }} className="rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-xs cursor-pointer">
          <input type="checkbox" checked={acessoTotal} onChange={(e) => setAcessoTotal(e.target.checked)} className="mt-0.5" />
          <span><b>Acesso total</b> — pode lançar produto de QUALQUER marca (para quem trabalha fora do horário da loja). Fica registrado na auditoria.</span>
        </label>
      )}
      {!acessoTotal && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {marcas.map((m) => (
              <span key={m} style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="text-[11px] font-bold rounded-full pl-2.5 pr-1.5 py-1 flex items-center gap-1">
                {m}{conta[m] === 0 ? " · nenhum produto casa ainda" : typeof conta[m] === "number" ? ` · ${conta[m]} prod.` : ""}
                <button type="button" aria-label={`Remover ${m}`} onClick={() => setMarcas(marcas.filter((x) => x !== m))} className="h-4 w-4 rounded-full flex items-center justify-center"><X size={11} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={30} placeholder={marcas.length ? "Outra marca do mesmo promotor" : "Marca (ex.: Nestlé, Melitta)"}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(txt); } }} style={inputStyle} className={inputCls} />
            <button type="button" onClick={() => adicionar(txt)} disabled={marcas.length >= 5} style={{ background: BLUE, color: "#fff" }} className="px-3 rounded-xl text-sm font-bold disabled:opacity-50 shrink-0">+</button>
          </div>
          {sug.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sug.map((m) => (
                <button key={m.nome} type="button" onClick={() => adicionar(m.nome)} style={{ background: T.chipBg, color: T.text }} className="text-[11px] font-semibold rounded-full px-2.5 py-1">{m.nome}{m.produtos ? ` · ${m.produtos}` : ""}</button>
              ))}
            </div>
          )}
          <p style={{ color: T.subtext }} className="text-[10.5px]">De 1 a 5 marcas. O promotor só lança produtos cujo nome tem uma dessas marcas.</p>
        </>
      )}
    </div>
  );
}

const slugMarca = (m) => String(m || "marca").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "marca";

const linkDoConvite = (c) => c.codigo ? `${SITE_URL}/promotor/${slugMarca(c.marca)}/${c.codigo}` : `${SITE_URL}/?convite=${c.token}`;

const conviteSemPrazo = (c) => new Date(c.expira_em).getTime() - Date.now() > 50 * 365 * 864e5;

const validadeConvite = (c) => conviteSemPrazo(c) ? "sem prazo (link permanente)" : `vale até ${formatarDataHoraExtenso(c.expira_em)}`;

function ConvitesPromotorView({ T, showToast, lojaAtiva, nivelUsuario }) {
  const [nome, setNome] = useState("");
  const [marcas, setMarcas] = useState([]);
  const [acessoTotal, setAcessoTotal] = useState(false);
  const [marcaTxt, setMarcaTxt] = useState("");
  const [duracao, setDuracao] = useState("1d");
  const [gerando, setGerando] = useState(false);
  const [recente, setRecente] = useState(null); // convite recém-criado, pra copiar/enviar
  const [convites, setConvites] = useState(null);

  async function carregar() {
    if (!lojaAtiva?.id) return;
    const { data, error } = await supabase.from("convites_promotor")
      .select(COLUNAS_CONVITE)
      .eq("loja_id", lojaAtiva.id).order("criado_em", { ascending: false }).limit(100);
    if (error) { console.error(error); showToast("Erro ao carregar convites.", "warn"); setConvites([]); return; }
    setConvites(data || []);
  }
  useEffect(() => { carregar(); }, [lojaAtiva?.id]);
  // tempo real: convite cancelado, pausado, usado ou criado em outro aparelho aparece na hora
  useEffect(() => {
    if (!lojaAtiva?.id) return undefined;
    let t; const r = () => { clearTimeout(t); t = setTimeout(() => carregar(), 400); };
    const ch = supabase.channel(`convites-${lojaAtiva.id}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "convites_promotor" }, r)
      .subscribe();
    const foco = () => { if (document.visibilityState === "visible") carregar(); };
    document.addEventListener("visibilitychange", foco);
    return () => { clearTimeout(t); supabase.removeChannel(ch); document.removeEventListener("visibilitychange", foco); };
  }, [lojaAtiva?.id]);
  // "Expirado" aparece sozinho quando o prazo passa (não há evento no banco quando o tempo vence)
  const [, setRelogio] = useState(0);
  useEffect(() => { const t = setInterval(() => setRelogio((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  async function gerar() {
    let lista = marcas;
    const pend = normalizarMarca(marcaTxt);
    if (!acessoTotal && pend && !lista.includes(pend)) {
      if (pend.length < 3 || pend.length > 30) { showToast("A marca digitada precisa ter de 3 a 30 letras.", "warn"); return; }
      if (lista.length >= 5) { showToast("No máximo 5 marcas por convite.", "warn"); return; }
      lista = [...lista, pend];
    }
    if (!nome.trim() || (!acessoTotal && lista.length === 0)) { showToast("Preencha o nome do promotor e pelo menos uma marca (ou marque acesso total).", "warn"); return; }
    const horas = DURACOES_CONVITE.find((d) => d.id === duracao)?.horas || 24;
    setGerando(true);
    const { data, error } = await supabase.from("convites_promotor").insert({
      nome: nome.trim(), marca: acessoTotal ? "TODAS AS MARCAS" : lista[0], marcas: acessoTotal ? [] : lista, acesso_total: acessoTotal, loja_id: lojaAtiva.id,
      expira_em: new Date(Date.now() + horas * 3600000).toISOString(),
    }).select(COLUNAS_CONVITE).single();
    setGerando(false);
    if (error) {
      console.error(error);
      const em = String(error.message || "");
      showToast(/acesso_total_exige_gerencia/.test(em) ? "Só gerência ou diretoria pode dar acesso total." : /marcas_demais/.test(em) ? "No máximo 5 marcas por convite." : /marca_invalida/.test(em) ? "Marca inválida: use de 3 a 30 letras ou números." : /sem_permissao/.test(em) ? "Você não tem permissão para gerar convites." : "Não foi possível gerar o convite.", "warn");
      return;
    }
    setRecente(data);
    setNome(""); setMarcas([]); setMarcaTxt(""); setAcessoTotal(false);
    setConvites((prev) => [data, ...(prev || [])]);
  }

  async function copiar(c) {
    try { await navigator.clipboard.writeText(linkDoConvite(c)); showToast("Link copiado."); }
    catch { showToast("Não deu pra copiar. Segure o link pra copiar manualmente.", "warn"); }
  }
  function mensagem(c) {
    return `Olá, ${c.nome}! Este é seu acesso ao app da Condor (${marcasConvite(c)}). Abra o link pra entrar — ${validadeConvite(c)}.${c.codigo ? ` Seu código do promotor: ${c.codigo} (envie no Telegram do bot para lançar validade).` : ""}\n${linkDoConvite(c)}`;
  }
  async function compartilhar(c) {
    if (navigator.share) {
      try { await navigator.share({ title: "Convite Condor", text: mensagem(c) }); return; } catch { return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(mensagem(c))}`, "_blank", "noopener");
  }
  async function cancelar(c) {
    if (!window.confirm(`Cancelar o convite de ${c.nome}? Quem entrou por ele perde o acesso na hora.`)) return;
    const { error } = await supabase.rpc("revogar_convite", { p_id: c.id });
    if (error) { console.error(error); showToast("Não foi possível cancelar.", "warn"); return; }
    setConvites((prev) => prev.map((x) => (x.id === c.id ? { ...x, revogado: true } : x)));
    if (recente?.id === c.id) setRecente(null);
    showToast("Convite cancelado.");
  }

  const statusDe = (c) =>
    c.revogado ? { label: "Cancelado", bg: RED_SOFT, color: RED_DARK } :
    c.pausado ? { label: "Pausado", bg: "#FCF0DD", color: "#C2760C" } :
    new Date(c.expira_em) <= new Date() ? { label: "Expirado", bg: T.chipBg, color: T.subtext } :
    { label: "Ativo", bg: "#E6F7ED", color: "#1F9D55" };
  const inputCls = "border rounded-xl px-3 py-2.5 text-sm outline-none w-full";
  const inputStyle = { background: T.inputBg, color: T.text, borderColor: T.inputBorder, boxSizing: "border-box" };

  const ativos = (convites || []).filter((c) => statusDe(c).label === "Ativo");
  const totalUsos = (convites || []).reduce((acc, c) => acc + (c.usos || 0), 0);
  return (
    <>
    <div className="hidden lg:block">
      <DashPageHeader T={T} title="Convites de promotor" subtitle={`Loja ${lojaAtiva?.numero_loja || "—"} · o link funciona como login, sem e-mail nem senha`} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <DashKpi T={T} label="Convites ativos" value={ativos.length} sub="acesso liberado agora" Icon={Ticket} accent="#1F9D55" />
        <DashKpi T={T} label="Total gerados" value={(convites || []).length} sub="últimos 100" Icon={Link2} accent={BLUE} />
        <DashKpi T={T} label="Aberturas" value={totalUsos} sub="somando todos os links" Icon={Copy} accent="#C98A0C" />
        <DashKpi T={T} label="Cancelados / expirados" value={(convites || []).length - ativos.length} sub="sem acesso" Icon={AlertTriangle} accent={RED_DARK} />
      </div>
      <div className="grid grid-cols-3 gap-4 items-start">
        <div className="flex flex-col gap-4">
          <DashCard T={T} title="Novo convite" subtitle="Nome, marca e duração">
            <div className="flex flex-col gap-2.5">
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do promotor" style={inputStyle} className={inputCls} />
              <MarcasPicker T={T} lojaId={lojaAtiva?.id} marcas={marcas} setMarcas={setMarcas} acessoTotal={acessoTotal} setAcessoTotal={setAcessoTotal} podeTotal={nivelUsuario <= 4} inputStyle={inputStyle} inputCls={inputCls} showToast={showToast} txt={marcaTxt} setTxt={setMarcaTxt} />
              <select value={duracao} onChange={(e) => setDuracao(e.target.value)} style={inputStyle} className={inputCls}>
                {DURACOES_CONVITE.map((d) => <option key={d.id} value={d.id}>Duração: {d.label}</option>)}
              </select>
              <button onClick={gerar} disabled={gerando} style={{ background: BLUE, color: "#fff" }} className="py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {gerando ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Gerar link de convite
              </button>
            </div>
          </DashCard>
          {recente && (
            <DashCard T={T} title={`Convite de ${recente.nome} pronto`} subtitle={`${marcasConvite(recente)} · ${validadeConvite(recente)}`}>
              <p style={{ background: T.chipBg, color: T.text }} className="text-[11px] font-mono break-all rounded-xl px-3 py-2 select-all mb-3">{linkDoConvite(recente)}</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => copiar(recente)} style={{ background: T.chipBg, color: T.text }} className="py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"><Copy size={13} /> Copiar link</button>
                <button onClick={() => compartilhar(recente)} style={{ background: "#1F9D55", color: "#fff" }} className="py-2 rounded-xl text-xs font-semibold">WhatsApp / enviar</button>
              </div>
            </DashCard>
          )}
        </div>
        <DashCard T={T} title="Convites da loja" subtitle="Quem tem acesso e quando vence" className="col-span-2">
          {convites === null ? <div className="text-center py-8"><Loader2 size={22} className="animate-spin mx-auto" color={T.subtext} /></div> : (
            <DashTable T={T} rows={convites} empty="Nenhum convite gerado ainda." cols={[
              { key: "nome", label: "Promotor", render: (c) => <div><p className="font-semibold">{c.nome}</p><p style={{ color: T.subtext }} className="text-[11px]">{marcasConvite(c)}</p></div> },
              { key: "expira_em", label: "Validade", render: (c) => <span className="text-xs">{formatarDataHoraExtenso(c.expira_em)}</span> },
              { key: "usos", label: "Uso", render: (c) => <span style={{ color: T.subtext }} className="text-xs">{c.usos ? `${c.usos}x · ${tempoDesde(c.ultimo_uso)}` : "não aberto"}</span> },
              { key: "st", label: "Status", render: (c) => { const st = statusDe(c); return <DashBadge bg={st.bg} color={st.color}>{st.label}</DashBadge>; } },
              { key: "acoes", label: "", align: "right", render: (c) => statusDe(c).label === "Ativo" ? (
                <div className="flex gap-1.5 justify-end">
                  <button onClick={() => copiar(c)} style={{ background: T.chipBg, color: T.text }} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold">Copiar</button>
                  <button onClick={() => compartilhar(c)} style={{ background: T.chipBg, color: T.text }} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold">Enviar</button>
                  <button onClick={() => cancelar(c)} style={{ background: RED_SOFT, color: RED_DARK }} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold">Cancelar</button>
                </div>) : null },
            ]} />
          )}
        </DashCard>
      </div>
    </div>
    <div className="px-4 pt-4 flex flex-col gap-3 lg:hidden">
      <div style={{ background: T.card }} className="rounded-2xl p-4 shadow-sm flex flex-col gap-2.5">
        <p className="text-sm font-bold flex items-center gap-2"><Ticket size={16} color={BLUE} /> Novo convite</p>
        <p style={{ color: T.subtext }} className="text-[11px] -mt-1">O promotor abre o link e já entra, sem e-mail nem senha. Loja {lojaAtiva?.numero_loja || "—"}.</p>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do promotor" style={inputStyle} className={inputCls} />
        <MarcasPicker T={T} lojaId={lojaAtiva?.id} marcas={marcas} setMarcas={setMarcas} acessoTotal={acessoTotal} setAcessoTotal={setAcessoTotal} podeTotal={nivelUsuario <= 4} inputStyle={inputStyle} inputCls={inputCls} showToast={showToast} txt={marcaTxt} setTxt={setMarcaTxt} />
        <select value={duracao} onChange={(e) => setDuracao(e.target.value)} style={inputStyle} className={inputCls}>
          {DURACOES_CONVITE.map((d) => <option key={d.id} value={d.id}>Duração: {d.label}</option>)}
        </select>
        <button onClick={gerar} disabled={gerando} style={{ background: BLUE, color: "#fff" }}
          className="py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 mt-1">
          {gerando ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Gerar link de convite
        </button>
      </div>

      {recente && (
        <div style={{ background: BLUE_SOFT, borderColor: BLUE }} className="rounded-2xl p-4 border flex flex-col gap-2">
          <p className="text-sm font-bold">Convite de {recente.nome} pronto</p>
          <p style={{ color: T.subtext }} className="text-[11px]">{marcasConvite(recente)} · {validadeConvite(recente)}</p>
          <p style={{ background: T.card, color: T.text }} className="text-[11px] font-mono break-all rounded-xl px-3 py-2 select-all">{linkDoConvite(recente)}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => copiar(recente)} style={{ background: T.card, color: T.text }} className="py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"><Copy size={14} /> Copiar link</button>
            <button onClick={() => compartilhar(recente)} style={{ background: "#1F9D55", color: "#fff" }} className="py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"><Share2 size={14} /> Enviar</button>
          </div>
        </div>
      )}

      <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wide mt-1 px-1">Convites da loja</p>
      {convites === null && <div className="text-center py-8"><Loader2 size={22} className="animate-spin mx-auto" color={T.subtext} /></div>}
      {convites?.length === 0 && <p style={{ color: T.subtext }} className="text-xs text-center py-6">Nenhum convite gerado ainda.</p>}
      <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start">
        {(convites || []).map((c) => {
          const st = statusDe(c);
          const ativo = st.label === "Ativo";
          return (
            <div key={c.id} style={{ background: T.card }} className="rounded-2xl p-3.5 shadow-sm flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{c.nome}</p>
                  <p style={{ color: T.subtext }} className="text-[11px]">{marcasConvite(c)} · {ativo ? "vale até" : "venceu em"} {formatarDataHoraExtenso(c.expira_em)}</p>
                  <p style={{ color: T.subtext }} className="text-[10px]">{c.usos ? `Aberto ${c.usos}x · último ${formatarDataHoraExtenso(c.ultimo_uso)}` : "Ainda não aberto"}</p>
                </div>
                <span style={{ background: st.bg, color: st.color }} className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0">{st.label}</span>
              </div>
              {ativo && (
                <div className="flex gap-2">
                  <button onClick={() => copiar(c)} style={{ background: T.chipBg, color: T.text }} className="flex-1 py-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1"><Copy size={12} /> Copiar</button>
                  <button onClick={() => compartilhar(c)} style={{ background: T.chipBg, color: T.text }} className="flex-1 py-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1"><Share2 size={12} /> Enviar</button>
                  <button onClick={() => cancelar(c)} style={{ background: RED_SOFT, color: RED_DARK }} className="flex-1 py-2 rounded-xl text-[11px] font-semibold">Cancelar</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}

export { AcoesConviteSheet, AcoesFuncionarioSheet, BotaoAcao, COLUNAS_CONVITE, ConvitesPromotorView, DURACOES_CONVITE, GestaoAplicativoView, GestaoCampo, GestaoFuncionarios, GestaoLojas, GestaoSheet, GestaoStat, LojaFormSheet, MarcasPicker, PedidosExclusaoLista, PromotoresLista, conviteSemPrazo, erroAcao, linkDoConvite, marcasConvite, normalizarMarca, slugMarca, statusConvite, validadeConvite };

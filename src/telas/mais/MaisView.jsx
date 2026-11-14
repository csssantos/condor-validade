// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState } from "react";
import { useReducedMotion, AnimatePresence, motion } from "framer-motion";
import { KeyRound, Palette, Bell, LayoutGrid, Package, Megaphone, Barcode, ShieldCheck, Info, ArrowLeft, Inbox } from "lucide-react";
import { PaginaPrivacidade, PaginaPedidosLGPD } from "../../Legal";
import { DashPageHeader } from "../../componentes/dash";
import { useTelaLarga } from "../../lib/tela";
import { PaginaAprovacoes } from "./Aprovacoes";
import { PaginaConta } from "./Conta";
import { APP_VERSAO, COR_MAIS, COR_TEMA, MaisBolha, MaisHero, MaisTile } from "./MaisUI";
import { PaginaAparencia, PaginaAtalhos, PaginaAvisos, PaginaBalanca, PaginaNotificacoes, PaginaSobre } from "./Paginas";

// ---------------- Tela principal da aba ----------------
function MaisView(props) {
  const { T, dark, tema, setTema, perfil, usuario, ehDev, ehEncarregado, ehCorporativo, historico, secao } = props;
  const telaLarga = useTelaLarga();
  const reduzir = useReducedMotion();
  const [pagina, setPaginaLocal] = useState(props.paginaInicial ?? null);
  const setPagina = (v) => { setPaginaLocal(v); props.onPaginaMais?.(v); };
  const [onda, setOnda] = useState(null);

  const PAGINAS = [
    { id: "conta", titulo: "Conta", desc: "Senha, e-mail e sessão", Icon: KeyRound, cor: COR_MAIS.conta },
    { id: "aparencia", titulo: "Aparência", desc: "Claro, escuro ou automático", Icon: Palette, cor: COR_MAIS.aparencia },
    { id: "notificacoes", titulo: "Notificações e som", desc: "Alertas e beep ao bipar", Icon: Bell, cor: COR_MAIS.notificacoes },
    ...(ehEncarregado ? [{ id: "atalhos", titulo: "Atalhos", desc: "Análises, rondas e gestão", Icon: LayoutGrid, cor: COR_MAIS.atalhos, soMobile: true }] : []),
    ...(ehEncarregado ? [{ id: "aprovacoes", titulo: "Aprovar produtos novos", desc: props.aprovPendentes > 0 ? `${props.aprovPendentes} aguardando você` : "Produtos lançados pelo Telegram aguardando você", Icon: Package, cor: COR_MAIS.aprovacoes }] : []),
    ...(ehDev ? [
      { id: "avisos", titulo: "Avisos", desc: "Enviar para a rede, uma loja, setor ou pessoas", Icon: Megaphone, cor: COR_MAIS.avisos },
      { id: "balanca", titulo: "Código de balança", desc: "Prefixos e o que o código embute", Icon: Barcode, cor: COR_MAIS.balanca },
      { id: "lgpd", titulo: "Pedidos LGPD", desc: "Responder pedidos de direitos (prazo de 15 dias)", Icon: Inbox, cor: COR_MAIS.lgpd },
    ] : []),
    { id: "privacidade", titulo: "Privacidade e termos", desc: "Termos, LGPD, seus dados e direitos", Icon: ShieldCheck, cor: COR_MAIS.privacidade },
    { id: "sobre", titulo: "Sobre o app", desc: "Versão, novidades e créditos", Icon: Info, cor: COR_MAIS.sobre },
  ];
  const ativa = telaLarga ? (secao || "conta") : pagina;
  const meta = PAGINAS.find((p) => p.id === ativa);

  function trocarTema(novo, ev) {
    if (novo === tema) return;
    const sistemaEscuro = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const cor = novo === "claro" ? COR_TEMA.claro : novo === "escuro" ? COR_TEMA.escuro : (sistemaEscuro ? COR_TEMA.escuro : COR_TEMA.claro);
    if (reduzir || !ev?.currentTarget) { setTema(novo); return; }
    const r = ev.currentTarget.getBoundingClientRect();
    setOnda({ x: r.left + r.width / 2, y: r.top + r.height / 2, cor, k: Date.now() });
    setTimeout(() => setTema(novo), 420);
    setTimeout(() => setOnda(null), 1000);
  }

  const acoes = {
    modulo: (f) => props.onAbrirModulo?.(f), torre: props.onAbrirTorre, relatorios: props.onAbrirRelatorios, prioridade: props.onAbrirPrioridade,
    historico: props.onAbrirHistorico, auditoria: props.onAbrirAuditoria, convites: props.onAbrirConvites, rede: props.onAbrirRede, gestao: props.onAbrirGestao,
  };
  const conteudo = (id) => {
    switch (id) {
      case "conta": return <PaginaConta T={T} dark={dark} perfil={perfil} usuario={usuario} showToast={props.showToast} onSair={props.onSair} />;
      case "aparencia": return <PaginaAparencia T={T} dark={dark} tema={tema} onTema={trocarTema} />;
      case "notificacoes": return <PaginaNotificacoes T={T} dark={dark} som={props.som} setSom={props.setSom} notifPermission={props.notifPermission} onToggleNotif={props.onToggleNotif} ehEncarregado={ehEncarregado} perfil={perfil} showToast={props.showToast} />;
      case "atalhos": return !ehEncarregado ? null : <PaginaAtalhos T={T} dark={dark} historico={historico} ehEncarregado={ehEncarregado} ehCorporativo={ehCorporativo} ehDev={ehDev} acoes={acoes} />;
      case "aprovacoes": return ehEncarregado ? <PaginaAprovacoes T={T} dark={dark} perfil={perfil} showToast={props.showToast} subsetoresExtra={props.subsetoresExtra || []} /> : null;
      case "avisos": return ehDev ? <PaginaAvisos T={T} dark={dark} perfil={perfil} showToast={props.showToast} /> : null;
      case "balanca": return ehDev ? <PaginaBalanca T={T} dark={dark} perfil={perfil} configBalanca={props.configBalanca} onSalvou={props.onBalancaSalva} showToast={props.showToast} /> : null;
      case "lgpd": return ehDev ? <PaginaPedidosLGPD T={T} showToast={props.showToast} /> : null;
      case "privacidade": return <PaginaPrivacidade T={T} dark={dark} perfil={perfil} showToast={props.showToast} />;
      case "sobre": return <PaginaSobre T={T} dark={dark} perfil={perfil} />;
      default: return null;
    }
  };

  const ondaEl = (
    <AnimatePresence>
      {onda && (
        <motion.div key={onda.k} aria-hidden="true" className="fixed inset-0 z-[70] pointer-events-none" style={{ background: onda.cor }}
          initial={{ clipPath: `circle(0px at ${onda.x}px ${onda.y}px)`, opacity: 1 }} animate={{ clipPath: `circle(150vmax at ${onda.x}px ${onda.y}px)` }}
          exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: "easeIn" }} />
      )}
    </AnimatePresence>
  );

  if (telaLarga) {
    return (
      <div className="w-full">
        {meta && <DashPageHeader T={T} title={meta.titulo} subtitle={meta.desc} />}
        {conteudo(ativa)}
        {ondaEl}
      </div>
    );
  }
  return (
    <div className="overflow-x-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {ativa === null ? (
          <motion.div key="hub" initial={{ opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.2 }} className="px-4 pt-4 pb-8">
            <MaisHero T={T} perfil={perfil} usuario={usuario} tema={tema} onTema={trocarTema} />
            <div className="grid grid-cols-2 gap-3 mt-4">
              {PAGINAS.map((p, i) => <MaisTile key={p.id} T={T} dark={dark} i={i} icon={p.Icon} cor={p.cor} titulo={p.titulo} desc={p.desc} onClick={() => setPagina(p.id)} />)}
            </div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ color: T.subtext }} className="text-center text-[11.5px] mt-6">Condor · Alerta de Validade · v{APP_VERSAO}</motion.p>
          </motion.div>
        ) : (
          <motion.div key={ativa} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.22 }} className="px-4 pt-3 pb-10">
            <motion.button onClick={() => setPagina(null)} whileTap={{ scale: 0.95 }} style={{ background: T.card, color: T.text }} className="h-10 pl-2.5 pr-4 rounded-full shadow-md shadow-black/5 flex items-center gap-1 text-[13px] font-bold">
              <ArrowLeft size={16} />Mais
            </motion.button>
            <div className="flex items-center gap-3 mt-4 mb-5">
              <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}><MaisBolha cor={meta.cor} dark={dark} tamanho={52}><meta.Icon size={24} /></MaisBolha></motion.div>
              <div className="min-w-0">
                <h1 style={{ color: T.text }} className="text-[22px] font-extrabold leading-tight tracking-tight">{meta.titulo}</h1>
                <p style={{ color: T.subtext }} className="text-[12.5px] mt-0.5">{meta.desc}</p>
              </div>
            </div>
            {conteudo(ativa)}
          </motion.div>
        )}
      </AnimatePresence>
      {ondaEl}
    </div>
  );
}

export { MaisView };

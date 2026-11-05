// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useReducedMotion, motion } from "framer-motion";
import { HomeIcon, Squares2X2Icon, ClockIcon, Cog6ToothIcon, CameraIcon } from "@heroicons/react/24/outline";
import { HomeIcon as HomeIconSolid, Squares2X2Icon as Squares2X2IconSolid, ClockIcon as ClockIconSolid, Cog6ToothIcon as Cog6ToothIconSolid } from "@heroicons/react/24/solid";
import { LayoutDashboard, Package, LayoutGrid, ShieldCheck, Flame, Radar, FileText, History, ListChecks, Sparkles, Ticket, Building2, Wrench, KeyRound, Palette, Bell, Megaphone, Barcode, Info, LogOut, Inbox } from "lucide-react";
import { BLUE, LOGO_SRC, RED, RED_DARK, RED_SOFT } from "../lib/constantes";

function BottomNav({ T, tab, setTab, alertCount, onScan }) {
  const reduzir = useReducedMotion();
  const escuro = T.bg === "#0B1220";
  const ESQUERDA = [
    { id: "home", label: "Início", Icon: HomeIcon, IconSolid: HomeIconSolid, badge: alertCount },
    { id: "setores", label: "Setores", Icon: Squares2X2Icon, IconSolid: Squares2X2IconSolid },
  ];
  const DIREITA = [
    { id: "rondas", label: "Rondas", Icon: ClockIcon, IconSolid: ClockIconSolid },
    { id: "ajustes", label: "Mais", Icon: Cog6ToothIcon, IconSolid: Cog6ToothIconSolid },
  ];
  // função comum (não componente): o botão não é recriado a cada render, então a bolha ativa desliza de verdade
  const navBtn = ({ id, label, Icon, IconSolid, badge }) => {
    const ativo = tab === id;
    const Ico = ativo ? IconSolid : Icon;
    return (
      <button key={id} onClick={() => setTab(id)} className="flex-1 flex flex-col items-center justify-center gap-1 h-full relative" aria-label={label} aria-current={ativo ? "page" : undefined}>
        {badge > 0 && (
          <span style={{ background: RED }} className="absolute top-1.5 right-[26%] text-[9px] text-white font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center z-10">{badge}</span>
        )}
        {ativo && (
          <motion.div layoutId="navPill" style={{ background: escuro ? "rgba(255,255,255,.1)" : RED_SOFT }}
            className="absolute inset-x-1 top-1.5 bottom-1.5 rounded-[22px]" transition={{ type: "spring", stiffness: 500, damping: 35 }} />
        )}
        <Ico className="relative w-[20px] h-[20px]" style={{ color: ativo ? (escuro ? "#fff" : RED_DARK) : T.subtext }} />
        <span className="relative text-[10px] font-semibold whitespace-nowrap leading-none" style={{ color: ativo ? (escuro ? "#fff" : RED_DARK) : T.subtext }}>{label}</span>
      </button>
    );
  };
  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-20 pointer-events-none px-3 pb-[calc(env(safe-area-inset-bottom)*0.12+4px)]" style={{ transform: "translateZ(0)", willChange: "transform" }}>
      <motion.div initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="pointer-events-auto max-w-md mx-auto relative flex items-center rounded-[32px] px-1.5 h-[68px]"
        style={{
          background: escuro ? "rgba(21,31,48,.88)" : "rgba(255,255,255,.9)", backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)",
          border: `1px solid ${escuro ? "rgba(255,255,255,.1)" : "rgba(15,40,80,.08)"}`, boxShadow: "0 18px 40px -12px rgba(5,20,50,.38), 0 2px 6px rgba(5,20,50,.08)",
        }}>
        {ESQUERDA.map(navBtn)}
        <div className="flex-1 flex justify-center">
          <div className="relative -mt-9">
            {!reduzir && <motion.span aria-hidden className="absolute inset-0 rounded-full" style={{ border: `2px solid ${RED}` }} animate={{ scale: [1, 1.55], opacity: [0.55, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }} />}
            <motion.button whileTap={{ scale: 0.9 }} onClick={onScan} aria-label="Bipar produto"
              style={{ background: `linear-gradient(160deg, ${RED} 0%, ${RED_DARK} 100%)`, boxShadow: "0 12px 24px -6px rgba(168,20,25,.6)", border: `4px solid ${T.bg}` }}
              className="relative h-[62px] w-[62px] rounded-full flex items-center justify-center">
              <CameraIcon className="w-6 h-6 text-white" />
            </motion.button>
          </div>
        </div>
        {DIREITA.map(navBtn)}
      </motion.div>
    </nav>
  );
}

// ============ Menu lateral (computador) — categorias, tudo do "Mais" mora aqui ============
function SideNav({ T, tab, flow, alertCount, nome, cargo, lojaNumero, flags, onTab, onFlow, onScan, onSair }) {
  const { podeVerValores, ehEncarregado, ehCorporativo, ehDev } = flags;
  const grupos = [
    { titulo: "Visão geral", itens: [
      { tab: "home", label: "Dashboard", Icon: LayoutDashboard, badge: alertCount },
      { tab: "produtos", label: "Produtos monitorados", Icon: Package },
      { tab: "setores", label: "Setores", Icon: LayoutGrid },
      { tab: "rondas", label: "Rondas", Icon: ShieldCheck },
    ] },
    ...(ehEncarregado ? [{ titulo: "Análise", itens: [
      { flow: "prioridade", label: "Prioridade de perda", Icon: Flame },
      ...(podeVerValores ? [
        { flow: "torre", label: "Torre de controle", Icon: Radar },
        { flow: "relatorios", label: "Relatórios", Icon: FileText },
      ] : []),
      { flow: "historico", label: "Histórico de baixas", Icon: History },
      { flow: "auditoria", label: "Auditoria", Icon: ListChecks },
    ] }] : []),
    { titulo: "Inteligência", itens: [
      ...(ehEncarregado ? [
        { flow: "assistente", label: "Assistente IA", Icon: Sparkles },
        { flow: "previsao", label: "Previsão operacional", Icon: Radar },
        { flow: "prevencao", label: "Prevenção de perdas", Icon: Flame },
      ] : []),
    ] },
    { titulo: "Gestão", itens: [
      ...(ehEncarregado ? [{ flow: "convites", label: "Convites de promotor", Icon: Ticket }] : []),
      ...(ehCorporativo ? [{ flow: "rede", label: "Painel da rede", Icon: Building2 }] : []),
      ...(ehDev ? [{ flow: "gestao", label: "Gestão do aplicativo", Icon: Wrench }] : []),
    ] },
    { titulo: "Configurações", itens: [
      { tab: "cfg-conta", label: "Conta", Icon: KeyRound },
      { tab: "cfg-aparencia", label: "Aparência", Icon: Palette },
      { tab: "cfg-notificacoes", label: "Notificações e som", Icon: Bell },
      ...(ehEncarregado ? [{ tab: "cfg-aprovacoes", label: "Aprovar produtos novos", Icon: Package }] : []),
      ...(ehDev ? [
        { tab: "cfg-avisos", label: "Avisos", Icon: Megaphone },
        { tab: "cfg-balanca", label: "Código de balança", Icon: Barcode },
        { tab: "cfg-lgpd", label: "Pedidos LGPD", Icon: Inbox },
      ] : []),
      { tab: "cfg-privacidade", label: "Privacidade e termos", Icon: ShieldCheck },
      { tab: "cfg-sobre", label: "Sobre o app", Icon: Info },
    ] },
  ].filter((g) => g.itens.length > 0);

  const iniciais = (nome || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <aside style={{ background: T.card, borderColor: T.border }} className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-30 flex-col border-r">
      <div className="px-6 pt-5 pb-4 flex items-center justify-between">
        <img src={LOGO_SRC} alt="Condor" className="h-8 w-auto" />
        {lojaNumero && <span style={{ background: T.chipBg, color: T.subtext }} className="text-[10px] font-bold px-2 py-1 rounded-md">LOJA {lojaNumero}</span>}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-5">
        {grupos.map((g) => (
          <div key={g.titulo}>
            <p style={{ color: T.subtext }} className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]">{g.titulo}:</p>
            <div className="flex flex-col gap-0.5">
              {g.itens.map((it) => {
                const ativo = it.flow ? flow === it.flow : flow === null && tab === it.tab;
                return (
                  <button key={it.flow || it.tab} onClick={() => (it.flow ? onFlow(it.flow) : onTab(it.tab))}
                    style={ativo ? { background: RED_SOFT, color: RED_DARK } : { color: T.text }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] text-left transition ${ativo ? "font-bold" : "font-medium hover:opacity-70"}`}>
                    <it.Icon size={17} className="shrink-0" style={{ color: ativo ? RED_DARK : T.subtext }} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge > 0 && <span style={{ background: RED }} className="text-[10px] text-white font-bold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center">{it.badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {onScan && (
          <button onClick={onScan} style={{ background: `linear-gradient(160deg, ${RED} 0%, ${RED_DARK} 100%)` }}
            className="flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-2xl shadow-lg shadow-red-900/20 hover:opacity-90 transition">
            <CameraIcon className="w-5 h-5" /> Bipar produto
          </button>
        )}
      </nav>
      <div style={{ borderColor: T.border }} className="border-t px-4 py-3 flex items-center gap-3">
        <div style={{ background: BLUE, color: "#fff" }} className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{iniciais}</div>
        <div className="min-w-0 flex-1">
          <p style={{ color: T.text }} className="text-xs font-bold truncate">{nome || "Usuário"}</p>
          <p style={{ color: T.subtext }} className="text-[10px] truncate">{cargo || "—"}</p>
        </div>
        <button onClick={onSair} title="Sair da conta" style={{ background: T.chipBg, color: T.subtext }} className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:opacity-70">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}

export { BottomNav, SideNav };

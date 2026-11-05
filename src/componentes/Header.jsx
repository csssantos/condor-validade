// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { motion } from "framer-motion";
import { BellIcon, BellSlashIcon, SunIcon, MoonIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Search } from "lucide-react";
import { BotaoAtualizacao } from "./Atualizacao";
import { BLUE, LOGO_SRC } from "../lib/constantes";
import { useTelaLarga } from "../lib/tela";

// ============ Header ============
function Header({ T, flow, tab, onBack, dark, setDark, notifPermission, onToggleNotif, nomeUsuario, busca, onBusca, atualizacaoPendente, onAtualizacao }) {
  const telaLarga = useTelaLarga();
  const titles = {
    produtos: "Produtos monitorados", "cfg-conta": "Conta", "cfg-aparencia": "Aparência", "cfg-notificacoes": "Notificações e som",
    "cfg-aprovacoes": "Aprovar produtos novos", "cfg-avisos": "Avisos", "cfg-balanca": "Código de balança", "cfg-privacidade": "Privacidade e termos", "cfg-sobre": "Sobre o app",
    home: "Alerta de Validade", scan: "Bipar produto", confirm: "Dados do produto",
    expiry: "Data de validade", historico: "Histórico de baixas", ajustes: "Mais", auditoria: "Auditoria",
    prioridade: "Prioridade de Perda",
    setores: "Setores", torre: "Torre de Controle", rondas: "Rondas", relatorios: "Relatórios", rede: "Painel da Rede", gestao: "Gestão do Aplicativo", convites: "Convites de promotor",
    previsao: "Previsão Operacional", prevencao: "Prevenção de Perdas", assistente: "Assistente IA"
  };
  const title = flow ? titles[flow] : (telaLarga && tab === "home" ? "Dashboard" : titles[tab]);
  if (!telaLarga && !flow && tab === "home") return null; // celular: a tela inicial tem o próprio palco (logo, tema e notificações)
  if (telaLarga) {
    const iniciais = (nomeUsuario || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    return (
      <header style={{ background: T.card, borderColor: T.border }} className="sticky top-0 z-20 border-b">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center gap-5">
          <h1 style={{ color: T.text }} className="text-lg font-bold shrink-0">{title}</h1>
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" color={T.subtext} />
            <input value={busca || ""} onChange={(e) => onBusca && onBusca(e.target.value)} placeholder="Buscar produto ou código..."
              style={{ background: T.chipBg, color: T.text }} className="w-full rounded-xl pl-10 pr-3 py-2 text-sm outline-none focus:ring-2" />
          </div>
          <div className="flex-1" />
          {atualizacaoPendente && <BotaoAtualizacao onClick={onAtualizacao} claro={false} />}
          <button onClick={onToggleNotif} title="Notificações" style={{ background: T.chipBg, color: T.subtext }} className="h-9 w-9 rounded-xl flex items-center justify-center hover:opacity-70 transition">
            {notifPermission === "granted" ? <BellIcon className="w-4 h-4" /> : <BellSlashIcon className="w-4 h-4" />}
          </button>
          <button onClick={() => setDark((v) => !v)} title="Alternar tema" style={{ background: T.chipBg, color: T.subtext }} className="h-9 w-9 rounded-xl flex items-center justify-center hover:opacity-70 transition">
            {dark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
          </button>
          <div style={{ background: BLUE, color: "#fff" }} className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold" title={nomeUsuario || ""}>{iniciais}</div>
        </div>
      </header>
    );
  }
  return (
    <motion.header
      initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }}
      style={{ background: "radial-gradient(130% 160% at 50% -30%, #1B6FD1 0%, #0B4F9E 45%, #061C3A 100%)" }}
      className="sticky top-0 z-20 shadow-lg shadow-black/15 rounded-b-[30px] lg:rounded-b-none pt-[env(safe-area-inset-top)] overflow-hidden">
      <div aria-hidden className="absolute inset-0 opacity-[.12] pointer-events-none" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
      <div className="relative max-w-md lg:max-w-[1600px] mx-auto px-4 lg:px-6 pt-4 pb-5 lg:pt-3 lg:pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {flow && (
              <button onClick={onBack} className="text-white/90 hover:text-white active:scale-95 transition" aria-label="Voltar">
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
            )}
            <div style={{ background: "rgba(255,255,255,0.97)" }} className="rounded-xl px-2.5 py-1.5 flex items-center shadow-lg shadow-black/5 lg:hidden">
              <img src={LOGO_SRC} alt="Condor Supermercados" className="h-5 w-auto" />
            </div>
            <h1 className="text-white font-bold text-[15px] lg:text-lg leading-none">{title}</h1>
          </div>
          {!flow && (
            <div className="flex items-center gap-1.5">
              {atualizacaoPendente && <BotaoAtualizacao onClick={onAtualizacao} claro />}
              <button onClick={onToggleNotif} className="h-9 w-9 rounded-2xl flex items-center justify-center bg-white/15 active:scale-95 transition" aria-label="Notificações">
                {notifPermission === "granted" ? <BellIcon className="w-4 h-4 text-white" /> : <BellSlashIcon className="w-4 h-4 text-white" />}
              </button>
              <button onClick={() => setDark((d) => !d)} className="h-9 w-9 rounded-2xl flex items-center justify-center bg-white/15 active:scale-95 transition" aria-label="Alternar tema">
                {dark ? <SunIcon className="w-4 h-4 text-white" /> : <MoonIcon className="w-4 h-4 text-white" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.header>
  );
}

export { Header };

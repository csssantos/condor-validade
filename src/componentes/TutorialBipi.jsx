// Tutorial do Bipi: até 10 etapas no primeiro acesso, conforme o cargo e o aparelho (celular x computador).
// Abre sozinho uma vez por pessoa neste aparelho; dá para rever em Mais → Sobre o app (evento "condor-abrir-tutorial").
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Camera, CalendarDays, Hash, AlertTriangle, Home, LayoutGrid, ListChecks, Send, Tag, Sparkles, Package, Check, ChevronLeft, ChevronRight, X, Monitor, Store } from "lucide-react";
import { FUNDO_MARCA } from "../TelasEntrada";

const CHAVE = "avdc_tutorial_visto"; // lista dos ids de quem já viu neste aparelho (sem outros dados)
const lerVistos = () => { try { const v = JSON.parse(localStorage.getItem(CHAVE) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
export const tutorialJaVisto = (uid) => !!uid && lerVistos().includes(uid);
export const marcarTutorialVisto = (uid) => { if (!uid) return; try { localStorage.setItem(CHAVE, JSON.stringify([uid, ...lerVistos().filter((x) => x !== uid)].slice(0, 20))); } catch { /* sem armazenamento */ } };
export const abrirTutorial = () => { try { window.dispatchEvent(new CustomEvent("condor-abrir-tutorial")); } catch { /* sem janela */ } };

// cada etapa: o que o Bipi fala, um título curto e os "cartões" de apoio (ícone + texto)
export function etapasDoTutorial({ nivel, promotor, pc }) {
  const encarregado = !promotor && nivel != null && nivel <= 5;
  const mais = pc ? "Configurações" : "Mais"; // no computador não existe a aba Mais: é o menu lateral
  const e = [];
  e.push({ id: "oi", titulo: "Oi! Eu sou o Bipi", fala: "Vou te mostrar como o app funciona. É rapidinho.", Icone: Sparkles, cor: "#2ECC71",
    itens: [["Controle de validade da loja", Package], ["Avisos antes de vencer", AlertTriangle], ["Menos perda, mais controle", Check]] });
  if (pc) {
    e.push({ id: "pc", titulo: "No computador você acompanha", fala: "Aqui é para ver e gerenciar. Bipar e lançar validade é pelo celular.", Icone: Monitor, cor: "#7DB4F0",
      itens: [["Painel com o que vence primeiro", Home], ["Relatórios e gestão", ListChecks], ["Lançamento: no celular", Camera]] });
  } else {
    e.push({ id: "bipar", titulo: "Bipe o produto", fala: "Toque no botão vermelho da câmera e aponte para o código de barras.", Icone: Camera, cor: "#E31E24",
      itens: [["Botão vermelho no meio da barra de baixo", Camera], ["Lê o código de barras de qualquer produto", Hash], ["Produto da balança também", Package]] });
    e.push({ id: "lancar", titulo: "Validade, lote e quantidade", fala: "Digite a data da embalagem, o lote impresso perto dela e quantas unidades tem.", Icone: CalendarDays, cor: "#1F9D55",
      itens: [["Data no formato dd/mm/aaaa", CalendarDays], ["Lote igual ao já lançado? Eu só somo", Tag], encarregado ? ["Vence em até 2 dias? Não lança: peça o preço direto", AlertTriangle] : ["Sem lote impresso? Marque a opção", Hash]] });
    if (!encarregado) e.push({ id: "perto", titulo: "Vence em até 2 dias?", fala: "Aí não lança: leve ao encarregado ou gerente para pedir o preço direto.", Icone: AlertTriangle, cor: "#F59E0B",
      itens: [["Hoje, amanhã ou depois: não lança", AlertTriangle], ["Leve o produto ao encarregado", Store], ["Ele pede o preço direto", Tag]] });
  }
  e.push({ id: "inicio", titulo: "A tela inicial", fala: "Mostra o valor em risco e o que vence primeiro. Vermelho é vencido, laranja é alerta.", Icone: Home, cor: "#0B4F9E",
    itens: [["Valor em risco da loja", AlertTriangle], ["Vencidos, em alerta e monitorados", ListChecks], ["Busca por nome ou código", Hash]] });
  e.push({ id: "setores", titulo: "Setores", fala: promotor ? "Você vê só os produtos das suas marcas, separados por setor." : "Cada setor tem suas subcategorias e a lista de produtos de cada uma.", Icone: LayoutGrid, cor: "#6D4FC2",
    itens: [["Setor → subcategoria → produtos", LayoutGrid], ["Toque no produto para ver os lotes", Package], [promotor ? "Só as marcas do seu convite" : "Filtre por vencidos e em alerta", Tag]] });
  if (!promotor) {
    e.push({ id: "rondas", titulo: "Rondas", fala: encarregado ? "Você cria a ronda do setor, a equipe confere produto por produto e o painel atualiza na hora." : "Quando o encarregado criar uma ronda, ela aparece em Rondas para você conferir.", Icone: ListChecks, cor: "#0E7C86",
      itens: [[encarregado ? "Crie por setor e subcategoria" : "Confira validade e lote de cada item", ListChecks], ["Tudo em tempo real", Sparkles], ["Funciona sem internet e envia depois", Check]] });
  }
  e.push({ id: "telegram", titulo: "Pelo Telegram, comigo", fala: "Você também pode lançar conversando comigo no Telegram. Eu pergunto tudo e confirmo antes.", Icone: Send, cor: "#2AA3E0",
    itens: [[promotor ? "Use o código do seu convite" : `Vincule em ${mais} → Conta`, Send], ["Mande o código de barras ou o nome", Hash], ["Nada é lançado sem você confirmar", Check]] });
  if (!promotor) {
    e.push({ id: "pedido", titulo: "Pedido de campanha", fala: encarregado ? "Perto de vencer? Abra o lote e registre o pedido de promoção ou preço direto, com o valor sugerido." : "Perto de vencer? Nos lotes que você lançou, registre o pedido de promoção ou preço direto. Nos outros, avise o encarregado.", Icone: Tag, cor: "#C2570C",
      itens: [["Número da campanha (opcional)", Hash], ["Valor sugerido: a central libera", Tag], ["Com pedido, o lote fica travado", Check]] });
  }
  if (encarregado) {
    e.push({ id: "aprovar", titulo: "Aprovar produtos novos", fala: "Produto que não existe no app e foi lançado pelo Telegram espera a sua aprovação.", Icone: Package, cor: "#1F7A4D",
      itens: [[`${mais} → Aprovar produtos novos`, Package], ["Confira nome, setor, foto e preço", Check], ["Recusa precisa de motivo", AlertTriangle]] });
  }
  e.push({ id: "fim", titulo: "Pronto!", fala: `Se quiser rever, está em ${mais} → Sobre o app. Bom trabalho!`, Icone: Check, cor: "#2ECC71",
    itens: [[`Rever: ${mais} → Sobre o app`, Sparkles]] });
  return e.slice(0, 10);
}

// Bipi (imagem oficial) flutuando; a "fala" aparece letra por letra
function Bipi({ falando, reduzir }) {
  return (
    <motion.img src="/bipi-acenando.png" alt="" aria-hidden="true" draggable={false} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
      className="w-[118px] h-[118px] lg:w-[150px] lg:h-[150px] select-none shrink-0"
      animate={reduzir ? {} : { y: [0, -7, 0], rotate: falando ? [-2, 2, -2] : [0, 0, 0] }}
      transition={reduzir ? {} : { duration: falando ? 0.5 : 2.6, repeat: Infinity, ease: "easeInOut" }} />
  );
}

function useDigitando(texto, ativo) {
  const [n, setN] = useState(ativo ? 0 : texto.length);
  useEffect(() => {
    if (!ativo) { setN(texto.length); return undefined; }
    setN(0);
    const t = setInterval(() => setN((v) => { if (v >= texto.length) { clearInterval(t); return v; } return v + 1; }), 22);
    return () => clearInterval(t);
  }, [texto, ativo]);
  return n;
}

export function TutorialBipi({ etapas: etapasIniciais, onFechar }) {
  const reduzir = useReducedMotion();
  const [etapas] = useState(etapasIniciais); // congela ao abrir: girar/redimensionar a tela não muda a lista no meio
  const [i, setIdx] = useState(0);
  const setI = (j) => setIdx(Math.max(0, Math.min(j, etapas.length - 1)));
  const [dir, setDir] = useState(1);
  const botaoRef = useRef(null);
  const toque = useRef(null);
  const etapa = etapas[i];
  const n = useDigitando(etapa.fala, !reduzir);
  const ultima = i === etapas.length - 1;
  const ir = (d) => { const j = i + d; if (j < 0) return; if (j >= etapas.length) { onFechar(true); return; } setDir(d); setI(j); };

  useEffect(() => { botaoRef.current?.focus({ preventScroll: true }); }, [i]);
  const teclas = useRef(null);
  teclas.current = (ev) => { if (ev.key === "Escape") onFechar(false); else if (ev.key === "ArrowRight") ir(1); else if (ev.key === "ArrowLeft") ir(-1); };
  useEffect(() => {
    const k = (ev) => teclas.current?.(ev);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <motion.div className="fixed inset-0 z-[95] flex items-end lg:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={`Tutorial do Bipi, etapa ${i + 1} de ${etapas.length}: ${etapa.titulo}`}
      onTouchStart={(e) => { toque.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (toque.current == null) return; const dx = e.changedTouches[0].clientX - toque.current; toque.current = null; if (Math.abs(dx) > 60) ir(dx < 0 ? 1 : -1); }}>
      <div className="absolute inset-0 bg-[#061C3A]/70 backdrop-blur-[2px]" aria-hidden="true" />
      <motion.section initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="relative w-full lg:w-[560px] rounded-t-[30px] lg:rounded-[30px] overflow-hidden text-white shadow-2xl"
        style={{ background: FUNDO_MARCA, isolation: "isolate", paddingBottom: "calc(env(safe-area-inset-bottom) + 18px)" }}>
        <div aria-hidden className="absolute inset-0 opacity-[.12]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
        <div aria-hidden className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-white/[.07]" />
        <div className="relative px-5 lg:px-7 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-[.2em] text-white/70">TUTORIAL · {i + 1} DE {etapas.length}</span>
            <button type="button" onClick={() => onFechar(false)} className="h-9 px-3 rounded-full bg-white/15 text-[12.5px] font-bold flex items-center gap-1" aria-label="Pular tutorial"><X size={14} />Pular</button>
          </div>
          <div className="flex items-end gap-2 mt-3">
            <Bipi falando={n < etapa.fala.length} reduzir={reduzir} />
            <div className="relative flex-1 min-w-0 bg-white text-[#0B2A55] rounded-[22px] rounded-bl-md px-4 py-3 mb-6 shadow-lg">
              <p className="sr-only" aria-live="polite">{etapa.titulo}. {etapa.fala}</p>
              <p className="text-[14.5px] lg:text-[15.5px] font-semibold leading-snug min-h-[3.9em]" aria-hidden="true">
                {etapa.fala.slice(0, n)}<span className="invisible">{etapa.fala.slice(n)}</span>
              </p>
            </div>
          </div>
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={etapa.id} custom={dir} initial={{ x: reduzir ? 0 : 40 * dir, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: reduzir ? 0 : -40 * dir, opacity: 0 }} transition={{ duration: 0.22 }}>
              <div className="flex items-center gap-3">
                <span className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,.14)" }}><etapa.Icone size={24} color={etapa.cor} /></span>
                <h2 className="text-[22px] lg:text-[24px] font-extrabold leading-tight tracking-tight">{etapa.titulo}</h2>
              </div>
              <ul className="mt-3.5 flex flex-col gap-2">
                {etapa.itens.map(([t, Ic], k) => (
                  <motion.li key={t} initial={{ opacity: 0, y: reduzir ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduzir ? 0 : 0.12 + k * 0.07 }}
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,.10)" }}>
                    <Ic size={17} className="shrink-0 text-white/85" /><span className="text-[13.5px] font-semibold leading-snug">{t}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
          <div className="flex items-center justify-center gap-1.5 mt-5" aria-hidden="true">
            {etapas.map((_, k) => <span key={k} className="h-2 rounded-full transition-all" style={{ width: k === i ? 22 : 8, background: k === i ? "#fff" : "rgba(255,255,255,.3)" }} />)}
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => ir(-1)} disabled={i === 0} className="h-12 w-14 rounded-2xl bg-white/15 flex items-center justify-center disabled:opacity-30" aria-label="Etapa anterior"><ChevronLeft size={20} /></button>
            <button ref={botaoRef} type="button" onClick={() => ir(1)} className="h-12 flex-1 rounded-2xl bg-white text-[#0B2A55] text-[15px] font-extrabold flex items-center justify-center gap-1.5 shadow-lg">
              {ultima ? <><Check size={18} />Começar a usar</> : <>Próximo<ChevronRight size={18} /></>}
            </button>
          </div>
        </div>
      </motion.section>
    </motion.div>,
    document.body,
  );
}

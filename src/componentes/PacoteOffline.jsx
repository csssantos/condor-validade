// Duas telas de progresso do uso offline:
//  - PacoteOfflineModal: no 1º acesso da pessoa neste aparelho, baixa o "pacote offline" (programa, fotos e dados) com barra de progresso;
//  - ImportandoDadosModal: ao voltar a internet, mostra o nome do titular e o envio dos registros feitos offline.
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { CloudDownload, CloudUpload, Check } from "lucide-react";
import { BLUE } from "../lib/constantes";

function Barra({ T, pct, rotulo }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={rotulo} style={{ background: T.chipBg }} className="h-3 rounded-full overflow-hidden">
        <div style={{ width: `${p}%`, background: BLUE, transition: "width 250ms ease" }} className="h-full rounded-full" />
      </div>
      <div style={{ color: T.subtext }} className="text-[0.75rem] mt-1.5 text-right font-semibold">{p}%</div>
    </div>
  );
}

function Cartao({ T, icone, titulo, children, rodape }) {
  const reduzir = useReducedMotion();
  return createPortal(
    <div style={{ background: "rgba(6,28,58,0.55)" }} className="fixed inset-0 z-[90] flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-label={titulo}>
      <motion.div initial={reduzir ? false : { opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }}
        style={{ background: T.card, color: T.text }} className="w-full max-w-sm rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div style={{ background: BLUE }} className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0">{icone}</div>
          <h2 className="text-[1.0625rem] font-bold leading-tight">{titulo}</h2>
        </div>
        {children}
        {rodape}
      </motion.div>
    </div>, document.body);
}

const FASES = { programa: "Baixando o programa do app", fotos: "Baixando as fotos dos produtos", dados: "Guardando os dados da loja" };

function PacoteOfflineModal({ T, nome, estado, onSegundoPlano, onFechar }) {
  const pronto = estado?.pronto;
  const total = estado?.total || 0, feitos = estado?.feitos || 0;
  const pct = pronto ? 100 : total > 0 ? (feitos / total) * 100 : 0;
  return (
    <Cartao T={T} icone={pronto ? <Check size={22} /> : <CloudDownload size={22} />} titulo={pronto ? "Pronto para usar sem internet" : "Preparando o app para usar offline"}
      rodape={<button onClick={pronto ? onFechar : onSegundoPlano} style={{ background: pronto ? BLUE : T.chipBg, color: pronto ? "#fff" : T.text }} className="mt-4 w-full py-3 rounded-2xl font-bold text-[0.9375rem] active:opacity-80">{pronto ? "Começar" : "Continuar em segundo plano"}</button>}>
      <p style={{ color: T.subtext }} className="text-[0.875rem] mb-3">
        {pronto ? `${nome ? nome + ", o" : "O"} app já tem o que precisa guardado neste aparelho. Sem internet, você abre o app, vê os produtos e registra; tudo é enviado quando a internet voltar.`
          : `${nome ? nome + ", estamos" : "Estamos"} baixando o programa, as fotos e os dados da sua loja para o app funcionar sem internet. Leva pouco tempo e só acontece uma vez.`}
      </p>
      {!pronto && <><div style={{ color: T.text }} className="text-[0.8125rem] font-semibold mb-1.5">{FASES[estado?.fase] || "Começando…"}{total > 1 ? ` · ${feitos} de ${total}` : ""}</div>
        <Barra T={T} pct={pct} rotulo="Progresso do pacote offline" /></>}
      {pronto && estado?.resumo && <p style={{ color: T.subtext }} className="text-[0.8125rem]">{estado.resumo}</p>}
    </Cartao>
  );
}

function ImportandoDadosModal({ T, nome, feitos, total }) {
  const pct = total > 0 ? (feitos / total) * 100 : 0;
  return (
    <Cartao T={T} icone={<CloudUpload size={22} />} titulo={nome ? `${nome}, importando seus dados` : "Importando seus dados"}>
      <p style={{ color: T.subtext }} className="text-[0.875rem] mb-3">A internet voltou. Estamos enviando o que você registrou sem conexão. Não feche o app.</p>
      <div style={{ color: T.text }} className="text-[0.8125rem] font-semibold mb-1.5">{feitos} de {total} {total === 1 ? "registro enviado" : "registros enviados"}</div>
      <Barra T={T} pct={pct} rotulo="Envio dos registros feitos offline" />
    </Cartao>
  );
}

export { PacoteOfflineModal, ImportandoDadosModal };

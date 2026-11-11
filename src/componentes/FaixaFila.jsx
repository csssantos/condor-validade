// Faixa fixa abaixo do cabeçalho: mostra, em tempo real, quantos registros estão guardados no aparelho
// (sem internet ou ainda não enviados) e deixa tentar enviar na hora. Some quando não há nada pendente e há internet.
import { useState, useEffect } from "react";
import { WifiOff, CloudUpload, Loader2 } from "lucide-react";
import { contarFilaDaPessoa, filaEnviando } from "../lib/fila";

function FaixaFila({ online }) {
  const [, forcar] = useState(0);
  useEffect(() => {
    const atualizar = () => forcar((n) => n + 1);
    // evento da fila + outra aba (storage) + segurança: volta ao app, foco, internet e um relógio curto
    window.addEventListener("condor-fila-mudou", atualizar);
    window.addEventListener("storage", atualizar);
    window.addEventListener("focus", atualizar);
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    document.addEventListener("visibilitychange", atualizar);
    const t = setInterval(atualizar, 15000);
    return () => {
      window.removeEventListener("condor-fila-mudou", atualizar); window.removeEventListener("storage", atualizar);
      window.removeEventListener("focus", atualizar); window.removeEventListener("online", atualizar); window.removeEventListener("offline", atualizar);
      document.removeEventListener("visibilitychange", atualizar); clearInterval(t);
    };
  }, []);
  const n = contarFilaDaPessoa();
  const enviando = filaEnviando();
  if (online && n === 0 && !enviando) return null;
  const txt = n === 1 ? "1 registro" : `${n} registros`;
  const tentar = () => { try { window.dispatchEvent(new CustomEvent("condor-sincronizar-fila")); } catch { /* sem janela */ } };
  return (
    <div role="status" aria-live="polite" style={{ background: online ? "#8A5A00" : "#7A1F23" }} className="text-white text-center text-[12px] font-medium py-2 px-3 flex items-center justify-center gap-2 flex-wrap">
      {!online ? <><WifiOff size={13} /> Sem internet. {n > 0 ? `${txt} guardado${n === 1 ? "" : "s"} neste aparelho` : "O que você fizer fica guardado neste aparelho"} e será enviado sozinho quando a internet voltar.</>
        : enviando ? <><Loader2 size={13} className="animate-spin" /> Enviando {txt}…</>
        : <><CloudUpload size={13} /> {txt} ainda não {n === 1 ? "foi enviado" : "foram enviados"}.
            <button onClick={tentar} className="underline font-bold active:opacity-70">Enviar agora</button></>}
    </div>
  );
}

export { FaixaFila };

// Resumo diário do encarregado (Mais → Notificações). Cada pessoa liga o canal que quiser; tudo começa DESLIGADO.
// Leitura: tabela resumo_diario_prefs (RLS: só a própria linha) + tempo real. Escrita: só pela RPC salvar_resumo_diario (o banco confere cargo, canal e limite).
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Mail, Send, Bell } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { MaisAviso, MaisLinha, MaisSwitch } from "./MaisUI";

const ERROS = {
  telegram_nao_vinculado: "Vincule o Telegram primeiro (Mais → Conta).",
  push_nao_ativo: "Ative as notificações neste aparelho primeiro.",
  sem_email: "Sua conta não tem e-mail cadastrado.",
  sem_permissao: "Só encarregados e cargos acima recebem o resumo.",
};
const msgErro = (e) => { const t = String(e?.message || ""); for (const k of Object.keys(ERROS)) if (t.includes(k)) return ERROS[k]; return /limite|429/i.test(t) ? "Muitas alterações seguidas. Tente de novo em instantes." : "Não foi possível salvar agora. Tente de novo."; };

export function usarResumoDiario(usuarioId) {
  const [prefs, setPrefs] = useState({ telegram: false, push: false, email: false });
  const [pronto, setPronto] = useState(false);
  const [tg, setTg] = useState(null); // Telegram vinculado? (null = ainda não sabemos)
  const carregar = useCallback(async () => {
    if (!usuarioId) return;
    const { data, error } = await supabase.from("resumo_diario_prefs").select("telegram, push, email").eq("usuario_id", usuarioId).maybeSingle();
    if (!error) { setPrefs({ telegram: !!data?.telegram, push: !!data?.push, email: !!data?.email }); setPronto(true); }
    const st = await supabase.rpc("telegram_status");
    if (!st.error && st.data) setTg(!!st.data.vinculado);
  }, [usuarioId]);
  useEffect(() => {
    if (!usuarioId) return undefined;
    carregar();
    // tempo real: se a pessoa mudar em outro aparelho (ou o vínculo do Telegram mudar), a tela acompanha na hora
    const canal = supabase.channel(`resumo-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "resumo_diario_prefs", filter: `usuario_id=eq.${usuarioId}` }, () => carregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_vinculos" }, () => carregar())
      .subscribe();
    const volta = () => { if (!document.hidden) carregar(); };
    document.addEventListener("visibilitychange", volta); window.addEventListener("focus", volta); window.addEventListener("online", volta);
    const t = setInterval(volta, 60000);
    return () => { supabase.removeChannel(canal); clearInterval(t); document.removeEventListener("visibilitychange", volta); window.removeEventListener("focus", volta); window.removeEventListener("online", volta); };
  }, [usuarioId, carregar]);
  return { prefs, setPrefs, pronto, tg, carregar };
}

// pc = true usa o espaçamento do cartão do PC (o conteúdo é o mesmo)
export function ResumoDiarioControles({ T, dark, usuarioId, showToast, notifAtiva, temEmail }) {
  const { prefs, setPrefs, pronto, tg, carregar } = usarResumoDiario(usuarioId);
  const [salvando, setSalvando] = useState(null);
  const trava = useRef(false);
  async function alternar(canal) {
    if (trava.current || !pronto) return;
    const novo = { ...prefs, [canal]: !prefs[canal] };
    trava.current = true; setSalvando(canal);
    const anterior = prefs; setPrefs(novo); // otimista; volta se o servidor recusar
    const { error } = await supabase.rpc("salvar_resumo_diario", { p_telegram: novo.telegram, p_push: novo.push, p_email: novo.email });
    trava.current = false; setSalvando(null);
    if (error) { setPrefs(anterior); showToast?.(msgErro(error), "erro"); carregar(); return; }
    showToast?.(novo[canal] ? "Resumo diário ligado. Chega todo dia às 7h, só se houver algo a avisar." : "Resumo diário desligado neste canal.", "ok");
  }
  const linha = (canal, Icone, titulo, desc, bloqueio, ultima) => (
    <MaisLinha key={canal} T={T} dark={dark} icon={Icone} cor="#0B4F9E" titulo={titulo} desc={bloqueio || desc}
      direita={<MaisSwitch ativo={!!prefs[canal]} onClick={() => alternar(canal)} label={`Resumo diário por ${titulo}`} />} ultima={ultima} />
  );
  return (
    <div aria-busy={!pronto || !!salvando}>
      {linha("telegram", Send, "Telegram", "Todo dia às 7h, com o banner do Bipi", tg === false && !prefs.telegram ? "Vincule o Telegram em Mais → Conta para ligar" : null)}
      {linha("push", Bell, "Notificação do app", "Aviso no aparelho com o app fechado", !notifAtiva && !prefs.push ? "Ative as notificações neste aparelho (acima) para ligar" : null)}
      {linha("email", Mail, "E-mail", "Resumo completo no e-mail da sua conta", temEmail === false && !prefs.email ? "Sua conta não tem e-mail cadastrado" : null, true)}
      <div className="px-4 pb-4"><MaisAviso>Só chega se houver produto vencido, vencendo em até 10 dias ou produto novo esperando aprovação. Cada encarregado recebe só o setor dele; sem setor definido, a loja toda. Você escolhe os canais e pode desligar a qualquer momento.</MaisAviso></div>
    </div>
  );
}

export const IconeResumo = CalendarClock;

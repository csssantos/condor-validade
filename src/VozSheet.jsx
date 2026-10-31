// Cadastro por voz: "Leite vence sexta, 12 unidades" -> mostra o que entendeu e abre o formulário já preenchido.
// Usa o reconhecimento de voz do navegador (Chrome/Android/Edge). Onde não existe (ex.: iPhone instalado como app),
// cai num campo de texto — o teclado do celular tem o microfone de ditado.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Mic, Check, X, RotateCcw, Calendar, Package, Hash, DollarSign, MapPin, AlertTriangle } from "lucide-react";
import { interpretarVoz, buscarNoCatalogo, formatarNomeNovo, descreverData, validarVoz } from "./voz";

// Microfone: pede a permissão uma vez e lembra (neste aparelho) que a pessoa liberou, pra não pedir toda hora.
const CHAVE_MIC = "condor_mic_liberado";
let micAquecido = false;
async function garantirMicrofone() {
  try {
    if (navigator.permissions?.query) {
      const st = await navigator.permissions.query({ name: "microphone" });
      if (st.state === "denied") return "negado";
      if (st.state === "granted") { micAquecido = true; try { localStorage.setItem(CHAVE_MIC, "1"); } catch { /* sem storage */ } return "ok"; }
    }
  } catch { /* navegador sem a consulta (iPhone): segue */ }
  if (micAquecido) return "ok";
  if (!navigator.mediaDevices?.getUserMedia) return "ok";
  try {
    const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    fluxo.getTracks().forEach((t) => t.stop()); // só confirma a permissão; não fica gravando
    micAquecido = true; try { localStorage.setItem(CHAVE_MIC, "1"); } catch { /* sem storage */ }
    return "ok";
  } catch (e) { return e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "negado" : "ok"; }
}

const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export default function VozSheet({ T, accent, accentDark, catalog, onCancel, onConfirmar }) {
  const reduzir = useReducedMotion();
  const [fase, setFase] = useState(SR ? "ouvindo" : "revisar"); // ouvindo | revisar
  const [texto, setTexto] = useState("");
  const [parcial, setParcial] = useState("");
  const [erro, setErro] = useState("");
  const recRef = useRef(null);
  const textoRef = useRef("");

  function parar(abortar) {
    const r = recRef.current;
    if (!r) return;
    if (abortar) recRef.current = null; // cancelado: o onend não deve mudar de tela
    try { abortar ? r.abort() : r.stop(); } catch { /* já parado */ } // parada normal: o onend leva pra conferência
  }

  async function iniciar() {
    if (!SR) return;
    const mic = await garantirMicrofone();
    if (mic === "negado") { setErro("O microfone está bloqueado. Libere nas permissões do navegador/aparelho (uma vez só) ou digite abaixo."); setFase("revisar"); return; }
    setErro(""); setParcial(""); setTexto(""); textoRef.current = ""; setFase("ouvindo");
    const rec = new SR();
    rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      let final = ""; let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript + " "; else interim += r[0].transcript;
      }
      textoRef.current = final.trim();
      setTexto(final.trim()); setParcial(interim);
    };
    rec.onerror = (ev) => {
      const e = ev.error;
      if (e === "not-allowed" || e === "service-not-allowed") setErro("O microfone está bloqueado. Libere nas permissões do navegador ou digite abaixo.");
      else if (e === "no-speech") setErro("Não ouvi nada. Toque no microfone e fale de novo.");
      else if (e === "network") setErro("Sem internet para entender a voz. Digite abaixo.");
      else if (e !== "aborted") setErro("Não consegui ouvir. Tente de novo ou digite abaixo.");
    };
    rec.onend = () => {
      if (recRef.current !== rec) return; // foi cancelado
      recRef.current = null;
      setTexto((t) => (t || textoRef.current || "").trim());
      setParcial("");
      setFase("revisar");
    };
    recRef.current = rec;
    try { rec.start(); } catch { setErro("Não consegui abrir o microfone."); setFase("revisar"); }
  }

  useEffect(() => { iniciar(); return () => parar(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const hoje = useMemo(() => new Date(), []);
  const res = useMemo(() => interpretarVoz(texto, hoje), [texto, hoje]);
  const busca = useMemo(() => (res.nome ? buscarNoCatalogo(res.nome, catalog) : { tipo: "vazio", candidatos: [] }), [res.nome, catalog]);
  const [escolha, setEscolha] = useState(null); // chave do produto escolhido na lista, ou "novo"
  useEffect(() => { setEscolha(null); }, [res.nome]);
  const problemas = useMemo(() => validarVoz(res, hoje), [res, hoje]);
  const precisaEscolher = busca.tipo === "varios" || busca.tipo === "marca";
  const escolhido = precisaEscolher && escolha && escolha !== "novo" ? busca.candidatos.find((c) => c.chave === escolha) || null : null;
  const achado = busca.tipo === "encontrado" ? busca.candidatos[0] : escolhido;
  const novoFmt = useMemo(() => (busca.tipo === "novo" ? busca : (escolha === "novo" && res.nome ? formatarNomeNovo(res.nome, catalog) : null)), [busca, escolha, res.nome, catalog]);
  const ehNovo = !achado && !!novoFmt;
  const pode = problemas.length === 0 && !!res.nome && (busca.tipo === "encontrado" || busca.tipo === "novo" || (precisaEscolher && !!escolha && !(busca.tipo === "marca" && escolha === "novo")));

  const Linha = ({ Icon, rotulo, valor, vazio }) => (
    <div className="flex items-start gap-3 py-2">
      <span style={{ background: T.chipBg, color: valor ? accentDark : T.subtext }} className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"><Icon size={16} /></span>
      <div className="min-w-0 flex-1">
        <p style={{ color: T.subtext }} className="text-[11px] font-semibold">{rotulo}</p>
        <p style={{ color: valor ? T.text : T.subtext }} className={`text-sm ${valor ? "font-bold" : ""}`}>{valor || vazio}</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Cadastro por voz">
      <motion.div className="absolute inset-0 bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onCancel} />
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 36 }}
        style={{ background: T.card, color: T.text }}
        className="relative w-full max-w-md rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl max-h-[92vh] overflow-y-auto">

        {fase === "ouvindo" ? (
          <div className="flex flex-col items-center text-center pt-2">
            <div className="relative h-28 w-28 flex items-center justify-center">
              {!reduzir && [0, 1].map((i) => (
                <motion.span key={i} style={{ background: accent }} className="absolute inset-0 rounded-full"
                  initial={{ scale: 0.55, opacity: 0.35 }} animate={{ scale: 1.25, opacity: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: "easeOut" }} />
              ))}
              <motion.button onClick={() => parar(false)} whileTap={{ scale: 0.94 }} aria-label="Parar de ouvir"
                style={{ background: `linear-gradient(160deg, ${accent} 0%, ${accentDark} 100%)` }}
                className="relative h-20 w-20 rounded-full flex items-center justify-center shadow-lg">
                <Mic size={32} color="#fff" />
              </motion.button>
            </div>
            <p className="font-extrabold text-lg mt-3">Ouvindo…</p>
            <p style={{ color: T.subtext }} className="text-sm mt-1">Diga algo como <b>“Leite vence sexta, 12 unidades”</b></p>
            <p style={{ color: T.text }} className="text-base font-semibold mt-4 min-h-[3rem]">{texto} <span style={{ color: T.subtext }}>{parcial}</span></p>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => parar(false)} style={{ background: accent }}
              className="mt-2 text-white font-bold text-sm px-6 py-3 rounded-2xl flex items-center gap-2"><Check size={18} /> Pronto</motion.button>
            <button onClick={onCancel} style={{ color: accentDark }} className="mt-3 text-sm font-bold py-2 px-4">Cancelar</button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="font-extrabold text-lg">Confira o que entendi</p>
              <button onClick={onCancel} aria-label="Fechar" style={{ background: T.chipBg, color: T.subtext }} className="h-8 w-8 rounded-full flex items-center justify-center"><X size={16} /></button>
            </div>

            {erro && (
              <div style={{ background: T.chipBg, color: T.text }} className="rounded-xl px-3 py-2 text-xs flex gap-2 mb-3"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {erro}</div>
            )}

            <label style={{ color: T.subtext }} className="text-[11px] font-semibold block mb-1">{SR ? "O que você falou (dá pra corrigir)" : "Digite ou use o microfone do teclado"}</label>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={200} placeholder="Ex.: iogurte natural vence sexta, 12 unidades"
              style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 resize-none" />

            {busca.tipo === "incompleto" && res.nome && (
              <div style={{ background: T.chipBg, color: T.text }} className="rounded-xl px-3 py-2.5 text-[13px] font-semibold mt-3 flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> Não achei “{res.nome}” no cadastro. Fale o nome completo do produto (marca + produto), ex.: “Bauducco panetone”.</div>
            )}
            {problemas.length > 0 && (
              <div style={{ background: "#E31E2415", color: "#B3141A" }} className="rounded-xl px-3 py-2.5 text-[13px] font-semibold mt-3 space-y-1">
                {problemas.map((m) => <p key={m} className="flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> {m}</p>)}
              </div>
            )}
            {precisaEscolher && (
              <div style={{ background: T.chipBg }} className="rounded-2xl p-3 mt-3">
                <p style={{ color: T.text }} className="text-[13px] font-bold leading-snug">
                  {busca.tipo === "marca"
                    ? <>“{res.nome}” é só uma marca ou termo genérico ({busca.total} produtos). Fale o nome do produto, ou escolha um abaixo.</>
                    : busca.aproximado ? <>Não achei exatamente isso. Algum destes é o seu?</> : <>Achei {busca.total || busca.candidatos.length} produtos parecidos. Qual é?</>}
                </p>
                <div className="flex flex-col gap-1.5 mt-2.5" role="radiogroup">
                  {busca.candidatos.map((c) => (
                    <button key={c.chave} role="radio" aria-checked={escolha === c.chave} onClick={() => setEscolha(c.chave)}
                      style={escolha === c.chave ? { background: accent, color: "#fff" } : { background: T.card, color: T.text }} className="text-left rounded-xl px-3 py-2.5 text-[13px] font-semibold flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center" style={{ borderColor: escolha === c.chave ? "#fff" : T.subtext }}>{escolha === c.chave && <span className="h-2 w-2 rounded-full bg-white" />}</span>
                      <span className="min-w-0">{c.entrada.nome}</span>
                    </button>
                  ))}
                  {busca.tipo === "varios" && (
                    <button role="radio" aria-checked={escolha === "novo"} onClick={() => setEscolha("novo")}
                      style={escolha === "novo" ? { background: accent, color: "#fff" } : { background: T.card, color: T.subtext }} className="text-left rounded-xl px-3 py-2.5 text-[13px] font-semibold">Nenhum desses — cadastrar como produto novo</button>
                  )}
                </div>
                {SR && <button onClick={iniciar} style={{ color: accentDark }} className="text-[12.5px] font-bold mt-2.5 flex items-center gap-1.5"><RotateCcw size={13} /> Falar de novo</button>}
              </div>
            )}

            <div style={{ borderColor: T.border }} className="border-t mt-3 pt-1">
              <Linha Icon={Package} rotulo={achado ? (achado.exato ? "Produto (já cadastrado)" : "Produto já cadastrado") : ehNovo ? "Produto novo (nome no cadastro)" : "Produto"} valor={achado ? achado.entrada.nome : ehNovo ? novoFmt.nomeNovo : precisaEscolher ? "" : res.nome} vazio={precisaEscolher ? "Escolha na lista acima" : "Não entendi o nome"} />
              <Linha Icon={Calendar} rotulo="Validade" valor={res.validade ? descreverData(res.validade, hoje) : ""} vazio="Não entendi a validade — você escolhe na próxima tela" />
              <Linha Icon={Hash} rotulo="Quantidade" valor={res.quantidade != null ? `${String(res.quantidade).replace(".", ",")}${res.porPeso ? " kg" : ""}` : ""} vazio="Não informada" />
              {res.precoUnitario != null && <Linha Icon={DollarSign} rotulo="Preço" valor={`R$ ${res.precoUnitario.toFixed(2).replace(".", ",")}`} />}
              {ehNovo && res.setorSugerido && <Linha Icon={MapPin} rotulo="Setor sugerido" valor={res.setorSugerido} />}
            </div>
            {ehNovo && novoFmt.correcoes?.length > 0 && <p style={{ color: T.subtext }} className="text-[11px] mt-2">Ajustei a grafia pelo cadastro: {novoFmt.correcoes.map(([de, para]) => `${de} → ${para}`).join(", ")}.</p>}
            {ehNovo && <p style={{ color: T.subtext }} className="text-[11px] mt-2">Produto novo: você completa setor e localização na próxima tela. Ele fica sem código de barras até alguém bipar.</p>}

            <div className="flex gap-2 mt-4">
              {SR && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={iniciar} style={{ background: T.chipBg, color: T.text }} className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"><RotateCcw size={16} /> Falar de novo</motion.button>
              )}
              <motion.button whileTap={{ scale: 0.97 }} disabled={!pode} onClick={() => onConfirmar({ res: ehNovo ? { ...res, nome: novoFmt.nomeNovo } : res, achado })}
                style={{ background: pode ? accent : "#C7CEDA" }} className="flex-[1.4] py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"><Check size={16} /> Continuar</motion.button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

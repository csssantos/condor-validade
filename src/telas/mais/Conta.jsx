// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../supabaseClient";
import { Check, Copy, EyeOff, Eye, ChevronRight, LogOut, KeyRound, Mail } from "lucide-react";
import { FUNDO_MARCA } from "../../TelasEntrada";
import { DashCard } from "../../componentes/dash";
import { BLUE, BLUE_DARK, RED_DARK, RED_SOFT, SITE_URL } from "../../lib/constantes";
import { formatarDataHora } from "../../lib/formatos";
import { removerTelegramComAviso } from "../../lib/produto";
import { useTelaLarga } from "../../lib/tela";
import { CORES_FORCA, COR_MAIS, MOLA, MOLA_SUAVE, MaisAviso, MaisBloco, MaisBotao, MaisCampo, MaisCheck, MaisLinha, ROTULOS_FORCA, clarearCor, forcaSenha, iniciaisDe } from "./MaisUI";

// ---------------- Páginas ----------------
// Vincular o Telegram: funcionário gera um código de 8 dígitos; promotor usa o código fixo da marca.
function TelegramVinculo({ T, showToast }) {
  const [st, setSt] = useState(null);
  const [cod, setCod] = useState(null);
  const [busy, setBusy] = useState(false);
  const bot = String(import.meta.env.VITE_TELEGRAM_BOT || "").replace(/^@/, "");
  const antes = useRef(null);
  const carregar = async () => {
    const { data, error } = await supabase.rpc("telegram_status");
    if (error || !data) return;
    if (antes.current === false && data.vinculado) { setCod(null); showToast("Telegram vinculado!"); } // o bot acabou de vincular: o card muda na hora
    if (antes.current === true && !data.vinculado) showToast("Telegram desvinculado.");
    antes.current = !!data.vinculado;
    setSt(data);
  };
  // Tempo real: o banco avisa quando o vínculo nasce ou some; a checagem periódica é só rede de segurança (se o realtime cair)
  useEffect(() => {
    carregar();
    const canal = supabase.channel(`tg-vinculo-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_vinculos" }, () => carregar())
      .subscribe();
    const volta = () => { if (!document.hidden) carregar(); };
    document.addEventListener("visibilitychange", volta); window.addEventListener("focus", volta); window.addEventListener("online", volta);
    return () => { supabase.removeChannel(canal); document.removeEventListener("visibilitychange", volta); window.removeEventListener("focus", volta); window.removeEventListener("online", volta); };
  }, []);
  const aguardando = !!st && !st.vinculado;
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) carregar(); }, aguardando ? 3000 : 20000);
    return () => clearInterval(t);
  }, [aguardando]);
  async function gerar() {
    setBusy(true);
    const { data, error } = await supabase.rpc("gerar_codigo_telegram");
    setBusy(false);
    if (error) { console.error(error); showToast(error.message?.includes("ja_vinculado") ? "Você já tem um Telegram vinculado." : "Não foi possível gerar o código agora.", "warn"); return; }
    setCod(data);
  }
  async function remover() {
    setBusy(true);
    const { error } = await removerTelegramComAviso({});
    setBusy(false);
    if (error) { console.error(error); showToast("Não foi possível desvincular.", "warn"); return; }
    setCod(null); showToast("Telegram desvinculado."); carregar();
  }
  const fmt = (c) => String(c).replace(/^([A-Za-z0-9]{4})([A-Za-z0-9]{4})$/, "$1 $2");
  async function copiarCodigo(c) {
    try { await navigator.clipboard.writeText(String(c)); showToast("Código copiado. Cole no bot do Telegram."); }
    catch { showToast("Não deu pra copiar. Segure o código para copiar manualmente.", "warn"); }
  }
  if (!st) return null;
  return (
    <MaisBloco T={T} titulo="Telegram">
      <div className="p-4 flex flex-col gap-3">
        <p style={{ color: T.subtext }} className="text-xs">Lance validade conversando com o bot do Telegram: mande o código de barras ou o nome. Se o produto não existir no app, ele busca a imagem na internet e cadastra depois da sua confirmação. Ele pergunta o que faltar e só grava depois do seu "sim".</p>
        {st.vinculado ? (
          <>
            <motion.div key="vinculado" initial={{ opacity: 0, scale: 0.94, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 24 }}
              style={{ background: "rgba(31,157,85,0.10)", border: "1px solid rgba(31,157,85,0.35)" }} className="rounded-2xl p-3.5 flex items-center gap-3">
              <span style={{ background: "#1F9D55" }} className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"><Check size={20} color="#fff" strokeWidth={3} /></span>
              <span className="min-w-0">
                <span style={{ color: "#1F9D55" }} className="block text-sm font-extrabold">Telegram vinculado</span>
                <span style={{ color: T.subtext }} className="block text-[11.5px]">{st.vinculado_em ? `Desde ${formatarDataHora(st.vinculado_em)}. ` : ""}Já pode lançar validade pelo bot.</span>
              </span>
            </motion.div>
            <button onClick={remover} disabled={busy} style={{ background: T.chipBg, color: T.text }} className="py-2.5 rounded-xl text-xs font-bold disabled:opacity-60">Desvincular este Telegram</button>
          </>
        ) : st.tipo === "promotor" ? (
          <>
            <p style={{ color: T.subtext }} className="text-xs">Abra o bot, toque em Iniciar e envie o seu código:</p>
            <button onClick={() => copiarCodigo(st.codigo)} style={{ background: T.chipBg, color: T.text }} className="text-lg font-mono font-bold text-center rounded-xl py-3 w-full flex items-center justify-center gap-2 active:scale-[.98]">{st.codigo}<Copy size={16} color={T.subtext} /></button>
            <p style={{ color: T.subtext }} className="text-[11px] text-center -mt-1.5">Toque no código para copiar</p>
          </>
        ) : cod ? (
          <>
            <p style={{ color: T.subtext }} className="text-xs">Abra o bot, toque em Iniciar e envie este código (vale 10 minutos):</p>
            <button onClick={() => copiarCodigo(cod.codigo)} style={{ background: T.chipBg, color: T.text }} className="text-2xl font-mono font-bold text-center rounded-xl py-3 w-full flex items-center justify-center gap-2.5 tracking-widest active:scale-[.98]">{fmt(cod.codigo)}<Copy size={18} color={T.subtext} /></button>
            <p style={{ color: T.subtext }} className="text-[11px] text-center -mt-1.5">Toque no código para copiar</p>
          </>
        ) : (
          <button onClick={gerar} disabled={busy} style={{ background: BLUE, color: "#fff" }} className="py-3 rounded-2xl text-sm font-bold disabled:opacity-60">{busy ? "Gerando…" : "Gerar código para vincular"}</button>
        )}
        {!st.vinculado && bot && <a href={`https://t.me/${bot}`} target="_blank" rel="noopener noreferrer" style={{ color: BLUE_DARK }} className="text-xs font-bold text-center">Abrir o bot no Telegram</a>}
      </div>
    </MaisBloco>
  );
}

function PaginaConta({ T, dark, perfil, usuario, showToast, onSair }) {
  const pc = useTelaLarga();
  const [emailAtual, setEmailAtual] = useState(perfil?.email || "");
  const [aberta, setAberta] = useState(null); // "senha" | "email" | null
  const [confirmaSair, setConfirmaSair] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (data?.user?.email) setEmailAtual(data.user.email); }); }, []);

  // senha
  const [sAtual, setSAtual] = useState(""); const [sNova, setSNova] = useState(""); const [sConf, setSConf] = useState("");
  const [ver, setVer] = useState(false); const [salvandoS, setSalvandoS] = useState(false); const [erroS, setErroS] = useState(""); const [okS, setOkS] = useState(false);
  const forca = forcaSenha(sNova);
  async function reautenticar(senha) {
    if (!emailAtual) return "Não consegui confirmar sua conta agora. Tente de novo.";
    const { error } = await supabase.auth.signInWithPassword({ email: emailAtual, password: senha });
    if (error) return error.message === "Invalid login credentials" ? "A senha atual está incorreta." : "Não consegui confirmar sua senha agora. Tente de novo.";
    return "";
  }
  async function salvarSenha() {
    setErroS("");
    if (!sAtual) { setErroS("Digite sua senha atual."); return; }
    if (sNova.length < 8) { setErroS("A nova senha precisa ter pelo menos 8 caracteres."); return; }
    if (sNova === sAtual) { setErroS("A nova senha precisa ser diferente da atual."); return; }
    if (sNova !== sConf) { setErroS("A confirmação não é igual à nova senha."); return; }
    setSalvandoS(true);
    const e1 = await reautenticar(sAtual);
    if (e1) { setSalvandoS(false); setErroS(e1); return; }
    const { error } = await supabase.auth.updateUser({ password: sNova });
    setSalvandoS(false);
    if (error) { setErroS("Não foi possível salvar a nova senha. Tente de novo."); return; }
    setOkS(true); setSAtual(""); setSNova(""); setSConf("");
    showToast?.("Senha alterada com sucesso.");
    setTimeout(() => { setOkS(false); setAberta(null); }, 1800);
  }

  // e-mail
  const [eNovo, setENovo] = useState(""); const [eSenha, setESenha] = useState("");
  const [salvandoE, setSalvandoE] = useState(false); const [erroE, setErroE] = useState(""); const [enviadoE, setEnviadoE] = useState(false);
  async function trocarEmail() {
    setErroE("");
    const novo = eNovo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(novo)) { setErroE("Digite um e-mail válido."); return; }
    if (novo === (emailAtual || "").toLowerCase()) { setErroE("Esse já é o seu e-mail atual."); return; }
    if (!eSenha) { setErroE("Digite sua senha para confirmar."); return; }
    setSalvandoE(true);
    const e1 = await reautenticar(eSenha);
    if (e1) { setSalvandoE(false); setErroE(e1); return; }
    const { error } = await supabase.auth.updateUser({ email: novo }, { emailRedirectTo: SITE_URL });
    setSalvandoE(false);
    if (error) {
      setErroE(/already|registered|exists/i.test(error.message || "") ? "Esse e-mail já está em uso por outra conta." : "Não foi possível pedir a troca agora. Tente de novo.");
      return;
    }
    setEnviadoE(true); setESenha("");
  }

  const olho = (
    <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar senhas" : "Mostrar senhas"} style={{ color: T.subtext }} className="h-9 w-9 flex items-center justify-center">
      {ver ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
  const cabecalho = ({ id, icon, cor, titulo, desc }) => (
    <MaisLinha T={T} dark={dark} icon={icon} cor={cor} titulo={titulo} desc={desc} onClick={() => setAberta(aberta === id ? null : id)}
      direita={<motion.span animate={{ rotate: aberta === id ? 90 : 0 }} transition={MOLA}><ChevronRight size={18} style={{ color: T.subtext }} /></motion.span>} ultima={aberta !== id} />
  );
  const formSenha = (
    <>
        {okS ? (
          <div className="flex flex-col items-center gap-2 py-5"><MaisCheck /><p style={{ color: T.text }} className="text-sm font-bold">Senha alterada!</p></div>
        ) : (
          <>
            <MaisCampo T={T} label="Senha atual" value={sAtual} onChange={setSAtual} type={ver ? "text" : "password"} autoComplete="current-password" direita={olho} />
            <MaisCampo T={T} label="Nova senha" value={sNova} onChange={setSNova} type={ver ? "text" : "password"} autoComplete="new-password" />
            {sNova && (
              <div aria-live="polite">
                <div style={{ background: T.chipBg }} className="h-1.5 rounded-full overflow-hidden">
                  <motion.div animate={{ width: `${Math.max(forca, 1) * 25}%`, background: CORES_FORCA[forca] }} transition={MOLA} className="h-full rounded-full" />
                </div>
                <p style={{ color: CORES_FORCA[forca] }} className="text-[11.5px] font-semibold mt-1">Senha {ROTULOS_FORCA[forca].toLowerCase()}</p>
              </div>
            )}
            <MaisCampo T={T} label="Repita a nova senha" value={sConf} onChange={setSConf} type={ver ? "text" : "password"} autoComplete="new-password" />
            <AnimatePresence>{erroS && <MaisAviso tipo="erro">{erroS}</MaisAviso>}</AnimatePresence>
            <MaisBotao T={T} onClick={salvarSenha} carregando={salvandoS}>Salvar nova senha</MaisBotao>
          </>
        )}
    </>
  );
  const formEmail = (
    <>
        {enviadoE ? (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <MaisCheck />
            <p style={{ color: T.text }} className="text-sm font-bold">Pedido enviado</p>
            <p style={{ color: T.subtext }} className="text-[12.5px] leading-relaxed">
              Mandamos links de confirmação. Abra o e-mail <strong>atual</strong> ({emailAtual}) e confirme a troca; se o novo e-mail também receber um link, confirme nele também.
              Até concluir, você continua entrando com o e-mail atual.
            </p>
          </div>
        ) : (
          <>
            <MaisCampo T={T} label="Novo e-mail" value={eNovo} onChange={setENovo} type="email" autoComplete="email" placeholder="nome@exemplo.com" />
            <MaisCampo T={T} label="Sua senha" value={eSenha} onChange={setESenha} type={ver ? "text" : "password"} autoComplete="current-password" direita={olho} />
            <MaisAviso>Por segurança, a troca só vale depois que você confirmar pelo link enviado ao seu <strong>e-mail atual</strong>.</MaisAviso>
            <AnimatePresence>{erroE && <MaisAviso tipo="erro">{erroE}</MaisAviso>}</AnimatePresence>
            <MaisBotao T={T} onClick={trocarEmail} carregando={salvandoE}>Pedir troca de e-mail</MaisBotao>
          </>
        )}
    </>
  );
  const cargo = perfil?.cargo_nome_loja || perfil?.cargos?.nome || "—";
  const dadosConta = [["Cargo", cargo], ["Loja", perfil?.lojas?.numero_loja ? `Loja ${perfil.lojas.numero_loja}` : "—"], ["Setor", perfil?.setor || "—"], ["Matrícula", perfil?.matricula || "—"]];
  if (pc) {
    return (
      <div className="grid grid-cols-12 gap-5 items-start">
        <aside className="col-span-5 xl:col-span-4 flex flex-col gap-5">
          <section style={{ background: FUNDO_MARCA, isolation: "isolate" }} className="relative overflow-hidden rounded-3xl text-white p-6 shadow-sm">
            <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
            <div className="relative flex items-center gap-4">
              <div className="h-20 w-20 rounded-[26px] flex items-center justify-center text-2xl font-extrabold shrink-0" style={{ background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)" }}>{iniciaisDe(perfil?.nome || usuario)}</div>
              <div className="min-w-0">
                <p className="text-xl font-extrabold leading-tight truncate">{perfil?.nome || usuario || "—"}</p>
                <p className="text-[13px] text-white/75 mt-0.5 truncate">{emailAtual || "—"}</p>
              </div>
            </div>
            <div className="relative grid grid-cols-2 gap-2.5 mt-5">
              {dadosConta.map(([r, v]) => (
                <div key={r} className="rounded-2xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)" }}>
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-white/70">{r}</p>
                  <p className="text-[14px] font-semibold mt-0.5 truncate">{v}</p>
                </div>
              ))}
            </div>
          </section>
          <DashCard T={T} title="Sessão" subtitle="Encerra o acesso neste computador">
            {!confirmaSair ? (
              <button type="button" onClick={() => setConfirmaSair(true)} style={{ background: RED_SOFT, color: RED_DARK }} className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"><LogOut size={16} />Sair da conta</button>
            ) : (
              <div>
                <p style={{ color: T.text }} className="text-sm font-bold">Sair deste computador?</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => setConfirmaSair(false)} style={{ background: T.chipBg, color: T.text }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold">Cancelar</button>
                  <button type="button" onClick={onSair} style={{ background: RED_DARK, color: "#fff" }} className="flex-1 py-2.5 rounded-xl text-sm font-bold">Sair</button>
                </div>
              </div>
            )}
          </DashCard>
        </aside>
        <div className="col-span-7 xl:col-span-8 flex flex-col gap-5 min-w-0">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <DashCard T={T} title="Alterar senha" subtitle="Pede a senha atual para confirmar"><div className="flex flex-col gap-3">{formSenha}</div></DashCard>
            <DashCard T={T} title="Alterar e-mail" subtitle={emailAtual ? `Atual: ${emailAtual}` : "E-mail de acesso"}><div className="flex flex-col gap-3">{formEmail}</div></DashCard>
          </div>
          <TelegramVinculo T={T} showToast={showToast} />
        </div>
      </div>
    );
  }
  return (
    <>
      <MaisBloco T={T} i={0}>
        <div className="p-5 flex items-center gap-4">
          <motion.div initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 12 }}
            style={{ background: `${COR_MAIS.conta}26`, color: dark ? clarearCor(COR_MAIS.conta, 0.45) : COR_MAIS.conta }} className="h-16 w-16 rounded-[22px] flex items-center justify-center text-xl font-extrabold shrink-0">
            {iniciaisDe(perfil?.nome || usuario)}
          </motion.div>
          <div className="min-w-0">
            <p style={{ color: T.text }} className="text-[17px] font-extrabold leading-tight truncate">{perfil?.nome || usuario || "—"}</p>
            <p style={{ color: T.subtext }} className="text-[12.5px] mt-0.5 truncate">{emailAtual || "—"}</p>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${T.chipBg}` }} className="grid grid-cols-2">
          {[["Cargo", cargo], ["Loja", perfil?.lojas?.numero_loja ? `Loja ${perfil.lojas.numero_loja}` : "—"], ["Setor", perfil?.setor || "—"], ["Matrícula", perfil?.matricula || "—"]].map(([r, v], k) => (
            <div key={r} style={{ borderBottom: k < 2 ? `1px solid ${T.chipBg}` : "none", borderRight: k % 2 === 0 ? `1px solid ${T.chipBg}` : "none" }} className="px-4 py-3">
              <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide">{r}</p>
              <p style={{ color: T.text }} className="text-[14px] font-semibold mt-0.5 truncate">{v}</p>
            </div>
          ))}
        </div>
      </MaisBloco>

      <MaisBloco T={T} titulo="Segurança da conta" i={1}>
        {cabecalho({ id: "senha", icon: KeyRound, cor: COR_MAIS.conta, titulo: "Alterar senha", desc: "Pede a senha atual para confirmar" })}
        <AnimatePresence initial={false}>
          {aberta === "senha" && (
            <motion.div key="f-senha" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={MOLA_SUAVE} className="overflow-hidden">
              <div className="px-4 pb-4 pt-1 flex flex-col gap-3">
                {formSenha}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {cabecalho({ id: "email", icon: Mail, cor: "#0B4F9E", titulo: "Alterar e-mail", desc: emailAtual ? `Atual: ${emailAtual}` : "E-mail de acesso" })}
        <AnimatePresence initial={false}>
          {aberta === "email" && (
            <motion.div key="f-email" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={MOLA_SUAVE} className="overflow-hidden">
              <div className="px-4 pb-4 pt-1 flex flex-col gap-3">
                {formEmail}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </MaisBloco>

      <MaisBloco T={T} i={2}>
        <AnimatePresence mode="wait" initial={false}>
          {!confirmaSair ? (
            <motion.div key="sair1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MaisLinha T={T} dark={dark} icon={LogOut} cor={RED_DARK} titulo="Sair da conta" desc="Encerra sua sessão neste aparelho" onClick={() => setConfirmaSair(true)} ultima />
            </motion.div>
          ) : (
            <motion.div key="sair2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4">
              <p style={{ color: T.text }} className="text-[14px] font-bold">Sair deste aparelho?</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setConfirmaSair(false)} style={{ background: T.chipBg, color: T.text }} className="flex-1 py-3 rounded-2xl text-sm font-semibold">Cancelar</button>
                <button onClick={onSair} style={{ background: RED_DARK, color: "#fff" }} className="flex-1 py-3 rounded-2xl text-sm font-bold">Sair</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </MaisBloco>
      <TelegramVinculo T={T} showToast={showToast} />
    </>
  );
}

export { PaginaConta, TelegramVinculo };

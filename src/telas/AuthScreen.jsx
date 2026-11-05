// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../supabaseClient";
import { ArrowLeft } from "lucide-react";
import { TERMOS_VERSAO, marcarAceitePendente, LinksLegais, AceiteCampo, LegalLeitor } from "../Legal";
import { grupoForm, AuthTitulo, AuthCampo, AuthAviso, AuthBotao, AuthLink, itemForm, AuthPalco } from "../TelasEntrada";
import { BLUE, BLUE_SOFT, LOGO_SRC, SITE_URL } from "../lib/constantes";
import { useDesktop } from "../lib/tela";
import { ScanView } from "./Scan";

// ============ Tela de login / recuperação de senha (Supabase Auth) ============
function AuthScreen({ T, antesDeEntrar }) {
  const ehDesktop = useDesktop();
  const [matriculaDigitada, setMatriculaDigitada] = useState("");
  const [modo, setModo] = useState("login"); // "login" | "recuperar" | "nova-senha" | "cadastro-scan" | "cadastro-confirmar" | "cadastro-info"
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [funcionarioEncontrado, setFuncionarioEncontrado] = useState(null);
  const [cadEmail, setCadEmail] = useState("");
  const [cadSenha, setCadSenha] = useState("");
  const [cadConfirmarSenha, setCadConfirmarSenha] = useState("");
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [tentouAceitar, setTentouAceitar] = useState(false);
  const [leitorLegal, setLeitorLegal] = useState(null);

  async function aoBiparCracha(codigoLido) {
    const bruto = String(codigoLido || "").trim();
    // Crachá só tem números: letras no meio (ex.: "A123B456") não viram outra matrícula em silêncio
    if (!bruto || /[^\d\s]/.test(bruto)) { setErro("Código do crachá não reconhecido: a matrícula só tem números."); setModo("login"); return; }
    const matricula = bruto.replace(/\D/g, "");
    if (!matricula) { setErro("Código do crachá não reconhecido."); setModo("login"); return; }
    setCarregando(true); setErro("");
    // O pré-cadastro pode ter zeros à esquerda ("00123") e o crachá trazer "123" (ou o contrário): tenta as duas formas
    const semZeros = matricula.replace(/^0+/, "") || "0";
    const tentativas = [...new Set([matricula, semZeros])];
    let data = null, falhou = false;
    for (const m of tentativas) {
      const { data: linhas, error } = await supabase.rpc("buscar_funcionario_pendente", { p_matricula: m });
      if (error) { falhou = true; continue; }
      data = Array.isArray(linhas) ? linhas[0] : linhas;
      if (data) break;
    }
    setCarregando(false);
    if (!data && falhou) {
      setErro("Não consegui verificar a matrícula agora (conexão ou muitas tentativas). Espere um pouco e tente de novo.");
      setModo("cadastro-info");
      return;
    }
    if (!data) {
      setErro(`Matrícula ${matricula} não encontrada ou já usada. Confira o número do crachá; se estiver certo, peça pro encarregado ou pro CPD te pré-cadastrar em "Gestão de Funcionários" (ou refazer o pré-cadastro, se você errou o e-mail antes).`);
      setModo("cadastro-info");
      return;
    }
    setFuncionarioEncontrado(data);
    setModo("cadastro-confirmar");
  }

  async function finalizarCadastro(e) {
    e.preventDefault();
    setErro("");
    if (cadSenha.length < 8) { setErro("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (cadSenha !== cadConfirmarSenha) { setErro("As senhas não coincidem."); return; }
    if (!aceitouTermos) { setTentouAceitar(true); setErro("Para criar a conta, aceite os Termos de Uso e a Política de Privacidade."); return; }
    setCarregando(true);
    if (antesDeEntrar && (await antesDeEntrar())) { setCarregando(false); return; }
    const emailLimpo = cadEmail.trim();
    // O pré-cadastro é marcado como usado assim que a conta é criada: e-mail errado queima a matrícula. Confirma antes.
    if (!window.confirm(`O link de confirmação será enviado para:\n${emailLimpo}\n\nO e-mail está certo?`)) { setCarregando(false); return; }
    // A matrícula vai nos metadados: o servidor (trigger no banco) cria o perfil e marca o pré-cadastro como
    // usado NA HORA do signUp, mesmo sem sessão aberta. Antes o app tentava inserir em "usuarios" pelo navegador
    // e o banco barrava (sem sessão não há permissão) — daí o "chame o CPD".
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: emailLimpo, password: cadSenha,
      options: { emailRedirectTo: SITE_URL, data: { matricula: funcionarioEncontrado.matricula, nome: funcionarioEncontrado.nome, termos_versao: TERMOS_VERSAO, termos_aceitos_em: new Date().toISOString() } }
    });
    if (!error) marcarAceitePendente();
    if (error) {
      setCarregando(false);
      setErro(/already registered/i.test(error.message) ? "Esse e-mail já tem uma conta." : "Não foi possível criar a conta. Tente novamente.");
      return;
    }
    if (signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
      setCarregando(false); setErro("Esse e-mail já tem uma conta."); return;
    }
    // Confirmação de e-mail desligada no Supabase => já vem com sessão e o app entra sozinho.
    if (signUpData?.session) { setCarregando(false); return; }
    // Sem sessão: tenta entrar direto (só funciona se o e-mail não exigir confirmação).
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email: emailLimpo, password: cadSenha });
    setCarregando(false);
    if (!erroLogin) return;
    setEmail(emailLimpo);
    setMensagem(/not confirmed/i.test(erroLogin.message)
      ? "Conta criada! Enviamos um e-mail de confirmação — abra o link e depois entre."
      : "Conta criada! Entre com seu e-mail e senha.");
    setModo("login");
  }

  useEffect(() => {
    // O Supabase dispara esse evento quando a pessoa chega pelo link de "esqueci minha senha".
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { setModo("nova-senha"); setErro(""); setMensagem(""); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function entrar(e) {
    e.preventDefault();
    setErro(""); setCarregando(true);
    if (antesDeEntrar && (await antesDeEntrar())) { setCarregando(false); return; } // tem versão nova: a tela de atualização assume
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setCarregando(false);
    if (error) {
      setErro(
        error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." :
        error.message === "Email not confirmed" ? "Confirme seu e-mail antes de entrar (veja sua caixa de entrada)." :
        error.status === 429 ? "Muitas tentativas. Espere alguns minutos e tente de novo." :
        !navigator.onLine || /fetch|network/i.test(error.message || "") ? "Sem conexão com a internet. Confira o sinal e tente de novo." :
        "Não foi possível entrar. Tente novamente."
      );
    }
  }

  async function enviarRecuperacao(e) {
    e.preventDefault();
    setErro(""); setMensagem(""); setCarregando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_URL });
    setCarregando(false);
    if (error) { setErro("Não foi possível enviar o e-mail de recuperação."); return; }
    setMensagem("Enviamos um link de recuperação para o seu e-mail.");
  }

  async function salvarNovaSenha(e) {
    e.preventDefault();
    setErro("");
    if (novaSenha.length < 8) { setErro("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (novaSenha !== confirmarSenha) { setErro("As senhas não coincidem."); return; }
    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setCarregando(false);
    if (error) { setErro("Não foi possível salvar a nova senha."); return; }
    setMensagem("Senha alterada com sucesso! Você já pode continuar.");
  }

  // Layout novo: palco azul animado em cima e "folha" com o formulário embaixo (no PC: duas colunas).
  const SAI = { opacity: 0, x: -22, transition: { duration: 0.14 } };
  const formCls = "flex flex-col gap-3.5";
  const voltarLogin = () => { setModo("login"); setErro(""); setMensagem(""); };
  const compacto = modo === "cadastro-confirmar" || modo === "nova-senha";

  let conteudo = null;
  if (modo === "login") {
    conteudo = (
      <motion.form key="login" onSubmit={entrar} variants={grupoForm} initial="hidden" animate="show" exit={SAI} className={formCls}>
        <AuthTitulo T={T} titulo="Bem-vindo de volta" sub="Entre para ver as validades da sua loja." />
        <AuthCampo T={T} rotulo="E-mail" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <AuthCampo T={T} rotulo="Senha" type="password" required autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        <AuthAviso tipo="erro">{erro}</AuthAviso>
        <AuthAviso tipo="ok">{mensagem}</AuthAviso>
        <AuthBotao T={T} carregando={carregando}>Entrar</AuthBotao>
        <AuthLink T={T} forte onClick={() => { setModo("recuperar"); setErro(""); setMensagem(""); }}>Esqueci minha senha</AuthLink>
        <motion.div variants={itemForm} className="flex items-center gap-3 my-0.5" aria-hidden>
          <span style={{ background: T.inputBorder }} className="h-px flex-1" />
          <span style={{ color: T.subtext }} className="text-[11px] font-semibold uppercase tracking-wider">Primeiro acesso?</span>
          <span style={{ background: T.inputBorder }} className="h-px flex-1" />
        </motion.div>
        <AuthBotao T={T} variante="contorno" type="button" onClick={() => { setErro(""); setModo("cadastro-scan"); }}>
          {ehDesktop ? "Cadastrar com a matrícula do crachá" : "Bipar meu crachá pra cadastrar"}
        </AuthBotao>
        <motion.div variants={itemForm} className="mt-1"><LinksLegais T={T} onAbrir={setLeitorLegal} /></motion.div>
      </motion.form>
    );
  } else if (modo === "recuperar") {
    conteudo = (
      <motion.form key="recuperar" onSubmit={enviarRecuperacao} variants={grupoForm} initial="hidden" animate="show" exit={SAI} className={formCls}>
        <AuthTitulo T={T} titulo="Recuperar senha" sub="Informe seu e-mail. Vamos te enviar um link pra criar uma nova senha." />
        <AuthCampo T={T} rotulo="E-mail" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <AuthAviso tipo="erro">{erro}</AuthAviso>
        <AuthAviso tipo="ok">{mensagem}</AuthAviso>
        <AuthBotao T={T} carregando={carregando}>Enviar link</AuthBotao>
        <AuthLink T={T} onClick={voltarLogin}><ArrowLeft size={13} /> Voltar</AuthLink>
      </motion.form>
    );
  } else if (modo === "nova-senha") {
    conteudo = (
      <motion.form key="nova-senha" onSubmit={salvarNovaSenha} variants={grupoForm} initial="hidden" animate="show" exit={SAI} className={formCls}>
        <AuthTitulo T={T} titulo="Nova senha" sub="Escolha uma senha com pelo menos 8 caracteres." />
        <AuthCampo T={T} rotulo="Nova senha" type="password" required autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
        <AuthCampo T={T} rotulo="Confirmar nova senha" type="password" required autoComplete="new-password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
        <AuthAviso tipo="erro">{erro}</AuthAviso>
        <AuthAviso tipo="ok">{mensagem}</AuthAviso>
        <AuthBotao T={T} carregando={carregando}>Salvar senha</AuthBotao>
      </motion.form>
    );
  } else if (modo === "cadastro-info") {
    conteudo = (
      <motion.div key="cadastro-info" variants={grupoForm} initial="hidden" animate="show" exit={SAI} className={formCls}>
        <AuthTitulo T={T} titulo="Cadastro" />
        <AuthAviso tipo="erro">{erro}</AuthAviso>
        <motion.p variants={itemForm} style={{ color: T.subtext }} className="text-sm">Você ainda não possui uma conta. Peça pro seu <strong>Encarregado</strong> ou pro <strong>CPD</strong> te pré-cadastrar em "Gestão de Funcionários" antes de continuar.</motion.p>
        <AuthBotao T={T} type="button" onClick={() => { setErro(""); setModo("cadastro-scan"); }}>{ehDesktop ? "Digitar outra matrícula" : "Tentar bipar de novo"}</AuthBotao>
        <AuthLink T={T} onClick={() => { setErro(""); setModo("login"); }}><ArrowLeft size={13} /> Voltar pro login</AuthLink>
      </motion.div>
    );
  } else if (modo === "cadastro-scan" && ehDesktop) {
    conteudo = (
      <motion.form key="cadastro-scan" onSubmit={(e) => { e.preventDefault(); aoBiparCracha(matriculaDigitada); }} variants={grupoForm} initial="hidden" animate="show" exit={SAI} className={formCls}>
        <AuthTitulo T={T} titulo="Cadastro" sub="Digite a matrícula do seu crachá. Ela precisa estar pré-cadastrada pelo encarregado ou pelo CPD." />
        <AuthCampo T={T} rotulo="Matrícula" inputMode="numeric" autoFocus value={matriculaDigitada} onChange={(e) => setMatriculaDigitada(e.target.value.replace(/\D/g, ""))} />
        <AuthAviso tipo="erro">{erro}</AuthAviso>
        <AuthBotao T={T} carregando={carregando} disabled={!matriculaDigitada}>Continuar</AuthBotao>
        <AuthLink T={T} onClick={() => { setErro(""); setModo("login"); }}><ArrowLeft size={13} /> Voltar pro login</AuthLink>
      </motion.form>
    );
  } else if (modo === "cadastro-confirmar" && funcionarioEncontrado) {
    conteudo = (
      <motion.form key="cadastro-confirmar" onSubmit={finalizarCadastro} variants={grupoForm} initial="hidden" animate="show" exit={SAI} className={formCls}>
        <AuthTitulo T={T} titulo="Confirme seus dados" />
        <motion.div variants={itemForm} style={{ background: BLUE_SOFT }} className="rounded-2xl p-3.5 text-left flex items-center gap-3">
          <span style={{ background: BLUE, color: "#fff" }} className="h-11 w-11 rounded-full flex items-center justify-center text-base font-extrabold shrink-0">{String(funcionarioEncontrado.nome || "?").trim().charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <p style={{ color: "#14202B" }} className="text-sm font-bold truncate">{funcionarioEncontrado.nome}</p>
            <p style={{ color: "#4A5B6A" }} className="text-xs mt-0.5">Matrícula {funcionarioEncontrado.matricula} · {funcionarioEncontrado.cargo_nome_loja || "—"}</p>
            {funcionarioEncontrado.setor && <p style={{ color: "#4A5B6A" }} className="text-xs">{funcionarioEncontrado.setor}</p>}
          </div>
        </motion.div>
        <motion.p variants={itemForm} style={{ color: T.subtext }} className="text-xs">Não é você? <button type="button" onClick={() => { setFuncionarioEncontrado(null); setModo("cadastro-scan"); }} style={{ color: BLUE }} className="font-semibold">{ehDesktop ? "Trocar matrícula" : "Bipar de novo"}</button></motion.p>
        <AuthCampo T={T} rotulo="Seu e-mail" type="email" required autoComplete="email" value={cadEmail} onChange={(e) => setCadEmail(e.target.value)} />
        <AuthCampo T={T} rotulo="Criar senha (mín. 8 caracteres)" type="password" required autoComplete="new-password" value={cadSenha} onChange={(e) => setCadSenha(e.target.value)} />
        <AuthCampo T={T} rotulo="Confirmar senha" type="password" required autoComplete="new-password" value={cadConfirmarSenha} onChange={(e) => setCadConfirmarSenha(e.target.value)} />
        <motion.div variants={itemForm}><AceiteCampo T={T} aceito={aceitouTermos} onChange={setAceitouTermos} onAbrir={setLeitorLegal} erro={tentouAceitar} /></motion.div>
        <AuthAviso tipo="erro">{erro}</AuthAviso>
        <AuthBotao T={T} carregando={carregando}>Criar minha conta</AuthBotao>
        <AuthLink T={T} onClick={() => setModo("login")}>Cancelar</AuthLink>
      </motion.form>
    );
  }

  return (
    <div style={{ background: T.bg }} className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      <AuthPalco logo={LOGO_SRC} compacto={compacto} />
      <motion.div initial={{ y: 70, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 26, delay: 0.12 }}
        style={{ background: T.card }}
        className="relative -mt-8 lg:mt-0 rounded-t-[32px] lg:rounded-none px-6 pt-8 pb-10 lg:px-12 min-h-[calc(100vh-284px)] lg:min-h-screen lg:flex lg:items-center lg:justify-center shadow-[0_-14px_32px_-14px_rgba(0,0,0,.28)] lg:shadow-none">
        <div className="w-full max-w-sm mx-auto">
          <AnimatePresence mode="wait" initial={false}>{conteudo}</AnimatePresence>
        </div>
      </motion.div>
      {modo === "cadastro-scan" && !ehDesktop && <ScanView variante="cracha" ocupado={carregando} T={T} onDetected={aoBiparCracha} onCancel={() => setModo("login")} />}      <AnimatePresence>{leitorLegal && <LegalLeitor T={T} docId={leitorLegal} onFechar={() => setLeitorLegal(null)} />}</AnimatePresence>
    </div>
  );
}

export { AuthScreen };

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TutorialBipi, etapasDoTutorial, marcarTutorialVisto, tutorialJaVisto } from "./componentes/TutorialBipi";
import { motion, AnimatePresence } from "framer-motion";
import { supabase, abriuPorRecuperacao, linkComErro, limparRecuperacao, temLinkPendente, descartarLinkPendente, usarLinkPendente, emailDoLinkPendente } from "./supabaseClient";
import { Ticket, WifiOff, Barcode, Package, Calendar, Mic, ShieldAlert, AlertTriangle, Megaphone, Lock } from "lucide-react";
import VozSheet from "./VozSheet";
import { validarVoz } from "./voz";
import { temAceitePendente, registrarAceite, TERMOS_VERSAO, lerAceiteLocal, gravarAceiteLocal, AceiteObrigatorio, AvisoArmazenamento } from "./Legal";
import { TelaCarregando } from "./TelasEntrada";
import { gerarImagemProduto } from "./compartilharImagem";
import { classificarTom, duracaoAviso, DESFAZER_MS, AvisoToast, AvisoDesfazer } from "./Avisos";
import { PainelRedeView, PrevisaoOperacionalView, PrevencaoPerdasView, AssistenteIAView } from "./inteligencia";
import { AtualizacaoObrigatoria, NovaVersaoBanner, baixarVersaoNova, buscarVersaoPublicada } from "./componentes/Atualizacao";
import { ErrorBoundary } from "./componentes/ErrorBoundary";
import { Header } from "./componentes/Header";
import { BottomNav, SideNav } from "./componentes/Navegacao";
import { AtualizacaoModal, NOVIDADES, gravarNovidadeVista, lerNovidadeVista, novidadesParaCargo } from "./componentes/Novidades";
import { BLUE, BLUE_SOFT, LOGO_SRC, NOTIF_KEY, PREFS_KEY, RED, RED_DARK, RED_SOFT, SNAPSHOT_KEY, SUBSETORES_PADRAO, definirSetoresPereciveisExtra, setorPrincipal } from "./lib/constantes";
import { LOJA_ID_ATIVA, avisoFromRow, historicoFromRow, loadLocal, produtoFromRow, registrarAuditoria, saveLocal, setLojaIdAtiva, supaCriarSetorCustomizado, supaCriarSubsetorCustomizado, supaEnviarResumoRede, supaFetchAuditoria, supaFetchAvisosRecentes, supaFetchCatalogo, supaFetchConfigLoja, supaFetchHistorico, supaFetchProdutos, supaFetchRondas, supaFetchSetoresCustomizados, supaFetchSubsetoresCustomizados, supaRegistrarAlteracaoValidade, supaRegistrarPedido } from "./lib/dados";
import { avisarErroGravacao, erroDeRede, gravarCatalogo, gravarComFila, gravarHistorico, gravarProduto, lerFila, mensagemErroGravacao, processarFila, removerProduto, definirUsuarioFila, usuarioFila, limparFilaOrfa } from "./lib/fila";
import { PermissoesContext, formatarData, formatarDataHoraExtenso, formatarMoeda, getStatus, getTokens, precisaNotificar, sugestaoDesconto } from "./lib/formatos";
import { dispararNotificacao, inscreverPush, isIOS, isStandalone } from "./lib/notificacoes";
import { eanValido, limiteSomaLote, textoLote } from "./lib/produto";
import { usarDadosGerenciais } from "./lib/relatoriosPDF";
import { useDesktop, useTelaLarga } from "./lib/tela";
import { CONFIG_BALANCA_PADRAO, apenasNumeros, parseCodigoBalanca, playBeep, sanitizarTexto } from "./lib/utilidades";
import { AuditoriaView, HistoricoView, PrioridadeInteligenteView } from "./telas/Analises";
import { AuthScreen } from "./telas/AuthScreen";
import { ConfirmProductView } from "./telas/Confirmar";
import { ContaSemVinculo } from "./telas/ContaSemVinculo";
import { DashboardView } from "./telas/Dashboard";
import { ConvitesPromotorView, GestaoAplicativoView } from "./telas/Gestao";
import { HomeView, ProdutosDashboard } from "./telas/Home";
import { ExpiryView } from "./telas/Lancamento";
import { ProductDetailModal } from "./telas/ProdutoDetalhe";
import { TorreControleView } from "./telas/RedeTorre";
import { RelatoriosView } from "./telas/Relatorios";
import { RondaAvisosHost, RondasView } from "./telas/Rondas";
import { ScanView } from "./telas/Scan";
import { SetorDetalheView, SetorSubcategoriasView, SetoresView } from "./telas/Setores";
import { MaisView } from "./telas/mais/MaisView";

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const [tab, setTab] = useState("home");
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState({ tema: "claro", som: true });
  const [sistemaEscuro, setSistemaEscuro] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [usuario, setUsuario] = useState(null);
  const [recuperandoSenha, setRecuperandoSenha] = useState(abriuPorRecuperacao);
  const [linkPendenteAtivo, setLinkPendenteAtivo] = useState(() => temLinkPendente()); // abriu o link do e-mail com alguém logado: perguntar
  const [trocandoConta, setTrocandoConta] = useState(false);
  const [avisoLink, setAvisoLink] = useState(linkComErro); // "link venceu": aparece uma vez e some (não volta em logouts seguintes)
  const [sessao, setSessao] = useState(undefined); // undefined = carregando, null = sem login, objeto = logado
  const [perfil, setPerfil] = useState(undefined); // linha da tabela "usuarios" (nome, cargo, loja, ativo)
  const [perfilErro, setPerfilErro] = useState(false); // true = falhou ao buscar (rede/permissão), diferente de "sem vínculo"
  const [perfilTick, setPerfilTick] = useState(0); // incrementar força recarregar o perfil
  // Aceite dos Termos/Privacidade: null = verificando, true = ok, false = precisa aceitar (bloqueia o app)
  const [aceiteOk, setAceiteOk] = useState(null);
  const [maisPagina, setMaisPagina] = useState(null); // página aberta em Mais (lembra ao voltar de uma tela aberta pelos Atalhos)
  useEffect(() => { if (flow === null && tab !== "ajustes") setMaisPagina(null); }, [tab, flow]);
  const idDoUsuario = sessao?.user?.id || null;
  // Permissões (também valem no banco): <=4 tudo; 5 só o próprio setor; >=6 e promotor só editam o que lançaram, sem baixa/exclusão
  const nivelUsuario = perfil?.cargos?.nivel ?? 99;
  const podeGerirProduto = (it) => {
    if (!it) return false;
    if (nivelUsuario <= 4) return true;
    if (nivelUsuario !== 5) return false;
    const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s\u00a0]+/g, " ").trim().toLowerCase();
    const meu = norm(perfil?.setor), dele = norm(it.setor);
    return !meu || dele === meu || dele.startsWith(meu + " ") || meu.startsWith(dele + " ");
  };
  const podeEditarProduto = (it) => {
    if (!it) return false;
    if (podeGerirProduto(it)) return true;
    if (nivelUsuario <= 5) return false;
    return (it.lancadoPorId && it.lancadoPorId === idDoUsuario) || (!it.lancadoPorId && !!perfil?.nome && (it.cadastradoPor === perfil.nome || String(it.cadastradoPor || "").startsWith(perfil.nome + " - ")));
  };
  useEffect(() => {
    if (!idDoUsuario || !perfil) { return; }
    let vivo = true;
    (async () => {
      if (temAceitePendente()) { setAceiteOk(true); await registrarAceite(); return; }
      try {
        const { data, error } = await supabase.from("consentimentos").select("id").eq("versao", TERMOS_VERSAO).limit(1);
        if (!vivo) return;
        if (error) { setAceiteOk(lerAceiteLocal()); return; }
        if (data && data.length) { gravarAceiteLocal(); setAceiteOk(true); } else { setAceiteOk(false); }
      } catch { if (vivo) setAceiteOk(lerAceiteLocal()); }
    })();
    return () => { vivo = false; };
  }, [idDoUsuario, !!perfil]);
  const ehEncarregado = (perfil?.cargos?.nivel != null && perfil.cargos.nivel <= 5);
  // Item 1 (painel corporativo): nível de cargo mais alto (supervisor regional, diretoria) — ajuste o limite
  // conforme os níveis reais da tabela "cargos" da rede. Assumi aqui que nível <= 3 é corporativo.
  const ehCorporativo = (perfil?.cargos?.nivel != null && perfil.cargos.nivel <= 3);
  // DESENVOLVEDOR (nivel 1) enxerga a "Gestão do Aplicativo" e pode trocar de loja livremente
  // Gestão do Aplicativo (lojas, pré-cadastro em qualquer loja): DESENVOLVEDOR (1) e DIRETOR (2)
  const ehDev = (perfil?.cargos?.nivel != null && perfil.cargos.nivel <= 2);
  const [lojaAtivaOverride, setLojaAtivaOverride] = useState(null); // { id, numero_loja } — só usado por dev/central trocando de loja
  const lojaAtiva = lojaAtivaOverride || { id: perfil?.loja_id, numero_loja: perfil?.lojas?.numero_loja };
  const [todasLojas, setTodasLojas] = useState([]);
  const recarregarLojas = async () => { const { data } = await supabase.from("lojas").select("*").order("numero_loja"); setTodasLojas(data || []); };
  useEffect(() => { if (ehDev) recarregarLojas(); }, [ehDev]);
  // Toda leitura/escrita da camada de dados (supaFetch*/supaUpsert*) filtra pela loja aqui — é a
  // fundação real do multiloja: antes disso, todo mundo lia os dados da loja 79 igual.
  useEffect(() => { setLojaIdAtiva(lojaAtiva?.id); }, [lojaAtiva?.id]);
  // Antes havia um modo para esconder valores em R$ de funcionários; foi removido (todos veem os valores).
  const podeVerValores = true;
  const [catalog, setCatalog] = useState({});
  // Autocomplete de nome no cadastro — lista enxuta de nomes já usados, sem duplicar
  const nomesExistentesCatalogo = useMemo(() => Array.from(new Set(Object.values(catalog).map((c) => c.nome).filter(Boolean))), [catalog]);
  const [items, setItems] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [rondas, setRondas] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [setoresExtra, setSetoresExtra] = useState([]);
  const [subsetoresExtra, setSubsetoresExtra] = useState([]);
  const [rondaIntent, setRondaIntent] = useState(null);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [toast, setToast] = useState(null);
  const [desfazer, setDesfazer] = useState(null); // { id, mensagem, onDesfazer }
  const [detalheItem, setDetalheItem] = useState(null);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  const sessaoRef = useRef(null);
  const loginRegistradoRef = useRef(null);
  useEffect(() => { sessaoRef.current = sessao?.user?.id || null; }, [sessao]);

  // Sessão real do Supabase Auth — sobrepõe o antigo sistema de "nome digitado + PIN local".
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { definirUsuarioFila(data.session?.user?.id || null); setSessao(data.session ?? null); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // ao sair, a cópia offline dos produtos/histórico não fica no aparelho para a próxima pessoa
      definirUsuarioFila(session?.user?.id || null); // antes de qualquer envio da fila: ação de uma pessoa nunca vai com a sessão de outra
      if (event === "SIGNED_OUT") {
        // nada da pessoa que saiu fica na tela nem no aparelho
        setItems([]); setCatalog({}); setHistorico([]); setAuditoria([]); setRondas([]);
        setLojaAtivaOverride(null); setFlow(null); setTab("home"); setDetalheItem(null); // a próxima pessoa não herda a loja trocada nem a tela aberta
        try { localStorage.removeItem(SNAPSHOT_KEY); } catch { /* sem armazenamento */ }
      }
      if (event === "PASSWORD_RECOVERY") setRecuperandoSenha(true); // link de "esqueci minha senha": pede a nova senha antes de entrar
      setSessao(session ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Link vencido/sem sessão: não deixa a trava de "nova senha" ligada para o próximo login normal.
  useEffect(() => {
    if (sessao !== null || !linkPendenteAtivo || trocandoConta) return;
    // o aparelho tinha uma sessão velha (já caiu): o link é de quem está tentando entrar, então usa direto
    usarLinkPendente().then((ok) => { setLinkPendenteAtivo(false); if (ok) setRecuperandoSenha(true); else setAvisoLink(true); });
  }, [sessao, linkPendenteAtivo, trocandoConta]);
  useEffect(() => {
    if (sessao === null && recuperandoSenha) { setRecuperandoSenha(false); setAvisoLink(true); limparRecuperacao(); }
    if (sessao) setAvisoLink(false);
  }, [sessao, recuperandoSenha]);

  // dono das ações guardadas sem internet: a fila só envia ações da pessoa logada (nunca com a sessão de outra)
  useEffect(() => { if (sessao !== undefined) definirUsuarioFila(sessao?.user?.id || null); }, [sessao]);
  // quem entrou já viu o aviso de armazenamento (está nos termos aceitos)
  useEffect(() => { if (sessao?.user?.id) { try { localStorage.setItem("avdc_aviso_armazenamento", "1"); } catch { /* sem armazenamento */ } } }, [sessao?.user?.id]);

  // Assim que há sessão, busca o perfil (nome, cargo, loja) na tabela "usuarios".
  useEffect(() => {
    if (!sessao) { setPerfil(sessao === null ? null : undefined); return; }
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase.from("usuarios")
        .select("nome, ativo, matricula, cargo_nome_loja, loja_id, setor, promotor, marca, acesso_expira_em, cargos(nome, nivel, cargos_subordinados), lojas(numero_loja)")
        .eq("id", sessao.user.id)
        .maybeSingle();
      if (cancelado) return;
      if (error) { console.error("Erro ao buscar perfil:", error); setPerfilErro(true); setPerfil(null); return; }
      setPerfilErro(false);
      // Linha sem loja = conta criada mas nunca vinculada a um funcionário → cai na tela de vincular.
      // Promotor (entrou por convite): só vale enquanto o convite não venceu nem foi revogado.
      const promotorValido = !data?.promotor || (data.ativo && (!data.acesso_expira_em || new Date(data.acesso_expira_em) > new Date()));
      setPerfil(data && data.loja_id && promotorValido ? data : null);
    })();
    return () => { cancelado = true; };
  }, [sessao, perfilTick]);

  // Convite de promotor: o link (?convite=TOKEN) funciona como login. Cria uma sessão anônima no
  // Supabase e o banco (resgatar_convite) amarra essa sessão ao nome/marca/loja/validade do convite.
  // Link permanente do promotor: /promotor/<marca>/<CODIGO> (resgatar_convite_codigo); o antigo ?convite=TOKEN continua valendo.
  const conviteDaUrl = () => {
    if (typeof window === "undefined") return null;
    const t = new URLSearchParams(window.location.search).get("convite");
    if (t) return { token: t };
    const m = window.location.pathname.match(/^\/promotor\/[^/]*\/([A-Za-z0-9-]{6,20})\/?$/);
    return m ? { codigo: m[1].toUpperCase() } : null;
  };
  const [conviteStatus, setConviteStatus] = useState(() => (conviteDaUrl() ? "resgatando" : null));
  useEffect(() => {
    const alvo = conviteDaUrl();
    if (!alvo) return;
    const token = alvo.token;
    const limparUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("convite");
      const caminho = alvo.codigo ? "/" : url.pathname;
      window.history.replaceState({}, "", caminho + (url.search || "") + url.hash);
    };
    (async () => {
      const { data: atual } = await supabase.auth.getSession();
      let sessaoAtual = atual?.session;
      if (sessaoAtual && !sessaoAtual.user?.is_anonymous) {
        limparUrl();
        setConviteStatus({ erro: "Este aparelho já está logado com uma conta de funcionário. Saia dela antes de abrir o convite." });
        return;
      }
      if (!sessaoAtual) {
        const { error: erroAnon } = await supabase.auth.signInAnonymously();
        if (erroAnon) {
          console.error(erroAnon);
          limparUrl();
          setConviteStatus({ erro: "Não foi possível abrir o convite agora. Tente de novo em instantes." });
          return;
        }
      }
      const { error } = alvo.codigo ? await supabase.rpc("resgatar_convite_codigo", { p_codigo: alvo.codigo }) : await supabase.rpc("resgatar_convite", { p_token: token });
      limparUrl();
      if (error) {
        const m = error.message || "";
        setConviteStatus({ erro:
          m.includes("convite_expirado") ? "Este convite expirou. Peça um novo link pra loja." :
          m.includes("convite_revogado") ? "Este convite foi cancelado pela loja." :
          m.includes("convite_pausado") ? "Este convite está pausado pela loja. Fale com quem enviou o link." :
          m.includes("convite_invalido") ? "Link de convite inválido. Confira se copiou o link inteiro." :
          "Não foi possível abrir o convite. Tente de novo." });
        await supabase.auth.signOut();
        return;
      }
      setConviteStatus(null);
      setPerfil(undefined);
      setPerfilTick((n) => n + 1);
    })();
  }, []);

  // Promotor: convite cancelado/pausado na gestão derruba o acesso NA HORA (tempo real na própria linha de usuarios
  // + conferência a cada 60 s e ao voltar para o app, caso o tempo real caia).
  useEffect(() => {
    if (!perfil?.promotor || !sessao?.user?.id) return undefined;
    const uid = sessao.user.id;
    const conferir = async () => {
      const { data } = await supabase.from("usuarios").select("ativo, acesso_expira_em").eq("id", uid).maybeSingle();
      const valido = data && data.ativo && (!data.acesso_expira_em || new Date(data.acesso_expira_em) > new Date());
      if (!valido) { setPerfil(undefined); setPerfilTick((n) => n + 1); }
    };
    const ch = supabase.channel(`promotor-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios", filter: `id=eq.${uid}` }, conferir)
      .subscribe();
    const foco = () => { if (document.visibilityState === "visible") conferir(); };
    document.addEventListener("visibilitychange", foco);
    const t = setInterval(conferir, 60000);
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", foco); clearInterval(t); };
  }, [perfil?.promotor, sessao?.user?.id]);

  // Quando o acesso do promotor vence com o app aberto, recarrega o perfil (que aí cai na tela de expirado).
  useEffect(() => {
    if (!perfil?.acesso_expira_em) return;
    const ms = new Date(perfil.acesso_expira_em).getTime() - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => { setPerfil(undefined); setPerfilTick((n) => n + 1); }, Math.min(ms + 1000, 2147483000));
    return () => clearTimeout(t);
  }, [perfil?.acesso_expira_em]);

  // O nome exibido/gravado na auditoria passa a vir da conta autenticada, no formato "Nome Sobrenome -
  // CARGO" (ex: "Cauã Silva - CPD") — como esse texto é usado em toda a auditoria/ronda/baixa do app,
  // mudar aqui já propaga o formato novo pra tudo, sem precisar tocar em cada lugar que registra ação.
  useEffect(() => {
    if (perfil && perfil.nome) {
      const partes = perfil.nome.trim().split(/\s+/);
      const nomeExibicao = partes.length >= 2 ? `${partes[0]} ${partes[1]}` : perfil.nome;
      const identidade = perfil.cargo_nome_loja ? `${nomeExibicao} - ${perfil.cargo_nome_loja}` : nomeExibicao;
      setUsuario(identidade);
      // Auditoria de acesso: o SERVIDOR grava nome, loja e IP (o app só informa o aparelho); sem serviço externo de IP
      if (loginRegistradoRef.current !== sessao?.user?.id) { loginRegistradoRef.current = sessao?.user?.id; supabase.rpc("registrar_login", { p_dispositivo: String(navigator.userAgent || "").slice(0, 300) }).then(({ error }) => { if (error) console.warn("registrar_login:", error.message); }, () => {}); }
      if (typeof Notification !== "undefined" && Notification.permission === "granted") inscreverPush(identidade);
    }
  }, [perfil]);

  async function sair() {
    await supabase.auth.signOut();
  }

  useEffect(() => { definirSetoresPereciveisExtra(setoresExtra.filter((s) => s.perecivel).map((s) => s.nome)); }, [setoresExtra]);

  const [escolhaAberta, setEscolhaAberta] = useState(false);
  const ehDesktop = useDesktop();
  const telaLarga = useTelaLarga();
  // No computador não há bipe nem lançamento manual: se a janela virar "desktop" no meio de um fluxo, sai dele.
  useEffect(() => {
    if (ehDesktop && ["scan", "confirm", "expiry"].includes(flow)) { setEscolhaAberta(false); resetFlow(); }
  }, [ehDesktop, flow]);
  const [intencaoFluxo, setIntencaoFluxo] = useState("validade"); // "validade" | "cadastro"
  const [vozAberta, setVozAberta] = useState(false);
  const [vozPre, setVozPre] = useState(null); // o que a voz já preencheu na tela de validade { validade, quantidade, porPeso, lote, semLote }
  const [setorAtivo, setSetorAtivoBruto] = useState(null); // controla a página de detalhe do setor
  const [subAtivo, setSubAtivo] = useState(null); // subcategoria escolhida dentro do setor (null = tela de subcategorias; "__todos__" / "__sem__" = atalhos)
  const setSetorAtivo = (v) => { setSetorAtivoBruto(v); setSubAtivo(null); };

  const [pendingBarcode, setPendingBarcode] = useState(null);
  // Item 8: config de código de balança desta loja (peso/preço embutido) — carregada uma vez do Supabase
  const [configBalanca, setConfigBalanca] = useState(CONFIG_BALANCA_PADRAO);
  useEffect(() => {
    const lojaNumero = perfil?.lojas?.numero_loja;
    if (!lojaNumero) return;
    supaFetchConfigLoja(lojaNumero).then((cfg) => { if (cfg?.balancaConfig) setConfigBalanca(cfg.balancaConfig); });
  }, [perfil?.lojas?.numero_loja]);
  const [draftProduct, setDraftProduct] = useState({ nome: "", setor: "", foto: null });
  const [editingItemId, setEditingItemId] = useState(null);

  const [search, setSearch] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("Todos");
  const [ordenarPor, setOrdenarPor] = useState("urgencia");
  const [modoVisual, setModoVisual] = useState("grade");

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = (e) => setSistemaEscuro(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", aoMudar); else mq.addListener(aoMudar);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", aoMudar); else mq.removeListener(aoMudar); };
  }, []);
  // prefs antigas guardavam só { dark }; converte para o tema novo sem perder a escolha
  const tema = prefs.tema || (prefs.dark ? "escuro" : "claro");
  const dark = tema === "escuro" || (tema === "auto" && sistemaEscuro);
  const T = getTokens(dark);
  // Faixa branca embaixo (iPhone): pinta html/body/#root com a cor do tema, assim a área da barra inferior nunca fica branca.
  useEffect(() => {
    try {
      const raiz = document.getElementById("root");
      [document.documentElement, document.body, raiz].forEach(el => { if (el) el.style.background = T.bg; });
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", T.bg));
    } catch {}
  }, [T.bg]);

  useEffect(() => {
    setPrefs(loadLocal(PREFS_KEY, { tema: "claro", som: true }));
    setLoading(false);
  }, []);

  // Dados da loja só carregam depois que sabemos QUAL loja (login concluído, perfil carregado —
  // ou o dev trocou de loja em Gestão do Aplicativo). Sem isso, todo mundo lia sempre a loja 79.
  const [dadosProntos, setDadosProntos] = useState(false);
  useEffect(() => {
    if (!lojaAtiva?.id) return;
    setDadosProntos(false);
    (async () => {
      let cat, its, hist;
      if (navigator.onLine) {
        [cat, its, hist] = await Promise.all([supaFetchCatalogo(), supaFetchProdutos(), supaFetchHistorico()]);
        if (sessaoRef.current) saveLocal(SNAPSHOT_KEY, { uid: sessaoRef.current, cat, its, hist });
      } else {
        const snap = loadLocal(SNAPSHOT_KEY, { cat: {}, its: [], hist: [] });
        const minha = snap && snap.uid && snap.uid === sessaoRef.current; // cópia de outra pessoa (ou sem dono) não abre
        cat = minha ? snap.cat : {}; its = minha ? snap.its : []; hist = minha ? snap.hist : [];
      }
      setCatalog(cat); setItems(its); setHistorico(hist);
      supaFetchRondas().then(setRondas);
      supaFetchAuditoria().then(setAuditoria);
      supaFetchSetoresCustomizados().then(setSetoresExtra);
      supaFetchSubsetoresCustomizados().then(setSubsetoresExtra);
      setDadosProntos(true);
    })();
  }, [lojaAtiva?.id]);

  // O banco recusou uma gravação que a tela já tinha mostrado como salva: avisa e recarrega os dados reais
  useEffect(() => {
    const recarregar = () => Promise.all([supaFetchCatalogo(), supaFetchProdutos(), supaFetchHistorico()]).then(([cat, its, hist]) => { setCatalog(cat); setItems(its); setHistorico(hist); }).catch(() => {});
    function aoErroGravacao(ev) {
      showToast((ev.detail && ev.detail.mensagem) || "Não foi possível gravar.", "warn");
      recarregar();
    }
    window.addEventListener("condor-erro-gravacao", aoErroGravacao);
    window.addEventListener("condor-recarregar-dados", recarregar);
    return () => { window.removeEventListener("condor-erro-gravacao", aoErroGravacao); window.removeEventListener("condor-recarregar-dados", recarregar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // modo offline: detecta queda/volta de conexão e sincroniza a fila de alterações pendentes sozinho
  useEffect(() => {
    function aoFicarOnline() {
      setOnline(true);
      (async () => {
        const minhas = () => lerFila().filter((op) => !op.uid || op.uid === usuarioFila()); // só as ações da pessoa logada
        const fila = minhas();
        if (!fila.length) return;
        showToast(`Sincronizando ${fila.length} registro(s)…`, "carregando");
        try {
          await processarFila();
          const [cat, its, hist] = await Promise.all([supaFetchCatalogo(), supaFetchProdutos(), supaFetchHistorico()]);
          setCatalog(cat); setItems(its); setHistorico(hist);
          if (sessaoRef.current) saveLocal(SNAPSHOT_KEY, { uid: sessaoRef.current, cat, its, hist });
          const restam = minhas().length;
          if (restam > 0) showToast(`${restam} registro(s) ainda não foram enviados e continuam guardados no aparelho.`, "aviso");
          else showToast("Tudo sincronizado.");
        } catch { showToast("Não foi possível sincronizar agora. Os registros continuam guardados no aparelho.", "erro"); }
      })();
    }
    function aoFicarOffline() { setOnline(false); }
    const aoVoltar = () => { if (document.visibilityState === "visible" && navigator.onLine) aoFicarOnline(); };
    window.addEventListener("online", aoFicarOnline);
    window.addEventListener("offline", aoFicarOffline);
    window.addEventListener("condor-sincronizar-fila", aoFicarOnline);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { window.removeEventListener("online", aoFicarOnline); window.removeEventListener("offline", aoFicarOffline); window.removeEventListener("condor-sincronizar-fila", aoFicarOnline); document.removeEventListener("visibilitychange", aoVoltar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ao entrar (ou trocar de conta) com internet: descarta ações sem dono/vencidas e envia as da pessoa
  useEffect(() => {
    if (!sessao?.user?.id || !dadosProntos) return;
    const descartadas = limparFilaOrfa();
    if (descartadas > 0) showToast(`${descartadas} ação(ões) antiga(s) guardada(s) sem dono foram descartadas por segurança. Confira e lance de novo se precisar.`, "aviso");
    if (navigator.onLine) { try { window.dispatchEvent(new CustomEvent("condor-sincronizar-fila")); } catch { /* sem janela */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.user?.id, dadosProntos]);

  // mantém um instantâneo local sempre atualizado pra abrir o app offline com os últimos dados
  useEffect(() => {
    if (!loading && sessaoRef.current) saveLocal(SNAPSHOT_KEY, { uid: sessaoRef.current, cat: catalog, its: items, hist: historico });
  }, [catalog, items, historico, loading]);

  // ---------- Sistema de avisos: modalzinho de comunicado geral (demo — por enquanto pra todo mundo) ----------
  const AVISOS_VISTOS_KEY = "avdc_avisos_vistos";
  const [filaAvisos, setFilaAvisos] = useState([]);
  const avisoAtual = filaAvisos[0] || null;
  // Um aviso só aparece pra mim se for "todos", ou for pro meu setor, ou eu estiver na lista de
  // matrículas alvo — antes disso, todo aviso ia pra todo mundo, mesmo quando tinha alvo definido.
  function avisoAplicaPraMim(aviso) {
    if (aviso.lojaId != null && LOJA_ID_ATIVA != null && aviso.lojaId !== LOJA_ID_ATIVA) return false;
    if (aviso.alvoTipo === "setor") return !!perfil?.setor && aviso.alvoSetor === perfil.setor;
    if (aviso.alvoTipo === "usuarios") return Array.isArray(aviso.alvoUsuarios) && perfil?.matricula && aviso.alvoUsuarios.includes(perfil.matricula);
    return true;
  }
  function marcarAvisoVisto(id) {
    const vistos = loadLocal(AVISOS_VISTOS_KEY, []);
    const atualizado = [...vistos, id].slice(-100);
    saveLocal(AVISOS_VISTOS_KEY, atualizado);
    setFilaAvisos((prev) => prev.filter((a) => a.id !== id));
  }
  useEffect(() => {
    if (loading) return;
    const vistos = loadLocal(AVISOS_VISTOS_KEY, []);
    supaFetchAvisosRecentes().then((lista) => {
      const naoVistos = lista.filter((a) => !vistos.includes(a.id) && avisoAplicaPraMim(a)).reverse(); // mais antigo primeiro na fila
      if (naoVistos.length) setFilaAvisos((prev) => [...prev, ...naoVistos]);
    });
    const canalAvisos = supabase
      .channel("realtime-avisos")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "avisos" }, (payload) => {
        const novo = avisoFromRow(payload.new);
        const vistosAgora = loadLocal(AVISOS_VISTOS_KEY, []);
        if (!vistosAgora.includes(novo.id) && avisoAplicaPraMim(novo)) setFilaAvisos((prev) => [...prev, novo]);
      })
      .subscribe();
    return () => supabase.removeChannel(canalAvisos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, perfil?.setor, perfil?.matricula]);

  // Item 1 (painel corporativo): envia um resumo desta loja pra tabela compartilhada da rede — na entrada e a cada 15 min
  const dadosGerenciais = usarDadosGerenciais(items, historico);
  useEffect(() => {
    const lojaNumero = perfil?.lojas?.numero_loja;
    if (!lojaNumero) return;
    function enviarResumo() {
      const hoje = new Date().toISOString().slice(0, 10);
      const rondasHoje = rondas.filter((r) => r.iniciadoEm && r.iniciadoEm.slice(0, 10) === hoje);
      const setoresComRondaHoje = new Set(rondasHoje.filter((r) => r.status === "concluida").map((r) => r.setor));
      const todosSetores = Array.from(new Set(items.map((i) => i.setor)));
      supaEnviarResumoRede({
        lojaNumero, lojaNome: perfil?.lojas?.nome || null,
        valorEmRisco: dadosGerenciais.valorEmRisco, criticos: dadosGerenciais.criticos.length, atencao: dadosGerenciais.atencao.length,
        perdaMes: dadosGerenciais.tendenciaPerdas.atual, perdaMesAnterior: dadosGerenciais.tendenciaPerdas.anterior,
        rondasFeitasHoje: rondasHoje.filter((r) => r.status === "concluida").length,
        rondasPendentesHoje: rondasHoje.filter((r) => r.status !== "concluida").length,
        setoresSemRondaHoje: todosSetores.filter((s) => !setoresComRondaHoje.has(s))
      });
    }
    enviarResumo();
    const intervalo = setInterval(enviarResumo, 15 * 60 * 1000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, historico, rondas, perfil?.lojas?.numero_loja]);


  const [mostrarAtualizacao, setMostrarAtualizacao] = useState(false);
  // Aviso "tem versão nova, quer atualizar agora?" — dispara na hora (via sw.js comparando o index.html),
  // sem depender do service worker mudar de bytes (que é o que travava antes quando só o App.tsx mudava).
  const [novaVersao, setNovaVersao] = useState(null); // { html, assets, assinatura } quando há versão publicada diferente da que está rodando
  const [versaoDispensada, setVersaoDispensada] = useState(null);
  const [estadoAtualizacao, setEstadoAtualizacao] = useState("idle"); // idle | baixando
  const [progressoAtualizacao, setProgressoAtualizacao] = useState(0);
  const [erroAtualizacao, setErroAtualizacao] = useState(false);
  const baixandoRef = useRef(false); // trava de toque duplo e de polling durante o download
  useEffect(() => {
    // Depois de atualizar (ou ao abrir com uma versão que a pessoa ainda não viu), mostra a lista de novidades.
    const veioDeAtualizacao = sessionStorage.getItem("avdc_acabou_de_atualizar") === "1";
    sessionStorage.removeItem("avdc_acabou_de_atualizar");
    const vista = lerNovidadeVista();
    if (veioDeAtualizacao || (vista && vista !== NOVIDADES[0].id)) setMostrarAtualizacao(true);
    else if (!vista) gravarNovidadeVista(NOVIDADES[0].id); // primeira vez no aparelho: nada a mostrar
    // Checagem "em tempo real": ao abrir, ao voltar pro app/aba, ao reconectar e a cada 20 s com o app aberto.
    let ativo = true;
    async function checar() {
      if (!navigator.onLine || document.visibilityState === "hidden" || baixandoRef.current) return;
      try { const v = await buscarVersaoPublicada(); if (ativo) setNovaVersao((atual) => (v ? (atual?.assinatura === v.assinatura ? atual : v) : null)); } catch {}
    }
    checar();
    const intervalo = setInterval(checar, 20000);
    document.addEventListener("visibilitychange", checar);
    window.addEventListener("focus", checar);
    window.addEventListener("online", checar);
    // O service worker em si (push, cache) também se mantém em dia — sem recarregar a tela por conta própria.
    if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update().catch(() => {}));
    return () => { ativo = false; clearInterval(intervalo); document.removeEventListener("visibilitychange", checar); window.removeEventListener("focus", checar); window.removeEventListener("online", checar); };
  }, []);
  async function aplicarAtualizacao() {
    if (!novaVersao || baixandoRef.current) return;
    baixandoRef.current = true;
    setErroAtualizacao(false); setProgressoAtualizacao(0); setEstadoAtualizacao("baixando");
    try {
      // Várias publicações seguidas viram UMA atualização só: pega sempre a versão mais nova no momento do toque
      // e, depois de baixar, confere se saiu outra no meio do caminho (até 3 voltas) antes de reiniciar.
      let alvo = novaVersao;
      try {
        const mais = await buscarVersaoPublicada();
        if (!mais) { // a publicada voltou a ser a que está rodando (rollback): nada a instalar
          baixandoRef.current = false; setEstadoAtualizacao("idle"); setNovaVersao(null); return;
        }
        alvo = mais;
      } catch { /* sem resposta agora: tenta com a que já tinha */ }
      for (let volta = 0; volta < 3; volta++) {
        try {
          await baixarVersaoNova(alvo, (p) => setProgressoAtualizacao((a) => Math.max(a, Math.min(p, 0.97))));
        } catch (e) {
          if (volta === 0) throw e; // 1ª volta falhou: nada foi trocado, mostra "Tentar de novo"
          break; // volta extra falhou: a anterior já está instalada por inteiro; reinicia com ela (o polling oferece a mais nova depois)
        }
        let outra = null;
        try { outra = await buscarVersaoPublicada(); } catch { /* sem internet agora: reinicia com o que baixou */ }
        if (!outra || outra.assinatura === alvo.assinatura) break;
        alvo = outra; // na 3ª volta isto não é baixado: reinicia na última baixada e o polling oferece a mais nova
      }
      setProgressoAtualizacao(1);
      sessionStorage.setItem("avdc_acabou_de_atualizar", "1");
      setTimeout(() => window.location.reload(), 700);
      // se o sistema ignorar o reinício, não deixa a tela presa em "Reiniciando": volta o botão
      setTimeout(() => { baixandoRef.current = false; setEstadoAtualizacao("idle"); setErroAtualizacao(true); }, 8000);
    } catch (e) {
      console.error(e);
      baixandoRef.current = false;
      setEstadoAtualizacao("idle"); setErroAtualizacao(true);
    }
  }
  // Tutorial do Bipi: abre sozinho uma vez por pessoa neste aparelho (depois do aceite e de avisos/novidades); "Ver de novo" em Mais → Sobre
  const [tutorialAberto, setTutorialAberto] = useState(false);
  useEffect(() => {
    const abrir = () => setTutorialAberto(true);
    window.addEventListener("condor-abrir-tutorial", abrir);
    return () => window.removeEventListener("condor-abrir-tutorial", abrir);
  }, []);
  const novidadesDoCargo = useMemo(() => (mostrarAtualizacao ? novidadesParaCargo(perfil?.cargos?.nivel, lerNovidadeVista()) : []), [mostrarAtualizacao, perfil?.cargos?.nivel]);
  const uidTutorial = sessao?.user?.id;
  const outroModal = !!avisoAtual || (mostrarAtualizacao && novidadesDoCargo.length > 0);
  useEffect(() => {
    if (!uidTutorial || !perfil || aceiteOk !== true || !dadosProntos || outroModal || flow !== null || tab !== "home" || tutorialJaVisto(uidTutorial)) return undefined;
    const t = setTimeout(() => setTutorialAberto(true), 900);
    return () => clearTimeout(t);
  }, [uidTutorial, perfil, aceiteOk, dadosProntos, outroModal, flow, tab]);
  const etapasTutorial = useMemo(() => etapasDoTutorial({ nivel: perfil?.cargos?.nivel, promotor: !!perfil?.promotor, pc: ehDesktop }), [perfil?.cargos?.nivel, perfil?.promotor, ehDesktop]);
  useEffect(() => { if (mostrarAtualizacao && perfil && novidadesDoCargo.length === 0) { gravarNovidadeVista(NOVIDADES[0].id); setMostrarAtualizacao(false); } }, [mostrarAtualizacao, perfil, novidadesDoCargo.length]);
  // Chamado pelo login/cadastro antes de enviar a senha: confere na hora se existe versão nova e, se existir, trava a entrada.
  async function antesDeEntrarNoApp() {
    try {
      const v = await buscarVersaoPublicada();
      if (v) { setNovaVersao((atual) => atual || v); return true; }
    } catch { /* sem internet: o próprio login vai falhar */ }
    return !!novaVersao;
  }
  const mostrarBannerVersao = !!novaVersao && (estadoAtualizacao === "baixando" || versaoDispensada !== novaVersao.assinatura);
  // O aviso de versão nova também aparece nas telas de carregamento, login e erro (antes só aparecia logado,
  // então quem estava deslogado ficava preso na versão antiga até limpar o cache).
  const comBanner = (tela) => (
    <>
      {tela}
      {!!novaVersao && <NovaVersaoBanner solto T={T} estado={estadoAtualizacao} progresso={progressoAtualizacao} erro={erroAtualizacao} onAtualizar={aplicarAtualizacao} onFechar={() => setVersaoDispensada(novaVersao?.assinatura)} />}
    </>
  );

  // ---------- Deep link: abrir o app direto no produto quando vem de uma notificação ----------
  useEffect(() => {
    if (loading || !items.length) return;
    const params = new URLSearchParams(window.location.search);
    const produtoId = params.get("produto");
    if (!produtoId) return;
    const alvo = items.find((i) => String(i.id) === String(produtoId));
    if (alvo) {
      setDetalheItem(alvo);
      setTab("home");
    }
    params.delete("produto");
    const novaUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
    window.history.replaceState({}, "", novaUrl);
  }, [loading, items]);

  // Fallback pra navegadores (iOS/Safari) onde o service worker não consegue navegar
  // a aba já aberta sozinho: ele manda uma mensagem e o app abre o produto na mão.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function aoReceberMensagem(event) {
      if (event.data && event.data.type === "abrirProduto" && event.data.produtoId) {
        const alvo = items.find((i) => String(i.id) === String(event.data.produtoId));
        if (alvo) { setDetalheItem(alvo); setTab("home"); }
      }
    }
    navigator.serviceWorker.addEventListener("message", aoReceberMensagem);
    return () => navigator.serviceWorker.removeEventListener("message", aoReceberMensagem);
  }, [items]);

  // sincronização em tempo real: mudanças feitas por qualquer colega aparecem instantaneamente
  useEffect(() => {
    if (loading || !sessao?.user?.id) return;
    const canalProdutos = supabase
      .channel("realtime-produtos")
      .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setItems((prev) => prev.filter((i) => i.id !== payload.old.id));
        } else {
          const novo = produtoFromRow(payload.new);
          setItems((prev) => (prev.some((i) => i.id === novo.id) ? prev.map((i) => (i.id === novo.id ? novo : i)) : [...prev, novo]));
        }
      })
      .subscribe();
    const canalHistorico = supabase
      .channel("realtime-historico")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "historico" }, (payload) => {
        setHistorico((prev) => (prev.some((h) => h.id === payload.new.id) ? prev : [historicoFromRow(payload.new), ...prev]));
      })
      .subscribe();
    return () => { supabase.removeChannel(canalProdutos); supabase.removeChannel(canalHistorico); };
  }, [loading, sessao?.user?.id]);

  // Tempo real para o resto dos dados da loja: qualquer mudança no banco (app de outro colega, painel do Supabase,
  // SQL) recarrega só a parte afetada, com um pequeno atraso pra juntar várias mudanças seguidas.
  useEffect(() => {
    if (loading || !lojaAtiva?.id) return;
    const temporizadores = {};
    const recarregar = (chave, fn) => { clearTimeout(temporizadores[chave]); temporizadores[chave] = setTimeout(() => { fn(); }, 600); };
    const alvos = [
      ["rondas", () => supaFetchRondas().then(setRondas)],
      ["auditoria", () => supaFetchAuditoria().then(setAuditoria)],
      ["setores_customizados", () => supaFetchSetoresCustomizados().then(setSetoresExtra)],
      ["subsetores_customizados", () => supaFetchSubsetoresCustomizados().then(setSubsetoresExtra)],
      ["catalogo", () => supaFetchCatalogo().then(setCatalog)],
    ];
    let canal = supabase.channel("realtime-dados-loja");
    alvos.forEach(([tabela, fn]) => { canal = canal.on("postgres_changes", { event: "*", schema: "public", table: tabela }, () => recarregar(tabela, fn)); });
    canal.subscribe();
    return () => { Object.values(temporizadores).forEach(clearTimeout); supabase.removeChannel(canal); };
  }, [loading, lojaAtiva?.id]);

  useEffect(() => { if (!loading) saveLocal(PREFS_KEY, prefs); }, [prefs, loading]);

  useEffect(() => {
    if (loading || notifPermission !== "granted") return;
    (async () => {
      const notified = loadLocal(NOTIF_KEY, []);
      const novas = [];
      for (const it of items) {
        const st = getStatus(it);
        // chave por item+nível: assim um produto notificado ao entrar na janela de 15 dias
        // recebe um novo aviso quando de fato vence, em vez de ficar mudo pro resto da vida.
        const chave = `${it.id}:${st.level}`;
        if (precisaNotificar(it) && !notified.includes(chave)) {
          const desconto = sugestaoDesconto(st.d, it.precoUnitario);
          const corpoLinhas = [
            st.level === "expired" ? "Produto vencido — retire de venda e registre a baixa." : `Vence em ${st.d} dia(s) · Setor ${it.setor}`,
            desconto ? `💡 Sugestão: ${desconto.pct}% OFF (${desconto.label})` : null
          ].filter(Boolean);
          await dispararNotificacao(`⚠️ ${it.nome}`, {
            corpo: corpoLinhas.join("\n"),
            imagem: it.foto || null,
            tag: `produto-${it.id}`,
            dados: { itemId: it.id, url: `/?produto=${it.id}` }
          });
          novas.push(chave);
        }
      }
      if (novas.length) saveLocal(NOTIF_KEY, [...notified, ...novas]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loading, notifPermission]);

  const toastTimerRef = useRef(null);
  const toastIdRef = useRef(0);
  const showToast = useCallback((msg, tone) => {
    const tom = classificarTom(msg, tone);
    toastIdRef.current += 1;
    setToast({ msg, tone: tom, id: toastIdRef.current });
    clearTimeout(toastTimerRef.current); // o aviso novo não pode ser apagado pelo tempo do anterior
    toastTimerRef.current = setTimeout(() => setToast(null), duracaoAviso(msg, tom));
  }, []);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);
  // Aprovação de produto novo (Telegram): encarregado+ é avisado NA HORA quando chega pedido (tempo real) e vê quantos faltam em Mais
  const [aprovPendentes, setAprovPendentes] = useState(0);
  const idLojaAprov = perfil?.loja_id;
  useEffect(() => {
    if (!ehEncarregado || !idDoUsuario) { setAprovPendentes(0); return; }
    let vivo = true;
    const contar = async () => {
      const { count, error } = await supabase.from("aprovacoes_produto").select("id", { count: "exact", head: true }).eq("status", "pendente");
      if (vivo && !error) setAprovPendentes(count || 0);
    };
    contar();
    const ch = supabase.channel("aprov_aviso_" + (idLojaAprov ?? "x")).on("postgres_changes", { event: "*", schema: "public", table: "aprovacoes_produto" }, (p) => {
      contar();
      if (p.eventType === "INSERT" && p.new?.status === "pendente") {
        const nome = String(p.new.nome || "Produto novo").slice(0, 60);
        showToast(`Novo produto aguardando sua aprovação: ${nome}`, "info");
        dispararNotificacao("Produto novo para aprovar", { corpo: `${nome} · lançado por ${String(p.new.solicitante || "alguém").slice(0, 40)} pelo Telegram`, tag: "aprovacao-" + p.new.id });
      }
    }).subscribe();
    const t = setInterval(contar, 60000);
    const volta = () => { if (document.visibilityState === "visible") contar(); };
    document.addEventListener("visibilitychange", volta); window.addEventListener("focus", contar); window.addEventListener("online", contar);
    return () => { vivo = false; clearInterval(t); supabase.removeChannel(ch); document.removeEventListener("visibilitychange", volta); window.removeEventListener("focus", contar); window.removeEventListener("online", contar); };
  }, [ehEncarregado, idDoUsuario, idLojaAprov, showToast]);

  // Ação com "desfazer" de 5s: a mudança já aparece na tela na hora, mas só grava de verdade
  // no Supabase depois desse tempo (a não ser que a pessoa cancele antes).
  const desfazerTimeoutRef = useRef(null);
  function agendarComDesfazer(mensagem, onDesfazer, onConfirmar) {
    if (desfazerTimeoutRef.current) { clearTimeout(desfazerTimeoutRef.current.timeoutId); desfazerTimeoutRef.current.onConfirmar(); }
    const id = Date.now();
    desfazerTimeoutRef.current = { id, onConfirmar, timeoutId: setTimeout(() => {
      setDesfazer((d) => (d && d.id === id ? null : d));
      desfazerTimeoutRef.current = null;
      onConfirmar();
    }, DESFAZER_MS) };
    setDesfazer({ id, mensagem, onDesfazer: () => {
      clearTimeout(desfazerTimeoutRef.current.timeoutId);
      desfazerTimeoutRef.current = null;
      setDesfazer(null);
      onDesfazer();
    } });
  }

  // grava no Supabase E atualiza a lista local na hora, pra Torre de Controle mostrar sem precisar recarregar
  function logAuditoria(usuarioAtual, acao, detalhe, barcode) {
    registrarAuditoria(usuarioAtual, acao, detalhe, barcode);
    setAuditoria((prev) => [{ id: `temp-${Date.now()}`, criadoEm: new Date().toISOString(), usuario: usuarioAtual, acao, detalhe, barcode }, ...prev].slice(0, 40));
  }

  async function toggleNotificacoes() {
    if (typeof Notification === "undefined") { showToast("Seu navegador não suporta notificações.", "warn"); return; }
    if (isIOS() && !isStandalone()) {
      showToast("No iPhone, adicione o app à Tela de Início primeiro (Compartilhar → Adicionar à Tela de Início) para poder ativar notificações.", "warn");
      return;
    }
    if (notifPermission === "granted") { showToast("As notificações já estão ativas."); return; }
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === "granted") await inscreverPush(usuario);
    showToast(perm === "granted" ? "Notificações ativadas — você vai receber avisos mesmo com o app fechado." : "Permissão não concedida.", perm === "granted" ? "ok" : "warn");
  }

  function handleBarcodeCaptured(codeRaw) {
    const clean = apenasNumeros(codeRaw, 14);
    if (clean.length < 4) {
      showToast("Código lido muito curto. Tente novamente ou digite manualmente.", "warn");
      return;
    }
    playBeep(prefs.som);

    // Item 8: código de balança (peso/preço embutido) — cada pesagem gera um código FINAL diferente,
    // então o cadastro é feito por um "código-base" (5 dígitos do meio), compartilhado entre todas as
    // pesagens do mesmo produto, mesmo que o código completo escaneado nunca se repita.
    const balanca = parseCodigoBalanca(clean, configBalanca);
    if (balanca) {
      setPendingBarcode(clean);
      const chaveCatalogo = `bal:${balanca.codigoBase}`;
      const known = catalog[chaveCatalogo];
      const extraBalanca = { porPeso: true, pesoLido: balanca.pesoKg, precoLidoEmbutido: balanca.precoEmbutido, codigoBaseBalanca: balanca.codigoBase };
      if (known) {
        setDraftProduct({ ...known, ...extraBalanca });
        setIntencaoFluxo("validade");
        setFlow("confirm");
      } else if (intencaoFluxo === "cadastro") {
        setDraftProduct({ nome: "", setor: draftProduct.setor || "", foto: null, ...extraBalanca });
        setFlow("confirm");
      } else {
        setDraftProduct({ nome: "", setor: "", foto: null, ...extraBalanca });
        setEscolhaAberta(true);
      }
      return;
    }

    const known = catalog[clean];
    if (!known && !eanValido(clean)) {
      showToast(`Código de barras inválido (${clean.length} dígitos): precisa ser EAN-8 (8), UPC-A (12) ou EAN-13 (13), com o último dígito de verificação certo. Confira e tente de novo.`, "warn");
      return;
    }
    setPendingBarcode(clean);
    if (known) {
      setDraftProduct({ ...known });
      setIntencaoFluxo("validade");
      setFlow("confirm");
    } else if (intencaoFluxo === "cadastro") {
      // usuário já veio pelo botão "+ Cadastrar produto": não precisa perguntar de novo
      setDraftProduct({ nome: "", setor: draftProduct.setor || "", foto: null });
      setFlow("confirm");
    } else {
      setDraftProduct({ nome: "", setor: "", foto: null });
      setEscolhaAberta(true); // produto novo: pergunta se é só cadastro ou já lança validade
    }
  }

  function escolherIntencao(intencao) {
    setEscolhaAberta(false);
    setIntencaoFluxo(intencao);
    setFlow("confirm");
  }

  // Item: leitor coletor (USB/Bluetooth, ex: MOVFAST a laser) — funciona em qualquer tela do app.
  // Esse tipo de coletor normalmente funciona como "teclado" (modo HID/keyboard wedge): ao apertar o
  // gatilho, ele "digita" o código rapidamente. Mantemos DOIS mecanismos pra cobrir aparelhos diferentes:
  // 1) um listener de teclado na janela (cobre o modo HID/keyboard wedge "de verdade");
  // 2) um campo de texto invisível sempre focado, que recebe QUALQUER tipo de entrada (inclusive via
  //    IME/composição), lido pelo onChange — cobre aparelhos que não geram keydown real.
  // Fica desligado só na tela de câmera (flow === "scan"), que já tem sua própria detecção.
  const coletorBufferRef = useRef("");
  const coletorTimeoutRef = useRef(null);
  const coletorInputRef = useRef(null);

  function confirmarLeituraColetor(codigo) {
    clearTimeout(coletorTimeoutRef.current);
    coletorBufferRef.current = "";
    if (coletorInputRef.current) coletorInputRef.current.value = "";
    if (codigo.length >= 4) handleBarcodeCaptured(codigo);
  }

  useEffect(() => {
    if (flow === "scan") return;
    function aoTeclar(e) {
      const alvo = e.target;
      // não intercepta se o usuário estiver digitando de verdade em algum campo (ex: busca) —
      // exceto o próprio campo-armadilha do coletor, que deve continuar funcionando
      if (alvo && ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) && alvo !== coletorInputRef.current) return;

      if (e.key === "Enter" || e.key === "Tab") {
        if (coletorBufferRef.current.length >= 4) {
          e.preventDefault();
          confirmarLeituraColetor(coletorBufferRef.current);
        }
        return;
      }
      if (e.key.length === 1 && /[0-9]/.test(e.key)) {
        coletorBufferRef.current = (coletorBufferRef.current + e.key).slice(0, 14);
        clearTimeout(coletorTimeoutRef.current);
        // coletor digita bem mais rápido que uma pessoa; uma pausa curta indica que a leitura
        // terminou (útil pros modelos/configurações que não mandam Enter no final)
        coletorTimeoutRef.current = setTimeout(() => {
          if (coletorBufferRef.current.length >= 6) confirmarLeituraColetor(coletorBufferRef.current);
          else coletorBufferRef.current = "";
        }, 150);
      }
    }
    window.addEventListener("keydown", aoTeclar);

    // Campo-armadilha: mantém foco nele enquanto o usuário não estiver usando outro campo de propósito
    // (ex: a busca), pra captar leituras que chegam via IME/composição em vez de keydown real.
    function manterFoco() {
      const ativo = document.activeElement;
      const usandoOutroCampo = ativo && ["INPUT", "TEXTAREA", "SELECT"].includes(ativo.tagName) && ativo !== coletorInputRef.current;
      if (!usandoOutroCampo && coletorInputRef.current && document.activeElement !== coletorInputRef.current) {
        coletorInputRef.current.focus({ preventScroll: true });
      }
    }
    manterFoco();
    const intervaloFoco = setInterval(manterFoco, 600);
    document.addEventListener("visibilitychange", manterFoco);

    return () => {
      window.removeEventListener("keydown", aoTeclar);
      clearInterval(intervaloFoco);
      document.removeEventListener("visibilitychange", manterFoco);
      clearTimeout(coletorTimeoutRef.current);
    };
  }, [flow]);

  function aoMudarCampoColetor(e) {
    const valor = apenasNumeros(e.target.value, 14);
    coletorBufferRef.current = valor;
    clearTimeout(coletorTimeoutRef.current);
    if (valor.length >= 14) { confirmarLeituraColetor(valor); return; }
    coletorTimeoutRef.current = setTimeout(() => {
      if (coletorBufferRef.current.length >= 6) confirmarLeituraColetor(coletorBufferRef.current);
    }, 180);
  }

  // Item 8: itens de balança compartilham o cadastro pelo "código-base", não pelo código completo escaneado
  // (que muda a cada pesagem) — assim uma pesagem nova do mesmo produto já vem com nome/setor preenchidos.
  function chaveCatalogo(barcode, dados) {
    return dados?.codigoBaseBalanca ? `bal:${dados.codigoBaseBalanca}` : barcode;
  }

  function confirmProductAndContinue(finalProduct) {
    const chave = chaveCatalogo(pendingBarcode, finalProduct);
    setCatalog((prev) => ({ ...prev, [chave]: { ...finalProduct } }));
    gravarCatalogo(chave, finalProduct);
    setDraftProduct(finalProduct);
    setFlow("expiry");
  }

  // Cadastra o produto no catálogo (nome, setor, localização, etc) sem exigir validade agora —
  // fica disponível pra qualquer um ver na aba Setores e lançar a validade depois.
  function salvarCadastroSemValidade(finalProduct) {
    const chave = chaveCatalogo(pendingBarcode, finalProduct);
    const catalogoAnterior = catalog[chave];
    setCatalog((prev) => ({ ...prev, [chave]: { ...finalProduct } }));
    resetFlow();
    agendarComDesfazer(`"${finalProduct.nome}" cadastrado.`, () => {
      setCatalog((prev) => {
        const novo = { ...prev };
        if (catalogoAnterior) novo[chave] = catalogoAnterior; else delete novo[chave];
        return novo;
      });
      showToast("Cadastro desfeito.");
    }, () => {
      gravarCatalogo(chave, finalProduct);
      logAuditoria(usuario, "cadastrou produto (sem validade)", finalProduct.nome, pendingBarcode);
    });
  }

  async function notificarSeNecessarioAgora(item) {
    const st = getStatus(item);
    if (!precisaNotificar(item)) return;
    if (notifPermission !== "granted") return;
    const notified = loadLocal(NOTIF_KEY, []);
    if (notified.includes(item.id)) return;
    const desconto = sugestaoDesconto(st.d, item.precoUnitario);
    const corpoLinhas = [
      st.level === "expired" ? "Produto vencido — retire de venda e registre a baixa." : `Vence em ${st.d} dia(s) · Setor ${item.setor}`,
      desconto ? `💡 Sugestão: ${desconto.pct}% OFF (${desconto.label})` : null
    ].filter(Boolean);
    await dispararNotificacao(`⚠️ ${item.nome}`, { corpo: corpoLinhas.join("\n"), imagem: item.foto || null, tag: `produto-${item.id}`, dados: { itemId: item.id, url: `/?produto=${item.id}` } });
    saveLocal(NOTIF_KEY, [...notified, item.id]);
  }

  function saveAlertItem(dados) {
    if (dados.somarAoLoteId) {
      const orig = items.find((it) => it.id === dados.somarAoLoteId);
      if (!orig) { showToast("Lote não encontrado.", "erro"); return; }
      if (orig.pedidoTipo) { showToast("Não foi possível somar: esse lote tem pedido de promoção ou preço direto e está travado. O encarregado do setor precisa remover o pedido antes.", "erro"); return; }
      if (!podeEditarProduto(orig)) { showToast("Esse lote foi lançado por outra pessoa: peça ao encarregado do setor para somar.", "warn"); return; }
      const add = Math.round(Number(dados.quantidade) || 0);
      if (add < 1 || add > limiteSomaLote(orig.quantidade)) { showToast(`Só dá para somar até ${limiteSomaLote(orig.quantidade)} un de uma vez.`, "warn"); return; }
      const novoItem = { ...orig, quantidade: orig.quantidade + add, atualizadoPor: usuario || null };
      setItems((prev) => prev.map((it) => (it.id === orig.id ? novoItem : it)));
      // A soma é feita no SERVIDOR (teto, trava de linha e auditoria); se ele recusar, a tela volta ao valor real
      supabase.rpc("somar_ao_lote", { p_id: orig.id, p_qtd: add }).then(({ error }) => {
        if (!error) return;
        setItems((prev) => prev.map((it) => (it.id === orig.id && it.quantidade === orig.quantidade + add ? { ...it, quantidade: orig.quantidade } : it))); // a soma não foi gravada: volta ao número de antes (só se a tela ainda mostra o otimista)
        if (erroDeRede(error)) window.dispatchEvent(new CustomEvent("condor-erro-gravacao", { detail: { mensagem: "Sem internet: a soma ao lote não foi enviada. Tente de novo quando a conexão voltar." } }));
        else avisarErroGravacao(error, "a soma ao lote");
      });
      showToast(`Somado ao lote ${orig.lote}: agora ${novoItem.quantidade} un.`, "ok");
      resetFlow();
      return;
    }
    if (editingItemId) {
      const original = items.find((it) => it.id === editingItemId);
      const novoItem = { ...original, ...draftProduct, ...dados, ...(((dados.validade ?? draftProduct.validade ?? original.validade) === original.validade) ? { pedidoTipo: original.pedidoTipo || null, pedidoCampanha: original.pedidoCampanha || null, pedidoValor: original.pedidoValor ?? null, pedidoEm: original.pedidoEm || null, pedidoPor: original.pedidoPor || null } : { pedidoTipo: null, pedidoCampanha: null, pedidoValor: null, pedidoEm: null, pedidoPor: null }), atualizadoPor: usuario || null };
      setItems((prev) => prev.map((it) => (it.id === editingItemId ? novoItem : it)));
      gravarProduto(novoItem);
      logAuditoria(usuario, "editou produto", novoItem.nome, novoItem.barcode);
      if (original.validade && novoItem.validade && original.validade !== novoItem.validade) {
        supaRegistrarAlteracaoValidade({
          barcode: novoItem.barcode, nome: novoItem.nome, setor: novoItem.setor,
          validadeAnterior: original.validade, validadeNova: novoItem.validade, usuario
        });
      }
      showToast("Alerta atualizado.");
      notificarSeNecessarioAgora(novoItem);
    } else {
      const novo = { id: `${pendingBarcode}-${Date.now()}`, barcode: pendingBarcode, ...draftProduct, ...dados, criadoEm: new Date().toISOString(), cadastradoPor: usuario || null, lancadoPorId: idDoUsuario };
      setItems((prev) => [...prev, novo]);
      gravarProduto(novo);
      logAuditoria(usuario, "cadastrou produto", novo.nome, novo.barcode);
      showToast("Produto salvo com sucesso.");
      notificarSeNecessarioAgora(novo);
    }
    resetFlow();
  }

  // Editar dados do produto (nome, setor, localização etc) SEM ser obrigado a passar pela tela de validade —
  // mantém a validade que já estava lançada. Corrige o bug de não conseguir salvar edição sem lançar validade.
  function salvarEdicaoSemAlterarValidade(dados) {
    if (!editingItemId) return;
    const original = items.find((it) => it.id === editingItemId);
    const idEditado = editingItemId;
    const novoItem = { ...original, ...dados, atualizadoPor: usuario || null };
    setItems((prev) => prev.map((it) => (it.id === idEditado ? novoItem : it)));
    resetFlow();
    agendarComDesfazer(`Alterações em "${novoItem.nome}" salvas.`, () => {
      setItems((prev) => prev.map((it) => (it.id === idEditado ? original : it)));
      showToast("Edição desfeita.");
    }, () => {
      gravarProduto(novoItem);
      logAuditoria(usuario, "editou produto", novoItem.nome, novoItem.barcode);
    });
  }

  function resetFlow() {
    setEditingItemId(null);
    setPendingBarcode(null);
    setDraftProduct({ nome: "", setor: "", foto: null });
    setIntencaoFluxo("validade");
    setVozPre(null);
    setFlow(null);
  }

  // Cadastro por voz: produto já cadastrado (achado pelo nome) vai direto pra validade; produto novo passa pela tela de dados.
  function aplicarVoz({ res, achado }) {
    if (validarVoz(res).length) { showToast("Dados da voz inválidos. Confira e tente de novo."); return; }
    setVozAberta(false);
    setEditingItemId(null);
    setVozPre({ validade: res.validade || "", quantidade: res.quantidade, porPeso: !!res.porPeso, lote: res.lote || "", semLote: !!res.semLote && !res.lote });
    const extraPreco = res.precoUnitario ? { precoUnitario: res.precoUnitario } : {};
    if (achado) {
      setPendingBarcode(achado.entrada.barcode || achado.chave);
      setDraftProduct({ ...achado.entrada, ...extraPreco });
      setIntencaoFluxo("validade");
      setFlow(res.validade ? "expiry" : "confirm");
    } else {
      setPendingBarcode("int:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)); // código interno ("int:"): ainda sem código de barras de verdade; o banco aceita sem EAN
      setDraftProduct({ nome: res.nome, setor: res.setorSugerido || "", foto: null, ...extraPreco });
      setIntencaoFluxo(res.validade ? "validade" : "cadastro");
      setFlow("confirm");
      showToast("Produto novo: complete setor e localização.", "aviso");
    }
  }

  function abrirCadastroDireto(setorPreDefinido) {
    setEditingItemId(null);
    setPendingBarcode(null);
    setDraftProduct({ nome: "", setor: setorPreDefinido || "", foto: null });
    setIntencaoFluxo("cadastro");
    setFlow("scan");
  }

  function criarSetorCustomizado(nome, perecivel) {
    const limpo = sanitizarTexto(nome.trim(), 40);
    if (!limpo) return;
    setSetoresExtra((prev) => (prev.some((s) => s.nome.toLowerCase() === limpo.toLowerCase()) ? prev : [...prev, { nome: limpo, perecivel: !!perecivel }]));
    supaCriarSetorCustomizado(limpo, perecivel);
    logAuditoria(usuario, "criou setor", limpo);
  }

  function criarSubsetorCustomizado(setor, nome) {
    const limpo = sanitizarTexto(nome.trim(), 40);
    if (!limpo || !setor) return;
    setSubsetoresExtra((prev) => (prev.some((s) => s.setor === setor && s.nome.toLowerCase() === limpo.toLowerCase()) ? prev : [...prev, { setor, nome: limpo }]));
    supaCriarSubsetorCustomizado(setor, limpo);
    logAuditoria(usuario, "criou subsetor", `${setor} → ${limpo}`);
  }

  function startEdit(item) {
    setDetalheItem(null);
    setEditingItemId(item.id);
    setPendingBarcode(item.barcode);
    setDraftProduct({ ...item });
    setIntencaoFluxo("validade");
    setFlow("confirm"); // passa pela tela de dados primeiro — assim dá pra trocar foto/setor também
  }

  function editarCadastroDoSetor(entradaCatalogo) {
    setDetalheItem(null);
    setEditingItemId(null);
    setPendingBarcode(entradaCatalogo.barcode);
    setDraftProduct({ ...entradaCatalogo });
    setIntencaoFluxo("cadastro");
    setFlow("confirm");
  }

  function duplicarItem(item) {
    setDetalheItem(null);
    setEditingItemId(null);
    setPendingBarcode(item.barcode);
    const { id: _idAntigo, lancadoPorId: _lp, cadastradoPor: _cp, atualizadoPor: _ap, criadoEm: _ce, pedidoTipo: _pt, pedidoCampanha: _pc, pedidoValor: _pv, pedidoEm: _pe, pedidoPor: _pp, ...copia } = item;
    setDraftProduct({ ...copia });
    setFlow("expiry");
  }

  // Item: lançar validade de um produto que já estava cadastrado no catálogo (sem validade ainda) —
  // passa primeiro pela tela de cadastro (onde dá pra completar/corrigir valor unitário etc) antes da validade.
  function lancarValidadeDoCadastro(entradaCatalogo) {
    setEditingItemId(null);
    setPendingBarcode(entradaCatalogo.barcode);
    setDraftProduct({ ...entradaCatalogo });
    setIntencaoFluxo("validade");
    setFlow("confirm");
  }

  function darBaixa(item, motivo, quantidadeOverride) {
    setDetalheItem(null);
    const st = getStatus(item);
    const quantidadeFinal = quantidadeOverride != null ? quantidadeOverride : item.quantidade;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const registro = { ...item, quantidade: quantidadeFinal, motivo, dataBaixa: new Date().toISOString(), registradoPor: usuario || null, vencidoAntes: st.level === "expired" };
    setHistorico((prev) => [registro, ...prev]);
    // baixa = uma RPC só: o servidor grava o histórico a partir do produto real e apaga o produto na mesma transação (funcionário não consegue apagar de outro jeito)
    gravarComFila("baixarProduto", { id: item.id, motivo, quantidade: quantidadeOverride != null ? quantidadeOverride : null, nome: item.nome }); // nome só serve para o aviso de erro (a RPC ignora)
    logAuditoria(usuario, `deu baixa (${motivo})`, item.nome, item.barcode);
    showToast(`Baixa registrada: ${motivo}${quantidadeOverride != null ? ` (${quantidadeOverride} un. remanescente da promoção)` : ""}.`, st.level === "expired" ? "warn" : "ok");
  }

  // Produto encontrado JÁ vencido (ou vencendo hoje): não faz sentido criar um alerta de validade pra ele,
  // então registra a perda direto no histórico/relatório do mês, sem passar pela lista de itens monitorados.
  function registrarBaixaDireta(extras) {
    const dadosProduto = { ...draftProduct };
    const barcode = pendingBarcode;
    const registro = {
      id: `baixa-${barcode}-${Date.now()}`, barcode, nome: dadosProduto.nome, setor: dadosProduto.setor, subsetor: dadosProduto.subsetor || null,
      foto: dadosProduto.foto || null, validade: extras.validade, quantidade: extras.quantidade, precoUnitario: extras.precoUnitario,
      porPeso: !!extras.porPeso, tamanho: extras.tamanho || null, unidadeMedida: extras.unidadeMedida || null, observacoes: extras.observacoes || null,
      motivo: extras.motivo, dataBaixa: new Date().toISOString(), registradoPor: usuario || null, vencidoAntes: true
    };
    setHistorico((prev) => [registro, ...prev]);
    gravarHistorico(registro);
    // mantém o catálogo atualizado (nome/foto/setor/local), pra próxima vez que bipar esse código já vir preenchido
    gravarCatalogo(chaveCatalogo(barcode, dadosProduto), {
      nome: dadosProduto.nome, setor: dadosProduto.setor, subsetor: dadosProduto.subsetor || null, foto: dadosProduto.foto || null,
      corredor: dadosProduto.corredor || null, ladoCorredor: dadosProduto.ladoCorredor || null, modulo: dadosProduto.modulo || null, prateleira: dadosProduto.prateleira || null,
      categoriaGiro: dadosProduto.categoriaGiro || null, politicaTroca: dadosProduto.politicaTroca || null, precoUnitario: extras.precoUnitario || null,
      codigoBaseBalanca: dadosProduto.codigoBaseBalanca || null
    });
    logAuditoria(usuario, `registrou perda direta (${extras.motivo})`, dadosProduto.nome, barcode);
    showToast("Perda registrada direto no relatório do mês.", "warn");
    resetFlow();
  }

  // Item 6: aplicar promoção não finaliza o produto — ele continua monitorado, só passa a carregar o preço promocional
  function aplicarPromocao(item, precoPromocional) {
    const novoItem = { ...item, emPromocao: true, precoPromocional, atualizadoPor: usuario || null };
    setItems((prev) => prev.map((i) => (i.id === item.id ? novoItem : i)));
    gravarProduto(novoItem);
    logAuditoria(usuario, "aplicou promoção", `${item.nome} → ${formatarMoeda(precoPromocional)}`, item.barcode);
    setDetalheItem(novoItem);
    showToast(`Promoção aplicada: ${formatarMoeda(precoPromocional)}. O produto continua sendo monitorado.`);
  }

  // Pedido de promoção / preço direto: só pela função do banco (permissão, auditoria e quem pediu ficam no servidor)
  async function registrarPedido(item, tipo, campanha, valor) {
    try {
      await supaRegistrarPedido(item.id, tipo, campanha, valor);
    } catch (e) {
      const motivo = erroDeRede(e) ? "sem internet agora, tente de novo" : /PGRST202|registrar_pedido_promocao/.test(String((e && e.message) || "") + (e && e.code)) ? "o banco ainda não foi atualizado para esse recurso" : mensagemErroGravacao(e);
      showToast(`Não foi possível registrar o pedido: ${motivo}.`, "erro");
      return false;
    }
    const camp = tipo ? (String(campanha || "").trim().toUpperCase() || null) : null;
    // mexe SÓ nos campos do pedido (o item aberto pode estar velho: quantidade/validade mudaram por outra pessoa)
    const campos = { pedidoTipo: tipo || null, pedidoCampanha: camp, pedidoValor: tipo ? Number(valor) : null, pedidoEm: tipo ? new Date().toISOString() : null, pedidoPor: tipo ? (usuario || null) : null };
    if (tipo) supabase.functions.invoke("telegram-avisar-pedido", { body: { id: item.id } }).catch(() => {}); // se o lote veio do Telegram, avisa lá quem lançou (o servidor decide)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...campos } : i)));
    setDetalheItem((d) => (d && d.id === item.id ? { ...d, ...campos } : d));
    const rotulo = (tipo || item.pedidoTipo) === "preco_direto" ? "preço direto" : "promoção";
    showToast(tipo ? `Pedido de ${rotulo} registrado${camp ? ` (campanha ${camp})` : ""}.` : `Pedido de ${rotulo} removido.`, "ok");
    return true;
  }

  // Excluir sem gerar histórico (ex: erro de cadastro grosseiro, duplicidade) — diferente de "dar baixa"
  function excluirProduto(item, motivo) {
    setDetalheItem(null);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    removerProduto(item.id, item.nome);
    logAuditoria(usuario, `excluiu produto (${motivo || "sem motivo informado"})`, item.nome, item.barcode);
    showToast("Produto excluído.", "warn");
  }

  // Ronda: criar é sempre pela aba Rondas (validação de cargo/setor no banco). Os botões de setor só abrem a tela já com o setor escolhido.
  function iniciarRonda(setor) { setRondaIntent({ novaSetor: setor ? setorPrincipal(setor) : null }); setSetorAtivo(null); setFlow(null); setTab("rondas"); }
  // abre "Nova ronda" já preenchida (vinda da Previsão, Prevenção de Perdas ou do Assistente IA) — o encarregado revisa e confirma
  function abrirRondaInteligente(cfg) {
    setRondaIntent({ novaSetor: cfg?.setor ? setorPrincipal(cfg.setor) : null, modo: cfg?.modo, quantidade: cfg?.quantidade, barcodes: cfg?.barcodes, acaoId: cfg?.acaoId, nome: cfg?.nome, obs: cfg?.obs });
    setSetorAtivo(null); setFlow(null); setTab("rondas");
  }

  const compartilhandoRef = useRef(false);
  async function compartilharItem(item) {
    if (compartilhandoRef.current) return;
    compartilhandoRef.current = true;
    const agora = new Date();
    const geradoEm = agora.toLocaleDateString("pt-BR") + " às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    let texto = `${item.nome}\nSetor: ${item.setor}\nCódigo: ${item.barcode}\nGerado em ${geradoEm}`;
    try {
      showToast("Gerando imagem…");
      const temVal = !!item.validade && /^\d{4}-\d{2}-\d{2}/.test(item.validade);
      const st = temVal ? getStatus(item) : { label: "SEM VALIDADE", d: null, level: "none" };
      const dias = st.d;
      const diasTxt = dias === null ? "" : dias < 0 ? `venceu há ${-dias} dia${-dias === 1 ? "" : "s"}` : dias === 0 ? "vence hoje" : `falta${dias === 1 ? "" : "m"} ${dias} dia${dias === 1 ? "" : "s"}`;
      const qtd = item.quantidade ? `${String(item.quantidade).replace(".", ",")} ${item.porPeso ? "kg" : "un"}` : "";
      const interno = /^(int|bal):/.test(String(item.barcode || ""));
      texto = `${item.nome}\nSetor: ${item.setor}${interno ? "" : `\nCódigo: ${item.barcode}`}${temVal ? `\nValidade: ${formatarData(item.validade)} (${st.label})` : ""}${textoLote(item) ? `\nLote: ${textoLote(item)}` : ""}\nGerado em ${geradoEm}`;
      const dados = {
        nome: item.nome, foto: item.foto, status: st.label,
        corStatus: { expired: "#B3141A", alert: "#E31E24", warning: "#E8A317", none: "#6B7C93" }[st.level] || "#1F9D55",
        corTextoStatus: st.level === "warning" ? "#2A1D00" : "#FFFFFF",
        linhas: [
          ["Validade", temVal ? `${formatarData(item.validade)}${diasTxt ? " · " + diasTxt : ""}` : "Sem validade"],
          ["Lote", textoLote(item) || ""],
          ["Quantidade", qtd],
          ["Setor", item.setor],
          ["Código", interno ? "" : item.barcode],
        ],
        geradoEm,
      };
      const blob = await gerarImagemProduto(dados);
      if (blob) {
        const arquivo = new File([blob], `validade-${String(item.barcode || "produto").replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || "produto"}.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
          try { await navigator.share({ files: [arquivo] }); return; } catch (e) { if (e && e.name === "AbortError") return; }
        }
        // sem compartilhamento de arquivo (computador) ou gesto expirado: baixa a imagem
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = arquivo.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        showToast("Imagem salva na pasta de downloads.");
        return;
      }
    } catch (e) { console.warn("compartilhar: falha ao gerar imagem", e); }
    finally { compartilhandoRef.current = false; }
    try { await navigator.clipboard.writeText(texto); showToast("Não deu para gerar a imagem; copiei as informações em texto.", "aviso"); }
    catch { showToast("Não foi possível compartilhar.", "warn"); }
  }

  if (loading) {
    return <TelaCarregando logo={LOGO_SRC} />;
  }

  // Sistema de login reativado: sessao === null → tela de entrar/cadastrar; sessao existe mas perfil
  // ainda não carregou → loading; sessao existe e perfil veio null → conta sem vínculo em "usuarios"
  // (não deveria acontecer no fluxo normal, mas cobre o caso de alguém logar sem nunca ter biper o crachá).
  if (conviteStatus === "resgatando") {
    return <TelaCarregando logo={LOGO_SRC} mensagem="Abrindo seu convite…" />;
  }
  if (conviteStatus?.erro) {
    return comBanner(
      <div style={{ background: getTokens(false).bg }} className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <img src={LOGO_SRC} alt="Condor" className="h-10 w-auto" />
        <Ticket size={28} color={RED} />
        <p className="text-sm font-semibold max-w-xs">{conviteStatus.erro}</p>
        <button onClick={() => setConviteStatus(null)} style={{ color: BLUE }} className="text-xs font-semibold">Ir para o login</button>
      </div>
    );
  }
  // Abriu o link "esqueci minha senha" com alguém já logado neste aparelho: não troca a conta sem perguntar.
  if (linkPendenteAtivo && sessao && !sessao.user?.is_anonymous) {
    const emailAtual = sessao.user?.email || "esta conta";
    const emailLink = emailDoLinkPendente();
    return (
      <div style={{ background: T.bg }} className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <img src={LOGO_SRC} alt="Condor" className="h-10 w-auto" />
        <Lock size={28} color={BLUE} />
        <p className="text-base font-extrabold max-w-xs">Você já está logado neste aparelho</p>
        <p className="text-sm max-w-xs" style={{ color: T.subtext }}>Conta atual: <strong>{emailAtual}</strong>.{emailLink ? <> O link do e-mail é da conta <strong>{emailLink}</strong>.</> : " O link do e-mail é de outra conta."} Se você usar o link, sai desta conta neste aparelho (seus lançamentos já salvos continuam salvos). O link só funciona uma vez.</p>
        <button type="button" disabled={trocandoConta} onClick={() => { descartarLinkPendente(); setLinkPendenteAtivo(false); }}
          style={{ background: BLUE }} className="w-full max-w-xs rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-60">Continuar como {emailAtual}</button>
        <button type="button" disabled={trocandoConta}
          onClick={async () => { setTrocandoConta(true); const ok = await usarLinkPendente(); setTrocandoConta(false); setLinkPendenteAtivo(false); if (ok) setRecuperandoSenha(true); else showToast("O link venceu ou já foi usado. Você continua na sua conta; peça outro e-mail se precisar.", "aviso"); }}
          style={{ color: BLUE }} className="text-sm font-semibold disabled:opacity-60">{trocandoConta ? "Abrindo…" : "Sair e criar a nova senha pelo link"}</button>
      </div>
    );
  }
  // Chegou pelo link de recuperação de senha: mostra "Nova senha / Confirmar" em vez de entrar direto na conta.
  if (recuperandoSenha && sessao) {
    return (
      <AuthScreen T={T} modoInicial="nova-senha" emailConta={sessao?.user?.email || ""} antesDeEntrar={antesDeEntrarNoApp}
        aoConcluir={(como) => { setRecuperandoSenha(false); setAvisoLink(false); limparRecuperacao(); if (como === "sair") supabase.auth.signOut().catch(() => {}); }} />
    );
  }
  if (sessao === null) {
    return (
      <>
        <div inert={novaVersao ? "" : undefined} aria-hidden={novaVersao ? true : undefined}>
          <AuthScreen T={T} antesDeEntrar={antesDeEntrarNoApp}
            erroInicial={avisoLink ? "O link do e-mail venceu ou já foi usado. Peça um novo em \"Esqueci minha senha\"." : ""} />
        </div>
        {!novaVersao && <AvisoArmazenamento />}
        {!!novaVersao && <AtualizacaoObrigatoria logo={LOGO_SRC} estado={estadoAtualizacao} progresso={progressoAtualizacao} erro={erroAtualizacao} onAtualizar={aplicarAtualizacao} />}
      </>
    );
  }
  if (sessao?.user?.is_anonymous && perfil === null && !perfilErro) {
    return comBanner(
      <div style={{ background: getTokens(false).bg }} className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <img src={LOGO_SRC} alt="Condor" className="h-10 w-auto" />
        <Ticket size={28} color={RED} />
        <p className="text-sm font-semibold">Seu acesso de promotor terminou.</p>
        <p style={{ color: getTokens(false).subtext }} className="text-xs max-w-xs">O convite venceu ou foi cancelado. Peça um novo link pro encarregado da loja.</p>
        <button onClick={() => supabase.auth.signOut()} style={{ color: BLUE }} className="text-xs font-semibold mt-1">Sair</button>
      </div>
    );
  }
  if (sessao && perfil === undefined) {
    return <TelaCarregando logo={LOGO_SRC} mensagem="Entrando na sua conta…" />;
  }
  if (sessao && perfil === null) {
    if (perfilErro) {
      return comBanner(
        <div style={{ background: getTokens(false).bg }} className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
          <img src={LOGO_SRC} alt="Condor" className="h-10 w-auto" />
          <p className="text-sm font-semibold">Não foi possível carregar seu perfil.</p>
          <p style={{ color: getTokens(false).subtext }} className="text-xs">Verifique a conexão e tente de novo.</p>
          <button onClick={() => { setPerfil(undefined); setPerfilTick((n) => n + 1); }} style={{ background: BLUE, color: "#fff" }} className="px-4 py-2.5 rounded-xl text-sm font-semibold">Tentar de novo</button>
          <button onClick={() => supabase.auth.signOut()} style={{ color: BLUE }} className="text-xs font-semibold">Sair</button>
        </div>
      );
    }
    return comBanner(<ContaSemVinculo T={T} onVinculado={() => { setPerfil(undefined); setPerfilTick((n) => n + 1); }} onSair={() => supabase.auth.signOut()} />);
  }
  if (sessao && perfil && aceiteOk === false) {
    return comBanner(<AceiteObrigatorio T={getTokens(false)} nome={perfil.nome} onAceitar={async () => { await registrarAceite(); setAceiteOk(true); }} onSair={() => { setAceiteOk(null); supabase.auth.signOut(); }} />);
  }
  if (sessao && perfil && !dadosProntos) {
    return <TelaCarregando logo={LOGO_SRC} mensagem={`Carregando dados da loja ${lojaAtiva?.numero_loja || ""}…`} />;
  }

  const showBottomNav = flow === null;
  // Desktop (lg+): telas de formulário/ajustes ficam estreitas e legíveis; listas e painéis usam mais largura.
  const larguraMain =
    flow === null && tab.startsWith("cfg-") ? "max-w-md lg:max-w-[1600px]" :
    (flow === null && tab === "ajustes") || flow === "scan" ? "max-w-md lg:max-w-2xl" :
    flow === "confirm" ? "max-w-md lg:max-w-5xl" :
    flow === "expiry" ? "max-w-md lg:max-w-5xl" :
    ["torre", "relatorios", "historico", "auditoria", "rede", "gestao", "convites"].includes(flow) ? "max-w-md lg:max-w-[1600px]" :
    "max-w-md lg:max-w-[1600px]";
  const alertCount = items.filter((i) => ["alert", "expired"].includes(getStatus(i).level)).length;

  return (
    <PermissoesContext.Provider value={{ podeVerValores }}>
    <div style={{ background: T.bg, color: T.text }} className="min-h-screen font-sans lg:pl-64">
      <SideNav T={T} tab={tab} flow={flow} alertCount={alertCount} nome={perfil?.nome} cargo={perfil?.cargo_nome_loja} lojaNumero={lojaAtiva?.numero_loja}
        flags={{ podeVerValores, ehEncarregado, ehCorporativo, ehDev }}
        onTab={(t) => { if (flow !== null) resetFlow(); setSetorAtivo(null); setTab(t); }}
        onFlow={(f) => { setSetorAtivo(null); setFlow(f); }}
        onScan={ehDesktop ? null : () => setFlow("scan")} onSair={sair} />
      <Header T={T} flow={flow} tab={tab} nomeUsuario={perfil?.nome} busca={search}
        onBusca={(v) => { setSearch(v); if (tab !== "produtos" || flow !== null) { if (flow !== null) resetFlow(); setSetorAtivo(null); setTab("produtos"); } }}
        onBack={flow === "expiry" && !editingItemId ? () => setFlow("confirm") : resetFlow}
        dark={dark}
        setDark={(fn) => setPrefs((p) => { const d = typeof fn === "function" ? fn(dark) : fn; return { ...p, tema: d ? "escuro" : "claro" }; })}
        notifPermission={notifPermission} onToggleNotif={toggleNotificacoes}
        atualizacaoPendente={!!novaVersao && !mostrarBannerVersao} onAtualizacao={() => setVersaoDispensada(null)} />

      {!online && (
        <div style={{ background: "#7A1F23" }} className="text-white text-center text-[11px] font-medium py-1.5 flex items-center justify-center gap-1.5">
          <WifiOff size={12} /> Modo offline — suas alterações estão sendo guardadas e sincronizam sozinhas quando a internet voltar.
        </div>
      )}

      <main className={`${larguraMain} mx-auto pb-32 lg:pb-10 lg:px-6`}>
        {flow === "scan" && <ScanView T={T} onDetected={handleBarcodeCaptured} onCancel={resetFlow} />}
        {flow === "confirm" && (
          <ConfirmProductView T={T} barcode={pendingBarcode} initial={draftProduct} wasKnown={!!catalog[chaveCatalogo(pendingBarcode, draftProduct)]}
            nomesExistentes={nomesExistentesCatalogo}
            onCancel={resetFlow} onContinue={confirmProductAndContinue} onSalvarSemValidade={salvarCadastroSemValidade}
            onSalvarEdicaoDireto={editingItemId ? salvarEdicaoSemAlterarValidade : null} intencaoFluxo={intencaoFluxo}
            setoresExtra={setoresExtra} subsetoresExtra={subsetoresExtra} onCriarSetor={criarSetorCustomizado} onCriarSubsetor={criarSubsetorCustomizado} />
        )}
        {flow === "expiry" && (
          <ExpiryView T={T} product={draftProduct} barcode={pendingBarcode} items={items} vozPre={vozPre}
            editing={editingItemId ? items.find((i) => i.id === editingItemId) : null}
            onCancel={resetFlow} onVoltar={() => setFlow("confirm")} onSave={saveAlertItem}
            onBaixaDireta={!editingItemId && nivelUsuario <= 5 && podeGerirProduto(draftProduct) ? registrarBaixaDireta : null} />
        )}

        {flow === "auditoria" && ehEncarregado && <AuditoriaView T={T} auditoria={auditoria} />}
        {flow === "torre" && ehEncarregado && <TorreControleView T={T} items={items} historico={historico} auditoria={auditoria} usuario={usuario} showToast={showToast} rondas={rondas} lojaNumero={perfil?.lojas?.numero_loja} />}
        {flow === "rede" && ehCorporativo && <PainelRedeView T={T} showToast={showToast} />}
        {flow === "convites" && ehEncarregado && <ConvitesPromotorView T={T} showToast={showToast} lojaAtiva={lojaAtiva} nivelUsuario={perfil?.cargos?.nivel ?? 99} />}
        {flow === "gestao" && ehDev && <GestaoAplicativoView T={T} showToast={showToast} lojaAtiva={lojaAtiva} lojas={todasLojas} onRecarregarLojas={recarregarLojas} nivelUsuario={perfil?.cargos?.nivel} onTrocarLoja={(l) => { setLojaAtivaOverride(l); showToast(`Trocado pra loja ${l.numero_loja}.`); }} />}
        {flow === "relatorios" && ehEncarregado && <RelatoriosView T={T} items={items} historico={historico} auditoria={auditoria} usuario={usuario} showToast={showToast} onOpenDetail={setDetalheItem} rondas={rondas} lojaNumero={perfil?.lojas?.numero_loja} />}
        {/* Inteligência operacional (módulos novos, em src/inteligencia.jsx) */}
        {flow === "previsao" && ehEncarregado && <PrevisaoOperacionalView T={T} perfil={perfil} lojaAtiva={lojaAtiva} showToast={showToast} onCriarRonda={abrirRondaInteligente} />}
        {flow === "prevencao" && ehEncarregado && <PrevencaoPerdasView T={T} perfil={perfil} lojaAtiva={lojaAtiva} catalog={catalog} showToast={showToast} onCriarRonda={abrirRondaInteligente} ScanView={ScanView} />}
        {flow === "assistente" && ehEncarregado && <AssistenteIAView T={T} perfil={perfil} lojaAtiva={lojaAtiva} showToast={showToast} onCriarRonda={abrirRondaInteligente} />}

        {flow === null && tab === "home" && telaLarga && (
          <DashboardView T={T} items={items} historico={historico} rondas={rondas} auditoria={ehEncarregado ? auditoria : []} nome={perfil?.nome} lojaNumero={lojaAtiva?.numero_loja}
            onOpenDetail={setDetalheItem} onTab={(t) => { setSetorAtivo(null); setTab(t); }} onFlow={(f) => setFlow(!ehEncarregado && ["auditoria", "torre", "relatorios", "historico"].includes(f) ? null : f)} />
        )}
        {flow === null && tab === "produtos" && telaLarga && (
          <ProdutosDashboard T={T} items={items} historico={historico} search={search} setSearch={setSearch}
            filtroSetor={filtroSetor} setFiltroSetor={setFiltroSetor} ordenarPor={ordenarPor} setOrdenarPor={setOrdenarPor}
            onOpenDetail={setDetalheItem} onVerPrioridades={() => setFlow("prioridade")} />
        )}
        {flow === null && ((tab === "produtos" && !telaLarga) || (tab === "home" && !telaLarga)) && (
          <HomeView T={T} items={items} historico={historico} search={search} setSearch={setSearch}
            filtroSetor={filtroSetor} setFiltroSetor={setFiltroSetor}
            ordenarPor={ordenarPor} setOrdenarPor={setOrdenarPor}
            modoVisual={modoVisual} setModoVisual={setModoVisual}
            onScan={() => setFlow("scan")} onCadastrar={() => abrirCadastroDireto()} onOpenDetail={setDetalheItem}
            onVerPrioridades={() => setFlow("prioridade")}
            comPalco={tab === "home"} nomeUsuario={perfil?.nome} lojaNumero={lojaAtiva?.numero_loja}
            notifPermission={notifPermission} onToggleNotif={toggleNotificacoes}
            dark={dark} onTema={() => setPrefs((p) => ({ ...p, tema: dark ? "claro" : "escuro" }))}
            atualizacaoPendente={!!novaVersao && !mostrarBannerVersao} onAtualizacao={() => setVersaoDispensada(null)} />
        )}
        {flow === null && tab === "setores" && !setorAtivo && (
          <SetoresView T={T} items={items} catalog={catalog} rondas={rondas}
            onOpenDetail={setDetalheItem} onLancarValidade={ehDesktop ? null : lancarValidadeDoCadastro} onAbrirSetor={setSetorAtivo} />
        )}
        {flow === null && tab === "setores" && setorAtivo && !subAtivo && (() => {
          const nomesExtra = subsetoresExtra.filter((x) => x.setor === setorAtivo).map((x) => x.nome);
          const dosProdutos = [...items, ...Object.values(catalog || {})].filter((i) => i.setor === setorAtivo && i.subsetor).map((i) => i.subsetor);
          const tem = (SUBSETORES_PADRAO[setorAtivo] || []).length + nomesExtra.length + dosProdutos.length > 0;
          if (!tem) { setTimeout(() => setSubAtivo("__todos__"), 0); return null; }
          return (
            <SetorSubcategoriasView T={T} setor={setorAtivo} items={items} catalog={catalog} extras={nomesExtra}
              onVoltar={() => setSetorAtivo(null)} onEscolher={setSubAtivo} onCriarSubsetor={ehEncarregado ? criarSubsetorCustomizado : null}
              onCadastrarNoSetor={ehDesktop ? null : (sx) => abrirCadastroDireto(sx)} />
          );
        })()}
        {flow === null && tab === "setores" && setorAtivo && subAtivo && (
          <SetorDetalheView T={T} setor={setorAtivo} items={items} catalog={catalog} rondas={rondas} subInicial={subAtivo}
            onVoltar={() => setSubAtivo(null)} onIniciarRonda={iniciarRonda} onOpenDetail={setDetalheItem}
            onLancarValidade={ehDesktop ? null : lancarValidadeDoCadastro} onCadastrarNoSetor={ehDesktop ? null : (s) => abrirCadastroDireto(s)}
            onExcluir={nivelUsuario <= 5 ? excluirProduto : null} podeGerirProduto={(it) => podeGerirProduto(it) && !it?.pedidoTipo} usuario={usuario} ehEncarregado={ehEncarregado} perfil={perfil} />
        )}
        {flow === "prioridade" && (
          <PrioridadeInteligenteView T={T} items={items} historico={historico} onOpenDetail={setDetalheItem} />
        )}
        {flow === null && tab === "rondas" && (
          <RondasView T={T} perfil={perfil} lojaAtiva={lojaAtiva} catalog={catalog} showToast={showToast} intent={rondaIntent} onIntentUsada={() => setRondaIntent(null)} />
        )}
        {flow === "historico" && ehEncarregado && <HistoricoView T={T} historico={historico} items={items} usuario={usuario} />}
        {flow === null && (tab === "ajustes" || tab.startsWith("cfg-")) && (
          <MaisView secao={tab.startsWith("cfg-") ? tab.slice(4) : null} T={T} dark={dark} tema={tema}
            setTema={(t) => setPrefs((p) => ({ ...p, tema: t }))}
            som={prefs.som} setSom={(v) => setPrefs((p) => ({ ...p, som: v }))}
            notifPermission={notifPermission} onToggleNotif={toggleNotificacoes}
            historico={historico} showToast={showToast} usuario={usuario} onSair={sair}
            onAbrirAuditoria={() => setFlow("auditoria")} onAbrirHistorico={() => setFlow("historico")}
            onAbrirPrioridade={() => setFlow("prioridade")} onAbrirTorre={() => setFlow("torre")} onAbrirRelatorios={() => setFlow("relatorios")}
            ehCorporativo={ehCorporativo} onAbrirRede={() => setFlow("rede")} ehEncarregado={ehEncarregado}
            configBalanca={configBalanca} onBalancaSalva={(cfg) => setConfigBalanca(cfg)}
            ehDev={ehDev} aprovPendentes={aprovPendentes} subsetoresExtra={subsetoresExtra} paginaInicial={maisPagina} onPaginaMais={setMaisPagina} onAbrirGestao={() => setFlow("gestao")} perfil={perfil} onAbrirConvites={() => setFlow("convites")} onAbrirModulo={(f) => setFlow(f)} />
        )}
      </main>

      {detalheItem && (
        <ProductDetailModal T={T} item={items.find((i) => i.id === detalheItem.id) || detalheItem}
          outrosLotes={items.filter((i) => i.barcode === detalheItem.barcode && i.setor === detalheItem.setor && i.id !== detalheItem.id)}
          onTrocarLote={setDetalheItem}
          onClose={() => setDetalheItem(null)}
          onEdit={ehDesktop || detalheItem.pedidoTipo || !podeEditarProduto(detalheItem) ? null : startEdit} onDuplicate={ehDesktop || !podeEditarProduto(detalheItem) ? null : duplicarItem}
          onBaixa={podeGerirProduto(detalheItem) ? darBaixa : null} onShare={compartilharItem}
          onAplicarPromocao={podeGerirProduto(detalheItem) && !detalheItem.pedidoTipo ? aplicarPromocao : null} onPedido={nivelUsuario <= 6 && podeEditarProduto(detalheItem) ? registrarPedido : null} podeGerirPedido={podeGerirProduto(detalheItem)} onExcluir={podeGerirProduto(detalheItem) && !detalheItem.pedidoTipo ? excluirProduto : null} />
      )}

      {perfil?.id && <RondaAvisosHost T={T} usuarioId={perfil.id} showToast={showToast} onIrParaRondas={() => { setFlow(null); setSetorAtivo(null); setTab("rondas"); }} />}


      {escolhaAberta && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div onClick={() => { setEscolhaAberta(false); resetFlow(); }} className="absolute inset-0 bg-black/55" />
          <div style={{ background: T.card }} className="relative w-full max-w-md lg:max-w-lg lg:ring-1 lg:ring-black/10 lg:shadow-2xl rounded-t-[28px] p-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] max-h-[90dvh] overflow-y-auto sm:rounded-2xl">
            <div style={{ background: BLUE_SOFT }} className="h-11 w-11 rounded-2xl flex items-center justify-center mb-3"><Barcode size={20} color={BLUE} /></div>
            <h2 className="font-bold text-base">Produto novo — {pendingBarcode}</h2>
            <p style={{ color: T.subtext }} className="text-xs mt-1 mb-4">Esse código ainda não está cadastrado. O que você quer fazer?</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => escolherIntencao("cadastro")} style={{ background: T.chipBg, color: T.text }} className="w-full text-left rounded-2xl p-3.5 flex items-center gap-3">
                <div style={{ background: BLUE_SOFT }} className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"><Package size={16} color={BLUE} /></div>
                <div>
                  <p className="text-sm font-semibold">Só cadastrar o produto</p>
                  <p style={{ color: T.subtext }} className="text-[11px]">Guarda nome, setor e preço pra usar depois</p>
                </div>
              </button>
              <button onClick={() => escolherIntencao("validade")} style={{ background: RED_SOFT, color: RED_DARK }} className="w-full text-left rounded-2xl p-3.5 flex items-center gap-3">
                <div style={{ background: "rgba(255,255,255,0.5)" }} className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"><Calendar size={16} color={RED_DARK} /></div>
                <div>
                  <p className="text-sm font-semibold">Cadastrar e lançar validade</p>
                  <p style={{ color: RED_DARK }} className="text-[11px]">Segue pro fluxo completo, com data de vencimento</p>
                </div>
              </button>
            </div>
            <button onClick={() => { setEscolhaAberta(false); resetFlow(); }} style={{ color: T.subtext }} className="w-full text-xs py-2.5 mt-2">Cancelar</button>
          </div>
        </div>
      )}

      {showBottomNav && !ehDesktop && (tab === "home" || tab === "setores") && (
        <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 500, damping: 28 }}
          onClick={() => setVozAberta(true)} aria-label="Cadastrar por voz"
          style={{ background: T.card, color: RED_DARK, borderColor: T.border }}
          className="lg:hidden fixed right-4 bottom-[calc(5.4rem+env(safe-area-inset-bottom)*0.12)] z-20 h-12 w-12 rounded-full border shadow-lg flex items-center justify-center">
          <Mic size={22} />
        </motion.button>
      )}
      {vozAberta && <VozSheet T={T} accent={RED} accentDark={RED_DARK} catalog={catalog} onCancel={() => setVozAberta(false)} onConfirmar={aplicarVoz} />}

      {showBottomNav && <BottomNav T={T} tab={tab} setTab={(t) => { setSetorAtivo(null); setTab(t); }} alertCount={alertCount} onScan={() => setFlow("scan")} />}

      {/* Campo-armadilha invisível pro coletor MOVFAST (e similares) — captura leitura mesmo quando
          o aparelho envia via IME/composição em vez de evento de teclado real. Ver useEffect acima.
          Ativo em qualquer tela do app, exceto na câmera (que já tem detecção própria). */}
      {flow !== "scan" && (
        <input ref={coletorInputRef} onChange={aoMudarCampoColetor}
          onKeyDown={(e) => { if (e.key === "Enter" && coletorBufferRef.current.length >= 4) { e.preventDefault(); confirmarLeituraColetor(coletorBufferRef.current); } }}
          inputMode="none" autoComplete="off"
          style={{ position: "fixed", top: 0, left: 0, width: 1, height: 1, opacity: 0, border: "none", padding: 0, pointerEvents: "none" }}
          aria-hidden="true" tabIndex={-1} />
      )}
      <div aria-live="polite" aria-atomic="true" className="sr-only">{toast ? toast.msg : ""}</div>
      {toast && <AvisoToast msg={toast.msg} tom={toast.tone} id={toast.id} elevar={!!desfazer} onFechar={() => { if (toastIdRef.current === toast.id) { clearTimeout(toastTimerRef.current); setToast(null); } }} />}
      {desfazer && <AvisoDesfazer key={desfazer.id} mensagem={desfazer.mensagem} onDesfazer={desfazer.onDesfazer} onFechar={() => setDesfazer(null)} />}
      {mostrarBannerVersao && <NovaVersaoBanner T={T} estado={estadoAtualizacao} progresso={progressoAtualizacao} erro={erroAtualizacao} onAtualizar={aplicarAtualizacao} onFechar={() => setVersaoDispensada(novaVersao?.assinatura)} />}
      <AnimatePresence>
        {avisoAtual && <AvisoModal T={T} aviso={avisoAtual} onFechar={() => marcarAvisoVisto(avisoAtual.id)} />}
        {tutorialAberto && !outroModal && <TutorialBipi key="tutorial" etapas={etapasTutorial} onFechar={(concluiu) => { marcarTutorialVisto(uidTutorial); setTutorialAberto(false); if (!concluiu) showToast(`Para rever o tutorial: ${ehDesktop ? "Configurações" : "Mais"} → Sobre o app → Ver o tutorial do Bipi.`, "info"); }} />}
        {!avisoAtual && mostrarAtualizacao && novidadesDoCargo.length > 0 && <AtualizacaoModal T={T} novidades={novidadesDoCargo} cargoNome={perfil?.cargos?.nome} onFechar={() => { gravarNovidadeVista(NOVIDADES[0].id); setMostrarAtualizacao(false); }} />}
      </AnimatePresence>
    </div>
    </PermissoesContext.Provider>
  );
}

// ============ Modal "Aviso geral" (comunicado enviado pra todo o app) ============
function AvisoModal({ T, aviso, onFechar }) {
  const estilos = {
    urgente: { bg: RED_SOFT, icone: RED_DARK, IconeComp: ShieldAlert },
    aviso: { bg: "#FEF3E0", icone: "#C98A0C", IconeComp: AlertTriangle },
    info: { bg: BLUE_SOFT, icone: BLUE, IconeComp: Megaphone },
  };
  const e = estilos[aviso.tipo] || estilos.info;
  const Icone = e.IconeComp;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        style={{ background: T.card }} className="w-full sm:max-w-sm lg:max-w-md lg:ring-1 lg:ring-black/10 lg:shadow-2xl rounded-t-2xl sm:rounded-2xl p-5 pb-7 sm:pb-5">
        <div style={{ background: e.bg }} className="h-12 w-12 rounded-2xl flex items-center justify-center mb-3">
          <Icone size={22} color={e.icone} />
        </div>
        <p className="text-base font-bold">{aviso.titulo}</p>
        <p style={{ color: T.subtext }} className="text-[12.5px] mt-1 whitespace-pre-wrap">{aviso.mensagem}</p>
        {aviso.criadoPor && <p style={{ color: T.subtext }} className="text-[10.5px] mt-2">Enviado por {aviso.criadoPor} · {formatarDataHoraExtenso(aviso.criadoEm)}</p>}
        <button onClick={onFechar} style={{ background: BLUE, color: "#fff" }} className="w-full text-sm font-semibold py-2.5 rounded-2xl mt-4">
          Entendi
        </button>
      </motion.div>
    </motion.div>
  );
}

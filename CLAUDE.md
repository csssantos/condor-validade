# Condor · Alerta de Validade — guia rápido (leia isto em vez de abrir arquivos grandes)

App avulso (sem vínculo com a empresa, sem CNPJ/DPO). PWA React+Vite+Tailwind+framer-motion, Supabase (projeto `fbovltxucooeoldjfckk`). Deploy: Vercel publica `main` em produção (outras branches = preview). Repo `csssantos/condor-validade`. Falar com o usuário SEMPRE em português, direto, sem enrolação. Quando ele diz "refaça do zero": nada do layout antigo, visual novo.

## REGRAS FIXAS (pedido do dono, valem para todo pedido futuro)
1. Mudou algo que envolva usuário, login, senha, cadastro, dados pessoais, permissões, câmera/mic/notificações, IA, terceiros (novo serviço/fornecedor) ou coleta de dado novo → atualizar `src/Legal.jsx` (Termos, Privacidade, Direitos, Armazenamento/permissões) NO MESMO commit. Se a mudança for relevante, trocar `TERMOS_VERSAO` (data de hoje) para todos aceitarem de novo. Se precisar de tabela/RPC nova, atualizar `exportar_meus_dados` e a retenção descrita na Privacidade.
2. Ao terminar cada pedido, atualizar este `CLAUDE.md` (mapa, regras, pendências) e, se for decisão/preferência do dono, a memória (`/areas/condor-validade-app.md`). Assim a próxima sessão não relê o app inteiro.
3. Ler só o trecho necessário (grep + sed); nunca o App.jsx inteiro.

## Mapa de arquivos (src/)
- `App.jsx` (~10,8k linhas, tudo junto). Não ler inteiro: use `grep -n "^function NomeDaTela"` e `sed -n` no trecho.
- `Inicio.jsx` PalcoInicio/PalcoPagina (topo azul). `TelasEntrada.jsx` carregamento+login (FUNDO_MARCA). `Legal.jsx` Termos/Privacidade/LGPD/aceite (trocar `TERMOS_VERSAO` pede novo aceite). `voz.js` interpreta fala + `buscarNoCatalogo`/`formatarNomeNovo`; `VozSheet.jsx` tela da voz. `inteligencia.jsx` IA/prevenção/rede.
- Telas em App.jsx: AuthScreen, AppInner (estado global, `flow`/`tab`), HomeView, SetoresView/SetorDetalheView, RondasView, MaisView (+ Pagina*), RelatoriosView→`RelatoriosMobile` (6 capítulos; botões de exportar ficam DENTRO do capítulo do assunto, via `ExportarCapitulo`), Torre/Auditoria/Historico/Prioridade, ProductDetailModal, ExpiryView/ConfirmProductView.
- Helpers de UI no App.jsx: PilulasPalco, ValorPalco, CartaoNovo, BarraRank, FaixaChips, EstadoVazioNovo, LinhaProduto, CartaoGrade, `getTokens(dark)` (T.card/T.chipBg/T.inputBorder; não usar T.border, é transparente), cores RED/RED_DARK/BLUE/BLUE_DARK/RED_SOFT.

## Regras de UI (iPhone)
- Safe area: `env(safe-area-inset-top/bottom)`; scroll fica em `#root` (corrige rubber-band). Fixed dentro de pai com transform/z-index → `createPortal(…, document.body)`.
- Cantos arredondados + filtro blur no Safari: `isolation:isolate` + `WebkitMaskImage:"-webkit-radial-gradient(white,black)"` + `translateZ(0)`.
- Cartões: claros (T.card), cor só em detalhes; evitar tela dominada por vermelho. Tudo precisa caber sem cortar.
- Ícone lucide novo precisa estar no import do topo (esbuild não avisa se faltar).

## Atualização de versão
Polling 20s (`buscarVersaoPublicada`) → `novaVersao`. Deslogado: overlay `AtualizacaoObrigatoria` bloqueia login. Logado + "Depois": ícone `BotaoAtualizacao` ao lado do sino. Telas de carregamento nunca mostram aviso.

## Supabase
- `apply_migration` costuma ser cancelado pelo cliente: gerar arquivo .sql, enviar com SendUserFile e o usuário roda; depois conferir com `execute_sql`.
- Tabelas novas legais: `consentimentos`, `solicitacoes_lgpd` + RPCs `registrar_aceite`, `criar_solicitacao_lgpd`, `exportar_meus_dados`. Catálogo: `catalogo` (nomes em CAIXA ALTA abreviados: BISC, CHOC., LING.).

## Teste e publicação (economiza tokens)
- Sintaxe: `/opt/npm-tools/node_modules/esbuild/bin/esbuild src/App.jsx --loader:.js=jsx --log-level=error`.
- Voz: `node teste-voz.mjs` (25 casos devem passar).
- `npx vite build` não funciona (sem rede). Print de telas: harness no scratchpad (`buildG.cjs`/`harnessG.jsx`/`shotJ.py`), só se o visual for o ponto.
- Publicar: commit em main + push; esperar ~75s e `gh api repos/csssantos/condor-validade/commits/main/status --jq .state` = success. Rodar tudo em UM comando.

## Pendências conhecidas
Telas internas ainda no layout antigo: Confirm/Expiry, execução de ronda, Assistente IA/Prevenção, página de dentro de cada setor. Decisão de iPhone/Android (branch `capacitor-android`) em aberto. Agente WhatsApp pausado. Falta tela do responsável responder `solicitacoes_lgpd`.

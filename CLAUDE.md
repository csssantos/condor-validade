# Condor · Alerta de Validade — guia rápido (leia isto em vez de abrir arquivos grandes)

## PROTOCOLO OBRIGATÓRIO — fazer ANTES de qualquer pedido do dono (nesta ordem)
1. **Memória**: ler `/areas/condor-validade-app.md` (e a listagem da memória) com as ferramentas de memória. Depois ler este arquivo. Só então executar o pedido.
2. **Jurídico**: o pedido mexe com usuário, login, senha, cadastro, dado pessoal, permissão, câmera/mic/notificação, IA, terceiro ou coleta nova de dado? Se sim, atualizar `src/Legal.jsx` (e `TERMOS_VERSAO` se for relevante) no MESMO commit.
3. **Segurança**: pensar "isso pode virar uma brecha?" (acesso sem login, dado de outra loja, escalonamento de cargo, entrada gigante/absurda, spam de requisições, segredo no navegador, funcionalidade que o usuário poderia abusar). Se sim: fazer o que foi pedido do jeito SEGURO (RLS por loja/cargo, validação no servidor e no cliente, limites, função com checagem interna). Se não der para ser seguro, entregar o pedido E construir a proteção junto (limite, trava, validação, auditoria). Nunca confiar só na tela: toda regra vale também no banco/função de servidor.
4. **Ao terminar**: atualizar este CLAUDE.md e a memória; testar (`esbuild` + `node teste-voz.mjs`); publicar e conferir o status da Vercel; mandar os .sql ao usuário com SendUserFile quando houver.

App avulso (sem vínculo com a empresa, sem CNPJ/DPO). PWA React+Vite+Tailwind+framer-motion, Supabase (projeto `fbovltxucooeoldjfckk`). Deploy: Vercel publica `main` em produção (outras branches = preview). Repo `csssantos/condor-validade`. Falar com o usuário SEMPRE em português, direto, sem enrolação. Quando ele diz "refaça do zero": nada do layout antigo, visual novo.

## REGRAS FIXAS (pedido do dono, valem para todo pedido futuro)
1. Mudou algo que envolva usuário, login, senha, cadastro, dados pessoais, permissões, câmera/mic/notificações, IA, terceiros (novo serviço/fornecedor) ou coleta de dado novo → atualizar `src/Legal.jsx` (Termos, Privacidade, Direitos, Armazenamento/permissões) NO MESMO commit. Se a mudança for relevante, trocar `TERMOS_VERSAO` (data de hoje) para todos aceitarem de novo. Se precisar de tabela/RPC nova, atualizar `exportar_meus_dados` e a retenção descrita na Privacidade.
2. Ao terminar cada pedido, atualizar este `CLAUDE.md` (mapa, regras, pendências) e, se for decisão/preferência do dono, a memória (`/areas/condor-validade-app.md`). Assim a próxima sessão não relê o app inteiro.
3. Ler só o trecho necessário (grep + sed); nunca o App.jsx inteiro.
4. **Toda publicação com mudança visível ao usuário**: adicionar uma entrada NO TOPO de `NOVIDADES` (App.jsx, tela "Sobre o app" + modal pós-atualização), com `ate` por cargo.
5. **Ao trocar `TERMOS_VERSAO`**: adicionar entrada NO TOPO de `TERMOS_ALTERACOES` (Legal.jsx) com só o que foi acrescentado/alterado por documento (termos, privacidade, direitos, armazenamento). O aceite mostra só isso a quem já aceitou antes; texto completo só para quem é novo.

## MASCOTE — "Bipi" (REGRA FIXA: nunca criar outro; qualquer pedido com mascote usa ESTE; o "Condô", condor, foi substituído a pedido do dono)
Fonte oficial: `public/mascote.svg` (viewBox 400x400). Reaproveitar o arquivo (ou copiar o SVG) e só mudar pose/cena/fundo quando pedirem; nunca redesenhar do zero.
- Conceito do dono: "Um robozinho com leitor integrado no rosto, luz verde e pequenos braços. Representa a tecnologia e a agilidade nas rondas de validade."
- Cabeça: retângulo muito arredondado branco-azulado (#EAF1FB, contorno #7DB4F0), orelhas azuis nas laterais, antena fina azul-clara com bolinha VERMELHA (#E31E24) e um LED verde (#2ECC71) no canto da testa.
- Rosto = leitor: visor azul-marinho (#082F5E) com dois olhos verdes brilhantes (pílulas, com brilho branco), um FEIXE DE LEITURA vermelho horizontal (com brilho) cruzando o visor, e sorriso branco pequeno.
- Corpo: azul da marca (#0B4F9E), arredondado; painel branco no peito com CÓDIGO DE BARRAS azul-marinho, LED verde e uma barrinha vermelha. Pés vermelhos arredondados, pernas azul-marinho curtas, sombra no chão.
- Braços pequenos (azul-marinho, mãos brancas redondas com contorno #7DB4F0): esquerdo caído; direito erguido segurando uma ETIQUETA de produto branca com borda vermelha e CHECK verde (#1F9D55) (validade conferida).
- Personalidade: ágil, simpático, confiável, tecnológico (nada agressivo). Nome: Bipi (o "bip" do leitor de código de barras). Fala em português, direto.
- Cores permitidas: azul #0B4F9E/#082F5E, vermelho #E31E24, branco, verde só em luzes/olhos/check. Fundo padrão: `FUNDO_MARCA` (azul degradê) com círculo branco translúcido atrás.
- Arquivos prontos: `public/bot-perfil.png` (640x640, foto do bot no BotFather → Edit Botpic) e `public/bot-boas-vindas.png` (640x360, banner enviado no /start e usado em "Description Picture"; frase "Oi, eu sou o Bipi!"). Gerados por HTML+Playwright a partir do SVG.

## AUDITORIA (REGRA FIXA: toda ação que muda dado ou acesso precisa deixar rastro na auditoria; vale também para Telegram e qualquer canal novo)
- Tabela `auditoria` (usuario, acao, detalhe, produto_barcode, loja_id, criado_em): só inserção (ninguém edita/apaga), RLS por loja, limite por minuto. Tela: `AuditoriaView`/`AuditoriaDashboard` (App.jsx). No app, gravar com `logAuditoria(usuario, acao, detalhe, barcode)` (grava e atualiza a lista local; usa `registrarAuditoria`). No banco/função: `insert into public.auditoria`.
- Outras trilhas só-inserção: `historico` (baixas), `login_auditoria` (logins), `validade_alteracoes` (mudanças de validade). Retenção descrita na Privacidade (até 5 anos).
- Ações já registradas no app: cadastrou/editou/excluiu produto, deu baixa, registrou perda direta, criou setor/subsetor, aplicou promoção, etc.
- TELEGRAM (tudo que o bot faz entra na auditoria da loja, com o nome do funcionário ou "Promotor X (Marca)"): `vinculou Telegram` / `(promotor)`, `gerou código do Telegram` (RPC `gerar_codigo_telegram`), `removeu vínculo do Telegram` (RPC `remover_telegram`), `cadastrou produto` com detalhe "(via Telegram) · validade · qtd" (`lancar_validade`), e, pelo bot via RPC `telegram_auditar` (só service_role, lista fixa de ações): `desvinculou o Telegram (/sair)`, `cancelou lançamento no Telegram`, `confirmou lançamento duplicado no Telegram`, `lançamento barrado no Telegram`, `dado barrado no Telegram`, `enviou foto ao Telegram (leitura por IA)`. Sem vínculo (código errado, spam) não há loja: fica só em `telegram_mensagens` (30 dias, com status_proc/erro).
- Ao criar nova ação no bot: adicionar na lista de `telegram_auditar` (SQL `supabase-auditoria-telegram.sql`) E chamar `auditar()` na Edge Function; atualizar esta lista e a Privacidade/Termos (§ Registros e auditoria).

## BACKUP DIÁRIO (REGRA FIXA do dono: todo dia às 23:59 de Brasília, banco inteiro com dados, salvo no GitHub)
- O repositório do app é PÚBLICO: o backup NUNCA vai nele. Vai para um repositório PRIVADO separado (`csssantos/condor-validade-backup`, criado pelo dono), via GitHub Actions: cópia de referência em `backup-github/` (workflow `.github/workflows/backup.yml` + README; o que roda é o do repo privado).
- Cron `59 2 * * *` (UTC) = 23:59 BRT. `pg_dump` 17 (banco é Postgres 17) pela URL do pooler em sessão (IPv4) no secret `SUPABASE_DB_URL`; comprime e criptografa (gpg AES-256) com o secret `BACKUP_PASSPHRASE` → `backups/AAAA-MM-DD.sql.gz.gpg`; confere abrindo o arquivo de volta; mantém 60 arquivos na pasta. Falha = e-mail do GitHub. Segredos só nos Secrets do GitHub, nunca no chat/código.
- Inclui public, auth, storage, supabase_migrations (exclui schemas gerenciados: extensions, vault, graphql, net, realtime, cron...). Storage hoje não tem arquivos (fotos ficam nas tabelas).
- Ao criar tabela/schema novo, ele entra sozinho no dump. Ao mudar o banco de versão major, trocar `postgresql-client-17`.

## Mapa de arquivos (src/)
- `App.jsx` (~10,8k linhas, tudo junto). Não ler inteiro: use `grep -n "^function NomeDaTela"` e `sed -n` no trecho.
- `Inicio.jsx` PalcoInicio/PalcoPagina (topo azul). `TelasEntrada.jsx` carregamento+login (FUNDO_MARCA). `Legal.jsx` Termos/Privacidade/LGPD/aceite (trocar `TERMOS_VERSAO` pede novo aceite). `voz.js` interpreta fala + `buscarNoCatalogo`/`formatarNomeNovo`; `VozSheet.jsx` tela da voz. `inteligencia.jsx` IA/prevenção/rede.
- Telas em App.jsx: AuthScreen, AppInner (estado global, `flow`/`tab`), HomeView, SetoresView → `SetorSubcategoriasView` (subcategorias do setor; `SUBSETORES_PADRAO` define as padrão, `subsetores_customizados` as extras; estado `setorAtivo`/`subAtivo` no AppInner, `__todos__`/`__sem__` são atalhos) → SetorDetalheView (produtos, recebe `subInicial`), RondasView, MaisView (+ Pagina*), RelatoriosView→`RelatoriosMobile` (6 capítulos; botões de exportar ficam DENTRO do capítulo do assunto, via `ExportarCapitulo`), Torre→`TorreMobile`, Prioridade→`PrioridadeMobile`, Auditoria/Historico (módulo "Registrar perda" foi REMOVIDO a pedido do dono; baixa direta de vencido no ExpiryView continua), ProductDetailModal, ExpiryView/ConfirmProductView.
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

## Segurança (2026-10-31) — arquivo `supabase-seguranca.sql` (usuário roda; tem AUTO-TESTE que desfaz tudo se falhar)
- RLS por loja (`loja_ok(loja_id)`), por cargo (`nivel_do_usuario()`); `anon` só lê `lojas`/`cargos` e chama `buscar_funcionario_pendente`. Trilhas (historico, auditoria, login_auditoria, validade_alteracoes) só inserção. `usuarios` sem escrita direta (cargo/loja só via RPC) — isso fechou o furo de o usuário editar o próprio cargo.
- Funções: revoke de PUBLIC/anon em todas; internas (`_*`, `condor_*`, triggers) trancadas. Nova função pública do app → `grant execute ... to authenticated` (o padrão agora é SEM permissão).
- Limite por minuto: `rl_checar(bucket,max)` (triggers `trg_limite` em produtos/catalogo/historico/auditoria/validade_alteracoes/login_auditoria/convites/pendentes) e RPCs sensíveis embrulhadas (original renomeada `_rl_<nome>`; ao editar uma delas, editar a `_rl_`). DEV/DIRETOR (nível<=2) isentos. Edge Functions usam `rl_servico` (fail-open se o SQL não foi aplicado). Contadores em `limite_uso` (limpa por cron).
- Push: cliente grava inscrição via RPC `salvar_push` (tabela sem escrita direta). `enviar-push` v8 só aceita `{id}`/`{avisoId}` e lê tudo do banco, envia só para a loja do produto. `identificar-produto` v8 exige login + limite; Gemini no cliente REMOVIDO (não usar VITE_GEMINI_API_KEY). `assistente-ia`: versão do repo endurecida (login antes de tudo, diagnósticos só nível<=2, CORS restrito).
- `vercel.json`: CSP, HSTS, X-Frame DENY etc. Se algo novo externo for chamado (fetch/script/img), liberar na CSP. `supabaseClient.js` tem freio no cliente (150 chamadas/10 s, pausa em 429/503).
- Só no painel (não dá por código): ativar "Leaked password protection" (Auth → Providers → Email), limites/captcha de Auth (Auth → Rate limits), WAF/rate limit da Vercel (Firewall). `pg_net` está no schema public (aviso leve).

## Pré-cadastro e setor (2026-10-31) — `supabase-preCadastro-setor.sql` (usuário roda)
- `GestaoFuncionarios`: encarregado (nível 5) cadastra → setor travado no dele (`usuarios.setor`); gerência/diretoria/dev escolhem (padrão = `cargos.setor_padrao`); cargo nível 6 exige setor; encarregado (nível 5) não precisa de vínculo. `_vincular_pendente` copia o setor para a conta no 1º login.
- Trigger `trg_pendente_regra_setor` em `funcionarios_pendentes` repete a regra no banco (erro 22023 mostrado na tela).

## Telegram (2026-10-31) — substitui o agente de WhatsApp (pausado). `supabase-telegram.sql` (usuário roda) + Edge Function `telegram-bot` v1 (verify_jwt=false; copia de `src/voz.js` em `supabase/functions/telegram-bot/voz.js` — recopiar ao mudar voz.js)
- Secrets (Supabase → Edge Functions): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `GEMINI_API_KEY` (foto). Webhook: abrir no navegador `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://fbovltxucooeoldjfckk.supabase.co/functions/v1/telegram-bot&secret_token=<SEGREDO>`. Opcional no Vercel: `VITE_TELEGRAM_BOT` (usuário do bot, mostra botão "Abrir o bot").
- Tabelas: `telegram_vinculos` (1 chat por usuário/convite), `telegram_codigos` (8 dígitos, 10 min), `telegram_sessoes`, `telegram_mensagens` (dedupe por update_id, 30 dias). RPCs app: `gerar_codigo_telegram`, `telegram_status`, `remover_telegram(p_usuario|p_convite)` (próprio, DEV/Diretor, gerência da loja, encarregado do setor). RPCs bot (service_role): `telegram_vincular_funcionario/promotor`, `telegram_contexto`. `lancar_validade` agora tem `p_convite` (promotor só lança produto da própria marca) e origem `telegram`.
- Promotor: `convites_promotor.codigo` (ex. BAU-7K3QP, gerado por trigger) + link permanente `/promotor/<marca>/<codigo>` (`resgatar_convite_codigo`; rewrite no vercel.json). Duração "Permanente" = 100 anos. Bot nunca cria produto: só lança o que existe no `catalogo` da loja; confirma antes; travas do `validarVoz`.
- Boas-vindas do bot: `comFoto()` envia `public/bot-boas-vindas.png` (banner com o mascote Bipi, 640x360, também serve de "Description Picture" no BotFather) com legenda no /start e na 1ª mensagem; se a imagem falhar, manda só texto. Textos do BotFather (descrição, sobre, comandos) estão na conversa de 2026-10-31.
- UI: `TelegramVinculo` (PaginaConta), "Remover Telegram" nos sheets de funcionário/convite. Legal.jsx atualizado (TERMOS_VERSAO 2026-10-31).

## Voz (regras de segurança)
- `validarVoz` (voz.js) barra: validade passada (hoje vale), >5 anos, quantidade ≤0/absurda (5000 un, 500 kg), unidade fracionada, preço fora de 0,01–5000, nome inválido. VozSheet mostra os problemas e desabilita "Continuar"; `aplicarVoz` revalida. Palavra solta que não existe no cadastro vira `incompleto` (não cria produto); produto novo só com marca + produto. Busca é fonética (l→u, que→co, junta "bal duco"). Microfone: `garantirMicrofone` consulta Permissions API e guarda `condor_mic_liberado`.

## Teste e publicação (economiza tokens)
- Sintaxe: `/opt/npm-tools/node_modules/esbuild/bin/esbuild src/App.jsx --loader:.js=jsx --log-level=error`.
- Voz: `node teste-voz.mjs` (25 casos devem passar).
- `npx vite build` não funciona (sem rede). Print de telas: harness no scratchpad (`buildG.cjs`/`harnessG.jsx`/`shotJ.py`), só se o visual for o ponto.
- Publicar: commit em main + push; esperar ~75s e `gh api repos/csssantos/condor-validade/commits/main/status --jq .state` = success. Rodar tudo em UM comando.

## Pendências conhecidas
Telas internas ainda no layout antigo: Confirm/Expiry, execução de ronda, Assistente IA/Prevenção, página de dentro de cada setor (lista de produtos). Rodar `supabase-setores-subcategorias.sql` (migra Mercearia para Seca leve/pesada/doce/salgada, Saudáveis, Bolachas, Perfumaria) e `supabase-seguranca.sql` se o usuário ainda não rodou; `assistente-ia` v10 já publicada (Gemini grátis: Flash-Lite primeiro, sem Pro; precisa do secret GEMINI_API_KEY). Decisão de iPhone/Android (branch `capacitor-android`) em aberto. Agente WhatsApp pausado (Telegram o substituiu; falta o usuário criar o bot, rodar o SQL e colocar os secrets). Falta tela do responsável responder `solicitacoes_lgpd`.

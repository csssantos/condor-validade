// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { DashBadge } from "./dash";
import { BLUE, BLUE_DARK, BLUE_SOFT, RED_DARK, RED_SOFT } from "../lib/constantes";

// ============ Novidades do app (lista mostrada depois de "Atualizar") ============
// A cada publicação nova: adicione uma entrada NO TOPO de NOVIDADES (a primeira é a versão atual).
//  - tipo: "adicionado" | "melhorado" | "removido" | "corrigido"
//  - ate: nível máximo do cargo que vê o item (7 = todos, 5 = encarregado e acima, 4 = gerência e acima, 2 = diretor e dev, 1 = só dev)
// Quem tem cargo abaixo do exigido não vê o item; quem tem cargo igual ou acima vê, com a etiqueta do público.
const NOVIDADES = [
  { id: "2026-11-11-verificar-banco", data: "11/11/2026", itens: [
    { tipo: "novo", ate: 1, texto: "Gestão do aplicativo → Banco: botão \"Verificar banco\" confere se regras de segurança, funções e rotinas do banco estão como o app espera (use depois de aplicar qualquer SQL)." },
  ] },
  { id: "2026-11-11-editar-convite", data: "11/11/2026", itens: [
    { tipo: "novo", ate: 5, texto: "Convite de promotor agora pode ser editado: mudar a data de vencimento, trocar acesso total por marcas específicas (ou o contrário) e ajustar as marcas. Fica em Funcionários → Promotores → ⋯ → Editar validade e marcas. A mudança já vale no servidor para quem já entrou (a tela dele atualiza ao recarregar) e tudo fica na auditoria." },
    { tipo: "corrigido", ate: 5, texto: "Gerar convite com duração \"Permanente\" voltou a funcionar." },
  ] },
  { id: "2026-11-11-link-logado", data: "11/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Se você já está logado e abre o link de \"esqueci minha senha\", o app pergunta se você quer continuar na sua conta ou sair e criar a nova senha pelo link. A tela de nova senha mostra de qual conta ela é." },
    { tipo: "novo", ate: 7, texto: "Os e-mails de confirmação e de recuperação de senha ganharam um visual novo, no estilo da tela de carregamento." },
  ] },
  { id: "2026-11-11-nova-senha", data: "11/11/2026", itens: [
    { tipo: "novo", ate: 7, texto: "O app agora também abre em app.usebipi.com. Nesse endereço você faz login de novo (o endereço antigo continua funcionando)." },
    { tipo: "alterado", ate: 7, texto: "Esqueci minha senha: ao abrir o link do e-mail, o app pede a nova senha e a confirmação antes de entrar, e mostra o que fazer se o link venceu." },
  ] },
  { id: "2026-11-05-tutorial-lgpd", data: "05/11/2026", itens: [
    { tipo: "novo", ate: 7, texto: "Tutorial do Bipi: no primeiro acesso, o Bipi mostra em poucas etapas como o app funciona. Para rever, toque em Mais → Sobre o app → Ver o tutorial do Bipi." },
    { tipo: "alterado", ate: 7, texto: "Privacidade: os termos foram atualizados (quem responde pelos dados, fornecedores, o que fica guardado no aparelho). Ao sair da conta, o app apaga deste aparelho a cópia offline dos produtos, e ações feitas sem internet só são enviadas com a conta de quem as fez." },
    { tipo: "novo", ate: 2, texto: "Pedidos LGPD: tela para responder os pedidos de direitos (prazo de 15 dias), com aviso de prazo e resposta que chega na hora para quem pediu." },
    { tipo: "alterado", ate: 7, texto: "O registro de login agora é feito pelo servidor, sem consultar serviço externo." },
  ] },
  { id: "2026-11-05-pdf-novo", data: "05/11/2026", itens: [
    { tipo: "novo", ate: 5, texto: "Todos os PDFs foram refeitos no visual da tela de carregamento (azul da marca, Bipi). Nomes compridos não passam mais por cima das outras colunas." },
    { tipo: "novo", ate: 5, texto: "Novos relatórios: Pedidos de campanha (promoção e preço direto, com nº da campanha, valor, quem pediu e críticos sem pedido), Perdas e baixas e Posição por setor. Pedidos também saem em CSV e Excel." },
    { tipo: "novo", ate: 5, texto: "Relatórios de próximos a vencer, gerencial e financeiro agora mostram a coluna Pedido." },
    { tipo: "alterado", ate: 7, texto: "No computador, a tela de ver produto foi refeita: painel azul com foto, nome e ações à esquerda e os dados em cartões à direita." },
  ] },
  { id: "2026-11-05-promotor-ve-marca", data: "05/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Promotor agora vê, em Início, Setores e Produtos, só os produtos das marcas do convite dele (acesso total continua vendo tudo)." },
  ] },
  { id: "2026-11-05-atalhos-cargo", data: "05/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Atalhos, Torre de controle, Relatórios, Histórico de baixas e Auditoria agora aparecem só para encarregado ou cargo superior." },
  ] },
  { id: "2026-11-04-bipi-compartilhar", data: "04/11/2026", itens: [
    { tipo: "novo", ate: 7, texto: "A imagem de compartilhar produto agora traz o Bipi sorridente no canto da foto." },
  ] },
  { id: "2026-11-04-pc-telas", data: "04/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "No computador, novos layouts: Detalhe do produto em 2 colunas (foto e ações de um lado, dados do outro), Ronda ao vivo e Conferência em tela de trabalho com lista e progresso lado a lado, Nova ronda em 2 colunas, Conta sem vínculo refeita com passo a passo, Avisos em 3 colunas (mensagem, destinatários e prévia) e Assistente IA, Previsão e Prevenção de perdas aproveitando a largura. No computador o botão Bipar não aparece mais na conferência da ronda." },
  ] },
  { id: "2026-11-04-fila-baixa", data: "04/11/2026", itens: [
    { tipo: "corrigido", ate: 7, texto: "Avisos de gravação recusada agora dizem o nome do produto; baixa reenviada depois de uma queda de internet não mostra mais erro falso." },
    { tipo: "corrigido", ate: 5, texto: "Somar quantidade a um lote que vence em até 2 dias (ou já venceu) passa a ser barrado também no banco, igual ao lançamento novo." },
  ] },
  { id: "2026-11-04-campanha-valor", data: "04/11/2026", itens: [
    { tipo: "novo", ate: 6, texto: "Pedido de promoção ou preço direto agora leva o VALOR PEDIDO (obrigatório). Quem lançou o lote pelo Telegram recebe um aviso no Telegram com a campanha e o valor, lembrando que o valor é só uma sugestão e depende da central liberar." },
    { tipo: "corrigido", ate: 7, texto: "Campo de data ao lançar validade: tocar nele vazio não seleciona mais a data de hoje sozinho." },
  ] },
  { id: "2026-11-04-ia-ultimos", data: "04/11/2026", itens: [
    { tipo: "novo", ate: 5, texto: "Assistente IA: pergunte pelos últimos lançamentos de validade (1, 2, 4, 6, 10, 15…) e peça só os campos que quiser. Ex.: \"me retorne os 3 últimos lançamentos de validade, apenas o nome, código e quantidade\". Também dá para filtrar por hoje/semana ou setor. A resposta vem em tabela, com o produto e só os campos que você pediu." },
  ] },
  { id: "2026-11-04-voz-lote", data: "04/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Cadastro por voz: agora entende o lote falado (ex.: \"lote CC 0132 6492\") e já deixa preenchido na tela de validade, em vez de misturar o lote no nome do produto. \"40 por cento\" vira 40% e sobras como \"e\" no fim do nome saem." },
    { tipo: "alterado", ate: 7, texto: "No computador, o cadastro de produto (confirmar dados) mostra tudo numa tela só, em duas colunas, sem as etapas do celular." },
    { tipo: "alterado", ate: 7, texto: "Telegram: entende datas como \"dez 2026\" e \"dezembro de 2026\" (vale o último dia do mês), avisa quando não entende uma data e aceita lote que parece data (ex.: 10/24) quando o bot pergunta o lote." },
    { tipo: "alterado", ate: 7, texto: "Somar ao lote sem internet: se a soma não for gravada, o número volta ao valor real na tela e o app avisa. Erro de lote repetido agora tem mensagem clara." },
  ] },
  { id: "2026-11-04-pc-largura", data: "04/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "No computador: as páginas de Configurações agora usam a largura inteira da tela (sem faixas em branco dos lados). Lançar validade ficou em duas colunas, subcategorias e rondas aparecem em grade, e Rondas ganhou cartões de resumo." },
    { tipo: "novo", ate: 5, texto: "Notificação no aparelho quando chega pedido de aprovação de produto novo pelo Telegram, mesmo com o app fechado (se as notificações estiverem ligadas)." },
  ] },
  { id: "2026-11-04-aprovacao-campos", data: "04/11/2026", itens: [
    { tipo: "novo", ate: 5, texto: "Aprovar produtos novos: ao aprovar, você precisa informar subcategoria, gramagem e preço (obrigatórios). Eles já entram no cadastro do produto." },
    { tipo: "novo", ate: 5, texto: "Aviso na hora quando chega um pedido de aprovação do Telegram (aviso na tela e notificação, se estiver ligada), e o menu Mais mostra quantos estão aguardando." },
  ] },
  { id: "2026-11-04-telegram-extras", data: "04/11/2026", itens: [
    { tipo: "novo", ate: 7, texto: "Telegram: ao lançar a validade de um produto já cadastrado, o bot agora pergunta a gramagem da embalagem (só o número vale como grama), o preço, se tem troca e, para funcionário, a subcategoria. Gramagem, preço e troca valem para funcionário e promotor; a subcategoria é só do funcionário. O que já está no cadastro entra sozinho e dá para corrigir antes de confirmar." },
    { tipo: "alterado", ate: 7, texto: "Campo de validade: dá para digitar a data (dd/mm/aaaa) ou escolher no calendário. O app não preenche mais a data de hoje sozinho ao tocar no campo vazio." },
    { tipo: "alterado", ate: 7, texto: "Tamanho da embalagem: a unidade padrão agora é sempre G (grama), em qualquer setor." },
  ] },
  { id: "2026-11-04-lote-travado", data: "04/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Lote com pedido de promoção ou preço direto fica travado: não dá mais para editar, somar quantidade, aplicar promoção nem excluir. Só dar baixa. O encarregado do setor (ou superior) pode remover o pedido para destravar. Isso substitui a regra antiga de limpar o pedido ao mudar a validade." },
  ] },
  { id: "2026-11-04-pedido-promocao", data: "04/11/2026", itens: [
    { tipo: "novo", ate: 6, texto: "Pedido de promoção ou preço direto: no detalhe do produto dá para registrar que a promoção ou o preço direto foi pedido, com o número da campanha. O pedido aparece na lista e fica na auditoria (quem pediu e quando). Se a validade do lote mudar, o pedido é limpo e precisa ser feito de novo." },
  ] },
  { id: "2026-11-04-atualizar-tudo", data: "04/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Atualizações acumuladas: se saírem várias versões seguidas, o botão Atualizar baixa a mais nova de uma vez só (e confere se saiu outra durante o download), sem precisar atualizar uma por uma." },
  ] },
  { id: "2026-11-04-pc-config", data: "04/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "No computador, as páginas de Configurações (Conta, Aparência, Notificações, Privacidade e termos, Sobre, Avisos, Código de balança e Aprovar produtos novos) foram refeitas em formato de dashboard, com várias colunas; nos Termos, o texto do documento abre ao lado da lista." },
  ] },
  { id: "2026-11-04-rolagem-inicio", data: "04/11/2026", itens: [
    { tipo: "novo", ate: 7, texto: "Tela inicial com rolagem animada: ao descer, o círculo do topo fica para trás e encolhe enquanto os cards e a lista de produtos deslizam por cima." },
  ] },
  { id: "2026-11-04-telegram-voltar", data: "04/11/2026", itens: [
    { tipo: "novo", ate: 7, texto: "Telegram: ao cancelar no meio do lançamento o bot pergunta se é isso mesmo; dá para voltar uma resposta (/voltar) e corrigir; cada resposta tem 5 minutos e, passado o tempo, o lançamento é cancelado com aviso." },
  ] },
  { id: "2026-11-04-avisos", data: "04/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Avisos do app refeitos no estilo da tela de carregamento, com bolinhas e a cor do status (verde pronto, azul aguarde, laranja atenção, vermelho erro), sem a caixa vermelha." },
  ] },
  { id: "2026-11-04-compartilhar-imagem", data: "04/11/2026", itens: [
    { tipo: "novo", ate: 7, texto: "Compartilhar produto agora envia uma imagem no estilo do app, com a foto, a validade, o lote, a quantidade, o setor e o código, mais a data e a hora em que foi gerada." },
  ] },
  { id: "2026-11-03-permissoes", data: "03/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Permissões novas: baixa, exclusão e edição de produto são do encarregado do setor (ou gerência). Funcionário e promotor só lançam e editam o que eles mesmos lançaram, sem baixa e sem excluir." },
  ] },
  { id: "2026-11-03-promotor-marcas", data: "03/11/2026", itens: [
    { tipo: "novo", ate: 5, texto: "Convite de promotor com várias marcas (de 1 a 5): o promotor só lança produtos dessas marcas. O sistema sugere as marcas que já existem no catálogo da loja." },
    { tipo: "novo", ate: 4, texto: "Convite com acesso total (gerência e diretoria): o promotor lança produto de qualquer marca, inclusive fora do horário da loja. Fica registrado na auditoria." },
  ] },
  { id: "2026-11-03-validade-proxima", data: "03/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Produto que vence em até 2 dias não é mais lançado no app (igual ao Telegram): leve ao gerente ou encarregado para pedir o preço direto." },
  ] },
  { id: "2026-11-03-telegram-codigo", data: "03/11/2026", itens: [
    { tipo: "melhorado", ate: 7, texto: "Código do Telegram agora tem 8 letras e números (mais seguro). Depois de 5 erros seguidos o bot bloqueia o chat por um tempo." },
    { tipo: "melhorado", ate: 7, texto: "O botão Salvar cinza agora explica o que falta." },
  ] },
  { id: "2026-11-03-baixa", data: "03/11/2026", itens: [
    { tipo: "melhorado", ate: 7, texto: "Dar baixa ficou mais seguro: o servidor registra a baixa e tira o produto numa operação só, com o nome de quem fez." },
    { tipo: "melhorado", ate: 5, texto: "Aumento de quantidade tem limite por dia (metade do estoque, mínimo 10) para evitar erro de digitação." },
    { tipo: "melhorado", ate: 5, texto: "Código do promotor ficou maior e mais difícil de adivinhar (ex.: BAU-7K3QP8M2XC)." },
  ] },
  { id: "2026-11-03-revisao", data: "03/11/2026", itens: [
    { tipo: "alterado", ate: 7, texto: "Código de barras: agora o app aceita EAN-8 (como o Kinder Ovo), UPC-A (12) e EAN-13, sempre com dígito verificador válido." },
    { tipo: "melhorado", ate: 7, texto: "Se o servidor recusar um lançamento, o app avisa na hora o motivo (em vez de dizer que salvou) e não perde o que estava na fila sem internet." },
    { tipo: "melhorado", ate: 7, texto: "Lote: lançar o mesmo lote de novo soma a quantidade; o lote é conferido (letras e números) e a validade precisa ser de hoje em diante." },
    { tipo: "melhorado", ate: 5, texto: "Aprovar produtos novos: mostra o lote e atualiza na hora quando chega um pedido." },
  ] },
  { id: "2026-11-01-barra", data: "01/11/2026", itens: [
    { tipo: "melhorado", ate: 7, texto: "A faixa de baixo no iPhone agora acompanha a cor do app (claro ou escuro)." },
  ] },
  { id: "2026-10-31-telegram", data: "31/10/2026", itens: [
    { tipo: "novo", ate: 7, texto: "Produto novo pelo Telegram sem imagem na internet: o bot pede uma foto legível da embalagem. A foto vai para a aprovação do encarregado e, aprovada, vira a imagem do produto no cadastro." },
    { tipo: "alterado", ate: 7, texto: "Telegram mais seguro: (1) o código de barras de produto novo precisa ser um EAN-13 válido, com dígito verificador, no app e no Telegram; (2) no Telegram, validade com até 2 dias (ou vencendo hoje) não é lançada: o bot avisa para levar o produto ao gerente e pedir preço direto; (3) no Telegram só lança com o número do lote; (4) ao desvincular o Telegram, o bot avisa lá que foi desvinculado e que é preciso vincular de novo com um código novo." },
    { tipo: "alterado", ate: 7, texto: "Telegram em tempo real: assim que você manda o código para o bot, o card em Mais → Conta muda sozinho para \"Telegram vinculado\", sem precisar sair da tela." },
    { tipo: "adicionado", ate: 7, texto: "Lote na ronda e nos relatórios: ao conferir um produto na ronda você informa a validade e o lote de cada lote encontrado (o app mostra os lotes cadastrados e avisa se algum não bate). Os relatórios (itens próximos a vencer, financeiro, prioridades, histórico de baixas) agora trazem a coluna Lote." },
    { tipo: "alterado", ate: 7, texto: "Lote que já existe: se você lançar o mesmo lote de um produto (com a mesma validade), o app não cria outro, só soma a quantidade ao lote. Por segurança, cada soma tem limite (até metade do que o lote já tem, no mínimo 10 un). Vale no app e no Telegram." },
    { tipo: "adicionado", ate: 7, texto: "Lote real: ao lançar uma validade (no app ou no Telegram) você informa o número do lote impresso na embalagem, ou marca que não tem lote. O app mostra os lotes já lançados do produto e cria um lote novo quando o número é diferente. O lote aparece no detalhe do produto e nas listas." },
    { tipo: "adicionado", ate: 5, texto: "Aprovar produtos novos: produto que não existe na loja e foi lançado pelo Telegram agora espera a aprovação de um encarregado ou superior (Mais → Aprovar produtos novos). Você edita nome, setor e imagem, aprova (cadastra o produto e lança a validade) ou recusa com motivo. A validade lançada não muda." },
    { tipo: "adicionado", ate: 7, texto: "Telegram: produto novo vai para aprovação de um encarregado e você recebe o aviso no bot (aprovado ou recusado, com o motivo). Novos banners do Bipi: validade lançada, aguardando aprovação, aprovado e rejeitado." },
    { tipo: "adicionado", ate: 7, texto: "Lançar validade pelo Telegram: converse com o bot, mande o código de barras ou o nome e confirme. Produto que não está no app? O bot busca a imagem na internet, você confirma e ele cadastra. Vincule em Mais → Conta → Telegram." },
    { tipo: "adicionado", ate: 7, texto: "Promotor com código fixo (ex.: ABC-12345) e link permanente: o código vale para um único Telegram." },
    { tipo: "adicionado", ate: 5, texto: "Auditoria do Telegram: vincular, gerar código, lançar, cancelar, tentativas barradas, consultas e produto novo cadastrado aparecem na tela Auditoria, como as ações do app." },
    { tipo: "adicionado", ate: 5, texto: "Remover o Telegram de um funcionário ou promotor pelo menu de ações." },
    { tipo: "adicionado", ate: 5, texto: "Pré-cadastro com setor: o encarregado cadastra a equipe já no setor dele; gerência e diretoria escolhem o setor do encarregado." },
    { tipo: "melhorado", ate: 7, texto: "Ao atualizar os Termos, aparece só o que mudou, não o texto inteiro." },
  ] },
  { id: "2026-10-30-inteligencia", data: "30/10/2026", itens: [
    { tipo: "adicionado", ate: 7, texto: "Na ronda, cada produto mostra um indicador de RISCO (calculado pelo histórico) e os de maior risco aparecem primeiro." },
    { tipo: "adicionado", ate: 5, texto: "Ronda inteligente: conferência completa, priorizada por risco, por amostragem ou só com os produtos que você escolher." },
    { tipo: "adicionado", ate: 5, texto: "Prevenção de Perdas: painel com perdas por setor, motivo e período, produtos que mais perdem, planos de ação e resultado antes x depois." },
    { tipo: "adicionado", ate: 5, texto: "Previsão Operacional: aponta setores e produtos com risco de problema, com tendência, justificativa e nível de confiança. Sem histórico suficiente, ela avisa." },
    { tipo: "adicionado", ate: 5, texto: "Assistente IA: pergunte sobre perdas, setores, rondas e tarefas. Ele responde só com dados reais que você tem permissão de ver e nada é criado sem a sua confirmação." },
  ] },
  { id: "2026-10-30-ronda", data: "30/10/2026", itens: [
    { tipo: "adicionado", ate: 7, texto: "Ronda nova: você recebe a ronda designada pelo encarregado na hora, confere produto por produto (bipando ou digitando o código) e acompanha o progresso." },
    { tipo: "adicionado", ate: 7, texto: "Se a internet cair durante a conferência, o app guarda o que você fez e envia sozinho quando a conexão voltar." },
    { tipo: "adicionado", ate: 7, texto: "Minhas tarefas: ocorrências designadas a você, com iniciar, concluir com foto e acompanhamento da aprovação." },
    { tipo: "adicionado", ate: 7, texto: "Se a ronda for finalizada ou cancelada pelo encarregado, aparece um aviso imediato na sua tela." },
    { tipo: "adicionado", ate: 5, texto: "Criar ronda por setor, escolhendo os funcionários do setor, início, prazo e instruções. A lista de produtos é congelada na criação." },
    { tipo: "adicionado", ate: 5, texto: "Painel da ronda em tempo real (progresso, OK/Atenção/Irregular, último produto) e botão FINALIZAR RONDA com motivo." },
    { tipo: "adicionado", ate: 5, texto: "Ocorrências com prioridade, prazo e responsável; aprovar ou reprovar tarefas concluídas, com histórico completo." },
    { tipo: "melhorado", ate: 5, texto: "Encarregado só cria rondas e designa tarefas para o próprio setor; a regra é validada no banco de dados." },
    { tipo: "adicionado", ate: 4, texto: "Criar rondas para vários setores de uma vez e relatórios de ocorrências por setor, funcionário, categoria e semana." },
    { tipo: "removido", ate: 7, texto: "Ronda antiga (feita direto pelo celular, sem designação) e o botão de designar nova ronda do dia." },
  ] },
  { id: "2026-10-30", data: "30/10/2026", itens: [
    { tipo: "adicionado", ate: 7, texto: "Aviso de versão nova em tempo real, com barra de progresso. O app só atualiza depois que você tocar em “Atualizar”." },
    { tipo: "melhorado", ate: 7, texto: "Rondas, auditoria, setores e catálogo agora atualizam sozinhos na tela quando alguém muda algo." },
    { tipo: "melhorado", ate: 7, texto: "No computador, todas as páginas ganharam o visual de painel, com cards e gráficos." },
    { tipo: "removido", ate: 7, texto: "Localização de produto (corredor, módulo, prateleira, vão) e escolha Loja/Depósito." },
    { tipo: "adicionado", ate: 5, texto: "Em Funcionários: aba Promotores, com pausar, retomar, bloquear e excluir convite." },
    { tipo: "adicionado", ate: 5, texto: "Menu de ações em cada funcionário para bloquear e desbloquear (com confirmação em dois toques)." },
    { tipo: "adicionado", ate: 5, texto: "Pedido de exclusão de funcionário, enviado para aprovação da gerência, diretoria ou dev." },
    { tipo: "adicionado", ate: 4, texto: "Aba Aprovações: aprovar ou recusar pedidos de exclusão feitos por encarregados." },
    { tipo: "adicionado", ate: 2, texto: "Editar dados, enviar redefinição de senha e excluir funcionário direto." },
    { tipo: "melhorado", ate: 2, texto: "Gestão do Aplicativo refeita: criar e editar lojas, escolher a loja ao pré-cadastrar funcionários." },
    { tipo: "corrigido", ate: 5, texto: "As abas de Funcionários agora cabem na tela do celular." },
  ] },
];

const NOVIDADES_CHAVE = "avdc_novidade_vista";

function rotuloPublico(ate) {
  return ate >= 7 ? "Para todos" : ate === 5 ? "Encarregados e acima" : ate === 4 ? "Gerência e acima" : ate === 2 ? "Diretoria e Dev" : ate === 1 ? "Só Dev" : "Cargos superiores";
}

// Novidades que o usuário ainda não viu e que valem para o cargo dele (nível menor = cargo mais alto).
function novidadesParaCargo(nivel, vista) {
  const n = nivel == null ? 7 : nivel;
  const i = NOVIDADES.findIndex((v) => v.id === vista);
  const pendentes = i === -1 ? NOVIDADES.slice(0, 1) : NOVIDADES.slice(0, i);
  return pendentes
    .map((v) => ({ ...v, itens: v.itens.filter((it) => n <= it.ate) }))
    .filter((v) => v.itens.length > 0);
}

function lerNovidadeVista() { try { return localStorage.getItem(NOVIDADES_CHAVE); } catch { return null; } }

function gravarNovidadeVista(id) { try { localStorage.setItem(NOVIDADES_CHAVE, id); } catch {} }

// ============ Modal "App atualizado" + lista de novidades ============
const TIPOS_NOVIDADE = {
  adicionado: { rotulo: "Adicionado", cor: "#1F9D55", bg: "#E6F7ED" },
  melhorado: { rotulo: "Melhorado", cor: BLUE_DARK, bg: BLUE_SOFT },
  removido: { rotulo: "Removido", cor: RED_DARK, bg: RED_SOFT },
  corrigido: { rotulo: "Corrigido", cor: "#C2760C", bg: "#FCF0DD" },
};

function AtualizacaoModal({ T, novidades, cargoNome, onFechar }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        style={{ background: T.card }} className="w-full sm:max-w-md lg:max-w-lg lg:ring-1 lg:ring-black/10 lg:shadow-2xl rounded-t-2xl sm:rounded-2xl max-h-[88vh] flex flex-col">
        <div className="p-5 pb-3 flex items-start gap-3">
          <div style={{ background: BLUE_SOFT }} className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"><Sparkles size={22} color={BLUE} /></div>
          <div className="min-w-0">
            <p className="text-base font-bold">App atualizado!</p>
            <p style={{ color: T.subtext }} className="text-[12.5px] mt-0.5">Veja o que mudou{cargoNome ? ` para o seu cargo (${cargoNome})` : ""}.</p>
          </div>
        </div>
        <div className="overflow-y-auto px-5 pb-3 flex flex-col gap-4">
          {novidades.map((v) => (
            <div key={v.id}>
              <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide mb-2">Versão de {v.data}</p>
              <div className="flex flex-col gap-2">
                {v.itens.map((it, i) => {
                  const t = TIPOS_NOVIDADE[it.tipo] || TIPOS_NOVIDADE.melhorado;
                  return (
                    <div key={i} style={{ background: T.chipBg }} className="rounded-xl p-3">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <DashBadge bg={t.bg} color={t.cor}>{t.rotulo}</DashBadge>
                        <span style={{ color: T.subtext }} className="text-[10px] font-semibold">{rotuloPublico(it.ate)}</span>
                      </div>
                      <p className="text-[12.5px] leading-snug">{it.texto}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="p-5 pt-3 pb-7 sm:pb-5">
          <button onClick={onFechar} style={{ background: BLUE, color: "#fff" }} className="w-full text-sm font-semibold py-3 rounded-2xl">Entendi</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export { AtualizacaoModal, NOVIDADES, NOVIDADES_CHAVE, TIPOS_NOVIDADE, gravarNovidadeVista, lerNovidadeVista, novidadesParaCargo, rotuloPublico };

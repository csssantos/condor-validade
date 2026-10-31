// Termos de Uso, Política de Privacidade, direitos do titular (LGPD) e aceite obrigatório.
// Os textos ficam aqui, num lugar só. Ao mudar qualquer documento, troque TERMOS_VERSAO: todo mundo precisa aceitar de novo.
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, FileText, ShieldCheck, Lock, Smartphone, Download, Send, Loader2, ChevronRight, ScrollText } from "lucide-react";
import { supabase } from "./supabaseClient";
import { FUNDO_MARCA } from "./TelasEntrada";

export const TERMOS_VERSAO = "2026-10-31";
// A CADA VEZ que trocar TERMOS_VERSAO: adicione uma entrada NO TOPO aqui, com SÓ o que foi adicionado/alterado em cada documento
// (ids: termos, privacidade, direitos, armazenamento). Quem já aceitou antes vê só esse resumo, não os textos completos.
export const TERMOS_ALTERACOES = [
  { versao: "2026-10-31", docs: {
    termos: [
      "Novo recurso opcional: lançar validade pelo Telegram, conversando com um bot. Nada é lançado sem a sua confirmação.",
      "Promotores ganham um código próprio (ex.: ABC-12345) que vale para um único Telegram e só permite lançar produtos da própria marca.",
    ],
    privacidade: [
      "Se você vincular o Telegram, guardamos o identificador da sua conversa (não o seu telefone) e as mensagens enviadas ao bot, por até 30 dias.",
      "Novos fornecedores: Telegram (apenas se você vincular) e Google Gemini (leitura de fotos enviadas ao bot).",
      "Gestores da loja podem remover o vínculo do seu Telegram.",
    ],
  } },
];
const CHAVE_ACEITE_LOCAL = "avdc_aceite_termos";
const CHAVE_ACEITE_PENDENTE = "avdc_aceite_pendente";

// Aplicativo avulso: sem CNPJ e sem encarregado (DPO). O contato é pelo canal de solicitações dentro do app.
export const LEGAL_CONTATO = {
  controlador: "o desenvolvedor do aplicativo Condor · Alerta de Validade",
};

const AZUL = "#0B4F9E", AZUL_ESC = "#061C3A", VERM = "#E31E24";

export const lerAceiteLocal = () => { try { return localStorage.getItem(CHAVE_ACEITE_LOCAL) === TERMOS_VERSAO; } catch { return false; } };
export const gravarAceiteLocal = () => { try { localStorage.setItem(CHAVE_ACEITE_LOCAL, TERMOS_VERSAO); } catch { /* sem armazenamento */ } };
export const marcarAceitePendente = () => { try { localStorage.setItem(CHAVE_ACEITE_PENDENTE, TERMOS_VERSAO); } catch { /* sem armazenamento */ } };
export const temAceitePendente = () => { try { return localStorage.getItem(CHAVE_ACEITE_PENDENTE) === TERMOS_VERSAO; } catch { return false; } };
export const limparAceitePendente = () => { try { localStorage.removeItem(CHAVE_ACEITE_PENDENTE); } catch { /* sem armazenamento */ } };

// Grava o aceite no banco (append-only). Devolve true se gravou.
export async function registrarAceite() {
  try {
    const { error } = await supabase.rpc("registrar_aceite", { p_versao: TERMOS_VERSAO, p_dispositivo: String(navigator.userAgent || "").slice(0, 300) });
    if (error) throw error;
    gravarAceiteLocal(); limparAceitePendente();
    return true;
  } catch (e) {
    console.error("registrar_aceite", e);
    gravarAceiteLocal(); // não trava o uso por falha de rede; o aceite local vale e será registrado na próxima oportunidade
    return false;
  }
}

// ───────────────────────── Documentos ─────────────────────────
const contatoLinha = () => {
  const partes = LEGAL_CONTATO.controlador;
  return { partes };
};

export const DOCUMENTOS = [
  {
    id: "termos", titulo: "Termos de Uso", resumo: "Regras para usar o app", Icone: ScrollText, cor: "#6D4FC2",
    secoes: () => [
      { t: "1. Quem somos e o que é o app", p: [
        "O Condor · Alerta de Validade (“app”) é um aplicativo avulso e independente, criado para ajudar a controlar datas de validade, rondas, ocorrências e perdas de produtos em lojas. Ele não tem vínculo, parceria, patrocínio ou aprovação de nenhuma empresa, rede de supermercados ou marca, e o nome “Condor” é só o nome do aplicativo.",
        "Quem oferece o app é o seu desenvolvedor (“nós”). Qualquer loja ou empresa que decida usar o app o faz por conta própria e responde por suas próprias regras internas.",
        "Ao criar sua conta ou entrar no app você declara que leu e concorda com estes Termos de Uso e com a Política de Privacidade. Se não concordar, não use o app.",
      ] },
      { t: "2. Quem pode usar", p: [
        "O app é para pessoas que trabalham com o controle de validades e foram cadastradas (matrícula pré-cadastrada) ou convidadas por quem administra a sua loja no app. É preciso ter 18 anos ou mais.",
        "O acesso é pessoal e intransferível. O nível de acesso depende do seu cargo e da sua loja, e pode ser alterado, pausado ou bloqueado a qualquer momento por quem administra o app ou a sua loja.",
      ] },
      { t: "3. Sua conta e senha", p: [
        "Você é responsável por manter sua senha em sigilo e por tudo o que for feito com a sua conta. Não empreste seu acesso. Se suspeitar de uso indevido, troque a senha e avise seu encarregado imediatamente.",
        "Cada aparelho e login podem ser registrados para segurança (veja a Política de Privacidade).",
      ] },
      { t: "4. Uso correto", p: [
        "Use o app só para o trabalho: lançar validades, conferir produtos, registrar baixas, perdas, rondas e ocorrências, com informações verdadeiras. Registrar dado falso ou alterar registros para esconder perdas pode gerar medidas disciplinares e outras responsabilidades previstas em lei e nas regras da sua empresa.",
        "É proibido: tentar burlar permissões; acessar dados de outras lojas ou cargos sem autorização; usar robôs ou automações não autorizadas; tentar derrubar, copiar ou fazer engenharia reversa do sistema; enviar conteúdo ilegal, ofensivo ou que viole direitos de terceiros (inclusive em fotos e observações).",
      ] },
      { t: "5. Registros e auditoria", p: [
        "As ações feitas no app (cadastros, baixas, rondas, alterações de validade, exclusões, logins) ficam registradas com seu nome, data e hora, para controle operacional, prevenção de perdas e segurança. Esses registros não podem ser apagados por quem os fez.",
      ] },
      { t: "6. Conteúdo que você envia", p: [
        "Fotos, observações e dados enviados continuam sendo de seus titulares, mas você autoriza o uso deles dentro do app e na operação da sua loja. Não envie fotos de pessoas, documentos pessoais ou informações sensíveis que não sejam necessárias ao trabalho.",
      ] },
      { t: "7. Recursos de IA e voz", p: [
        "O app pode ter recursos de assistente de IA e cadastro por voz. As respostas da IA podem conter erros e são apoio à decisão, não substituem o seu julgamento nem as regras da empresa. Nenhuma ação é criada sem a sua confirmação.",
        "O cadastro por voz usa o reconhecimento de voz do seu navegador/aparelho, que pode ser processado pelo fornecedor dele (por exemplo, Google ou Apple). Você escolhe quando usar.",
        "Telegram (opcional): você pode vincular seu Telegram ao app para lançar validade conversando com um bot. Ao vincular, o app guarda o identificador da sua conversa no Telegram (não o seu número de telefone) e as mensagens que você envia ao bot. Fotos enviadas ao bot podem ser lidas por IA (Google Gemini) para identificar código de barras e validade. O Telegram é um serviço de terceiro, com política própria; não envie dados pessoais seus ou de outras pessoas no chat. Nada é lançado sem a sua confirmação. Gestores da loja podem remover o vínculo.",
        "Promotores: o código do promotor (ex.: ABC-12345) vale para um único Telegram por vez e só permite lançar produtos da própria marca enquanto o acesso estiver ativo.",
      ] },
      { t: "8. Disponibilidade e mudanças", p: [
        "Nos esforçamos para manter o app disponível, mas ele pode ficar indisponível por manutenção, falhas de internet ou de terceiros. O app guarda algumas ações offline e envia quando a conexão volta.",
        "Podemos atualizar o app e estes Termos. Quando a mudança for relevante, você será avisado e precisará aceitar a nova versão para continuar usando.",
      ] },
      { t: "9. Propriedade intelectual", p: [
        "O app, seu código, layout, marcas e conteúdos pertencem ao desenvolvedor do app e são protegidos por lei. O uso do app não transfere nenhum direito de propriedade a você.",
      ] },
      { t: "10. Limitação de responsabilidade", p: [
        "O app é uma ferramenta de apoio. As datas, quantidades e valores dependem do que é lançado pelas pessoas; conferir os produtos fisicamente continua sendo responsabilidade da operação. Na extensão permitida em lei, o desenvolvedor não responde por danos indiretos decorrentes de dados lançados incorretamente, de indisponibilidade de internet ou de uso fora das regras destes Termos.",
      ] },
      { t: "11. Encerramento do acesso", p: [
        "O acesso pode ser suspenso ou encerrado, por exemplo, em caso de desligamento da loja ou empresa, troca de função, descumprimento destes Termos ou suspeita de fraude. Os registros já feitos permanecem conforme a Política de Privacidade e a lei.",
      ] },
      { t: "12. Lei aplicável e contato", p: [
        "Estes Termos seguem as leis do Brasil. Fica eleito o foro da comarca do domicílio do titular para resolver qualquer conflito, sem prejuízo de direitos garantidos pela legislação.",
        "Dúvidas, reclamações ou pedidos: use Mais → Privacidade e termos → Falar com o responsável, dentro do app.",
      ] },
    ],
  },
  {
    id: "privacidade", titulo: "Política de Privacidade", resumo: "Como tratamos seus dados (LGPD)", Icone: ShieldCheck, cor: "#0B4F9E",
    secoes: () => {
      const { partes } = contatoLinha();
      return [
        { t: "1. Quem é o controlador dos dados", p: [
          `Somos ${partes}, o controlador dos dados tratados neste app, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).`,
          "Este é um aplicativo avulso, sem CNPJ e sem encarregado (DPO) formal. Para falar sobre seus dados use Mais → Privacidade e termos → Solicitar um direito (Falar com o responsável).",
        ] },
        { t: "2. Quais dados coletamos", p: [
          "Dados de cadastro: nome, matrícula, e-mail, cargo, setor, loja e, quando informado, telefone. Para promotores: nome e marca.",
          "Dados de uso e segurança: registros de login (data, hora, endereço IP e dispositivo), ações feitas no app (cadastros, baixas, rondas, ocorrências, alterações de validade) e o aparelho usado.",
          "Conteúdo que você cria: fotos de produtos e de ocorrências, observações, quantidades, mensagens com o assistente de IA e ações pedidas a ele.",
          "Dados do aparelho para notificações: identificador de inscrição de notificações push (sem acesso ao conteúdo do seu aparelho).",
          "Voz: o texto reconhecido do que você fala no cadastro por voz. O áudio é processado pelo reconhecimento de voz do seu navegador ou aparelho e não é guardado por nós.",
          "Não coletamos sua localização, contatos, mensagens pessoais, dados bancários nem dados sensíveis (saúde, religião, política etc.).",
        ] },
        { t: "3. Para que usamos (finalidades)", p: [
          "Criar e proteger sua conta e controlar o que cada cargo pode ver e fazer.",
          "Controlar validades, rondas, ocorrências e perdas da loja; gerar relatórios, alertas e notificações da operação.",
          "Prevenir fraudes, manter trilha de auditoria e investigar incidentes de segurança.",
          "Melhorar o app e dar suporte. Não usamos seus dados para publicidade nem os vendemos.",
        ] },
        { t: "4. Bases legais", p: [
          "Execução do serviço que você pediu ao criar a conta e cumprimento de obrigações legais e regulatórias (LGPD art. 7º, II e V).",
          "Legítimo interesse em manter o controle de perdas do app, a segurança do sistema e a prevenção de fraudes, sempre limitado ao necessário e respeitando seus direitos (art. 7º, IX).",
          "Consentimento, quando aplicável, para o que não for necessário ao trabalho (por exemplo, ativar notificações no aparelho). Você pode revogar quando quiser.",
          "Exercício regular de direitos em processos judiciais, administrativos ou arbitrais (art. 7º, VI).",
        ] },
        { t: "5. Com quem compartilhamos", p: [
          "Dentro da sua loja/empresa: gestores e pessoas autorizadas no app, de acordo com o cargo e a loja. Os valores financeiros podem ser ocultados de alguns cargos.",
          "Fornecedores de tecnologia (operadores) que armazenam e entregam o app: Supabase (banco de dados, autenticação e arquivos) e Vercel (hospedagem do site), além dos serviços de notificação push do seu aparelho (Apple, Google ou Microsoft), o Telegram (apenas se você vincular, para o bot de lançamento) e o Google Gemini (leitura de fotos e assistente de IA). Eles tratam os dados só para prestar o serviço, sob contrato.",
          "Autoridades públicas e judiciais, quando houver obrigação legal ou ordem válida.",
          "Não vendemos nem alugamos dados pessoais.",
        ] },
        { t: "6. Transferência internacional", p: [
          "Alguns fornecedores podem armazenar ou processar dados fora do Brasil. Nesses casos, adotamos as garantias previstas na LGPD (art. 33), como cláusulas contratuais e fornecedores com padrões de segurança reconhecidos.",
        ] },
        { t: "7. Por quanto tempo guardamos", p: [
          "Conta e dados de cadastro: enquanto você tiver conta e acesso ao app. Depois do desligamento ou da exclusão da conta, o acesso é encerrado e os dados de cadastro são eliminados ou anonimizados quando deixarem de ser necessários.",
          "Registros de auditoria, baixas, rondas e perdas: mantidos pelo prazo necessário para controle operacional, contábil e fiscal e para defesa em processos (em regra, até 5 anos), podendo ser anonimizados antes.",
          "Registros de login e aceite dos termos: mantidos por pelo menos 6 meses (Marco Civil da Internet) e enquanto necessários para comprovar o aceite.",
          "Telegram: o vínculo fica até você ou um gestor removê-lo (ou até o fim do acesso); mensagens do bot e sessões de lançamento são apagadas em até 30 dias; códigos de vínculo vencem em 10 minutos.",
          "Conversas com o assistente de IA: mantidas pelo tempo necessário à operação e ao suporte e eliminadas quando não forem mais úteis.",
        ] },
        { t: "8. Como protegemos", p: [
          "Conexão criptografada (HTTPS), senhas protegidas pelo serviço de autenticação, controle de acesso por cargo e loja no banco de dados (RLS), trilha de auditoria e registro de login.",
          "Proteção contra abuso: limitamos quantas requisições cada conta (ou, sem login, cada endereço IP) pode fazer por minuto. Esses contadores são temporários (apagados em poucas horas) e servem só para evitar sobrecarga e ataques. Também usamos cabeçalhos de segurança no site, bloqueio de acesso de quem não está logado e funções internas trancadas.",
          "Nenhum sistema é 100% seguro. Se houver incidente que possa causar risco relevante, avisaremos você e a Autoridade Nacional de Proteção de Dados (ANPD) nos termos da lei.",
        ] },
        { t: "9. Seus direitos", p: [
          "Você pode pedir: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; informação sobre com quem compartilhamos; informação sobre a possibilidade de não consentir e suas consequências; e revogação do consentimento.",
          "Faça o pedido em Mais → Privacidade e termos. Respondemos em até 15 dias. Veja o documento “Seus direitos” para detalhes. Você também pode reclamar à ANPD (gov.br/anpd).",
        ] },
        { t: "10. Crianças e adolescentes", p: [
          "O app é para maiores de 18 anos e não é direcionado a crianças. Se identificarmos dados de menor, eles serão excluídos.",
        ] },
        { t: "11. Mudanças nesta política", p: [
          `Esta é a versão ${TERMOS_VERSAO}. Quando mudarmos algo relevante, avisaremos no app e pediremos um novo aceite.`,
        ] },
      ];
    },
  },
  {
    id: "direitos", titulo: "Seus direitos (LGPD)", resumo: "O que você pode pedir e como", Icone: FileText, cor: "#1F7A4D",
    secoes: () => [
      { t: "O que você pode pedir", p: [
        "Acesso: receber uma cópia dos seus dados. No app, em Mais → Privacidade e termos → Baixar meus dados.",
        "Correção: corrigir dado incompleto, inexato ou desatualizado.",
        "Eliminação, anonimização ou bloqueio: de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD.",
        "Portabilidade: receber seus dados em formato estruturado (o arquivo baixado já vem em JSON).",
        "Informação: saber com quem seus dados foram compartilhados.",
        "Oposição: se discordar de um tratamento feito sem consentimento, pedir revisão.",
        "Revogação do consentimento: a qualquer momento, sem custo, sem afetar o que já foi feito.",
        "Revisão de decisões automatizadas: pedir revisão humana. As sugestões de risco e de IA do app são apoio; a decisão é sempre de uma pessoa.",
      ] },
      { t: "Como pedir", p: [
        "Abra Mais → Privacidade e termos → Solicitar um direito, escolha o tipo, descreva o pedido e envie. Você acompanha o andamento na mesma tela.",
        "Para sua segurança, o pedido só pode ser feito logado na sua conta. Podemos pedir informações extras para confirmar quem você é.",
      ] },
      { t: "Prazos e limites", p: [
        "Respondemos em até 15 dias. Alguns dados não podem ser apagados na hora porque a lei ou o contrato exige guardá-los (por exemplo, registros fiscais, trabalhistas e de segurança). Nesse caso, explicamos o motivo e o prazo.",
        "Pedidos de eliminação de conta podem depender de quem administra a sua loja no app; avisaremos o que for possível.",
      ] },
      { t: "Se não ficar satisfeito", p: [
        "Você pode reclamar diretamente à Autoridade Nacional de Proteção de Dados (ANPD) em gov.br/anpd e procurar os órgãos de defesa do consumidor ou a Justiça.",
      ] },
    ],
  },
  {
    id: "armazenamento", titulo: "Armazenamento e permissões", resumo: "Cookies, câmera, microfone e notificações", Icone: Smartphone, cor: "#C2570C",
    secoes: () => [
      { t: "Armazenamento no aparelho (cookies e similares)", p: [
        "Usamos apenas armazenamento essencial: manter você conectado, guardar o tema, lembrar versões já vistas, guardar ações feitas sem internet para enviar depois e deixar o app abrir mais rápido (cache do aplicativo instalável).",
        "Não usamos cookies de publicidade, nem rastreadores de terceiros para marketing. Por serem essenciais, esses itens não dependem de consentimento; você pode limpá-los nas configurações do navegador, mas o app pode deixar de funcionar direito.",
      ] },
      { t: "Câmera", p: [
        "Usada só para bipar códigos de barras, ler o crachá no cadastro e tirar fotos de produtos ou ocorrências. A imagem da câmera de leitura não é gravada; só o código lido é usado.",
      ] },
      { t: "Microfone e voz", p: [
        "Usado só quando você toca no botão de voz. O reconhecimento é feito pelo seu navegador/aparelho e pode ser enviado ao fornecedor dele para virar texto. Você pode digitar no lugar.",
        "Para não pedir a permissão toda hora, guardamos neste aparelho só um aviso de que você já liberou o microfone. O app não grava áudio: o microfone só fica ativo enquanto você fala. Por segurança, o app também recusa por voz datas já passadas, quantidades e preços impossíveis.",
      ] },
      { t: "Notificações", p: [
        "Só enviamos alertas de validade, avisos e rondas depois que você autorizar. Para desligar: sino no topo do app ou nas configurações do aparelho.",
      ] },
      { t: "Localização", p: [
        "O app não pede nem usa a sua localização.",
      ] },
    ],
  },
];

// ───────────────────────── Leitor em tela cheia ─────────────────────────
export function LegalLeitor({ T, docId, onFechar }) {
  const doc = DOCUMENTOS.find((d) => d.id === docId) || DOCUMENTOS[0];
  useEffect(() => {
    const ant = document.body.style.overflow;
    return () => { document.body.style.overflow = ant; };
  }, []);
  const secoes = doc.secoes();
  return createPortal(
    <motion.div role="dialog" aria-modal="true" aria-label={doc.titulo} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 38 }}
      style={{ background: T.bg, color: T.text }} className="fixed inset-0 z-[95] flex flex-col">
      <div style={{ background: FUNDO_MARCA, isolation: "isolate" }} className="relative shrink-0 text-white px-4 pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] rounded-b-[28px] shadow-lg shadow-black/15">
        <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "20px 20px" }} />
        <div className="relative flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={onFechar} aria-label="Voltar" className="h-10 w-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.28)" }}><ArrowLeft size={18} /></motion.button>
          <div className="min-w-0">
            <h2 className="text-[19px] font-extrabold leading-tight truncate">{doc.titulo}</h2>
            <p className="text-[12px] text-white/75">Versão {TERMOS_VERSAO}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="max-w-xl mx-auto">
          {secoes.map((s, i) => (
            <motion.section key={s.t} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.25) }}
              style={{ background: T.card }} className="rounded-[22px] shadow-md shadow-black/5 p-4 mb-3">
              <h3 style={{ color: T.text }} className="text-[14px] font-extrabold mb-2">{s.t}</h3>
              <div className="flex flex-col gap-2">
                {s.p.map((par, k) => <p key={k} style={{ color: T.subtext }} className="text-[13px] leading-relaxed">{par}</p>)}
              </div>
            </motion.section>
          ))}
          <p style={{ color: T.subtext }} className="text-[11px] text-center mt-4 px-4">Texto de referência para o uso do app. Em caso de dúvida, fale com o responsável pelo próprio app.</p>
        </div>
      </div>
    </motion.div>,
    document.body
  );
}

// ───────────────────────── Caixa de aceite ─────────────────────────
export function AceiteCampo({ T, aceito, onChange, onAbrir, erro }) {
  return (
    <div>
      <button type="button" role="checkbox" aria-checked={aceito} onClick={() => onChange(!aceito)} className="w-full flex items-start gap-3 text-left rounded-2xl p-3.5"
        style={{ background: aceito ? "rgba(31,157,85,.10)" : T.chipBg, border: `1.5px solid ${erro && !aceito ? VERM : aceito ? "#1F9D55" : T.inputBorder}` }}>
        <span className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition" style={{ background: aceito ? "#1F9D55" : "transparent", border: `2px solid ${aceito ? "#1F9D55" : T.subtext}` }}>
          {aceito && <Check size={15} color="#fff" strokeWidth={3} />}
        </span>
        <span style={{ color: T.text }} className="text-[13px] leading-snug">
          Li e concordo com os{" "}
          <span role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); onAbrir("termos"); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onAbrir("termos"); } }} style={{ color: AZUL }} className="font-bold underline">Termos de Uso</span>,{" "}
          a <span role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); onAbrir("privacidade"); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onAbrir("privacidade"); } }} style={{ color: AZUL }} className="font-bold underline">Política de Privacidade</span>{" "}
          e o tratamento dos meus dados conforme a LGPD.
        </span>
      </button>
      {erro && !aceito && <p className="text-[12px] font-semibold mt-1.5 px-1" style={{ color: VERM }}>Para continuar, aceite os termos.</p>}
    </div>
  );
}

// Links discretos (rodapé do login)
export function LinksLegais({ T, onAbrir }) {
  return (
    <p style={{ color: T.subtext }} className="text-[11.5px] text-center leading-relaxed">
      <button type="button" onClick={() => onAbrir("termos")} className="font-semibold underline">Termos de Uso</button>{" · "}
      <button type="button" onClick={() => onAbrir("privacidade")} className="font-semibold underline">Privacidade</button>{" · "}
      <button type="button" onClick={() => onAbrir("direitos")} className="font-semibold underline">Seus direitos (LGPD)</button>
    </p>
  );
}

// ───────────────────────── Aceite obrigatório (quem já tem conta) ─────────────────────────
export function AceiteObrigatorio({ T, nome, onAceitar, onSair }) {
  const [aceito, setAceito] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [leitor, setLeitor] = useState(null);
  const [anterior, setAnterior] = useState(() => { try { return localStorage.getItem(CHAVE_ACEITE_LOCAL); } catch { return null; } });
  useEffect(() => {
    // última versão que a pessoa aceitou (no banco); se não achar, usa a do aparelho
    supabase.from("consentimentos").select("versao").order("aceito_em", { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]?.versao) setAnterior((a) => (a && a > data[0].versao ? a : data[0].versao)); });
  }, []);
  // só o que entrou depois da versão que ela já aceitou (null = primeira vez: mostra os documentos completos)
  const mudancas = anterior && anterior !== TERMOS_VERSAO
    ? DOCUMENTOS.map((d) => ({ d, itens: TERMOS_ALTERACOES.filter((a) => a.versao > anterior).flatMap((a) => a.docs[d.id] || []) })).filter((x) => x.itens.length)
    : null;
  async function confirmar() {
    if (!aceito) { setTentou(true); return; }
    setOcupado(true);
    await onAceitar();
    setOcupado(false);
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Aceite dos termos" style={{ background: T.bg, color: T.text }} className="fixed inset-0 z-[90] flex flex-col overflow-y-auto">
      <div style={{ background: FUNDO_MARCA, isolation: "isolate" }} className="relative shrink-0 text-white px-5 pb-8 pt-[calc(env(safe-area-inset-top)+2rem)] rounded-b-[32px] shadow-lg shadow-black/15 text-center">
        <div aria-hidden className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.4px)", backgroundSize: "22px 22px" }} />
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="relative mx-auto h-16 w-16 rounded-[22px] bg-white flex items-center justify-center shadow-xl shadow-black/25"><Lock size={28} color={AZUL} /></motion.div>
        <h1 className="relative text-[24px] font-extrabold mt-4 leading-tight">Antes de continuar{nome ? `, ${String(nome).trim().split(/\s+/)[0]}` : ""}</h1>
        <p className="relative text-[13.5px] text-white/80 mt-1.5 max-w-xs mx-auto">{mudancas?.length ? "Atualizamos os Termos e a Privacidade. Veja só o que mudou e aceite para continuar." : "Atualizamos os Termos de Uso e a Política de Privacidade (LGPD). Leia e aceite para usar o app."}</p>
      </div>
      <div className="flex-1 px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-w-md w-full mx-auto">
        {mudancas?.length ? (
          <div className="flex flex-col gap-2.5 mb-4">
            {mudancas.map(({ d, itens }) => (
              <div key={d.id} style={{ background: T.card }} className="rounded-[20px] shadow-md shadow-black/5 p-3.5">
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${d.cor}1F` }}><d.Icone size={16} color={d.cor} /></span>
                  <span className="text-[14px] font-extrabold" style={{ color: T.text }}>{d.titulo}</span>
                  <span style={{ background: "#E4F7EC", color: "#1F9D55" }} className="ml-auto text-[10.5px] font-bold px-2 py-0.5 rounded-full">Novo</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {itens.map((t, i) => <li key={i} style={{ color: T.subtext }} className="text-[12.5px] leading-relaxed pl-3 relative"><span style={{ background: AZUL }} className="absolute left-0 top-[7px] h-1.5 w-1.5 rounded-full" />{t}</li>)}
                </ul>
                <button onClick={() => setLeitor(d.id)} style={{ color: AZUL }} className="text-[12px] font-bold mt-2.5">Ler o documento completo</button>
              </div>
            ))}
          </div>
        ) : (
        <div className="flex flex-col gap-2.5 mb-4">
          {DOCUMENTOS.map((d) => (
            <motion.button key={d.id} whileTap={{ scale: 0.98 }} onClick={() => setLeitor(d.id)} style={{ background: T.card }} className="rounded-[20px] shadow-md shadow-black/5 p-3.5 flex items-center gap-3 text-left">
              <span className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${d.cor}1F` }}><d.Icone size={19} color={d.cor} /></span>
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-extrabold" style={{ color: T.text }}>{d.titulo}</span><span className="block text-[12px]" style={{ color: T.subtext }}>{d.resumo}</span></span>
              <ChevronRight size={16} color={T.subtext} />
            </motion.button>
          ))}
        </div>
        )}
        <AceiteCampo T={T} aceito={aceito} onChange={setAceito} onAbrir={setLeitor} erro={tentou} />
        <motion.button whileTap={{ scale: 0.98 }} onClick={confirmar} disabled={ocupado} className="w-full mt-4 rounded-2xl py-3.5 text-[15px] font-extrabold text-white flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: aceito ? `linear-gradient(135deg, ${AZUL} 0%, ${AZUL_ESC} 100%)` : "#8A97A8" }}>
          {ocupado ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Aceitar e continuar
        </motion.button>
        <button onClick={onSair} style={{ color: T.subtext }} className="w-full text-[13px] font-semibold py-3 mt-1">Não aceito — sair</button>
      </div>
      <AnimatePresence>{leitor && <LegalLeitor T={T} docId={leitor} onFechar={() => setLeitor(null)} />}</AnimatePresence>
    </div>
  );
}

// ───────────────────────── Página “Privacidade e termos” (Mais) ─────────────────────────
const TIPOS_PEDIDO = [
  ["acesso", "Acessar meus dados"], ["correcao", "Corrigir dados"], ["exclusao", "Eliminar dados"], ["portabilidade", "Portabilidade"],
  ["informacao", "Com quem compartilham"], ["oposicao", "Oposição ao tratamento"], ["revogacao", "Revogar consentimento"], ["encarregado", "Falar com o responsável"],
];
const STATUS_PEDIDO = { aberta: ["Aberta", "#C2760C", "#FCF0DD"], em_analise: ["Em análise", "#1F5FBF", "#E6F0FF"], respondida: ["Respondida", "#1F9D55", "#E4F7EC"], negada: ["Negada", "#A81419", "#FDECEE"] };

export function PaginaPrivacidade({ T, dark, perfil, showToast }) {
  const [leitor, setLeitor] = useState(null);
  const [aceites, setAceites] = useState(null);
  const [pedidos, setPedidos] = useState(null);
  const [tipo, setTipo] = useState("acesso");
  const [detalhe, setDetalhe] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const cartao = { background: T.card };

  async function carregar() {
    try {
      const { data: a } = await supabase.from("consentimentos").select("versao, aceito_em, documento").order("aceito_em", { ascending: false }).limit(20);
      setAceites(a || []);
    } catch { setAceites([]); }
    try {
      const { data: p } = await supabase.from("solicitacoes_lgpd").select("id, tipo, detalhe, status, resposta, criado_em").order("criado_em", { ascending: false }).limit(20);
      setPedidos(p || []);
    } catch { setPedidos([]); }
  }
  useEffect(() => { carregar(); }, []);

  async function baixarDados() {
    setBaixando(true);
    try {
      const { data, error } = await supabase.rpc("exportar_meus_dados");
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `meus-dados-condor-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast?.("Arquivo com seus dados baixado.");
    } catch (e) {
      console.error(e);
      showToast?.("Não foi possível baixar agora. Envie um pedido de acesso abaixo.", "warn");
    }
    setBaixando(false);
  }

  async function enviarPedido() {
    if (detalhe.trim().length < 5) { showToast?.("Descreva o seu pedido (mínimo de 5 letras).", "warn"); return; }
    setEnviando(true);
    try {
      const { error } = await supabase.rpc("criar_solicitacao_lgpd", { p_tipo: tipo, p_detalhe: detalhe.trim().slice(0, 1000) });
      if (error) throw error;
      setDetalhe("");
      showToast?.("Pedido enviado. Respondemos em até 15 dias.");
      carregar();
    } catch (e) {
      console.error(e);
      showToast?.("Não foi possível enviar agora. Tente de novo em instantes.", "warn");
    }
    setEnviando(false);
  }

  const fmt = (iso) => { try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; } };
  return (
    <div className="flex flex-col gap-3.5">
      <section style={cartao} className="rounded-[24px] shadow-lg shadow-black/5 p-2">
        {DOCUMENTOS.map((d) => (
          <motion.button key={d.id} whileTap={{ scale: 0.98 }} onClick={() => setLeitor(d.id)} className="w-full flex items-center gap-3 text-left p-2.5 rounded-2xl">
            <span className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${d.cor}1F` }}><d.Icone size={19} color={d.cor} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[14px] font-extrabold" style={{ color: T.text }}>{d.titulo}</span><span className="block text-[12px]" style={{ color: T.subtext }}>{d.resumo}</span></span>
            <ChevronRight size={16} color={T.subtext} />
          </motion.button>
        ))}
      </section>

      <section style={cartao} className="rounded-[24px] shadow-lg shadow-black/5 p-4">
        <p style={{ color: T.text }} className="text-[14px] font-extrabold">Seus aceites</p>
        {aceites === null ? <Loader2 size={16} className="animate-spin mt-2" color={T.subtext} /> : aceites.length === 0 ? (
          <p style={{ color: T.subtext }} className="text-[12.5px] mt-1.5">Versão atual: {TERMOS_VERSAO}. {lerAceiteLocal() ? "Aceite registrado neste aparelho." : "Ainda sem aceite registrado."}</p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            {aceites.map((a, i) => (
              <p key={i} style={{ color: T.subtext }} className="text-[12.5px] flex items-center gap-1.5"><Check size={13} color="#1F9D55" /> Termos e Privacidade · versão {a.versao} · {fmt(a.aceito_em)}</p>
            ))}
          </div>
        )}
      </section>

      <section style={cartao} className="rounded-[24px] shadow-lg shadow-black/5 p-4">
        <p style={{ color: T.text }} className="text-[14px] font-extrabold">Meus dados</p>
        <p style={{ color: T.subtext }} className="text-[12.5px] mt-1 leading-snug">Baixe uma cópia dos dados que temos sobre você (cadastro, aceites, logins, registros e pedidos), em JSON.</p>
        <motion.button whileTap={{ scale: 0.97 }} onClick={baixarDados} disabled={baixando} className="mt-3 rounded-2xl py-3 px-4 text-[13.5px] font-extrabold text-white flex items-center justify-center gap-2 w-full disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${AZUL} 0%, ${AZUL_ESC} 100%)` }}>
          {baixando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Baixar meus dados
        </motion.button>
      </section>

      <section style={cartao} className="rounded-[24px] shadow-lg shadow-black/5 p-4">
        <p style={{ color: T.text }} className="text-[14px] font-extrabold">Solicitar um direito</p>
        <p style={{ color: T.subtext }} className="text-[12.5px] mt-1 leading-snug">Corrigir, eliminar, revogar consentimento ou falar com o responsável. Respondemos em até 15 dias.</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {TIPOS_PEDIDO.map(([id, rot]) => (
            <motion.button key={id} whileTap={{ scale: 0.94 }} onClick={() => setTipo(id)} aria-pressed={tipo === id} className="text-[12px] font-bold rounded-full px-3 py-2"
              style={tipo === id ? { background: AZUL_ESC, color: "#fff" } : { background: T.chipBg, color: T.text }}>{rot}</motion.button>
          ))}
        </div>
        <textarea value={detalhe} onChange={(e) => setDetalhe(e.target.value)} rows={3} maxLength={1000} placeholder="Descreva o que você precisa…"
          style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full mt-3 border rounded-2xl px-3.5 py-3 text-sm outline-none focus:ring-2 resize-none" />
        <motion.button whileTap={{ scale: 0.97 }} onClick={enviarPedido} disabled={enviando} className="mt-3 rounded-2xl py-3 px-4 text-[13.5px] font-extrabold text-white flex items-center justify-center gap-2 w-full disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${VERM} 0%, #A81419 100%)` }}>
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar pedido
        </motion.button>
      </section>

      {pedidos && pedidos.length > 0 && (
        <section style={cartao} className="rounded-[24px] shadow-lg shadow-black/5 p-4">
          <p style={{ color: T.text }} className="text-[14px] font-extrabold mb-2">Meus pedidos</p>
          <div className="flex flex-col gap-2">
            {pedidos.map((p) => {
              const [rot, cor, bg] = STATUS_PEDIDO[p.status] || STATUS_PEDIDO.aberta;
              return (
                <div key={p.id} style={{ background: T.chipBg }} className="rounded-2xl px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2"><span style={{ color: T.text }} className="text-[13px] font-bold">{(TIPOS_PEDIDO.find((t) => t[0] === p.tipo) || [0, p.tipo])[1]}</span><span style={{ background: bg, color: cor }} className="text-[10.5px] font-bold rounded-full px-2.5 py-1">{rot}</span></div>
                  <p style={{ color: T.subtext }} className="text-[12px] mt-1 leading-snug">{p.detalhe}</p>
                  {p.resposta && <p style={{ color: T.text }} className="text-[12px] mt-1.5 leading-snug"><b>Resposta:</b> {p.resposta}</p>}
                  <p style={{ color: T.subtext }} className="text-[10.5px] mt-1 font-mono">{fmt(p.criado_em)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <AnimatePresence>{leitor && <LegalLeitor T={T} docId={leitor} onFechar={() => setLeitor(null)} />}</AnimatePresence>
    </div>
  );
}

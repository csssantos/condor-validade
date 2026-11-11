// Modelos de e-mail da Bipi Tech (HTML responsivo, compatível com Gmail/Outlook: tabelas + estilos inline).
// Identidade = tela de carregamento do app: degradê azul radial (#1B6FD1 → #0B4F9E → #061C3A), pontinhos
// vermelho/âmbar/verde, marca em texto (logo oficial pendente), mascote Bipi (sem placa) e botão vermelho (#E31E24).

export type Marca = { assets: string; nome: string; suporte: string };

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// só aceita http(s): um link nunca vira "javascript:" dentro do e-mail
export const urlSegura = (u: string) => (/^https:\/\/[^\s"'<>]+$/i.test(u) || /^http:\/\/localhost[:/]/i.test(u) ? u : "");

type Peca = {
  assunto: string; preheader: string; selo: string; titulo: string;
  saudacao?: string; paragrafos: string[]; botao?: { texto: string; url: string };
  codigo?: string; linkAlt?: string; caixa?: { titulo: string; texto: string; tom?: "az" | "verm" };
  aviso?: string; detalhes?: [string, string][];
};

function pontos() {
  const cores = ["#E31E24", "#F5A524", "#34C77B"];
  return cores.map((c) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px;"></span>`).join("");
}

export function montar(p: Peca, m: Marca): { subject: string; html: string; text: string } {
  const bipi = `${m.assets}/bipi-acenando.png`;
  const btn = p.botao && urlSegura(p.botao.url)
    ? `<tr><td align="center" style="padding:6px 0 4px;"><a href="${esc(p.botao.url)}" target="_blank" style="display:inline-block;background:#E31E24;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:.04em;padding:15px 30px;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">${esc(p.botao.texto)}</a></td></tr>` : "";
  const cod = p.codigo
    ? `<tr><td align="center" style="padding:6px 0 10px;"><div style="display:inline-block;background:#F2F6FC;border:1px solid #DCE6F4;border-radius:12px;padding:14px 22px;font-family:'Courier New',monospace;font-size:28px;letter-spacing:.3em;font-weight:700;color:#082F5E;">${esc(p.codigo)}</div></td></tr>` : "";
  const alt = p.linkAlt && urlSegura(p.linkAlt)
    ? `<tr><td style="padding:14px 0 0;font-size:12.5px;line-height:1.55;color:#6A809E;">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="${esc(p.linkAlt)}" style="color:#0B4F9E;word-break:break-all;">${esc(p.linkAlt)}</a></td></tr>` : "";
  const cx = p.caixa
    ? `<tr><td style="padding:14px 0 0;"><div style="background:${p.caixa.tom === "verm" ? "#FDEDEE" : "#F2F6FC"};border:1px solid ${p.caixa.tom === "verm" ? "#F6C7C9" : "#DCE6F4"};border-radius:12px;padding:13px 16px;font-size:14px;line-height:1.55;color:#27415F;"><b style="color:${p.caixa.tom === "verm" ? "#B3141A" : "#0B4F9E"};">${esc(p.caixa.titulo)}</b><br>${esc(p.caixa.texto)}</div></td></tr>` : "";
  const det = p.detalhes?.length
    ? `<tr><td style="padding:14px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DCE6F4;border-radius:12px;background:#F8FAFD;">${p.detalhes.map(([k, v]) => `<tr><td style="padding:9px 14px;font-size:13px;color:#6A809E;width:38%;">${esc(k)}</td><td style="padding:9px 14px;font-size:14px;color:#0F2744;font-weight:600;">${esc(v)}</td></tr>`).join("")}</table></td></tr>` : "";
  const av = p.aviso ? `<tr><td style="padding:16px 0 0;font-size:13px;line-height:1.55;color:#6A809E;">${esc(p.aviso)}</td></tr>` : "";
  const paras = p.paragrafos.map((t) => `<tr><td style="padding:0 0 12px;font-size:15.5px;line-height:1.6;color:#27415F;">${t}</td></tr>`).join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(p.assunto)}</title>
<style>@media (max-width:520px){.c{width:100%!important;border-radius:0!important}.px{padding-left:20px!important;padding-right:20px!important}.h{font-size:22px!important}.bp{width:92px!important;height:92px!important}}</style></head>
<body style="margin:0;padding:0;background:#E9EEF6;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#E9EEF6;">${esc(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#E9EEF6"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="c" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">
<tr><td class="px" bgcolor="#0B4F9E" style="background:#0B4F9E;background-image:radial-gradient(120% 120% at 50% 0%,#1B6FD1 0%,#0B4F9E 45%,#061C3A 100%);padding:26px 30px 0;color:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="top"><div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:.16em;color:#ffffff;">BIPI <span style="font-weight:400;letter-spacing:.16em;">TECH</span></div><div style="margin-top:14px;">${pontos()}</div>
<div style="display:inline-block;margin-top:16px;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);font-size:11px;font-weight:700;letter-spacing:.12em;color:#fff;">${esc(p.selo)}</div>
<div class="h" style="margin:12px 0 26px;font-size:26px;line-height:1.2;font-weight:700;color:#ffffff;">${esc(p.titulo)}</div></td>
<td width="120" valign="bottom" align="right"><img class="bp" src="${esc(bipi)}" width="120" height="120" alt="Bipi, mascote da Bipi Tech" style="display:block;border:0;outline:none;text-decoration:none;"></td>
</tr></table></td></tr>
<tr><td class="px" style="padding:28px 30px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${p.saudacao ? `<tr><td style="padding:0 0 12px;font-size:16px;color:#0F2744;">${p.saudacao}</td></tr>` : ""}${paras}${cod}${btn}${cx}${det}${alt}${av}
</table></td></tr>
<tr><td class="px" style="padding:20px 30px 28px;border-top:1px solid #E6EDF7;font-size:12px;line-height:1.6;color:#6A809E;"><b style="color:#0B4F9E;">${esc(m.nome)}</b> · tecnologia para controle de validade<br>Mensagem automática, não responda este e-mail. ${esc(m.suporte)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [p.titulo, "", ...(p.saudacao ? [p.saudacao.replace(/<[^>]+>/g, "")] : []), ...p.paragrafos.map((t) => t.replace(/<[^>]+>/g, "")),
    ...(p.codigo ? ["", `Código: ${p.codigo}`] : []), ...(p.botao ? ["", `${p.botao.texto}: ${p.botao.url}`] : []),
    ...(p.caixa ? ["", `${p.caixa.titulo}: ${p.caixa.texto}`] : []), ...(p.detalhes || []).map(([k, v]) => `${k}: ${v}`),
    ...(p.aviso ? ["", p.aviso] : []), "", `${m.nome} · mensagem automática`].join("\n");
  return { subject: p.assunto, html, text };
}

const nomeDe = (n?: string) => (n && n.trim() ? esc(n.trim().split(/\s+/)[0]) : "");
const ola = (n?: string) => (nomeDe(n) ? `Olá, <b>${nomeDe(n)}</b>!` : "Olá!");

export type Tipo = "signup" | "recovery" | "invite" | "magiclink" | "email_change" | "reauthentication";

export function modelo(tipo: Tipo, d: { nome?: string; link?: string; codigo?: string; validadeMin: number; email?: string }, m: Marca) {
  const val = d.validadeMin >= 60 && d.validadeMin % 60 === 0 ? `${d.validadeMin / 60} hora${d.validadeMin > 60 ? "s" : ""}` : `${d.validadeMin} minutos`;
  const link = d.link || "";
  switch (tipo) {
    case "signup":
      return montar({
        assunto: "Confirme seu cadastro na Bipi Tech", preheader: "Falta só confirmar seu e-mail para entrar.", selo: "CONFIRMAÇÃO", titulo: "Bem-vindo à Bipi Tech!",
        saudacao: ola(d.nome),
        paragrafos: ["Seu cadastro foi criado. Para ativar a conta, precisamos confirmar que este endereço de e-mail é seu."],
        botao: { texto: "CONFIRMAR MINHA CONTA", url: link }, linkAlt: link,
        caixa: { titulo: "Não foi você?", texto: "Se você não fez este cadastro, ignore este e-mail. Nada será ativado e nenhuma ação é necessária." },
        aviso: `Por segurança, o link vale por tempo limitado (${val}) e só pode ser usado uma vez.`,
      }, m);
    case "recovery":
      return montar({
        assunto: "Recuperação de acesso — Bipi Tech", preheader: "Use o botão para criar uma nova senha.", selo: "SEGURANÇA", titulo: "Vamos recuperar seu acesso",
        saudacao: ola(d.nome),
        paragrafos: ["Recebemos um pedido para redefinir a senha da sua conta. Toque no botão abaixo para criar uma nova senha."],
        botao: { texto: "REDEFINIR MINHA SENHA", url: link }, linkAlt: link,
        caixa: { titulo: "Não pediu isso?", texto: "Ignore esta mensagem. Sua senha continua a mesma e ninguém acessa sua conta sem este link.", tom: "verm" },
        aviso: `O link vale por ${val} e só funciona uma vez. A Bipi Tech nunca pede sua senha por e-mail ou mensagem.`,
      }, m);
    case "invite":
      return montar({
        assunto: "Você recebeu um convite — Bipi Tech", preheader: "Aceite o convite para acessar a Bipi Tech.", selo: "CONVITE", titulo: "Você foi convidado",
        saudacao: ola(d.nome), paragrafos: ["Você recebeu um convite para acessar a Bipi Tech. Toque no botão para aceitar e criar seu acesso."],
        botao: { texto: "ACEITAR CONVITE", url: link }, linkAlt: link,
        aviso: "Se você não esperava este convite, pode ignorar esta mensagem.",
      }, m);
    case "magiclink":
      return montar({
        assunto: "Seu link de acesso — Bipi Tech", preheader: "Entre na Bipi Tech com um toque.", selo: "ACESSO", titulo: "Seu link de acesso",
        saudacao: ola(d.nome), paragrafos: ["Use o botão abaixo para entrar na sua conta."],
        botao: { texto: "ENTRAR", url: link }, linkAlt: link,
        aviso: `O link vale por ${val} e só funciona uma vez. Se não foi você, ignore.`,
      }, m);
    case "email_change":
      return montar({
        assunto: "Confirme a troca de e-mail — Bipi Tech", preheader: "Confirme a alteração do e-mail da sua conta.", selo: "SEGURANÇA", titulo: "Confirmar troca de e-mail",
        saudacao: ola(d.nome), paragrafos: ["Recebemos um pedido para alterar o e-mail da sua conta. Confirme para concluir a mudança."],
        botao: { texto: "CONFIRMAR TROCA", url: link }, linkAlt: link,
        caixa: { titulo: "Não foi você?", texto: "Não confirme. Entre na sua conta e troque a senha.", tom: "verm" },
        aviso: `O link vale por ${val} e só funciona uma vez.`,
      }, m);
    case "reauthentication":
      return montar({
        assunto: "Código de confirmação — Bipi Tech", preheader: "Use este código para confirmar a operação.", selo: "SEGURANÇA", titulo: "Seu código de confirmação",
        saudacao: ola(d.nome), paragrafos: ["Digite o código abaixo no aplicativo para confirmar a operação."], codigo: d.codigo,
        aviso: "Não compartilhe este código com ninguém. A Bipi Tech nunca pede o código por telefone ou mensagem.",
      }, m);
  }
}

// Avisos e notificações do app (no-reply). A lista de tipos é FIXA: o chamador não envia HTML nem remetente.
export type Aviso = { titulo: string; mensagem: string; detalhes?: [string, string][]; botao?: { texto: string; url: string }; tom?: "az" | "verm" };
const hostOficial = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && !x.username && !x.password && (x.hostname === "usebipi.com" || x.hostname.endsWith(".usebipi.com")); } catch { return false; } };
export function modeloAviso(a: Aviso, m: Marca) {
  const botao = a.botao && hostOficial(a.botao.url) ? a.botao : undefined; // aviso só leva link para usebipi.com (nunca para site de terceiros)
  const assunto = a.titulo.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").trim().slice(0, 120); // sem quebra de linha no assunto
  return montar({
    assunto, preheader: a.mensagem.slice(0, 90), selo: a.tom === "verm" ? "AVISO IMPORTANTE" : "NOTIFICAÇÃO", titulo: a.titulo,
    paragrafos: [esc(a.mensagem)], detalhes: a.detalhes, botao,
  }, m);
}

// Remetente por tipo (o Supabase Auth só aceita UM remetente no SMTP; por isso o hook de envio).
export const REMETENTE: Record<string, string> = {
  signup: "confirmation", invite: "confirmation", email_change: "confirmation",
  recovery: "recovery", magiclink: "recovery", reauthentication: "recovery",
  aviso: "no-reply",
};

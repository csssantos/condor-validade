import { build } from "/opt/npm-tools/node_modules/esbuild/lib/main.js";
import { createHmac } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const raiz = new URL(".", import.meta.url).pathname;
const fn = raiz + "supabase/functions/auth-email/";
import { tmpdir } from "node:os";
const dir = tmpdir() + "/auth-email-teste/";
mkdirSync(dir + ".out", { recursive: true });
await build({ entryPoints: [fn + "index.ts"], bundle: true, format: "esm", outfile: dir + ".out/hook.mjs", platform: "node", logLevel: "error" });
const H = await import(dir + ".out/hook.mjs");

let ok = 0, falhas = 0;
const t = async (nome, fn) => { try { await fn(); ok++; console.log("ok  ", nome); } catch (e) { falhas++; console.log("FALHA", nome, "\n     ", e.message); } };

const SEG = Buffer.from("segredo-de-teste-1234567890abcdef").toString("base64");
const SECRET = `v1,whsec_${SEG}`;
const assina = (id, ts, corpo) => "v1," + createHmac("sha256", Buffer.from(SEG, "base64")).update(`${id}.${ts}.${corpo}`).digest("base64");
const env = (extra = {}) => (k) => ({ SEND_EMAIL_HOOK_SECRET: SECRET, RESEND_API_KEY: "re_teste", SUPABASE_URL: "https://proj.supabase.co", SITE_URL: "https://app.usebipi.com", ...extra })[k];
const pedido = (corpoObj, { id = "msg_1", ts = String(Math.floor(Date.now() / 1000)), sig, metodo = "POST" } = {}) => {
  const corpo = JSON.stringify(corpoObj);
  return new Request("https://f/auth-email", { method: metodo, body: metodo === "GET" ? undefined : corpo, headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig ?? assina(id, ts, corpo) } });
};
const base = (tipo, extra = {}) => ({ user: { email: "ana@ex.com", user_metadata: { nome: "Ana Souza" }, ...(extra.user || {}) }, email_data: { token_hash: "TH123", redirect_to: "https://app.usebipi.com", email_action_type: tipo, token: "123456", ...(extra.ed || {}) } });

// captura as chamadas ao Resend
const envios = []; let respResend = { ok: true, status: 200 };
globalThis.fetch = async (url, init) => { envios.push({ url, init, body: JSON.parse(init.body) }); return { ok: respResend.ok, status: respResend.status }; };

await t("assinatura correta é aceita", async () => { const r = await H.tratar(pedido(base("signup")), env()); assert.equal(r.status, 200); });
await t("assinatura errada → 401 e nada enviado", async () => { envios.length = 0; const r = await H.tratar(pedido(base("signup"), { sig: "v1,AAAA" }), env()); assert.equal(r.status, 401); assert.equal(envios.length, 0); });
await t("pedido antigo (>5 min) → 401", async () => { envios.length = 0; const r = await H.tratar(pedido(base("signup"), { ts: String(Math.floor(Date.now() / 1000) - 900) }), env()); assert.equal(r.status, 401); assert.equal(envios.length, 0); });
await t("sem segredo configurado → 401 (falha fechada)", async () => { const r = await H.tratar(pedido(base("signup")), (k) => (k === "SEND_EMAIL_HOOK_SECRET" ? "" : env()(k))); assert.equal(r.status, 401); });
await t("GET → 405", async () => { const r = await H.tratar(pedido(base("signup"), { metodo: "GET" }), env()); assert.equal(r.status, 405); });
await t("tipo desconhecido → 400", async () => { const r = await H.tratar(pedido(base("xyz")), env()); assert.equal(r.status, 400); });
await t("e-mail inválido → 400", async () => { const r = await H.tratar(pedido(base("signup", { user: { email: "ruim" } })), env()); assert.equal(r.status, 400); });

for (const [tipo, rem, assunto] of [["signup", "confirmation", "Confirme seu cadastro na Bipi Tech"], ["recovery", "recovery", "Recuperação de acesso — Bipi Tech"]]) {
  await t(`${tipo}: remetente ${rem}@mail.usebipi.com e assunto exato`, async () => {
    envios.length = 0; const r = await H.tratar(pedido(base(tipo)), env()); assert.equal(r.status, 200);
    assert.equal(envios.length, 1); assert.equal(envios[0].body.from, `Bipi Tech <${rem}@mail.usebipi.com>`); assert.equal(envios[0].body.subject, assunto);
    assert.deepEqual(envios[0].body.to, ["ana@ex.com"]);
  });
}
await t("link aponta para /auth/v1/verify do projeto, com token_hash, tipo e redirect permitido", async () => {
  envios.length = 0; await H.tratar(pedido(base("recovery")), env());
  const h = envios[0].body.html; const m = h.match(/https:\/\/proj\.supabase\.co\/auth\/v1\/verify\?[^"<\s]+/);
  assert.ok(m, "link ausente"); const u = new URL(m[0].replace(/&amp;/g, "&"));
  assert.equal(u.searchParams.get("token"), "TH123"); assert.equal(u.searchParams.get("type"), "recovery"); assert.equal(u.searchParams.get("redirect_to"), "https://app.usebipi.com/");
});
await t("redirect_to de outro domínio é trocado pelo SITE_URL (anti open-redirect)", async () => {
  envios.length = 0; await H.tratar(pedido(base("signup", { ed: { redirect_to: "https://malicioso.com/x" } })), env());
  const h = envios[0].body.html; assert.ok(!h.includes("malicioso.com")); assert.ok(h.includes(encodeURIComponent("https://app.usebipi.com")));
});
await t("localhost:3000 do painel não vaza se não estiver na lista", async () => {
  envios.length = 0; await H.tratar(pedido(base("signup", { ed: { redirect_to: "http://localhost:3000" } })), env());
  assert.ok(!envios[0].body.html.includes("localhost"));
});
await t("idempotência: o id do webhook vai como Idempotency-Key (sem duplicar)", async () => {
  envios.length = 0; await H.tratar(pedido(base("signup"), { id: "msg_abc" }), env()); assert.equal(envios[0].init.headers["Idempotency-Key"], "msg_abc");
});
await t("a chave do Resend vai só no cabeçalho, nunca no corpo/HTML", async () => {
  envios.length = 0; await H.tratar(pedido(base("signup")), env()); assert.ok(!JSON.stringify(envios[0].body).includes("re_teste")); assert.equal(envios[0].init.headers.Authorization, "Bearer re_teste");
});
await t("nome com HTML é escapado (sem XSS no e-mail)", async () => {
  envios.length = 0; await H.tratar(pedido(base("signup", { user: { user_metadata: { nome: "<img src=x onerror=alert(1)> Ana" } } })), env());
  assert.ok(!envios[0].body.html.includes("<img src=x")); assert.ok(envios[0].body.html.includes("&lt;img"));
});
await t("reautenticação envia o código e usa recovery@", async () => {
  envios.length = 0; await H.tratar(pedido(base("reauthentication", { ed: { token_hash: "", token: "654321" } })), env());
  assert.ok(envios[0].body.html.includes("654321")); assert.ok(envios[0].body.from.includes("recovery@"));
});
await t("troca de e-mail segura envia 2 e-mails com chaves de idempotência distintas", async () => {
  envios.length = 0; await H.tratar(pedido(base("email_change", { user: { new_email: "novo@ex.com" }, ed: { token_hash_new: "NEW1" } })), env({ EMAIL_CHANGE_ENABLED: "true" }));
  assert.equal(envios.length, 2); assert.notEqual(envios[0].init.headers["Idempotency-Key"], envios[1].init.headers["Idempotency-Key"]);
});
await t("falha do Resend → 502 (o Supabase mostra erro, não finge que enviou)", async () => {
  respResend = { ok: false, status: 429 }; const r = await H.tratar(pedido(base("signup")), env()); respResend = { ok: true, status: 200 }; assert.equal(r.status, 502);
});
await t("sem chave do Resend → 500", async () => { const r = await H.tratar(pedido(base("signup")), (k) => (k === "RESEND_API_KEY" ? undefined : env()(k))); assert.equal(r.status, 500); });
await t("a resposta de erro não contém token nem link", async () => {
  respResend = { ok: false, status: 500 }; const r = await H.tratar(pedido(base("signup")), env()); respResend = { ok: true, status: 200 };
  const txt = await r.text(); assert.ok(!txt.includes("TH123") && !txt.includes("re_teste"));
});
await build({ entryPoints: [fn + "templates.ts"], bundle: true, format: "esm", outfile: dir + ".out/tpl.mjs", platform: "node", logLevel: "error" });
const TPL = await import(dir + ".out/tpl.mjs");
await t("avisos usam no-reply e recuperação/confirmação usam o remetente certo", async () => {
  assert.equal(TPL.REMETENTE.aviso, "no-reply"); assert.equal(TPL.REMETENTE.signup, "confirmation"); assert.equal(TPL.REMETENTE.recovery, "recovery");
});
await t("aviso: título/mensagem dinâmicos são escapados e link javascript: é descartado", async () => {
  const m = TPL.modeloAviso({ titulo: "Acesso <b>revogado</b>", mensagem: "x <script>1</script>", botao: { texto: "Abrir", url: "javascript:alert(1)" } }, { assets: "https://a", nome: "Bipi Tech", suporte: "" });
  assert.ok(!m.html.includes("<script>")); assert.ok(!m.html.includes("javascript:")); assert.ok(m.html.includes("&lt;b&gt;revogado"));
});
await t("todos os e-mails têm versão texto, preheader e botão (exceto código)", async () => {
  for (const tipo of ["signup", "recovery", "invite", "magiclink", "email_change"]) {
    const m = TPL.modelo(tipo, { nome: "Ana", link: "https://proj.supabase.co/auth/v1/verify?token=x", validadeMin: 60 }, { assets: "https://a", nome: "Bipi Tech", suporte: "" });
    assert.ok(m.text.length > 40 && m.html.includes("display:none") && m.html.includes("verify?token=x"), tipo);
  }
});

// ===== Revisão adicional: fluxos, domínio único, troca de e-mail desligada, imagens =====
const verif = (html) => { const m = html.match(/https:\/\/proj\.supabase\.co\/auth\/v1\/verify\?[^"<\s]+/); return m ? new URL(m[0].replace(/&amp;/g, "&")) : null; };
await t("FLUXO confirmação: e-mail único para o cadastrante, assunto, botão, link alternativo, aviso de segurança e type=signup", async () => {
  envios.length = 0; const r = await H.tratar(pedido(base("signup", { user: { email: "novo@ex.com" } })), env()); assert.equal(r.status, 200); assert.equal(envios.length, 1);
  const e = envios[0].body, h = e.html;
  assert.deepEqual(e.to, ["novo@ex.com"]); assert.equal(e.from, "Bipi Tech <confirmation@mail.usebipi.com>"); assert.equal(e.subject, "Confirme seu cadastro na Bipi Tech");
  assert.ok(h.includes("CONFIRMAR MINHA CONTA")); assert.equal(verif(h).searchParams.get("type"), "signup"); assert.equal(verif(h).searchParams.get("token"), "TH123");
  assert.ok(/Se o bot/.test(h), "link alternativo"); assert.ok(/não (foi você|criou|realizou)|ignore/i.test(h), "aviso de segurança");
});
await t("FLUXO recuperação: e-mail único, assunto, botão, validade configurada e aviso de ignorar", async () => {
  envios.length = 0; const r = await H.tratar(pedido(base("recovery")), env({ LINK_VALIDADE_MIN: "30" })); assert.equal(r.status, 200); assert.equal(envios.length, 1);
  const e = envios[0].body, h = e.html;
  assert.equal(e.from, "Bipi Tech <recovery@mail.usebipi.com>"); assert.equal(e.subject, "Recuperação de acesso — Bipi Tech");
  assert.ok(h.includes("REDEFINIR MINHA SENHA")); assert.equal(verif(h).searchParams.get("type"), "recovery"); assert.ok(/30 minutos/.test(h), "validade real"); assert.ok(/ignore/i.test(h));
});
await t("FLUXO recuperação: sem token_hash → 400 e nada enviado (não manda link quebrado)", async () => {
  envios.length = 0; const r = await H.tratar(pedido(base("recovery", { ed: { token_hash: "" } })), env()); assert.equal(r.status, 400); assert.equal(envios.length, 0);
});
await t("FLUXO confirmação: repetição do mesmo webhook-id usa a mesma Idempotency-Key (sem e-mail duplicado)", async () => {
  envios.length = 0; await H.tratar(pedido(base("signup"), { id: "msg_rep" }), env()); await H.tratar(pedido(base("signup"), { id: "msg_rep" }), env());
  assert.equal(envios[0].init.headers["Idempotency-Key"], envios[1].init.headers["Idempotency-Key"]);
});
await t("TROCA DE E-MAIL desligada (padrão): 403, nada enviado, resposta sem token", async () => {
  envios.length = 0; const r = await H.tratar(pedido(base("email_change", { user: { new_email: "novo@ex.com" }, ed: { token_hash_new: "NEW1" } })), env());
  assert.equal(r.status, 403); assert.equal(envios.length, 0); const txt = await r.text(); assert.ok(!txt.includes("TH123") && !txt.includes("NEW1"));
});
await t("TROCA DE E-MAIL desligada também com flag diferente de \"true\" (1, yes, TRUE)", async () => {
  for (const v of ["1", "yes", "TRUE", "false", ""]) { envios.length = 0; const r = await H.tratar(pedido(base("email_change", { user: { new_email: "n@ex.com" }, ed: { token_hash_new: "N" } })), env({ EMAIL_CHANGE_ENABLED: v })); assert.equal(r.status, 403, v); assert.equal(envios.length, 0); }
});
await t("TROCA DE E-MAIL ligada: pareamento do Supabase (token_hash_new→e-mail ATUAL, token_hash→e-mail NOVO) e remetente confirmation@", async () => {
  envios.length = 0; const r = await H.tratar(pedido(base("email_change", { user: { email: "atual@ex.com", new_email: "novo@ex.com" }, ed: { token_hash: "PARA_NOVO", token_hash_new: "PARA_ATUAL" } })), env({ EMAIL_CHANGE_ENABLED: "true" }));
  assert.equal(r.status, 200); assert.equal(envios.length, 2);
  const atual = envios.find((e) => e.body.to[0] === "atual@ex.com"), novo = envios.find((e) => e.body.to[0] === "novo@ex.com");
  assert.equal(verif(atual.body.html).searchParams.get("token"), "PARA_ATUAL"); assert.equal(verif(novo.body.html).searchParams.get("token"), "PARA_NOVO");
  assert.ok(envios.every((e) => e.body.from === "Bipi Tech <confirmation@mail.usebipi.com>")); assert.equal(verif(atual.body.html).searchParams.get("type"), "email_change");
});
await t("TROCA DE E-MAIL ligada, sem troca segura (1 token): um único e-mail, para o endereço NOVO", async () => {
  envios.length = 0; await H.tratar(pedido(base("email_change", { user: { email: "atual@ex.com", new_email: "novo@ex.com" }, ed: { token_hash: "SO_NOVO" } })), env({ EMAIL_CHANGE_ENABLED: "true" }));
  assert.equal(envios.length, 1); assert.deepEqual(envios[0].body.to, ["novo@ex.com"]);
});
await t("DOMÍNIO ÚNICO: remetente fora de usebipi.com → 500 e nada enviado", async () => {
  for (const d of ["usibip.com", "usebipe.com", "mail.usebipi.com.malicioso.com", "usebipi.com.br"]) { envios.length = 0; const r = await H.tratar(pedido(base("signup")), env({ EMAIL_DOMINIO: d })); assert.equal(r.status, 500, d); assert.equal(envios.length, 0); }
});
await t("DOMÍNIO ÚNICO: imagens fora de usebipi.com → 500", async () => {
  const r = await H.tratar(pedido(base("signup")), env({ ASSET_BASE_URL: "https://cdn.outro.com/e" })); assert.equal(r.status, 500);
});
await t("DOMÍNIO ÚNICO: remetente e imagens de todos os e-mails vêm só de usebipi.com", async () => {
  for (const tipo of ["signup", "recovery", "invite", "magiclink", "reauthentication"]) {
    envios.length = 0; await H.tratar(pedido(base(tipo)), env());
    const e = envios[0].body; assert.ok(/@mail\.usebipi\.com>$/.test(e.from), tipo);
    for (const m of e.html.matchAll(/<img[^>]+src="([^"]+)"/g)) assert.equal(new URL(m[1]).host, "usebipi.com", tipo);
  }
});
await t("IDENTIDADE: nenhum e-mail contém Condor nem domínios errados (usibip, usebipe)", async () => {
  for (const tipo of ["signup", "recovery", "invite", "magiclink", "reauthentication"]) {
    envios.length = 0; await H.tratar(pedido(base(tipo)), env()); const tudo = JSON.stringify(envios[0].body);
    assert.ok(!/condor/i.test(tudo), tipo); assert.ok(!/usibip|usebipe/i.test(tudo), tipo); assert.ok(tudo.includes("Bipi Tech"));
  }
});
await t("IMAGENS em clientes de e-mail: https absoluto, PNG, width/height e alt; sem SVG, sem data: e sem file:", async () => {
  envios.length = 0; await H.tratar(pedido(base("signup")), env()); const h = envios[0].body.html; const imgs = [...h.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgs.length >= 1); for (const im of imgs) { assert.ok(/src="https:\/\/usebipi\.com\/email\/[\w-]+\.png"/.test(im), im); assert.ok(/width="\d+"/.test(im) && /height="\d+"/.test(im) && /alt="[^"]+"/.test(im), im); }
  assert.ok(!/\.svg|data:image|file:/.test(h));
});
await t("TEXTO puro (cliente sem HTML) traz a marca e o link", async () => {
  envios.length = 0; await H.tratar(pedido(base("signup")), env()); const x = envios[0].body.text; assert.ok(x.includes("verify?token=TH123") && /Bipi/.test(x));
});

await t("PRODUÇÃO: sem configuração, o redirect padrão é https://usebipi.com e localhost não passa", async () => {
  const e0 = (k) => ({ SEND_EMAIL_HOOK_SECRET: SECRET, RESEND_API_KEY: "re_teste", SUPABASE_URL: "https://proj.supabase.co" })[k];
  envios.length = 0; await H.tratar(pedido(base("signup", { ed: { redirect_to: "http://localhost:3000" } })), e0);
  const u = verif(envios[0].body.html); assert.equal(u.searchParams.get("redirect_to"), "https://usebipi.com");
  envios.length = 0; await H.tratar(pedido(base("recovery", { ed: { redirect_to: "https://usebipi.com/redefinir" } })), e0);
  assert.equal(verif(envios[0].body.html).searchParams.get("redirect_to"), "https://usebipi.com/redefinir");
  envios.length = 0; await H.tratar(pedido(base("recovery", { ed: { redirect_to: "https://usebipi.com.malicioso.com" } })), e0);
  assert.equal(verif(envios[0].body.html).searchParams.get("redirect_to"), "https://usebipi.com");
});
await t("DESENVOLVIMENTO: AMBIENTE_DEV=true libera localhost:3000 e só ele", async () => {
  const ed = (k) => ({ SEND_EMAIL_HOOK_SECRET: SECRET, RESEND_API_KEY: "re_teste", SUPABASE_URL: "https://proj.supabase.co", AMBIENTE_DEV: "true" })[k];
  envios.length = 0; await H.tratar(pedido(base("signup", { ed: { redirect_to: "http://localhost:3000/" } })), ed);
  assert.equal(verif(envios[0].body.html).searchParams.get("redirect_to"), "http://localhost:3000/");
  envios.length = 0; await H.tratar(pedido(base("signup", { ed: { redirect_to: "http://localhost:9999/" } })), ed);
  assert.equal(verif(envios[0].body.html).searchParams.get("redirect_to"), "https://usebipi.com");
});
await t("REDIRECT_HOSTS com domínio estranho → 500 (configuração misturada é barrada)", async () => {
  const r = await H.tratar(pedido(base("signup")), env({ REDIRECT_HOSTS: "outro.com" })); assert.equal(r.status, 500);
});
await t("AVISO (no-reply): remetente no-reply@mail.usebipi.com e botão para https://usebipi.com", async () => {
  const m = TPL.modeloAviso({ titulo: "Teste", mensagem: "m", botao: { texto: "ABRIR", url: "https://usebipi.com" } }, { assets: "https://usebipi.com/email", nome: "Bipi Tech", suporte: "" });
  assert.equal(`${TPL.REMETENTE.aviso}@mail.usebipi.com`, "no-reply@mail.usebipi.com"); assert.ok(m.html.includes('href="https://usebipi.com"') && !/condor/i.test(m.html));
});

// ===== Auditoria independente (2ª etapa): achados → testes =====
const assinaCom = (seg, id, ts, corpo) => "v1," + createHmac("sha256", Buffer.from(seg, "base64")).update(`${id}.${ts}.${corpo}`).digest("base64");
const pedidoRaw = (corpoObj, headers) => new Request("https://f/auth-email", { method: "POST", body: JSON.stringify(corpoObj), headers });
const logs = []; const _e = console.error, _w = console.warn; console.error = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push(a.join(" "));

await t("AUD assinatura: segredo malformado no ambiente → 401 (não derruba a função)", async () => {
  envios.length = 0; const r = await H.tratar(pedido(base("signup")), env({ SEND_EMAIL_HOOK_SECRET: "v1,whsec_%%%não-é-base64%%%" })); assert.equal(r.status, 401); assert.equal(envios.length, 0);
});
await t("AUD assinatura: cabeçalho com lixo, vazio ou só espaços → 401", async () => {
  for (const sig of ["", " ", "v1,", "lixo", "v2,AAAA", "v1,AAAA v1,BBBB"]) { envios.length = 0; const r = await H.tratar(pedido(base("signup"), { sig }), env()); assert.equal(r.status, 401, JSON.stringify(sig)); assert.equal(envios.length, 0); }
});
await t("AUD assinatura: corpo adulterado depois de assinado → 401", async () => {
  const ts = String(Math.floor(Date.now() / 1000)), orig = JSON.stringify(base("signup")), sig = assina("msg_x", ts, orig);
  const r = await H.tratar(new Request("https://f/a", { method: "POST", body: orig.replace("ana@ex.com", "vitima@ex.com"), headers: { "webhook-id": "msg_x", "webhook-timestamp": ts, "webhook-signature": sig } }), env()); assert.equal(r.status, 401); assert.equal(envios.length, 0);
});
await t("AUD assinatura: assinatura de OUTRO segredo → 401; timestamp futuro (>5 min) → 401; sem cabeçalhos → 401", async () => {
  const ts = String(Math.floor(Date.now() / 1000)), c = JSON.stringify(base("signup")), outro = Buffer.from("outro-segredo-qualquer-0123456789").toString("base64");
  assert.equal((await H.tratar(pedidoRaw(base("signup"), { "webhook-id": "m1", "webhook-timestamp": ts, "webhook-signature": assinaCom(outro, "m1", ts, c) }), env())).status, 401);
  assert.equal((await H.tratar(pedido(base("signup"), { ts: String(Math.floor(Date.now() / 1000) + 900) }), env())).status, 401);
  assert.equal((await H.tratar(pedidoRaw(base("signup"), {}), env())).status, 401);
});
await t("AUD limite: content-length acima de 20 KB → 413 sem nem ler o corpo", async () => {
  const r = await H.tratar(new Request("https://f/a", { method: "POST", body: "x", headers: { "content-length": "999999", "webhook-id": "m", "webhook-timestamp": "1", "webhook-signature": "v1,x" } }), env()); assert.equal(r.status, 413);
});
await t("AUD webhook-id inválido (espaço, aspas, 300 caracteres) → 400 e nada enviado", async () => {
  for (const id of ["a b", 'a"b', "x".repeat(300)]) { envios.length = 0; const ts = String(Math.floor(Date.now() / 1000)), c = JSON.stringify(base("signup")); const r = await H.tratar(pedidoRaw(base("signup"), { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": assina(id, ts, c) }), env()); assert.equal(r.status, 400, id.slice(0, 10)); assert.equal(envios.length, 0); }
});
await t("AUD replay: o MESMO pedido assinado enviado 3x usa SEMPRE a mesma Idempotency-Key (o Resend descarta a repetição)", async () => {
  envios.length = 0; const ts = String(Math.floor(Date.now() / 1000)), c = JSON.stringify(base("recovery")), h = { "webhook-id": "msg_replay", "webhook-timestamp": ts, "webhook-signature": assina("msg_replay", ts, c) };
  for (let k = 0; k < 3; k++) await H.tratar(new Request("https://f/a", { method: "POST", body: c, headers: h }), env());
  assert.equal(envios.length, 3); assert.ok(envios.every((e) => e.init.headers["Idempotency-Key"] === "msg_replay"));
});
await t("AUD persistência: a proteção não está na memória da função; reinício (módulo novo) gera a MESMA chave de idempotência", async () => {
  await build({ entryPoints: [fn + "index.ts"], bundle: true, format: "esm", outfile: dir + ".out/hook-reinicio.mjs", platform: "node", logLevel: "error" });
  const H2 = await import(dir + ".out/hook-reinicio.mjs?reinicio=1"); assert.notEqual(H2, H);
  envios.length = 0; await H.tratar(pedido(base("signup"), { id: "msg_persist" }), env()); await H2.tratar(pedido(base("signup"), { id: "msg_persist" }), env());
  assert.equal(envios[0].init.headers["Idempotency-Key"], "msg_persist"); assert.equal(envios[1].init.headers["Idempotency-Key"], "msg_persist");
  const fonte = (await import("node:fs")).readFileSync(fn + "index.ts", "utf8") + (await import("node:fs")).readFileSync(fn + "templates.ts", "utf8");
  assert.ok(!/^(let|var) /m.test(fonte), "estado mutável no topo do módulo"); assert.ok(!/new (Map|Set)\(\)|globalThis\.\w+\s*=/.test(fonte.replace('new Set(["signup"', "")), "cache em memória");
});
await t("AUD redirect: http:// do mesmo domínio (downgrade), usuário@host e host parecido caem no SITE_URL https", async () => {
  for (const r of ["http://usebipi.com/x", "https://usebipi.com@malicioso.com/", "https://user:senha@usebipi.com/", "https://usebipi.com.malicioso.com", "https://malicioso.com/usebipi.com", "javascript:alert(1)", "//malicioso.com"]) {
    envios.length = 0; await H.tratar(pedido(base("recovery", { ed: { redirect_to: r } })), env({ SITE_URL: "https://usebipi.com" }));
    assert.equal(verif(envios[0].body.html).searchParams.get("redirect_to"), "https://usebipi.com", r);
  }
});
await t("AUD redirect: https://usebipi.com/qualquer-caminho é mantido (produção)", async () => {
  envios.length = 0; await H.tratar(pedido(base("recovery", { ed: { redirect_to: "https://usebipi.com/redefinir?a=1" } })), env({ SITE_URL: "https://usebipi.com" }));
  assert.equal(verif(envios[0].body.html).searchParams.get("redirect_to"), "https://usebipi.com/redefinir?a=1");
});
await t("AUD redirect: com AMBIENTE_DEV=true o redirect de produção continua valendo (não é trocado pelo raiz)", async () => {
  envios.length = 0; await H.tratar(pedido(base("recovery", { ed: { redirect_to: "https://usebipi.com/redefinir" } })), env({ SITE_URL: "https://usebipi.com", AMBIENTE_DEV: "true" }));
  assert.equal(verif(envios[0].body.html).searchParams.get("redirect_to"), "https://usebipi.com/redefinir");
});
await t("AUD configuração: SITE_URL fora do domínio oficial ou em http → 500; SUPABASE_URL em http/estranha → 500", async () => {
  for (const x of [{ SITE_URL: "https://outro.com" }, { SITE_URL: "http://usebipi.com" }, { SUPABASE_URL: "http://proj.supabase.co" }, { SUPABASE_URL: "https://proj.supabase.co.malicioso.com" }, { SUPABASE_URL: "https://malicioso.com" }]) {
    envios.length = 0; const r = await H.tratar(pedido(base("signup")), env(x)); assert.equal(r.status, 500, JSON.stringify(x)); assert.equal(envios.length, 0);
  }
});
await t("AUD falha de envio: toda resposta não-2xx do Resend (400/401/403/409/422/429/500/503) → Supabase recebe erro (nunca 200)", async () => {
  for (const st of [400, 401, 403, 409, 422, 429, 500, 503]) { respResend = { ok: false, status: st }; const r = await H.tratar(pedido(base("signup")), env()); assert.ok(r.status >= 400, String(st)); assert.equal(r.status, 502); }
  respResend = { ok: true, status: 200 };
});
await t("AUD falha de envio: erro de rede (fetch lança) → 502, sem vazar token/chave/e-mail", async () => {
  const f = globalThis.fetch; globalThis.fetch = async () => { throw new TypeError("falha de rede com re_teste e ana@ex.com"); };
  logs.length = 0; const r = await H.tratar(pedido(base("signup")), env()); globalThis.fetch = f; assert.equal(r.status, 502);
  const tudo = (await r.text()) + logs.join(" "); assert.ok(!/re_teste|ana@ex\.com|TH123/.test(tudo), tudo);
});
await t("AUD falha de envio: Resend travado → 504 dentro do limite (o hook do Supabase desiste em ~5 s)", async () => {
  const f = globalThis.fetch; globalThis.fetch = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("abortado"), { name: "AbortError" }))));
  const ini = Date.now(); const r = await H.tratar(pedido(base("signup")), env({ RESEND_TIMEOUT_MS: "100" })); globalThis.fetch = f;
  assert.equal(r.status, 504); assert.ok(Date.now() - ini < 1500);
});
await t("AUD falha parcial na troca de e-mail: 2º envio falha → 502 (o Supabase repete e o 1º não duplica: chaves -a e -b estáveis)", async () => {
  let n = 0; const f = globalThis.fetch; globalThis.fetch = async (u, init) => { envios.push({ url: u, init, body: JSON.parse(init.body) }); n++; return { ok: n !== 2, status: n === 2 ? 500 : 200 }; };
  envios.length = 0; const r = await H.tratar(pedido(base("email_change", { user: { new_email: "novo@ex.com" }, ed: { token_hash: "N", token_hash_new: "A" } }), { id: "msg_par" }), env({ EMAIL_CHANGE_ENABLED: "true" })); globalThis.fetch = f;
  assert.equal(r.status, 502); assert.deepEqual(envios.map((e) => e.init.headers["Idempotency-Key"]), ["msg_par-a", "msg_par-b"]);
});
await t("AUD troca de e-mail: só token_hash_new (sem token_hash), sem new_email ou com new_email inválido → 400 e nada enviado", async () => {
  const casos = [{ user: { new_email: "n@ex.com" }, ed: { token_hash: "", token_hash_new: "A" } }, { ed: { token_hash: "N", token_hash_new: "A" } }, { user: { new_email: "ruim" }, ed: { token_hash: "N" } }, { user: { new_email: "a@b.com,c@d.com" }, ed: { token_hash: "N", token_hash_new: "A" } }, { user: { new_email: "n@ex.com" }, ed: { token_hash: "N", token_hash_new: "A" }, remover: false }];
  for (const [k, c] of casos.slice(0, 4).entries()) { envios.length = 0; const r = await H.tratar(pedido(base("email_change", c)), env({ EMAIL_CHANGE_ENABLED: "true" })); assert.equal(r.status, 400, "caso " + k); assert.equal(envios.length, 0); }
});
await t("AUD e-mail com vírgula/ponto e vírgula/aspas/quebra de linha (injeção de destinatários) → 400", async () => {
  for (const e of ["a@b.com,c@d.com", "a@b.com;c@d.com", '"x"@b.com', "a@b.com\nBcc: x@y.com", "<a@b.com>"]) { envios.length = 0; const r = await H.tratar(pedido(base("signup", { user: { email: e } })), env()); assert.equal(r.status, 400, JSON.stringify(e)); assert.equal(envios.length, 0); }
});
await t("AUD nome do cadastro: sem quebra de linha, sem endereços/e-mails, no máximo 40 caracteres, sem ‘frase de golpe’ longa", async () => {
  envios.length = 0; await H.tratar(pedido(base("signup", { user: { user_metadata: { nome: "Ana\nCaro cliente ligue 0800 em http://golpe.com ou golpe@x.com " + "x".repeat(200) } } })), env());
  const h = envios[0].body.html; assert.ok(!/golpe/i.test(h)); assert.ok(!/x{41}/.test(h)); assert.ok(h.includes("Olá, <b>Ana</b>"));
});
await t("AUD reautenticação: código só com letras/números, no máx. 12", async () => {
  envios.length = 0; await H.tratar(pedido(base("reauthentication", { ed: { token_hash: "", token: "12<b>34</b>56 78\n90123456" } })), env());
  const m = envios[0].body.html.match(/letter-spacing:\.3em[^>]*>([^<]*)</); assert.ok(m && /^[A-Za-z0-9]{1,12}$/.test(m[1]), m && m[1]);
});
await t("AUD aviso: botão para domínio de terceiros, http ou com usuário@ é descartado; usebipi.com é mantido; assunto sem quebra de linha", async () => {
  const M2 = { assets: "https://usebipi.com/email", nome: "Bipi Tech", suporte: "" };
  for (const url of ["https://malicioso.com", "http://usebipi.com", "https://usebipi.com@malicioso.com", "https://usebipi.com.malicioso.com", "https://user:x@usebipi.com"]) assert.ok(!TPL.modeloAviso({ titulo: "t", mensagem: "m", botao: { texto: "X", url } }, M2).html.includes("href="), url);
  assert.ok(TPL.modeloAviso({ titulo: "t", mensagem: "m", botao: { texto: "X", url: "https://app.usebipi.com/a" } }, M2).html.includes('href="https://app.usebipi.com/a"'));
  const s = TPL.modeloAviso({ titulo: "Linha1\r\nBcc: x@y.com", mensagem: "m" }, M2).subject; assert.ok(!/[\r\n]/.test(s));
});
await t("AUD logs: em falha e em assinatura inválida nada de token, e-mail, chave ou corpo nos logs", async () => {
  logs.length = 0; respResend = { ok: false, status: 500 }; await H.tratar(pedido(base("signup")), env()); respResend = { ok: true, status: 200 }; await H.tratar(pedido(base("signup"), { sig: "v1,x" }), env());
  const tudo = logs.join(" "); assert.ok(!/TH123|re_teste|ana@ex\.com|123456|whsec|segredo/i.test(tudo), tudo);
});
console.error = _e; console.warn = _w;
// pré-visualização (fora do teste de lógica): grava os HTML para renderizar
const M = { assets: "file://" + dir.replace(/\/$/, ""), nome: "Bipi Tech", suporte: "" };
const L = "https://proj.supabase.co/auth/v1/verify?token=EXEMPLO&type=signup&redirect_to=https%3A%2F%2Fapp.usebipi.com";
const previas = { signup: TPL.modelo("signup", { nome: "Cauã Silva", link: L, validadeMin: 60 }, M), recovery: TPL.modelo("recovery", { nome: "Cauã Silva", link: L, validadeMin: 60 }, M),
  aviso: TPL.modeloAviso({ titulo: "Acesso de promotor revogado", mensagem: "O acesso do promotor foi cancelado pela loja.", tom: "verm", detalhes: [["Promotor", "Gabriel"], ["Quando", "10/11/2026 às 17:20"], ["Por", "Equipe da loja"]], botao: { texto: "ABRIR O APLICATIVO", url: "https://app.usebipi.com" } }, M) };
for (const [k, v] of Object.entries(previas)) writeFileSync(`${dir}.out/${k}.html`, v.html);

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);

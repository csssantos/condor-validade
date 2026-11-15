import { generateKeyPairSync } from "node:crypto";
import { pathToFileURL } from "node:url";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
let env = {};
globalThis.Deno = { env: { get: k => env[k] } };
const F = new URL("./supabase/functions/_compartilhado/fcm.ts", import.meta.url).href;
let n = 0; const load = () => import(F + "?v=" + (n++));
let calls, fcmResp;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  calls.push({ u: String(u), o });
  if (String(u).includes("oauth2")) return new Response(JSON.stringify({ access_token: "AT", expires_in: 3600 }), { status: 200 });
  return fcmResp();
};
let pass = 0, fail = 0;
const t = (nome, c, x = "") => { c ? pass++ : fail++; console.log(c ? "ok  " : "FALHA", nome, x); };
const conta = () => JSON.stringify({ client_email: "a@b.iam", private_key: pem, project_id: "proj" });
const pl = o => JSON.stringify(o);

// sem segredo
env = {}; calls = [];
let m = await load();
t("sem segredo fcmAtivo=false", m.fcmAtivo() === false);
let r = await m.enviarFcm("tok", pl({ title: "x" }));
t("sem segredo -> ok false", r.ok === false && r.invalido === false && calls.length === 0);
// segredo inválido
env = { FCM_SERVICE_ACCOUNT: "{lixo" }; m = await load();
r = await m.enviarFcm("tok", pl({})); t("segredo JSON inválido -> ok false", !r.ok && !calls.length);
env = { FCM_SERVICE_ACCOUNT: JSON.stringify({ client_email: "x" }) }; m = await load();
t("segredo incompleto -> inativo", !m.fcmAtivo());

// ok
env = { FCM_SERVICE_ACCOUNT: conta() }; calls = []; fcmResp = () => new Response("{}", { status: 200 });
m = await load();
r = await m.enviarFcm("tok1", pl({ title: "T", body: "B", tag: "g", data: { url: "/produto/1" } }));
t("envio ok", r.ok === true && r.invalido === false);
const fc = calls.find(c => c.u.includes("fcm.googleapis.com"));
t("URL fcm usa project_id", fc.u === "https://fcm.googleapis.com/v1/projects/proj/messages:send");
t("Authorization Bearer AT", fc.o.headers.Authorization === "Bearer AT");
const body = JSON.parse(fc.o.body).message;
t("token e data.url", body.token === "tok1" && body.data.url === "/produto/1");
const oc = calls.find(c => c.u.includes("oauth2")); const asr = oc.o.body.get("assertion").split(".");
t("JWT 3 partes + grant", asr.length === 3 && oc.o.body.get("grant_type").includes("jwt-bearer"));
// cache do token
calls.length = 0; await m.enviarFcm("tok2", pl({}));
t("token de acesso em cache (1 chamada)", calls.length === 1 && calls[0].u.includes("fcm"));

// caminhos
for (const [u, esp] of [["//evil", "/"], ["https://evil.com", "/"], ["javascript:1", "/"], ["/ok?a=1", "/ok?a=1"], [undefined, "/"], [123, "/"], ["/\\evil.com", "/"], ["/%2f%2fevil", "/%2f%2fevil"], ["/\t/evil.com", "/"]]) {
  calls.length = 0; await m.enviarFcm("t", pl({ data: { url: u } }));
  const got = JSON.parse(calls.at(-1).o.body).message.data.url;
  t(`url ${JSON.stringify(u)} -> ${esp}`, got === esp, `(got ${JSON.stringify(got)})`);
}
// truncamento
calls.length = 0; await m.enviarFcm("t", pl({ title: "a".repeat(500), body: "b".repeat(1000), tag: "c".repeat(200) }));
const b2 = JSON.parse(calls.at(-1).o.body).message;
t("título 120", b2.data.titulo.length === 120);
t("corpo 300", b2.data.corpo.length === 300);
t("tag 60", b2.data.tag.length === 60);
t("mensagem só de dados (sem bloco notification)", !("notification" in b2));
calls.length = 0; await m.enviarFcm("t", pl({}));
const b3 = JSON.parse(calls.at(-1).o.body).message;
t("título padrão Bipi, corpo vazio, sem tag", b3.data.titulo === "Bipi" && b3.data.corpo === "" && b3.data.tag === "" && b3.data.cor === "azul");
// invalido
for (const [st, txt, inv] of [[404, "{}", false], [400, '{"error":{"status":"INVALID_ARGUMENT","message":"The registration token is not a valid FCM registration token"}}', true], [404, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}', true], [500, "boom", false], [403, '{"error":{"status":"PERMISSION_DENIED"}}', false], [401, '{"error":{"status":"UNAUTHENTICATED"}}', false], [400, '{"error":{"status":"INVALID_ARGUMENT","message":"Invalid value at message.android.ttl"}}', false], [400, '{"error":{"status":"INVALID_ARGUMENT","message":"Invalid JSON payload ... token field"}}', false], [404, '{"error":{"status":"NOT_FOUND","message":"Requested entity was not found (projeto errado)"}}', false]]) {
  fcmResp = () => new Response(txt, { status: st }); r = await m.enviarFcm("t", pl({}));
  t(`status ${st} ${txt.slice(0,45)} -> invalido=${inv}`, r.ok === false && r.invalido === inv, `(got ${r.invalido})`);
}
// 401 com token em cache: reautentica?
let n401 = 0; fcmResp = () => new Response('{"error":{"status":"UNAUTHENTICATED"}}', { status: 401 });
calls.length = 0; await m.enviarFcm("t", pl({})); t("401 não renova token em cache (informativo)", !calls.some(c => c.u.includes("oauth2")));
// oauth falha
env = { FCM_SERVICE_ACCOUNT: conta() }; m = await load(); calls = [];
const f0 = globalThis.fetch; globalThis.fetch = async (u, o) => { calls.push({u:String(u)}); return String(u).includes("oauth2") ? new Response("no", { status: 400 }) : new Response("{}"); };
r = await m.enviarFcm("t", pl({})); t("oauth 400 -> ok false, sem enviar", !r.ok && !r.invalido && !calls.some(c => c.u.includes("fcm.google")));
globalThis.fetch = async () => { throw new Error("rede"); };
env = { FCM_SERVICE_ACCOUNT: conta() }; m = await load(); r = await m.enviarFcm("t", pl({}));
t("fetch lança -> ok false", !r.ok && !r.invalido);
globalThis.fetch = f0; fcmResp = () => new Response("{}");
r = await m.enviarFcm("t", "não json"); t("payload não-JSON -> ok false", !r.ok && !r.invalido);
// chave privada com \n escapado (copiada de JSON)
env = { FCM_SERVICE_ACCOUNT: conta() }; m = await load(); calls = [];
r = await m.enviarFcm("t", pl({ title: "x" })); t("chave PEM de JSON.stringify lida", r.ok);
console.log(pass, "ok", fail, "falhas");
process.exit(fail ? 1 : 0);

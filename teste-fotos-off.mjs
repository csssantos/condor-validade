// Testa a parte pura de fotos-migrar (fotos do Open Food Facts) com fetch simulado + confere o SQL por texto.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let esbuild; try { esbuild = require("esbuild"); } catch { esbuild = require("/opt/npm-tools/node_modules/esbuild"); }
const src = fs.readFileSync(new URL("./supabase/functions/fotos-migrar/index.ts", import.meta.url), "utf8");
const trecho = src.slice(src.indexOf("const HOSTS_OFF"), src.indexOf("async function migrarOff"));
assert.ok(trecho.includes("fotoAtualOff"), "trecho não encontrado");
const js = esbuild.transformSync("const MAX_BYTES = 500_000;\n" + trecho + "\nreturn { hostOk, fotoAtualOff, lerLimitado };", { loader: "ts" }).code;
let ok = 0; const t = (n, c) => { c(); ok++; console.log("ok  ", n); };
const JPG = new Uint8Array(2000).fill(1); JPG.set([0xff, 0xd8, 0xff]);
const PNG = new Uint8Array(2000).fill(1); PNG.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const mk = (rotas) => { const chamadas = []; const f = async (url, opt) => { chamadas.push({ url: String(url), opt }); for (const [re, fn] of rotas) if (re.test(String(url))) return fn(String(url)); throw new Error("sem rota " + url); }; return { f, chamadas }; };
const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st });
const img = (b, st = 200, h = {}) => new Response(b, { status: st, headers: h });
const carregar = (fetchFalso) => new Function("fetch", js)(fetchFalso);
const API = /api\/v2\/product\//;
const IMG = "https://images.openfoodfacts.org/images/products/1/front.jpg";

{ const { hostOk } = carregar(async () => { throw 0; });
  t("hostOk: só hosts exatos, https, sem usuário/porta", () => {
    assert.equal(hostOk(IMG), true);
    for (const u of ["http://images.openfoodfacts.org/x", "https://evil.openfoodfacts.org/x", "https://openfoodfacts.org.evil.com/x", "https://user@images.openfoodfacts.org/x", "https://images.openfoodfacts.org:8443/x", "https://evilopenfoodfacts.org/x", "lixo"]) assert.equal(hostOk(u), false, u);
  }); }
const rodar = async (bc, rotas) => { const m = mk(rotas); const r = await carregar(m.f).fotoAtualOff(bc); return { r, m }; };
{ const { r, m } = await rodar("7891234567890", [[API, () => json({ status: 1, product: { image_front_url: IMG } })], [/front\.jpg/, () => img(JPG)]]);
  t("acha e devolve jpeg; consulta e imagem sem seguir redirect", () => { assert.equal(r.foto.tipo, "image/jpeg"); assert.ok(m.chamadas.every((c) => c.opt.redirect === "error")); }); }
{ const { r } = await rodar("7891234567890", [[API, () => json({ status: 1, product: { image_front_url: IMG } })], [/front\.jpg/, () => img(PNG)]]);
  t("png com assinatura completa", () => assert.equal(r.foto.tipo, "image/png")); }
{ const { r } = await rodar("7891234567890", [[API, () => json({ status: 1, product: { image_front_url: IMG } })], [/front\.jpg/, () => img(new Uint8Array(2000).fill(7))]]);
  t("arquivo sem assinatura de imagem = sem foto", () => assert.equal(r.semFoto, true)); }
{ const { r } = await rodar("7891234567890", [[API, () => json({ status: 0 })]]);
  t("OFF responde que não tem o produto = semFoto (registra tentativa)", () => assert.equal(r.semFoto, true)); }
{ const { r } = await rodar("7891234567890", [[API, () => json({}, 404)]]);
  t("404 = semFoto", () => assert.equal(r.semFoto, true)); }
{ for (const st of [429, 503]) { const { r } = await rodar("7891234567890", [[API, () => json({}, st)]]);
    t(`API ${st} = erro, NÃO registra tentativa`, () => { assert.equal(r.erro, true); assert.equal(r.semFoto, undefined); }); } }
{ const { r } = await rodar("7891234567890", [[API, () => { throw new Error("rede"); }]]);
  t("rede caída = erro, não lança", () => assert.equal(r.erro, true)); }
{ const { r } = await rodar("7891234567890", [[API, () => new Response("<html>", { status: 200 })]]);
  t("HTML com status 200 = erro", () => assert.equal(r.erro, true)); }
{ const { r } = await rodar("7891234567890", [[API, () => json({ status: 1, product: { image_front_url: IMG } })], [/front\.jpg/, () => img(JPG, 503)]]);
  t("imagem 503 = erro (tenta depois)", () => assert.equal(r.erro, true)); }
{ const { r, m } = await rodar("7891234567890", [[API, () => json({ status: 1, product: { image_front_url: "https://evil.com/x.jpg" } })]]);
  t("imagem em host de fora nem é baixada", () => { assert.equal(r.semFoto, true); assert.equal(m.chamadas.length, 1); }); }
{ const grande = new Uint8Array(600_000); grande.set([0xff, 0xd8, 0xff]);
  const { r } = await rodar("7891234567890", [[API, () => json({ status: 1, product: { image_front_url: IMG, image_front_small_url: "https://images.openfoodfacts.org/images/products/1/small.jpg" } })], [/front\.jpg/, () => img(grande)], [/small\.jpg/, () => img(JPG)]]);
  t(">500 KB cai para a miniatura", () => assert.equal(r.foto.tipo, "image/jpeg")); }
{ const grande = new Uint8Array(600_000); grande.set([0xff, 0xd8, 0xff]);
  const { r } = await rodar("7891234567890", [[API, () => json({ status: 1, product: { image_front_url: IMG } })], [/front\.jpg/, () => img(grande)]]);
  t(">500 KB sem miniatura = semFoto", () => assert.equal(r.semFoto, true)); }
{ const { r } = await rodar("7891234567890", [[API, () => json({ status: 1, product: { image_front_url: IMG } })], [/front\.jpg/, () => img(JPG, 200, { "content-length": "99999999" })]]);
  t("content-length enorme recusa sem ler o corpo", () => assert.equal(r.semFoto, true)); }
{ let n = 0; const { r, m } = await rodar("789123456789", [[API, (u) => (++n === 1 ? json({ status: 0 }) : json({ status: 1, product: { image_front_url: IMG } }))], [/front\.jpg/, () => img(JPG)]]);
  t("UPC-A (12): tenta de novo com 0 na frente", () => { assert.equal(r.foto.tipo, "image/jpeg"); assert.ok(m.chamadas[1].url.includes("/0789123456789.json")); }); }
t("migrarOff: valida código (8-14 dígitos) e link antigo antes de consultar; erro passageiro registra pausa leve", () => {
  assert.ok(src.includes("/^[0-9]{8,14}$/.test(bc)") && src.includes("openfoodfacts\\.org"));
  assert.ok(src.includes("p_leve: true") && src.includes("Number(n) > 0"));
});
// SQL (texto)
const sql = fs.readFileSync(new URL("./supabase-fotos-off.sql", import.meta.url), "utf8");
t("SQL: funções só para service_role e tabela fechada", () => {
  for (const f of ["fotos_off_pendentes(int)", "foto_off_trocar(bigint, text, text)", "foto_off_falhou(bigint, text, boolean)"]) { assert.ok(sql.includes(`revoke all on function public.${f} from public, anon, authenticated`), f); assert.ok(sql.includes(`grant execute on function public.${f} to service_role`), f); }
  assert.ok(sql.includes("enable row level security") && sql.includes("revoke all on public.fotos_off_tentativas"));
});
t("SQL: pendentes ignora zeros, usa memória de falha e agrupa por loja+link", () => {
  assert.ok(sql.includes("'^[0-9]{8}$'") && sql.includes("'^[0-9]{12,13}$'") && sql.includes("p_leve") && sql.includes("interval '71 hours'"));
  assert.ok(sql.includes("!~ '^0+$'") && sql.includes("fotos_off_tentativas t") && sql.includes("group by c.loja_id, c.foto"));
});
t("SQL: troca só link do OFF por link da pasta da própria loja; lote travado fica de fora", () => {
  assert.ok(sql.includes("p_antigo !~ '^https://([a-z0-9-]+\\.)*openfoodfacts\\.org/'"));
  assert.ok(sql.includes("fotos/' || p_loja::text || '/[a-f0-9]{32}"));
  assert.ok(sql.includes("pedido_tipo is null and foto = p_antigo"));
});
console.log(`teste-fotos-off: ${ok} ok, 0 falha(s)`);

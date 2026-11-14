import { barrasDoCodigo } from "./src/compartilharImagem.js";
let f = 0; const ok = (c, m) => { if (!c) { f++; console.log("FALHOU:", m); } };
const a = barrasDoCodigo("7891234567895"); ok(a && a.tipo === "EAN-13" && a.bits.length === 95, "ean13");
const b = barrasDoCodigo("96385074"); ok(b && b.tipo === "EAN-8" && b.bits.length === 67, "ean8");
const u = barrasDoCodigo("036000291452"); ok(u && u.digitos === "0036000291452" && u.bits.length === 95, "upca");
for (const x of ["7891234567896", "96385075", "0000000000000", "00000000", "int:123", "bal:1", "", null, undefined, "12345"]) ok(barrasDoCodigo(x) === null, "recusa " + x);
console.log(`teste-barras: ${f ? f + " falha(s)" : "ok"}`); process.exit(f ? 1 : 0);

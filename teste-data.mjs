// Testa as funções puras do CampoData (src/componentes/CampoData.jsx): isoParaBR, brParaISO, mascaraData
import fs from "node:fs";
const src = fs.readFileSync("src/componentes/CampoData.jsx", "utf8");
const a = src.indexOf("function isoParaBR"), b = src.indexOf("function hojeISOLocal");
const f = new Function(src.slice(a, b) + "; return { isoParaBR, brParaISO, mascaraData };")();
let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log("FALHOU:", n)); };
t("iso->br", f.isoParaBR("2026-12-15") === "15/12/2026"); t("iso vazio", f.isoParaBR("") === "" && f.isoParaBR(null) === "");
t("br->iso", f.brParaISO("15/12/2026") === "2026-12-15");
t("31/02 inválida", f.brParaISO("31/02/2026") === ""); t("29/02/2028 válida", f.brParaISO("29/02/2028") === "2028-02-29"); t("29/02/2026 inválida", f.brParaISO("29/02/2026") === "");
t("00/00/0000", f.brParaISO("00/00/0000") === ""); t("incompleta", f.brParaISO("15/12/20") === "" && f.brParaISO("15/12") === "");
t("ano 0026 recusado", f.brParaISO("15/12/0026") === "");
t("máscara progressiva", f.mascaraData("1") === "1" && f.mascaraData("15") === "15" && f.mascaraData("151") === "15/1" && f.mascaraData("15122") === "15/12/2" && f.mascaraData("15122026") === "15/12/2026");
t("máscara corta em 8 dígitos", f.mascaraData("151220269999") === "15/12/2026"); t("máscara ignora letras", f.mascaraData("15a12b2026") === "15/12/2026");
console.log(`data: ${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);

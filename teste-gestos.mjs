import { profundidade, passoVoltar, reconciliar, puxada, passouDoLimite, gestoDeVoltar, LIMITE_PUXAR } from "./src/lib/gestos.js";
let f = 0; const ok = (c, m) => { if (!c) { f++; console.log("FALHOU:", m); } };
ok(profundidade({ tab: "home" }) === 0, "início = 0");
ok(profundidade({ tab: "setores" }) === 1, "aba = 1");
ok(profundidade({ tab: "setores", setor: "Mercearia" }) === 2 && profundidade({ tab: "setores", setor: "M", sub: "x" }) === 3, "setor/sub");
ok(profundidade({ tab: "cfg-conta" }) === 2, "página de Mais = 2");
ok(profundidade({ tab: "home", flow: "confirm" }) === 1 && profundidade({ tab: "setores", setor: "M", flow: "torre" }) === 1, "fluxo cobre o resto");
ok(profundidade({ tab: "home", detalhe: {} }) === 1 && profundidade({ tab: "setores", flow: "x", detalhe: {} }) === 2, "detalhe soma");
ok(passoVoltar({ tab: "home" }) === null, "início não volta");
ok(passoVoltar({ tab: "setores", detalhe: {}, flow: "x" }) === "detalhe", "detalhe primeiro");
ok(passoVoltar({ tab: "setores", flow: "x" }) === "flow", "fluxo");
ok(passoVoltar({ tab: "setores", setor: "M", sub: "s" }) === "sub" && passoVoltar({ tab: "setores", setor: "M" }) === "setor", "sub e setor");
ok(passoVoltar({ tab: "cfg-conta" }) === "ajustes" && passoVoltar({ tab: "ajustes" }) === "home" && passoVoltar({ tab: "rondas" }) === "home", "abas");
// cada passo de voltar reduz a profundidade em 1 (histórico e tela nunca se perdem)
for (const s of [{ tab: "cfg-x" }, { tab: "setores", setor: "M", sub: "s" }, { tab: "rondas", detalhe: {} }, { tab: "home", flow: "f", detalhe: {} }]) {
  const p = profundidade(s), q = passoVoltar(s);
  const prox = { ...s }; if (q === "detalhe") delete prox.detalhe; else if (q === "flow") delete prox.flow; else if (q === "sub") delete prox.sub; else if (q === "setor") delete prox.setor; else if (q === "ajustes") prox.tab = "ajustes"; else if (q === "home") prox.tab = "home";
  ok(profundidade(prox) === p - 1, "reduz 1: " + JSON.stringify(s));
}
ok(JSON.stringify(reconciliar(0, 2)) === '{"empurrar":2,"desfazer":0}' && JSON.stringify(reconciliar(3, 1)) === '{"empurrar":0,"desfazer":2}' && reconciliar(-4, NaN).empurrar === 0, "reconciliar");
ok(puxada(0) === 0 && puxada(-30) === 0 && puxada(100) === 50 && puxada(9999) === LIMITE_PUXAR * 1.6, "puxada com teto");
ok(!passouDoLimite(100) && passouDoLimite(128) && passouDoLimite(500), "limite de puxar");
ok(gestoDeVoltar({ x0: 5, dx: 100, dy: 20 }) && !gestoDeVoltar({ x0: 60, dx: 200, dy: 0 }) && !gestoDeVoltar({ x0: 5, dx: 50, dy: 0 }) && !gestoDeVoltar({ x0: 5, dx: 100, dy: 90 }) && !gestoDeVoltar({ x0: 5, dx: -100, dy: 0 }), "gesto de voltar");
// Regra dos hooks: depois do primeiro `return` antecipado do AppInner (tela de carregamento) não pode haver hook no nível do componente
import fs from "node:fs";
{ const linhas = fs.readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8").split("\n");
  const ini = linhas.findIndex((l) => /^function AppInner\(/.test(l));
  const ret = linhas.findIndex((l, i) => i > ini && /^  if \(loading\)/.test(l));
  ok(ini >= 0 && ret > ini, "achou o primeiro return antecipado do AppInner");
  const fim = linhas.findIndex((l, i) => i > ret && /^}/.test(l));
  const ruins = linhas.slice(ret, fim).map((l, i) => [ret + i + 1, l]).filter(([, l]) => /^  (const|let)?.*\buse(State|Ref|Effect|Memo|Callback|Context|LayoutEffect)\(/.test(l) && !/^  \s/.test(l));
  ok(ruins.length === 0, "hook depois de return antecipado: " + ruins.map(([n]) => "linha " + n).join(", ")); }
console.log(`teste-gestos: ${f ? f + " falha(s)" : "ok"}`); process.exit(f ? 1 : 0);

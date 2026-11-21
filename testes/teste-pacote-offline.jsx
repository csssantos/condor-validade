// Pacote offline (lib/pacoteOffline.js) + service worker + APK: funções puras e conferências de texto
import fs from "node:fs";
import { fotosDoPacote, arquivosCitados, pacoteBaixado, esquecerPacote, baixarPacote } from "../src/lib/pacoteOffline";

let ok = 0, falhas = 0;
const t = (nome, cond) => { if (cond) ok++; else { falhas++; console.log("FALHOU:", nome); } };
const H = "https://fbovltxucooeoldjfckk.supabase.co/storage/v1/object/public/fotos/79/abc.jpg";

// fotos: só o armazenamento do app, sem repetidas, sem dado de produto sem foto
const f = fotosDoPacote([{ a: { foto: H }, b: { foto: H + "?v=2" } }, [{ foto: "https://images.openfoodfacts.org/x.jpg" }, { foto: "data:image/png;base64,AAA" }, { foto: null }, { foto: "https://evil.com/storage/v1/object/public/x.jpg" }, {}], null, undefined]);
t("fotos: só do armazenamento e sem duplicar (query ignorada)", f.length === 1 && f[0] === H);
t("fotos: lista vazia", fotosDoPacote([[], {}]).length === 0);
const muitas = Array.from({ length: 900 }, (_, i) => ({ foto: `https://fbovltxucooeoldjfckk.supabase.co/storage/v1/object/public/fotos/79/${i}.jpg` }));
t("fotos: teto de 600", fotosDoPacote([muitas]).length === 600);

// arquivos citados
const a = arquivosCitados('<script src="/assets/index-AbC123.js"></script><link href="/assets/index-x.css"> import("./jspdf-9x.js") "assets/xlsx-Q1.js" "assets/a.png"');
t("arquivos: js e css entre aspas, com barra inicial e sem duplicar", a.includes("/assets/index-AbC123.js") && a.includes("/assets/index-x.css") && a.includes("/assets/xlsx-Q1.js") && !a.some((x) => x.endsWith(".png")) && new Set(a).size === a.length);
t("arquivos: texto solto sem aspas não vira download (evita 404 que apagaria a casca)", arquivosCitados("// veja assets/solto.js e /assets/outro.css aqui").length === 0);

// marca por pessoa
t("sem marca: não baixado", pacoteBaixado("u1") === false && pacoteBaixado(null) === false);
esquecerPacote("u1");

// baixarPacote sem sessão recusa
let recusou = false; try { await baixarPacote({ uid: null }); } catch { recusou = true; }
t("sem sessão recusa", recusou);

// o service worker e o app usam o MESMO nome de cache de fotos, e fotos não apagam com troca de versão do shell
const sw = fs.readFileSync("public/sw.js", "utf8");
const cst = fs.readFileSync("src/lib/constantes.js", "utf8");
const nomeSW = /const CACHE_FOTOS = "([^"]+)"/.exec(sw)?.[1], nomeApp = /CACHE_FOTOS_NOME = "([^"]+)"/.exec(cst)?.[1];
t("nome do cache de fotos igual no sw.js e no app", !!nomeSW && nomeSW === nomeApp);
t("sw não apaga o cache de fotos na ativação", /n !== CACHE_FOTOS/.test(sw));
t("sw guarda só resposta ok e nunca /supa", /resp\.ok/.test(sw) && /guardarFoto\(url, r\)/.test(sw) && /startsWith\("\/supa\/"\)\) return/.test(sw));
t("sw pede a foto como CORS para poder guardar", /mode: "cors", credentials: "omit"/.test(sw));
t("sw só guarda resposta de imagem", /image\\\//.test(sw));
t("sw tem teto de fotos", /MAX_FOTOS/.test(sw) && /c\.delete\(k\)/.test(sw));

// APK: página offline e caminho de erro
const cap = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
const wf = fs.readFileSync(".github/workflows/android.yml", "utf8");
t("capacitor: errorPath aponta para offline.html", cap.server.errorPath === "offline.html" && fs.existsSync("android-config/offline.html"));
t("workflow copia offline.html", /android-config\/offline\.html" www\/offline\.html/.test(wf));

// App: tela de progresso, nome do titular, e a marca some ao sair
const app = fs.readFileSync("src/App.jsx", "utf8");
t("app: modal de importação recebe o nome", /<ImportandoDadosModal T=\{T\} onOcultar=/.test(app) && /processarFila\(\(feitos, total\) => setSincroniza/.test(app));
t("app: sincronização limpa o modal no fim", /finally \{ setSincroniza\(null\); \}/.test(app));
t("sair apaga as fotos guardadas", /caches\.delete\(CACHE_FOTOS_NOME\)/.test(app));
t("app: sair esquece o pacote", /esquecerPacote\(sessaoRef\.current\)/.test(app));
t("app: promotor (anônimo) não monta pacote", /is_anonymous\) return undefined; \/\/ promotor/.test(app));

console.log(`teste-pacote-offline: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

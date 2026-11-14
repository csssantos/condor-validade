// Gera a imagem de compartilhamento do produto (estilo tela de carregamento: fundo azul da marca,
// círculo claro, foto do produto e os dados embaixo). Só desenha no canvas; nada sai do aparelho.
const L = 1080;

// Só desenha foto de origem conhecida (data URL jpeg/png/webp ou Open Food Facts): evita rastreio por URL de terceiros
// e SVG (que pode sujar o canvas). Limite de tamanho e de tempo para não travar o aparelho.
function origemPermitida(src) {
  if (/^data:image\/(jpeg|png|webp);base64,/i.test(src)) return src.length < 3_000_000;
  // links aceitos: Open Food Facts e o armazenamento de fotos do próprio app (bucket público "fotos")
  try { const u = new URL(src); return u.protocol === "https:" && (/(^|\.)openfoodfacts\.org$/i.test(u.hostname) || (u.hostname === "fbovltxucooeoldjfckk.supabase.co" && u.pathname.startsWith("/storage/v1/object/public/fotos/"))); } catch { return false; }
}
function carregarImagem(src) {
  return new Promise((resolve) => {
    if (!src || typeof src !== "string" || !origemPermitida(src)) return resolve(null);
    const img = new Image();
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    const t = setTimeout(() => resolve(null), 6000);
    img.onload = () => { clearTimeout(t); resolve(img.width * img.height > 4_000_000 ? null : img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = src;
  });
}

// Bipi (mascote) sorridente: PNG do próprio app (mesma origem, não suja o canvas). Se não carregar, a imagem sai sem ele.
let bipiCache = null;
function carregarBipi() {
  if (bipiCache) return Promise.resolve(bipiCache);
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), 4000);
    img.onload = () => { clearTimeout(t); if (img.width > 0) bipiCache = img; resolve(img.width > 0 ? img : null); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = "/bipi-acenando.png";
  });
}

function retArredondado(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function quebrar(c, texto, larguraMax, maxLinhas) {
  const palavras = String(texto || "").split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = "";
  for (const p of palavras) {
    const t = atual ? `${atual} ${p}` : p;
    if (c.measureText(t).width <= larguraMax || !atual) atual = t;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  // palavra maior que a linha (ex.: código colado): corta com reticências
  for (let i = 0; i < linhas.length; i++) {
    if (c.measureText(linhas[i]).width > larguraMax) {
      let u = linhas[i];
      while (u.length > 1 && c.measureText(u + "…").width > larguraMax) u = u.slice(0, -1);
      linhas[i] = u + "…";
    }
  }
  if (linhas.length > maxLinhas) {
    linhas.length = maxLinhas;
    let u = linhas[maxLinhas - 1];
    while (u.length > 1 && c.measureText(u + "…").width > larguraMax) u = u.slice(0, -1);
    linhas[maxLinhas - 1] = u + "…";
  }
  return linhas;
}

// dados: { nome, subtitulo, foto, status, corStatus, corTextoStatus, destaque: {rotulo, valor, sub},
//          tiles: [[rótulo, valor], ...], lotes: [{lote, validade, quantidade, campanha, cor, atual}], codigo, geradoEm }
const cortar = (v, n) => String(v ?? "").replace(/[\u202A-\u202E\u2066-\u2069]/g, "").slice(0, n);

const AZUL = "#0B4F9E", MARINHO = "#0B2447", CINZA = "#5B6B82", PAPEL = "#F2F6FC";

function cortarLinha(c, v, larg) {
  let t = String(v);
  if (c.measureText(t).width <= larg) return t;
  while (t.length > 1 && c.measureText(t + "…").width > larg) t = t.slice(0, -1);
  return t + "…";
}

// ---- código de barras (EAN-13, UPC-A como EAN-13 com 0 na frente, EAN-8) desenhado de verdade ----
const COD_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const COD_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const COD_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARIDADE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
// devolve { bits, digitos, tipo } ou null (código interno "int:"/"bal:", tamanho estranho ou dígito verificador errado)
export function barrasDoCodigo(codigo) {
  let c = String(codigo ?? "").trim();
  if (!/^\d+$/.test(c)) return null;
  const tipo = c.length === 12 ? "UPC-A" : c.length === 13 ? "EAN-13" : c.length === 8 ? "EAN-8" : null;
  if (!tipo) return null;
  if (c.length === 12) c = "0" + c;
  const d = c.split("").map(Number);
  const n = d.length - 1; // dígitos sem o verificador
  let soma = 0;
  for (let k = 0; k < n; k++) soma += d[k] * ((n - k) % 2 === 1 ? 3 : 1);
  if ((10 - (soma % 10)) % 10 !== d[n]) return null;
  if (d.every((x) => x === 0)) return null;
  let bits = "101";
  if (d.length === 13) {
    const par = PARIDADE[d[0]];
    for (let k = 0; k < 6; k++) bits += (par[k] === "L" ? COD_L : COD_G)[d[1 + k]];
    bits += "01010";
    for (let k = 0; k < 6; k++) bits += COD_R[d[7 + k]];
  } else {
    for (let k = 0; k < 4; k++) bits += COD_L[d[k]];
    bits += "01010";
    for (let k = 0; k < 4; k++) bits += COD_R[d[4 + k]];
  }
  bits += "101";
  return { bits, digitos: c, tipo };
}

export async function gerarImagemProduto(entrada) {
  const d = entrada.destaque || null;
  const dados = {
    ...entrada,
    nome: cortar(entrada.nome, 120) || "Produto",
    subtitulo: cortar(entrada.subtitulo, 90),
    status: cortar(entrada.status, 24),
    corStatus: entrada.corStatus || "#6B7C93",
    corTextoStatus: entrada.corTextoStatus || "#FFFFFF",
    geradoEm: cortar(entrada.geradoEm, 40) || new Date().toLocaleString("pt-BR"),
    destaque: d && (d.rotulo || d.valor) ? { rotulo: cortar(d.rotulo, 20), valor: cortar(d.valor, 24), sub: cortar(d.sub, 48) } : null,
    tiles: (entrada.tiles || []).slice(0, 9).map((l) => [cortar(l && l[0], 24), cortar(l && l[1], 40)]).filter((l) => l[1] !== ""),
    lotes: (entrada.lotes || []).slice(0, 6).map((l) => ({
      lote: cortar(l && l.lote, 24), validade: cortar(l && l.validade, 12), quantidade: cortar(l && l.quantidade, 16),
      campanha: cortar(l && l.campanha, 20), cor: /^#[0-9A-Fa-f]{6}$/.test(l && l.cor) ? l.cor : "#6B7C93", atual: !!(l && l.atual),
    })),
    maisLotes: Math.max(0, Math.min(99, Number(entrada.maisLotes) || 0)),
  };
  const barras = barrasDoCodigo(entrada.codigo);
  const fonte = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
  const medidor = document.createElement("canvas").getContext("2d");

  // ---- medidas ----
  const [img, bipi] = await Promise.all([carregarImagem(dados.foto), carregarBipi()]);
  const fx = 56, fy = 150, fw = 380, fh = img ? 380 : 300;
  const colX = fx + fw + 44, colW = L - 56 - colX;
  medidor.font = `800 52px ${fonte}`;
  const nome = quebrar(medidor, dados.nome, colW, 4);
  const yNome = fy + 60;
  const faixaAlt = Math.max(fy + fh + 60, yNome + nome.length * 62 + 110);
  const yDest = faixaAlt - 30;
  const altDest = dados.destaque ? 240 : 0;
  const gap = 22, cols = 3, tw = (L - 100 - gap * (cols - 1)) / cols, altTile = 132;
  const yTiles = yDest + (dados.destaque ? altDest + 34 : 60);
  const linhasTiles = Math.ceil(dados.tiles.length / cols);
  const altTiles = linhasTiles ? linhasTiles * (altTile + gap) : 0;
  const yLotes = yTiles + altTiles + (altTiles ? 8 : 0);
  const altLinhaLote = 74;
  const exibeLotes = dados.lotes.length > 1;
  const altLotes = exibeLotes ? 120 + dados.lotes.length * altLinhaLote + (dados.maisLotes ? 56 : 0) : 0;
  const yBarras = yLotes + altLotes + (exibeLotes ? 30 : 0);
  const altBarras = barras ? 360 : 0;
  const yRodape = yBarras + altBarras + (barras ? 30 : 10);
  const A = yRodape + 250;

  const canvas = document.createElement("canvas");
  canvas.width = L; canvas.height = A;
  const c = canvas.getContext("2d");
  c.textBaseline = "alphabetic";

  // ---- fundo + faixa azul ----
  c.fillStyle = PAPEL; c.fillRect(0, 0, L, A);
  const topo = c.createLinearGradient(0, 0, L, faixaAlt);
  topo.addColorStop(0, "#1B6FD1"); topo.addColorStop(0.55, AZUL); topo.addColorStop(1, "#061C3A");
  c.fillStyle = topo; c.fillRect(0, 0, L, faixaAlt);
  c.fillStyle = "rgba(255,255,255,0.09)";
  c.beginPath(); c.arc(L - 100, faixaAlt - 40, 230, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(40, 80, 130, 0, Math.PI * 2); c.fill();

  c.fillStyle = "rgba(255,255,255,0.92)"; c.font = `700 24px ${fonte}`;
  const marca = "C O N D O R  ·  A L E R T A  D E  V A L I D A D E";
  c.fillText(marca, 56, 84);
  const larguraMarca = c.measureText(marca).width;

  // selo de status (nunca encosta na marca)
  const rot = dados.status.toUpperCase();
  if (rot) {
    const livre = L - 56 - (56 + larguraMarca + 24);
    c.font = `800 28px ${fonte}`;
    let t = rot;
    while (t.length > 3 && c.measureText(t).width + 52 > livre) t = t.slice(0, -1);
    if (t !== rot) t += "…";
    const sw = c.measureText(t).width + 52;
    c.fillStyle = dados.corStatus; retArredondado(c, L - 56 - sw, 48, sw, 56, 28); c.fill();
    c.fillStyle = dados.corTextoStatus; c.fillText(t, L - 56 - sw + 26, 86);
  }

  // ---- foto à esquerda, nome à direita ----
  c.save();
  c.shadowColor = "rgba(6,28,58,0.35)"; c.shadowBlur = 44; c.shadowOffsetY = 20;
  c.fillStyle = "#FFFFFF"; retArredondado(c, fx, fy, fw, fh, 52); c.fill();
  c.restore();
  if (img && img.width && img.height) {
    c.save();
    retArredondado(c, fx, fy, fw, fh, 52); c.clip();
    const k = Math.min((fw - 56) / img.width, (fh - 56) / img.height);
    const w = img.width * k, h = img.height * k;
    c.drawImage(img, fx + (fw - w) / 2, fy + (fh - h) / 2, w, h);
    c.restore();
  } else {
    c.fillStyle = "#C9D9EF"; c.font = `800 44px ${fonte}`; c.textAlign = "center";
    c.fillText("SEM FOTO", fx + fw / 2, fy + fh / 2 + 15); c.textAlign = "left";
  }
  c.fillStyle = "#FFFFFF"; c.font = `800 52px ${fonte}`;
  nome.forEach((t, i) => c.fillText(t, colX, yNome + i * 62));
  if (dados.subtitulo) {
    c.fillStyle = "rgba(255,255,255,0.80)"; c.font = `600 28px ${fonte}`;
    c.fillText(cortarLinha(c, dados.subtitulo, colW), colX, yNome + nome.length * 62 + 22);
  }

  // ---- validade em destaque (cor do status) ----
  if (dados.destaque) {
    c.save();
    c.shadowColor = "rgba(6,28,58,0.25)"; c.shadowBlur = 30; c.shadowOffsetY = 12;
    c.fillStyle = dados.corStatus; retArredondado(c, 50, yDest, L - 100, altDest, 48); c.fill();
    c.restore();
    c.fillStyle = dados.corTextoStatus;
    c.globalAlpha = 0.85; c.font = `700 26px ${fonte}`;
    c.fillText(dados.destaque.rotulo.toUpperCase(), 92, yDest + 58); c.globalAlpha = 1;
    c.font = `800 92px ${fonte}`;
    c.fillText(cortarLinha(c, dados.destaque.valor, L - 184), 92, yDest + 150);
    if (dados.destaque.sub) {
      c.font = `700 32px ${fonte}`; c.textAlign = "right";
      c.fillText(cortarLinha(c, dados.destaque.sub, 440), L - 92, yDest + 58); c.textAlign = "left";
    }
    c.globalAlpha = 0.85; c.font = `600 23px ${fonte}`;
    c.fillText(`Situação em ${dados.geradoEm}`, 92, yDest + 206); c.globalAlpha = 1;
  }

  // ---- cartões de informação (3 por linha) ----
  const tile = (x, y, w, [r, v]) => {
    c.save();
    c.shadowColor = "rgba(6,28,58,0.10)"; c.shadowBlur = 16; c.shadowOffsetY = 5;
    c.fillStyle = "#FFFFFF"; retArredondado(c, x, y, w, altTile, 32); c.fill();
    c.restore();
    c.fillStyle = CINZA; c.font = `700 22px ${fonte}`; c.fillText(cortarLinha(c, r.toUpperCase(), w - 56), x + 28, y + 46);
    c.fillStyle = MARINHO; c.font = `800 38px ${fonte}`; c.fillText(cortarLinha(c, v, w - 56), x + 28, y + 100);
  };
  dados.tiles.forEach((t, i) => tile(50 + (i % cols) * (tw + gap), yTiles + Math.floor(i / cols) * (altTile + gap), tw, t));

  // ---- lotes do produto ----
  if (exibeLotes) {
    c.save();
    c.shadowColor = "rgba(6,28,58,0.10)"; c.shadowBlur = 16; c.shadowOffsetY = 5;
    c.fillStyle = "#FFFFFF"; retArredondado(c, 50, yLotes, L - 100, altLotes, 36); c.fill();
    c.restore();
    c.fillStyle = CINZA; c.font = `700 24px ${fonte}`;
    c.fillText("LOTES DESTE PRODUTO", 88, yLotes + 56);
    dados.lotes.forEach((l, i) => {
      const y = yLotes + 90 + i * altLinhaLote;
      if (l.atual) { c.fillStyle = "#EAF1FB"; retArredondado(c, 70, y - 6, L - 140, altLinhaLote - 8, 24); c.fill(); }
      c.fillStyle = l.cor; c.beginPath(); c.arc(106, y + 30, 11, 0, Math.PI * 2); c.fill();
      c.fillStyle = MARINHO; c.font = `800 32px ${fonte}`;
      c.fillText(cortarLinha(c, l.lote ? `Lote ${l.lote}` : "Sem lote", 330), 134, y + 42);
      c.font = `700 30px ${fonte}`; c.fillText(l.validade, 484, y + 42);
      c.fillStyle = CINZA; c.font = `700 28px ${fonte}`; c.textAlign = "right";
      c.fillText(cortarLinha(c, l.campanha ? `Campanha ${l.campanha}` : l.quantidade, 330), L - 94, y + 42); c.textAlign = "left";
    });
    if (dados.maisLotes) {
      c.fillStyle = CINZA; c.font = `600 26px ${fonte}`;
      c.fillText(`+ ${dados.maisLotes} outro${dados.maisLotes === 1 ? "" : "s"} lote${dados.maisLotes === 1 ? "" : "s"}`, 88, yLotes + altLotes - 28);
    }
  }

  // ---- código de barras ----
  if (barras) {
    c.save();
    c.shadowColor = "rgba(6,28,58,0.10)"; c.shadowBlur = 16; c.shadowOffsetY = 5;
    c.fillStyle = "#FFFFFF"; retArredondado(c, 50, yBarras, L - 100, altBarras, 36); c.fill();
    c.restore();
    c.fillStyle = CINZA; c.font = `700 24px ${fonte}`;
    c.fillText(`CÓDIGO DE BARRAS · ${barras.tipo}`, 88, yBarras + 56);
    const mod = Math.floor(640 / barras.bits.length);
    const larg = mod * barras.bits.length;
    const x0 = Math.round((L - larg) / 2), y0 = yBarras + 86, hb = 170;
    c.fillStyle = "#000000";
    for (let k = 0; k < barras.bits.length; k++) if (barras.bits[k] === "1") c.fillRect(x0 + k * mod, y0, mod, hb);
    const dg = barras.digitos;
    c.fillStyle = "#000000"; c.font = `600 40px ${mono}`; c.textAlign = "center";
    if (dg.length === 13) {
      c.fillText(dg[0], x0 - 30, y0 + hb + 50);
      c.fillText(dg.slice(1, 7).split("").join(" "), x0 + mod * 3 + mod * 21, y0 + hb + 50);
      c.fillText(dg.slice(7).split("").join(" "), x0 + mod * 50 + mod * 21, y0 + hb + 50);
    } else {
      c.fillText(dg.slice(0, 4).split("").join(" "), x0 + mod * 3 + mod * 14, y0 + hb + 50);
      c.fillText(dg.slice(4).split("").join(" "), x0 + mod * 36 + mod * 14, y0 + hb + 50);
    }
    c.textAlign = "left";
  }

  // ---- rodapé ----
  c.fillStyle = "#D6E2F3"; c.fillRect(50, yRodape + 6, L - 100, 3);
  c.fillStyle = AZUL; c.font = `800 34px ${fonte}`; c.fillText("Condor · Alerta de Validade", 64, yRodape + 86);
  c.fillStyle = CINZA; c.font = `500 26px ${fonte}`;
  c.fillText("Confira sempre a validade no app", 64, yRodape + 130);
  c.fillText(`Imagem gerada em ${dados.geradoEm}`, 64, yRodape + 174);
  if (bipi) {
    const bs = 210;
    c.drawImage(bipi, L - 50 - bs, yRodape + 20, bs, bs);
  }

  const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  canvas.width = 0; canvas.height = 0;
  return blob;
}

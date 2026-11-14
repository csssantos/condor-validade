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

// dados: { nome, foto, status, corStatus, corTextoStatus, destaque: {rotulo, valor, sub}, linhas: [[rótulo, valor], ...], geradoEm }
const cortar = (v, n) => String(v ?? "").replace(/[\u202A-\u202E\u2066-\u2069]/g, "").slice(0, n);

const AZUL = "#0B4F9E", MARINHO = "#0B2447", CINZA = "#5B6B82", PAPEL = "#F2F6FC";

function cortarLinha(c, v, larg) {
  let t = String(v);
  if (c.measureText(t).width <= larg) return t;
  while (t.length > 1 && c.measureText(t + "…").width > larg) t = t.slice(0, -1);
  return t + "…";
}

export async function gerarImagemProduto(entrada) {
  const d = entrada.destaque || null;
  const dados = {
    ...entrada,
    nome: cortar(entrada.nome, 120) || "Produto",
    status: cortar(entrada.status, 24),
    corStatus: entrada.corStatus || "#6B7C93",
    corTextoStatus: entrada.corTextoStatus || "#FFFFFF",
    geradoEm: cortar(entrada.geradoEm, 40) || new Date().toLocaleString("pt-BR"),
    destaque: d ? { rotulo: cortar(d.rotulo, 20), valor: cortar(d.valor, 24), sub: cortar(d.sub, 48) } : null,
    linhas: (entrada.linhas || []).slice(0, 8).map((l) => [cortar(l && l[0], 24), cortar(l && l[1], 80)]),
  };
  const fonte = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const linhas = dados.linhas.filter((l) => l[1] !== "");
  const largos = linhas.filter((l) => /^campanha$/i.test(l[0]));
  const pares = linhas.filter((l) => !/^campanha$/i.test(l[0]));
  const nLinhasGrade = Math.ceil(pares.length / 2) + largos.length;
  const medidor = document.createElement("canvas").getContext("2d");
  medidor.font = `800 62px ${fonte}`;
  const nome = quebrar(medidor, dados.nome, L - 140, 3);

  const [img, bipi] = await Promise.all([carregarImagem(dados.foto), carregarBipi()]);
  const fh = img ? 520 : 300; // sem foto: cartão menor (não parece erro)
  const yNome = 160 + fh + 110;
  const yDest = yNome + nome.length * 72 + 10;
  if (dados.destaque && !dados.destaque.rotulo && !dados.destaque.valor) dados.destaque = null;
  const altDest = dados.destaque ? 200 : 0;
  const yGrade = yDest + altDest + (dados.destaque ? 30 : 0);
  const altTile = 136, gap = 22;
  const altGrade = nLinhasGrade ? nLinhasGrade * (altTile + gap) : 0;
  const yRodape = yGrade + altGrade + 20;
  const A = yRodape + 250;

  const canvas = document.createElement("canvas");
  canvas.width = L; canvas.height = A;
  const c = canvas.getContext("2d");
  c.textBaseline = "alphabetic";

  // fundo claro + faixa azul da marca no topo
  c.fillStyle = PAPEL; c.fillRect(0, 0, L, A);
  const topo = c.createLinearGradient(0, 0, L, 480);
  topo.addColorStop(0, "#1B6FD1"); topo.addColorStop(0.55, AZUL); topo.addColorStop(1, "#061C3A");
  c.fillStyle = topo; c.fillRect(0, 0, L, 470);
  c.fillStyle = "rgba(255,255,255,0.09)";
  c.beginPath(); c.arc(L - 120, 120, 260, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(90, 430, 120, 0, Math.PI * 2); c.fill();

  c.fillStyle = "rgba(255,255,255,0.92)"; c.font = `700 26px ${fonte}`;
  c.fillText("C O N D O R  ·  A L E R T A  D E  V A L I D A D E", 64, 92);

  // selo de status no canto
  const rot = dados.status.toUpperCase();
  if (rot) {
    c.font = `700 26px ${fonte}`;
    const larguraTitulo = c.measureText("C O N D O R  ·  A L E R T A  D E  V A L I D A D E").width;
    const livre = L - 64 - (64 + larguraTitulo + 28);
    c.font = `800 30px ${fonte}`;
    let rotTxt = rot;
    while (rotTxt.length > 3 && c.measureText(rotTxt).width + 56 > livre) rotTxt = rotTxt.slice(0, -1);
    if (rotTxt !== rot) rotTxt += "…";
    const sw = c.measureText(rotTxt).width + 56;
    c.fillStyle = dados.corStatus; retArredondado(c, L - 64 - sw, 54, sw, 60, 30); c.fill();
    c.fillStyle = dados.corTextoStatus; c.fillText(rotTxt, L - 64 - sw + 28, 94);
  }

  // cartão da foto, centralizado e cruzando a faixa azul
  const fw = 600, fx = (L - fw) / 2, fy = 160;
  c.save();
  c.shadowColor = "rgba(6,28,58,0.35)"; c.shadowBlur = 50; c.shadowOffsetY = 22;
  c.fillStyle = "#FFFFFF"; retArredondado(c, fx, fy, fw, fh, 60); c.fill();
  c.restore();
  if (img && img.width && img.height) {
    c.save();
    retArredondado(c, fx, fy, fw, fh, 60); c.clip();
    const k = Math.min((fw - 70) / img.width, (fh - 70) / img.height);
    const w = img.width * k, h = img.height * k;
    c.drawImage(img, fx + (fw - w) / 2, fy + (fh - h) / 2, w, h);
    c.restore();
  } else {
    c.fillStyle = "#C9D9EF"; c.font = `800 52px ${fonte}`; c.textAlign = "center";
    c.fillText("SEM FOTO", fx + fw / 2, fy + fh / 2 + 18); c.textAlign = "left";
  }

  // nome
  c.fillStyle = MARINHO; c.font = `800 62px ${fonte}`; c.textAlign = "center";
  nome.forEach((t, i) => c.fillText(t, L / 2, yNome + i * 72));
  c.textAlign = "left";

  // destaque: validade (a informação principal), na cor do status
  if (dados.destaque) {
    c.save();
    c.shadowColor = "rgba(6,28,58,0.22)"; c.shadowBlur = 30; c.shadowOffsetY = 12;
    c.fillStyle = dados.corStatus; retArredondado(c, 50, yDest, L - 100, altDest, 48); c.fill();
    c.restore();
    c.fillStyle = dados.corTextoStatus;
    c.globalAlpha = 0.85; c.font = `700 28px ${fonte}`;
    c.fillText(dados.destaque.rotulo.toUpperCase(), 96, yDest + 62); c.globalAlpha = 1;
    c.font = `800 88px ${fonte}`;
    c.fillText(cortarLinha(c, dados.destaque.valor, L - 192), 96, yDest + 148);
    if (dados.destaque.sub) {
      c.font = `700 32px ${fonte}`; c.textAlign = "right";
      c.fillText(cortarLinha(c, dados.destaque.sub, 420), L - 96, yDest + 62); c.textAlign = "left";
    }
    // a imagem circula parada: deixa claro de quando é a situação
    c.globalAlpha = 0.85; c.font = `600 24px ${fonte}`; c.textAlign = "right";
    c.fillText(`Situação em ${dados.geradoEm}`, L - 96, yDest + 160); c.textAlign = "left"; c.globalAlpha = 1;
  }

  // grade de informações (2 colunas; campanha ocupa a linha toda)
  const tw = (L - 100 - gap) / 2;
  const tile = (x, y, w, [r, v], accent) => {
    c.save();
    c.shadowColor = "rgba(6,28,58,0.10)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = "#FFFFFF"; retArredondado(c, x, y, w, altTile, 36); c.fill();
    c.restore();
    if (accent) { c.fillStyle = accent; retArredondado(c, x, y + 28, 10, altTile - 56, 5); c.fill(); }
    c.fillStyle = CINZA; c.font = `700 24px ${fonte}`; c.fillText(r.toUpperCase(), x + 40, y + 52);
    c.fillStyle = MARINHO; c.font = `800 40px ${fonte}`; c.fillText(cortarLinha(c, v, w - 80), x + 40, y + 104);
  };
  let yy = yGrade;
  largos.forEach((l) => { tile(50, yy, L - 100, l, "#E8A317"); yy += altTile + gap; });
  for (let i = 0; i < pares.length; i += 2) {
    tile(50, yy, tw, pares[i]);
    if (pares[i + 1]) tile(50 + tw + gap, yy, tw, pares[i + 1]);
    yy += altTile + gap;
  }

  // rodapé: Bipi + origem da imagem
  c.fillStyle = "#D6E2F3"; c.fillRect(50, yRodape + 10, L - 100, 3);
  c.fillStyle = AZUL; c.font = `800 34px ${fonte}`; c.fillText("Condor · Alerta de Validade", 64, yRodape + 90);
  c.fillStyle = CINZA; c.font = `500 26px ${fonte}`;
  c.fillText("Confira o produto e a validade no app", 64, yRodape + 134);
  c.fillText(`Imagem gerada em ${dados.geradoEm}`, 64, yRodape + 178);
  if (bipi) {
    const bs = 210;
    c.drawImage(bipi, L - 50 - bs, yRodape + 20, bs, bs);
  }

  const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  canvas.width = 0; canvas.height = 0;
  return blob;
}

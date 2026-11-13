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
    img.src = "/bipi-compartilhar.png";
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

// dados: { nome, foto, status, corStatus, linhas: [[rótulo, valor], ...], geradoEm }
const cortar = (v, n) => String(v ?? "").replace(/[\u202A-\u202E\u2066-\u2069]/g, "").slice(0, n);

export async function gerarImagemProduto(entrada) {
  const dados = {
    ...entrada,
    nome: cortar(entrada.nome, 120) || "Produto",
    status: cortar(entrada.status, 24),
    corStatus: entrada.corStatus || "#6B7C93",
    corTextoStatus: entrada.corTextoStatus || "#FFFFFF",
    geradoEm: cortar(entrada.geradoEm, 40) || new Date().toLocaleString("pt-BR"),
    linhas: (entrada.linhas || []).slice(0, 6).map((l) => [cortar(l && l[0], 24), cortar(l && l[1], 60)]),
  };
  const canvas = document.createElement("canvas");
  const fonte = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const linhas = (dados.linhas || []).filter((l) => l && l[1] !== undefined && l[1] !== null && l[1] !== "");
  const altLinha = 82;
  // mede o nome antes para dimensionar a altura (nome de 1 a 3 linhas, de 3 a 5 dados)
  const medidor = document.createElement("canvas").getContext("2d");
  medidor.font = `800 62px ${fonte}`;
  const nome = quebrar(medidor, dados.nome, L - 140, 3);
  const yDados = 870 + nome.length * 74 + 30;
  const A = yDados + linhas.length * altLinha + 150;
  canvas.width = L; canvas.height = A;
  const c = canvas.getContext("2d");

  const fundo = c.createRadialGradient(L * 0.7, 260, 60, L * 0.5, 600, 1300);
  fundo.addColorStop(0, "#1B6FD1"); fundo.addColorStop(0.5, "#0B4F9E"); fundo.addColorStop(1, "#061C3A");
  c.fillStyle = fundo; c.fillRect(0, 0, L, A);
  c.fillStyle = "rgba(255,255,255,0.10)";
  c.beginPath(); c.arc(L * 0.72, 330, 330, 0, Math.PI * 2); c.fill();

  c.fillStyle = "rgba(255,255,255,0.85)"; c.font = `700 30px ${fonte}`; c.textBaseline = "alphabetic";
  c.font = `700 28px ${fonte}`;
  c.fillText("C O N D O R  ·  A L E R T A  D E  V A L I D A D E", 70, 100);

  // bolinhas de estado (como a tela de carregamento)
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i === 0 ? dados.corStatus : "rgba(255,255,255,0.45)";
    c.beginPath(); c.arc(L - 150 + i * 36, 90, 10, 0, Math.PI * 2); c.fill();
  }

  // cartão da foto
  const fx = 70, fy = 150, fw = 640, fh = 520;
  c.save();
  c.shadowColor = "rgba(0,0,0,0.30)"; c.shadowBlur = 40; c.shadowOffsetY = 18;
  c.fillStyle = "#FFFFFF"; retArredondado(c, fx, fy, fw, fh, 56); c.fill();
  c.restore();
  const [img, bipi] = await Promise.all([carregarImagem(dados.foto), carregarBipi()]);
  if (img && img.width && img.height) {
    c.save();
    retArredondado(c, fx, fy, fw, fh, 56); c.clip();
    const k = Math.min((fw - 60) / img.width, (fh - 60) / img.height);
    const w = img.width * k, h = img.height * k;
    c.drawImage(img, fx + (fw - w) / 2, fy + (fh - h) / 2, w, h);
    c.restore();
  } else {
    c.fillStyle = "#C9D9EF"; c.font = `800 54px ${fonte}`; c.textAlign = "center";
    c.fillText("SEM FOTO", fx + fw / 2, fy + fh / 2 + 18); c.textAlign = "left";
  }

  // Bipi sorridente ao lado do cartão da foto (nunca em cima da embalagem)
  if (bipi) {
    const bs = 320;
    c.save();
    c.shadowColor = "rgba(0,0,0,0.28)"; c.shadowBlur = 24; c.shadowOffsetY = 10;
    c.drawImage(bipi, L - 40 - bs, fy + fh - bs + 30, bs, bs);
    c.restore();
  }

  // selo de status
  c.font = `800 34px ${fonte}`;
  const rot = dados.status.toUpperCase();
  if (rot) {
    const sw = c.measureText(rot).width + 70;
    c.fillStyle = dados.corStatus; retArredondado(c, 70, 720, sw, 66, 33); c.fill();
    c.fillStyle = dados.corTextoStatus; c.fillText(rot, 105, 766);
  }

  // nome
  c.fillStyle = "#FFFFFF"; c.font = `800 62px ${fonte}`;
  nome.forEach((t, i) => c.fillText(t, 70, 870 + i * 74));

  // dados
  const y = yDados;
  if (linhas.length) {
    c.fillStyle = "rgba(255,255,255,0.12)";
    retArredondado(c, 50, y - 20, L - 100, linhas.length * altLinha + 30, 40); c.fill();
  }
  linhas.forEach(([rot2, val], i) => {
    const yy = y + 40 + i * altLinha;
    c.fillStyle = "rgba(255,255,255,0.70)"; c.font = `600 28px ${fonte}`; c.fillText(String(rot2), 90, yy);
    c.fillStyle = "#FFFFFF"; c.font = `700 36px ${fonte}`; c.textAlign = "right";
    let v = String(val);
    if (c.measureText(v).width > L - 420) {
      while (v.length > 1 && c.measureText(v + "…").width > L - 420) v = v.slice(0, -1);
      v += "…";
    }
    c.fillText(v, L - 90, yy + 4); c.textAlign = "left";
  });

  c.fillStyle = "rgba(255,255,255,0.70)"; c.font = `500 26px ${fonte}`;
  c.fillText(`Imagem gerada em ${dados.geradoEm}`, 70, A - 60);

  const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  canvas.width = 0; canvas.height = 0;
  return blob;
}

// Gera a imagem de compartilhamento do produto (estilo tela de carregamento: fundo azul da marca,
// círculo claro, foto do produto e os dados embaixo). Só desenha no canvas; nada sai do aparelho.
const L = 1080;

function carregarImagem(src) {
  return new Promise((resolve) => {
    if (!src || typeof src !== "string") return resolve(null);
    const img = new Image();
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
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
  if (linhas.length > maxLinhas) {
    linhas.length = maxLinhas;
    let u = linhas[maxLinhas - 1];
    while (u.length > 1 && c.measureText(u + "…").width > larguraMax) u = u.slice(0, -1);
    linhas[maxLinhas - 1] = u + "…";
  }
  return linhas;
}

// dados: { nome, foto, status, corStatus, linhas: [[rótulo, valor], ...], geradoEm }
export async function gerarImagemProduto(dados) {
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
  c.fillText("C O N D O R   ·   A L E R T A   D E   V A L I D A D E".replace(/ {3}/g, "  "), 70, 100);

  // bolinhas de estado (como a tela de carregamento)
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i === 0 ? dados.corStatus : "rgba(255,255,255,0.45)";
    c.beginPath(); c.arc(L - 150 + i * 36, 90, 10, 0, Math.PI * 2); c.fill();
  }

  // cartão da foto
  const fx = 190, fy = 150, fw = L - 380, fh = 520;
  c.save();
  c.shadowColor = "rgba(0,0,0,0.30)"; c.shadowBlur = 40; c.shadowOffsetY = 18;
  c.fillStyle = "#FFFFFF"; retArredondado(c, fx, fy, fw, fh, 56); c.fill();
  c.restore();
  const img = await carregarImagem(dados.foto);
  if (img && img.width && img.height) {
    c.save();
    retArredondado(c, fx, fy, fw, fh, 56); c.clip();
    const k = Math.min((fw - 60) / img.width, (fh - 60) / img.height);
    const w = img.width * k, h = img.height * k;
    c.drawImage(img, fx + (fw - w) / 2, fy + (fh - h) / 2, w, h);
    c.restore();
  } else {
    c.fillStyle = "#D5E3F7"; c.font = `800 110px ${fonte}`; c.textAlign = "center";
    c.fillText("📦", fx + fw / 2, fy + fh / 2 + 40); c.textAlign = "left";
  }

  // selo de status
  c.font = `800 34px ${fonte}`;
  const rot = String(dados.status || "").toUpperCase();
  const sw = c.measureText(rot).width + 70;
  c.fillStyle = dados.corStatus; retArredondado(c, 70, 720, sw, 66, 33); c.fill();
  c.fillStyle = "#FFFFFF"; c.fillText(rot, 105, 766);

  // nome
  c.fillStyle = "#FFFFFF"; c.font = `800 62px ${fonte}`;
  nome.forEach((t, i) => c.fillText(t, 70, 870 + i * 74));

  // dados
  const y = yDados;
  c.fillStyle = "rgba(255,255,255,0.12)";
  retArredondado(c, 50, y - 20, L - 100, linhas.length * altLinha + 30, 40); c.fill();
  linhas.forEach(([rot2, val], i) => {
    const yy = y + 40 + i * altLinha;
    c.fillStyle = "rgba(255,255,255,0.70)"; c.font = `600 28px ${fonte}`; c.fillText(String(rot2), 90, yy);
    c.fillStyle = "#FFFFFF"; c.font = `700 36px ${fonte}`; c.textAlign = "right";
    let v = String(val);
    while (v.length > 1 && c.measureText(v).width > L - 420) v = v.slice(0, -1);
    c.fillText(v, L - 90, yy + 4); c.textAlign = "left";
  });

  c.fillStyle = "rgba(255,255,255,0.70)"; c.font = `500 26px ${fonte}`;
  c.fillText(`Imagem gerada em ${dados.geradoEm}`, 70, A - 60);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

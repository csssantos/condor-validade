// Identidade visual dos PDFs do Condor = a mesma da tela de carregamento:
// degradê azul da marca, círculo claro translúcido, bolinhas, logo em cartão branco e o Bipi.
// Todas as tabelas medem o texto (splitTextToSize) e quebram/cortam dentro da coluna:
// nada passa por cima da coluna vizinha.
import jsPDF from "jspdf";

export const COR = {
  azul: [11, 79, 158], azulEscuro: [8, 47, 94], azulClaro: [27, 111, 209], fundoEscuro: [6, 28, 58],
  vermelho: [227, 30, 36], ambar: [201, 138, 12], verde: [31, 157, 85],
  cinza: [107, 114, 128], claro: [244, 247, 252], linha: [226, 232, 242], zebra: [248, 250, 253],
};

const PAG_W = 210, PAG_H = 297, MARG = 14, AREA_W = PAG_W - MARG * 2;

let bipiCache = "";
async function carregarBipiDataUrl() {
  if (bipiCache) return bipiCache;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch("/bipi-compartilhar.png", { signal: ctl.signal });
    if (!r.ok) throw new Error("bipi");
    const blob = await r.blob();
    clearTimeout(t);
    if (blob.size > 600000) throw new Error("grande");
    bipiCache = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); });
  } catch { return null; } // não guarda a falha: tenta de novo no próximo PDF
  return bipiCache || null;
}

function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }

function comOpacidade(doc, op, fn) {
  let ok = false;
  try { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: op })); ok = true; } catch { /* sem opacidade */ }
  try { fn(); } finally { if (ok) { try { doc.restoreGraphicsState(); } catch { /* ignora */ } } }
}

function degrade(doc, x, y, w, h) {
  const passos = 28;
  for (let i = 0; i < passos; i++) {
    const t = i / (passos - 1);
    const c = t < 0.5 ? mix(COR.azulClaro, COR.azul, t * 2) : mix(COR.azul, COR.fundoEscuro, (t - 0.5) * 2);
    doc.setFillColor(...c);
    doc.rect(x + (w / passos) * i, y, w / passos + 0.3, h, "F");
  }
}

export async function criarPDF({ titulo, subtitulo, usuario, lojaNumero, logo, logoProporcao = 199 / 900, formatarDataHora, bipi = true }) {
  const doc = new jsPDF();
  const bipiImg = bipi ? await carregarBipiDataUrl() : null;
  const loja = lojaNumero || "79";
  const geradoEm = formatarDataHora ? formatarDataHora(new Date().toISOString()) : new Date().toLocaleString("pt-BR");
  const S = { y: 0 };
  // Corta com "…" qualquer linha mais larga que o espaço (palavra gigante sem espaço também).
  const caber = (t, w) => {
    t = String(t);
    if (doc.getTextWidth(t) <= w) return t;
    while (t.length > 1 && doc.getTextWidth(t + "…") > w) t = t.slice(0, -1);
    return t + "…";
  };
  const quebrar = (t, w) => doc.splitTextToSize(String(t), w).map((l) => caber(l, w));

  // ---- capa (primeira página) ----
  const CAPA_H = 60;
  degrade(doc, 0, 0, PAG_W, CAPA_H);
  comOpacidade(doc, 0.13, () => { doc.setFillColor(255, 255, 255); doc.circle(PAG_W - 34, 22, 34, "F"); });
  [[22, 52, 3], [60, 55, 2], [118, 53, 2.6], [150, 8, 2], [92, 6, 1.6], [186, 54, 3.4]].forEach(([bx, by, br]) =>
    comOpacidade(doc, 0.16, () => { doc.setFillColor(255, 255, 255); doc.circle(bx, by, br, "F"); }));
  doc.setFillColor(...COR.vermelho);
  doc.rect(0, CAPA_H, PAG_W, 1.6, "F");
  if (bipiImg) { try { doc.addImage(bipiImg, "PNG", PAG_W - 54, 4, 42, 42); } catch { /* sem Bipi */ } }
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(MARG, 9, 52, 14, 3, 3, "F");
    const lw = 46, lh = lw * logoProporcao;
    try { doc.addImage(logo, "PNG", MARG + 3, 9 + (14 - lh) / 2, lw, lh); } catch { /* sem logo */ }
  }
  doc.setTextColor(190, 214, 245); doc.setFont(undefined, "bold"); doc.setFontSize(7);
  doc.text("CONDOR · ALERTA DE VALIDADE", MARG, 31, { charSpace: 0.6 });
  doc.setTextColor(255, 255, 255); doc.setFontSize(17);
  const tl = quebrar(titulo, bipiImg ? 120 : 170).slice(0, 2);
  doc.text(tl, MARG, 38.5);
  doc.setFont(undefined, "normal"); doc.setFontSize(8.5); doc.setTextColor(214, 228, 248);
  const sub = `Loja ${loja}${subtitulo ? " · " + subtitulo : ""}`;
  doc.text(quebrar(sub, bipiImg ? 120 : 170)[0], MARG, 38.5 + tl.length * 7);
  doc.setFontSize(7.5); doc.setTextColor(190, 214, 245);
  doc.text(caber(`Gerado em ${geradoEm} por ${usuario || "—"}`, bipiImg ? 120 : 180), MARG, CAPA_H - 3.4);
  S.y = CAPA_H + 10;

  const novaPagina = () => {
    doc.addPage();
    degrade(doc, 0, 0, PAG_W, 9);
    doc.setFillColor(...COR.vermelho); doc.rect(0, 9, PAG_W, 0.9, "F");
    doc.setTextColor(255, 255, 255); doc.setFont(undefined, "bold"); doc.setFontSize(7.5);
    doc.text("CONDOR · ALERTA DE VALIDADE", MARG, 6, { charSpace: 0.4 });
    doc.setFont(undefined, "normal");
    doc.text(quebrar(titulo, 110)[0], PAG_W - MARG, 6, { align: "right" });
    S.y = 20;
  };
  const garante = (h) => { if (S.y + h > 281) novaPagina(); };

  const kpis = (lista) => {
    garante(28);
    const gap = 3.5, w = (AREA_W - gap * (lista.length - 1)) / lista.length;
    lista.forEach((k, i) => {
      const x = MARG + i * (w + gap);
      doc.setFillColor(...COR.claro); doc.roundedRect(x, S.y, w, 22, 3, 3, "F");
      doc.setFillColor(...(k.cor || COR.azul)); doc.roundedRect(x, S.y + 4, 1.4, 14, 0.7, 0.7, "F");
      doc.setTextColor(...(k.cor || COR.azulEscuro)); doc.setFont(undefined, "bold");
      let fs = 14; doc.setFontSize(fs);
      while (fs > 7 && doc.getTextWidth(String(k.valor)) > w - 8) { fs -= 0.5; doc.setFontSize(fs); }
      doc.text(String(k.valor), x + 5, S.y + 11.5);
      doc.setTextColor(...COR.cinza); doc.setFont(undefined, "normal"); doc.setFontSize(7);
      doc.text(quebrar(k.label, w - 8)[0], x + 5, S.y + 17.5);
    });
    S.y += 29;
  };

  const secao = (texto, destaque) => {
    garante(40);
    doc.setFillColor(...(destaque || COR.azul)); doc.roundedRect(MARG, S.y, 3, 6.5, 1, 1, "F");
    doc.setTextColor(...COR.azulEscuro); doc.setFont(undefined, "bold"); doc.setFontSize(9.5);
    doc.text(quebrar(texto, AREA_W - 8)[0], MARG + 6, S.y + 5);
    S.y += 10;
  };

  const nota = (texto, cor) => {
    doc.setFont(undefined, "normal"); doc.setFontSize(8);
    const ls = quebrar(texto, AREA_W - 8);
    garante(ls.length * 3.8 + 6);
    doc.setFillColor(...(cor ? [255, 247, 232] : COR.claro));
    doc.roundedRect(MARG, S.y, AREA_W, ls.length * 3.8 + 4.5, 2.5, 2.5, "F");
    doc.setTextColor(...(cor || COR.cinza));
    doc.text(ls, MARG + 4, S.y + 5);
    S.y += ls.length * 3.8 + 8;
  };

  // colunas: [{ t: "PRODUTO", w: 60, a: "r" (direita) }] — larguras são proporções, escaladas para a área
  const tabela = (colunas, linhas, { maxLinhas = 2, vazio = "Sem dados no período." } = {}) => {
    const soma = colunas.reduce((a, c) => a + c.w, 0);
    const ws = colunas.map((c) => (c.w / soma) * AREA_W);
    const xs = []; let ac = MARG; ws.forEach((w) => { xs.push(ac); ac += w; });
    const cabecalho = () => {
      doc.setFillColor(...COR.azulEscuro); doc.roundedRect(MARG, S.y, AREA_W, 7, 1.8, 1.8, "F");
      doc.setTextColor(255, 255, 255); doc.setFont(undefined, "bold"); doc.setFontSize(7);
      colunas.forEach((c, i) => {
        const t = quebrar(c.t, ws[i] - 4)[0];
        if (c.a === "r") doc.text(t, xs[i] + ws[i] - 2, S.y + 4.7, { align: "right" });
        else doc.text(t, xs[i] + 2, S.y + 4.7);
      });
      S.y += 9;
    };
    garante(24);
    cabecalho();
    if (!linhas.length) { doc.setTextColor(...COR.cinza); doc.setFont(undefined, "normal"); doc.setFontSize(8); doc.text(vazio, MARG + 2, S.y + 3); S.y += 11; return; }
    doc.setFont(undefined, "normal"); doc.setFontSize(8);
    linhas.forEach((linha, li) => {
      doc.setFont(undefined, "normal"); doc.setFontSize(8);
      const cel = linha.map((v, i) => {
        const bruto = doc.splitTextToSize(String(v ?? "—"), ws[i] - 4.5);
        let ls = bruto.map((l) => caber(l, ws[i] - 4.5));
        if (ls.length > maxLinhas) { ls = ls.slice(0, maxLinhas); ls[maxLinhas - 1] = caber(ls[maxLinhas - 1] + "…", ws[i] - 4.5); }
        return ls;
      });
      const n = Math.max(1, ...cel.map((c) => c.length));
      const h = n * 3.7 + 3.4;
      if (S.y + h > 281) { novaPagina(); cabecalho(); doc.setFont(undefined, "normal"); doc.setFontSize(8); }
      if (li % 2 === 0) { doc.setFillColor(...COR.zebra); doc.rect(MARG, S.y, AREA_W, h, "F"); }
      doc.setDrawColor(...COR.linha); doc.setLineWidth(0.15); doc.line(MARG, S.y + h, MARG + AREA_W, S.y + h);
      cel.forEach((ls, i) => {
        const c = colunas[i];
        doc.setTextColor(...(c.cor || COR.azulEscuro));
        ls.forEach((t, k) => {
          const ty = S.y + 4.6 + k * 3.7;
          if (c.a === "r") doc.text(t, xs[i] + ws[i] - 2, ty, { align: "right" });
          else doc.text(t, xs[i] + 2, ty);
        });
      });
      S.y += h;
    });
    S.y += 8;
  };

  const finalizar = (arquivo, showToast, msg) => {
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      degrade(doc, 0, PAG_H - 9, PAG_W, 9);
      doc.setTextColor(255, 255, 255); doc.setFont(undefined, "normal"); doc.setFontSize(7.2);
      doc.text(caber(`Condor Validade · Loja ${loja}`, 120), MARG, PAG_H - 3.4);
      doc.text(`Página ${p} de ${total}`, PAG_W - MARG, PAG_H - 3.4, { align: "right" });
    }
    doc.save(arquivo);
    showToast && showToast(msg, "ok");
  };

  return { doc, kpis, secao, nota, tabela, finalizar, estado: S };
}

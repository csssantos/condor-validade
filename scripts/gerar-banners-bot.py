#!/usr/bin/env python3
# Gera os banners do bot do Telegram (public/bot/*.jpg) a partir de public/mascote.svg (Bipi). Mascote NUNCA é redesenhado:
# só mudam a expressão (olhos/boca), o objeto na etiqueta e o texto. Rodar: python3 scripts/gerar-banners-bot.py
import re, os, sys
from playwright.sync_api import sync_playwright
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = open(os.path.join(RAIZ, "public/mascote.svg"), encoding="utf-8").read()
SAIDA = os.path.join(RAIZ, "public/bot"); os.makedirs(SAIDA, exist_ok=True)

TAG_RE = re.compile(r'(<g transform="translate\(14 -2\) rotate\(10 322 150\)">\s*<path[^>]*/>\s*<circle[^>]*/>\s*)<circle cx="334"[^>]*/>\s*<path d="M326 150[^>]*/>(\s*</g>)')
assert TAG_RE.search(BASE), "estrutura da etiqueta mudou"
NAVY, BLUE, RED, GREEN, AMBER = "#082F5E", "#0B4F9E", "#E31E24", "#1F9D55", "#FFB020"
GLIFOS = {
 "check": f'<circle cx="334" cy="150" r="15" fill="{GREEN}"/><path d="M326 150 L332 156 L343 143" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
 "lock": f'<circle cx="334" cy="150" r="15" fill="{BLUE}"/><rect x="327" y="150" width="14" height="11" rx="2.5" fill="#fff"/><path d="M330 150 v-4 a4 4 0 0 1 8 0 v4" fill="none" stroke="#fff" stroke-width="2.6"/>',
 "barcode": f'<g fill="{NAVY}"><rect x="321" y="137" width="3" height="26"/><rect x="326" y="137" width="5" height="26"/><rect x="333" y="137" width="2" height="26"/><rect x="337" y="137" width="4" height="26"/><rect x="343" y="137" width="3" height="26"/></g><rect x="317" y="148" width="34" height="3.5" rx="1.7" fill="{RED}"/>',
 "calendar": f'<rect x="322" y="136" width="24" height="26" rx="4" fill="#fff" stroke="{BLUE}" stroke-width="2.6"/><rect x="322" y="136" width="24" height="8" rx="3" fill="{RED}"/><text x="334" y="157" font-family="Helvetica,Arial,sans-serif" font-size="12" font-weight="800" text-anchor="middle" fill="{NAVY}">31</text>',
 "qty": f'<circle cx="334" cy="150" r="15" fill="{BLUE}"/><text x="334" y="157" font-family="Helvetica,Arial,sans-serif" font-size="20" font-weight="800" text-anchor="middle" fill="#fff">#</text>',
 "lupa": f'<circle cx="332" cy="148" r="9" fill="#EAF1FB" stroke="{BLUE}" stroke-width="3.2"/><path d="M339 155 L347 163" stroke="{BLUE}" stroke-width="4" stroke-linecap="round"/><path d="M328 148 L331 151 L337 144" fill="none" stroke="{GREEN}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
 "warn": f'<path d="M334 134 L350 162 H318Z" fill="{AMBER}" stroke="{AMBER}" stroke-width="3" stroke-linejoin="round"/><path d="M334 142 V153" stroke="{NAVY}" stroke-width="3.4" stroke-linecap="round"/><circle cx="334" cy="158" r="2" fill="{NAVY}"/>',
 "x": f'<circle cx="334" cy="150" r="15" fill="{RED}"/><path d="M327 143 L341 157 M341 143 L327 157" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>',
 "plus": f'<circle cx="334" cy="150" r="15" fill="{GREEN}"/><path d="M334 141 V159 M325 150 H343" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
 "info": f'<circle cx="334" cy="150" r="15" fill="{BLUE}"/><circle cx="334" cy="142" r="2.4" fill="#fff"/><path d="M334 148 V159" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
}
OLHOS_OK = "#2ECC71"
def mascote(glifo, olhos=OLHOS_OK, boca="sorriso"):
    s = TAG_RE.sub(lambda m: m.group(1) + GLIFOS[glifo] + m.group(2), BASE)
    s = s.replace(OLHOS_OK, olhos)  # olhos + LED da testa
    if boca == "o": s = s.replace('<path d="M186 184 Q200 194 214 184" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>', '<ellipse cx="200" cy="186" rx="7" ry="8" fill="none" stroke="#fff" stroke-width="4"/>')
    if boca == "reta": s = s.replace('<path d="M186 184 Q200 194 214 184" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>', '<path d="M188 187 H212" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>')
    return re.sub(r'width="400" height="400"', '', s)

# chave: (glifo, olhos, boca, título, subtítulo, cor do selo, texto do selo)
ESTADOS = {
 "codigo":     ("lock",     OLHOS_OK, "sorriso", "Me envie o seu código", "Funcionário: código gerado no app. Promotor: código da sua marca.", BLUE, "ACESSO"),
 "vinculado":  ("check",    OLHOS_OK, "sorriso", "Tudo certo!", "Seu Telegram está vinculado ao Condor Validade.", GREEN, "VINCULADO"),
 "produto":    ("barcode",  OLHOS_OK, "sorriso", "Qual é o produto?", "Envie o código de barras ou o nome do produto.", BLUE, "PRODUTO"),
 "validade":   ("calendar", OLHOS_OK, "sorriso", "Qual a validade?", "Escreva a data, por exemplo 15/12/2026.", BLUE, "VALIDADE"),
 "quantidade": ("qty",      OLHOS_OK, "sorriso", "Quantas unidades?", "Se for peso, diga os quilos, por exemplo 2,5.", BLUE, "QUANTIDADE"),
 "conferir":   ("lupa",     OLHOS_OK, "sorriso", "Confira os dados", "Só salvo depois do seu “sim”.", BLUE, "CONFERÊNCIA"),
 "sucesso":    ("check",    OLHOS_OK, "sorriso", "Lançado!", "Validade registrada no app.", GREEN, "CONCLUÍDO"),
 "atencao":    ("warn",     AMBER,    "o",       "Atenção", "Veja o aviso abaixo e tente de novo.", AMBER, "AVISO"),
 "cancelado":  ("x",        "#9FB6D1","reta",    "Cancelado", "Nada foi salvo. Quando quiser, é só recomeçar.", RED, "CANCELADO"),
 "novo":       ("plus",     OLHOS_OK, "sorriso", "Produto novo", "Não está no app. Eu busco a imagem na internet.", GREEN, "NOVO"),
 "ajuda":      ("info",     OLHOS_OK, "sorriso", "Como posso ajudar", "Lanço validades com você, passo a passo.", BLUE, "AJUDA"),
}
def html(k):
    g, ol, bo, t, sub, cor, selo = ESTADOS[k]
    txt = "#12131A" if cor == AMBER else "#fff"
    return f'''<html><body style="margin:0;width:640px;height:340px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;background:radial-gradient(120% 130% at 20% 0%,#1B6FD1 0%,#0B4F9E 45%,#061C3A 100%);position:relative;color:#fff">
<div style="position:absolute;right:14px;top:22px;width:290px;height:290px;border-radius:50%;background:rgba(255,255,255,.13)"></div>
<div style="position:absolute;right:8px;top:-2px;width:330px;height:330px">{mascote(g, ol, bo)}</div>
<div style="position:absolute;left:34px;top:38px;font-size:11.5px;letter-spacing:3px;font-weight:700;opacity:.8">CONDOR · ALERTA DE VALIDADE</div>
<div style="position:absolute;left:34px;top:74px;font-size:12px;font-weight:800;letter-spacing:1.5px;background:{cor};color:{txt};padding:6px 12px;border-radius:20px">{selo}</div>
<div style="position:absolute;left:34px;top:122px;font-size:31px;font-weight:800;line-height:1.1;width:290px">{t}</div>
<div style="position:absolute;left:34px;top:214px;font-size:15.5px;line-height:1.35;opacity:.92;width:270px">{sub}</div></body></html>'''
if __name__ == "__main__":
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 640, "height": 340}, device_scale_factor=1.5)
        for k in ESTADOS:
            pg.set_content(html(k)); pg.screenshot(path=os.path.join(SAIDA, f"{k}.jpg"), type="jpeg", quality=82)
        b.close()
    print("ok", len(ESTADOS))

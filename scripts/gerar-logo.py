#!/usr/bin/env python3
"""Gera a logo Bipi (vetor + PNG) e os ícones do app a partir do desenho oficial.
Uso: python3 scripts/gerar-logo.py   (precisa do Playwright/Chromium)
Saídas: public/logo-bipi.svg, public/logo-bipi-robo.svg, public/logo-bipi.png (nome),
public/icon-*.png, apple-touch-icon.png, favicon.ico, android-icones/*, src/lib/logoBipi.js"""
import base64, io, os, re, sys
from playwright.sync_api import sync_playwright
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(RAIZ, *a)

DEFS = '''<defs>
<linearGradient id="gCab" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#2B86E6"/><stop offset="0.5" stop-color="#0B4F9E"/><stop offset="1" stop-color="#083A78"/></linearGradient>
<linearGradient id="gFeixe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E31E24" stop-opacity="0"/><stop offset="0.15" stop-color="#E31E24"/><stop offset="0.85" stop-color="#E31E24"/><stop offset="1" stop-color="#E31E24" stop-opacity="0"/></linearGradient>
<radialGradient id="gBola" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FF7B7F"/><stop offset="0.5" stop-color="#E31E24"/><stop offset="1" stop-color="#A8121A"/></radialGradient>
<linearGradient id="gBrilho" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="gHead" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFE2F8"/></linearGradient>
<linearGradient id="gFundo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B6FD1"/><stop offset="0.55" stop-color="#0B4F9E"/><stop offset="1" stop-color="#061C3A"/></linearGradient>
</defs>'''

def letras(ink="#0B4F9E", eye="#2ECC71"):
    return f'''<g fill="none" stroke="{ink}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round">
<path d="M26 14 V132"/><rect x="26" y="60" width="72" height="72" rx="36"/><path d="M142 60 V132"/>
<path d="M186 60 V164"/><rect x="186" y="60" width="72" height="72" rx="36"/><path d="M290 60 V132"/></g>
<rect x="132" y="12" width="20" height="32" rx="10" fill="{eye}"/><rect x="280" y="12" width="20" height="32" rx="10" fill="{eye}"/>'''

ROBO = '''<rect x="4" y="150" width="34" height="90" rx="17" fill="#083A78"/><rect x="482" y="150" width="34" height="90" rx="17" fill="#083A78"/>
<path d="M260 78 V40" stroke="#9CC8F7" stroke-width="9" stroke-linecap="round"/>
<path d="M296 8 A30 30 0 0 1 296 48" fill="none" stroke="#E31E24" stroke-width="7" stroke-linecap="round"/>
<path d="M312 -2 A46 46 0 0 1 312 58" fill="none" stroke="#E31E24" stroke-width="7" stroke-linecap="round" opacity="0.5"/>
<circle cx="260" cy="26" r="22" fill="url(#gBola)"/><ellipse cx="253" cy="18" rx="7" ry="5" fill="#fff" opacity="0.7"/>
<rect x="24" y="70" width="472" height="250" rx="84" fill="url(#gCab)"/>
<rect x="30" y="74" width="460" height="110" rx="78" fill="url(#gBrilho)"/>
<rect x="54" y="98" width="412" height="202" rx="58" fill="#06264C" stroke="#7DB4F0" stroke-width="5"/>
<rect x="50" y="251" width="420" height="7" rx="3.5" fill="url(#gFeixe)"/>
<g transform="translate(23,0)" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
<path d="M103 124 V232"/><rect x="103" y="168" width="66" height="64" rx="32"/><path d="M214 168 V232"/>
<path d="M256 168 V274"/><rect x="256" y="168" width="66" height="64" rx="32"/><path d="M367 168 V232"/></g>
<g transform="translate(23,0)" fill="#2ECC71"><rect x="205" y="121" width="18" height="30" rx="9"/><rect x="358" y="121" width="18" height="30" rx="9"/></g>
<g transform="translate(23,0)" fill="#fff"><rect x="209" y="126" width="5" height="7" rx="2.5"/><rect x="362" y="126" width="5" height="7" rx="2.5"/></g>'''

# símbolo (cabeça com antena), viewBox 160x160
ICONE = '''<path d="M80 40 V20" stroke="#9CC8F7" stroke-width="6" stroke-linecap="round"/>
<circle cx="80" cy="14" r="11" fill="url(#gBola)"/>
<rect x="14" y="44" width="132" height="104" rx="38" fill="url(#gHead)"/>
<rect x="28" y="58" width="104" height="80" rx="28" fill="#06264C" stroke="#7DB4F0" stroke-width="3"/>
<rect x="46" y="76" width="16" height="30" rx="8" fill="#2ECC71"/><rect x="98" y="76" width="16" height="30" rx="8" fill="#2ECC71"/>
<rect x="50" y="81" width="5" height="7" rx="2.5" fill="#fff"/><rect x="102" y="81" width="5" height="7" rx="2.5" fill="#fff"/>
<rect x="24" y="108" width="112" height="6" rx="3" fill="url(#gFeixe)"/>
<path d="M66 122 q14 9 28 0" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/>'''

def svg(vb, corpo, w=None):
    x, y, ww, hh = vb
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {ww} {hh}" width="{w or ww}" height="{int((w or ww)*hh/ww)}">{DEFS}{corpo}</svg>'

VB_LETRAS = (12, 4, 296, 176)
VB_ROBO = (0, -20, 520, 350)
open(P('public/logo-bipi.svg'), 'w').write(svg(VB_LETRAS, letras()))
open(P('public/logo-bipi-robo.svg'), 'w').write(svg(VB_ROBO, ROBO))

def icone_svg(tam, fundo=True, escala=1.0, arredondado=0.22):
    # app icon: fundo da marca + símbolo centralizado
    s = tam
    corpo = ''
    if fundo:
        corpo += f'<rect width="{s}" height="{s}" rx="{s*arredondado}" fill="url(#gFundo)"/>'
    k = s * 0.74 * escala / 160
    off = (s - 160 * k) / 2
    corpo += f'<g transform="translate({off},{off}) scale({k})">{ICONE}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}" width="{s}" height="{s}">{DEFS}{corpo}</svg>'

def icone_cheio(tam, escala):  # sem cantos (maskable / launcher): o sistema recorta
    s = tam
    k = s * 0.74 * escala / 160
    off = (s - 160 * k) / 2
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}" width="{s}" height="{s}">{DEFS}<rect width="{s}" height="{s}" fill="url(#gFundo)"/><g transform="translate({off},{off}) scale({k})">{ICONE}</g></svg>'

def png(pw, svgtxt, w, h, destino, transparente=True):
    pg = pw.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
    pg.set_content(f'<body style="margin:0;background:transparent">{svgtxt}</body>')
    pg.screenshot(path=destino, omit_background=transparente, clip={'x': 0, 'y': 0, 'width': w, 'height': h})
    pg.close()

with sync_playwright() as p:
    b = p.chromium.launch()
    # nome (letras) para telas e PDFs: 740 px de largura
    W = 740; H = round(W * 176 / 296)
    png(b, svg(VB_LETRAS, letras(), W), W, H, P('public/logo-bipi.png'))
    # ícones
    png(b, icone_svg(512, True), 512, 512, P('public/icon-512.png'))
    png(b, icone_svg(192, True), 192, 192, P('public/icon-192.png'))
    png(b, icone_cheio(512, 0.82), 512, 512, P('public/icon-512-maskable.png'), False)
    png(b, icone_cheio(180, 1.0), 180, 180, P('public/apple-touch-icon.png'), False)
    png(b, icone_svg(256, True), 256, 256, P('public/favicon-256.png'))
    png(b, icone_svg(640, True, 1.0, 0.5), 640, 640, P('public/bot-perfil.png'))
    # Android (launcher + redondo)
    for pasta, t in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
        d = P('android-icones', f'mipmap-{pasta}'); os.makedirs(d, exist_ok=True)
        for nome in ('ic_launcher.png', 'ic_launcher_round.png'):
            rr = 0.5 if 'round' in nome else 0.2
            png(b, icone_svg(t, True, 1.0, rr), t, t, os.path.join(d, nome))
        png(b, icone_cheio(t * 108 // 48 if False else t, 0.66), t, t, os.path.join(d, 'ic_launcher_foreground_cheio.png'), False)
    b.close()

from PIL import Image
im = Image.open(P('public/favicon-256.png')).convert('RGBA')
im.save(P('public/favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
os.remove(P('public/favicon-256.png'))
# constante para o app (PNG do nome, embutido, mesmo padrão antigo)
b64 = base64.b64encode(open(P('public/logo-bipi.png'), 'rb').read()).decode()
open(P('src/lib/logoBipi.js'), 'w').write(f'// Gerado por scripts/gerar-logo.py. Logo "bipi" (letras) em PNG.\nexport const LOGO_BIPI_PNG = "data:image/png;base64,{b64}";\nexport const LOGO_BIPI_PROPORCAO = {176/296:.4f};\n')
print('ok', len(b64))

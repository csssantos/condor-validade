#!/usr/bin/env python3
"""Trilha v3: música limpa (sem voz de robô) + efeitos de interface discretos, sincronizados com tl3.js."""
import numpy as np, wave, json, re
from scipy.signal import lfilter, butter

SR = 44100; DUR = 45.0; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(11)
TL = json.loads(re.sub(r'^window\.TL=|;\s*$', '', open('tl3.js').read().strip()))
def mid(m): return 440.0 * 2 ** ((m - 69) / 12)
def add(sig, t, g=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i < 0: return
    s = sig[: N - i]
    L[i:i + len(s)] += s * g * (1 - max(0, pan)); R[i:i + len(s)] += s * g * (1 + min(0, pan))
def tt(d): return np.arange(int(d * SR)) / SR
def env(n, a, r):
    e = np.ones(n); na = min(n, max(1, int(a * SR))); nr = min(n, max(1, int(r * SR)))
    e[:na] = np.linspace(0, 1, na) ** 2; e[-nr:] *= np.linspace(1, 0, nr) ** 1.5; return e
def lp(x, fc):
    b, a = butter(2, fc / (SR / 2)); return lfilter(b, a, x)
def hp(x, fc):
    b, a = butter(2, fc / (SR / 2), 'high'); return lfilter(b, a, x)

# ---- instrumentos ----
def epiano(f, d=1.2):  # piano elétrico suave
    t = tt(d); m = np.sin(2*np.pi*f*t*1.0) * 1.2 * np.exp(-t*3)
    s = np.sin(2*np.pi*f*t + m) * np.exp(-t*2.2) + .25*np.sin(2*np.pi*2*f*t)*np.exp(-t*5)
    return s * np.minimum(1, t*300)
def pad(freqs, d):
    t = tt(d); s = np.zeros_like(t)
    for f in freqs:
        for det in (-.0035, 0, .0035):
            ph = rng.random()*6
            s += np.sin(2*np.pi*f*(1+det)*t + ph) + .3*np.sin(2*np.pi*2*f*(1+det)*t + ph)
    s = lp(s, 1800) / len(freqs) / 2.2
    return s * env(len(t), .9, 1.0)
def pluck(f, d=.45):
    t = tt(d); s = np.sin(2*np.pi*f*t) + .3*np.sin(2*np.pi*2*f*t)*np.exp(-t*12)
    return s * np.exp(-t*9) * np.minimum(1, t*500)
def bass(f, d=.5):
    t = tt(d); s = np.sin(2*np.pi*f*t) + .15*np.sin(2*np.pi*2*f*t)
    return s * np.minimum(1, t*120) * np.exp(-t*2.5)
def kick():
    t = tt(.32); f = 48 + 70*np.exp(-t*30); return np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t*10)
def shaker():
    t = tt(.08); return hp(rng.standard_normal(len(t)), 6000) * np.exp(-t*55)
def snap():
    t = tt(.18); n = hp(rng.standard_normal(len(t)), 1500); return n * (np.exp(-t*30))
# ---- efeitos ----
def tick(f=2400):
    t = tt(.035); return np.sin(2*np.pi*f*t) * np.exp(-t*170)
def soft_pop(f0=330, f1=720, d=.09):
    t = tt(d); f = f0 + (f1-f0)*(t/d)**.6; return np.sin(2*np.pi*np.cumsum(f)/SR) * env(len(t), .004, .05)
def whoosh(d=.7, up=True):
    n = int(d*SR); x = rng.standard_normal(n); y = np.zeros(n); p = 0.0
    for i in range(0, n):
        k = i / n; fc = (400 + 3800*k**1.4) if up else (4200 - 3700*k**.8)
        a = 1 - np.exp(-2*np.pi*fc/SR); p += a*(x[i]-p); y[i] = p
    return y * np.sin(np.pi*np.arange(n)/n)**2 * 1.6
def chime(f=880, d=1.2):
    t = tt(d); return (np.sin(2*np.pi*f*t) + .3*np.sin(2*np.pi*2.0*f*t)*np.exp(-t*5)) * np.exp(-t*3.5) * np.minimum(1, t*600)
def bip(f=1850, d=.08):
    t = tt(d); return np.sin(2*np.pi*f*t) * env(len(t), .003, .02)
def riser(d=1.0):
    n = int(d*SR); x = hp(rng.standard_normal(n), 2500); return x * np.linspace(0, 1, n)**2.5 * .5

# ---- música: 96 bpm, I–vi–IV–V em Ré maior, suave ----
BPM = 96; BEAT = 60/BPM; BAR = 4*BEAT
prog = [[50, 54, 57, 61], [47, 50, 54, 57], [43, 47, 50, 54], [45, 49, 52, 57]]  # Dmaj7 Bm7 Gmaj7 A
DROP = TL['bipiIn']            # entrada do ritmo
END = TL['logo'] - .1          # fim do ritmo
nb = int(DUR/BAR) + 1
for b in range(nb):
    t0 = b*BAR; ch = prog[b % 4]
    if t0 > 44.5: break
    add(pad([mid(m+12) for m in ch], BAR+1.0), t0, .10)
    # piano: acorde no tempo 1 e notas no 3
    for m in ch: add(epiano(mid(m+12), 1.6), t0, .045)
    add(epiano(mid(ch[2]+24), 1.0), t0 + 2*BEAT, .04)
    add(epiano(mid(ch[3]+24), .9), t0 + 3.5*BEAT, .03)
    on = DROP - .05 <= t0 < END
    if on:
        for k in range(4): add(kick(), t0 + k*BEAT, .30 if k in (0, 2) else .18)
        for k in (1, 3): add(snap(), t0 + k*BEAT, .07)
        for k in range(8): add(shaker(), t0 + k*BEAT/2, .025 + .015*(k % 2))
        for k, pos in enumerate((0, 1.5, 2, 3)): add(bass(mid(ch[0]-12), .55), t0 + pos*BEAT, .30)
        arp = [ch[0]+24, ch[2]+24, ch[1]+24, ch[3]+24]
        for k in range(8): add(pluck(mid(arp[k % 4]+(12 if k == 6 else 0)), .4), t0 + k*BEAT/2, .045, pan=(-.35 if k % 2 else .35))
    elif t0 < DROP:
        add(bass(mid(ch[0]-12), 2.0), t0, .18)
# final: acorde aberto
add(pad([mid(m) for m in (62, 66, 69, 73, 78)], 6.2) * 1.4, TL['logo'] - .2, .14)
for k, m in enumerate((74, 78, 81, 85)): add(epiano(mid(m), 2.4), TL['logo'] + k*.09, .05)

# ---- efeitos (baixos, só para dar tato) ----
add(riser(1.0), DROP - 1.0, .10)
add(soft_pop(220, 520, .14), DROP + .1, .30)                               # Bipi aparece
for b in TL['bubbles']: add(soft_pop(500, 900, .06), b[0], .07, pan=-.3)  # balão
pa, pb = TL['phoneIn']; add(whoosh(.8), pa - .1, .16)                      # celular entra
add(whoosh(.7, False), TL['phoneOut'][0], .14)
add(whoosh(.6), TL['toCorner'][0], .07); add(whoosh(.6), TL['toOutro'][0], .07)
for c in TL['chapters'][1:]: add(whoosh(.45), c[0] - .2, .06)
for tp in TL['taps']: add(tick(2300), tp[0], .10); add(soft_pop(600, 760, .04), tp[0] + .005, .05)
for c in TL['callouts']: add(soft_pop(380, 820, .1), c[0], .14, pan=-.2)
s0 = TL['scan'][0]; add(bip(1850, .09), s0, .16); add(bip(2350, .12), s0 + .11, .14)   # o "bip" do leitor
sv = TL['saved'][0]; add(chime(1175, 1.2), sv, .12); add(chime(1568, 1.2), sv + .08, .10)
for m in TL['chat']:
    if m[0] == 'me': add(tick(2600), m[1] - .02, .08); add(soft_pop(700, 1100, .06), m[1], .07, pan=.3)   # enviar
    else: add(soft_pop(520, 680, .08), m[1], .09, pan=.25)                                                 # chegou mensagem
add(chime(988, 1.4), 37.12, .08)
add(chime(1480, 2.5), TL['logo'] + .05, .10); add(chime(2217, 2.5), TL['logo'] + .12, .06)

# ---- mixagem ----
d = int(.28*SR); eL = np.zeros(N); eR = np.zeros(N)
eL[d:] = lp(L[:-d], 3000)*.18; eR[2*d:] = lp(R[:-2*d], 3000)*.14
L += eL; R += eR
fi = int(.4*SR); fo = int(2.4*SR)
for X in (L, R): X[:fi] *= np.linspace(0, 1, fi); X[-fo:] *= np.linspace(1, 0, fo)**1.6
out = np.stack([L, R], 1); out = np.tanh(out*1.05); out = out/np.abs(out).max()*.89
w = wave.open('trilha3.wav', 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((out*32767).astype('<i2').tobytes()); w.close(); print('ok')

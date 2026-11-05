#!/usr/bin/env python3
"""Trilha sonora do vídeo de 45 s (música + efeitos sincronizados com as cenas). Só numpy/scipy."""
import numpy as np, wave
from scipy.signal import lfilter

SR = 44100; DUR = 45.0; N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)
def mid(m): return 440.0 * 2 ** ((m - 69) / 12)
def add(sig, t, g=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i < 0: return
    s = sig[: N - i]
    L[i:i + len(s)] += s * g * (1 - max(0, pan)); R[i:i + len(s)] += s * g * (1 + min(0, pan))
def tt(d): return np.arange(int(d * SR)) / SR
def adsr(n, a, r):
    e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e

def pluck(f, d=.5):
    t = tt(d); s = np.sin(2*np.pi*f*t) + .45*np.sin(2*np.pi*2*f*t)*np.exp(-t*9) + .2*np.sin(2*np.pi*3*f*t)*np.exp(-t*14)
    return s * np.exp(-t * 7) * np.minimum(1, t * 400)
def pad(freqs, d):
    t = tt(d); s = np.zeros_like(t)
    for f in freqs:
        for det in (-.004, 0, .004):
            ff = f * (1 + det)
            for k in range(1, 6): s += np.sin(2*np.pi*ff*k*t + k) / k**1.4
    return s / len(freqs) * adsr(len(t), .5, .6)
def bass(f, d=.42):
    t = tt(d); return (np.sin(2*np.pi*f*t) + .3*np.sin(2*np.pi*2*f*t)) * np.exp(-t*3.2) * np.minimum(1, t*200)
def kick():
    t = tt(.3); f = 45 + 95*np.exp(-t*28); return np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t*11)
def hat(open_=False):
    t = tt(.2 if open_ else .06); n = rng.standard_normal(len(t)); n = np.diff(n, prepend=0); return n * np.exp(-t * (18 if open_ else 70))
def clap():
    t = tt(.25); n = lfilter([1], [1, -.3], rng.standard_normal(len(t))); return n * (np.exp(-t*22) + .6*np.exp(-(t-.012)*60)*(t>.012))
def bip(f=1850, d=.09):
    t = tt(d); return (np.sin(2*np.pi*f*t) + .25*np.sin(2*np.pi*3*f*t)) * adsr(len(t), .003, .03)
def chime(f=880, d=.9):
    t = tt(d); return (np.sin(2*np.pi*f*t) + .4*np.sin(2*np.pi*2.76*f*t)*np.exp(-t*6)) * np.exp(-t*4.5) * np.minimum(1, t*500)
def pop(f0=420, f1=980, d=.07):
    t = tt(d); f = f0 + (f1-f0)*t/d; return np.sin(2*np.pi*np.cumsum(f)/SR) * adsr(len(t), .004, .03)
def boing(d=.45):
    t = tt(d); f = 180 + 420*np.sin(np.minimum(t/d,1)*np.pi*.9) + 14*np.sin(t*55); return np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t*4.5) * np.minimum(1, t*300)
def thud():
    t = tt(.4); f = 38 + 90*np.exp(-t*30); s = np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t*9)
    n = lfilter([1], [1, -.85], rng.standard_normal(len(t))) * np.exp(-t*40) * .5; return s + n
def whoosh(d=.8, up=True):
    n = int(d * SR); x = rng.standard_normal(n); y = np.zeros(n); a = 0.0; p = 0.0
    for i in range(n):
        k = i / n; fc = (300 + 5200 * k**1.6) if up else (5500 - 5000 * k**.7)
        a = 1 - np.exp(-2*np.pi*fc/SR); p += a * (x[i] - p); y[i] = p
    return y * np.sin(np.pi * np.arange(n) / n) ** 1.5 * 2.2
def tick(f=2200):
    t = tt(.03); return np.sin(2*np.pi*f*t) * np.exp(-t*160)
def sparkle(d=1.2):
    s = np.zeros(int(d*SR))
    for k, f in enumerate([2093, 2637, 3136, 3951, 3136, 4186]):
        c = chime(f, .5) * .5; i = int(k*.07*SR); s[i:i+len(c)] += c[: len(s)-i]
    return s

BEAT = 60 / 112.0; BAR = 4 * BEAT
chords = [[48, 52, 55, 59], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]]
nbars = int(DUR / BAR) + 1
# ---- música ----
for b in range(nbars):
    t0 = b * BAR; ch = chords[b % 4]
    inten = 0 if t0 < 5.6 else (1 if t0 < 39.0 else 2)
    add(pad([mid(m + 12) for m in ch], BAR + .5), t0, .13)
    pat = [0, 2, 1, 3, 2, 3, 1, 2]
    for k in range(8):
        add(pluck(mid(ch[pat[k]] + 24), .55), t0 + k * BEAT / 2, .14 + .03 * inten, pan=(-.4 if k % 2 else .4))
        if inten == 2 and k % 2 == 0: add(pluck(mid(ch[pat[(k + 3) % 8]] + 36), .35), t0 + k * BEAT / 2 + BEAT / 4, .07, pan=.3)
    if inten >= 1:
        for k in range(4): add(kick(), t0 + k * BEAT, .55)
        for k in range(8): add(hat(k % 4 == 3), t0 + k * BEAT / 2 + BEAT / 4 * (k % 2 == 1) * 0, .05 + .02 * (k % 2))
        for k in (0, 1.5, 2, 3.5): add(bass(mid(ch[0] - 12)), t0 + k * BEAT, .36)
    if inten == 2:
        for k in (1, 3): add(clap(), t0 + k * BEAT, .2)
    else:
        add(bass(mid(ch[0] - 12), 1.2), t0, .22)
# ---- efeitos sincronizados com video.html (tempo absoluto em segundos) ----
import json
TAPS=[6.2,8.0,9.3,10.4,12.0,13.7,15.6,16.9,18.2,18.7,19.2,23.4,24.7,31.7,32.5,34.2,36.0,37.2,38.6]
for s_ in (5.55, 14.8, 22.9, 29.3, 30.95): add(whoosh(.6), s_ - .2, .28)
add(whoosh(.5, False), 0.15, .18); add(boing(), .85, .4)
add(whoosh(.7), 25.85, .3); add(boing(.3), 26.9, .3)                       # mergulho no celular
add(boing(.45), 29.55, .4); add(sparkle(), 30.0, .4, pan=.2)               # sai pelo topo
for tm in TAPS: add(tick(1700), tm, .22); add(pop(500, 800, .05), tm + .01, .16)
for k in range(5): add(bip(1500 + k * 140, .05), 5.95 + k * .06, .12)
add(bip(1850, .16), 6.3, .45)                                              # BIP do leitor
for i, tm in enumerate(np.concatenate([np.arange(8.2, 8.9, .1), np.arange(9.5, 10.1, .1), np.arange(10.6, 11.0, .1), np.arange(12.15, 12.35, .1)])): add(tick(2000 + (i % 4) * 140), tm, .12)
add(chime(880), 13.75, .42); add(chime(1318), 13.85, .38); add(chime(1760), 13.97, .3)   # Salvo!
for tm in (18.25, 18.75, 19.25): add(pop(420, 1000), tm, .35)
add(pop(380, 900), 27.55, .45); add(chime(1320, .7), 27.6, .3); add(pop(700, 1200), 28.75, .45); add(chime(1568, .8), 28.8, .3)
add(pop(500, 1300), 38.6, .5); add(chime(988, 1.0), 38.65, .4); add(chime(1480, 1.0), 38.72, .35)
add(boing(.35), 39.5, .3); add(sparkle(), 40.5, .5, pan=.2); add(sparkle(), 42.3, .35, pan=-.3)
fin = pad([mid(m + 12) for m in (48, 55, 60, 64, 67)], 5.6) * 1.6; add(fin, 39.3, .22)
add(chime(1047, 3.0), 42.6, .3); add(chime(1568, 3.0), 42.65, .22)
# ---- vozinha do Bipi (silabas = mesmas do video: talk.json) ----
def babble(f0, d, k):
    t = tt(d); f = f0 * (1 + .12 * np.sin(2*np.pi*(6+k)*t) + .18 * (t / d) * (1 if k % 2 else -.6))
    ph = 2*np.pi*np.cumsum(f)/SR; s = np.zeros_like(t)
    for h, a in ((1, 1.0), (2, .5), (3, .55), (4, .28), (5, .22), (6, .12)): s += a*np.sin(h*ph + h*.7)
    s *= np.sin(np.pi*np.minimum(1, t/d)) ** .7 * np.minimum(1, t*300)
    return lfilter([.35], [1, -.65], s) * .9
base = [330, 370, 415, 466, 523]
for tm, d, p in json.load(open("talk.json")):
    add(babble(base[p], d, p), tm, .17, pan=.1)
# eco leve
d = int(.32 * SR); eL = np.zeros(N); eR = np.zeros(N)
eL[d:] = L[:-d] * .22; eR[2*d//1:] = R[:-2*d] * .16
L += eL; R += eR
# fade e normalização
fi = int(.15 * SR); fo = int(2.0 * SR)
for X in (L, R):
    X[:fi] *= np.linspace(0, 1, fi); X[-fo:] *= np.linspace(1, 0, fo) ** 1.5
out = np.stack([L, R], 1); out = np.tanh(out * 1.15); out = out / np.abs(out).max() * .9
pcm = (out * 32767).astype("<i2")
with wave.open("trilha.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("trilha.wav ok", DUR, "s")

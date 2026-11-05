#!/usr/bin/env python3
"""Gera o Bipi (mascote do Condor · Alerta de Validade) em 3D, formato glTF binário (.glb).
Sem dependências além de numpy. Cada parte é um nó com nome (head, armR, eyeL, beam...),
para poder animar. Unidades: ~2,7 de altura, +Y para cima, rosto voltado para +Z.
Uso: python3 make_bipi_glb.py saida.glb"""
import json, struct, sys, math
import numpy as np

# ---------- geometria ----------
def rounded_box(hx, hy, hz, r, seg=None):
    r = min(r, hx, hy, hz)
    if seg is None: seg = max(6, min(28, int(max(hx, hy, hz) * 52)))
    verts, norms, idx = [], [], []
    def face(axis, sign):
        a1, a2 = [i for i in range(3) if i != axis]
        h = [hx, hy, hz]
        us = np.linspace(-1, 1, seg + 1)
        # mais vértices perto das quinas (arredondadas)
        us = np.sign(us) * (1 - (1 - np.abs(us)) ** 1.6)
        base = len(verts)
        for v in us:
            for u in us:
                p = np.zeros(3)
                p[axis] = sign * h[axis]
                p[a1] = u * h[a1]
                p[a2] = v * h[a2]
                inner = np.array([np.clip(p[i], -(h[i] - r), h[i] - r) for i in range(3)])
                d = p - inner
                n = d / (np.linalg.norm(d) + 1e-12)
                verts.append(inner + n * r)
                norms.append(n)
        for j in range(seg):
            for i in range(seg):
                a = base + j * (seg + 1) + i
                b, c, d2 = a + 1, a + seg + 1, a + seg + 2
                if (sign > 0) ^ (axis == 1):
                    idx.extend([a, b, d2, a, d2, c])
                else:
                    idx.extend([a, d2, b, a, c, d2])
    for ax in range(3):
        for s in (1, -1):
            face(ax, s)
    return np.array(verts, "f4"), np.array(norms, "f4"), np.array(idx, "u2")

def sphere(r, ns=28, nr=18):
    verts, norms, idx = [], [], []
    for j in range(nr + 1):
        th = math.pi * j / nr
        for i in range(ns + 1):
            ph = 2 * math.pi * i / ns
            n = np.array([math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)])
            verts.append(n * r); norms.append(n)
    for j in range(nr):
        for i in range(ns):
            a = j * (ns + 1) + i
            b, c, d = a + 1, a + ns + 1, a + ns + 2
            idx.extend([a, b, d, a, d, c])
    return np.array(verts, "f4"), np.array(norms, "f4"), np.array(idx, "u2")

def cylinder(r, h, ns=32):  # eixo Y, centrado
    verts, norms, idx = [], [], []
    for k, y in enumerate((-h / 2, h / 2)):
        for i in range(ns + 1):
            ph = 2 * math.pi * i / ns
            verts.append([r * math.cos(ph), y, r * math.sin(ph)]); norms.append([math.cos(ph), 0, math.sin(ph)])
    for i in range(ns):
        a, b, c, d = i, i + 1, i + ns + 1, i + ns + 2
        idx.extend([a, c, b, b, c, d])
    for y, ny in ((-h / 2, -1), (h / 2, 1)):
        base = len(verts)
        verts.append([0, y, 0]); norms.append([0, ny, 0])
        for i in range(ns + 1):
            ph = 2 * math.pi * i / ns
            verts.append([r * math.cos(ph), y, r * math.sin(ph)]); norms.append([0, ny, 0])
        for i in range(ns):
            if ny > 0: idx.extend([base, base + i + 2, base + i + 1])
            else: idx.extend([base, base + i + 1, base + i + 2])
    return np.array(verts, "f4"), np.array(norms, "f4"), np.array(idx, "u2")

def arc_tube(R, a0, a1, tube, na=40, nt=12):  # arco no plano XY
    verts, norms, idx = [], [], []
    for i in range(na + 1):
        a = math.radians(a0 + (a1 - a0) * i / na)
        c = np.array([R * math.cos(a), R * math.sin(a), 0])
        radial = np.array([math.cos(a), math.sin(a), 0]); z = np.array([0, 0, 1])
        for j in range(nt + 1):
            t = 2 * math.pi * j / nt
            n = radial * math.cos(t) + z * math.sin(t)
            verts.append(c + n * tube); norms.append(n)
    for i in range(na):
        for j in range(nt):
            a = i * (nt + 1) + j
            b, c, d = a + 1, a + nt + 1, a + nt + 2
            idx.extend([a, b, d, a, d, c])
    return np.array(verts, "f4"), np.array(norms, "f4"), np.array(idx, "u2")

# ---------- materiais (cores oficiais do Bipi) ----------
def hexc(h):
    h = h.lstrip("#"); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
def lin(c): return [x ** 2.2 for x in c]
MATS = {
    "cabeca":   dict(c="#EAF1FB", r=0.35),
    "azul":     dict(c="#0B4F9E", r=0.38),
    "marinho":  dict(c="#082F5E", r=0.45),
    "visor":    dict(c="#06284F", r=0.12),
    "branco":   dict(c="#FFFFFF", r=0.4),
    "vermelho": dict(c="#E31E24", r=0.4),
    "azulclaro":dict(c="#7DB4F0", r=0.35),
    "olho":     dict(c="#2ECC71", r=0.2, e="#2ECC71"),
    "feixe":    dict(c="#FF3B3B", r=0.2, e="#FF2A2A"),
    "led":      dict(c="#2ECC71", r=0.2, e="#2ECC71"),
    "ledverm":  dict(c="#E31E24", r=0.25, e="#E31E24"),
    "check":    dict(c="#1F9D55", r=0.3, e="#1F9D55"),
    "sorriso":  dict(c="#FFFFFF", r=0.3, e="#FFFFFF"),
}
mat_names = list(MATS)

# ---------- euler (R = Ry * Rx * Rz) -> quaternion ----------
def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return [w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2,
            w1*z2 + x1*y2 - y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2]
def qaxis(ax, ang):
    s = math.sin(ang / 2); c = math.cos(ang / 2)
    return [ax[0]*s, ax[1]*s, ax[2]*s, c]
def euler_q(rx, ry, rz):
    return qmul(qmul(qaxis((0,1,0), ry), qaxis((1,0,0), rx)), qaxis((0,0,1), rz))

# ---------- construção do grafo ----------
nodes, meshes, root_children = [], [], []
def add(name, geom=None, mat=None, t=(0, 0, 0), rest=(0, 0, 0), scale=None, parent=None):
    node = {"name": name, "translation": [float(x) for x in t]}
    rx, ry, rz = rest
    if any(rest): node["rotation"] = [float(x) for x in euler_q(rx, ry, rz)]
    if scale: node["scale"] = [float(x) for x in scale]
    node["extras"] = {"rest": [rx, ry, rz]}
    if geom is not None:
        meshes.append((name, geom, mat_names.index(mat)))
        node["mesh"] = len(meshes) - 1
    nodes.append(node); i = len(nodes) - 1
    if parent is None: root_children.append(i)
    else: nodes[parent].setdefault("children", []).append(i)
    return i

HEAD_Y = 2.05
# corpo e pernas
add("corpo", rounded_box(.55, .50, .40, .22), "azul", (0, .98, 0))
add("pescoco", cylinder(.16, .14), "marinho", (0, 1.52, 0))
for s, nm in ((-1, "L"), (1, "R")):
    add("perna" + nm, cylinder(.09, .26), "marinho", (s * .27, .33, 0))
    add("pe" + nm, rounded_box(.25, .10, .30, .09), "vermelho", (s * .27, .10, .06))
# painel do peito com código de barras
add("painel", rounded_box(.30, .26, .025, .03), "branco", (0, .98, .405))
ws_ = [w * .8 for w in [.018, .01, .026, .01, .018, .03, .01, .02, .012, .026, .01, .018]]
x = -(sum(ws_) * 2 + .006 * (len(ws_) - 1)) / 2
for i, w in enumerate(ws_):
    add(f"barra{i}", rounded_box(w, .13, .008, .004), "marinho", (x + w, 1.02, .438)); x += 2 * w + .006
add("ledPeito", sphere(.035), "led", (-.2, .79, .44))
add("barraVermelha", rounded_box(.11, .018, .01, .008), "vermelho", (.07, .79, .44))
# cabeça (grupo)
head = add("cabeca", None, None, (0, HEAD_Y, 0))
add("cascoCabeca", rounded_box(.64, .48, .52, .22), "cabeca", (0, 0, 0), parent=head)
add("visor", rounded_box(.44, .27, .035, .12), "visor", (0, .0, .525), parent=head)
for s, nm in ((-1, "L"), (1, "R")):
    add("olho" + nm, rounded_box(.062, .095, .02, .06), "olho", (s * .17, .075, .565), parent=head)
    add("orelha" + nm, cylinder(.17, .13), "azul", (s * .70, 0, 0), rest=(0, 0, math.pi / 2), parent=head)
add("feixe", rounded_box(.41, .011, .012, .01), "feixe", (0, -.025, .568), parent=head)
add("sorriso", arc_tube(.125, 222, 318, .018), "sorriso", (0, .0, .572), parent=head)
add("antena", cylinder(.022, .34), "azulclaro", (0, .64, 0), parent=head)
add("antenaBola", sphere(.085), "ledverm", (0, .84, 0), parent=head)
add("ledCabeca", sphere(.045), "led", (.36, .50, .30), parent=head)
# braços
armL = add("bracoL", None, None, (-.65, 1.28, 0), (0, 0, .12))
add("bracoLmalha", rounded_box(.085, .30, .085, .085), "marinho", (0, -.28, 0), parent=armL)
add("maoL", sphere(.12), "branco", (0, -.62, 0), parent=armL)
# braço direito ergue a etiqueta
armR = add("bracoR", None, None, (.65, 1.28, 0), (0, 0, 2.35))
add("bracoRmalha", rounded_box(.085, .30, .085, .085), "marinho", (0, -.28, 0), parent=armR)
add("maoR", sphere(.12), "branco", (0, -.62, 0), parent=armR)
# etiqueta presa à mão (contra-rotação para ficar em pé)
etq = add("etiqueta", None, None, (0, -.62, .10), (0, 0, -2.35), parent=armR)
nodes[etq]["translation"] = [0, -.62, .10]
add("etiquetaBorda", rounded_box(.27, .20, .012, .045), "vermelho", (0, .12, -.01), parent=etq)
add("etiquetaFolha", rounded_box(.235, .17, .014, .035), "branco", (0, .12, .004), parent=etq)
add("check1", rounded_box(.045, .013, .012, .006), "check", (-.045, .095, .02), (0, 0, -math.pi / 4), parent=etq)
add("check2", rounded_box(.09, .013, .012, .006), "check", (.03, .125, .02), (0, 0, math.pi / 4), parent=etq)
add("furoEtiqueta", sphere(.022), "vermelho", (0, .27, .02), parent=etq)

# ---------- empacotar glb ----------
bin_data = bytearray(); bviews, accs, gl_meshes = [], [], []
def push(arr, target):
    while len(bin_data) % 4: bin_data.append(0)
    off = len(bin_data); bin_data.extend(arr.tobytes())
    bviews.append({"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes, "target": target})
    return len(bviews) - 1
for name, (v, n, i), m in meshes:
    pv = push(v.astype("f4"), 34962); pn = push(n.astype("f4"), 34962); pi = push(i.astype("u2"), 34963)
    accs.append({"bufferView": pv, "componentType": 5126, "count": len(v), "type": "VEC3",
                 "min": v.min(0).tolist(), "max": v.max(0).tolist()})
    accs.append({"bufferView": pn, "componentType": 5126, "count": len(n), "type": "VEC3"})
    accs.append({"bufferView": pi, "componentType": 5123, "count": len(i), "type": "SCALAR"})
    a = len(accs) - 3
    gl_meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": a, "NORMAL": a + 1}, "indices": a + 2, "material": m}]})
gl_mats = []
for nm in mat_names:
    d = MATS[nm]
    mt = {"name": nm, "pbrMetallicRoughness": {"baseColorFactor": hexc(d["c"]) + [1], "metallicFactor": 0.0, "roughnessFactor": d["r"]}}
    if "e" in d: mt["emissiveFactor"] = hexc(d["e"])
    gl_mats.append(mt)
root = len(nodes)
nodes.append({"name": "Bipi", "children": root_children})
gltf = {"asset": {"version": "2.0", "generator": "bipi 3D (Condor · Alerta de Validade)"},
        "scene": 0, "scenes": [{"nodes": [root]}], "nodes": nodes, "meshes": gl_meshes, "materials": gl_mats,
        "accessors": accs, "bufferViews": bviews, "buffers": [{"byteLength": len(bin_data)}]}
js = json.dumps(gltf, separators=(",", ":")).encode()
while len(js) % 4: js += b" "
while len(bin_data) % 4: bin_data.append(0)
out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_data))
out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(bin_data), 0x004E4942) + bytes(bin_data)
open(sys.argv[1], "wb").write(out)
print("ok", sys.argv[1], len(out) // 1024, "KB,", len(nodes), "nós,", len(meshes), "malhas")

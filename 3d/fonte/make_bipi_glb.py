#!/usr/bin/env python3
"""Gera o Bipi (mascote do Condor · Alerta de Validade) em 3D, formato glTF binário (.glb).
Sem dependências além de numpy. Cada parte é um nó com nome (head, armR, eyeL, beam...),
para poder animar. Unidades: ~2,7 de altura, +Y para cima, rosto voltado para +Z.
Uso: python3 make_bipi_glb.py saida.glb [--celular] [--placa]"""
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
    "luva":     dict(c="#FFFFFF", r=0.5, e="#33415C"),
    "fone":     dict(c="#0B1B33", r=0.28),
    "tela":     dict(c="#FFFFFF", r=0.1),
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

import argparse
ap = argparse.ArgumentParser(); ap.add_argument("out"); ap.add_argument("--celular", action="store_true"); ap.add_argument("--placa", action="store_true")
args = ap.parse_args()

def plane_uv(w, h, z):  # tela do celular (UV 0..1, v para baixo)
    v = np.array([[-w, -h, z], [w, -h, z], [-w, h, z], [w, h, z]], "f4")
    n = np.array([[0, 0, 1]] * 4, "f4")
    uv = np.array([[0, 1], [1, 1], [0, 0], [1, 0]], "f4")
    return v, n, np.array([0, 1, 3, 0, 3, 2], "u2"), uv

HEAD_Y = 1.98
# ---- corpo e pernas
add("corpo", rounded_box(.50, .42, .38, .24), "azul", (0, .92, 0))
add("pescoco", cylinder(.15, .14), "marinho", (0, 1.40, 0))
for s, nm in ((-1, "L"), (1, "R")):
    add("perna" + nm, cylinder(.085, .24), "marinho", (s * .25, .31, 0))
    add("pe" + nm, rounded_box(.23, .09, .28, .09), "vermelho", (s * .25, .09, .06))
    add("ombro" + nm, sphere(.12), "azul", (s * .56, 1.16, 0))
# painel do peito com código de barras
add("painel", rounded_box(.27, .22, .025, .03), "branco", (0, .93, .385))
ws_ = [w * .72 for w in [.018, .01, .026, .01, .018, .03, .01, .02, .012, .026, .01, .018]]
x = -(sum(ws_) * 2 + .005 * (len(ws_) - 1)) / 2
for i, w in enumerate(ws_):
    add(f"barra{i}", rounded_box(w, .105, .008, .004), "marinho", (x + w, .965, .416)); x += 2 * w + .005
add("ledPeito", sphere(.032), "led", (-.18, .76, .42))
add("barraVermelha", rounded_box(.10, .016, .01, .008), "vermelho", (.06, .76, .42))
# ---- cabeça
head = add("cabeca", None, None, (0, HEAD_Y, 0))
add("cascoCabeca", rounded_box(.74, .54, .56, .27), "cabeca", (0, 0, 0), parent=head)
add("visor", rounded_box(.53, .32, .04, .14), "visor", (0, -.01, .565), parent=head)
for s, nm in ((-1, "L"), (1, "R")):
    add("olho" + nm, rounded_box(.068, .105, .02, .066), "olho", (s * .185, .055, .608), parent=head)
    add("ceja" + nm, rounded_box(.062, .014, .012, .01), "olho", (s * .185, .205, .606), parent=head)
    add("orelha" + nm, cylinder(.19, .14), "azul", (s * .80, 0, 0), rest=(0, 0, math.pi / 2), parent=head)
add("feixe", rounded_box(.47, .011, .012, .01), "feixe", (0, -.02, .61), parent=head)
add("sorriso", arc_tube(.14, 224, 316, .019), "sorriso", (0, -.01, .614), parent=head)
add("boca", rounded_box(.085, .06, .015, .045), "sorriso", (0, -.115, .614), parent=head, scale=(1, .08, 1))
ant = add("antenaPivo", None, None, (0, .52, 0), parent=head)
add("antena", cylinder(.022, .30), "azulclaro", (0, .15, 0), parent=ant)
add("antenaBola", sphere(.088), "ledverm", (0, .34, 0), parent=ant)
add("ledCabeca", sphere(.045), "led", (.43, .42, .30), parent=head)
# ---- braços (todos filhos da raiz; a pose é calculada por IK no código)
for s, nm in ((-1, "L"), (1, "R")):
    sh = (s * .56, 1.16, 0)
    up = add("braco" + nm, None, None, sh, (0, 0, s * .12))
    add("braco" + nm + "malha", rounded_box(.09, .275, .09, .09), "marinho", (0, -.275, 0), parent=up)
    fo = add("antebraco" + nm, None, None, (sh[0], sh[1] - .55, sh[2]), (0, 0, s * .06))
    add("antebraco" + nm + "malha", rounded_box(.082, .26, .082, .082), "marinho", (0, -.26, 0), parent=fo)
    hd = add("mao" + nm, sphere(.105), "luva", (0, -.55, 0), parent=fo, scale=(1, .92, 1.05))
    add("polegar" + nm, sphere(.045), "luva", (-s * .085, .02, .05), parent=hd)
    add("dedo" + nm, rounded_box(.03, .075, .03, .03), "luva", (0, -.14, .02), parent=hd)
# ---- celular (opcional)
if args.celular:
    ph = add("celular", None, None, (0, 1.0, .9))
    add("celularCorpo", rounded_box(.36, .78, .03, .085), "fone", (0, 0, 0), parent=ph)
    meshes.append(("celularTela", plane_uv(.33, .715, .0315), mat_names.index("tela")))
    nodes.append({"name": "celularTela", "translation": [0, 0, 0], "mesh": len(meshes) - 1, "extras": {"rest": [0, 0, 0]}}); nodes[ph].setdefault("children", []).append(len(nodes) - 1)
# ---- placa (só para versões futuras do Bipi; NÃO faz parte do Bipi padrão)
if args.placa:
    etq = add("etiqueta", None, None, (.62, 1.5, .12))
    add("etiquetaBorda", rounded_box(.27, .20, .012, .045), "vermelho", (0, .12, -.01), parent=etq)
    add("etiquetaFolha", rounded_box(.235, .17, .014, .035), "branco", (0, .12, .004), parent=etq)
    add("check1", rounded_box(.045, .013, .012, .006), "check", (-.045, .095, .02), (0, 0, -math.pi / 4), parent=etq)
    add("check2", rounded_box(.09, .013, .012, .006), "check", (.03, .125, .02), (0, 0, math.pi / 4), parent=etq)

# ---------- empacotar glb ----------
bin_data = bytearray(); bviews, accs, gl_meshes = [], [], []
def push(arr, target):
    while len(bin_data) % 4: bin_data.append(0)
    off = len(bin_data); bin_data.extend(arr.tobytes())
    bviews.append({"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes, "target": target})
    return len(bviews) - 1
for name, g, m in meshes:
    v, n, i = g[0], g[1], g[2]; uv = g[3] if len(g) > 3 else None
    pv = push(v.astype("f4"), 34962); pn = push(n.astype("f4"), 34962); pi = push(i.astype("u2"), 34963)
    accs.append({"bufferView": pv, "componentType": 5126, "count": len(v), "type": "VEC3",
                 "min": v.min(0).tolist(), "max": v.max(0).tolist()})
    accs.append({"bufferView": pn, "componentType": 5126, "count": len(n), "type": "VEC3"})
    accs.append({"bufferView": pi, "componentType": 5123, "count": len(i), "type": "SCALAR"})
    a = len(accs) - 3
    attrs = {"POSITION": a, "NORMAL": a + 1}
    if uv is not None:
        pu = push(uv.astype("f4"), 34962)
        accs.append({"bufferView": pu, "componentType": 5126, "count": len(uv), "type": "VEC2"}); attrs["TEXCOORD_0"] = len(accs) - 1
    gl_meshes.append({"name": name, "primitives": [{"attributes": attrs, "indices": a + 2, "material": m}]})
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
open(args.out, "wb").write(out)
print("ok", args.out, len(out) // 1024, "KB,", len(nodes), "nós,", len(meshes), "malhas")

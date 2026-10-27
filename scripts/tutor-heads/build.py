#!/usr/bin/env python3
"""Build the 3D tutor heads (public/tutors/<id>.glb) from the MakeHuman / MPFB base mesh.

The MPFB *assets* (base mesh, targets) are CC0, so the output carries no licence obligations.
Get them with:  git clone --depth 1 https://github.com/makehumancommunity/mpfb2
Then:           python3 scripts/tutor-heads/build.py /path/to/mpfb2/src/mpfb/data public/tutors

Each tutor is the base human shaped by MakeHuman's ethnicity / gender / age targets plus a few
face targets, cut to a head-and-shoulders bust, with expression targets (blink, jaw, smile, oo, ee,
brows...) as glTF morph targets for lip sync, a painted skin texture, and hair / clothes shells.
"""
import gzip, json, math, struct, sys, io, os
import numpy as np
from PIL import Image, ImageFilter

DATA = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/3d/mpfb2/src/mpfb/data'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'public/tutors'
ONLY = sys.argv[3].split(',') if len(sys.argv) > 3 else None
TEX = 2048
rng = np.random.default_rng(7)

# ───────────────────────── base mesh ─────────────────────────
V0, VT, FACES = [], [], []
cur = None
for line in open(f'{DATA}/3dobjs/base.obj'):
    if line.startswith('v '):
        V0.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '):
        VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '):
        cur = line.split()[1]
    elif line.startswith('f '):
        FACES.append((cur, [[int(i) - 1 for i in t.split('/')[:2]] for t in line.split()[1:]]))
V0 = np.array(V0, dtype=np.float64)
VT = np.array(VT, dtype=np.float64)
NV = len(V0)
GROUPS = json.load(open(f'{DATA}/mesh_metadata/basemesh_vertex_groups.json'))


def group_idx(name):
    out = []
    for a, b in GROUPS[name]:
        out += list(range(a, b + 1))
    return np.array(out)


_tcache = {}


def target(path):
    if path not in _tcache:
        d = np.zeros((NV, 3))
        with gzip.open(f'{DATA}/targets/{path}.target.gz', 'rt') as f:
            for line in f:
                if line[:1].isdigit():
                    p = line.split()
                    d[int(p[0])] = [float(p[1]), float(p[2]), float(p[3])]
        _tcache[path] = d
    return _tcache[path]


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ───────────────────────── tutors ─────────────────────────
def macro(gender, age_years, eth, muscle=0.5, weight=0.5):
    """MakeHuman-style macro targets. eth = {'african': w, 'asian': w, 'caucasian': w}."""
    g = {'female': 1 - gender, 'male': gender}
    v = 0.5 + (age_years - 25) / (90 - 25) * 0.5 if age_years >= 25 else 0.1875 + (age_years - 11) / 14 * 0.3125
    a = {'young': 1 - (v - 0.5) / 0.5, 'old': (v - 0.5) / 0.5} if v >= 0.5 else {'child': 1 - (v - 0.1875) / 0.3125, 'young': (v - 0.1875) / 0.3125}
    m = {'minmuscle': max(0, 0.5 - muscle) * 2, 'averagemuscle': 1 - abs(muscle - 0.5) * 2, 'maxmuscle': max(0, muscle - 0.5) * 2}
    w = {'minweight': max(0, 0.5 - weight) * 2, 'averageweight': 1 - abs(weight - 0.5) * 2, 'maxweight': max(0, weight - 0.5) * 2}
    out = []
    for gk, gw in g.items():
        for ak, aw in a.items():
            if gw * aw <= 0:
                continue
            for ek, ew in eth.items():
                if ew > 0:
                    out.append((f'macrodetails/{ek}-{gk}-{ak}', gw * aw * ew))
            for mk, mw in m.items():
                for wk, ww in w.items():
                    if gw * aw * mw * ww > 0:
                        out.append((f'macrodetails/universal-{gk}-{ak}-{mk}-{wk}', gw * aw * mw * ww))
    return out


def lr(name, w):
    """A face target on both sides (l-/r- prefixed files)."""
    folder, rest = name.split('/')
    return [(f'{folder}/l-{rest}', w), (f'{folder}/r-{rest}', w)]


TUTORS = {
    'amara': dict(gender=0.0, age=27, eth={'african': 0.95, 'caucasian': 0.05}, weight=0.58,
                  face=[('mouth/mouth-lowerlip-volume-incr', 0.5), ('mouth/mouth-upperlip-volume-incr', 0.4), ('head/head-round', 0.5), *lr('cheek/cheek-volume-incr', 0.5), ('nose/nose-flaring-incr', 0.3), ('nose/nose-scale-vert-decr', 0.4), ('chin/chin-height-decr', 0.3), ('head/head-fat-incr', 0.3)],
                  skin=(0.42, 0.25, 0.16), hair='puff', hairc=(0.05, 0.035, 0.03), shirt=(0.36, 0.26, 0.78), glasses='round', smile=0.18),
    'daniel': dict(gender=1.0, age=31, eth={'african': 1.0}, weight=0.5, muscle=0.6,
                   face=[('chin/chin-width-incr', 0.3), ('head/head-square', 0.35), ('mouth/mouth-lowerlip-volume-incr', 0.3), ('nose/nose-flaring-incr', 0.4)],
                   skin=(0.30, 0.18, 0.11), hair='short', hairc=(0.04, 0.03, 0.03), shirt=(0.08, 0.55, 0.72), glasses='rect', beard='stubble', smile=0.12),
    'grace': dict(gender=0.0, age=24, eth={'african': 0.9, 'caucasian': 0.1}, weight=0.45,
                  face=[('head/head-oval', 0.6), ('mouth/mouth-upperlip-volume-incr', 0.3), *lr('cheek/cheek-bones-incr', 0.7), ('chin/chin-prominent-incr', 0.3), ('nose/nose-scale-horiz-decr', 0.3), ('nose/nose-point-width-decr', 0.3), ('mouth/mouth-scale-horiz-decr', 0.2), ('head/head-fat-decr', 0.4)],
                  skin=(0.50, 0.31, 0.20), hair='braids', hairc=(0.06, 0.04, 0.035), shirt=(0.78, 0.22, 0.42), smile=0.2),
    'joseph': dict(gender=1.0, age=52, eth={'african': 1.0}, weight=0.62,
                   face=[('head/head-round', 0.2), ('chin/chin-width-incr', 0.2), ('nose/nose-flaring-incr', 0.5), *lr('eyes/eye-bag-incr', 0.4)],
                   skin=(0.25, 0.15, 0.09), hair='bald', hairc=(0.55, 0.55, 0.55), shirt=(0.07, 0.48, 0.32), glasses='half', beard='grey', smile=0.1),
    'zara': dict(gender=0.0, age=21, eth={'african': 0.85, 'caucasian': 0.15}, weight=0.42,
                 face=[('head/head-triangular', 0.4), ('mouth/mouth-lowerlip-volume-incr', 0.3), *lr('cheek/cheek-bones-incr', 0.5), ('nose/nose-scale-horiz-decr', 0.2), ('chin/chin-width-decr', 0.4), ('nose/nose-scale-vert-decr', 0.3)],
                 skin=(0.47, 0.30, 0.20), hair='afro', hairc=(0.09, 0.06, 0.045), shirt=(0.92, 0.52, 0.10), smile=0.25),
    'samuel': dict(gender=1.0, age=34, eth={'african': 1.0}, weight=0.52, muscle=0.65,
                   face=[('head/head-oval', 0.2), ('chin/chin-prominent-incr', 0.3), ('nose/nose-flaring-incr', 0.3), ('mouth/mouth-lowerlip-volume-incr', 0.2)],
                   skin=(0.34, 0.21, 0.13), hair='waves', hairc=(0.04, 0.03, 0.03), shirt=(0.30, 0.26, 0.85), beard='goatee', smile=0.15),
    'ruth': dict(gender=0.0, age=38, eth={'african': 1.0}, weight=0.55,
                 face=[('head/head-rectangular', 0.4), ('mouth/mouth-lowerlip-volume-incr', 0.4), ('nose/nose-flaring-incr', 0.5), ('chin/chin-width-incr', 0.3), ('mouth/mouth-scale-horiz-incr', 0.3)],
                 skin=(0.29, 0.17, 0.10), hair='short', hairc=(0.04, 0.03, 0.03), shirt=(0.06, 0.50, 0.52), glasses='cat', smile=0.1),
    'peter': dict(gender=1.0, age=26, eth={'african': 0.7, 'caucasian': 0.3}, weight=0.48, beardAmt=0.25,
                  face=[('head/head-oval', 0.4), ('chin/chin-prominent-incr', 0.3), ('nose/nose-scale-horiz-decr', 0.4), ('nose/nose-hump-incr', 0.3), ('mouth/mouth-lowerlip-volume-decr', 0.3), ('head/head-fat-decr', 0.4)],
                  skin=(0.55, 0.36, 0.24), hair='short', hairc=(0.07, 0.05, 0.035), shirt=(0.80, 0.20, 0.38), beard='stubble', smile=0.2),
}

# Expression targets used as morphs (from MakeHuman's expression units)
EXPR = {
    'blinkL': [('eye-left-closure', 1)], 'blinkR': [('eye-right-closure', 1)],
    'jawOpen': [('mouth-open', 1)],
    'oo': [('mouth-pursing', 0.8), ('mouth-protusion', 0.5)],
    'ee': [('mouth-retraction', 1)],
    'smile': [('mouth-corner-puller', 1)],
    'mbp': [('mouth-compression', 1)],
    'fv': [('mouth-depression', 0.5), ('mouth-eversion', 0.6)],
    'browUp': [('eyebrows-left-up', 1), ('eyebrows-right-up', 1)],
    'browInner': [('eyebrows-left-inner-up', 1), ('eyebrows-right-inner-up', 1)],
    'browDown': [('eyebrows-left-down', 1), ('eyebrows-right-down', 1)],
    'squint': [('eye-left-slit', 0.6), ('eye-right-slit', 0.6)],
}


# ───────────────────────── geometry helpers ─────────────────────────
def vertex_normals(P, quads):
    n = np.zeros_like(P)
    q = np.array(quads)
    for a, b, c in ((0, 1, 2), (0, 2, 3)):
        fn = np.cross(P[q[:, b]] - P[q[:, a]], P[q[:, c]] - P[q[:, a]])
        for k in (a, b, c):
            np.add.at(n, q[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


def neighbours(quads, n):
    nb = [set() for _ in range(n)]
    for q in quads:
        for i in range(4):
            a, b = q[i], q[(i + 1) % 4]
            nb[a].add(b)
            nb[b].add(a)
    return nb


def laplacian(P, nb, idx):
    L = np.zeros_like(P)
    for i in idx:
        if nb[i]:
            L[i] = P[list(nb[i])].mean(0) - P[i]
    return L


# ───────────────────────── texture rasterizer ─────────────────────────
def rasterize(tris_uv, attrs, size):
    """For each texel covered by a UV triangle, the barycentric-interpolated attributes.
    tris_uv: (T,3,2) in 0..1; attrs: list of (T,3,C). Returns (mask, [maps])."""
    H = W = size
    mask = np.zeros((H, W), bool)
    maps = [np.zeros((H, W, a.shape[2])) for a in attrs]
    pts = tris_uv.copy()
    pts[..., 0] *= W
    pts[..., 1] = (1 - pts[..., 1]) * H
    for t in range(len(pts)):
        (x0, y0), (x1, y1), (x2, y2) = pts[t]
        minx, maxx = int(max(0, math.floor(min(x0, x1, x2)) - 1)), int(min(W - 1, math.ceil(max(x0, x1, x2)) + 1))
        miny, maxy = int(max(0, math.floor(min(y0, y1, y2)) - 1)), int(min(H - 1, math.ceil(max(y0, y1, y2)) + 1))
        if maxx < minx or maxy < miny:
            continue
        xs, ys = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
        d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(d) < 1e-12:
            continue
        l0 = ((y1 - y2) * (xs - x2) + (x2 - x1) * (ys - y2)) / d
        l1 = ((y2 - y0) * (xs - x2) + (x0 - x2) * (ys - y2)) / d
        l2 = 1 - l0 - l1
        e = -0.02  # a little overlap so seams have no gaps
        inside = (l0 >= e) & (l1 >= e) & (l2 >= e)
        if not inside.any():
            continue
        yy, xx = ys[inside].astype(int), xs[inside].astype(int)
        mask[yy, xx] = True
        b = np.stack([l0[inside], l1[inside], l2[inside]], 1)
        for m, a in zip(maps, attrs):
            m[yy, xx] = b @ a[t]
    return mask, maps


def dilate(img, mask, steps=6):
    """Bleed colours past the UV island edges, so mip-mapping shows no dark seams."""
    img = img.copy()
    m = mask.copy()
    for _ in range(steps):
        acc = np.zeros_like(img)
        cnt = np.zeros(m.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sm = np.roll(m, (dy, dx), (0, 1))
            si = np.roll(img, (dy, dx), (0, 1))
            acc[sm & ~m] += si[sm & ~m]
            cnt[sm & ~m] += 1
        grow = (cnt > 0) & ~m
        img[grow] = acc[grow] / cnt[grow][:, None]
        m = m | grow
    return img


def value_noise(P, scale, seed=0):
    """Smooth 3D noise at points P (N,3), roughly in -1..1."""
    r = np.random.default_rng(seed)
    g = r.standard_normal((64, 64, 64))
    q = P * scale
    i = np.floor(q).astype(int)
    f = q - i
    f = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * g[(i[:, 0] + dx) % 64, (i[:, 1] + dy) % 64, (i[:, 2] + dz) % 64]
    return out


def fbm(P, scale, octaves=4, seed=0):
    s, a, tot = 0, 1, 0
    for o in range(octaves):
        s = s + a * value_noise(P, scale * 2 ** o, seed + o)
        tot += a
        a *= 0.5
    return s / tot


# ───────────────────────── GLB writer ─────────────────────────
class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.j = {'asset': {'version': '2.0', 'generator': 'charis-study tutor-heads'}, 'buffers': [], 'bufferViews': [], 'accessors': [],
                  'meshes': [], 'nodes': [], 'scenes': [{'nodes': []}], 'scene': 0, 'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]}

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.j['bufferViews'].append(v)
        return len(self.j['bufferViews']) - 1

    def acc(self, arr, kind, target=34962, minmax=False):
        arr = np.ascontiguousarray(arr)
        if arr.dtype in (np.uint16, np.uint32):
            ct = 5123 if arr.dtype == np.uint16 else 5125
        else:
            arr = arr.astype(np.float32)
            ct = 5126
        bv = self.view(arr.tobytes(), target)
        a = {'bufferView': bv, 'componentType': ct, 'count': int(arr.shape[0]), 'type': kind}
        if minmax:
            a['min'] = arr.min(0).tolist() if arr.ndim > 1 else [float(arr.min())]
            a['max'] = arr.max(0).tolist() if arr.ndim > 1 else [float(arr.max())]
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def sparse(self, d):
        """A morph target as a sparse accessor: only the vertices that move."""
        d = np.asarray(d, np.float32)
        nz = np.where(np.abs(d).max(1) > 1e-5)[0]
        a = {'componentType': 5126, 'count': int(len(d)), 'type': 'VEC3',
             'min': (d.min(0) if len(d) else np.zeros(3)).tolist(), 'max': (d.max(0) if len(d) else np.zeros(3)).tolist()}
        if len(nz):
            iv = self.view(nz.astype(np.uint32 if len(d) > 65535 else np.uint16).tobytes())
            vv = self.view(np.ascontiguousarray(d[nz]).tobytes())
            a['sparse'] = {'count': int(len(nz)), 'indices': {'bufferView': iv, 'componentType': 5125 if len(d) > 65535 else 5123}, 'values': {'bufferView': vv}}
        else:
            a['sparse'] = None
            del a['sparse']
            # an all-zero target still needs data
            a['bufferView'] = self.view(np.zeros((len(d), 3), np.float32).tobytes())
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def image(self, img, fmt='JPEG', quality=88):
        b = io.BytesIO()
        if fmt == 'JPEG':
            img.convert('RGB').save(b, 'JPEG', quality=quality, optimize=True, progressive=True)
            mime = 'image/jpeg'
        elif fmt == 'WEBP':
            img.save(b, 'WEBP', quality=quality, method=6, exact=True)
            bv = self.view(b.getvalue())
            self.j['images'].append({'bufferView': bv, 'mimeType': 'image/webp'})
            self.j['textures'].append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(self.j['images']) - 1}}})
            self.j.setdefault('extensionsUsed', []).append('EXT_texture_webp') if 'EXT_texture_webp' not in self.j.get('extensionsUsed', []) else None
            self.j.setdefault('extensionsRequired', []).append('EXT_texture_webp') if 'EXT_texture_webp' not in self.j.get('extensionsRequired', []) else None
            return len(self.j['textures']) - 1
        else:
            img.save(b, 'PNG', optimize=True)
            mime = 'image/png'
        bv = self.view(b.getvalue())
        self.j['images'].append({'bufferView': bv, 'mimeType': mime})
        self.j['textures'].append({'sampler': 0, 'source': len(self.j['images']) - 1})
        return len(self.j['textures']) - 1

    def material(self, m):
        self.j['materials'].append(m)
        return len(self.j['materials']) - 1

    def mesh(self, name, prims, target_names=None, extras=None):
        m = {'name': name, 'primitives': prims}
        if target_names:
            m['extras'] = {'targetNames': target_names}
        self.j['meshes'].append(m)
        node = {'name': name, 'mesh': len(self.j['meshes']) - 1}
        if extras:
            node['extras'] = extras
        self.j['nodes'].append(node)
        self.j['scenes'][0]['nodes'].append(len(self.j['nodes']) - 1)

    def prim(self, P, N, UV, idx, mat, morphs=None):
        p = {'attributes': {'POSITION': self.acc(P, 'VEC3', minmax=True), 'NORMAL': self.acc(N, 'VEC3')}, 'material': mat,
             'indices': self.acc(idx.astype(np.uint32 if idx.max() > 65535 else np.uint16), 'SCALAR', 34963)}
        if UV is not None:
            p['attributes']['TEXCOORD_0'] = self.acc(UV, 'VEC2')
        if morphs is not None:
            p['targets'] = [{'POSITION': self.sparse(d)} for d in morphs]
        return p

    def save(self, path, scene_extras):
        self.j['scenes'][0]['extras'] = scene_extras
        self.j['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(self.j, separators=(',', ':')).encode()
        while len(js) % 4:
            js += b' '
        while len(self.bin) % 4:
            self.bin.append(0)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin))


# ───────────────────────── build one tutor ─────────────────────────
def build(tid, spec):
    print('building', tid)
    eth = 'african' if spec['eth'].get('african', 0) >= 0.5 else max(spec['eth'], key=spec['eth'].get)
    mods = macro(spec['gender'], spec['age'], spec['eth'], spec.get('muscle', 0.5), spec.get('weight', 0.5)) + spec['face']
    P = V0.copy()
    for path, w in mods:
        P += target(path) * w
    expr = {k: sum(target(f'expression/units/{eth}/{n}') * w for n, w in parts) for k, parts in EXPR.items()}

    body = [f for g, f in FACES if g == 'body']
    quads_all = [[v for v, t in f] for f in body]
    N_all = vertex_normals(P, [[v for v, t in f] for g_, f in FACES if len(f) == 4])
    nb = neighbours(quads_all, NV)

    def gc(name):
        return P[group_idx(name)].mean(0)

    eyeL, eyeR = gc('helper-l-eye'), gc('helper-r-eye')
    eyeRad = float(np.abs(P[group_idx('helper-l-eye')] - eyeL).max(0)[1]) * 0.98
    neck = gc('joint-neck')
    headTop = P[group_idx('joint-head-2')].mean(0)
    clav = gc('joint-l-clavicle')
    mouth = gc('joint-mouth')
    jaw = gc('joint-jaw')
    eyeC = (eyeL + eyeR) / 2

    cut = clav[1] - 0.75
    keep = [i for i, f in enumerate(body) if all(P[v][1] > cut and abs(P[v][0]) < 2.3 for v, t in f)]
    bust = [body[i] for i in keep]
    bust_q = [[v for v, t in f] for f in bust]
    bust_v = np.array(sorted(set(v for q in bust_q for v in q)))

    # ── per-vertex masks (in the welded vertex space) ──
    def tmag(path, side=None):
        d = np.linalg.norm(target(path), axis=1)
        return d / (d.max() + 1e-9)

    lips = np.clip((tmag('mouth/mouth-upperlip-volume-incr') + tmag('mouth/mouth-lowerlip-volume-incr')) * 1.6, 0, 1)
    lips = smoothstep(0.18, 0.75, lips)
    # cavity: concave areas get darker (creases, nostrils, eye corners, lip line)
    L = laplacian(P, nb, bust_v)
    cav = np.einsum('ij,ij->i', L, N_all)
    cav = np.clip(cav / (np.percentile(np.abs(cav[bust_v]), 97) + 1e-9), -1, 1)
    # inside of the mouth: vertices behind the lips, deep inside
    mouth_in = ((P[:, 2] < mouth[2] + 0.55) & (np.abs(P[:, 0]) < 0.45) & (np.abs(P[:, 1] - mouth[1]) < 0.35) & (N_all[:, 2] < 0.2)).astype(float)

    scalp = hair_mask(P, spec, eyeC, neck) if spec['hair'] != 'bald' else np.zeros(NV)

    # ── skin texture: rasterize 3D position, normal and masks into UV space ──
    tris_uv, tris_p, tris_n, tris_m = [], [], [], []
    for f in bust:
        for a, b, c in ((0, 1, 2), (0, 2, 3)):
            vs = [f[a][0], f[b][0], f[c][0]]
            ts = [f[a][1], f[b][1], f[c][1]]
            tris_uv.append(VT[ts])
            tris_p.append(P[vs])
            tris_n.append(N_all[vs])
            tris_m.append(np.stack([lips[vs], cav[vs], mouth_in[vs], scalp[vs]], 1))
    mask, (TP, TN, TM) = rasterize(np.array(tris_uv), [np.array(tris_p), np.array(tris_n), np.array(tris_m)], TEX)
    pts = TP[mask]
    nrm = TN[mask]
    m_lips, m_cav, m_in, m_scalp = TM[mask][:, 0], TM[mask][:, 1], TM[mask][:, 2], TM[mask][:, 3]

    skin = np.array(spec['skin'])
    col = np.tile(skin, (len(pts), 1))
    # gentle variation: warmer cheeks and nose, darker forehead edges and neck, mottling
    rel = pts - eyeC
    n1 = fbm(pts, 3.0, 4, 11)
    n2 = fbm(pts, 28.0, 3, 23)
    col *= (1 + 0.06 * n1[:, None] + 0.025 * n2[:, None])
    cheeks = np.exp(-(((np.abs(rel[:, 0]) - 0.42) / 0.22) ** 2 + ((rel[:, 1] + 0.38) / 0.22) ** 2)) * (rel[:, 2] > -0.3)
    col = col * (1 - 0.10 * cheeks[:, None]) + cheeks[:, None] * 0.10 * skin * np.array([1.35, 0.9, 0.85])
    nose = np.exp(-((rel[:, 0] / 0.16) ** 2 + ((rel[:, 1] + 0.35) / 0.25) ** 2)) * (rel[:, 2] > 0)
    col = col * (1 + 0.06 * nose[:, None] * np.array([1.0, 0.4, 0.2]))
    # darker around the eyes (natural), on the eyelid crease
    for e in (eyeL, eyeR):
        d = np.linalg.norm((pts - e) * np.array([1, 1.35, 1]), axis=1)
        ring = np.exp(-((d - eyeRad * 1.45) / (eyeRad * 0.55)) ** 2) * (pts[:, 2] > e[2] - 0.4)
        col *= (1 - 0.16 * ring[:, None])
    # lips: deeper and slightly purple-red; the inner lip pinker
    lipcol = skin * np.array([0.78, 0.58, 0.60]) + np.array([0.05, 0.0, 0.01])
    col = col * (1 - m_lips[:, None]) + lipcol * m_lips[:, None]
    lipline = np.exp(-((rel[:, 1] - (mouth[1] - eyeC[1]) + 0.0) / 0.012) ** 2) * (np.abs(pts[:, 0]) < 0.28) * (m_lips > 0.3)
    col *= (1 - 0.35 * lipline[:, None])
    # cavities and the inside of the mouth
    col *= (1 - 0.32 * np.clip(m_cav, 0, 1)[:, None])
    col *= (1 + 0.08 * np.clip(-m_cav, 0, 1)[:, None])
    col = col * (1 - m_in[:, None]) + np.array([0.25, 0.08, 0.08]) * m_in[:, None]

    # eyebrows: an arc of short hairs above each eye
    browc = np.array(spec['hairc']) if spec['hair'] != 'bald' else np.array([0.06, 0.045, 0.04])
    if spec.get('beard') == 'grey':
        browc = np.array([0.18, 0.16, 0.15])
    browsum = np.zeros(len(pts))
    for side, e in ((1, eyeL), (-1, eyeR)):
        x = (pts[:, 0] - e[0]) * side  # + is outward
        u = np.clip((x + 0.22) / 0.56, 0, 1)  # 0 inner end → 1 outer end
        ycurve = e[1] + eyeRad * 1.85 + 0.075 * np.sin(np.clip(u / 0.68, 0, 1) * math.pi / 2) - 0.16 * np.clip(u - 0.68, 0, 1) ** 1.2
        thick = (0.062 if spec['gender'] > 0.5 else 0.048) * (1 - 0.6 * u ** 1.5) + 0.014
        dy = (pts[:, 1] - ycurve) / thick
        inside = (x > -0.22) & (x < 0.34) & (pts[:, 2] > e[2] - 0.45)
        endfade = smoothstep(-0.23, -0.16, x) * (1 - smoothstep(0.26, 0.35, x))
        hairs = 0.72 + 0.28 * np.sin((pts[:, 0] * side * 170 + pts[:, 1] * 70) + 2.5 * fbm(pts, 40, 2, 5)) + 0.15 * fbm(pts, 90, 2, 6)
        b = np.exp(-dy ** 2) * inside * endfade * np.clip(hairs, 0, 1)
        browsum = np.maximum(browsum, b)
    col = col * (1 - 0.88 * browsum[:, None]) + browc * 0.88 * browsum[:, None]

    # a fine lash line along the upper lid
    for e in (eyeL, eyeR):
        d = np.linalg.norm((pts - e) * np.array([0.92, 1.25, 1]), axis=1)
        upper = smoothstep(e[1] - eyeRad * 0.35, e[1] + eyeRad * 0.1, pts[:, 1])
        ln = np.exp(-((d - eyeRad * 1.02) / (eyeRad * 0.07)) ** 2) * upper * (pts[:, 2] > e[2])
        col *= (1 - 0.75 * ln[:, None])

    # beard / stubble
    beard = spec.get('beard')
    if beard:
        bv_ = P[bust_v]
        mid = bv_[np.abs(bv_[:, 0]) < 0.1]
        lipz = mid[np.abs(mid[:, 1] - mouth[1]) < 0.3][:, 2].max()
        chin_y = mid[mid[:, 2] > lipz - 0.32][:, 1].min()
        rel = pts - eyeC
        face_front = smoothstep(neck[2] + 0.05, neck[2] + 0.35, pts[:, 2])
        under = smoothstep(chin_y - 0.22, chin_y + 0.04, pts[:, 1])  # fades out under the jaw
        line = -0.45 - 0.16 * np.clip((0.75 - np.abs(rel[:, 0])) / 0.75, 0, 1)
        jawline = 1 - smoothstep(line - 0.10, line + 0.04, rel[:, 1])
        ear_cut = 1 - smoothstep(0.62, 0.80, np.abs(rel[:, 0]))
        zone = jawline * ear_cut * face_front * under * (1 - smoothstep(0.1, 0.35, m_lips))
        if beard == 'goatee':
            ax = np.abs(pts[:, 0])
            mous = (1 - smoothstep(0.24, 0.32, ax)) * smoothstep(mouth[1] + 0.0, mouth[1] + 0.05, pts[:, 1]) * (1 - smoothstep(mouth[1] + 0.17, mouth[1] + 0.24, pts[:, 1]))
            chin = (1 - smoothstep(0.18, 0.28, ax)) * (1 - smoothstep(mouth[1] - 0.16, mouth[1] - 0.08, pts[:, 1]))
            zone = zone * np.maximum(mous, chin)
        speck = np.clip(0.45 + 0.9 * fbm(pts, 160, 2, 31), 0, 1)
        amt = spec.get('beardAmt', {'stubble': 0.38, 'goatee': 0.8, 'grey': 0.75}[beard])
        bc = np.array([0.55, 0.53, 0.52]) if beard == 'grey' else np.array(spec['hairc'])
        b = zone * speck * amt
        col = col * (1 - b[:, None]) + bc * b[:, None]

    if spec['hair'] != 'bald':  # under the hair the scalp is dark, so no light skin shows through
        sc = smoothstep(0.05, 0.4, m_scalp)[:, None]
        col = col * (1 - 0.85 * sc) + np.array(spec['hairc']) * 0.85 * sc
    col = np.clip(col, 0, 1)
    img = np.zeros((TEX, TEX, 3))
    img[mask] = col
    img = dilate(img, mask, 8)
    skin_img = Image.fromarray((img * 255).astype(np.uint8))

    g = GLB()
    skin_tex = g.image(skin_img, 'WEBP', 86)
    mat_skin = g.material({'name': 'skin', 'pbrMetallicRoughness': {'baseColorTexture': {'index': skin_tex}, 'metallicFactor': 0, 'roughnessFactor': 0.62}})
    mat_teeth = g.material({'name': 'teeth', 'pbrMetallicRoughness': {'baseColorFactor': [0.86, 0.83, 0.76, 1], 'metallicFactor': 0, 'roughnessFactor': 0.35}})
    mat_tongue = g.material({'name': 'tongue', 'pbrMetallicRoughness': {'baseColorFactor': [0.55, 0.22, 0.22, 1], 'metallicFactor': 0, 'roughnessFactor': 0.5}})
    mat_lash = g.material({'name': 'lashes', 'pbrMetallicRoughness': {'baseColorFactor': [0.03, 0.025, 0.02, 1], 'metallicFactor': 0, 'roughnessFactor': 0.8}, 'doubleSided': True})

    names = list(EXPR.keys())

    def split_prim(faces, mat, uv=True):
        """glTF needs one index per (vertex, uv) pair."""
        key = {}
        vid, tid_, idx = [], [], []
        for f in faces:
            loc = []
            for v, t in f:
                k = (v, t if uv else 0)
                if k not in key:
                    key[k] = len(vid)
                    vid.append(v)
                    tid_.append(t)
                loc.append(key[k])
            if len(loc) == 4:
                idx += [loc[0], loc[1], loc[2], loc[0], loc[2], loc[3]]
            else:
                idx += loc[:3]
        vid = np.array(vid)
        UV = np.stack([VT[tid_][:, 0], 1 - VT[tid_][:, 1]], 1) if uv else None
        return g.prim(P[vid], N_all[vid], UV, np.array(idx), mat, [expr[k][vid] for k in names])

    prims = [split_prim(bust, mat_skin)]
    for gname, mat in (('helper-upper-teeth', mat_teeth), ('helper-lower-teeth', mat_teeth), ('helper-tongue', mat_tongue)):
        fs = [f for gg, f in FACES if gg == gname]
        # helpers have their own normals
        prims.append(split_prim(fs, mat, uv=False))
    g.mesh('head', prims, names)

    # ── hair / beard / clothes shells ──
    shells(g, tid, spec, P, N_all, nb, bust, bust_q, bust_v, dict(eyeC=eyeC, eyeL=eyeL, eyeR=eyeR, eyeRad=eyeRad, neck=neck, headTop=headTop, clav=clav, mouth=mouth, jaw=jaw), expr, names)

    # head bounds for framing and the glasses
    hv = P[bust_v]
    headpts = hv[hv[:, 1] > neck[1] + 0.3]
    earL = headpts[np.argmax(headpts[:, 0])]
    extras = {
        'eyeL': eyeL.tolist(), 'eyeR': eyeR.tolist(), 'eyeRadius': eyeRad,
        'neck': neck.tolist(), 'headTop': [0, float(headpts[:, 1].max()), float(headpts[:, 2].mean())],
        'mouth': mouth.tolist(), 'jaw': jaw.tolist(), 'headWidth': float(headpts[:, 0].max() * 2), 'earL': earL.tolist(),
        'noseTip': hv[np.argmax(np.where(hv[:, 1] > mouth[1], hv[:, 2], -9))].tolist(),
        'glasses': spec.get('glasses'), 'shirt': list(spec['shirt']), 'smile': spec.get('smile', 0.1), 'gender': 'm' if spec['gender'] > 0.5 else 'f',
        'licence': 'Built from the MakeHuman/MPFB base mesh and targets (CC0).',
    }
    os.makedirs(OUT, exist_ok=True)
    g.save(f'{OUT}/{tid}.glb', extras)
    skin_img.save(f'/tmp/skin-{tid}.jpg', quality=80)
    print('  ', tid, round(os.path.getsize(f'{OUT}/{tid}.glb') / 1024), 'KB')


HAIR_KNOTS = np.array([[0, 0.80], [30, 0.76], [48, 0.58], [62, 0.40], [76, 0.30], [100, 0.32], [118, 0.12], [140, -0.42], [180, -0.72]])


def hair_knots(spec):
    k = HAIR_KNOTS.copy()
    if spec['gender'] > 0.5:
        k[:, 1] += np.array([0.04, 0.04, 0.0, -0.02, 0, 0, 0, 0.05, 0.08])
    return k


def hair_mask(P, spec, eyeC, neck):
    phi = np.degrees(np.abs(np.arctan2(P[:, 0], P[:, 2] - (neck[2] + 0.1))))
    k = hair_knots(spec)
    hl = np.interp(phi, k[:, 0], k[:, 1])
    return smoothstep(hl - 0.06, hl + 0.10, P[:, 1] - eyeC[1]) * (P[:, 1] > neck[1] + 0.2)


def shells(g, tid, spec, P, N, nb, bust, bust_q, bust_v, lm, expr, names):
    """Hair and clothes as offset shells of the skin, with soft (alpha-tested) edges."""
    eyeC, neck, headTop = lm['eyeC'], lm['neck'], lm['headTop']

    def shell(name, mask, thick, colour_fn, size, rough, normals=None, offset=None):
        faces = [f for f, q in zip(bust, bust_q) if mask[q].max() > 0.02]
        vs = sorted(set(v for f in faces for v, t in f))
        pos = P.copy()
        if offset is None:
            pos[vs] = P[vs] + N[vs] * (thick * mask[vs])[:, None]
        else:
            pos = offset
        tris_uv, tris_p, tris_m = [], [], []
        for f in faces:
            for a_, b_, c_ in ((0, 1, 2), (0, 2, 3)):
                ids = [f[a_][0], f[b_][0], f[c_][0]]
                tris_uv.append(VT[[f[a_][1], f[b_][1], f[c_][1]]])
                tris_p.append(P[ids])
                tris_m.append(mask[ids][:, None])
        tm, (TP, TM) = rasterize(np.array(tris_uv), [np.array(tris_p), np.array(tris_m)], size)
        rgb, alpha = colour_fn(TP[tm], TM[tm][:, 0])
        img = np.zeros((size, size, 4))
        img[tm, :3] = np.clip(rgb, 0, 1)
        img[tm, 3] = np.clip(alpha, 0, 1)
        img = dilate(img, tm, 6)
        tex = g.image(Image.fromarray((img * 255).astype(np.uint8), 'RGBA'), 'WEBP')
        mat = g.material({'name': name, 'pbrMetallicRoughness': {'baseColorTexture': {'index': tex}, 'metallicFactor': 0, 'roughnessFactor': rough}, 'alphaMode': 'MASK', 'alphaCutoff': 0.5})
        nrm = normals if normals is not None else (vertex_normals(pos, [[v for v, t in f] for f in faces]) if offset is not None else N)
        prim_from(g, faces, pos, nrm, mat, name=name)
        return mat, tex

    # ── clothes: everything below a collar line (a soft V at the front) ──
    ax = np.abs(P[:, 0])
    collar_y = neck[1] - 0.40 + 0.22 * np.clip(ax / 1.1, 0, 1) ** 2 - np.where(P[:, 2] > neck[2] + 0.2, np.clip(0.42 - ax, 0, 0.42) * 0.7, 0)
    cloth = 1 - smoothstep(-0.10, 0.10, P[:, 1] - collar_y)
    shirt = np.array(spec['shirt'])

    def shirt_col(pts, m):
        weave = 1 + 0.035 * fbm(pts, 120, 2, 51) + 0.05 * fbm(pts, 8, 2, 52)
        rel_y = pts[:, 1] - (neck[1] - 0.40 + 0.22 * np.clip(np.abs(pts[:, 0]) / 1.1, 0, 1) ** 2)
        hem = np.exp(-((m - 0.55) / 0.06) ** 2) * 0.18
        return shirt[None] * weave[:, None] * (1 - hem)[:, None], smoothstep(0.42, 0.52, m)

    shell('shirt', cloth, 0.04, shirt_col, 1024, 0.88)

    style = spec['hair']
    if style == 'bald':
        return
    knots = hair_knots(spec)
    hm = hair_mask(P, spec, eyeC, neck)
    hc = np.array(spec['hairc'])
    T = {'short': 0.07, 'waves': 0.05, 'braids': 0.06, 'puff': 0.06, 'afro': 0.55}[style]
    offset = None
    def hair_col(pts, m):
        r2 = pts - eyeC
        if style == 'waves':
            crown = np.array([0, headTop[1] - 0.2, neck[2] - 0.25])
            d = np.linalg.norm(pts - crown, axis=1)
            shade = 0.75 + 0.45 * (0.5 + 0.5 * np.sin(d * 75 + 3 * fbm(pts, 6, 2, 9)))
        elif style == 'braids':
            lanes = np.sin(np.arctan2(r2[:, 0], r2[:, 2] + 0.3) * 18)
            on = lanes > -0.55
            knots_ = np.sin(pts[:, 1] * 32 + np.abs(r2[:, 0]) * 10)
            shade = np.where(on, 0.95 + 0.25 * knots_, 0.5)
        else:
            coil = fbm(pts, 220, 2, 17)
            shade = 0.85 + 0.9 * np.clip(coil, -0.4, 0.6) + 0.2 * fbm(pts, 14, 2, 19)
        edge = m + 0.09 * fbm(pts, 140, 2, 77)  # a natural, slightly uneven hairline
        a = smoothstep(0.34, 0.40, edge)
        shade = shade * (0.8 + 0.2 * smoothstep(0.3, 0.8, m))
        return hc[None] * shade[:, None], a

    rough = 0.9
    mat, tex = shell('hair', hm, T if style != 'afro' else 0.08, hair_col, 1024, rough)
    if style == 'afro':
        afro(g, P[bust_v], hc, eyeC, neck, knots)

    if style == 'puff':  # a high round puff
        sphere(g, np.array([0, headTop[1] + 0.02, neck[2] - 0.30]), 0.62, hc, 41)
    if style == 'braids':  # a low bun at the back
        sphere(g, np.array([0, eyeC[1] - 0.15, neck[2] - 1.0]), 0.5, hc, 43, squash=(1.15, 0.9, 0.8))


def afro(g, head, hc, eyeC, neck, knots, segs=96):
    """A rounded afro: a sphere around the head, pulled in to the scalp at the hairline."""
    from scipy.spatial import cKDTree
    c = np.array([0, eyeC[1] + 0.55, neck[2] + 0.30])
    d = head - c
    r = np.linalg.norm(d, axis=1)
    tree = cKDTree(d / r[:, None])
    us, vs = np.meshgrid(np.linspace(0, 2 * math.pi, segs + 1), np.linspace(0, math.pi, segs // 2 + 1))
    dirs = np.stack([np.sin(vs) * np.sin(us), np.cos(vs), np.sin(vs) * np.cos(us)], -1).reshape(-1, 3)  # u=0 → +z (front)
    nn = tree.query(dirs, k=12)[1]
    rs = r[nn].max(1)  # the scalp in that direction
    scalp = c + dirs * rs[:, None]
    phi = np.degrees(np.abs(np.arctan2(scalp[:, 0], scalp[:, 2] - neck[2] - 0.1)))
    hl = np.interp(phi, knots[:, 0], knots[:, 1])
    m = smoothstep(hl - 0.02, hl + 0.35, scalp[:, 1] - eyeC[1]) * (scalp[:, 1] > neck[1] + 0.4)
    ell = 1 / np.sqrt((dirs[:, 0] / 1.55) ** 2 + (dirs[:, 1] / 1.35) ** 2 + (dirs[:, 2] / 1.5) ** 2)
    big = np.maximum(ell, rs + 0.25) * (1 + 0.03 * fbm(dirs * 2, 4, 3, 5))
    low = smoothstep(-0.75, -0.15, dirs[:, 1])  # no long hang at the nape
    R = rs + 0.03 + (big - rs) * m * low
    pts = c + dirs * R[:, None]
    W = segs + 1
    idx = []
    for j in range(segs // 2):
        for i in range(segs):
            a, b = j * W + i, j * W + i + 1
            c2, d2 = (j + 1) * W + i, (j + 1) * W + i + 1
            if max(m[[a, b, c2, d2]]) > 0.01:
                idx += [a, b, c2, b, d2, c2]
    idx = np.array(idx)
    nrm = vertex_normals_tri(pts, idx.reshape(-1, 3))
    S = 512
    uv = np.stack([us.ravel() / (2 * math.pi), vs.ravel() / math.pi], 1)
    yy, xx = np.mgrid[0:S, 0:S] / S
    q = np.stack([np.sin(xx * 2 * math.pi) * 3, yy * 3, np.cos(xx * 2 * math.pi) * 3], -1).reshape(-1, 3)
    shade = (0.75 + 0.5 * fbm(q, 14, 3, 61)).reshape(S, S)
    # alpha follows the hairline mask, sampled on the texture grid
    mgrid = m.reshape(segs // 2 + 1, W)
    from PIL import Image as _I
    mt = np.array(_I.fromarray((mgrid * 255).astype(np.uint8)).resize((S, S), _I.BILINEAR)) / 255
    alpha = smoothstep(0.08, 0.2, mt + 0.15 * fbm(q, 30, 2, 62).reshape(S, S))
    img = np.concatenate([np.clip(np.array(hc)[None, None] * shade[..., None], 0, 1), alpha[..., None]], -1)
    tex = g.image(Image.fromarray((img * 255).astype(np.uint8), 'RGBA'), 'WEBP')
    mat = g.material({'name': 'hair-afro', 'pbrMetallicRoughness': {'baseColorTexture': {'index': tex}, 'metallicFactor': 0, 'roughnessFactor': 0.95}, 'alphaMode': 'MASK', 'alphaCutoff': 0.5})
    g.mesh('afro', [g.prim(pts, nrm, uv, idx, mat)])


def prim_from(g, faces, Pos, Nrm, mat, uv=True, name='shell'):
    key, vid, tids, idx = {}, [], [], []
    for f in faces:
        loc = []
        for v, t in f:
            k = (v, t)
            if k not in key:
                key[k] = len(vid)
                vid.append(v)
                tids.append(t)
            loc.append(key[k])
        idx += [loc[0], loc[1], loc[2], loc[0], loc[2], loc[3]]
    vid = np.array(vid)
    UV = np.stack([VT[tids][:, 0], 1 - VT[tids][:, 1]], 1) if uv else None
    if not uv:
        UV = np.zeros((len(vid), 2))
    g.mesh(name, [g.prim(Pos[vid], Nrm[vid], UV, np.array(idx), mat)])


def sphere(g, c, r, col, seed, squash=(1, 1, 1), segs=48):
    us, vs = np.meshgrid(np.linspace(0, 2 * math.pi, segs + 1), np.linspace(0, math.pi, segs // 2 + 1))
    d = np.stack([np.sin(vs) * np.cos(us), np.cos(vs), np.sin(vs) * np.sin(us)], -1).reshape(-1, 3)
    bump = fbm(d * 2, 3, 3, seed)
    pts = d * r * np.array(squash) * (1 + 0.07 * bump)[:, None] + c
    idx = []
    W = segs + 1
    for j in range(segs // 2):
        for i in range(segs):
            a, b = j * W + i, j * W + i + 1
            c2, d2 = (j + 1) * W + i, (j + 1) * W + i + 1
            idx += [a, c2, b, b, c2, d2]
    nrm = vertex_normals_tri(pts, np.array(idx).reshape(-1, 3))
    # a small curly texture for the puff
    S = 256
    yy, xx = np.mgrid[0:S, 0:S] / S
    q = np.stack([xx * 6, yy * 3, np.zeros_like(xx)], -1).reshape(-1, 3)
    shade = (0.72 + 0.5 * fbm(q, 9, 3, seed)).reshape(S, S, 1)
    img = np.clip(np.array(col)[None, None] * shade, 0, 1)
    tex = g.image(Image.fromarray((img * 255).astype(np.uint8)), 'WEBP')
    mat = g.material({'name': 'hair-bun', 'pbrMetallicRoughness': {'baseColorTexture': {'index': tex}, 'metallicFactor': 0, 'roughnessFactor': 0.92}})
    uv = np.stack([us.ravel() / (2 * math.pi), vs.ravel() / math.pi], 1)
    g.mesh('bun', [g.prim(pts, nrm, uv, np.array(idx), mat)])


def vertex_normals_tri(P, tris):
    n = np.zeros_like(P)
    fn = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]])
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


if __name__ == '__main__':
    for tid, spec in TUTORS.items():
        if ONLY and tid not in ONLY:
            continue
        build(tid, spec)

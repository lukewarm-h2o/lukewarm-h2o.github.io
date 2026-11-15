"""Stromboli Garden asset kit. Run inside Blender: rebuilds every SG_ asset in the StromboliGarden collection.
Low-poly, flat-shaded, plain colour materials (one tile texture). Blender +Y is downhill (three.js -Z)."""
import bpy, bmesh, math, random, os
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
V = Vector
rr = random.uniform
PAL = {
    "blue": (0.07, 0.22, 0.56), "tire": (0.02, 0.02, 0.022), "glass": (0.45, 0.68, 0.80), "cream": (0.88, 0.86, 0.80),
    "hub": (0.55, 0.55, 0.55), "orange": (0.90, 0.36, 0.05), "lamp": (1.0, 0.92, 0.6), "chassis": (0.09, 0.09, 0.10),
    "tabby": (0.33, 0.25, 0.17), "tabby_dark": (0.10, 0.08, 0.06), "red": (0.7, 0.06, 0.04), "cat_light": (0.62, 0.55, 0.45),
    "white": (0.90, 0.88, 0.83), "lava": (0.07, 0.065, 0.065), "tread": (0.16, 0.15, 0.15), "wood": (0.28, 0.18, 0.10),
    "wood_light": (0.55, 0.42, 0.26), "cane": (0.62, 0.50, 0.32), "trunk": (0.30, 0.23, 0.16), "leaf": (0.12, 0.33, 0.10),
    "leaf_dark": (0.05, 0.19, 0.07), "leaf_light": (0.33, 0.50, 0.14), "cactus": (0.18, 0.40, 0.19), "terracotta": (0.60, 0.25, 0.13),
    "magenta": (0.72, 0.04, 0.24), "pink": (0.85, 0.25, 0.45), "lemon": (0.95, 0.80, 0.12), "date": (0.85, 0.45, 0.08),
    "boat_red": (0.62, 0.09, 0.05), "boat_blue": (0.07, 0.24, 0.58), "goat": (0.88, 0.85, 0.78), "goat_shade": (0.74, 0.70, 0.62),
    "horn": (0.33, 0.28, 0.22), "shutter_green": (0.06, 0.28, 0.18), "soil": (0.12, 0.09, 0.07),
    "hibiscus": (0.78, 0.04, 0.07), "plumbago": (0.42, 0.58, 0.92), "caper_leaf": (0.24, 0.40, 0.20), "petal_white": (0.93, 0.91, 0.88),
    "stamen": (0.50, 0.22, 0.62),
    "agave": (0.27, 0.42, 0.38), "broom": (0.22, 0.36, 0.11), "straw": (0.60, 0.52, 0.22), "pear_fruit": (0.62, 0.08, 0.22),
}

def tile_image():
    img = bpy.data.images.get("SG_tile")
    if img: return img
    img = bpy.data.images.new("SG_tile", 64, 64); px = []
    for y in range(64):
        for x in range(64):
            u, v = x - 31.5, y - 31.5; r = math.hypot(u, v)
            b = (abs(u) > 29.5 or abs(v) > 29.5 or 17 < r < 21 or r < 6 or (abs(abs(u) - abs(v)) < 1.8 and 21 < r < 34)
                 or math.hypot(abs(u) - 31.5, abs(v) - 31.5) < 9 or (9 < r < 12))
            px += [0.05, 0.16, 0.50, 1.0] if b else [0.90, 0.90, 0.86, 1.0]
    img.pixels = px
    img.filepath_raw = os.path.join(HERE, "textures", "tile.png"); img.file_format = "PNG"; img.save()
    return img

def material(name):
    m = bpy.data.materials.get("SG_" + name) or bpy.data.materials.new("SG_" + name)
    try: m.use_nodes = True
    except Exception: pass
    m.use_backface_culling = False            # exports as doubleSided: leaves, hulls and single quads show from both sides
    b = m.node_tree.nodes.get("Principled BSDF") if m.node_tree else None
    if name == "tile":
        m.diffuse_color = (0.45, 0.55, 0.75, 1)
        if b and not b.inputs["Base Color"].is_linked:
            t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = tile_image(); t.interpolation = "Closest"
            m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.5
        return m
    c = (*PAL[name], 1.0); m.diffuse_color = c
    if b:
        b.inputs["Base Color"].default_value = c
        b.inputs["Roughness"].default_value = 0.25 if name == "glass" else 0.85
    return m

def collection():
    col = bpy.data.collections.get("StromboliGarden") or bpy.data.collections.new("StromboliGarden")
    if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)
    return col

class Builder:
    def __init__(self): self.bm = bmesh.new(); self.mats = []
    def mi(self, name):
        if name not in self.mats: self.mats.append(name)
        return self.mats.index(name)
    def _paint(self, verts, mat):
        i = self.mi(mat)
        for f in {f for v in verts for f in v.link_faces}: f.material_index = i
        return verts
    def box(self, size, loc, mat, rot=None):
        M = Matrix.Translation(loc) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1))
        return self._paint(bmesh.ops.create_cube(self.bm, size=1, matrix=M)["verts"], mat)
    def cyl(self, r, depth, loc, mat, axis="X", r2=None, seg=12):
        R = {"X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(math.pi / 2, 4, "X"), "Z": Matrix.Identity(4)}[axis]
        return self._paint(bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2,
                                                 depth=depth, matrix=Matrix.Translation(loc) @ R)["verts"], mat)
    def ico(self, scale, loc, mat, sub=2, jitter=0.0):
        vs = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1, matrix=Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1)))["verts"]
        for v in vs: v.co += V((rr(-1, 1), rr(-1, 1), rr(-1, 1))) * jitter
        return self._paint(vs, mat)
    def quad(self, pts, mat, uvs=None):
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts]); f.material_index = self.mi(mat)
        if uvs:
            L = self.bm.loops.layers.uv.verify()
            for loop, uv in zip(f.loops, uvs): loop[L].uv = uv
        return f
    def loft(self, rings, mat, closed=True, caps=False):
        vr = [[self.bm.verts.new(p) for p in r] for r in rings]; n = len(rings[0])
        for i in range(len(vr) - 1):
            for j in range(n if closed else n - 1):
                f = self.bm.faces.new((vr[i][j], vr[i][(j + 1) % n], vr[i + 1][(j + 1) % n], vr[i + 1][j]))
                f.material_index = self.mi(mat(i, j) if callable(mat) else mat)
        if caps:
            for ring in (vr[0], vr[-1]):
                self.bm.faces.new(ring).material_index = self.mi(mat(0, 0) if callable(mat) else mat)
        return vr
    def tube(self, pts, radii, mat, seg=7, caps=True):
        pts = [V(p) for p in pts]; rings = []
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = V((1, 0, 0)) if abs(d.z) > 0.9 else V((0, 0, 1))
            u = d.cross(ref).normalized(); w = d.cross(u)
            r = radii[i] if isinstance(radii, (list, tuple)) else radii
            rings.append([p + r * (math.cos(k * 2 * math.pi / seg) * u + math.sin(k * 2 * math.pi / seg) * w) for k in range(seg)])
        return self.loft(rings, mat, closed=True, caps=caps)
    def leaf(self, base, ang, length, width, p0, p1, mat, segs=5, fold=0.18, blunt=False):
        d = V((math.cos(ang), math.sin(ang), 0)); side = V((-d.y, d.x, 0)); up = V((0, 0, 1)); pos = V(base); prev = None
        for s in range(segs + 1):
            t = s / segs
            w = width * ((math.sin(math.pi * (0.12 + 0.88 * t)) ** 0.6) if blunt else (0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.6) * 0.5)) * (1 - t ** 3))
            row = (pos - side * w / 2 + up * fold * w, pos.copy(), pos + side * w / 2 + up * fold * w)
            if prev:
                self.quad((prev[0], prev[1], row[1], row[0]), mat); self.quad((prev[1], prev[2], row[2], row[1]), mat)
            prev = row; p = math.radians(p0 + (p1 - p0) * t); pos = pos + (d * math.cos(p) + up * math.sin(p)) * (length / segs)
    def bloom(self, r, depth, loc, direction, mat, seg=5, r2=0.02):
        """A shallow cone opening along `direction`: reads as a flower from a few metres away."""
        R = V(direction).normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
        return self._paint(bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r2, radius2=r, depth=depth,
                                                 matrix=Matrix.Translation(V(loc) + V(direction).normalized() * depth / 2) @ R)["verts"], mat)
    def finish(self, name, parent=None, recalc=True):
        if recalc: bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for n in self.mats: me.materials.append(material(n))
        ob = bpy.data.objects.new(name, me); collection().objects.link(ob)
        if parent: ob.parent = parent
        return ob

# ---------------------------------------------------------------- assets
def truck():
    b = Builder()
    b.box((1.05, 2.55, 0.12), (0, 0.05, 0.34), "chassis")
    for v in b.box((1.2, 1.0, 0.52), (0, -0.75, 0.66), "blue"):
        if v.co.y < -1.2: v.co.x *= 0.74
    for v in b.box((1.16, 1.0, 0.6), (0, -0.75, 1.22), "blue"):
        if v.co.y < -1.2:
            v.co.x *= 0.74
            if v.co.z > 1.4: v.co.y += 0.30; v.co.x *= 1.12
        if v.co.z > 1.4: v.co.x *= 0.94
    b.box((0.74, 0.03, 0.46), (0, -1.118, 1.215), "glass", Matrix.Rotation(-math.atan2(0.30, 0.60), 4, "X"))
    for s in (-1, 1):
        b.box((0.03, 0.5, 0.36), (s * 0.572, -0.66, 1.24), "glass"); b.box((0.03, 0.08, 0.5), (s * 0.585, -0.30, 0.72), "chassis")
    b.box((1.14, 0.80, 0.05), (0, -0.62, 1.545), "cream")
    for v in b.box((0.62, 0.34, 0.40), (0, -1.38, 0.62), "blue"):
        if v.co.y < -1.5 and v.co.z > 0.7: v.co.z -= 0.14
    b.box((0.26, 0.56, 0.07), (0, -1.47, 0.44), "blue"); b.cyl(0.085, 0.06, (0, -1.56, 0.70), "lamp", "Y")
    b.box((1.0, 1.3, 0.16), (0, 0.62, 0.47), "chassis"); b.box((1.3, 1.46, 0.06), (0, 0.62, 0.58), "blue")
    for s in (-1, 1): b.box((0.05, 1.46, 0.34), (s * 0.625, 0.62, 0.77), "blue")
    b.box((1.3, 0.05, 0.34), (0, -0.085, 0.77), "blue"); b.box((1.3, 0.05, 0.34), (0, 1.325, 0.77), "blue")
    for s in (-1, 1):
        b.box((0.10, 0.03, 0.08), (s * 0.5, 1.355, 0.68), "red"); b.box((0.22, 0.58, 0.05), (s * 0.60, 0.78, 0.45), "blue")
    for (x, y) in ((0, -1.47), (-0.60, 0.78), (0.60, 0.78)):
        b.cyl(0.21, 0.13, (x, y, 0.21), "tire"); b.cyl(0.10, 0.15, (x, y, 0.21), "hub", seg=8)
    b.box((0.42, 0.42, 0.30), (0.25, 0.42, 0.76), "orange"); b.cyl(0.13, 0.42, (-0.3, 0.95, 0.82), "orange", "Z", r2=0.03, seg=8)
    t = b.finish("SG_Truck")
    c = Builder(); body = c.ico((0.25, 0.14, 0.125), (0, -0.62, 1.69), "tabby"); dark = c.mi("tabby_dark")
    for f in {f for v in body for f in v.link_faces}:
        ctr = f.calc_center_median()
        if ctr.z > 1.67 and math.sin(ctr.x * 55) > 0.35: f.material_index = dark
    c.ico((0.085, 0.08, 0.075), (0.235, -0.67, 1.79), "tabby", sub=1); c.ico((0.04, 0.03, 0.03), (0.255, -0.74, 1.765), "cat_light", sub=1)
    for dx in (-0.045, 0.045): c.cyl(0.032, 0.07, (0.235 + dx, -0.66, 1.875), "tabby", "Z", r2=0.004, seg=4)
    c.box((0.30, 0.045, 0.045), (-0.20, -0.755, 1.595), "tabby_dark", Matrix.Rotation(0.25, 4, "Z"))
    for dx in (0.10, 0.19): c.box((0.07, 0.06, 0.04), (dx, -0.76, 1.59), "cat_light")
    c.finish("SG_Cat", parent=t)
    return t

def boat(name, hull):
    b = Builder()
    st = [(-2.3, 0.03, 0.40, 0.98), (-1.7, 0.52, 0.10, 0.82), (-0.7, 0.84, 0.0, 0.70), (0.6, 0.84, 0.0, 0.70), (1.6, 0.64, 0.05, 0.74), (2.1, 0.40, 0.18, 0.82)]
    def ring(y, w, k, s):
        m = k + (s - k) * 0.62
        return [V((-w, y, s)), V((-w * 0.94, y, m)), V((-w * 0.5, y, k + 0.10)), V((0, y, k)), V((w * 0.5, y, k + 0.10)), V((w * 0.94, y, m)), V((w, y, s))]
    rings = [ring(*s) for s in st]
    b.loft(rings, lambda i, j: "white" if j in (0, 5) else hull, closed=False)
    b.bm.faces.new([b.bm.verts.new(p) for p in rings[-1]]).material_index = b.mi(hull)           # transom
    for i in range(1, 5):                                                                        # floor boards
        (y0, w0, k0, _), (y1, w1, k1, _) = st[i], st[i + 1] if i < 5 else st[i]
        if i < 4: b.quad((V((-w0 * 0.6, y0, k0 + 0.2)), V((w0 * 0.6, y0, k0 + 0.2)), V((w1 * 0.6, y1, k1 + 0.2)), V((-w1 * 0.6, y1, k1 + 0.2))), "wood_light")
    for y, w in ((-0.9, 0.80), (0.5, 0.82), (1.5, 0.64)): b.box((w * 1.86, 0.22, 0.05), (0, y, 0.52), "wood")
    b.box((0.07, 4.2, 0.10), (0, -0.1, 0.0), "wood"); b.box((0.07, 0.12, 0.5), (0, -2.3, 0.85), "wood")
    return b.finish(name, recalc=False)

def palm():
    b = Builder(); h = 6.5; pts = []; rad = []
    for k in range(9):
        t = k / 8; pts.append((0.6 * t * t, 0, h * t)); rad.append((0.30 - 0.11 * t) * (1.12 if k % 2 else 1.0))
    b.tube(pts, rad, "trunk", seg=7); top = V((0.6, 0, h))
    b.ico((0.34, 0.34, 0.4), top, "trunk", sub=1)
    for k in range(14):
        b.leaf(top, k * 2 * math.pi / 14 + rr(-0.15, 0.15), rr(2.7, 3.4), 0.75, rr(30, 65), rr(-75, -40), "leaf_dark" if k % 2 else "leaf", segs=5)
    for k in range(5):
        b.leaf(top, k * 2 * math.pi / 5 + 0.3, rr(1.8, 2.3), 0.55, 80, rr(10, 35), "leaf", segs=4)
    for k in range(4):
        a = k * 1.6 + 0.4; b.ico((0.17, 0.17, 0.26), top + V((math.cos(a) * 0.42, math.sin(a) * 0.42, -0.45)), "date", sub=1)
    return b.finish("SG_Palm", recalc=False)

def cactus():
    b = Builder(); b.tube([(0, 0, 0), (0, 0, 1.6), (0, 0, 3.3)], [0.19, 0.17, 0.13], "cactus", seg=6)
    for k in range(6):
        a = k * 1.05 + rr(-0.2, 0.2); hz = rr(0.5, 1.7); out = rr(0.45, 0.75); c, s = math.cos(a) * out, math.sin(a) * out
        b.tube([(0, 0, hz), (c * 0.9, s * 0.9, hz + 0.12), (c, s, hz + 0.45), (c, s, hz + rr(1.3, 2.5))], [0.11, 0.12, 0.12, 0.09], "cactus", seg=6)
    return b.finish("SG_Cactus")

def banana():
    b = Builder(); b.tube([(0, 0, 0), (0.03, 0, 0.9), (0, 0, 1.7)], [0.16, 0.13, 0.09], "leaf_light", seg=7)
    for k in range(8):
        b.leaf((0, 0, 1.55), k * 2 * math.pi / 8 + rr(-0.2, 0.2), rr(1.9, 2.6), 0.62, rr(45, 78), rr(-45, -5), "leaf" if k % 3 else "leaf_light", segs=5, fold=0.12, blunt=True)
    return b.finish("SG_Banana", recalc=False)

def citrus():
    b = Builder(); b.tube([(0, 0, 0), (0.04, 0, 0.7), (0, 0.03, 1.4)], [0.10, 0.08, 0.07], "trunk", seg=6)
    can = b.ico((1.25, 1.25, 1.0), (0, 0, 2.15), "leaf_dark", sub=2, jitter=0.10); li = b.mi("leaf")
    for f in {f for v in can for f in v.link_faces}:
        if random.random() < 0.3: f.material_index = li
    for k in range(11):
        a = rr(0, 6.28); e = rr(-0.7, 0.5)
        b.ico((0.09, 0.09, 0.115), (math.cos(a) * math.cos(e) * 1.24, math.sin(a) * math.cos(e) * 1.24, 2.15 + math.sin(e) * 1.0), "lemon", sub=1)
    return b.finish("SG_Citrus")

def pot():
    b = Builder(); b.tube([(0, 0, 0), (0, 0, 0.5), (0, 0, 0.58)], [0.20, 0.33, 0.36], "terracotta", seg=10); b.cyl(0.31, 0.03, (0, 0, 0.57), "soil", "Z", seg=10)
    b.ico((0.42, 0.42, 0.30), (0, 0, 0.85), "leaf", sub=1, jitter=0.05)
    for k in range(7):
        a = k * 0.9; b.ico((0.09, 0.09, 0.07), (math.cos(a) * rr(0.1, 0.33), math.sin(a) * rr(0.1, 0.33), rr(1.0, 1.14)), "pink", sub=1)
    return b.finish("SG_Pot")

def bougainvillea():
    b = Builder(); b.tube([(0, 0, 0), (0.18, 0.05, 0.9), (-0.05, 0, 1.8), (0.1, 0, 2.5)], [0.09, 0.07, 0.06, 0.04], "trunk", seg=5)
    for k in range(11):
        r = rr(0.4, 0.75); b.ico((r, r, r * 0.8), (rr(-0.9, 0.9), rr(-1.5, 1.5), rr(2.3, 3.2)), "magenta" if k % 4 else "pink", sub=1, jitter=0.08)
    for k in range(4):
        r = rr(0.35, 0.55); b.ico((r, r, r * 0.8), (rr(-0.8, 0.8), rr(-1.4, 1.4), rr(2.1, 2.6)), "leaf_dark", sub=1, jitter=0.06)
    return b.finish("SG_Bougainvillea")

def stair():
    # 22 steps dropping 4 m over 7 m along +Y, 3.2 m wide; tiled risers, lava treads, sloped white parapets
    b = Builder(); n = 22; rise = 4 / n; run = 7 / n; w = 1.6
    for i in range(n):
        y0, y1, z0, z1 = i * run, (i + 1) * run, -i * rise, -(i + 1) * rise
        b.quad((V((w, y0, z1)), V((-w, y0, z1)), V((-w, y0, z0)), V((w, y0, z0))), "tile", [(0, 0), (8, 0), (8, 1), (0, 1)])   # riser faces downhill (+Y)
        b.quad((V((-w, y0, z1)), V((w, y0, z1)), V((w, y1, z1)), V((-w, y1, z1))), "tread")                                      # tread faces up
    for s in (-1, 1):
        x0, x1 = s * w, s * (w + 0.38)
        prof = lambda x: [V((x, -0.3, 0.95)), V((x, 7.3, -4 + 0.95)), V((x, 7.3, -4.4)), V((x, -0.3, -4.4))]
        b.loft([prof(x0), prof(x1)], "white", closed=True, caps=True)
    return b.finish("SG_Stair", recalc=False)

def bench():
    b = Builder(); b.box((5.0, 1.0, 0.48), (0, 0, 0.24), "white"); b.box((5.56, 0.28, 1.15), (0, 0.64, 0.575), "white")
    for s in (-1, 1): b.box((0.28, 1.28, 0.80), (s * 2.64, 0.0, 0.40), "white")
    b.quad((V((-2.5, -0.5, 0.485)), V((2.5, -0.5, 0.485)), V((2.5, 0.5, 0.485)), V((-2.5, 0.5, 0.485))), "tile", [(0, 0), (15, 0), (15, 3), (0, 3)])
    return b.finish("SG_Bench", recalc=False)

def pergola():
    b = Builder()
    for x in (-2.2, 2.2):
        for y in (-4, 4):
            b.tube([(x, y, 0), (x, y, 1.4), (x, y, 2.7)], [0.31, 0.29, 0.26], "white", seg=10); b.box((0.75, 0.75, 0.16), (x, y, 2.78), "white")
        b.box((0.2, 8.7, 0.22), (x, 0, 2.97), "wood")
    for k in range(9): b.box((5.1, 0.12, 0.14), (0, -4 + k, 3.15), "wood")
    b.box((4.8, 8.4, 0.05), (0, 0, 3.25), "cane")
    return b.finish("SG_Pergola")

def opening(b, x, y, z, w, h, mat, arch=False):
    b.box((w, 0.10, h), (x, y, z + h / 2), mat)
    if arch: b.cyl(w / 2, 0.10, (x, y, z + h), mat, "Y", seg=12)
    b.box((w + 0.3, 0.06, 0.12), (x, y + 0.02, z - 0.06), "white")

def house_a():
    b = Builder(); b.box((8, 7, 3.6), (0, 0, 1.8), "white"); b.box((8.25, 7.25, 0.28), (0, 0, 3.62), "white"); b.box((7.6, 6.6, 0.3), (0, 0, 3.64), "lava")
    f = -3.53; opening(b, -1.6, f, 0, 1.1, 2.0, "blue", arch=True); opening(b, 1.7, f, 1.0, 1.0, 1.2, "blue"); opening(b, -3.3, f, 1.2, 0.7, 0.9, "blue")
    b.box((8, 3.6, 0.3), (0, -5.3, 0.15), "white")                                   # terrace
    for x in (-3.6, 0, 3.6):
        b.tube([(x, -6.8, 0.3), (x, -6.8, 3.0)], [0.32, 0.27], "white", seg=10); b.box((0.8, 0.8, 0.16), (x, -6.8, 3.08), "white")
        b.box((0.16, 3.5, 0.18), (x, -5.15, 3.25), "wood")
    b.box((7.9, 0.18, 0.2), (0, -6.8, 3.25), "wood")
    for x in (-1.8, 1.8): b.box((2.7, 0.5, 0.45), (x, -6.8, 0.52), "white")           # bisuolo benches
    b.box((0.9, 0.9, 1.0), (2.8, 2.2, 4.1), "white")
    return b.finish("SG_House_A")

def house_b():
    b = Builder(); b.box((7, 6, 3.2), (0, 0, 1.6), "white"); b.box((7.25, 6.25, 0.26), (0, 0, 3.22), "white")
    b.box((4.5, 4.5, 2.8), (-1.25, 0.75, 4.6), "white"); b.box((4.75, 4.75, 0.26), (-1.25, 0.75, 6.0), "white")
    f = -3.03; opening(b, 1.6, f, 0, 1.0, 2.0, "shutter_green", arch=True); opening(b, -1.6, f, 1.0, 0.9, 1.1, "shutter_green")
    opening(b, -1.25, -1.53, 3.2, 0.9, 1.9, "shutter_green"); opening(b, -2.7, -1.53, 4.0, 0.7, 0.9, "shutter_green")
    for i in range(16):                                                              # outside stair up to the roof terrace
        b.box((1.1, 0.34, 0.2 * (i + 1)), (4.05, -2.8 + i * 0.34, 0.1 * (i + 1)), "white")
    b.box((0.22, 5.9, 0.8), (4.72, 0, 0.4 + 1.6), "white", Matrix.Rotation(math.atan2(3.2, 5.44), 4, "X"))
    for x in (0.4, 3.2): b.box((0.25, 0.25, 0.9), (x, -2.85, 3.65), "white")
    b.box((3.1, 0.2, 0.2), (1.8, -2.85, 4.1), "white")
    return b.finish("SG_House_B")

def goat():
    b = Builder()
    for v in b.box((0.44, 1.05, 0.46), (0, 0, 0.80), "goat"):
        if v.co.z > 0.9: v.co.x *= 0.7
    for v in b.box((0.50, 1.0, 0.34), (0, 0.02, 0.56), "goat_shade"):
        if v.co.z < 0.5: v.co.x *= 1.15                                              # shaggy skirt of long hair
    b.box((0.2, 0.34, 0.4), (0, -0.58, 0.98), "goat", Matrix.Rotation(-0.5, 4, "X"))
    for v in b.box((0.19, 0.38, 0.2), (0, -0.80, 1.10), "goat", Matrix.Rotation(0.35, 4, "X")):
        if v.co.y < -0.9: v.co.x *= 0.6
    b.cyl(0.05, 0.2, (0, -0.86, 0.93), "goat_shade", "Z", r2=0.0, seg=4)
    for s in (-1, 1):
        b.tube([(s * 0.06, -0.70, 1.2), (s * 0.10, -0.55, 1.42), (s * 0.17, -0.34, 1.46), (s * 0.25, -0.20, 1.38)], [0.04, 0.035, 0.025, 0.008], "horn", seg=5)
        b.box((0.14, 0.05, 0.07), (s * 0.15, -0.68, 1.14), "goat_shade")
        for y in (-0.38, 0.40):
            b.box((0.09, 0.09, 0.5), (s * 0.14, y, 0.28), "goat"); b.box((0.10, 0.10, 0.07), (s * 0.14, y, 0.035), "chassis")
    b.box((0.08, 0.14, 0.08), (0, 0.56, 0.98), "goat", Matrix.Rotation(-0.6, 4, "X"))
    return b.finish("SG_Goat")

def wall():
    b = Builder(); b.box((0.58, 4, 0.5), (0, 0, 0.25), "lava"); b.box((0.45, 4, 1.9), (0, 0, 1.45), "white"); b.cyl(0.26, 4, (0, 0, 2.4), "white", "Y", seg=8)
    return b.finish("SG_Wall")

def rock(name):
    b = Builder()
    for v in b.ico((1.0, 0.8, 0.6), (0, 0, 0.3), "lava", sub=2, jitter=0.14): v.co.z = max(v.co.z, 0.0)
    return b.finish(name)

# ---- filler plants (kept very light: these are instanced by the hundred) ----
def _pad(b, base, rz, lean, s, depth):
    R = Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(lean, 4, "Y"); up = R @ V((0, 0, 1)); c = V(base) + up * 0.45 * s
    b._paint(bmesh.ops.create_icosphere(b.bm, subdivisions=1, radius=1, matrix=Matrix.Translation(c) @ R @ Matrix.Diagonal((0.33 * s, 0.08 * s, 0.47 * s, 1)))["verts"], "cactus")
    tip = c + up * 0.40 * s
    if depth > 0:
        for _ in range(random.choice((1, 2, 2))): _pad(b, tip - up * 0.06, rz + rr(-1.3, 1.3), rr(-0.75, 0.75), s * rr(0.72, 0.92), depth - 1)
    elif random.random() < 0.7: b.ico((0.07, 0.07, 0.10), tip, "pear_fruit", sub=1)

def prickly_pear():
    b = Builder()
    for k in range(3): _pad(b, (rr(-0.25, 0.25), rr(-0.25, 0.25), -0.05), k * 2.1 + rr(-0.4, 0.4), rr(-0.35, 0.35), rr(0.9, 1.15), 2)
    return b.finish("SG_Prickly_Pear")

def agave():
    b = Builder()
    for k in range(15):
        p0 = rr(18, 80); b.leaf((0, 0, 0.08), k * 2.4 + rr(-0.2, 0.2), rr(0.75, 1.15), 0.24, p0, p0 - rr(15, 35), "agave", segs=2, fold=0.3)
    return b.finish("SG_Agave", recalc=False)

def broom():
    b = Builder(); b.ico((0.9, 0.9, 0.62), (0, 0, 0.55), "broom", sub=1, jitter=0.14); b.ico((0.55, 0.55, 0.5), (0.35, 0.2, 0.95), "broom", sub=1, jitter=0.1)
    for k in range(13):
        a = rr(0, 6.28); e = rr(0.1, 1.4); b.cyl(0.11, 0.2, (math.cos(a) * math.cos(e) * 0.9, math.sin(a) * math.cos(e) * 0.9, 0.6 + math.sin(e) * 0.66), "lemon", "Z", r2=0.0, seg=3)
    return b.finish("SG_Broom")

def grass_tuft():
    b = Builder()
    for k in range(9):
        p0 = rr(58, 88); b.leaf((rr(-0.12, 0.12), rr(-0.12, 0.12), 0), k * 0.7 + rr(-0.3, 0.3), rr(0.5, 1.0), 0.08, p0, p0 - rr(30, 75), "straw" if k % 3 else "leaf_light", segs=2, fold=0.1)
    return b.finish("SG_Grass_Tuft", recalc=False)

# ---- flower-bed plants for the garden detour ----
def _on_dome(cx, cy, cz, rx, ry, rz):
    a = rr(0, 6.28); e = rr(0.05, 1.35); d = V((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
    return V((cx + d.x * rx, cy + d.y * ry, cz + d.z * rz)), d

def hibiscus():
    b = Builder(); b.tube([(0, 0, 0), (0.05, 0, 0.5), (0, 0.04, 0.9)], [0.07, 0.06, 0.05], "trunk", seg=5)
    b.ico((0.85, 0.85, 0.75), (0, 0, 1.15), "leaf_dark", sub=2, jitter=0.09); b.ico((0.55, 0.55, 0.5), (0.25, -0.1, 1.85), "leaf", sub=1, jitter=0.07)
    for k in range(11):
        p, d = _on_dome(0, 0, 1.15, 0.86, 0.86, 0.8)
        b.bloom(0.17, 0.10, p, d, "hibiscus"); b.bloom(0.025, 0.16, p + d * 0.04, d, "lemon", seg=3, r2=0.02)
    return b.finish("SG_Hibiscus")

def plumbago():
    b = Builder()
    for c, sc in (((0, 0, 0.75), (1.0, 0.8, 0.75)), ((0.55, 0.3, 1.05), (0.7, 0.6, 0.6)), ((-0.6, -0.2, 0.95), (0.7, 0.65, 0.6))):
        b.ico(sc, c, "leaf", sub=1, jitter=0.1)
    for k in range(20):
        p, d = _on_dome(0, 0, 0.8, 1.15, 0.9, 0.85)
        b.ico((0.13, 0.13, 0.11), p, "plumbago", sub=1, jitter=0.02)
    return b.finish("SG_Plumbago")

def caper():
    b = Builder(); b.ico((1.0, 0.9, 0.32), (0, 0, 0.22), "caper_leaf", sub=1, jitter=0.07); b.ico((0.7, 0.6, 0.28), (0.5, -0.45, 0.05), "caper_leaf", sub=1, jitter=0.06)
    for k in range(9):
        p, d = _on_dome(0.1, -0.1, 0.2, 0.95, 0.85, 0.34)
        b.bloom(0.11, 0.05, p, d, "petal_white", seg=4); b.bloom(0.05, 0.13, p + d * 0.03, d, "stamen", seg=4, r2=0.01)
    return b.finish("SG_Caper")

def build():
    random.seed(11)
    col = collection()
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    for me in [m for m in bpy.data.meshes if m.name.startswith("SG_") and m.users == 0]: bpy.data.meshes.remove(me)
    roots = [truck(), boat("SG_Boat_Red", "boat_red"), boat("SG_Boat_Blue", "boat_blue"), goat(), pot(), rock("SG_Rock_A"), rock("SG_Rock_B"),
             cactus(), banana(), citrus(), bougainvillea(), palm(), wall(), bench(), stair(), pergola(), house_a(), house_b(),
             prickly_pear(), agave(), broom(), grass_tuft(),
             hibiscus(), plumbago(), caper()]
    x = 0.0
    for o in roots:                                   # lay the kit out in a row for viewing
        w = max(o.dimensions.x, 1.5); x += w / 2; o.location.x = x; x += w / 2 + 1.5
    return roots

def export_all(out_dir):
    os.makedirs(out_dir, exist_ok=True); done = {}
    for o in [o for o in collection().objects if o.parent is None]:
        keep = o.location.copy(); o.location = (0, 0, 0)
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
        for c in o.children: c.select_set(True)
        bpy.context.view_layer.objects.active = o
        path = os.path.join(out_dir, o.name[3:].lower() + ".glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
        o.location = keep; done[o.name] = os.path.getsize(path)
    return done

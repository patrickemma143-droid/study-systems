# Export Z-Anatomy (CC BY-SA 4.0, from BodyParts3D) into one Draco-compressed glTF per body system,
# decimated for phones, plus a JSON catalogue of every structure and its description.
import bpy, bmesh, json, os, re, sys, math

SRC = "unz/Z-Anatomy/Startup.blend"
OUT = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "web"
ONLY = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
os.makedirs(OUT, exist_ok=True)

# web system id -> (collection name, triangle budget, colour)
SYSTEMS = {
    "skeleton": ("1: Skeletal system", 220_000, "#e8dcc2"),
    "insertions": ("2: Muscular insertions", 40_000, "#c8553d"),
    "joints": ("3: Joints", 60_000, "#b9c7d6"),
    "muscles": ("4: Muscular system", 320_000, "#b5483f"),
    "vessels": ("5: Cardiovascular system", 140_000, "#c0392b"),
    "lymph": ("6: Lymphoid organs", 50_000, "#8bc34a"),
    "nervous": ("7: Nervous system & Sense organs", 170_000, "#f2c94c"),
    "viscera": ("8: Visceral systems", 90_000, "#d98e73"),
}

bpy.ops.wm.open_mainfile(filepath=SRC)
src_scene = bpy.context.scene
deps = bpy.context.evaluated_depsgraph_get()
global_deps = deps

def tris_of(me):
    return sum(max(0, len(p.vertices) - 2) for p in me.polygons)

def clean_name(n):
    side = None
    m = re.search(r"\.(l|r|ol|or|il|ir)$", n)
    base = n
    if m:
        side = {"l": "left", "r": "right", "ol": "left", "or": "right", "il": "left", "ir": "right"}[m.group(1)]
        base = n[: m.start()]
    base = re.sub(r"\.\d{3}$", "", base).strip()
    part = base.startswith("(") and base.endswith(")")
    return base.strip("() ").strip(), side, part

# descriptions from the text blocks, keyed by the text block's name
descriptions = {}
for t in bpy.data.texts:
    body = t.as_string().strip()
    lines = [l.strip() for l in body.split("\n")]
    # first non-empty line is the upper-case title; the rest is the description
    rest = [l for l in lines[1:] if l]
    if rest:
        descriptions[t.name.strip("() ").strip().lower()] = "\n".join(rest)[:4000]

catalogue = {"systems": {}, "structures": {}}
TOP = {c for c, *_ in SYSTEMS.values()}

for sid, (cname, budget, colour) in SYSTEMS.items():
    if ONLY and sid not in ONLY:
        continue
    col = bpy.data.collections.get(cname)
    if not col:
        print("missing", cname)
        continue
    objs = [o for o in col.all_objects if o.type in ("MESH", "CURVE") and not re.search(r"\.(j|t|g)$", o.name)]
    # landmarks: point-only meshes ("Foramen magnum.j") become labelled points on the model
    for o in col.all_objects:
        if o.type == "MESH" and len(o.data.polygons) == 0 and len(o.data.vertices) > 0:
            mw = o.matrix_world
            pts = [mw @ v.co for v in o.data.vertices]
            cx = sum(p.x for p in pts) / len(pts); cy = sum(p.y for p in pts) / len(pts); cz = sum(p.z for p in pts) / len(pts)
            name, side, part = clean_name(re.sub(r"\.j$", "", o.name))
            if name.lower().startswith(("skeletal system", "axial skeleton", "appendicular skeleton")):
                continue
            catalogue.setdefault("landmarks", []).append({
                "name": name, "side": side, "system": sid,
                # glTF is Y-up: (x, z, -y)
                "p": [round(cx, 4), round(cz, 4), round(-cy, 4)],
                "groups": sorted({c.name for c in o.users_collection} - TOP)[:6],
            })
            d = descriptions.get(name.lower())
            if d:
                catalogue.setdefault("descriptions", {})[name.lower()] = d
    # build evaluated meshes (curves become tubes, modifiers applied)
    scene = bpy.data.scenes.new(f"export-{sid}")
    bpy.context.window.scene = scene if bpy.context.window else scene
    built = []
    total = 0
    # vessels and nerves are curves: make their tubes coarse instead of decimating them afterwards
    curves = [o for o in objs if o.type == "CURVE"]
    for o in curves:
        o.data.resolution_u = min(o.data.resolution_u, 3)
        o.data.bevel_resolution = min(o.data.bevel_resolution, 1)
        if o.data.bevel_object:
            o.data.bevel_object.data.resolution_u = min(o.data.bevel_object.data.resolution_u, 2)
    if curves:
        bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        try:
            if sid == "insertions" and o.type == "MESH":
                me = o.data.copy()  # their generator modifiers explode in size; the base mesh is enough
            else:
                ev = o.evaluated_get(deps)
                me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=deps)
        except Exception as e:
            continue
        if not me or len(me.polygons) == 0:
            continue
        me.materials.clear()
        n = tris_of(me)
        total += n
        built.append((o, me, n))
    ratio = min(1.0, budget / max(1, total))
    print(f"{sid}: {len(built)} parts, {total} tris -> ratio {ratio:.3f}", flush=True)
    for idx, (o, me, n) in enumerate(built):
        # decimate each part, keeping very small parts intact so nothing disappears
        target = ratio if n * ratio > 60 else min(1.0, 60 / max(1, n))
        if target < 0.999:
            bm = bmesh.new()
            bm.from_mesh(me)
            bmesh.ops.triangulate(bm, faces=bm.faces[:])
            bm.to_mesh(me)
            bm.free()
        # short unique node ids keep the files small; names live in the catalogue
        ob = bpy.data.objects.new(f"{sid[:2]}{idx}", me)
        ob.matrix_world = o.matrix_world.copy()
        scene.collection.objects.link(ob)
        if target < 0.999:
            mod = ob.modifiers.new("dec", "DECIMATE")
            mod.ratio = target
            mod.use_collapse_triangulate = True
        name, side, part = clean_name(o.name)
        groups = sorted({c.name for c in o.users_collection} - TOP - {"Muscles", "Bonus collection"})
        catalogue["structures"][f"{sid[:2]}{idx}"] = {
            "name": name,
            "side": side,
            "part": part,
            "system": sid,
            "groups": groups[:12],
            "superficial": any(c.name == "Superficial muscles" for c in o.users_collection),
        }
        if name.lower() not in catalogue.get("_desc_done", set()):
            d = descriptions.get(name.lower())
            if d:
                catalogue.setdefault("descriptions", {})[name.lower()] = d
    # export
    for ob in bpy.data.objects:
        ob.select_set(False)
    for ob in scene.collection.objects:
        ob.select_set(True)
    path = os.path.join(OUT, f"{sid}.glb")
    with bpy.context.temp_override(scene=scene):
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_materials="NONE",
            export_normals=True,
            export_texcoords=False,
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=7,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=8,
            export_yup=True,
        )
    size = os.path.getsize(path)
    catalogue["systems"][sid] = {"collection": cname, "colour": colour, "parts": len(built), "bytes": size}
    print(f"  wrote {path}: {size/1e6:.2f} MB", flush=True)
with open(os.path.join(OUT, "catalogue.json" if not ONLY else f"catalogue-{'-'.join(ONLY)}.json"), "w") as f:
    json.dump(catalogue, f)
print("done", len(catalogue["structures"]), "structures,", len(catalogue.get("descriptions", {})), "descriptions")

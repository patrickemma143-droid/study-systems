# Landmarks are two-point lines in Z-Anatomy: one end on the surface, one where the label text sits.
# Export both ends (with modifiers such as hooks applied) for every system.
import bpy, json, re, sys
OUT = sys.argv[sys.argv.index("--out") + 1]
SYSTEMS = {"skeleton": "1: Skeletal system", "insertions": "2: Muscular insertions", "joints": "3: Joints", "muscles": "4: Muscular system",
           "vessels": "5: Cardiovascular system", "lymph": "6: Lymphoid organs", "nervous": "7: Nervous system & Sense organs", "viscera": "8: Visceral systems"}
TOP = set(SYSTEMS.values())
bpy.ops.wm.open_mainfile(filepath="unz/Z-Anatomy/Startup.blend")
deps = bpy.context.evaluated_depsgraph_get()
def clean_name(n):
    side = None
    m = re.search(r"\.(l|r|ol|or|il|ir)$", n)
    base = n
    if m:
        side = {"l": "left", "r": "right", "ol": "left", "or": "right", "il": "left", "ir": "right"}[m.group(1)]
        base = n[: m.start()]
    base = re.sub(r"\.\d{3}$", "", base).strip()
    return base.strip("() ").strip(), side
out = []
for sid, cname in SYSTEMS.items():
    col = bpy.data.collections.get(cname)
    if not col: continue
    for o in col.all_objects:
        if o.type != "MESH" or len(o.data.polygons) or not len(o.data.vertices): continue
        name, side = clean_name(re.sub(r"\.j$", "", o.name))
        if name.lower().startswith(("skeletal system", "axial skeleton", "appendicular skeleton")): continue
        ev = o.evaluated_get(deps)
        me = ev.to_mesh()
        mw = ev.matrix_world
        pts = [mw @ v.co for v in me.vertices]
        ev.to_mesh_clear()
        if not pts: continue
        # glTF is Y-up: (x, z, -y)
        ends = [[round(p.x, 4), round(p.z, 4), round(-p.y, 4)] for p in (pts[0], pts[-1])]
        out.append({"name": name, "side": side, "system": sid, "p": ends[0], "q": ends[1],
                    "groups": sorted({c.name for c in o.users_collection} - TOP)[:6]})
json.dump(out, open(OUT, "w"))
print("landmarks", len(out))

// Whether this device can show the 3D tutor (checked once, without loading three.js).
let ok: boolean | null = null;
export function webglOk() {
  if (ok === null) {
    try {
      const c = document.createElement('canvas');
      ok = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      ok = false;
    }
  }
  return ok;
}

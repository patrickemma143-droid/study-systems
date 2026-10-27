// What the student writes on the whiteboard: freehand strokes in board coordinates.
export interface InkStroke {
  id: string;
  tool: 'pen' | 'marker';
  color: string;
  /** line width in board pixels */
  w: number;
  /** x, y, x, y … in board pixels (one decimal) */
  pts: number[];
}

export const INK_COLOURS = ['#1f2a44', '#2459d6', '#d23a3a', '#14915f', '#f2c230'];

/** Keep only well-formed strokes, within sensible size limits. */
export function cleanInk(raw: unknown): InkStroke[] {
  if (!Array.isArray(raw)) return [];
  const out: InkStroke[] = [];
  let total = 0;
  for (const s of raw.slice(0, 600)) {
    if (!s || typeof s !== 'object') continue;
    const pts = Array.isArray((s as any).pts) ? (s as any).pts.slice(0, 6000).map(Number).filter((n: number) => Number.isFinite(n) && Math.abs(n) < 1e6) : [];
    if (pts.length < 2) continue;
    if (pts.length % 2) pts.pop();
    total += pts.length;
    if (total > 120_000) break;
    const colour = String((s as any).color || '');
    out.push({
      id: String((s as any).id || '').slice(0, 24) || Math.random().toString(36).slice(2, 10),
      tool: (s as any).tool === 'marker' ? 'marker' : 'pen',
      color: /^#[0-9a-f]{6}$/i.test(colour) ? colour : INK_COLOURS[0],
      w: Math.max(1, Math.min(40, Number((s as any).w) || 3)),
      pts: pts.map((n: number) => Math.round(n * 10) / 10),
    });
  }
  return out;
}

/** A smooth SVG path through the points. */
export function inkPath(pts: number[]): string {
  if (pts.length < 4) return pts.length === 2 ? `M${pts[0]},${pts[1]} l0.1,0` : '';
  let d = `M${pts[0]},${pts[1]}`;
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2;
    const my = (pts[i + 1] + pts[i + 3]) / 2;
    d += ` Q${pts[i]},${pts[i + 1]} ${mx},${my}`;
  }
  d += ` L${pts[pts.length - 2]},${pts[pts.length - 1]}`;
  return d;
}

// A tiny, safe maths parser for whiteboard graphs: y = f(x). No eval — only numbers, x, pi, e,
// + − × ÷ ^, brackets, implicit multiplication (2x, 3(x+1)) and a few functions.

type Fn = (x: number) => number;
const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
};

export function compile(src: string): Fn | null {
  const s = src.toLowerCase().replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/²/g, '^2').replace(/³/g, '^3').replace(/^y=/, '');
  let i = 0;
  const peek = () => s[i];
  const fail = () => {
    throw new Error('bad');
  };
  // expr := term (('+'|'-') term)*
  function expr(): Fn {
    let left = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const a = left;
      const b = term();
      left = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  }
  // term := power (('*'|'/'|implicit) power)*
  function term(): Fn {
    let left = unary();
    for (;;) {
      const c = peek();
      if (c === '*' || c === '/') {
        i++;
        const a = left;
        const b = unary();
        left = c === '*' ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (c && /[0-9a-z(.]/.test(c)) {
        const a = left;
        const b = unary();
        left = (x) => a(x) * b(x);
      } else return left;
    }
  }
  function unary(): Fn {
    if (peek() === '-') {
      i++;
      const a = unary();
      return (x) => -a(x);
    }
    if (peek() === '+') {
      i++;
      return unary();
    }
    return power();
  }
  // power := atom ('^' unary)?   (right-associative)
  function power(): Fn {
    const base = atom();
    if (peek() === '^') {
      i++;
      const ex = unary();
      return (x) => Math.pow(base(x), ex(x));
    }
    return base;
  }
  function atom(): Fn {
    const c = peek();
    if (c === '(') {
      i++;
      const e = expr();
      if (s[i++] !== ')') fail();
      return e;
    }
    const num = s.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/);
    if (num) {
      i += num[0].length;
      const v = Number(num[0]);
      return () => v;
    }
    const word = s.slice(i).match(/^[a-z]+/);
    if (word) {
      const w = word[0];
      for (const name of Object.keys(FUNCS)) {
        if (w.startsWith(name) && s[i + name.length] === '(') {
          i += name.length;
          const arg = atom();
          const f = FUNCS[name];
          return (x) => f(arg(x));
        }
      }
      if (w.startsWith('pi')) {
        i += 2;
        return () => Math.PI;
      }
      if (w[0] === 'x') {
        i += 1;
        return (x) => x;
      }
      if (w[0] === 'e') {
        i += 1;
        return () => Math.E;
      }
    }
    return fail();
  }
  try {
    const f = expr();
    if (i !== s.length) return null;
    f(1); // throws early on nonsense
    return f;
  } catch {
    return null;
  }
}

/** Points of y = f(x) as an SVG path in a w×h box, with the y range fitted to the curve. */
export function plot(src: string, xmin: number, xmax: number, w: number, h: number, pad = 22) {
  const f = compile(src);
  if (!f) return null;
  const n = 160;
  const pts: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const x = xmin + ((xmax - xmin) * k) / n;
    const y = f(x);
    if (Number.isFinite(y)) pts.push([x, y]);
  }
  if (pts.length < 2) return null;
  const ys = pts.map((p) => p[1]).sort((a, b) => a - b);
  // ignore extreme spikes (tan, 1/x) when fitting the y range
  let ymin = ys[Math.floor(ys.length * 0.03)];
  let ymax = ys[Math.ceil(ys.length * 0.97) - 1];
  if (ymin > 0) ymin = Math.min(0, ymin - (ymax - ymin) * 0.1);
  if (ymax < 0) ymax = Math.max(0, ymax + (ymax - ymin) * 0.1);
  if (ymax - ymin < 1e-9) {
    ymin -= 1;
    ymax += 1;
  }
  const sx = (x: number) => pad + ((x - xmin) / (xmax - xmin)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - ((y - ymin) / (ymax - ymin)) * (h - 2 * pad);
  let d = '';
  let pen = false;
  for (const [x, y] of pts) {
    if (y < ymin - (ymax - ymin) || y > ymax + (ymax - ymin)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(Math.max(ymin, Math.min(ymax, y))).toFixed(1)}`;
    pen = true;
  }
  return { d, x0: xmin <= 0 && xmax >= 0 ? sx(0) : null, y0: ymin <= 0 && ymax >= 0 ? sy(0) : null, xmin, xmax, ymin, ymax, sx, sy };
}

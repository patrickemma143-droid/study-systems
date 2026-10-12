// Guard: a React effect must return nothing or a cleanup function.
// `useEffect(() => someCall(), …)` returns whatever someCall returns; newer browsers make
// calls like window.scrollTo return a Promise, which React then tries to call and crashes.
import fs from 'node:fs';
import path from 'node:path';

const bad = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f.name)) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        // allowed: `useEffect(() => {` and `useEffect(() => () => …` (returns a cleanup function)
        if (/use(Layout)?Effect\(\s*\(\)\s*=>\s*(?!\{|\(\)\s*=>)\S/.test(line)) bad.push(`${p}:${i + 1}: ${line.trim()}`);
      });
    }
  }
};
walk('src');
if (bad.length) {
  console.error('Effects must use a { block } body so they never return a value:\n' + bad.join('\n'));
  process.exit(1);
}
console.log('Effects check passed.');

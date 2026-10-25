// Turn OpenStax CNXML books into chapter text blocks for the Charis Study library seed (seed/books).
// Needs: npm i -D htmlparser2, and shallow clones of github.com/openstax/osbooks-* in one folder.
// Usage: node extract.mjs <osbooks dir> <out dir>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseDocument } from 'htmlparser2';

const [, , SRC, OUT] = process.argv;

// book file → library details. Only books whose source says CC BY-NC-SA 4.0 or CC BY 4.0.
const BOOKS = [
  { repo: 'osbooks-anatomy-physiology', file: 'anatomy-and-physiology-2e', faculty: 'medicine', short: 'Anatomy & Physiology' },
  { repo: 'osbooks-microbiology', file: 'microbiology', faculty: 'medicine', short: 'Microbiology' },
  { repo: 'osbooks-psychology', file: 'psychology-2e', faculty: 'medicine', short: 'Psychology' },
  { repo: 'osbooks-introductory-statistics-bundle', file: 'introductory-statistics-2e', faculty: 'sciences', short: 'Introductory Statistics' },
  { repo: 'osbooks-chemistry-bundle', file: 'chemistry-2e', faculty: 'sciences', short: 'Chemistry' },
  { repo: 'osbooks-biology-bundle', file: 'concepts-biology', faculty: 'sciences', short: 'Concepts of Biology' },
  { repo: 'osbooks-calculus-bundle', file: 'calculus-volume-1', faculty: 'sciences', short: 'Calculus 1' },
  { repo: 'osbooks-university-physics-bundle', file: 'university-physics-volume-1', faculty: 'engineering', short: 'University Physics 1' },
  { repo: 'osbooks-university-physics-bundle', file: 'university-physics-volume-2', faculty: 'engineering', short: 'University Physics 2' },
  { repo: 'osbooks-introduction-python-programming', file: 'introduction-python-programming', faculty: 'computing', short: 'Python Programming' },
  { repo: 'osbooks-principles-economics-bundle', file: 'principles-economics-3e', faculty: 'business', short: 'Economics' },
  { repo: 'osbooks-principles-accounting-bundle', file: 'principles-financial-accounting', faculty: 'business', short: 'Financial Accounting' },
  { repo: 'osbooks-introduction-business', file: 'introduction-business-2e', faculty: 'business', short: 'Introduction to Business' },
  { repo: 'osbooks-principles-marketing', file: 'principles-marketing', faculty: 'business', short: 'Marketing' },
  { repo: 'osbooks-entrepreneurship', file: 'entrepreneurship', faculty: 'business', short: 'Entrepreneurship' },
  { repo: 'osbooks-business-law', file: 'business-law-i-essentials-2e', faculty: 'law', short: 'Business Law' },
  { repo: 'osbooks-introduction-sociology', file: 'introduction-sociology-3e', faculty: 'humanities', short: 'Sociology' },
  { repo: 'osbooks-introduction-philosophy', file: 'introduction-philosophy-2e', faculty: 'humanities', short: 'Philosophy' },
];

const SKIP_SECTION = /\b(?:summary|section-summary|review|exercises?|problems|critical-thinking|free-response|multiple-choice|references|interactive-exercise|homework|practice|bring-together-homework|solutions|key-equations|key-concepts|check-your-understanding|chapter-test|formula-review|assessment-questions|contrib-auth|sr-contrib-auth)\b/i;
const SKIP_MODULE_TITLE = /^(key terms?|key equations|key concepts|summary|chapter summary|chapter review|review questions|critical thinking( questions)?|personal application questions|problems|additional problems|challenge problems|conceptual questions|exercises|homework|practice|bringing it together|solutions|references|answer key|section summary|chapter checkpoint|questions for review|assessment questions|interactive link questions|multiple choice|fill in the blank|short answer|true\/false|matching|application questions|video activity|formula review|practice test|case study)/i;

const kids = (n) => (n.children || []).filter((c) => c.type === 'tag');
const nameOf = (n) => (n.name || '').replace(/^.*:/, '');
const attr = (n, a) => (n.attribs || {})[a] || '';

function mathText(n) {
  if (n.type === 'text') return n.data.trim();
  if (n.type !== 'tag') return '';
  const nm = nameOf(n);
  const c = kids(n);
  const inner = () => (n.children || []).map(mathText).join('');
  switch (nm) {
    case 'mfrac':
      return `(${mathText(c[0] || {})})/(${mathText(c[1] || {})})`;
    case 'msup':
      return `${mathText(c[0] || {})}^${wrap(mathText(c[1] || {}))}`;
    case 'msub':
      return `${mathText(c[0] || {})}_${wrap(mathText(c[1] || {}))}`;
    case 'msubsup':
      return `${mathText(c[0] || {})}_${wrap(mathText(c[1] || {}))}^${wrap(mathText(c[2] || {}))}`;
    case 'msqrt':
      return `√(${inner()})`;
    case 'mroot':
      return `root(${mathText(c[0] || {})}, ${mathText(c[1] || {})})`;
    case 'mo': {
      const t = inner();
      return /^[=+<>≤≥×÷−±→]$/.test(t) ? ` ${t} ` : t;
    }
    case 'mspace':
      return ' ';
    case 'annotation':
    case 'annotation-xml':
      return '';
    default:
      return inner();
  }
}
const wrap = (s) => (s.length > 1 ? `(${s})` : s);

/** Inline text of a paragraph: terms, emphasis, links with text, maths; drop footnote and figure links. */
function inline(n) {
  if (n.type === 'text') return n.data;
  if (n.type !== 'tag') return '';
  const nm = nameOf(n);
  if (nm === 'math') return ` ${mathText(n).replace(/\s+/g, ' ').trim()} `;
  if (nm === 'footnote' || nm === 'media' || nm === 'image' || nm === 'figure' || nm === 'list' || nm === 'table' || nm === 'note' || nm === 'exercise') return '';
  if (nm === 'link' && !(n.children || []).length) return '';
  if (nm === 'newline') return ' ';
  return (n.children || []).map(inline).join('');
}
const tidy = (s) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\(\s*(?:[a-z]|[a-z],\s*[a-z])?\s*\)/g, '') // "(a)" figure panel references left behind
    .replace(/\(\s*(?:see\s*)?\)/gi, '')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();

function walk(n, out, depth) {
  for (const c of kids(n)) {
    const nm = nameOf(c);
    const cls = attr(c, 'class');
    if (nm === 'section') {
      if (SKIP_SECTION.test(cls)) continue;
      const t = kids(c).find((x) => nameOf(x) === 'title');
      const title = t ? tidy(inline(t)) : '';
      if (title && SKIP_MODULE_TITLE.test(title)) continue;
      if (title) out.push({ kind: 'heading', text: title, level: Math.min(4, depth + 1) });
      walk(c, out, depth + 1);
    } else if (nm === 'para') {
      const t = tidy(inline(c));
      if (t.split(' ').length >= 3) out.push({ kind: 'para', text: t });
      // lists nested inside a paragraph
      for (const l of kids(c).filter((x) => nameOf(x) === 'list')) walk({ children: [l] }, out, depth);
    } else if (nm === 'list') {
      for (const it of kids(c).filter((x) => nameOf(x) === 'item')) {
        const t = tidy(inline(it));
        if (t) out.push({ kind: 'item', text: t });
        for (const l of kids(it).filter((x) => nameOf(x) === 'list')) walk({ children: [l] }, out, depth);
      }
    } else if (nm === 'equation') {
      const t = tidy(inline(c));
      if (t) out.push({ kind: 'para', text: t });
    } else if (nm === 'table') {
      // each row as one line: "Cell: cell; cell"
      const rows = [];
      const visit = (x) => {
        for (const y of kids(x)) {
          if (nameOf(y) === 'row') rows.push(kids(y).filter((e) => nameOf(e) === 'entry').map((e) => tidy(inline(e))));
          else visit(y);
        }
      };
      visit(c);
      // only word tables ("Term | what it means"); tables of numbers read badly as text
      const body = rows.slice(1).filter((r) => r.filter(Boolean).length >= 2);
      const wordy = body.filter((r) => /[A-Za-z]{3,}/.test(r[0] || '') && !/^[\d$€£%.,\s-]+$/.test(r[0] || '')).length;
      if (body.length >= 2 && body.length <= 15 && wordy / body.length >= 0.8) {
        const title = kids(c).find((x) => nameOf(x) === 'title');
        if (title) out.push({ kind: 'para', text: tidy(inline(title)) + ':' });
        for (const r of body) {
          const cells = r.filter(Boolean);
          out.push({ kind: 'item', text: `${cells[0]}: ${cells.slice(1).join('; ')}` });
        }
      }
    } else if (nm === 'glossary') {
      const defs = [];
      for (const d of kids(c).filter((x) => nameOf(x) === 'definition')) {
        const term = kids(d).find((x) => nameOf(x) === 'term');
        const meaning = kids(d).find((x) => nameOf(x) === 'meaning');
        if (term && meaning) {
          const t = tidy(inline(term));
          const m = tidy(inline(meaning)).replace(/\.$/, '');
          if (t && m) defs.push({ kind: 'item', text: `${t.charAt(0).toUpperCase()}${t.slice(1)}: ${m}` });
        }
      }
      if (defs.length) out.push({ kind: 'heading', text: 'Key terms', level: 3 }, ...defs);
    } else if (nm === 'example') {
      // worked examples matter in numbers-heavy subjects; keep the worked text, not the exercises
      const before = out.length;
      out.push({ kind: 'para', text: 'Worked example:' });
      walk(c, out, depth + 1);
      for (const ex of kids(c).filter((x) => nameOf(x) === 'exercise')) {
        for (const part of kids(ex).filter((x) => ['problem', 'solution'].includes(nameOf(x)))) walk(part, out, depth + 1);
      }
      if (out.length - before <= 1) out.splice(before, 1);
    } else if (nm === 'content' || nm === 'div' || nm === 'span') {
      walk(c, out, depth);
    }
    // figures, notes (boxes), exercises, examples and media are left out
  }
}

function moduleBlocks(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const doc = parseDocument(xml, { xmlMode: true });
  const root = kids(doc).find((x) => nameOf(x) === 'document');
  if (!root) return { title: '', blocks: [] };
  const title = tidy(inline(kids(root).find((x) => nameOf(x) === 'title') || { children: [] }));
  const blocks = [];
  if (SKIP_MODULE_TITLE.test(title)) return { title, blocks };
  blocks.push({ kind: 'heading', text: title, level: 2 });
  // "By the end of this section, you will be able to:" — the lecturer-style objectives
  const meta = kids(root).find((x) => nameOf(x) === 'metadata');
  const abs = meta && kids(meta).find((x) => nameOf(x) === 'abstract');
  if (abs) {
    const items = [];
    const visit = (x) => {
      for (const y of kids(x)) {
        if (nameOf(y) === 'item') items.push(tidy(inline(y)));
        else visit(y);
      }
    };
    visit(abs);
    if (items.length) blocks.push({ kind: 'para', text: 'Learning objectives: by the end of this section, you will be able to:' }, ...items.map((t) => ({ kind: 'item', text: t })));
  }
  const content = kids(root).find((x) => nameOf(x) === 'content');
  if (content) walk(content, blocks, 2);
  return { title, blocks };
}

function chaptersOf(collectionFile) {
  const xml = fs.readFileSync(collectionFile, 'utf8');
  const doc = parseDocument(xml, { xmlMode: true });
  const chapters = [];
  const visit = (n, unit) => {
    for (const c of kids(n)) {
      const nm = nameOf(c);
      if (nm === 'subcollection') {
        const t = kids(c).find((x) => nameOf(x) === 'title');
        const title = t ? tidy(inline(t)) : '';
        const content = kids(c).find((x) => nameOf(x) === 'content');
        const mods = content ? kids(content).filter((x) => nameOf(x) === 'module').map((m) => attr(m, 'document')) : [];
        const subs = content ? kids(content).filter((x) => nameOf(x) === 'subcollection') : [];
        if (mods.length && !subs.length) chapters.push({ title, unit, modules: mods });
        else if (content) visit(content, title);
      } else if (nm === 'content' || nm === 'collection') visit(c, unit);
    }
  };
  visit(doc, null);
  const meta = xml.match(/<md:title>([^<]*)<\/md:title>/);
  const lic = xml.match(/<md:license url="([^"]*)">([^<]*)</);
  return { title: meta ? meta[1].replace('&#xAE;', '®') : '', license: lic ? { url: lic[1], name: lic[2] } : null, chapters };
}

fs.mkdirSync(OUT, { recursive: true });
const index = [];
let totalWords = 0;
for (const b of BOOKS) {
  const col = path.join(SRC, b.repo, 'collections', `${b.file}.collection.xml`);
  if (!fs.existsSync(col)) {
    console.warn('missing', col);
    continue;
  }
  const book = chaptersOf(col);
  if (!book.license || !/creativecommons\.org\/licenses\/by(-nc)?(-sa)?\/4\.0/.test(book.license.url)) {
    console.warn('skip (licence)', book.title, book.license);
    continue;
  }
  const chapters = [];
  book.chapters.forEach((ch, i) => {
    const blocks = ch.modules.flatMap((m) => moduleBlocks(path.join(SRC, b.repo, 'modules', m, 'index.cnxml')).blocks);
    const words = blocks.reduce((n, x) => n + x.text.split(/\s+/).length, 0);
    if (words < 400) return;
    totalWords += words;
    chapters.push({ n: i + 1, title: ch.title, unit: ch.unit, words, blocks });
  });
  const slug = b.file;
  const data = { book: book.title, short: b.short, faculty: b.faculty, slug, license: book.license, url: `https://openstax.org/details/books/${slug}`, chapters };
  fs.writeFileSync(path.join(OUT, `${slug}.json.gz`), zlib.gzipSync(JSON.stringify(data), { level: 9 }));
  index.push({ slug, book: book.title, chapters: chapters.length, words: chapters.reduce((n, c) => n + c.words, 0) });
  console.log(`${book.title}: ${chapters.length} chapters, ${chapters.reduce((n, c) => n + c.words, 0)} words`);
}
console.log('total words', totalWords);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));

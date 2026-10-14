import type { SourceBlock } from './types';
import { normalize, dehyphenate, wordCount } from './text';

const BULLET_RE = /^\s*(?:[-–•*▪●◦○■□➢➤►▶✓✔→·]|\(?[a-z]\)|\(?[ivx]{1,4}\)|\d{1,2}[.)](?!\d))\s+/i;
const NUMBERED_HEADING_RE = /^(?:(?:chapter|unit|lecture|topic|module|part|section|week|lesson)\s+[\dIVX]+[.:]?\s*|\d+(?:\.\d+)+\.?\s+)/i;

function looksLikeHeading(line: string, next: string | undefined): boolean {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  const wc = wordCount(t);
  if (wc === 0 || wc > 12) return false;
  if (/^#{1,6}\s/.test(t) || /^=+.+=+$/.test(t)) return true;
  if (NUMBERED_HEADING_RE.test(t) && !/[.;,]$/.test(t)) return true;
  if (/[.;,?!]$/.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && wc <= 10) return true;
  // Short title above a bullet list ("Types of epidemiological studies" / "- Descriptive studies")
  if (next && BULLET_RE.test(next) && wc <= 8 && /^[A-Z0-9]/.test(t) && !t.endsWith(':') &&
      !/\b(?:are|is|include|includes|consists?|comprises?|were|was|has|have|the following)\b/i.test(t)) return true;
  // Title-ish short line followed by a longer line of prose
  if (next && wordCount(next) > wc + 3 && /^[A-Z0-9]/.test(t) && !t.endsWith(':')) {
    const caps = t.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).length;
    return wc <= 6 || caps / wc >= 0.5;
  }
  return false;
}

function headingLevel(line: string): number {
  const t = line.trim();
  const hashes = t.match(/^(#{1,6})\s/);
  if (hashes) return hashes[1].length;
  const eq = t.match(/^(=+)/);
  if (eq) return Math.max(1, eq[1].length - 1);
  const num = t.match(/^(\d+(?:\.\d+)*)/);
  if (num) return Math.min(3, num[1].split('.').length);
  if (/^(chapter|unit|part|module)\b/i.test(t)) return 1;
  return 2;
}

function cleanHeading(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^=+\s*|\s*=+$/g, '')
    .replace(/:$/, '')
    .trim();
}

/** Turn pasted notes / plain text / Wikipedia text into structured blocks. */
export function blocksFromPlainText(raw: string): SourceBlock[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map((l) => normalize(l));
  const blocks: SourceBlock[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length) {
      blocks.push({ kind: 'para', text: dehyphenate(para.join(' ')) });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      flush();
      continue;
    }
    const next = lines.slice(i + 1).find((l) => l.length > 0);
    const prevBlank = i === 0 || !lines[i - 1];
    const nextBlank = i + 1 >= lines.length || !lines[i + 1];

    // the very first short line is usually the document title
    if (blocks.length === 0 && !para.length && nextBlank && wordCount(line) <= 14 && !/[.;,]$/.test(line)) {
      blocks.push({ kind: 'heading', text: cleanHeading(line), level: 1 });
      continue;
    }
    // "1. Introduction to the Cell" on its own line → a numbered heading, not a list item
    const numbered = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (numbered && prevBlank && wordCount(numbered[2]) <= 10 && !/[.;,:]$/.test(numbered[2]) && !numbered[2].includes(':') &&
        (nextBlank || (next !== undefined && !BULLET_RE.test(next)))) {
      flush();
      blocks.push({ kind: 'heading', text: cleanHeading(numbered[2]), level: 2 });
      continue;
    }

    if (BULLET_RE.test(line) && !(NUMBERED_HEADING_RE.test(line) && looksLikeHeading(line, next) && prevBlank)) {
      flush();
      blocks.push({ kind: 'item', text: line.replace(BULLET_RE, '').trim() });
      continue;
    }
    if ((prevBlank || para.length === 0) && looksLikeHeading(line, next)) {
      flush();
      blocks.push({ kind: 'heading', text: cleanHeading(line), level: headingLevel(line) });
      continue;
    }
    // continuation of a bullet that wrapped onto a new line
    const last = blocks[blocks.length - 1];
    if (!para.length && last?.kind === 'item' && !prevBlank && /^[a-z(]/.test(line)) {
      last.text = dehyphenate(`${last.text} ${line}`);
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks.filter((b) => b.text.length > 0);
}

/**
 * Remove running headers/footers and page numbers that repeat on many pages,
 * merge broken headings, and normalise text.
 */
export function cleanBlocks(input: SourceBlock[]): SourceBlock[] {
  const blocks = input
    .map((b) => ({ ...b, text: dehyphenate(normalize(b.text)) }))
    .filter((b) => b.text.length > 0);

  const pages = new Set(blocks.map((b) => b.page).filter((p) => p !== undefined));
  const key = (t: string) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

  let repeated = new Set<string>();
  if (pages.size >= 3) {
    const pagesFor = new Map<string, Set<number>>();
    for (const b of blocks) {
      if (b.page === undefined || b.text.length > 120) continue;
      const k = key(b.text);
      if (!pagesFor.has(k)) pagesFor.set(k, new Set());
      pagesFor.get(k)!.add(b.page);
    }
    repeated = new Set(
      [...pagesFor.entries()].filter(([, p]) => p.size >= 3 && p.size / pages.size >= 0.3).map(([k]) => k),
    );
  }

  const out: SourceBlock[] = [];
  for (const b of blocks) {
    const t = b.text.trim();
    if (/^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(t)) continue; // page numbers
    if (/^[\W_]+$/.test(t)) continue; // decoration
    if (repeated.has(key(t)) && b.kind !== 'heading') continue;
    if (repeated.has(key(t)) && b.kind === 'heading' && out.some((o) => o.kind === 'heading' && key(o.text) === key(t))) continue;
    out.push({ ...b, text: t });
  }
  return out;
}

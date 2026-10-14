import type { BodyPart, SourceBlock } from './types';
import { splitSentences, wordCount } from './text';

export interface Section {
  title?: string;
  titles: string[];
  parts: BodyPart[];
  words: number;
}

const MAX_WORDS = 380;
const TARGET_WORDS = 240;
const MIN_WORDS = 70;
const MAX_PARA_WORDS = 170;

function titleKey(t: string): string {
  return t
    .toLowerCase()
    .replace(/\((?:cont(?:inued|'?d)?\.?|\d+)\)|\bcont(?:inued|'?d)?\.?$|[-–:]\s*(?:part\s*)?\d+$|\s+\d+$/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Break very long paragraphs into reading-sized pieces at sentence boundaries. */
function splitLongParagraph(text: string): string[] {
  if (wordCount(text) <= MAX_PARA_WORDS) return [text];
  const sentences = splitSentences(text);
  const out: string[] = [];
  let cur: string[] = [];
  let wc = 0;
  for (const s of sentences) {
    const w = wordCount(s);
    if (wc + w > 130 && cur.length) {
      out.push(cur.join(' '));
      cur = [];
      wc = 0;
    }
    cur.push(s);
    wc += w;
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

export const ADMIN_TITLE_RE = /^(?:(?:learning|lecture|lesson|session|course|specific|general)\s+)?(?:objectives?|outcomes?|aims?|outline|content|overview|syllabus)\b|\bby the end of\b/i;

export function buildSections(blocks: SourceBlock[]): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;

  const newSection = (title?: string): Section => ({ title, titles: title ? [title] : [], parts: [], words: 0 });

  for (const b of blocks) {
    if (b.kind === 'heading') {
      const heading = b.text.replace(/\s+/g, ' ').trim();
      if (cur && cur.words === 0) {
        // stacked headings: "Chapter 2" then "2.1 Cells" → keep the most specific one
        if (!cur.title || titleKey(cur.title) !== titleKey(heading)) {
          cur.title = heading;
          cur.titles = [heading];
        }
        continue;
      }
      if (cur && cur.title && titleKey(cur.title) === titleKey(heading)) continue; // "(cont.)" slides
      if (cur) sections.push(cur);
      cur = newSection(heading);
      continue;
    }
    if (!cur) cur = newSection();
    const pieces = b.kind === 'para' ? splitLongParagraph(b.text) : [b.text];
    for (const x of pieces) {
      cur.parts.push({ t: b.kind === 'item' ? 'li' : 'p', x });
      cur.words += wordCount(x);
    }
  }
  if (cur && (cur.words > 0 || sections.length === 0)) sections.push(cur);

  // ── split sections that are too long ──
  const split: Section[] = [];
  for (const s of sections) {
    if (s.words <= MAX_WORDS) {
      split.push(s);
      continue;
    }
    const groups: BodyPart[][] = [];
    let g: BodyPart[] = [];
    let wc = 0;
    s.parts.forEach((p, i) => {
      const w = wordCount(p.x);
      const next = s.parts[i + 1];
      const isLead = p.t === 'p' && /:\s*$/.test(p.x) && next?.t === 'li';
      const keepWithList = p.t === 'li' && g.length && g[g.length - 1].t !== 'h';
      if (wc >= TARGET_WORDS && !keepWithList && g.length) {
        groups.push(g);
        g = [];
        wc = 0;
      } else if (wc + w > MAX_WORDS && g.length && !keepWithList) {
        groups.push(g);
        g = [];
        wc = 0;
      }
      g.push(p);
      wc += w;
      if (isLead) return;
    });
    if (g.length) groups.push(g);
    groups.forEach((parts, i) => {
      const title = s.title ? (i === 0 ? s.title : `${s.title} (part ${i + 1})`) : undefined;
      split.push({ title, titles: title ? [title] : [], parts, words: parts.reduce((n, p) => n + wordCount(p.x), 0) });
    });
  }

  // ── merge sections that are too small ──
  const merged: Section[] = [];
  for (const s of split) {
    const prev = merged[merged.length - 1];
    if (prev && prev.words < MIN_WORDS && prev.words + s.words <= MAX_WORDS) {
      // a near-empty section (e.g. a title slide) gives its place to the next real one
      if (prev.words < 15 && s.title) {
        // keep the heading in the text so "Course outline" / "Objectives" still mark what follows
        if (prev.title && prev.words > 0) prev.parts.unshift({ t: 'h', x: prev.title });
        prev.titles = [];
        prev.title = undefined;
      }
      if (s.title) prev.parts.push({ t: 'h', x: s.title });
      prev.parts.push(...s.parts);
      prev.words += s.words;
      if (s.title) prev.titles.push(s.title);
      if (!prev.title) prev.title = s.title;
      continue;
    }
    merged.push({ ...s, titles: [...s.titles], parts: [...s.parts] });
  }
  // a tiny last section joins the one before it
  if (merged.length > 1) {
    const last = merged[merged.length - 1];
    const prev = merged[merged.length - 2];
    if (last.words < MIN_WORDS / 2 && prev.words + last.words <= MAX_WORDS + 80) {
      if (last.title) prev.parts.push({ t: 'h', x: last.title });
      prev.parts.push(...last.parts);
      prev.words += last.words;
      merged.pop();
    }
  }

  for (const s of merged) {
    // "Learning objectives" or "Course outline" is a signpost, not what the lesson is about
    const real = s.titles.filter((t) => !ADMIN_TITLE_RE.test(t));
    if (real.length && real.length < s.titles.length) {
      s.titles = real;
      s.title = real[0];
    }
    if (s.titles.length >= 2) {
      const joined = `${s.titles[0]} & ${s.titles[1]}`;
      s.title = joined.length <= 64 ? joined : s.titles[0];
    }
  }
  return merged.filter((s) => s.words > 0);
}

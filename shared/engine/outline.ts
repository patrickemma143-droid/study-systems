// Course outline, topics and learning objectives.
// Works from a finished pack, so packs made before this existed get an outline too.
import type { CourseOutline, OutlineTopic, StudyPack } from './types';

export type { CourseOutline, OutlineTopic };

import { contentStems, splitSentences, trimEndPunct, wordCount } from './text';

const OBJECTIVES_RE = /\b(?:learning\s+)?(?:objectives?|outcomes?|aims?)\b|by the end of (?:this|the) (?:lecture|lesson|unit|topic|course|chapter|session|module)|(?:should|will) be able to/i;
const OUTLINE_RE = /\b(?:course|module|unit)\s+(?:outline|content|description)\b|\btopics?\s+(?:covered|to be covered)\b|\bsyllabus\b|\bcourse\s+structure\b/i;
const BLOOM = /^(?:define|state|list|name|identify|describe|explain|outline|discuss|compare|contrast|distinguish|differentiate|analy[sz]e|apply|calculate|compute|evaluate|assess|demonstrate|use|interpret|classify|illustrate|summari[sz]e|recogni[sz]e|understand|know|appreciate|construct|design|derive|solve|relate|examine)\b/i;

function tidyObjective(s: string): string {
  let t = trimEndPunct(s.replace(/^\s*(?:\d+[.)]|[a-z][.)]|[-•*])\s*/i, '').trim());
  t = t.replace(/^(?:to|be able to)\s+/i, '');
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : '';
}

/** Objectives and course outlines the lecturer wrote into the notes. */
export function findStated(pack: StudyPack): { objectives: { text: string; chunk: number }[]; topics: string[] } {
  const objectives: { text: string; chunk: number }[] = [];
  const topics: string[] = [];
  for (const c of pack.chunks) {
    let mode: 'obj' | 'outline' | null = null;
    const first = c.title.split(' & ')[0];
    if (c.body[0]?.t !== 'h') mode = OUTLINE_RE.test(first) ? 'outline' : OBJECTIVES_RE.test(first) ? 'obj' : null;
    for (const p of c.body) {
      if (p.t === 'h' || p.t === 'p') {
        const lead = p.x;
        if (OUTLINE_RE.test(lead) && wordCount(lead) <= 25) mode = 'outline';
        else if (OBJECTIVES_RE.test(lead) && wordCount(lead) <= 30) {
          mode = 'obj';
          // "Objectives: to define X, describe Y and explain Z." written as one sentence
          const after = lead.split(/able to:?|objectives?:|outcomes?:/i)[1];
          if (p.t === 'p' && after && wordCount(after) >= 3) {
            for (const piece of after.split(/;|,\s*(?=(?:and\s+)?[a-z]+\b)/i)) {
              const t = tidyObjective(piece.replace(/^\s*and\s+/i, ''));
              if (BLOOM.test(t)) objectives.push({ text: t, chunk: c.index });
            }
          }
        } else mode = null;
        continue;
      }
      if (mode === 'obj') {
        const t = tidyObjective(p.x);
        if (t && wordCount(t) <= 30) objectives.push({ text: t, chunk: c.index });
      } else if (mode === 'outline') {
        const t = trimEndPunct(p.x.replace(/^\s*(?:\d+(?:\.\d+)*[.)]?|[-•*])\s*/, '').trim());
        if (t && wordCount(t) <= 14) topics.push(t);
      }
    }
  }
  return { objectives: objectives.slice(0, 40), topics: topics.slice(0, 40) };
}

function overlap(a: string, b: string): number {
  const A = new Set(contentStems(a));
  const B = new Set(contentStems(b));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}

function joinNames(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** What a student should be able to do after a lesson, written the way lecturers write objectives. */
export function lessonObjectives(pack: StudyPack, index: number): string[] {
  const c = pack.chunks[index];
  if (!c) return [];
  const out: string[] = [];
  const text = c.body.map((p) => p.x).join(' ');

  const defs = pack.glossary
    .filter((d) => d.chunk === index && wordCount(d.term) <= 5)
    .slice(0, 3)
    .map((d) => (/^[A-Z][a-z]/.test(d.term) && !/[A-Z]/.test(d.term.slice(1)) ? d.term.toLowerCase() : d.term));
  if (defs.length) out.push(`Define ${joinNames(defs)}.`);

  for (const l of pack.lists.filter((x) => x.chunk === index).slice(0, 2)) {
    const detailed = l.items.some((i) => i.detail && i.detail !== i.label);
    if (/^key points about /.test(l.category)) out.push(`Explain the main points about ${l.category.replace(/^key points about /, '')}.`);
    else if (l.ordered) out.push(`Describe the ${l.category} in the correct order.`);
    else out.push(`${detailed ? 'Name and explain' : 'List'} the ${l.category}.`);
  }

  const cmp = text.match(/\bdifferen\w*\s+between\s+([^.,;]{3,40}?)\s+and\s+([^.,;]{3,40}?)(?=[.,;]|\s+(?:is|are|lies)\b)/i);
  if (cmp) out.push(`Distinguish between ${cmp[1].trim()} and ${cmp[2].trim()}.`);
  else {
    const vs = text.match(/\b([A-Za-z][\w-]*(?:\s+[\w-]+)?)\s+(?:vs\.?|versus|compared (?:with|to))\s+([A-Za-z][\w-]*(?:\s+[\w-]+)?)/i);
    if (vs) out.push(`Compare ${vs[1]} and ${vs[2]}.`);
  }

  // a worked calculation: name it after the heading it sits under ("Calculating the mean" → "Calculate the mean")
  let heading = c.title.replace(/\s*\(part \d+\)$/, '').split(' & ')[0];
  for (const p of c.body) {
    if (p.t === 'h') heading = p.x;
    else if (/(?:\d\s*[+\-×x*/÷^]\s*\d|=\s*[\d(]|\bformula\b)/i.test(p.x)) {
      const h = heading.replace(/[:.]$/, '');
      out.push(/^calculat/i.test(h) ? `${h.replace(/^calculating/i, 'Calculate').replace(/^calculation of/i, 'Calculate')}.` : `Solve problems on ${h.charAt(0).toLowerCase() + h.slice(1)}.`);
      break;
    }
  }

  if (out.length < 2) out.push(`Explain the main ideas of ${c.title.replace(/\s*\(part \d+\)$/, '')} in your own words.`);
  return [...new Set(out)].slice(0, 5);
}

/** Group lessons into topics: the notes' own course outline if there is one, otherwise by title. */
function groupTopics(pack: StudyPack, statedTopics: string[]): OutlineTopic[] {
  const chunks = pack.chunks;
  if (statedTopics.length >= 2) {
    const topics: OutlineTopic[] = statedTopics.map((t) => ({ title: t, chunks: [] }));
    let last = 0;
    for (const c of chunks) {
      const titleStems = new Set(contentStems(c.title));
      const bodyStems = new Set(contentStems(c.body.map((p) => p.x).join(' ')));
      let best = -1;
      let score = 0.5;
      topics.forEach((t, i) => {
        const ts = contentStems(t.title);
        if (!ts.length) return;
        // how much of the outline item shows up in this lesson, with the lesson title counting double
        const s = ts.reduce((n, x) => n + (titleStems.has(x) ? 1.5 : bodyStems.has(x) ? 1 : 0), 0) / ts.length + (i === last ? 0.1 : i > last ? 0.05 : 0);
        if (s > score) {
          score = s;
          best = i;
        }
      });
      const k = best >= 0 ? best : last;
      topics[k].chunks.push(c.index);
      last = k;
    }
    const used = topics.filter((t) => t.chunks.length);
    if (used.length >= 1) return used;
  }
  const topics: OutlineTopic[] = [];
  for (const c of chunks) {
    const base = c.title.replace(/\s*\(part \d+\)$/, '').replace(/\s*&\s.*$/, '');
    const prev = topics[topics.length - 1];
    if (prev && (prev.title === base || overlap(prev.title, base) >= 0.6)) prev.chunks.push(c.index);
    else topics.push({ title: base, chunks: [c.index] });
  }
  return topics;
}

export function buildOutline(pack: StudyPack): CourseOutline {
  const stated = findStated(pack);
  const objectives = pack.chunks.map((c) => {
    // the lecturer's own objectives for this lesson come first
    const own = stated.objectives
      .filter((o) => o.chunk === c.index + 1 || o.chunk === c.index || overlap(o.text, `${c.title} ${c.keyTerms.join(' ')}`) >= 0.5)
      .filter((o) => overlap(o.text, c.body.map((p) => p.x).join(' ')) >= 0.5)
      .map((o) => o.text);
    // skip a made-up objective the lecturer already wrote in other words
    const extra = lessonObjectives(pack, c.index).filter((o) => !own.some((x) => overlap(o, x) >= 0.8));
    return [...new Set([...own, ...extra])].slice(0, 6);
  });
  return {
    topics: groupTopics(pack, stated.topics),
    objectives,
    stated: stated.objectives.map((o) => o.text),
    statedTopics: stated.topics,
    source: 'notes',
  };
}

import type { BodyPart, Definition, TermList } from './types';
import { capitalize, isPronounStart, splitSentences, stripCitations, trimEndPunct, wordCount, words, STOPWORDS } from './text';

const STRONG_VERBS =
  '(?:refers? to|is defined as|are defined as|can be defined as|may be defined as|is described as|are described as|means|denotes|is known as|are known as|is termed|are termed|is called|are called|is the term for|is a term (?:used )?(?:for|to describe))';

const BAD_TERM_WORDS = /\b(?:this|that|these|those|it|its|our|we|you|they|their|he|she|there|which|what|who|following|above|below|result|aim|purpose|goal|reason|problem|answer|question|example|chapter|section|lecture|slide|figure|table|first|second|last|next|main|other|same|following|one|thing|way)\b/i;

function cleanTerm(raw: string): string | null {
  let t = trimEndPunct(raw.replace(/^[\s"“'‘(]+|[\s"”'’)]+$/g, ''));
  t = t.replace(/^(?:a|an|the)\s+/i, '').trim();
  if (!t) return null;
  const wc = wordCount(t);
  if (wc === 0 || wc > 6) return null;
  if (t.length > 70 || t.length < 2) return null;
  const first = words(t)[0] || '';
  if (isPronounStart(first)) return null;
  if (BAD_TERM_WORDS.test(t)) return null;
  if (words(t).every((w) => STOPWORDS.has(w.toLowerCase()))) return null;
  if (/\d{3,}/.test(t)) return null;
  return t;
}

function cleanDefinition(raw: string): string | null {
  let d = trimEndPunct(raw.trim().replace(/[.!]+$/, ''));
  d = d.replace(/^(?:that|as)\s+/i, '');
  const wc = wordCount(d);
  if (wc < 4) return null;
  if (wc > 45) {
    // shorten at a clause boundary
    const cut = d.search(/;\s|,\s(?:which|whereas|while|although|but)\s/);
    if (cut > 30) d = d.slice(0, cut);
    else d = d.split(/\s+/).slice(0, 40).join(' ') + '…';
  }
  return capitalize(d);
}

/** Find "X is …", "X refers to …", "… is called X" and "Term: definition" definitions. */
export function findDefinitions(chunkParts: BodyPart[][]): Definition[] {
  const found = new Map<string, Definition>();

  const add = (termRaw: string, defRaw: string, chunk: number, strength: number) => {
    const term = cleanTerm(termRaw);
    const definition = cleanDefinition(defRaw);
    if (!term || !definition) return;
    if (definition.toLowerCase().includes(term.toLowerCase()) && wordCount(definition) < 8) return;
    const key = term.toLowerCase().replace(/s$/, '');
    const existing = found.get(key);
    if (!existing || existing.strength < strength || (existing.strength === strength && existing.definition.length > definition.length * 1.8)) {
      found.set(key, { term, definition, chunk, strength });
    }
  };

  const strong = new RegExp(`^(.{2,70}?)\\s*(?:\\(([^)]{1,40})\\))?\\s+${STRONG_VERBS}\\s+(.+)$`, 'i');
  const reverse = /^(.{12,}?)\s+(?:is|are)\s+(?:called|known as|termed|referred to as)\s+(?:an?\s+|the\s+)?["“]?([A-Za-z][^,.;"”()]{1,50})["”]?(?:\s*\(([A-Z]{2,8})\))?\s*(?:[.,;]|$)/;
  const copula = /^(?:(?:A|An|The)\s+)?([A-Za-z][\w'’\- ]{1,50}?)(?:\s*\(([A-Z][A-Za-z]{1,8})\))?\s+(?:is|are)\s+((?:a|an|the|one of the|any|those|that)\s.+)$/;
  const glossary = /^([A-Z][\w'’()\- ]{1,50}?)\s*(?::|\s[–—-]\s)\s*(.+)$/;

  chunkParts.forEach((parts, chunk) => {
    let lead = '';
    for (const part of parts) {
      if (part.t !== 'li') lead = part.x;
      if (part.t === 'h') continue;
      const text = stripCitations(part.x);
      const comparing = part.t === 'li' && COMPARISON_RE.test(lead);

      // "Term: definition" / "Term – definition" (glossaries, bullet points)
      const g = comparing ? null : text.match(glossary);
      if (g && wordCount(g[1]) <= 5 && wordCount(g[2]) >= 4 && !/^(?:note|example|e\.g|i\.e|source|see|figure|table|step \d)/i.test(g[1])) {
        add(g[1], splitSentences(g[2])[0] || g[2], chunk, 3);
      }

      for (const s of splitSentences(text)) {
        if (s.endsWith('?') || wordCount(s) > 70) continue;
        let m = s.match(strong);
        if (m) {
          const term = m[2] && /^[A-Z]{2,8}$/.test(m[2]) ? `${trimEndPunct(m[1])} (${m[2]})` : m[1];
          add(term, m[3], chunk, 4);
          continue;
        }
        m = s.match(reverse);
        if (m) {
          const term = m[3] ? `${m[2].trim()} (${m[3]})` : m[2];
          add(term, m[1], chunk, 3);
          continue;
        }
        m = s.match(copula);
        if (m && wordCount(m[1]) <= 4 && wordCount(m[3]) >= 6) {
          const term = m[2] && /^[A-Z]{2,8}$/.test(m[2]) ? `${m[1].trim()} (${m[2]})` : m[1];
          add(term, m[3], chunk, 2);
        }
      }
    }
  });

  // casing: "Nucleus" (bullet start) → "nucleus" when the notes also write it in lower case
  const allText = chunkParts.flat().filter((p) => p.t !== 'h').map((p) => p.x).join(' . ');
  for (const d of found.values()) {
    if (/^[A-Z][a-z]/.test(d.term) && !/^[A-Z]{2,}/.test(d.term)) {
      // only lower-case it when the notes themselves use the lower-case word somewhere
      // ("nucleus" yes; "Golgi" stays capitalised because it never appears in lower case)
      const firstWord = d.term.split(/\s+/)[0];
      const lowerWord = firstWord.toLowerCase();
      if (new RegExp(`\\b${escapeRe(lowerWord)}`).test(allText)) d.term = lowerWord + d.term.slice(firstWord.length);
    }
  }
  return [...found.values()];
}

const COMPARISON_RE = /differen|compar|contrast|versus|\bvs\.?\b|similarit|advantages?|disadvantages?|merits?|demerits?|pros\b|cons\b/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Lists ────────────────────────────────────────────────────

const ORDERED_RE = /\b(?:stages?|steps?|phases?|sequence|order|cycle|procedure|hierarchy|levels?|chronolog|timeline|evolution|development)\b/i;
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function splitItem(text: string): { label: string; detail?: string } {
  const t = text.trim().replace(/[.;]$/, '');
  const m = t.match(/^([^:–—]{2,60}?)\s*(?::|\s[–—-]\s)\s*(.+)$/);
  if (m && wordCount(m[1]) <= 6) return { label: trimEndPunct(m[1]), detail: capitalize(m[2]) };
  if (wordCount(t) <= 6) return { label: t };
  // long bullet: label = first few words up to a natural break
  const first = t.split(/,|\s(?:which|that|where|because|to|by|for)\s/)[0];
  if (wordCount(first) <= 7) return { label: first.trim(), detail: t };
  return { label: t.split(/\s+/).slice(0, 5).join(' ') + '…', detail: t };
}

function categoryFrom(lead: string): string | null {
  let c = lead.replace(/[:.]\s*$/, '');
  // "The control process consists of three steps" → "steps of the control process"
  const has = c.match(/^(.{3,60}?)\s+(?:consists? of|has|have|involves?|comprises?|is made up of|are made up of|needs?|requires?)\s+(?:the following\s+)?(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:main\s+|major\s+|key\s+|basic\s+)?([a-z][a-z -]{2,30})$/i);
  if (has && !isPronounStart(words(has[1])[0] || '')) return `${has[2].trim()} of ${has[1].trim().replace(/^The\s/, 'the ')}`;
  const counted = c.match(/\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(.+)$/i);
  if (counted && !/\b(?:include|includes|are|is|consists?)\b/i.test(counted[1].split(/\s+/)[0] || '')) c = counted[1];
  c = c
    .replace(/^(?:today|now|here|thus|therefore|in summary|in short|in general|generally|basically),?\s+/i, '')
    .replace(/\b(?:include|includes|including|are as follows|are|is|as follows|consist of|consists of|comprise|comprises|namely|the following|such as)\b.*$/i, '')
    .replace(/^(?:there are|we have|we will look at|we discuss|here are|below are|these are)\s+/i, '')
    .replace(/^(?:the|some|several|various|main|major|key|basic)\s+/i, '')
    .replace(/^(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+/i, '')
    .replace(/^(?:main|major|key|basic|different|important)\s+/i, '')
    .trim();
  if (!c || wordCount(c) > 9 || wordCount(c) < 1) return null;
  if (isPronounStart(words(c)[0] || '')) return null;
  return /[A-Z]/.test(c.slice(1)) ? c : c.charAt(0).toLowerCase() + c.slice(1);
}

const GENERIC_HEAD = /^(?:(?:common|main|major|key|basic|general|important|different|other)\s+)*(?:steps|stages|phases|types|kinds|forms|features|characteristics|advantages|disadvantages|benefits|limitations|functions|roles|uses|examples|methods|components|parts|principles|properties|causes|effects|factors|categories|classes|levels|elements|objectives|aims|goals|reasons|importance|sources|applications|assumptions|requirements|processes|structures|organs|stages)$/i;

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** A heading tidied to use inside a question: "Exploratory Data Analysis (EDA):" → "Exploratory Data Analysis (EDA)". */
function cleanSubject(h: string): string {
  const t = h.replace(/^\s*(?:\d+(?:\.\d+)*|[ivx]+|[A-Z])[.)]\s+/, '').replace(/[:.]\s*$/, '').trim();
  return wordCount(t) >= 1 && wordCount(t) <= 8 ? t : '';
}

function isPluralPhrase(c: string): boolean {
  const head = c.replace(/\s*\(.*?\)\s*/g, ' ').trim().split(/\s+of\s+|\s+in\s+|\s+for\s+/i)[0].trim().split(/\s+/).pop() || '';
  return /(?:[^s]s|ies|ae|ria|ses)$/i.test(head) || /^(?:types|kinds|data|criteria|phenomena|media)$/i.test(head);
}

/** "common steps" alone means nothing on a card: say steps of what. */
function withSubject(cat: string, subject: string): string {
  if (!subject || !GENERIC_HEAD.test(cat.trim())) return cat;
  if (cat.toLowerCase().includes(subject.toLowerCase())) return cat;
  const subj = /\b[A-Z]{2,}/.test(subject) ? subject : subject.toLowerCase();
  return `${cat.replace(/^(?:common|main|major|key|basic|general|important|different|other)\s+/i, '')} of ${subj}`;
}

/** "Helps to:" under "EDA" → "things Exploratory Data Analysis (EDA) helps to do". */
function stemCategory(stem: string, subject: string): string | null {
  const st = stem.replace(/[:\s]+$/, '').trim();
  if (!subject) return categoryFrom(st);
  if (/\bto$/i.test(st)) return `things ${subject} ${lowerFirst(st)} do`;
  const c = categoryFrom(st);
  if (c && GENERIC_HEAD.test(c)) return `${c} of ${subject}`;
  if (c && isPluralPhrase(c)) return c;
  return `points on ${subject}: ${lowerFirst(st)}`;
}

/**
 * Notes often put a term on one bullet and what it means on the next:
 * "Descriptive studies" / "Seeks to describe…" / "Analytic studies" / "Tests a causal…".
 * Join those into "Descriptive studies: Seeks to describe…".
 */
function pairUp(group: string[]): string[] {
  if (group.length < 4) return group;
  const isLabel = (x: string) => wordCount(x) <= 5 && !/[.:;]$/.test(x.trim()) && /^[A-Z0-9]/.test(x.trim());
  const isDetail = (x: string) => wordCount(x) >= 5;
  for (const off of [0, 1]) {
    const body = group.slice(off);
    if (body.length < 4 || body.length % 2) continue;
    let ok = true;
    for (let k = 0; k < body.length; k += 2) {
      if (!isLabel(body[k]) || !isDetail(body[k + 1]) || wordCount(body[k + 1]) <= wordCount(body[k])) ok = false;
    }
    if (!ok) continue;
    const pairs: string[] = [];
    for (let k = 0; k < body.length; k += 2) pairs.push(`${body[k].trim()}: ${body[k + 1].trim()}`);
    return [...group.slice(0, off), ...pairs];
  }
  return group;
}

/** Split "Essential first step / Helps to: / Identify errors / …" at the bullet that ends in a colon. */
function splitGroup(group: string[]): { stem?: string; items: string[] }[] {
  const out: { stem?: string; items: string[] }[] = [{ items: [] }];
  for (const g of group) {
    if (/:\s*$/.test(g) && wordCount(g) <= 10) out.push({ stem: g.replace(/:\s*$/, '').trim(), items: [] });
    else out[out.length - 1].items.push(g);
  }
  return out.filter((s) => s.items.length);
}

export function findLists(chunkParts: BodyPart[][], headings: (string | undefined)[]): TermList[] {
  const lists: TermList[] = [];
  const seen = new Set<string>();

  const push = (category: string, rawItems: string[], chunk: number, leadText: string, question?: string, min = 3) => {
    const items = rawItems.map(splitItem).filter((i) => i.label.length > 1);
    if (items.length < min || items.length > 10) return;
    // a cut-off label ("Seeks to describe the…") can't be recalled word for word, so it makes a poor card
    if (items.some((i) => i.label.endsWith('…'))) return;
    // the lecturer's objectives or course outline are a map of the lecture, not something to memorise
    if (/\b(?:objectives?|outcomes?|aims|outline|syllabus|able to)\b/i.test(`${category} ${leadText}`)) return;
    const key = items.map((i) => i.label.toLowerCase()).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    lists.push({ category, items, ordered: ORDERED_RE.test(category) || ORDERED_RE.test(leadText), chunk, question });
  };

  chunkParts.forEach((parts, chunk) => {
    // 1) bullet groups
    let i = 0;
    while (i < parts.length) {
      if (parts[i].t !== 'li') {
        i++;
        continue;
      }
      const start = i;
      const group: string[] = [];
      while (i < parts.length && parts[i].t === 'li') group.push(parts[i++].x);
      const lead = parts[start - 1];
      const heading = headings[chunk];
      let category: string | null = null;
      let fromHeading = false;
      if (lead && lead.t === 'p' && wordCount(lead.x) <= 30) category = categoryFrom(splitSentences(lead.x).pop() || lead.x);
      if (!category && lead && lead.t === 'h') {
        category = categoryFrom(lead.x);
        fromHeading = true;
      }
      if (!category && start === 0 && heading) {
        category = categoryFrom(heading);
        fromHeading = true;
      }
      let h = start - 1;
      while (h >= 0 && parts[h].t !== 'h') h--;
      const subject = cleanSubject(h >= 0 ? parts[h].x : heading || '');
      for (const seg of splitGroup(pairUp(group))) {
        let cat = seg.stem ? stemCategory(seg.stem, subject || category || '') : category;
        let question: string | undefined;
        if (!seg.stem && cat) {
          // "Exploratory Data Analysis" is one thing, not a list of things: only plural headings name a list
          if (fromHeading && !isPluralPhrase(cat)) {
            if (!subject) continue;
            cat = `key points about ${subject}`;
            question = `Give ${seg.items.length} key points about ${subject}. Name them.`;
          } else cat = withSubject(cat, subject);
        }
        const labelled = seg.items.filter((g) => wordCount(g) <= 6 || /^[^:–—]{2,60}?\s*(?::|\s[–—-]\s)/.test(g)).length;
        if (cat && seg.items.every((g) => wordCount(g) <= 40) && labelled / seg.items.length >= 0.6) push(cat, seg.items, chunk, lead?.x || '', question);
      }
    }

    // 2) inline enumerations: "The four stages of mitosis are prophase, metaphase, anaphase and telophase."
    let prevSentence = '';
    let near = cleanSubject(headings[chunk] || '');
    for (const part of parts) {
      if (part.t === 'h') {
        near = cleanSubject(part.x) || near;
        continue;
      }
      for (const s of splitSentences(stripCitations(part.x))) {
        const before = prevSentence;
        prevSentence = s;
        let category: string | null = null;
        let tail = '';
        let question: string | undefined;
        let declared: string | undefined;

        const colon = s.match(/^(.{4,140}?)\b(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:main\s+|major\s+|key\s+|basic\s+|different\s+|important\s+)?([a-z][a-z -]{2,40}?)\s*:\s*(.+?)[.]?$/i);
        const m = s.match(/^(.{4,90}?)\s+(?:include|includes|are|consist of|consists of|comprise|comprises|is made up of|are made up of|can be classified into|are classified into|can be divided into|is divided into|are divided into)\s*:?\s+(.+?)[.]?$/i);
        const suchAs = s.match(/\b([A-Za-z]+(?:\s+[a-z]+)?)\s*,?\s+(?:such as|including|for example|e\.g\.,?)\s+(.+?)[.]?$/i);

        if (colon) {
          category = colon[3].trim();
          // "Substances move into and out of cells by three main processes:" → "processes by which substances move into and out of cells"
          const via = colon[1].trim().match(/^(.{6,80}?)\s+(by|through|via)$/i);
          if (via && !isPronounStart(words(via[1])[0] || '')) category = `${category} by which ${lowerFirst(via[1])}`;
          else category = withSubject(category, near);
          tail = colon[4];
          declared = colon[2];
          question = `${trimEndPunct(s.slice(0, s.indexOf(':')))}. Name them.`;
        } else if (m) {
          declared = m[1].match(/\b(two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i)?.[1];
          if (/^(?:these|they|those|the)$/i.test(m[1].trim()) && before) {
            // "Plant cells have three structures … These are A, B and C."
            const ref = before.match(/\b(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:main\s+|major\s+|key\s+)?([a-z][a-z-]*(?:\s+[a-z-]+){0,1})\b/i);
            if (ref) {
              category = ref[2].split(/\s+/).filter((w, i) => i === 0 || !STOPWORDS.has(w.toLowerCase())).join(' ');
              const owner = before.match(/^(.{3,40}?)\s+(?:have|has|contain|contains|possess|possesses|show|shows)\s+(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i);
              category = owner && !isPronounStart(words(owner[1])[0] || '') ? `${category} of ${lowerFirst(owner[1].replace(/^the\s+/i, ''))}` : withSubject(category, near);
              declared = ref[1];
              question = `${trimEndPunct(before.replace(/[.!?]+$/, ''))}. Name them.`;
            }
          } else {
            category = categoryFrom(m[1]);
            if (category) category = withSubject(category, near);
          }
          tail = m[2];
        } else if (suchAs) {
          category = suchAs[1].toLowerCase();
          tail = suchAs[2];
          if (STOPWORDS.has(category) || wordCount(category) > 3) category = null;
        }
        if (!category || !tail) continue;
        const items = tail
          .replace(/\s*\betc\.?$/i, '')
          .split(/\s*(?:,|;)\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+(?=[^,]*$)/)
          .map((x) => trimEndPunct(x.replace(/^(?:and|or|a|an|the)\s+/i, '')))
          .filter(Boolean);
        const min = declared ? 2 : 3;
        const enumerated = declared || /,/.test(tail);
        const nounish = items.every((x) => !/\b(?:that|which|who|whom|where|when|is|are|was|were|has|have|can|will|use|uses|involve|involves|in nature)\b/i.test(x));
        if (enumerated && nounish && items.length >= min && items.every((x) => wordCount(x) <= 5)) {
          if (declared) {
            const n = NUMBER_WORDS[declared.toLowerCase()] ?? parseInt(declared, 10);
            if (n && n !== items.length) continue;
          }
          push(category, items, chunk, s, question, min);
        }
      }
    }
  });

  return lists;
}

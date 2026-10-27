// Where and when a paper is from: the university, course, semester, kind of exam and the date,
// read from the paper's own header the way a student would read it. Works offline (rules); the
// AI can refine it when it is switched on. Every field keeps the line it was read from.

export type ExamType = 'final' | 'mid' | 'test' | 'resit' | 'supplementary' | 'mock' | 'quiz';

export interface PaperOrigin {
  /** does this look like an exam / test paper (rather than notes)? */
  isPaper: boolean;
  university: string | null;
  universityShort: string | null;
  /** college, school, faculty or department */
  unit: string | null;
  programme: string | null;
  courseCode: string | null;
  courseName: string | null;
  /** "2022/2023" */
  academicYear: string | null;
  semester: number | null;
  yearOfStudy: number | null;
  examType: ExamType | null;
  /** the month the exam was sat, 1–12 */
  month: number | null;
  /** the calendar year the exam was sat */
  year: number | null;
  /** yyyy-mm-dd when the paper gives the exact day */
  date: string | null;
  duration: string | null;
  /** the line each field was read from (for "why do you think that?") */
  evidence: Partial<Record<OriginField, string>>;
  /** which fields were worked out rather than read (e.g. the year from the academic year) */
  inferred: OriginField[];
  source: 'rules' | 'ai' | 'both';
}

export type OriginField = 'university' | 'unit' | 'programme' | 'courseCode' | 'courseName' | 'academicYear' | 'semester' | 'yearOfStudy' | 'examType' | 'month' | 'year' | 'date' | 'duration';

export const EXAM_TYPES: { id: ExamType; label: string }[] = [
  { id: 'final', label: 'Final exam' },
  { id: 'mid', label: 'Mid-semester exam' },
  { id: 'test', label: 'Test / coursework' },
  { id: 'resit', label: 'Retake / special exam' },
  { id: 'supplementary', label: 'Supplementary exam' },
  { id: 'mock', label: 'Mock exam' },
  { id: 'quiz', label: 'Quiz' },
];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Universities and exam bodies students here upload papers from. `abbr` is only trusted when it stands alone. */
export const UNIVERSITIES: { name: string; short: string; words: string[]; abbr?: string[] }[] = [
  { name: 'Makerere University Business School', short: 'MUBS', words: ['makerere university business school'], abbr: ['MUBS'] },
  { name: 'Makerere University', short: 'Makerere', words: ['makerere university', 'makerere univ'], abbr: ['MUK', 'MAK'] },
  { name: 'Kyambogo University', short: 'Kyambogo', words: ['kyambogo university', 'kyambogo'], abbr: ['KYU'] },
  { name: 'Mbarara University of Science and Technology', short: 'MUST', words: ['mbarara university of science', 'mbarara university'] },
  { name: 'Gulu University', short: 'Gulu', words: ['gulu university'] },
  { name: 'Busitema University', short: 'Busitema', words: ['busitema university', 'busitema'] },
  { name: 'Kabale University', short: 'Kabale', words: ['kabale university'] },
  { name: 'Lira University', short: 'Lira', words: ['lira university'] },
  { name: 'Muni University', short: 'Muni', words: ['muni university'] },
  { name: 'Soroti University', short: 'Soroti', words: ['soroti university'] },
  { name: 'Uganda Christian University', short: 'UCU', words: ['uganda christian university'], abbr: ['UCU'] },
  { name: 'Uganda Martyrs University', short: 'UMU', words: ['uganda martyrs university'], abbr: ['UMU'] },
  { name: 'Kampala International University', short: 'KIU', words: ['kampala international university'], abbr: ['KIU'] },
  { name: 'Uganda Management Institute', short: 'UMI', words: ['uganda management institute'], abbr: ['UMI'] },
  { name: 'Islamic University in Uganda', short: 'IUIU', words: ['islamic university in uganda'], abbr: ['IUIU'] },
  { name: 'Ndejje University', short: 'Ndejje', words: ['ndejje university'] },
  { name: 'Nkumba University', short: 'Nkumba', words: ['nkumba university'] },
  { name: 'Kampala University', short: 'KU', words: ['kampala university'] },
  { name: 'Bugema University', short: 'Bugema', words: ['bugema university'] },
  { name: 'Victoria University', short: 'Victoria', words: ['victoria university'] },
  { name: 'Cavendish University Uganda', short: 'Cavendish', words: ['cavendish university'] },
  { name: 'ISBAT University', short: 'ISBAT', words: ['isbat university'], abbr: ['ISBAT'] },
  { name: 'Uganda Technology and Management University', short: 'UTAMU', words: ['uganda technology and management university'], abbr: ['UTAMU'] },
  { name: 'Mountains of the Moon University', short: 'MMU', words: ['mountains of the moon university'] },
  { name: 'Bishop Stuart University', short: 'BSU', words: ['bishop stuart university'] },
  { name: 'Uganda Pentecostal University', short: 'UPU', words: ['uganda pentecostal university'] },
  { name: 'Clarke International University', short: 'CIU', words: ['clarke international university', 'international health sciences university'] },
  { name: 'Aga Khan University', short: 'AKU', words: ['aga khan university'] },
  { name: 'Uganda Christian University Mukono', short: 'UCU', words: ['ucu mukono'] },
  { name: 'Law Development Centre', short: 'LDC', words: ['law development centre', 'law development center'], abbr: ['LDC'] },
  { name: 'Institute of Certified Public Accountants of Uganda', short: 'ICPAU', words: ['institute of certified public accountants of uganda', 'certified public accountants of uganda'], abbr: ['ICPAU'] },
  { name: 'Uganda National Examinations Board', short: 'UNEB', words: ['uganda national examinations board'], abbr: ['UNEB'] },
  { name: 'Uganda Allied Health Examinations Board', short: 'UAHEB', words: ['uganda allied health examinations board'], abbr: ['UAHEB'] },
  { name: 'Uganda Nurses and Midwives Examinations Board', short: 'UNMEB', words: ['uganda nurses and midwives examinations board'], abbr: ['UNMEB'] },
  { name: 'Uganda Business and Technical Examinations Board', short: 'UBTEB', words: ['uganda business and technical examinations board'], abbr: ['UBTEB'] },
  { name: 'University of Nairobi', short: 'UoN', words: ['university of nairobi'] },
  { name: 'Kenyatta University', short: 'KU', words: ['kenyatta university'] },
  { name: 'Jomo Kenyatta University of Agriculture and Technology', short: 'JKUAT', words: ['jomo kenyatta university'], abbr: ['JKUAT'] },
  { name: 'Moi University', short: 'Moi', words: ['moi university'] },
  { name: 'Egerton University', short: 'Egerton', words: ['egerton university'] },
  { name: 'Strathmore University', short: 'Strathmore', words: ['strathmore university'] },
  { name: 'University of Dar es Salaam', short: 'UDSM', words: ['university of dar es salaam'], abbr: ['UDSM'] },
  { name: 'Muhimbili University of Health and Allied Sciences', short: 'MUHAS', words: ['muhimbili university'], abbr: ['MUHAS'] },
  { name: 'University of Rwanda', short: 'UR', words: ['university of rwanda'] },
  { name: 'University of Juba', short: 'Juba', words: ['university of juba'] },
];

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, '1ST': 1, '2ND': 2, '3RD': 3, '4TH': 4, '5TH': 5 };
const num = (s: string) => ROMAN[s.toUpperCase()] ?? (/^\d$/.test(s) ? Number(s) : null);
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthOf = (s: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.slice(0, 3).toLowerCase()) + 1 || null;
const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s:–—-]+|[\s:;,.–—-]+$/g, '').trim();
const title = (s: string) =>
  (s === s.toUpperCase() || /\b[A-Z]{4,}\b/.test(s) ? s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Of|In|And|The|For|To|With|On|At)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase()) : s)
    .replace(/\b(Ii|Iii|Iv|Vi|Vii)\b/g, (r) => r.toUpperCase());

export function emptyOrigin(): PaperOrigin {
  return { isPaper: false, university: null, universityShort: null, unit: null, programme: null, courseCode: null, courseName: null, academicYear: null, semester: null, yearOfStudy: null, examType: null, month: null, year: null, date: null, duration: null, evidence: {}, inferred: [], source: 'rules' };
}

/** How much this reads like an exam paper (0 = notes). */
export function paperScore(text: string): number {
  const t = text.slice(0, 12_000);
  let s = 0;
  if (/\b(examinations?|exams?)\b/i.test(t.slice(0, 2500))) s += 1.5;
  if (/instructions?\s+(to\s+)?(candidates|students)/i.test(t)) s += 2;
  if (/answer\s+(all|any|only)\b/i.test(t)) s += 2;
  if (/\b(time|duration)\s*(allowed)?\s*[:\-–]?\s*(\d+(\.\d+)?|one|two|three|four)\s*(\d\/\d\s*)?(hours?|hrs?|minutes?|mins?)\b/i.test(t)) s += 1.5;
  if (/do\s+not\s+(open|turn)/i.test(t)) s += 1.5;
  const marks = (t.match(/[([]\s*\d{1,3}\s*(marks?|mks?)\s*[)\]]|\b\d{1,3}\s*marks\b/gi) || []).length;
  s += Math.min(3, marks * 0.5);
  if (/\bquestion\s+(one|1|i)\b/i.test(t)) s += 1;
  if (/\b(registration|reg\.?|student)\s*(no|number)\b/i.test(t)) s += 1;
  return s;
}

/** Read the paper's header. `name` is the file name, which often has the code or year too. */
export function detectOrigin(text: string, name = ''): PaperOrigin {
  const o = emptyOrigin();
  const head = text.slice(0, 3500);
  const lines = head.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const all = `${name.replace(/[_]+/g, ' ')}\n${head}`;
  const lineOf = (re: RegExp) => lines.find((l) => re.test(l)) || null;
  const ev = (f: OriginField, line: string | null) => {
    if (line) o.evidence[f] = tidy(line).slice(0, 140);
  };
  o.isPaper = paperScore(text) >= 4;

  // ── university / exam body ──
  const low = all.toLowerCase().replace(/\s+/g, ' ');
  let uniAt = Infinity;
  for (const u of UNIVERSITIES) {
    for (const w of u.words) {
      const at = low.indexOf(w);
      // the earliest (header) mention wins; a longer name at the same place wins (MUBS over Makerere)
      if (at >= 0 && (at < uniAt || (at === uniAt && u.name.length > (o.university || '').length))) {
        uniAt = at;
        o.university = u.name;
        o.universityShort = u.short;
        ev('university', lineOf(new RegExp(w.split(' ').join('\\s+'), 'i')) || name);
      }
    }
  }
  if (!o.university) {
    for (const u of UNIVERSITIES)
      for (const a of u.abbr || [])
        if (new RegExp(`(^|[^A-Za-z])${a}([^A-Za-z]|$)`).test(`${name} ${head.slice(0, 600)}`)) {
          o.university = u.name;
          o.universityShort = u.short;
          ev('university', lineOf(new RegExp(`\\b${a}\\b`)) || name);
        }
  }

  // ── college / school / faculty / department ──
  const unitLine = lineOf(/\b(college|school|faculty|institute|department)\s+of\s+[a-z]/i);
  if (unitLine) {
    const m = unitLine.match(/\b(college|school|faculty|institute|department)\s+of\s+([a-z &,'()-]{3,80})/i);
    if (m && !/university/i.test(m[2])) {
      o.unit = title(tidy(m[0].replace(/\b(end|first|second|semester|examinations?|bachelor|diploma)\b.*$/i, '')));
      ev('unit', unitLine);
    }
  }

  // ── programme ──
  const progLine = lineOf(/\b(bachelor|diploma|master|masters|doctor|certificate)\s+(of|in)\s+[a-z]/i);
  if (progLine) {
    const m = progLine.match(/\b(bachelor|diploma|masters?|doctor|certificate)\s+(of|in)\s+([a-z &,'()-]{3,90})/i);
    if (m) {
      o.programme = title(tidy(`${m[1]} ${m[2]} ${m[3]}`.replace(/\b(year|yr)\b.*$/i, '').replace(/\b(semester|examinations?)\b.*$/i, '')));
      ev('programme', progLine);
    }
  }

  // ── course code and name ──
  const CODE = '([A-Z]{2,5})\\s?[-/]?\\s?(\\d{3,4}[A-Z]?)';
  const labelled = all.match(new RegExp(`(?:course|subject|paper|unit)\\s*(?:code|no\\.?|number)?\\s*[:\\-–]\\s*${CODE}`, 'i'));
  const bad = /^(PAGE|FIG|TABLE|ISBN|ROOM|SECTION|AD|BC|PM|AM|ACT|CAP|NO|TEL|BOX|ID|DATE|YEAR|SEM)$/i;
  let code: RegExpMatchArray | null = labelled && !bad.test(labelled[1]) ? labelled : null;
  if (!code) {
    for (const m of all.matchAll(new RegExp(`\\b${CODE}\\b`, 'g'))) {
      if (!bad.test(m[1]) && !/^(19|20)\d\d$/.test(m[2])) {
        code = m;
        break;
      }
    }
  }
  if (code) {
    o.courseCode = `${code[1].toUpperCase()} ${code[2].toUpperCase()}`;
    const codeLine = lines.find((l) => l.replace(/\s/g, '').toUpperCase().includes(`${code![1]}${code![2]}`.toUpperCase())) || name;
    ev('courseCode', codeLine);
    // the name: "BST 2101: Biostatistics", or a "Course title:" line, or the line under the code
    const after = codeLine.replace(/\s/g, ' ').match(new RegExp(`${code[1]}\\s?[-/]?\\s?${code[2]}\\s*[:\\-–—]?\\s*([A-Za-z][A-Za-z &,'()/-]{3,80})`, 'i'));
    const named = all.match(/(?:course|subject|paper)\s*(?:title|name|unit)\s*[:\-–]\s*([A-Za-z][A-Za-z &,'()/-]{3,80})/i);
    const cand = named?.[1] || after?.[1] || null;
    if (cand && !/^(code|semester|year|time|date|examination)/i.test(cand)) {
      o.courseName = title(tidy(cand.replace(/\b(time|date|duration|semester|year)\b.*$/i, '')));
      ev('courseName', named ? lineOf(/(?:course|subject|paper)\s*(?:title|name|unit)/i) : codeLine);
    } else {
      const i = lines.indexOf(codeLine);
      const next = i >= 0 ? lines[i + 1] : null;
      if (next && /^[A-Z][A-Z &,'()-]{5,70}$/.test(next) && !/(UNIVERSITY|EXAMINATION|SEMESTER|INSTRUCTIONS|TIME|DATE|COLLEGE|SCHOOL|FACULTY|BACHELOR|DIPLOMA)/.test(next)) {
        o.courseName = title(tidy(next));
        ev('courseName', next);
      }
    }
  } else {
    const named = all.match(/(?:course|subject|paper)\s*(?:title|name|unit)?\s*[:\-–]\s*([A-Za-z][A-Za-z &,'()/-]{3,80})/i);
    if (named) {
      o.courseName = title(tidy(named[1].replace(/\b(time|date|duration|semester|year)\b.*$/i, '')));
      ev('courseName', lineOf(/(?:course|subject|paper)\s*(?:title|name|unit)?\s*[:\-–]/i));
    }
  }

  // ── academic year, semester, year of study ──
  const ay = all.match(/\b(20\d{2}|19\d{2})\s*[/\-–]\s*(20\d{2}|\d{2})\b/);
  if (ay) {
    const a = Number(ay[1]);
    const b = ay[2].length === 2 ? Math.floor(a / 100) * 100 + Number(ay[2]) : Number(ay[2]);
    if (b === a + 1) {
      o.academicYear = `${a}/${b}`;
      ev('academicYear', lineOf(new RegExp(`${ay[1]}\\s*[/\\-–]\\s*${ay[2]}`)) || name);
    }
  }
  const sem = all.match(/\b(first|second|third|1st|2nd|3rd)\s+(semester|trimester|term)\b/i) || all.match(/\b(?:semester|trimester|term)\s*[:\-–]?\s*(I{1,3}|ONE|TWO|THREE|[1-3])\b/i);
  const church = all.match(/\b(advent|easter|trinity)\s+(semester|term)\b/i); // UCU and others name semesters this way
  if (sem) {
    o.semester = num(sem[1]);
    ev('semester', lineOf(/(semester|trimester|term)/i));
  } else if (church) {
    o.semester = { advent: 1, easter: 2, trinity: 3 }[church[1].toLowerCase() as 'advent'] || null;
    ev('semester', lineOf(/(advent|easter|trinity)/i));
  }
  const yos = all.match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+year\b/i) || all.match(/\byear\s*(?:of\s+study)?\s*[:\-–]?\s*(I{1,3}|IV|V|ONE|TWO|THREE|FOUR|FIVE|[1-5])(?![\d/])\b/i);
  if (yos) {
    o.yearOfStudy = num(yos[1]);
    ev('yearOfStudy', lineOf(/\byear\b/i));
  }

  // ── kind of exam ──
  const h2 = all.slice(0, 2600);
  const types: [ExamType, RegExp][] = [
    ['supplementary', /\bsupplementar(y|ies)\b/i],
    ['resit', /\b(retake|re-?sit|special\s+exam(ination)?s?)\b/i],
    ['mock', /\bmock\b/i],
    ['mid', /\bmid[\s-]?(semester|term|sem)\b|\bmidterm\b/i],
    ['quiz', /\bquiz\b/i],
    ['test', /\b(course\s?work|continuous\s+assessment|c\.?a\.?t\.?\b|test\s*(one|two|1|2|i{1,2})?\b)/i],
    ['final', /\b(end[\s-]+of[\s-]+(semester|year|term|trimester)|final\s+exam(ination)?s?|university\s+exam(ination)?s?|degree\s+exam(ination)?s?|semester\s+exam(ination)?s?|examinations?\s+for\s+the\s+(award|degree))\b/i],
  ];
  for (const [t, re] of types) {
    if (re.test(h2)) {
      o.examType = t;
      ev('examType', lineOf(re) || name);
      break;
    }
  }
  if (!o.examType && o.isPaper && /\bexamination/i.test(h2)) {
    o.examType = 'final';
    ev('examType', lineOf(/examination/i));
    o.inferred.push('examType');
  }

  // ── when: an exact date, a month and year, or the academic year ──
  const dm = all.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_RE}[a-z]*[,.]?\\s*(\\d{4})\\b`, 'i')) || all.match(new RegExp(`\\b${MONTH_RE}[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})\\b`, 'i'));
  const numeric = all.match(/\b(?:date|day)\s*[:\-–]?\s*(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/i);
  if (dm) {
    const isDayFirst = /^\d/.test(dm[1]);
    const day = Number(isDayFirst ? dm[1] : dm[2]);
    const mon = monthOf(isDayFirst ? dm[2] : dm[1]);
    const yr = Number(dm[3]);
    if (mon && day >= 1 && day <= 31 && yr >= 1990 && yr <= 2100) {
      o.month = mon;
      o.year = yr;
      o.date = `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      ev('date', lineOf(new RegExp(MONTH_RE, 'i')) || name);
    }
  } else if (numeric) {
    const d = Number(numeric[1]);
    const m = Number(numeric[2]);
    const y = Number(numeric[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      o.month = m;
      o.year = y;
      o.date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      ev('date', lineOf(/\b(date|day)\b/i));
    }
  }
  if (!o.year) {
    // "MAY 2023", "May/June 2023", "NOVEMBER–DECEMBER 2022"
    const my = all.match(new RegExp(`\\b${MONTH_RE}[a-z]*\\s*(?:[/&–-]\\s*${MONTH_RE}[a-z]*)?[,.]?\\s*(\\d{4})\\b`, 'i'));
    if (my) {
      const y = Number(my[3]);
      if (y >= 1990 && y <= 2100) {
        o.month = monthOf(my[1]);
        o.year = y;
        ev('month', lineOf(new RegExp(MONTH_RE, 'i')) || name);
        ev('year', o.evidence.month || null);
      }
    }
  }
  if (!o.year && o.academicYear) {
    // semester I exams are sat at the end of the first calendar year, semester II in the second
    const [a, b] = o.academicYear.split('/').map(Number);
    o.year = o.semester === 1 ? a : b;
    o.inferred.push('year');
    o.evidence.year = o.evidence.academicYear;
  }
  if (!o.year) {
    const years = (head.slice(0, 1500).match(/\b(19[89]\d|20[0-4]\d)\b/g) || []).map(Number).filter((y) => y <= new Date().getFullYear() + 1);
    const fromName = name.match(/\b(19[89]\d|20[0-4]\d)\b/);
    const y = fromName ? Number(fromName[1]) : years.length ? Math.max(...years) : null;
    if (y) {
      o.year = y;
      o.inferred.push('year');
      ev('year', fromName ? name : lineOf(new RegExp(`\\b${y}\\b`)));
    }
  }

  // ── how long ──
  const dur = all.match(/\b(?:time|duration)\s*(?:allowed)?\s*[:\-–]?\s*((?:\d+(?:\.\d+)?|one|two|three|four|five)\s*(?:\d\/\d\s*|and\s+a\s+half\s+)?(?:hours?|hrs?)(?:\s*(?:and\s*)?\d+\s*(?:minutes|mins))?|\d+\s*(?:minutes|mins))\b/i);
  if (dur) {
    o.duration = tidy(dur[1]).toLowerCase().replace(/hrs?\b/, 'hours');
    ev('duration', lineOf(/\b(time|duration)\b/i));
  }
  return o;
}

/** A short, human line: "Makerere University · BST 2101 Biostatistics · Final exam, Semester I · May 2023". */
export function originLabel(o: Partial<PaperOrigin> | null | undefined, opts: { short?: boolean } = {}): string {
  if (!o) return '';
  const parts: string[] = [];
  if (o.university) parts.push(opts.short && o.universityShort ? o.universityShort : o.university);
  const course = [o.courseCode, opts.short ? null : o.courseName].filter(Boolean).join(' ');
  if (course) parts.push(course);
  const kind = [o.examType ? EXAM_TYPES.find((e) => e.id === o.examType)?.label : null, o.semester ? `Semester ${['I', 'II', 'III'][o.semester - 1] || o.semester}` : null].filter(Boolean).join(', ');
  if (kind) parts.push(kind);
  const when = o.month && o.year ? `${MONTHS[o.month - 1]} ${o.year}` : o.year ? String(o.year) : o.academicYear || '';
  if (when) parts.push(when + (o.academicYear && o.year && !opts.short ? ` (${o.academicYear})` : ''));
  return parts.join(' · ');
}

/** A name for the paper: "BST 2101 Biostatistics — May 2023 final (Makerere)". */
export function originName(o: Partial<PaperOrigin> | null | undefined, fallback: string): string {
  if (!o) return fallback;
  const course = [o.courseCode, o.courseName].filter(Boolean).join(' ');
  const when = o.month && o.year ? `${MONTHS[o.month - 1]} ${o.year}` : o.year ? String(o.year) : o.academicYear || '';
  const kind = o.examType ? { final: 'final', mid: 'mid-semester', test: 'test', resit: 'retake', supplementary: 'supplementary', mock: 'mock', quiz: 'quiz' }[o.examType] : '';
  const bits = [when, kind].filter(Boolean).join(' ');
  if (!course && !bits) return fallback;
  return `${course || fallback}${bits ? ` — ${bits}` : ''}${o.universityShort ? ` (${o.universityShort})` : ''}`.slice(0, 200);
}

const str = (v: unknown, max = 140) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
const int = (v: unknown, lo: number, hi: number) => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d]/g, '')) : Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/** Accept an origin from the browser or the AI, keeping only sensible values. */
export function cleanOrigin(raw: any): PaperOrigin {
  const o = emptyOrigin();
  if (!raw || typeof raw !== 'object') return o;
  o.isPaper = !!raw.isPaper;
  o.university = str(raw.university, 120);
  const known = o.university ? UNIVERSITIES.find((u) => u.name.toLowerCase() === o.university!.toLowerCase() || u.short.toLowerCase() === o.university!.toLowerCase()) : null;
  if (known) o.university = known.name;
  o.universityShort = str(raw.universityShort, 20) || known?.short || null;
  o.unit = str(raw.unit, 120);
  o.programme = str(raw.programme, 140);
  const code = str(raw.courseCode, 20)?.toUpperCase().match(/^([A-Z]{2,5})\s?[-/]?\s?(\d{3,4}[A-Z]?)$/);
  o.courseCode = code ? `${code[1]} ${code[2]}` : null;
  o.courseName = str(raw.courseName, 100);
  const ay = str(raw.academicYear, 12)?.match(/^(\d{4})\s*[/\-–]\s*(\d{2,4})$/);
  if (ay) {
    const a = Number(ay[1]);
    const b = ay[2].length === 2 ? Math.floor(a / 100) * 100 + Number(ay[2]) : Number(ay[2]);
    if (b === a + 1 && a >= 1990 && a <= 2100) o.academicYear = `${a}/${b}`;
  }
  o.semester = int(raw.semester, 1, 3);
  o.yearOfStudy = int(raw.yearOfStudy, 1, 7);
  o.examType = EXAM_TYPES.some((e) => e.id === raw.examType) ? raw.examType : null;
  o.month = int(raw.month, 1, 12);
  o.year = int(raw.year, 1990, 2100);
  const d = str(raw.date, 10)?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  o.date = d && Number(d[2]) >= 1 && Number(d[2]) <= 12 && Number(d[3]) >= 1 && Number(d[3]) <= 31 ? d[0] : null;
  if (o.date && !o.year) o.year = Number(o.date.slice(0, 4));
  if (o.date && !o.month) o.month = Number(o.date.slice(5, 7));
  o.duration = str(raw.duration, 40);
  if (raw.evidence && typeof raw.evidence === 'object') for (const [k, v] of Object.entries(raw.evidence)) if (str(v)) o.evidence[k as OriginField] = str(v)!;
  if (Array.isArray(raw.inferred)) o.inferred = raw.inferred.filter((x: unknown) => typeof x === 'string').slice(0, 13);
  o.source = raw.source === 'ai' || raw.source === 'both' ? raw.source : 'rules';
  return o;
}

/** The AI's reading fills gaps and fixes OCR slips; what the paper states plainly (rules) stays. */
export function mergeOrigin(rules: PaperOrigin, fromAi: PaperOrigin): PaperOrigin {
  const o: PaperOrigin = { ...rules, evidence: { ...fromAi.evidence, ...rules.evidence }, inferred: [...rules.inferred], source: 'both' };
  const keys: OriginField[] = ['university', 'unit', 'programme', 'courseCode', 'courseName', 'academicYear', 'semester', 'yearOfStudy', 'examType', 'month', 'year', 'date', 'duration'];
  for (const k of keys) {
    const r = (rules as any)[k];
    const a = (fromAi as any)[k];
    // fill what the rules missed, and prefer the AI where the rules only guessed
    if ((r === null || rules.inferred.includes(k)) && a !== null && a !== undefined) {
      (o as any)[k] = a;
      o.inferred = o.inferred.filter((x) => x !== k);
    }
  }
  if (!o.universityShort && o.university) o.universityShort = UNIVERSITIES.find((u) => u.name === o.university)?.short || null;
  o.isPaper = rules.isPaper || fromAi.isPaper;
  return o;
}

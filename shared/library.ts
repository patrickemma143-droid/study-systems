// The shared library: faculties, item types, and smart guesses from the notes themselves.

export interface Faculty {
  id: string;
  label: string;
  short: string;
  /** words that point to this faculty, matched on whole words in the title and notes */
  words: string[];
}

export const FACULTIES: Faculty[] = [
  { id: 'medicine', label: 'Medicine & Health Sciences', short: 'Medicine', words: ['anatomy', 'physiology', 'pharmacology', 'nursing', 'clinical', 'pathology', 'epidemiology', 'epidemiological', 'biostatistics', 'public health', 'disease', 'diseases', 'patient', 'patients', 'medicine', 'medical', 'surgery', 'microbiology', 'immunology', 'midwifery', 'dental', 'pharmacy', 'hospital', 'diagnosis', 'infection', 'health'] },
  { id: 'engineering', label: 'Engineering & Technology', short: 'Engineering', words: ['engineering', 'civil', 'mechanical', 'electrical', 'structural', 'thermodynamics', 'circuit', 'circuits', 'surveying', 'fluid mechanics', 'statics', 'dynamics', 'materials', 'beam', 'beams', 'voltage', 'transformer', 'machine', 'construction', 'concrete', 'hydraulics', 'telecommunication'] },
  { id: 'computing', label: 'Computing & ICT', short: 'Computing', words: ['programming', 'software', 'database', 'databases', 'network', 'networks', 'algorithm', 'algorithms', 'computer', 'computing', 'java', 'python', 'sql', 'operating system', 'data structures', 'web', 'cybersecurity', 'information systems', 'ict'] },
  { id: 'business', label: 'Business & Economics', short: 'Business', words: ['accounting', 'finance', 'financial', 'marketing', 'management', 'economics', 'economic', 'business', 'audit', 'auditing', 'taxation', 'entrepreneurship', 'procurement', 'banking', 'investment', 'demand', 'supply', 'commerce', 'human resource'] },
  { id: 'law', label: 'Law', short: 'Law', words: ['law', 'legal', 'court', 'courts', 'constitution', 'constitutional', 'tort', 'torts', 'statute', 'jurisprudence', 'criminal law', 'plaintiff', 'defendant', 'evidence act', 'judgment'] },
  { id: 'education', label: 'Education', short: 'Education', words: ['education', 'teaching', 'pedagogy', 'curriculum', 'learners', 'classroom', 'teacher', 'teachers', 'instruction', 'assessment'] },
  { id: 'agriculture', label: 'Agriculture & Environment', short: 'Agriculture', words: ['agriculture', 'agricultural', 'crop', 'crops', 'soil', 'soils', 'livestock', 'agronomy', 'environment', 'environmental', 'forestry', 'fisheries', 'veterinary', 'horticulture', 'irrigation'] },
  { id: 'sciences', label: 'Natural Sciences & Mathematics', short: 'Sciences', words: ['physics', 'chemistry', 'biology', 'mathematics', 'calculus', 'algebra', 'statistics', 'cell', 'cells', 'organic', 'molecule', 'molecules', 'botany', 'zoology', 'genetics', 'probability', 'mitosis'] },
  { id: 'humanities', label: 'Arts, Humanities & Social Sciences', short: 'Arts & Social', words: ['history', 'sociology', 'psychology', 'political', 'politics', 'literature', 'philosophy', 'development studies', 'anthropology', 'geography', 'religion', 'language', 'linguistics', 'journalism', 'social work', 'gender'] },
  { id: 'other', label: 'Other', short: 'Other', words: [] },
];

export const facultyById = (id: string) => FACULTIES.find((f) => f.id === id) || FACULTIES[FACULTIES.length - 1];

export const ITEM_TYPES = [
  { id: 'notes', label: 'Lecture notes' },
  { id: 'slides', label: 'Lecture slides' },
  { id: 'book', label: 'Book' },
  { id: 'paper', label: 'Past paper' },
] as const;
export type ItemType = (typeof ITEM_TYPES)[number]['id'];

/** Which faculty do these notes most likely belong to? */
export function suggestFaculty(text: string, title = ''): string {
  const t = ` ${`${title} ${title} ${title} ${text.slice(0, 40_000)}`.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `;
  let best = 'other';
  let score = 1;
  for (const f of FACULTIES) {
    let s = 0;
    for (const w of f.words) {
      const n = t.split(` ${w} `).length - 1;
      s += Math.min(n, 8) * (w.includes(' ') ? 2 : 1);
    }
    if (s > score) {
      score = s;
      best = f.id;
    }
  }
  return best;
}

/** "BST 2101", "CSC1100" — the first course code in the title or notes. */
export function guessCourseCode(text: string): string | null {
  const m = text.slice(0, 20_000).match(/\b([A-Z]{2,5})\s?-?(\d{3,4})\b/);
  return m && !/^(PAGE|FIG|TABLE|ISBN|ROOM|SECTION|AD|BC|PM|AM)$/.test(m[1]) ? `${m[1]} ${m[2]}` : null;
}

/** The exam year written on a past paper ("May 2023", "2022/2023"). */
export function guessYear(text: string): number | null {
  const years = (text.slice(0, 4000).match(/\b(19[89]\d|20[0-4]\d)\b/g) || []).map(Number).filter((y) => y <= new Date().getFullYear() + 1);
  return years.length ? Math.max(...years) : null;
}

/** A fingerprint of the notes, so the same lecture uploaded twice is spotted. */
export function normaliseForHash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 30_000);
}

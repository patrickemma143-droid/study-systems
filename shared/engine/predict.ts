// Exam predictor: which lessons come up in past papers, how often, how recently, and for how many marks.
import type { StudyPack } from './types';
import { analyzePaper } from './paper';
import { contentStems } from './text';

export interface PredictedTopic {
  chunk: number;
  title: string;
  /** papers it appeared in */
  appeared: number;
  years: number[];
  marks: number;
  /** 0..100 */
  score: number;
  likelihood: 'Very likely' | 'Likely' | 'Possible' | 'Not seen yet';
  /** came up in older papers but not the last two: examiners often bring these back */
  comeback: boolean;
  questions: { text: string; year: number | null; marks: number | null }[];
}

export interface Prediction {
  papers: number;
  years: number[];
  method: 'past-papers' | 'notes';
  topics: PredictedTopic[];
}

export function predictTopics(pack: StudyPack, papers: { text: string; year: number | null }[]): Prediction {
  const chunkStems = pack.chunks.map((c) => {
    const strong = new Set(contentStems([c.title, ...c.keyTerms, ...pack.glossary.filter((g) => g.chunk === c.index).map((g) => g.term)].join(' ')));
    const body = new Set(contentStems(c.body.map((p) => p.x).join(' ')));
    return { strong, body };
  });
  const stats = pack.chunks.map((c) => ({ chunk: c.index, title: c.title, papers: new Set<number>(), years: new Set<number>(), marks: 0, questions: [] as PredictedTopic['questions'] }));

  papers.forEach((p, pi) => {
    const qs = analyzePaper(p.text).questions || [];
    for (const q of qs) {
      const stems = [...new Set(contentStems(q.text))];
      if (!stems.length) continue;
      // the lesson whose key words the question uses most (title and key terms count three times)
      let best = -1;
      let bestScore = 0;
      chunkStems.forEach((cs, i) => {
        const s = stems.reduce((n, w) => n + (cs.strong.has(w) ? 3 : cs.body.has(w) ? 1 : 0), 0) / Math.sqrt(stems.length);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      if (best < 0 || bestScore < 1.5) continue;
      const st = stats[best];
      st.papers.add(pi);
      if (p.year) st.years.add(p.year);
      st.marks += q.marks || (q.objective ? 1 : 0);
      if (st.questions.length < 6) st.questions.push({ text: q.text.slice(0, 240), year: p.year, marks: q.marks });
    }
  });

  const allYears = [...new Set(papers.map((p) => p.year).filter((y): y is number => !!y))].sort((a, b) => b - a);
  const recent = new Set(allYears.slice(0, 2));
  const n = papers.length;
  const maxMarks = Math.max(1, ...stats.map((s) => s.marks));

  const topics: PredictedTopic[] = stats.map((s) => {
    const share = n ? s.papers.size / n : 0;
    const years = [...s.years].sort((a, b) => b - a);
    const inRecent = years.some((y) => recent.has(y));
    const comeback = n >= 3 && s.papers.size > 0 && allYears.length >= 3 && !inRecent;
    const imp = pack.chunks[s.chunk]?.importance || 0;
    let score = n
      ? 100 * (0.6 * share + 0.2 * (s.marks / maxMarks) + (inRecent ? 0.1 : 0) + (comeback ? 0.1 : 0) + 0.1 * imp)
      : 100 * (0.25 + 0.5 * imp); // no past papers: what the notes stress most
    score = Math.round(Math.max(0, Math.min(100, score)));
    const likelihood: PredictedTopic['likelihood'] = n && s.papers.size === 0 ? 'Not seen yet' : score >= 70 ? 'Very likely' : score >= 45 ? 'Likely' : 'Possible';
    return { chunk: s.chunk, title: s.title, appeared: s.papers.size, years, marks: s.marks, score, likelihood, comeback, questions: s.questions };
  });
  topics.sort((a, b) => b.score - a.score || a.chunk - b.chunk);
  return { papers: n, years: allYears, method: n ? 'past-papers' : 'notes', topics };
}

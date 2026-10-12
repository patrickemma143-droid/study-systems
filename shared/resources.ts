import type { Resource } from './engine/types';

/** Free, trusted places to learn more about a topic — no API keys needed. */
export function resourceLinks(topic: string, wikiUrl?: string, simpleUrl?: string): Resource[] {
  const q = encodeURIComponent(topic.trim());
  const list: Resource[] = [];
  if (simpleUrl) list.push({ name: 'Simple English Wikipedia', url: simpleUrl, kind: 'article', note: 'The same topic in plain, easy English.' });
  if (wikiUrl) list.push({ name: 'Wikipedia', url: wikiUrl, kind: 'article', note: 'The full article this pack was built from.' });
  list.push(
    { name: 'Khan Academy', url: `https://www.khanacademy.org/search?page_search_query=${q}`, kind: 'course', note: 'Free lessons with videos and practice exercises.' },
    { name: 'YouTube explainers', url: `https://www.youtube.com/results?search_query=${q}+explained`, kind: 'video', note: 'Short videos. Good when you are tired of reading.' },
    { name: 'OpenStax textbooks', url: `https://www.google.com/search?q=site%3Aopenstax.org+${q}`, kind: 'book', note: 'Free, peer-reviewed university textbooks.' },
    { name: 'LibreTexts', url: `https://www.google.com/search?q=site%3Alibretexts.org+${q}`, kind: 'book', note: 'Open textbooks used by universities worldwide.' },
    { name: 'MIT OpenCourseWare', url: `https://ocw.mit.edu/search/?q=${q}`, kind: 'course', note: 'Real university lecture notes and past exams.' },
    { name: 'Google Scholar', url: `https://scholar.google.com/scholar?q=${q}`, kind: 'research', note: 'Research papers, for coursework and dissertations.' },
    { name: 'Past-paper practice', url: `https://www.google.com/search?q=${q}+exam+questions+and+answers+pdf`, kind: 'practice', note: 'Find past exam questions to test yourself.' },
  );
  return list;
}

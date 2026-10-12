// "Topic only" mode: builds study material from Wikipedia (free, no API key).
import { config } from '../config';

const UA = `CharisStudy/1.0 (${config.contactEmail})`;

export interface TopicSource {
  title: string;
  text: string;
  url: string;
  simpleIntro?: string;
  simpleUrl?: string;
  related: string[];
}

const DROP_SECTIONS = /^(see also|references|further reading|external links|notes|bibliography|sources|citations|footnotes|gallery|works cited|explanatory notes|literature)$/i;

async function getJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
  return res.json();
}

function api(host: string, params: Record<string, string>): string {
  const u = new URL(`https://${host}/w/api.php`);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', origin: '*', ...params })) u.searchParams.set(k, v);
  return u.toString();
}

/** Strip trailing reference sections and cap the length so the pack stays digestible. */
export function trimArticle(text: string, maxWords = 9000): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let skipping = false;
  let words = 0;
  for (const line of lines) {
    const h = line.match(/^(=+)\s*(.+?)\s*=+$/);
    if (h) {
      skipping = DROP_SECTIONS.test(h[2]);
      if (!skipping) out.push('', line, '');
      continue;
    }
    if (skipping) continue;
    words += line.split(/\s+/).length;
    if (words > maxWords) break;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function fetchTopic(topic: string): Promise<TopicSource | null> {
  const search = await getJSON(api('en.wikipedia.org', { action: 'query', list: 'search', srsearch: topic, srlimit: '6', srprop: '' }));
  const titles: string[] = (search?.query?.search || []).map((r: any) => r.title);
  if (!titles.length) return null;

  for (const title of titles.slice(0, 3)) {
    const page = await getJSON(
      api('en.wikipedia.org', { action: 'query', prop: 'extracts|info|pageprops', explaintext: '1', exsectionformat: 'wiki', inprop: 'url', redirects: '1', titles: title }),
    );
    const p = page?.query?.pages?.[0];
    if (!p || p.missing || p.pageprops?.disambiguation !== undefined) continue;
    const extract: string = p.extract || '';
    if (/may refer to:/.test(extract.slice(0, 300)) || extract.split(/\s+/).length < 80) continue;

    let simpleIntro: string | undefined;
    let simpleUrl: string | undefined;
    try {
      const simple = await getJSON(api('simple.wikipedia.org', { action: 'query', prop: 'extracts|info', exintro: '1', explaintext: '1', inprop: 'url', redirects: '1', titles: p.title }));
      const sp = simple?.query?.pages?.[0];
      if (sp && !sp.missing && sp.extract && sp.extract.length > 80) {
        simpleIntro = sp.extract.trim();
        simpleUrl = sp.fullurl;
      }
    } catch {
      /* Simple English article is optional */
    }

    return {
      title: p.title,
      text: `${p.title}\n\n${trimArticle(extract)}`,
      url: p.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      simpleIntro,
      simpleUrl,
      related: titles.filter((t) => t !== p.title).slice(0, 5),
    };
  }
  return null;
}

// Word (.docx) and PowerPoint (.pptx) readers — both run fully in the browser.
import type { SourceBlock } from '@shared/engine/types';

export async function extractDocx(file: File): Promise<SourceBlock[]> {
  const mod: any = await import('mammoth/mammoth.browser.min.js');
  const mammoth = mod.default || mod;
  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"] },
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: SourceBlock[] = [];
  const walk = (el: Element) => {
    for (const node of Array.from(el.children)) {
      const tag = node.tagName.toLowerCase();
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^h[1-6]$/.test(tag)) {
        if (text) blocks.push({ kind: 'heading', text, level: Math.min(3, Number(tag[1])) });
      } else if (tag === 'p') {
        if (!text) continue;
        // a short paragraph that is entirely bold is usually a heading typed without a heading style
        const strong = node.querySelector('strong');
        const allBold = strong && strong.textContent?.trim() === text && text.split(' ').length <= 12 && !/[.;,]$/.test(text);
        blocks.push(allBold ? { kind: 'heading', text, level: 2 } : { kind: 'para', text });
      } else if (tag === 'ul' || tag === 'ol') {
        for (const li of Array.from(node.querySelectorAll(':scope > li'))) {
          const own = Array.from(li.childNodes)
            .filter((c) => !(c instanceof Element && /^(ul|ol)$/i.test(c.tagName)))
            .map((c) => c.textContent || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (own) blocks.push({ kind: 'item', text: own });
          const nested = li.querySelector(':scope > ul, :scope > ol');
          if (nested) walk({ children: [nested] } as unknown as Element);
        }
      } else if (tag === 'table') {
        for (const tr of Array.from(node.querySelectorAll('tr'))) {
          const cells = Array.from(tr.querySelectorAll('td,th')).map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
          if (cells.length === 2) blocks.push({ kind: 'item', text: `${cells[0]}: ${cells[1]}` });
          else if (cells.length) blocks.push({ kind: 'para', text: cells.join(' — ') });
        }
      } else if (node.children.length) {
        walk(node);
      } else if (text) {
        blocks.push({ kind: 'para', text });
      }
    }
  };
  walk(doc.body);
  return blocks;
}

export async function extractPptx(file: File): Promise<SourceBlock[]> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const parser = new DOMParser();
  const blocks: SourceBlock[] = [];

  const paragraphs = (el: Element) =>
    Array.from(el.getElementsByTagName('a:p'))
      .map((p) => ({
        text: Array.from(p.getElementsByTagName('a:t'))
          .map((t) => t.textContent || '')
          .join('')
          .replace(/\s+/g, ' ')
          .trim(),
        level: Number(p.getElementsByTagName('a:pPr')[0]?.getAttribute('lvl') || 0),
      }))
      .filter((p) => p.text);

  for (const [i, name] of slideFiles.entries()) {
    const xml = parser.parseFromString(await zip.file(name)!.async('text'), 'application/xml');
    const shapes = Array.from(xml.getElementsByTagName('p:sp'));
    let title = '';
    const body: { text: string; level: number }[] = [];
    for (const sp of shapes) {
      const ph = sp.getElementsByTagName('p:ph')[0];
      const type = ph?.getAttribute('type') || '';
      const paras = paragraphs(sp);
      if (!paras.length) continue;
      if (/title/i.test(type) && !title) title = paras.map((p) => p.text).join(' ');
      else if (type === 'sldNum' || type === 'ftr' || type === 'dt') continue;
      else body.push(...paras);
    }
    if (!title && body.length && body[0].text.split(' ').length <= 10) title = body.shift()!.text;
    if (title) blocks.push({ kind: 'heading', text: title, level: 2, page: i + 1 });
    for (const b of body) {
      const sentence = /[.!?]$/.test(b.text) && b.text.split(' ').length > 18;
      blocks.push({ kind: sentence ? 'para' : 'item', text: b.text, page: i + 1 });
    }
    // speaker notes often hold the lecturer's actual explanation
    const relsFile = zip.file(name.replace('slides/', 'slides/_rels/') + '.rels');
    let notesFile = null;
    if (relsFile) {
      const rels = parser.parseFromString(await relsFile.async('text'), 'application/xml');
      const rel = Array.from(rels.getElementsByTagName('Relationship')).find((r) => /notesSlide$/.test(r.getAttribute('Type') || ''));
      const target = rel?.getAttribute('Target');
      if (target) notesFile = zip.file(`ppt/notesSlides/${target.split('/').pop()}`);
    }
    if (notesFile) {
      const nx = parser.parseFromString(await notesFile.async('text'), 'application/xml');
      const notes = Array.from(nx.getElementsByTagName('p:sp'))
        .filter((sp) => (sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') || '') === 'body')
        .flatMap((sp) => paragraphs(sp).map((p) => p.text))
        .join(' ')
        .trim();
      if (notes.split(' ').length > 6) blocks.push({ kind: 'para', text: notes, page: i + 1 });
    }
  }
  return blocks;
}

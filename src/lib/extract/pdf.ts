// Reads text from a PDF in the browser with pdf.js, keeping headings, paragraphs and bullet points.
import type { SourceBlock } from '@shared/engine/types';

type Progress = (done: number, total: number) => void;

interface Line {
  text: string;
  size: number;
  y: number;
  page: number;
}

const BULLET = /^[-•▪●◦○■□➢➤►▶✓✔·\-–*]\s*/;

export async function extractPdf(file: File, onProgress?: Progress): Promise<{ blocks: SourceBlock[]; pages: number; scanned: boolean }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const lines: Line[] = [];
  let chars = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let cur: { parts: string[]; size: number; y: number; endX: number } | null = null;
    const push = () => {
      if (!cur) return;
      const text = cur.parts.join('').replace(/\s+/g, ' ').trim();
      if (text) lines.push({ text, size: cur.size, y: cur.y, page: p });
      chars += text.length;
      cur = null;
    };
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue;
      const t = item.transform as number[];
      const size = Math.round((Math.hypot(t[2], t[3]) || item.height || 10) * 2) / 2;
      const x = t[4];
      const y = t[5];
      if (cur && Math.abs(y - cur.y) > Math.max(size, cur.size) * 0.55) push();
      if (!cur) cur = { parts: [], size, y, endX: x };
      if (item.str) {
        const gap = x - cur.endX;
        const prev = cur.parts[cur.parts.length - 1] || '';
        if (cur.parts.length && gap > size * 0.18 && !/\s$/.test(prev) && !/^\s/.test(item.str)) cur.parts.push(' ');
        cur.parts.push(item.str);
        if (item.str.trim()) cur.size = Math.max(cur.size, size);
        cur.endX = x + (item.width || 0);
      }
      if (item.hasEOL) push();
    }
    push();
    page.cleanup();
    onProgress?.(p, doc.numPages);
  }
  const pages = doc.numPages;
  await doc.destroy();

  return { blocks: linesToBlocks(lines), pages, scanned: chars < pages * 60 };
}

export function linesToBlocks(lines: Line[]): SourceBlock[] {
  if (!lines.length) return [];
  // body text size = the size used for the most characters
  const weight = new Map<number, number>();
  for (const l of lines) weight.set(l.size, (weight.get(l.size) || 0) + l.text.length);
  const body = [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const isHeading = (l: Line) => {
    const wc = l.text.split(/\s+/).length;
    if (wc > 16 || l.text.length > 120) return false;
    if (l.size >= body * 1.18) return true;
    const letters = l.text.replace(/[^A-Za-z]/g, '');
    return l.size >= body && letters.length >= 4 && letters === letters.toUpperCase() && wc <= 8 && !/[.,;]$/.test(l.text);
  };
  const headingSizes = [...new Set(lines.filter(isHeading).map((l) => l.size))].sort((a, b) => b - a);
  const levelOf = (size: number) => Math.min(3, headingSizes.indexOf(size) + 1 || 3);

  const blocks: SourceBlock[] = [];
  let prev: Line | null = null;
  for (const l of lines) {
    const heading = isHeading(l);
    const bullet = BULLET.test(l.text) && l.text.length > 2;
    const last = blocks[blocks.length - 1];
    const gap = prev && prev.page === l.page ? prev.y - l.y : Infinity;
    const sameFlow = prev && prev.page === l.page && Math.abs(prev.size - l.size) <= 0.6 && gap > 0 && gap < Math.max(l.size, prev.size) * 1.75;

    if (heading) {
      if (last?.kind === 'heading' && sameFlow && prev && isHeading(prev) && last.text.length < 100) last.text += ` ${l.text}`;
      else blocks.push({ kind: 'heading', text: l.text, level: levelOf(l.size), page: l.page });
    } else if (bullet) {
      blocks.push({ kind: 'item', text: l.text.replace(BULLET, ''), page: l.page });
    } else if (last && sameFlow && last.kind !== 'heading' && !(prev && isHeading(prev))) {
      last.text += ` ${l.text}`;
    } else {
      blocks.push({ kind: 'para', text: l.text, page: l.page });
    }
    prev = l;
  }
  return blocks;
}

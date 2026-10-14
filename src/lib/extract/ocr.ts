// Text recognition (OCR) for scanned PDFs and photos of notes, run on the student's own device.
// The engine is served from our site (public/ocr), so nothing is uploaded anywhere to read it.
import type { SourceBlock } from '@shared/engine/types';
import { blocksFromPlainText } from '@shared/engine/blocks';
import { levenshtein } from '@shared/engine/text';

export interface OcrProgress {
  page: number;
  done: number;
  total: number;
  /** seconds left, once we have timed a page or two */
  secondsLeft: number | null;
  stage: 'starting' | 'reading';
}

async function makeWorker() {
  const { createWorker } = await import('tesseract.js');
  const base = `${location.origin}/ocr`;
  return createWorker('eng', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/`,
    langPath: `${base}/lang`,
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'write', // keep the language file in the browser after the first download
  });
}

/** Specks, table borders and margin marks read as stray characters. */
function isJunk(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const tokens = t.split(/\s+/);
  const words = tokens.filter((w) => /^[A-Za-z][a-z]{2,}[.,;:)?!]*$/.test(w)).length;
  const noise = tokens.filter((w) => w.length === 1 || /^[^A-Za-z0-9]+$/.test(w) || /[|{}§~_“”]/.test(w)).length;
  return words < 2 ? t.length < 40 || noise / tokens.length > 0.3 : noise / tokens.length > 0.45;
}

/** Strip stray marks at the start and end of a line ("H . . . R : § Real text"). */
function trimNoise(line: string): string {
  const tokens = line.trim().split(/\s+/);
  const bad = (w: string) => w.length === 1 || /^[^A-Za-z0-9]+$/.test(w) || /[|§~]/.test(w);
  let a = 0;
  while (a < tokens.length - 1 && bad(tokens[a]) && bad(tokens[a + 1])) a++;
  if (a && bad(tokens[a]) && !/^[AI]$/.test(tokens[a])) a++;
  let b = tokens.length;
  while (b > a + 1 && bad(tokens[b - 1])) b--;
  return tokens.slice(a, b).join(' ');
}

/** Tidy what the scanner saw: join words broken across lines, drop specks and page numbers. */
function clean(text: string): string {
  return text
    .replace(/-\n(?=[a-z])/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*(page\s*)?\d{1,4}\s*$/i.test(l) && !isJunk(l))
    .map(trimNoise)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toBlocks(text: string, page: number): SourceBlock[] {
  return blocksFromPlainText(clean(text)).map((b) => ({ ...b, page }));
}

export async function ocrPdf(file: File, from: number, to: number, onProgress: (p: OcrProgress) => void, signal?: AbortSignal): Promise<SourceBlock[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const first = Math.max(1, from);
  const last = Math.min(doc.numPages, to);
  const total = last - first + 1;
  onProgress({ page: first, done: 0, total, secondsLeft: null, stage: 'starting' });
  const worker = await makeWorker();
  const pageTexts: { page: number; text: string }[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const started = Date.now();
  try {
    for (let p = first; p <= last; p++) {
      if (signal?.aborted) break;
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.max(1.5, Math.min(3, 1800 / Math.max(base.width, base.height)));
      const vp = page.getViewport({ scale });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
      const { data } = await worker.recognize(canvas);
      pageTexts.push({ page: p, text: data.text || '' });
      page.cleanup();
      const done = p - first + 1;
      const per = (Date.now() - started) / 1000 / done;
      onProgress({ page: p, done, total, secondsLeft: done >= 1 ? Math.round(per * (total - done)) : null, stage: 'reading' });
    }
  } finally {
    await worker.terminate();
    await doc.destroy();
  }
  return dropRunningHeads(pageTexts).flatMap((x) => toBlocks(x.text, x.page));
}

/** Book headers and footers repeat on every page (with OCR typos): remove lines seen near the top or bottom of many pages. */
function dropRunningHeads(pages: { page: number; text: string }[]) {
  if (pages.length < 3) return pages;
  const key = (l: string) => l.toLowerCase().replace(/[^a-z]/g, '');
  const near = (a: string, b: string) => a.length >= 8 && b.length >= 8 && 1 - levenshtein(a, b) / Math.max(a.length, b.length) >= 0.7;
  const edges = pages.map((p) => {
    const lines = p.text.split('\n').filter((l) => key(l).length >= 8);
    return [...lines.slice(0, 3), ...lines.slice(-3)].map(key);
  });
  const limit = Math.max(2, Math.ceil(pages.length * 0.3));
  return pages.map((p, i) => {
    const lines = p.text.split('\n');
    const nonEmpty = lines.filter((l) => key(l).length >= 8);
    const edgeSet = new Set([...nonEmpty.slice(0, 3), ...nonEmpty.slice(-3)]);
    return {
      ...p,
      text: lines
        .filter((l) => {
          if (!edgeSet.has(l)) return true;
          const k = key(l);
          const hits = edges.filter((e, j) => j !== i && e.some((x) => near(x, k))).length + 1;
          return hits < limit;
        })
        .join('\n'),
    };
  });
}

export async function ocrImages(files: File[], onProgress: (p: OcrProgress) => void, signal?: AbortSignal): Promise<SourceBlock[]> {
  onProgress({ page: 1, done: 0, total: files.length, secondsLeft: null, stage: 'starting' });
  const worker = await makeWorker();
  const blocks: SourceBlock[] = [];
  const started = Date.now();
  try {
    for (let i = 0; i < files.length; i++) {
      if (signal?.aborted) break;
      const { data } = await worker.recognize(files[i]);
      blocks.push(...toBlocks(data.text || '', i + 1));
      const done = i + 1;
      onProgress({ page: done, done, total: files.length, secondsLeft: Math.round(((Date.now() - started) / 1000 / done) * (files.length - done)), stage: 'reading' });
    }
  } finally {
    await worker.terminate();
  }
  return blocks;
}

/** Rough seconds per page on a typical laptop or phone, before we have measured. */
export const SECONDS_PER_PAGE = 6;

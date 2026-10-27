import type { SourceBlock } from '@shared/engine/types';
import { blocksFromPlainText } from '@shared/engine/blocks';

export type SourceType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'image';

export const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain';

export function sourceTypeOf(file: File): SourceType | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.pptx')) return 'pptx';
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) return 'txt';
  if (/\.(jpe?g|png|webp)$/.test(name) || /^image\/(jpeg|png|webp)$/.test(file.type)) return 'image';
  return null;
}

export interface Extracted {
  blocks: SourceBlock[];
  type: SourceType;
  warning?: string;
  /** A scanned PDF or a photo: the text has to be recognised (OCR) first */
  needsOcr?: boolean;
  pages?: number;
  /** the file's own text, line by line (text files), e.g. so past-paper question numbers survive */
  raw?: string;
}

/** The text of an extracted file as one string, keeping the original lines when we have them. */
export const plainText = (r: Extracted) => r.raw ?? r.blocks.map((b) => b.text).join('\n');

export async function extractFile(file: File, onProgress?: (msg: string) => void): Promise<Extracted> {
  const type = sourceTypeOf(file);
  if (!type) throw new Error('This file type isn’t supported yet. Use a PDF, Word (.docx), PowerPoint (.pptx), a photo (JPG, PNG) or a text file. For old .doc or .ppt files, save them as .docx or .pptx first.');
  if (file.size > 60 * 1024 * 1024) throw new Error('This file is over 60 MB. Split it into smaller parts, or save it as a PDF without images.');

  if (type === 'pdf') {
    const { extractPdf } = await import('./pdf');
    const r = await extractPdf(file, (d, t) => onProgress?.(`Reading page ${d} of ${t}…`));
    return { blocks: r.blocks, type, needsOcr: r.scanned, pages: r.pages };
  }
  if (type === 'image') return { blocks: [], type, needsOcr: true, pages: 1 };
  if (type === 'docx') {
    onProgress?.('Reading your Word document…');
    const { extractDocx } = await import('./office');
    return { blocks: await extractDocx(file), type };
  }
  if (type === 'pptx') {
    onProgress?.('Reading your slides…');
    const { extractPptx } = await import('./office');
    return { blocks: await extractPptx(file), type };
  }
  onProgress?.('Reading your notes…');
  const raw = await file.text();
  return { blocks: blocksFromPlainText(raw), type, raw };
}

/**
 * Read any file, running text recognition automatically for scans and photos
 * (used for past papers, which are short). Long scans are capped at `maxPages`.
 */
export async function extractWithOcr(file: File, onProgress: (msg: string) => void, maxPages = 25): Promise<Extracted> {
  const r = await extractFile(file, onProgress);
  if (!r.needsOcr) return r;
  const { ocrImages, ocrPdf } = await import('./ocr');
  const say = (p: { done: number; total: number; secondsLeft: number | null; stage: string }) =>
    onProgress(p.stage === 'starting' ? 'Getting text recognition ready…' : `Recognising text: page ${p.done} of ${p.total}${p.secondsLeft ? `, about ${Math.ceil(p.secondsLeft / 60)} min left` : ''}…`);
  const blocks = r.type === 'image' ? await ocrImages([file], say) : await ocrPdf(file, 1, Math.min(r.pages || 1, maxPages), say);
  return { ...r, blocks, needsOcr: false, warning: r.pages && r.pages > maxPages ? `Only the first ${maxPages} pages were read.` : undefined };
}

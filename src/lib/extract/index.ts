import type { SourceBlock } from '@shared/engine/types';
import { blocksFromPlainText } from '@shared/engine/blocks';

export type SourceType = 'pdf' | 'docx' | 'pptx' | 'txt';

export const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain';

export function sourceTypeOf(file: File): SourceType | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.pptx')) return 'pptx';
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) return 'txt';
  return null;
}

export async function extractFile(file: File, onProgress?: (msg: string) => void): Promise<{ blocks: SourceBlock[]; type: SourceType; warning?: string }> {
  const type = sourceTypeOf(file);
  if (!type) throw new Error('This file type isn’t supported yet. Use a PDF, Word (.docx), PowerPoint (.pptx) or text file. For old .doc or .ppt files, save them as .docx or .pptx first.');
  if (file.size > 60 * 1024 * 1024) throw new Error('This file is over 60 MB. Split it into smaller parts, or save it as a PDF without images.');

  if (type === 'pdf') {
    const { extractPdf } = await import('./pdf');
    const r = await extractPdf(file, (d, t) => onProgress?.(`Reading page ${d} of ${t}…`));
    return { blocks: r.blocks, type, warning: r.scanned ? 'This PDF has very little selectable text — it may be scanned or made of photos. Charis Study can only read typed text for now.' : undefined };
  }
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
  return { blocks: blocksFromPlainText(await file.text()), type };
}

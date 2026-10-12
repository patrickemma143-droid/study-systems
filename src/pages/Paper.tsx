import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardList, Download, FileUp, Printer, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { buildPaper, type Paper as PaperDoc, type PaperAnalysis } from '@shared/engine/paper';
import type { Level } from '@shared/engine/levels';
import { api } from '../api';
import { useAuth } from '../auth';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';
import { ACCEPT, extractFile } from '../lib/extract';
import { usePack, useStudyTimer } from '../lib/usePack';

interface PastPaper {
  id: number;
  name: string;
  analysis: PaperAnalysis | null;
  createdAt: number;
}

export default function Paper() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const toast = useToast();
  const { data, error } = usePack(id);
  useStudyTimer('paper', id);
  const [level, setLevel] = useState<Level>('medium');
  const [selected, setSelected] = useState<number[]>([]);
  const [styleId, setStyleId] = useState<number | 0>(0);
  const [guide, setGuide] = useState(false);
  const [seed, setSeed] = useState(1);
  const [papers, setPapers] = useState<PastPaper[]>([]);

  useEffect(() => {
    api<{ papers: PastPaper[] }>(`/packs/${id}/past-papers`)
      .then((r) => setPapers(r.papers))
      .catch(() => {});
  }, [id]);

  const style = papers.find((p) => p.id === styleId)?.analysis || null;
  const paper = useMemo(() => (data ? buildPaper(data.pack.data, data.pack.title, { level, chunks: selected, style, seed: `${seed}` }) : null), [data, level, selected, style, seed]);

  if (error) return <ErrorState message={error} />;
  if (!data || !paper) return <Loading />;
  const chunks = data.pack.data.chunks;
  const school = (user?.university || 'Charis Study').toUpperCase();

  function downloadWord() {
    const html = `<html><head><meta charset="utf-8"><title>${esc(paper!.title)}</title></head><body style="font-family:Calibri,Arial,sans-serif">${paperHtml(paper!, school, guide)}</body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data!.pack.title.replace(/[^\w\- ]+/g, '').slice(0, 60) || 'exam'} - mock paper.doc`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="no-print">
        <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Exam paper' }]} />
        <h1 className="row">
          <ClipboardList size={28} color="var(--biro)" /> Mock exam paper
        </h1>
        <p className="muted" style={{ maxWidth: 680 }}>
          A full paper from your notes: objective questions, short answers and essay questions with marks, plus a marking guide. Sit it under exam conditions, then mark yourself.
        </p>

        <div className="sheet stack">
          <div className="grid cols-2" style={{ gap: 14, alignItems: 'start' }}>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Difficulty
              </div>
              <div className="segmented" role="group" aria-label="Difficulty">
                {(['easy', 'medium', 'hard'] as Level[]).map((l) => (
                  <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)}>
                    {l[0].toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="style" style={{ display: 'block', marginBottom: 6 }}>
                Set it like
              </label>
              <select id="style" className="input" value={styleId} onChange={(e) => setStyleId(Number(e.target.value))}>
                <option value={0}>A standard university paper</option>
                {papers.map((p) => (
                  <option key={p.id} value={p.id}>
                    My past paper: {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              Topics
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="chip" aria-pressed={!selected.length} onClick={() => setSelected([])}>
                The whole pack
              </button>
              {chunks.map((c) => (
                <button key={c.index} className="chip" aria-pressed={selected.includes(c.index)} onClick={() => setSelected((s) => (s.includes(c.index) ? s.filter((x) => x !== c.index) : [...s, c.index]))}>
                  {c.index + 1}. {c.title.length > 26 ? `${c.title.slice(0, 25)}…` : c.title}
                </button>
              ))}
            </div>
          </div>
          <div className="row between">
            <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> Include the marking guide
            </label>
            <div className="row">
              <button className="btn" onClick={() => setSeed((n) => n + 1)}>
                <RefreshCw size={16} /> New paper
              </button>
              <button className="btn" onClick={downloadWord}>
                <Download size={16} /> Word file
              </button>
              <button className="btn primary" onClick={() => window.print()}>
                <Printer size={16} /> Download PDF
              </button>
            </div>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            “Download PDF” opens your print screen: choose “Save as PDF”. Tip: download it without the marking guide, sit the paper, then download the guide to mark yourself.
          </p>
        </div>

        <PastPapers packId={id} papers={papers} onChange={setPapers} onUse={(pid) => setStyleId(pid)} chunkTitle={(i) => chunks[i]?.title || ''} toast={toast} />
      </div>

      <article className="paper-doc" dangerouslySetInnerHTML={{ __html: paperHtml(paper, school, guide) }} />
    </div>
  );
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The paper as plain HTML: shown on the page, printed to PDF, and saved as a Word file. */
function paperHtml(p: PaperDoc, school: string, withGuide: boolean): string {
  const head = `<div style="text-align:center"><div style="font-weight:700;letter-spacing:.04em">${esc(school)}</div><div style="font-weight:700;margin-top:4px">${esc(p.title.toUpperCase())}</div><div>MOCK EXAMINATION</div><div style="margin-top:6px">Time: ${esc(p.duration)} &nbsp;·&nbsp; Total: ${p.totalMarks} marks</div></div>`;
  const ins = `<p style="margin-top:14px"><strong>INSTRUCTIONS</strong></p><ol>${p.instructions.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>`;
  const secs = p.sections
    .map((s) => {
      const qs = s.questions
        .map((q) => {
          const opts = q.options ? `<ol type="A" style="margin:4px 0 0">${q.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>` : '';
          return `<div style="margin:10px 0;page-break-inside:avoid"><div style="display:flex;gap:8px"><strong>${q.n}.</strong><div style="flex:1">${esc(q.text)}${opts}</div><span style="white-space:nowrap">(${q.marks} mark${q.marks === 1 ? '' : 's'})</span></div></div>`;
        })
        .join('');
      return `<h3 style="margin-top:22px;border-bottom:1px solid #999;padding-bottom:4px">SECTION ${s.name}: ${esc(s.title.toUpperCase())}</h3><p><em>${esc(s.instruction)}</em></p>${qs}`;
    })
    .join('');
  const guide = withGuide
    ? `<div style="page-break-before:always"></div><h2 style="text-align:center;margin-top:24px">MARKING GUIDE</h2>${p.sections
        .map(
          (s) =>
            `<h3>Section ${s.name}</h3>${s.questions
              .map((q) => `<div style="margin:8px 0;page-break-inside:avoid"><strong>${q.n}.</strong> ${q.options ? `<strong>${esc(q.answer)}</strong>` : ''}<ul style="margin:4px 0">${q.guide.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>`)
              .join('')}`,
        )
        .join('')}`
    : '';
  return `${head}${ins}${secs}<p style="text-align:center;margin-top:24px">— END —</p>${guide}`;
}

function PastPapers({ packId, papers, onChange, onUse, chunkTitle, toast }: { packId: number; papers: PastPaper[]; onChange: (p: PastPaper[]) => void; onUse: (id: number) => void; chunkTitle: (i: number) => string; toast: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function upload(text: string, paperName: string) {
    setBusy('Reading how the questions are set…');
    try {
      const r = await api<{ paper: PastPaper }>(`/packs/${packId}/past-papers`, { body: { name: paperName, text } });
      onChange([r.paper, ...papers]);
      onUse(r.paper.id);
      setPaste('');
      setName('');
      toast('Past paper added. Your mock paper now follows its style.');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  }
  async function fromFile(f: File | undefined) {
    if (!f) return;
    try {
      setBusy('Opening the paper…');
      const r = await extractFile(f, setBusy);
      await upload(r.blocks.map((b) => b.text).join('\n'), f.name.replace(/\.[^.]+$/, ''));
    } catch (e: any) {
      toast(e.message);
      setBusy(null);
    }
  }
  async function remove(p: PastPaper) {
    await api(`/packs/${packId}/past-papers/${p.id}`, { method: 'DELETE' });
    onChange(papers.filter((x) => x.id !== p.id));
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>Past papers</h2>
      </div>
      <div className="sheet stack">
        <p className="small muted" style={{ margin: 0 }}>
          Upload a past paper for this course. We work out how your examiners set questions — sections, marks, the command words they like (“discuss”, “distinguish”…) and which of your topics came up — and set your mock papers the same way.
        </p>
        <div className="row">
          <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => fromFile(e.target.files?.[0])} />
          <button className="btn" onClick={() => input.current?.click()} disabled={!!busy}>
            <FileUp size={16} /> Upload a past paper (PDF, Word, text)
          </button>
          {busy && <span className="small muted">{busy}</span>}
        </div>
        <details>
          <summary className="small" style={{ cursor: 'pointer' }}>
            Or paste the questions
          </summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <input className="input" placeholder="Name, e.g. BIO 1101 May 2025" value={name} onChange={(e) => setName(e.target.value)} />
            <textarea className="textarea" style={{ minHeight: 140 }} placeholder={'SECTION A\n1. Define osmosis. (2 marks)\n2. …'} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <div>
              <button className="btn primary" disabled={!paste.trim() || !!busy} onClick={() => upload(paste, name.trim() || 'Pasted past paper')}>
                <Wand2 size={16} /> Analyse this paper
              </button>
            </div>
          </div>
        </details>
      </div>
      {papers.map((p) => (
        <div key={p.id} className="sheet" style={{ marginTop: 12 }}>
          <div className="row between">
            <strong>{p.name}</strong>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small primary" onClick={() => onUse(p.id)}>
                <Wand2 size={15} /> Make a paper like this
              </button>
              <button className="btn small ghost icon" aria-label="Remove this past paper" onClick={() => remove(p)}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          {p.analysis && <Analysis a={p.analysis} chunkTitle={chunkTitle} />}
        </div>
      ))}
    </div>
  );
}

function Analysis({ a, chunkTitle }: { a: PaperAnalysis; chunkTitle: (i: number) => string }) {
  const maxCmd = Math.max(1, ...a.commands.map((c) => c.count));
  return (
    <div className="stack" style={{ marginTop: 10 }}>
      <div className="row small" style={{ gap: 14 }}>
        <span>
          <strong>{a.questionCount}</strong> questions
        </span>
        {a.totalMarks && (
          <span>
            <strong>{a.totalMarks}</strong> marks
          </span>
        )}
        {a.duration && <span>{a.duration}</span>}
        <span>
          {a.mix.objective} objective · {a.mix.short} short · {a.mix.long} long
        </span>
        {a.marks.typical && <span>typical question: {a.marks.typical} marks</span>}
      </div>
      {a.sections.length > 0 && (
        <div className="small">
          {a.sections.map((s) => (
            <div key={s.name}>
              <strong>Section {s.name}</strong>: {s.questions} questions{s.marks ? `, ${s.marks} marks` : ''}
              {s.instruction ? ` — ${s.instruction}` : ''}
            </div>
          ))}
        </div>
      )}
      {a.instructions.length > 0 && <div className="small muted">{a.instructions.join(' · ')}</div>}
      {a.commands.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: 4 }}>
            How they ask (command words)
          </div>
          {a.commands.slice(0, 8).map((c) => (
            <div key={c.word} className="row small" style={{ gap: 8, flexWrap: 'nowrap', marginBottom: 3 }}>
              <span style={{ width: 110, textTransform: 'capitalize' }}>{c.word}</span>
              <div className="meter" style={{ flex: 1 }}>
                <span style={{ width: `${(c.count / maxCmd) * 100}%` }} />
              </div>
              <span style={{ width: 20, textAlign: 'right' }}>{c.count}</span>
            </div>
          ))}
        </div>
      )}
      {a.topics.length > 0 && (
        <div className="small">
          <span className="label">Topics from your notes that came up: </span>
          {a.topics.slice(0, 6).map((t) => chunkTitle(t.chunk) || t.title).join(', ')}
        </div>
      )}
      <p className="hint" style={{ margin: 0 }}>
        Examiners often repeat the style and favourite topics. Practise answering with the command words above: “discuss” wants both sides, “distinguish” wants clear differences, “outline” wants short points.
      </p>
    </div>
  );
}

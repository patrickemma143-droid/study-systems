import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpenCheck, ClipboardList, Download, Eye, EyeOff, FileUp, KeyRound, Printer, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { buildPaper, type KeyAnalysis, type Paper as PaperDoc, type PaperAnalysis } from '@shared/engine/paper';
import type { Level } from '@shared/engine/levels';
import { api } from '../api';
import { useAuth } from '../auth';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';
import { ACCEPT, extractWithOcr } from '../lib/extract';
import { usePack, useStudyTimer } from '../lib/usePack';

interface PastPaper {
  id: number;
  name: string;
  analysis: PaperAnalysis | null;
  key: KeyAnalysis | null;
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
  useEffect(() => {
    if (data && location.hash === '#past-papers') document.getElementById('past-papers')?.scrollIntoView({ block: 'start' });
  }, [data]);

  const style = papers.find((p) => p.id === styleId)?.analysis || null;
  const keyStyle = papers.find((p) => p.id === styleId)?.key?.style || null;
  const paper = useMemo(() => (data ? buildPaper(data.pack.data, data.pack.title, { level, chunks: selected, style, seed: `${seed}` }) : null), [data, level, selected, style, seed]);

  if (error) return <ErrorState message={error} />;
  if (!data || !paper) return <Loading />;
  const chunks = data.pack.data.chunks;
  const school = (user?.university || 'Charis Study').toUpperCase();

  function downloadWord() {
    const html = `<html><head><meta charset="utf-8"><title>${esc(paper!.title)}</title></head><body style="font-family:Calibri,Arial,sans-serif">${paperHtml(paper!, school, guide, keyStyle)}</body></html>`;
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
          <ClipboardList size={28} color="var(--biro)" /> Exam papers
        </h1>
        <p className="muted" style={{ maxWidth: 680 }}>
          Upload your past papers (and their marking keys) so we learn how your examiners set questions. Then practise the real papers, or make new mock papers in the same style.
        </p>

        <PastPapers packId={id} papers={papers} onChange={setPapers} onUse={(pid) => setStyleId(pid)} chunkTitle={(i) => chunks[i]?.title || ''} toast={toast} />

        <div className="section-head" style={{ marginTop: 30 }}>
          <h2>Make a mock paper</h2>
        </div>

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

      </div>

      <article className="paper-doc" dangerouslySetInnerHTML={{ __html: paperHtml(paper, school, guide, keyStyle) }} />
    </div>
  );
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The paper as plain HTML: shown on the page, printed to PDF, and saved as a Word file. */
function paperHtml(p: PaperDoc, school: string, withGuide: boolean, keyStyle?: string | null): string {
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
    ? `<div style="page-break-before:always"></div><h2 style="text-align:center;margin-top:24px">MARKING GUIDE</h2>${keyStyle ? `<p style="text-align:center"><em>Mark it like your past paper’s key: ${esc(keyStyle)}.</em></p>` : ''}${p.sections
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
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [paste, setPaste] = useState('');
  const [pasteKey, setPasteKey] = useState('');
  const [name, setName] = useState('');
  const [practise, setPractise] = useState<number | null>(null);
  const paperInput = useRef<HTMLInputElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);

  async function readText(f: File, label: string) {
    const r = await extractWithOcr(f, (m) => setBusy(`${label}: ${m}`));
    return r.blocks.map((b) => b.text).join('\n');
  }

  async function add() {
    if (!paperFile && !paste.trim()) return toast('Choose the past paper file, or paste its questions.');
    try {
      const text = paperFile ? await readText(paperFile, 'Past paper') : paste;
      const keyText = keyFile ? await readText(keyFile, 'Marking key') : pasteKey.trim() || undefined;
      setBusy('Working out how the questions are set…');
      const r = await api<{ paper: PastPaper }>(`/packs/${packId}/past-papers`, { body: { name: name.trim() || paperFile?.name.replace(/\.[^.]+$/, '') || 'Past paper', text, keyText } });
      onChange([r.paper, ...papers]);
      onUse(r.paper.id);
      setPaperFile(null);
      setKeyFile(null);
      setPaste('');
      setPasteKey('');
      setName('');
      toast(r.paper.key ? 'Past paper and marking key added.' : 'Past paper added. You can add its marking key any time.');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function addKey(p: PastPaper, f: File | undefined) {
    if (!f) return;
    try {
      const text = await readText(f, 'Marking key');
      setBusy('Reading the marking key…');
      const r = await api<{ paper: PastPaper }>(`/packs/${packId}/past-papers/${p.id}/key`, { body: { text } });
      onChange(papers.map((x) => (x.id === p.id ? r.paper : x)));
      toast(`Marking key added: answers found for ${Object.keys(r.paper.key?.answers || {}).length} questions.`);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: PastPaper) {
    if (!window.confirm(`Remove “${p.name}”?`)) return;
    await api(`/packs/${packId}/past-papers/${p.id}`, { method: 'DELETE' });
    onChange(papers.filter((x) => x.id !== p.id));
  }

  return (
    <div>
      <div className="sheet stack ai-card" id="past-papers">
        <h2 style={{ fontSize: '1.15rem', margin: 0 }} className="row">
          <FileUp size={20} color="var(--biro)" /> Upload a past paper
        </h2>
        <p className="small muted" style={{ margin: 0 }}>
          PDF, Word, a scanned PDF or photos all work — scans are read on your device. Add the marking key too if you have it: we use it to show model answers and to mark the way your lecturers do.
        </p>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="upload-slot">
            <div className="label">1. The past paper</div>
            <input ref={paperInput} type="file" accept={ACCEPT} hidden onChange={(e) => setPaperFile(e.target.files?.[0] || null)} />
            <button className="btn" onClick={() => paperInput.current?.click()} disabled={!!busy}>
              <FileUp size={16} /> {paperFile ? 'Change file' : 'Choose the paper'}
            </button>
            {paperFile && <div className="small">{paperFile.name}</div>}
          </div>
          <div className="upload-slot">
            <div className="label">2. Its marking key (optional)</div>
            <input ref={keyInput} type="file" accept={ACCEPT} hidden onChange={(e) => setKeyFile(e.target.files?.[0] || null)} />
            <button className="btn" onClick={() => keyInput.current?.click()} disabled={!!busy}>
              <KeyRound size={16} /> {keyFile ? 'Change file' : 'Choose the key'}
            </button>
            {keyFile && <div className="small">{keyFile.name}</div>}
          </div>
        </div>
        <details>
          <summary className="small" style={{ cursor: 'pointer' }}>
            No file? Paste the questions (and answers) instead
          </summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <textarea className="textarea" style={{ minHeight: 130 }} placeholder={'SECTION A\n1. Define osmosis. (2 marks)\n2. …'} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Past paper questions" />
            <textarea className="textarea" style={{ minHeight: 90 }} placeholder={'Marking key (optional)\n1. Movement of water molecules from… (1 mark each point)\n2. …'} value={pasteKey} onChange={(e) => setPasteKey(e.target.value)} aria-label="Marking key" />
          </div>
        </details>
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Name, e.g. BIO 1101 May 2025" value={name} onChange={(e) => setName(e.target.value)} aria-label="Past paper name" />
          <button className="btn primary" onClick={add} disabled={!!busy || (!paperFile && !paste.trim())}>
            <Wand2 size={16} /> Read this paper
          </button>
        </div>
        {busy && (
          <div className="small row" style={{ gap: 8 }}>
            <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> {busy}
          </div>
        )}
      </div>

      {papers.map((p) => (
        <div key={p.id} className="sheet" style={{ marginTop: 12 }}>
          <div className="row between">
            <div>
              <strong>{p.name}</strong>
              <div className="small muted">{p.key ? `With marking key: answers for ${Object.keys(p.key.answers).length} questions, ${p.key.style}` : 'No marking key yet'}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small" onClick={() => setPractise(practise === p.id ? null : p.id)}>
                <BookOpenCheck size={15} /> {practise === p.id ? 'Close' : 'Practise this paper'}
              </button>
              <button className="btn small primary" onClick={() => onUse(p.id)}>
                <Wand2 size={15} /> Make a paper like this
              </button>
              <label className="btn small" title="Add or replace the marking key">
                <KeyRound size={15} /> {p.key ? 'Replace key' : 'Add key'}
                <input type="file" accept={ACCEPT} hidden onChange={(e) => addKey(p, e.target.files?.[0])} />
              </label>
              <button className="btn small ghost icon" aria-label="Remove this past paper" onClick={() => remove(p)}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          {practise === p.id && p.analysis ? <Practise a={p.analysis} k={p.key} /> : p.analysis && <Analysis a={p.analysis} chunkTitle={chunkTitle} />}
        </div>
      ))}
    </div>
  );
}

/** Work through the real past paper; the marking key's answer is one tap away. */
function Practise({ a, k }: { a: PaperAnalysis; k: KeyAnalysis | null }) {
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const qs = a.questions || [];
  if (!qs.length) return <p className="small muted">We couldn’t list the questions from this paper.</p>;
  let lastSection: string | null = null;
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <p className="hint" style={{ margin: 0 }}>
        Answer each question on paper or in your head first, then check {k ? 'the marking key' : 'your notes'}.
      </p>
      {qs.map((q, i) => {
        const header = q.section && q.section !== lastSection ? <div className="label">Section {q.section}</div> : null;
        lastSection = q.section;
        const ans = k?.answers[String(Number(q.n))];
        return (
          <div key={i}>
            {header}
            <div className="point-check" style={{ display: 'block' }}>
              <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <div>
                  <strong>{q.n}.</strong> {q.text}
                  {q.options && (
                    <ol type="A" className="small" style={{ margin: '4px 0 0' }}>
                      {q.options.map((o, j) => (
                        <li key={j}>{o}</li>
                      ))}
                    </ol>
                  )}
                </div>
                {ans && (
                  <button className="btn ghost small" onClick={() => setShown((s) => ({ ...s, [i]: !s[i] }))} aria-expanded={!!shown[i]}>
                    {shown[i] ? <EyeOff size={15} /> : <Eye size={15} />} {shown[i] ? 'Hide' : 'Answer'}
                  </button>
                )}
              </div>
              {ans && shown[i] && <div className="small key-answer">{ans}</div>}
            </div>
          </div>
        );
      })}
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

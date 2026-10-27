// Snap a problem: a photo (or typed question) from homework or a past paper, worked through on the
// whiteboard so the student learns the method, then a similar one to try alone.
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ImagePlus, Sparkles, X } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/ui';
import { left, updateAiUsage, useAiStatus } from '../lib/ai';
import { TutorFace } from '../components/TutorFace';
import { useTutorPrefs } from '../lib/tutor/prefs';

/** Shrink a photo before sending: sharp enough to read, small enough for mobile data. */
async function shrink(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That picture could not be opened.'));
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Homework() {
  const nav = useNavigate();
  const tutorPrefs = useTutorPrefs();
  const toast = useToast();
  const ai = useAiStatus();
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    try {
      setImage(await shrink(f));
    } catch (e: any) {
      toast(e.message);
    }
  }
  async function go(e: FormEvent) {
    e.preventDefault();
    if (!image && text.trim().length < 3) return toast('Take a photo of the problem or type it.');
    setBusy(true);
    try {
      const r = await api<{ id: number; usage: any }>('/tutor/problem', { body: { image: image || undefined, text: text.trim() || undefined } });
      updateAiUsage(r.usage);
      nav(`/tutor/${r.id}`);
    } catch (err: any) {
      toast(err.message);
      setBusy(false);
    }
  }

  if (ai && !ai.enabled) {
    return (
      <div className="sheet empty" style={{ maxWidth: 560, margin: '40px auto' }}>
        <h2>Homework help needs the AI tutor</h2>
        <p className="muted">The AI tutor isn’t switched on for this site yet. Meanwhile, turn your notes into lessons and practice.</p>
        <Link to="/new" className="btn primary">
          Add notes
        </Link>
      </div>
    );
  }

  return (
    <div className="homework">
      <div className="hw-head">
        <TutorFace size={52} tutor={tutorPrefs.prefs?.tutor} />
        <div>
          <h1>Stuck on a problem?</h1>
          <p className="muted" style={{ margin: 0 }}>
            Snap a homework or past-paper question. We’ll work it out together on the board, step by step — then you try one on your own.
          </p>
        </div>
      </div>
      <form className="sheet stack" onSubmit={go}>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {image ? (
          <div className="hw-photo">
            <img src={image} alt="Your problem" />
            <button type="button" className="btn icon small" onClick={() => setImage(null)} aria-label="Remove the photo">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="hw-pick">
            <button type="button" className="hw-pickbtn primary" onClick={() => camera.current?.click()}>
              <Camera size={28} />
              <span>Take a photo</span>
            </button>
            <button type="button" className="hw-pickbtn" onClick={() => gallery.current?.click()}>
              <ImagePlus size={28} />
              <span>Choose a picture</span>
            </button>
          </div>
        )}
        <label className="label" htmlFor="hwt">
          {image ? 'Anything to add? (optional)' : 'Or type the question'}
        </label>
        <textarea id="hwt" className="input" rows={image ? 2 : 4} value={text} onChange={(e) => setText(e.target.value)} placeholder={image ? 'e.g. I only need help with part (b)' : 'e.g. Solve 2x² − 7x + 3 = 0, or: Explain why enzymes stop working at high temperatures.'} />
        <button className="btn primary big" disabled={busy || (!image && text.trim().length < 3)}>
          <Sparkles size={18} /> {busy ? 'Reading the problem…' : 'Teach me how to solve it'}
        </button>
        {ai && <p className="small muted" style={{ margin: 0 }}>{left(ai, 'homework')} homework problems left today.</p>}
      </form>
    </div>
  );
}

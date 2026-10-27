// Choose your tutor: a face and a natural voice (with a preview), the accent, the speed and captions.
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Play, Square, X } from 'lucide-react';
import { ACCENTS, TUTORS, type TutorPrefs } from '../../shared/tutors';
import { TutorFace } from './TutorFace';
import { TutorAvatar } from './TutorAvatar';
import { meterAudio, unlockMeter } from '../lib/tutor/meter';
import { webglOk } from '../lib/tutor/webgl';
import { useToast } from './ui';

const SOUNDS: { id: TutorPrefs['sound']; label: string; hint: string }[] = [
  { id: 'natural', label: 'Natural voice', hint: 'A real-sounding AI voice' },
  { id: 'device', label: 'Phone voice', hint: 'Works offline, uses no data' },
  { id: 'silent', label: 'Captions only', hint: 'For the library or late at night' },
];

export function TutorPicker({ prefs, natural, onSave, onClose }: { prefs: TutorPrefs; natural: boolean; onSave: (p: TutorPrefs) => void | Promise<void>; onClose: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<TutorPrefs>(prefs);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      audio.current?.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [onClose]);

  async function preview(id: string) {
    const t = TUTORS.find((x) => x.id === id)!;
    unlockMeter();
    setP((cur) => ({ ...cur, tutor: id }));
    audio.current?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (playing === id) {
      setPlaying(null);
      return;
    }
    const text = `Hi, I'm ${t.name}. Let's learn this together. Stop me any time to ask a question.`;
    if (p.sound !== 'natural' || !natural) {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = p.rate;
        u.onend = () => setPlaying(null);
        window.speechSynthesis.speak(u);
        setPlaying(id);
      }
      return;
    }
    setLoadingId(id);
    try {
      const r = await fetch('/api/tutor/voice', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: t.voice, accent: p.accent }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'The voice preview is not available right now.');
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      a.playbackRate = p.rate;
      meterAudio(a);
      a.onended = () => {
        setPlaying(null);
        URL.revokeObjectURL(url);
      };
      audio.current = a;
      await a.play();
      setPlaying(id);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="picker-backdrop" role="dialog" aria-modal="true" aria-label="Choose your tutor" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker">
        <div className="picker-head">
          <div>
            <h2>Choose your tutor</h2>
            <p className="small muted">Pick a voice you enjoy listening to — tap ▶ to hear it.</p>
          </div>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {p.avatar && webglOk() && (
          <div className="picker-hero">
            <div className="picker-live">
              <TutorAvatar tutor={p.tutor} speaking={playing === p.tutor} framing="bust" />
            </div>
            <div>
              <strong>{TUTORS.find((t) => t.id === p.tutor)?.name}</strong>
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                {TUTORS.find((t) => t.id === p.tutor)?.sounds}. Teaches on the board beside you, looks at you while you answer, and reacts when you get it right.
              </p>
            </div>
          </div>
        )}
        <div className="picker-grid">
          {TUTORS.map((t) => (
            <div key={t.id} className={`picker-card ${p.tutor === t.id ? 'on' : ''}`}>
              <button className="picker-pick" onClick={() => setP({ ...p, tutor: t.id })} aria-pressed={p.tutor === t.id}>
                <TutorFace tutor={t.id} size={58} speaking={playing === t.id} />
                <strong>{t.name}</strong>
                <span className="small muted">{t.sounds}</span>
                {p.tutor === t.id && (
                  <span className="picker-check" aria-hidden>
                    <Check size={14} />
                  </span>
                )}
              </button>
              <button className="picker-play" onClick={() => preview(t.id)} aria-label={`Hear ${t.name}`} disabled={loadingId !== null && loadingId !== t.id}>
                {loadingId === t.id ? <Loader2 size={15} className="spin" /> : playing === t.id ? <Square size={13} /> : <Play size={15} />}
              </button>
            </div>
          ))}
        </div>

        <div className="picker-row">
          <span className="label">Accent</span>
          <div className="segmented">
            {ACCENTS.map((a) => (
              <button key={a.id} aria-pressed={p.accent === a.id} onClick={() => setP({ ...p, accent: a.id })}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="picker-row">
          <span className="label">Sound</span>
          <div className="segmented wrap">
            {SOUNDS.map((s) => (
              <button key={s.id} aria-pressed={p.sound === s.id} onClick={() => setP({ ...p, sound: s.id })} title={s.hint} disabled={s.id === 'natural' && !natural}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="picker-row">
          <span className="label">Speed</span>
          <div className="segmented">
            {[0.85, 1, 1.25, 1.5].map((r) => (
              <button key={r} aria-pressed={p.rate === r} onClick={() => setP({ ...p, rate: r })}>
                {r}×
              </button>
            ))}
          </div>
        </div>
        <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={p.captions} onChange={(e) => setP({ ...p, captions: e.target.checked })} /> Show captions while the tutor talks
        </label>
        <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={p.avatar} onChange={(e) => setP({ ...p, avatar: e.target.checked })} /> Show the tutor on video (3D) — turn off to save data and battery
        </label>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await onSave(p);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

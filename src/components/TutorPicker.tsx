// Choose your tutor: a character and a natural voice (with a talking preview), the accent, how it
// sounds, the speed, captions and hands-free listening.
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Play, Square, X } from 'lucide-react';
import { ACCENTS, TUTORS, tutorById, type TutorPrefs } from '../../shared/tutors';
import { TutorFace } from './TutorFace';
import { TutorCharacter, type CharacterControl } from './TutorCharacter';
import { Narrator, type Track } from '../lib/tutor/narrator';
import { REST, type Mouth } from '../lib/tutor/visemes';
import { handsFreeSupported } from '../lib/tutor/handsfree';
import { useToast } from './ui';

const SOUNDS: { id: TutorPrefs['sound']; label: string; hint: string }[] = [
  { id: 'natural', label: 'Natural voice', hint: 'A real-sounding AI voice' },
  { id: 'device', label: 'Phone voice', hint: 'Works offline, uses no data' },
  { id: 'silent', label: 'Captions only', hint: 'For the library or late at night' },
];

export function TutorPicker({ prefs, natural, onSave, onClose }: { prefs: TutorPrefs; natural: boolean; onSave: (p: TutorPrefs) => void | Promise<void>; onClose: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<TutorPrefs>(prefs);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const track = useRef<Track | null>(null);
  const narrator = useRef<Narrator | null>(null);
  const control = useRef<CharacterControl>({ x: 0, sit: false, act: 'wave', side: 'right', speaking: false, pulse: 0 });
  const mouth = useRef<(() => Mouth) | null>(() => track.current?.mouth() ?? REST);
  const t = tutorById(p.tutor);

  const stop = () => {
    track.current?.stop();
    track.current = null;
    narrator.current?.dispose();
    narrator.current = null;
    setPlaying(false);
    control.current.speaking = false;
    control.current.act = 'idle';
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // a new tutor waves hello
  useEffect(() => {
    control.current.act = 'wave';
    control.current.pulse++;
    const id = window.setTimeout(() => (control.current.act = 'idle'), 1600);
    return () => window.clearTimeout(id);
  }, [p.tutor]);

  async function preview() {
    if (playing || loading) return stop();
    const accent = ACCENTS.find((a) => a.id === p.accent)!;
    const text = `Hi, I'm ${t.name}. Let's learn this together. Stop me any time — just talk, and I'll listen.`;
    const n = new Narrator(p.sound === 'natural' && natural ? 'natural' : p.sound === 'silent' ? 'silent' : 'device', (reason) => toast(reason), { name: t.voice, accent: accent.id, gender: t.gender });
    n.rate = p.rate;
    narrator.current = n;
    setLoading(true);
    try {
      const tr = await n.track(text);
      if (narrator.current !== n) return tr.stop();
      track.current = tr;
      tr.onEnd(() => {
        setPlaying(false);
        control.current.speaking = false;
        control.current.act = 'idle';
      });
      control.current.act = 'explain';
      control.current.speaking = true;
      tr.play();
      setPlaying(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="picker-backdrop" role="dialog" aria-modal="true" aria-label="Choose your tutor" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker">
        <div className="picker-head">
          <h2>Your tutor</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="picker-hero">
          <div className="picker-live">
            <TutorCharacter tutor={p.tutor} control={control} mouth={mouth} height={176} />
          </div>
          <div className="picker-about">
            <strong>{t.name}</strong>
            <p className="small muted">
              {t.manner[0].toUpperCase() + t.manner.slice(1)}.
            </p>
            <button className="btn small" onClick={preview} disabled={loading && !playing}>
              {loading ? <Loader2 size={15} className="spin" /> : playing ? <Square size={13} /> : <Play size={15} />} {playing ? 'Stop' : `Hear ${t.name}`}
            </button>
          </div>
        </div>

        <div className="picker-grid">
          {TUTORS.map((x) => (
            <button key={x.id} className={`picker-pick ${p.tutor === x.id ? 'on' : ''}`} onClick={() => (stop(), setP({ ...p, tutor: x.id }))} aria-pressed={p.tutor === x.id}>
              <TutorFace tutor={x.id} size={54} />
              <span>{x.name}</span>
              {p.tutor === x.id && (
                <span className="picker-check" aria-hidden>
                  <Check size={13} />
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="picker-row">
          <span className="label">Accent</span>
          <div className="segmented wrap">
            {ACCENTS.map((a) => (
              <button key={a.id} aria-pressed={p.accent === a.id} onClick={() => (stop(), setP({ ...p, accent: a.id }))}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="picker-row">
          <span className="label">Voice</span>
          <div className="segmented wrap">
            {SOUNDS.map((s) => (
              <button key={s.id} aria-pressed={p.sound === s.id} onClick={() => (stop(), setP({ ...p, sound: s.id }))} title={s.hint} disabled={s.id === 'natural' && !natural}>
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
        <label className="picker-toggle">
          <input type="checkbox" checked={p.handsFree} onChange={(e) => setP({ ...p, handsFree: e.target.checked })} disabled={!handsFreeSupported} />
          <span>
            <strong>Hands-free</strong> — just talk, and {t.name} stops to listen
            {!handsFreeSupported && <em className="muted"> (not in this browser — use the mic button)</em>}
          </span>
        </label>
        <label className="picker-toggle">
          <input type="checkbox" checked={p.captions} onChange={(e) => setP({ ...p, captions: e.target.checked })} />
          <span>Captions</span>
        </label>
        <label className="picker-toggle">
          <input type="checkbox" checked={p.avatar} onChange={(e) => setP({ ...p, avatar: e.target.checked })} />
          <span>Show {t.name} on the board</span>
        </label>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              stop();
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

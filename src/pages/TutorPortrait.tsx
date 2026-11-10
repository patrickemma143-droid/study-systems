// The cast: every tutor character, with buttons to try each move and the lip sync (for checking
// the drawings). Open /tutor-portrait/all, or /tutor-portrait/<id> for one tutor.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TutorCharacter, type Act, type CharacterControl } from '../components/TutorCharacter';
import { TUTORS } from '../../shared/tutors';
import { LipSync, type Mouth } from '../lib/tutor/visemes';

const ACTS: Act[] = ['idle', 'explain', 'point', 'write', 'emphasis', 'count', 'think', 'happy', 'wave', 'listen', 'sad'];
const LINE = 'Hello! Today we are going to learn about photosynthesis. Watch the board, and stop me any time.';

function Stage({ id }: { id: string }) {
  const control = useRef<CharacterControl>({ x: 140, sit: false, act: 'idle', side: 'right', speaking: false, pulse: 0 });
  const mouth = useRef<(() => Mouth) | null>(null);
  const [act, setAct] = useState<Act>('idle');
  const [sit, setSit] = useState(false);
  const [x, setX] = useState(140);
  const [talk, setTalk] = useState(false);
  control.current = { ...control.current, act, sit, x, speaking: talk };

  useEffect(() => {
    if (!talk) {
      mouth.current = null;
      return;
    }
    const lip = new LipSync(LINE);
    lip.align(6.2, null);
    const t0 = performance.now();
    mouth.current = () => lip.atTime(((performance.now() - t0) / 1000) % 6.6);
  }, [talk]);

  return (
    <div className="cast-stage">
      <div className="cast-floor">
        <TutorCharacter tutor={id} control={control} mouth={mouth} height={440} />
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {ACTS.map((a) => (
          <button
            key={a}
            className={`chip ${act === a ? 'on' : ''}`}
            onClick={() => {
              setAct(a);
              control.current.pulse++;
            }}
          >
            {a}
          </button>
        ))}
        <button className={`chip ${sit ? 'on' : ''}`} onClick={() => setSit((s) => !s)}>
          sit
        </button>
        <button className={`chip ${talk ? 'on' : ''}`} onClick={() => setTalk((s) => !s)}>
          talk
        </button>
        <button className="chip" onClick={() => setX((v) => (v > 300 ? 120 : 520))}>
          walk
        </button>
        <button className="chip" onClick={() => (control.current.side = control.current.side === 'right' ? 'left' : 'right')}>
          side
        </button>
      </div>
    </div>
  );
}

export default function TutorPortrait() {
  const id = useParams().id || 'all';
  if (id !== 'all') return <Stage id={id} />;
  return (
    <div className="cast-page">
      <div className="cast-faces">
        {TUTORS.map((t) => (
          <a key={t.id} href={`/tutor-portrait/${t.id}`} className="cast-face">
            <TutorCharacter tutor={t.id} portrait still />
            <span>{t.name}</span>
          </a>
        ))}
      </div>
      <div className="cast-row">
        {TUTORS.map((t) => (
          <TutorCharacter key={t.id} tutor={t.id} height={200} still />
        ))}
      </div>
    </div>
  );
}

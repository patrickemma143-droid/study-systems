import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, Footprints, Hammer, MapPin } from 'lucide-react';
import { api, type Note } from '../api';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';
import { usePack, useStudyTimer } from '../lib/usePack';
import { save, store } from '../lib/util';

const ROUTES: Record<string, { name: string; note: string; stops: string[] }> = {
  campus: {
    name: 'Walk to campus',
    note: 'The route you take every morning.',
    stops: ['Your bed', 'The bathroom mirror', 'Your front door', 'The gate', 'The boda boda stage', 'The taxi stage', 'The main road', 'The campus gate', 'The library steps', 'The lecture hall door', 'Your usual seat', 'The canteen'],
  },
  home: {
    name: 'Your home',
    note: 'Walk from the gate to the bedroom.',
    stops: ['The gate', 'The compound', 'The front door', 'The sitting room', 'The sofa', 'The TV', 'The dining table', 'The kitchen', 'The fridge', 'The corridor', 'The bedroom', 'The bathroom'],
  },
  body: {
    name: 'Your body',
    note: 'Always with you — even in the exam room.',
    stops: ['Your feet', 'Your knees', 'Your thighs', 'Your hips', 'Your stomach', 'Your chest', 'Your shoulders', 'Your neck', 'Your mouth', 'Your nose', 'Your eyes', 'The top of your head'],
  },
  custom: { name: 'My own route', note: 'Any place you know very well.', stops: [] },
};

const ACTIONS = ['is dancing wildly on', 'is melting all over', 'is shouting loudly from', 'completely covers', 'is bouncing around', 'is glowing bright pink on', 'is cooking something smelly on', 'is singing your favourite song at', 'has exploded into confetti at', 'is fighting a chicken at', 'is wearing your lecturer’s clothes at', 'is stuck, giant-sized, in'];

export default function Palace() {
  const id = Number(useParams().id);
  const toast = useToast();
  const { data, error } = usePack(id);
  useStudyTimer('palace', id);
  const [route, setRoute] = useState<string>(() => store(`cs-palace-route-${id}`, 'campus'));
  const [custom, setCustom] = useState<string>(() => store(`cs-palace-custom-${id}`, ''));
  const [mode, setMode] = useState<'build' | 'walk'>('build');
  const [images, setImages] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    save(`cs-palace-route-${id}`, route);
  }, [id, route]);
  useEffect(() => {
    save(`cs-palace-custom-${id}`, custom);
  }, [id, custom]);

  useEffect(() => {
    api<{ notes: Note<{ key: string; image: string }>[] }>(`/study/notes?packId=${id}&kind=palace`).then((r) => {
      const m: Record<string, string> = {};
      for (const n of r.notes.reverse()) m[n.content.key] = n.content.image;
      setImages(m);
    });
  }, [id]);

  const stops = useMemo(() => {
    const list = route === 'custom' ? custom.split('\n').map((s) => s.trim()).filter(Boolean) : ROUTES[route].stops;
    return list;
  }, [route, custom]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const items = data.pack.data.palace.slice(0, Math.max(stops.length, 0));
  const pairs = items.map((it, i) => ({ ...it, stop: stops[i], key: `${route}:${i}:${it.cue}` })).filter((p) => p.stop);

  async function saveImage(key: string, image: string) {
    await api('/study/notes', { body: { packId: id, kind: 'palace', content: { key, image } } });
    toast('Image saved');
  }

  const current = pairs[step];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Memory palace' }]} />
      <h1>Memory palace</h1>
      <p className="muted">
        Your brain remembers places far better than lists. Put each key idea at a stop along a route you know, picture something strange happening there, then walk the route in your mind.
      </p>

      <div className="row between" style={{ margin: '18px 0' }}>
        <div className="segmented" role="group" aria-label="Choose your route">
          {Object.entries(ROUTES).map(([k, r]) => (
            <button key={k} aria-pressed={route === k} onClick={() => setRoute(k)}>
              {r.name}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Mode">
          <button aria-pressed={mode === 'build'} onClick={() => setMode('build')}>
            <Hammer size={16} /> Build
          </button>
          <button
            aria-pressed={mode === 'walk'}
            onClick={() => {
              setMode('walk');
              setStep(0);
              setRevealed(false);
            }}
            disabled={!pairs.length}
          >
            <Footprints size={16} /> Walk it
          </button>
        </div>
      </div>

      {route === 'custom' && (
        <div className="sheet field" style={{ marginBottom: 18 }}>
          <label htmlFor="stops">Your stops, in order (one per line)</label>
          <textarea id="stops" className="textarea" placeholder={'e.g.\nMy room door\nThe staircase\nThe shop at the corner'} value={custom} onChange={(e) => setCustom(e.target.value)} />
          <span className="hint">You need up to {data.pack.data.palace.length} stops for this pack.</span>
        </div>
      )}

      {!data.pack.data.palace.length ? (
        <div className="sheet empty">
          <h2>Nothing to place yet</h2>
          <p className="muted">This pack has no definitions or lists to put in a palace. Try flashcards or the quiz instead.</p>
        </div>
      ) : mode === 'build' ? (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack">
          {pairs.map((p, i) => {
            const suggestion = `${p.cue} ${ACTIONS[i % ACTIONS.length]} ${p.stop.charAt(0).toLowerCase()}${p.stop.slice(1)}.`;
            return (
              <li key={p.key} className="sheet" style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 14 }}>
                <div style={{ textAlign: 'center' }}>
                  <MapPin size={22} color="var(--bad)" style={{ margin: '0 auto' }} />
                  <div className="small muted">{i + 1}</div>
                </div>
                <div>
                  <div className="small muted">{p.stop}</div>
                  <h3 style={{ margin: '2px 0 4px' }}>
                    <mark className="hl-purple">{p.cue}</mark>
                  </h3>
                  <p className="small" style={{ color: 'var(--ink-2)' }}>
                    {p.detail}
                  </p>
                  <div className="hand" style={{ color: 'var(--biro)', fontSize: '1.3rem', marginBottom: 8 }}>
                    Picture this: {suggestion}
                  </div>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 70 }}
                    placeholder="Or describe your own picture. Make it big, loud, funny or gross — that’s what makes it stick."
                    defaultValue={images[p.key] || ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== images[p.key]) {
                        setImages((m) => ({ ...m, [p.key]: v }));
                        saveImage(p.key, v);
                      }
                    }}
                    aria-label={`Your picture for ${p.cue} at ${p.stop}`}
                  />
                </div>
              </li>
            );
          })}
          {pairs.length < data.pack.data.palace.length && (
            <p className="small muted">{data.pack.data.palace.length - pairs.length} more ideas need stops. Add more stops to your own route to place them.</p>
          )}
        </ol>
      ) : current ? (
        <div className="sheet" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <div className="small muted">
            Stop {step + 1} of {pairs.length}
          </div>
          <h2 style={{ fontSize: '1.8rem', margin: '8px 0 18px' }}>
            <MapPin size={24} color="var(--bad)" style={{ display: 'inline', verticalAlign: '-3px' }} /> {current.stop}
          </h2>
          {revealed ? (
            <div className="stack" style={{ maxWidth: 520, margin: '0 auto' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 600 }}>
                <mark className="hl-purple">{current.cue}</mark>
              </div>
              <p>{current.detail}</p>
              {images[current.key] && <p className="hand" style={{ color: 'var(--biro)' }}>{images[current.key]}</p>}
            </div>
          ) : (
            <p className="muted">What did you place here? Picture it, say it out loud, then check.</p>
          )}
          <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
            <button className="btn" disabled={step === 0} onClick={() => { setStep(step - 1); setRevealed(false); }}>
              <ArrowLeft size={18} /> Back
            </button>
            {!revealed ? (
              <button className="btn primary" onClick={() => setRevealed(true)}>
                <Eye size={18} /> Show me
              </button>
            ) : step < pairs.length - 1 ? (
              <button className="btn primary" onClick={() => { setStep(step + 1); setRevealed(false); }}>
                Walk on <ArrowRight size={18} />
              </button>
            ) : (
              <button className="btn primary" onClick={() => { setStep(0); setRevealed(false); toast('Route complete. Walk it again tomorrow to lock it in.'); }}>
                Finish the walk
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

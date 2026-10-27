// The live 3D tutor. three.js is loaded only when this appears; without WebGL (or if the model
// can't load) the tutor's portrait photo is shown instead.
import { useEffect, useRef, useState } from 'react';
import type { AvatarHandle, Framing } from '../lib/tutor/avatar3d';
import { TUTOR_ART_VERSION } from '../../shared/tutors';

export type Reaction = { kind: 'nod' | 'happy' | 'think'; n: number } | null;

export function TutorAvatar({
  tutor,
  speaking = false,
  listening = false,
  reaction = null,
  framing = 'bust',
  className = '',
  still = false,
  onReady,
}: {
  tutor: string;
  speaking?: boolean;
  listening?: boolean;
  reaction?: Reaction;
  framing?: Framing;
  className?: string;
  still?: boolean;
  onReady?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const h = useRef<AvatarHandle | null>(null);
  const tutorRef = useRef(tutor);
  tutorRef.current = tutor;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setFailed(false);
    void import('../lib/tutor/avatar3d')
      .then(({ mountAvatar, webglAvailable }) => {
        if (cancelled || !host.current) return;
        if (!webglAvailable()) {
          setFailed(true);
          return;
        }
        const mounted = tutorRef.current;
        const a = mountAvatar(host.current, mounted, { framing, still, onError: () => !cancelled && setFailed(true) });
        h.current = a;
        void a.ready.then(() => {
          if (cancelled) return;
          if (tutorRef.current !== mounted) void a.setTutor(tutorRef.current); // changed while loading
          setLoaded(true);
          onReady?.();
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      h.current?.dispose();
      h.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  // another tutor: swap the model in the same 3D picture
  useEffect(() => {
    if (h.current && loaded) void h.current.setTutor(tutor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutor]);

  useEffect(() => {
    h.current?.setFraming(framing);
  }, [framing, loaded]);

  useEffect(() => {
    h.current?.setSpeaking(speaking);
  }, [speaking, loaded]);
  useEffect(() => {
    h.current?.setListening(listening);
  }, [listening, loaded]);
  useEffect(() => {
    if (reaction) h.current?.react(reaction.kind);
  }, [reaction]);

  return (
    <div className={`tutor-avatar ${loaded ? 'loaded' : ''} ${speaking ? 'speaking' : ''} ${listening ? 'listening' : ''} ${className}`} data-tutor={tutor}>
      {!loaded && <img className="tutor-avatar-still" src={`/tutors/${tutor}.webp?v=${TUTOR_ART_VERSION}`} alt="" draggable={false} />}
      {!failed && <div ref={host} className="tutor-avatar-gl" aria-hidden />}
    </div>
  );
}

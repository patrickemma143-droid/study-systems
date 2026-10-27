// The tutor's portrait (a still of the 3D tutor), small enough for any page.
import { TUTOR_ART_VERSION, TUTORS } from '../../shared/tutors';

/** A round portrait of the tutor that "pulses" while the voice plays. */
export function TutorFace({ tutor = TUTORS[0].id, speaking, size = 56, listening }: { tutor?: string; speaking?: boolean; size?: number; listening?: boolean }) {
  const t = TUTORS.find((x) => x.id === tutor) || TUTORS[0];
  return (
    <span className={`tutor-face ${speaking ? 'speaking' : ''} ${listening ? 'listening' : ''}`} style={{ width: size, height: size, ['--ring' as string]: t.look.shirt }} aria-hidden>
      <img src={`/tutors/${t.id}.webp?v=${TUTOR_ART_VERSION}`} alt="" width={size} height={size} draggable={false} loading="lazy" />
    </span>
  );
}

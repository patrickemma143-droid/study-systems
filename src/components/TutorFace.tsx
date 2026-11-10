// The tutor's face (the character's head and shoulders), small enough for any page.
import { TUTORS } from '../../shared/tutors';
import { TutorCharacter } from './TutorCharacter';

/** A round portrait of the tutor that "pulses" while the voice plays. */
export function TutorFace({ tutor = TUTORS[0].id, speaking, size = 56, listening }: { tutor?: string; speaking?: boolean; size?: number; listening?: boolean }) {
  const t = TUTORS.find((x) => x.id === tutor) || TUTORS[0];
  return (
    <span className={`tutor-face ${speaking ? 'speaking' : ''} ${listening ? 'listening' : ''}`} style={{ width: size, height: size, ['--ring' as string]: t.look.top }} aria-hidden>
      <TutorCharacter tutor={t.id} portrait still />
    </span>
  );
}

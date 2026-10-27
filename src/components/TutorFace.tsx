// The tutor characters (our own designs), kept tiny so any page can show them.
import { TUTORS, type TutorLook } from '../../shared/tutors';

let n = 0;

/** A friendly tutor face that "talks" while the voice plays. */
export function TutorFace({ speaking, size = 56, look = TUTORS[0].look, listening }: { speaking?: boolean; size?: number; look?: TutorLook; listening?: boolean }) {
  const id = `tf${++n}`;
  const ink = '#2b2140';
  const hair = look.hair;
  return (
    <svg className={`tutor-face ${speaking ? 'speaking' : ''} ${listening ? 'listening' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <clipPath id={`${id}-c`}>
          <circle cx="32" cy="32" r="31" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="31" fill="#f4f1ff" />
      <g clipPath={`url(#${id}-c)`}>
        {look.style === 'afro' && <circle cx="32" cy="27" r="21" fill={hair} />}
        {look.style === 'puff' && (
          <>
            <circle cx="32" cy="9" r="9" fill={hair} />
            <rect x="26" y="15" width="12" height="3" rx="1.5" fill={look.shirt} />
          </>
        )}
        {look.style === 'braids' && (
          <>
            <path d="M13 30 q-2 14 1 26" stroke={hair} strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M51 30 q2 14 -1 26" stroke={hair} strokeWidth="4" fill="none" strokeLinecap="round" />
          </>
        )}
        {/* shoulders */}
        <path d="M8 66 q4 -16 24 -16 q20 0 24 16 z" fill={look.shirt} />
        <rect x="27" y="44" width="10" height="8" rx="3" fill={look.skin} />
        {/* head */}
        <ellipse cx="32" cy="32" rx="15" ry="16.5" fill={look.skin} />
        <ellipse cx="17.5" cy="33" rx="2.4" ry="3.4" fill={look.skin} />
        <ellipse cx="46.5" cy="33" rx="2.4" ry="3.4" fill={look.skin} />
        {look.style === 'short' && <path d="M17 29 q0 -14 15 -14 q15 0 15 14 q-3 -7 -15 -7 q-12 0 -15 7 z" fill={hair} />}
        {look.style === 'waves' && (
          <>
            <path d="M17 28 q0 -13 15 -13 q15 0 15 13 q-3 -6 -15 -6 q-12 0 -15 6 z" fill={hair} />
            <path d="M22 19 q3 -2 6 0 q3 2 6 0 q3 -2 6 0" stroke="#4a3a30" strokeWidth="0.8" fill="none" />
          </>
        )}
        {(look.style === 'afro' || look.style === 'puff' || look.style === 'braids') && <path d="M16.5 30 q0 -15 15.5 -15 q15.5 0 15.5 15 q-4 -8 -15.5 -8 q-11.5 0 -15.5 8 z" fill={hair} />}
        {look.style === 'bald' && <path d="M24 20 q4 -3 9 -2" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
        {/* eyes */}
        <circle className="tf-eye" cx="26" cy="33" r="1.8" fill={ink} />
        <circle className="tf-eye" cx="38" cy="33" r="1.8" fill={ink} />
        <path d="M23 28.6 q3 -1.6 6 0 M35 28.6 q3 -1.6 6 0" stroke={ink} strokeWidth="1" fill="none" strokeLinecap="round" />
        {look.glasses && (
          <g stroke={ink} strokeWidth="1.3" fill="none">
            <circle cx="26" cy="33" r="4.6" />
            <circle cx="38" cy="33" r="4.6" />
            <line x1="30.6" y1="33" x2="33.4" y2="33" />
          </g>
        )}
        {/* mouth */}
        <path className="tf-smile" d="M27.5 40.5 q4.5 3.6 9 0" stroke={ink} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <ellipse className="tf-mouth" cx="32" cy="41.6" rx="3.4" ry="1.6" fill="#7a2e3b" />
      </g>
      <circle cx="32" cy="32" r="31" fill="none" stroke={look.shirt} strokeWidth="1.5" strokeOpacity="0.5" />
    </svg>
  );
}

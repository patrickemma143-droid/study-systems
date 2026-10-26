// The tutor character (our own design), kept tiny so any page can show it.
/** The friendly tutor character (our own), who "talks" while the voice plays. */
export function TutorFace({ speaking, size = 56 }: { speaking?: boolean; size?: number }) {
  return (
    <svg className={`tutor-face ${speaking ? 'speaking' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="tfg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b5cff" />
          <stop offset="1" stopColor="#19b8e6" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#tfg)" />
      <circle cx="32" cy="35" r="20" fill="#ffe2c4" />
      <path d="M12 30c2-14 14-19 23-18 10 1 18 8 17 19-5-6-11-9-20-9-8 0-14 3-20 8z" fill="#2b2140" />
      <circle cx="24.5" cy="35" r="5.2" fill="none" stroke="#2b2140" strokeWidth="1.8" />
      <circle cx="39.5" cy="35" r="5.2" fill="none" stroke="#2b2140" strokeWidth="1.8" />
      <line x1="29.7" y1="35" x2="34.3" y2="35" stroke="#2b2140" strokeWidth="1.8" />
      <circle className="tf-eye" cx="24.5" cy="35" r="1.7" fill="#2b2140" />
      <circle className="tf-eye" cx="39.5" cy="35" r="1.7" fill="#2b2140" />
      <ellipse className="tf-mouth" cx="32" cy="46" rx="4.5" ry="2" fill="#c2415d" />
    </svg>
  );
}


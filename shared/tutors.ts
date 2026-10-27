// The tutors a student can choose: each has its own face and natural (Gemini) voice.

export interface TutorLook {
  skin: string;
  hair: string;
  style: 'short' | 'afro' | 'puff' | 'braids' | 'bald' | 'waves';
  glasses: boolean;
  shirt: string;
}

export interface TutorPersona {
  id: string;
  name: string;
  /** Gemini prebuilt voice */
  voice: string;
  /** how the voice sounds */
  sounds: string;
  gender: 'f' | 'm';
  look: TutorLook;
}

/** Bump when public/tutors/* are rebuilt, so phones fetch the new models and portraits. */
export const TUTOR_ART_VERSION = 1;

export const TUTORS: TutorPersona[] = [
  { id: 'amara', name: 'Amara', voice: 'Sulafat', sounds: 'Warm and encouraging', gender: 'f', look: { skin: '#8d5a3b', hair: '#1c1412', style: 'puff', glasses: true, shirt: '#7b5cff' } },
  { id: 'daniel', name: 'Daniel', voice: 'Achird', sounds: 'Friendly and relaxed', gender: 'm', look: { skin: '#6b4226', hair: '#141010', style: 'short', glasses: true, shirt: '#19b8e6' } },
  { id: 'grace', name: 'Grace', voice: 'Vindemiatrix', sounds: 'Gentle and patient', gender: 'f', look: { skin: '#a46b45', hair: '#20150f', style: 'braids', glasses: false, shirt: '#e2477f' } },
  { id: 'joseph', name: 'Joseph', voice: 'Charon', sounds: 'Calm, like a lecturer', gender: 'm', look: { skin: '#5a3720', hair: '#121212', style: 'bald', glasses: true, shirt: '#12a06a' } },
  { id: 'zara', name: 'Zara', voice: 'Leda', sounds: 'Young and lively', gender: 'f', look: { skin: '#9b6a4a', hair: '#2a1a12', style: 'afro', glasses: false, shirt: '#f08c1a' } },
  { id: 'samuel', name: 'Samuel', voice: 'Sadaltager', sounds: 'Knowledgeable and clear', gender: 'm', look: { skin: '#7a4b2c', hair: '#1a1210', style: 'waves', glasses: false, shirt: '#5a48f5' } },
  { id: 'ruth', name: 'Ruth', voice: 'Kore', sounds: 'Firm and focused', gender: 'f', look: { skin: '#6e432a', hair: '#151010', style: 'short', glasses: true, shirt: '#0f8b8d' } },
  { id: 'peter', name: 'Peter', voice: 'Puck', sounds: 'Upbeat and energetic', gender: 'm', look: { skin: '#b07a52', hair: '#2b1d14', style: 'short', glasses: false, shirt: '#d6336c' } },
];

export type Accent = 'east-african' | 'neutral';
export const ACCENTS: { id: Accent; label: string }[] = [
  { id: 'east-african', label: 'East African English' },
  { id: 'neutral', label: 'Neutral English' },
];

export interface TutorPrefs {
  tutor: string;
  accent: Accent;
  /** natural = AI voice, device = phone's voice, silent = captions only */
  sound: 'natural' | 'device' | 'silent';
  rate: number;
  captions: boolean;
  /** show the live 3D tutor (off saves battery and data) */
  avatar: boolean;
}

export const DEFAULT_PREFS: TutorPrefs = { tutor: 'amara', accent: 'east-african', sound: 'natural', rate: 1, captions: true, avatar: true };

export function tutorById(id: string | undefined): TutorPersona {
  return TUTORS.find((t) => t.id === id) || TUTORS[0];
}

/** All Gemini prebuilt voices the server accepts. */
export const GEMINI_VOICES = [
  'Achernar', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina', 'Erinome', 'Gacrux', 'Kore', 'Laomedeia', 'Leda', 'Pulcherrima', 'Sulafat', 'Vindemiatrix', 'Zephyr',
  'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Charon', 'Enceladus', 'Fenrir', 'Iapetus', 'Orus', 'Puck', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Umbriel', 'Zubenelgenubi',
];

export function cleanPrefs(raw: any): TutorPrefs {
  const p = { ...DEFAULT_PREFS };
  if (raw && typeof raw === 'object') {
    if (TUTORS.some((t) => t.id === raw.tutor)) p.tutor = raw.tutor;
    if (ACCENTS.some((a) => a.id === raw.accent)) p.accent = raw.accent;
    if (['natural', 'device', 'silent'].includes(raw.sound)) p.sound = raw.sound;
    const r = Number(raw.rate);
    if ([0.85, 1, 1.25, 1.5].includes(r)) p.rate = r;
    if (typeof raw.captions === 'boolean') p.captions = raw.captions;
    if (typeof raw.avatar === 'boolean') p.avatar = raw.avatar;
  }
  return p;
}

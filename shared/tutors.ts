// The tutors a student can choose: an original cast of anime and cartoon characters, each with
// their own look, personality and natural (Gemini) voice. The characters are drawn and animated in
// the browser (src/components/TutorCharacter.tsx), so there are no model files to download.

export type HairStyle = 'long' | 'spiky' | 'twintails' | 'messy' | 'puff' | 'short' | 'tufts' | 'bob' | 'none';
export type Outfit = 'blazer' | 'hoodie' | 'sailor' | 'scarf' | 'cardigan' | 'labcoat' | 'jacket' | 'robot';

export interface TutorLook {
  /** anime: big eyes and fine features; cartoon: round and bouncy; robot: metal, LED face */
  style: 'anime' | 'cartoon' | 'robot';
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** iris colour */
  eyes: string;
  /** main clothes colour and a trim / accent colour */
  top: string;
  trim: string;
  outfit: Outfit;
  legs: string;
  glasses?: boolean;
  earrings?: boolean;
  mustache?: boolean;
  blush?: boolean;
}

export interface TutorPersona {
  id: string;
  name: string;
  /** Gemini prebuilt voice */
  voice: string;
  /** how the voice sounds */
  sounds: string;
  /** personality, for the picker and for the AI when it answers questions */
  manner: string;
  /** the one fixed voice every line is spoken in (pitch, pace, energy), so the tutor never changes voice */
  tone: string;
  gender: 'f' | 'm';
  look: TutorLook;
}

/** Bump when the characters' drawings change a lot (cached portraits on the home page). */
export const TUTOR_ART_VERSION = 2;

export const TUTORS: TutorPersona[] = [
  {
    id: 'amara', name: 'Amara', voice: 'Sulafat', sounds: 'Warm and encouraging', gender: 'f',
    manner: 'warm, patient and encouraging; celebrates every small win',
    tone: "a warm, gentle, medium-pitched woman's voice; calm, even energy; relaxed, steady pace",
    look: { style: 'anime', skin: '#8d5a3b', hair: '#1c1412', hairStyle: 'puff', eyes: '#5a3a22', top: '#7b5cff', trim: '#ffd166', outfit: 'blazer', legs: '#2b2d52', earrings: true, blush: true },
  },
  {
    id: 'hana', name: 'Hana', voice: 'Vindemiatrix', sounds: 'Gentle and calm', gender: 'f',
    manner: 'gentle, thoughtful and precise; loves a neat diagram',
    tone: "a soft, clear, medium-high woman's voice; calm and composed; steady, unhurried pace",
    look: { style: 'anime', skin: '#f6d7c3', hair: '#26305c', hairStyle: 'long', eyes: '#3d6fe0', top: '#ffffff', trim: '#d6336c', outfit: 'sailor', legs: '#26305c', glasses: true, blush: true },
  },
  {
    id: 'kenji', name: 'Kenji', voice: 'Puck', sounds: 'Upbeat and energetic', gender: 'm',
    manner: 'high-energy and funny; turns ideas into challenges and cheers you on',
    tone: "a bright, friendly, medium-pitched young man's voice; cheerful but even energy; brisk, steady pace",
    look: { style: 'anime', skin: '#f1cfb2', hair: '#14141c', hairStyle: 'spiky', eyes: '#c0392b', top: '#e8590c', trim: '#1e2240', outfit: 'hoodie', legs: '#33384f' },
  },
  {
    id: 'aiko', name: 'Aiko', voice: 'Leda', sounds: 'Young and lively', gender: 'f',
    manner: 'bubbly and curious; asks lots of questions and uses playful examples',
    tone: "a light, friendly, higher-pitched young woman's voice; cheerful but even energy; steady pace",
    look: { style: 'anime', skin: '#fbe0cd', hair: '#ff7eb6', hairStyle: 'twintails', eyes: '#8e44ad', top: '#acdcff', trim: '#ff7eb6', outfit: 'jacket', legs: '#3d3f6b', blush: true },
  },
  {
    id: 'ren', name: 'Ren', voice: 'Charon', sounds: 'Calm, like a lecturer', gender: 'm',
    manner: 'cool, calm and deep; explains the why behind everything',
    tone: "a calm, low, smooth man's voice; quiet confidence; slow, steady pace",
    look: { style: 'anime', skin: '#f3d6c1', hair: '#c9cfe0', hairStyle: 'messy', eyes: '#16a085', top: '#2f3b60', trim: '#c0392b', outfit: 'scarf', legs: '#1d2238' },
  },
  {
    id: 'kofi', name: 'Kofi', voice: 'Achird', sounds: 'Friendly and relaxed', gender: 'm',
    manner: 'friendly and down to earth; full of real-life examples from home',
    tone: "a warm, friendly, medium-low man's voice; relaxed, even energy; steady pace",
    look: { style: 'cartoon', skin: '#6b4226', hair: '#141010', hairStyle: 'short', eyes: '#2b1a10', top: '#12a06a', trim: '#f4e1c1', outfit: 'cardigan', legs: '#3b3226', glasses: true },
  },
  {
    id: 'pip', name: 'Professor Pip', voice: 'Sadaltager', sounds: 'Knowledgeable and clear', gender: 'm',
    manner: 'a twinkly old professor; loves stories from history and "aha!" moments',
    tone: "a kind, slightly older man's voice, medium-low pitch; gentle and clear; unhurried, steady pace",
    look: { style: 'cartoon', skin: '#f2c9a8', hair: '#f4f4f4', hairStyle: 'tufts', eyes: '#3a6ea5', top: '#ffffff', trim: '#5a48f5', outfit: 'labcoat', legs: '#4b4e6b', glasses: true, mustache: true },
  },
  {
    id: 'bolt', name: 'Bolt', voice: 'Fenrir', sounds: 'Bright and excitable', gender: 'm',
    manner: 'a cheerful robot who loves facts, patterns and the odd bad joke',
    tone: "a bright, clear, medium-pitched friendly voice; even, upbeat energy; steady pace",
    look: { style: 'robot', skin: '#cfd8e6', hair: '#19b8e6', hairStyle: 'none', eyes: '#19b8e6', top: '#9aa8c0', trim: '#19b8e6', outfit: 'robot', legs: '#7d8aa3' },
  },
];

export type Accent = 'british' | 'american' | 'australian' | 'irish' | 'scottish' | 'nigerian' | 'east-african' | 'south-african' | 'indian' | 'neutral';

/** Accents the tutor can speak in. `lang` picks a matching voice on the phone when it has one. */
export const ACCENTS: { id: Accent; label: string; short: string; lang: string; note: string }[] = [
  { id: 'british', label: 'British', short: 'UK', lang: 'en-GB', note: 'A clear Southern British English (received pronunciation) accent.' },
  { id: 'american', label: 'American', short: 'US', lang: 'en-US', note: 'A natural General American English accent.' },
  { id: 'australian', label: 'Australian', short: 'AU', lang: 'en-AU', note: 'A natural, friendly Australian English accent.' },
  { id: 'irish', label: 'Irish', short: 'IE', lang: 'en-IE', note: 'A soft, natural Irish English accent.' },
  { id: 'scottish', label: 'Scottish', short: 'SC', lang: 'en-GB', note: 'A gentle, clear Scottish English accent.' },
  { id: 'nigerian', label: 'Nigerian', short: 'NG', lang: 'en-NG', note: 'A natural Nigerian English accent.' },
  { id: 'east-african', label: 'East African', short: 'EA', lang: 'en-KE', note: 'A natural East African (Ugandan) English accent.' },
  { id: 'south-african', label: 'South African', short: 'ZA', lang: 'en-ZA', note: 'A natural South African English accent.' },
  { id: 'indian', label: 'Indian', short: 'IN', lang: 'en-IN', note: 'A clear, natural Indian English accent.' },
  { id: 'neutral', label: 'Neutral', short: 'EN', lang: 'en-GB', note: 'Neutral, international English.' },
];
export const ACCENT_IDS = ACCENTS.map((a) => a.id) as [Accent, ...Accent[]];
export const accentById = (id: string | undefined) => ACCENTS.find((a) => a.id === id) || ACCENTS[0];

export interface TutorPrefs {
  tutor: string;
  accent: Accent;
  /** natural = AI voice, device = phone's voice, silent = captions only */
  sound: 'natural' | 'device' | 'silent';
  rate: number;
  captions: boolean;
  /** show the tutor on the board (off saves battery) */
  avatar: boolean;
  /** listen all the time during a lesson: just speak to interrupt */
  handsFree: boolean;
}

export const DEFAULT_PREFS: TutorPrefs = { tutor: 'amara', accent: 'british', sound: 'natural', rate: 1, captions: true, avatar: true, handsFree: true };

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
    if (typeof raw.handsFree === 'boolean') p.handsFree = raw.handsFree;
  }
  return p;
}

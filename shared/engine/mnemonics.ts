import type { Mnemonic, TermList } from './types';
import { seededRandom, shuffle } from './text';

// Word bank for acrostic sentences: adjectives | plural nouns | past-tense verbs
const BANK: Record<string, [string, string, string]> = {
  A: ['Angry Awesome Ancient Active Adventurous', 'Ants Apples Aunties Antelopes Astronauts', 'Ate Attacked Admired Arrested Asked'],
  B: ['Brave Big Bouncy Bright Busy', 'Bananas Bodabodas Bears Babies Buses', 'Bought Baked Built Borrowed Blessed'],
  C: ['Crazy Clever Cheerful Curious Cool', 'Cats Chapatis Cows Cars Cooks', 'Chased Carried Cooked Caught Counted'],
  D: ['Dancing Daring Dusty Dizzy Delightful', 'Dogs Drums Doctors Ducks Dancers', 'Danced Drank Dropped Drove Dug'],
  E: ['Eager Elegant Energetic Excited Early', 'Elephants Eggs Eagles Engineers Envelopes', 'Enjoyed Escaped Entered Ended Examined'],
  F: ['Funny Fast Fierce Friendly Fancy', 'Fish Frogs Farmers Footballs Flowers', 'Found Fed Fixed Followed Fought'],
  G: ['Giant Gentle Golden Grumpy Green', 'Goats Giraffes Guitars Grandmas Gorillas', 'Grabbed Greeted Grew Guarded Gave'],
  H: ['Happy Hungry Huge Honest Hot', 'Hippos Hens Hats Heroes Houses', 'Hugged Hid Hit Helped Heard'],
  I: ['Itchy Icy Incredible Innocent Idle', 'Iguanas Insects Islands Inventors Icecreams', 'Invited Ignored Imagined Inspected Ironed'],
  J: ['Jolly Jumpy Jealous Juicy Joyful', 'Jackfruits Jaguars Judges Jets Jugglers', 'Jumped Joined Juggled Joked Judged'],
  K: ['Kind Keen Kingly Kooky Knotty', 'Kangaroos Kings Kites Kittens Keys', 'Kicked Kissed Kept Knew Knocked'],
  L: ['Lazy Loud Lucky Little Lovely', 'Lions Lemons Lizards Ladies Lorries', 'Loved Licked Lifted Led Lost'],
  M: ['Mighty Muddy Merry Magic Mad', 'Monkeys Mangoes Matooke Mice Mothers', 'Made Met Missed Moved Munched'],
  N: ['Noisy Nice Nervous Naughty Noble', 'Nurses Nuts Newspapers Neighbours Ninjas', 'Needed Noticed Nibbled Named Nursed'],
  O: ['Old Orange Odd Oily Outstanding', 'Owls Oranges Ostriches Onions Officers', 'Opened Owned Ordered Overtook Obeyed'],
  P: ['Purple Proud Polite Playful Plump', 'Parrots Pineapples Pilots Pythons Pastors', 'Painted Pushed Pulled Played Picked'],
  Q: ['Quick Quiet Quirky Queenly Quaint', 'Queens Quails Quilts Questions Quizmasters', 'Quizzed Questioned Quit Quieted Queued'],
  R: ['Red Rich Rowdy Rapid Royal', 'Rabbits Rats Rockets Rhinos Rolexes', 'Ran Rode Robbed Raced Rescued'],
  S: ['Silly Sleepy Shiny Smart Sweaty', 'Snakes Sodas Students Sharks Samosas', 'Sang Swallowed Stole Saw Shook'],
  T: ['Tiny Tall Tired Tough Tasty', 'Tigers Taxis Teachers Tomatoes Turtles', 'Took Threw Tickled Trapped Taught'],
  U: ['Ugly Unusual Upset Useful Ultra', 'Umbrellas Uncles Unicorns Umpires Uniforms', 'Used Unlocked Untied Uplifted Understood'],
  V: ['Very Vivid Valiant Violet Vast', 'Vultures Vans Villagers Violins Vegetables', 'Visited Viewed Voted Vanished Vacuumed'],
  W: ['Wild Wise Wet Witty Wobbly', 'Wolves Warthogs Waiters Watermelons Wizards', 'Watched Washed Won Wanted Woke'],
  X: ['Xtra Xtreme Xenial Xeric Xtra-large', 'Xylophones X-rays Xmas-trees Xerox-machines Xylophonists', 'X-rayed Xeroxed X-rayed Xeroxed X-rayed'],
  Y: ['Young Yellow Yummy Yawning Youthful', 'Yams Yaks Yoghurts Youths Yachts', 'Yelled Yanked Yawned Yearned Yodelled'],
  Z: ['Zany Zesty Zippy Zealous Zigzag', 'Zebras Zombies Zips Zoos Zucchinis', 'Zapped Zipped Zoomed Zigzagged Zoned'],
};

const LINKS = [
  'crashes into',
  'is swallowed whole by',
  'dances wildly with',
  'explodes into',
  'rides a boda boda to',
  'shares a hot rolex with',
  'turns into',
  'is chased around campus by',
  'sings loudly to',
  'falls from the sky onto',
  'is tickled by',
  'squeezes into a taxi with',
];

function pick(list: string, rand: () => number): string {
  const ws = list.split(' ');
  return ws[Math.floor(rand() * ws.length)];
}

function wordFor(letter: string, cls: 0 | 1 | 2, rand: () => number): string {
  const b = BANK[letter.toUpperCase()];
  if (!b) return letter.toUpperCase();
  return pick(b[cls], rand);
}

const PATTERNS: Record<number, (0 | 1 | 2)[]> = {
  1: [1],
  2: [0, 1],
  3: [0, 1, 2],
  4: [0, 1, 2, 1],
  5: [0, 1, 2, 0, 1],
  6: [0, 1, 2, 0, 1, 2],
  7: [0, 1, 2, 1, 0, 1, 2],
  8: [0, 1, 2, 1, 0, 1, 2, 1],
};

/** Build a silly, memorable sentence whose first letters spell the acronym. */
export function acrosticFor(letters: string[], rand: () => number = Math.random): string {
  const n = letters.length;
  const pattern = PATTERNS[n] || letters.map((_, i) => ([0, 1, 2, 1] as const)[i % 4]);
  const ws = letters.map((l, i) => wordFor(l, pattern[i], rand));
  const split = n >= 6 ? (n === 6 ? 3 : 4) : n;
  const first = ws.slice(0, split).join(' ');
  const rest = ws.slice(split).join(' ');
  return rest ? `${first}, ${rest}` : first;
}

function initial(label: string): string {
  const m = label.match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : '?';
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);

/** How easy an acronym is to say: alternating consonants/vowels score high. */
export function pronounceability(letters: string[]): number {
  let score = 0;
  let consRun = 0;
  for (let i = 0; i < letters.length; i++) {
    const v = VOWELS.has(letters[i]);
    if (i > 0 && v !== VOWELS.has(letters[i - 1])) score += 1;
    consRun = v ? 0 : consRun + 1;
    if (consRun >= 3) score -= 2;
  }
  if (!letters.some((l) => VOWELS.has(l))) score -= 3;
  return score;
}

function permutations(n: number): number[][] {
  if (n <= 1) return [[0]];
  const out: number[][] = [];
  const rec = (prefix: number[], rest: number[]) => {
    if (!rest.length) return void out.push(prefix);
    rest.forEach((x, i) => rec([...prefix, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], Array.from({ length: n }, (_, i) => i));
  return out;
}

export function storyFor(items: string[], rand: () => number = Math.random): string {
  if (!items.length) return '';
  const links = shuffle(LINKS, rand);
  const parts = [`Picture a giant, glowing ${items[0]} right in front of you.`];
  for (let i = 1; i < items.length; i++) {
    parts.push(`It ${links[(i - 1) % links.length]} ${items[i]}.`);
  }
  parts.push('Replay the scene once with your eyes closed — the weirder it feels, the better it sticks.');
  return parts.join(' ');
}

export function buildMnemonic(list: TermList, seed: string): Mnemonic {
  const rand = seededRandom(seed);
  const labels = list.items.map((i) => i.label);
  const letters = labels.map(initial);
  let order = labels.map((_, i) => i);

  if (!list.ordered && labels.length >= 3 && labels.length <= 6) {
    let best = pronounceability(letters);
    for (const p of permutations(labels.length)) {
      const s = pronounceability(p.map((i) => letters[i]));
      if (s > best + 1) {
        best = s;
        order = p;
      }
    }
  }
  const ordered = order.map((i) => letters[i]);
  return {
    chunk: list.chunk,
    category: list.category,
    items: labels,
    ordered: list.ordered,
    order,
    acronym: ordered.join(''),
    acrostics: [acrosticFor(ordered, rand), acrosticFor(ordered, rand), acrosticFor(ordered, rand)],
    story: storyFor(order.map((i) => labels[i]), rand),
  };
}

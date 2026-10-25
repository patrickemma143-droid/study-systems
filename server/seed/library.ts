// Starts the shared library with open textbooks (OpenStax, CC BY-NC-SA 4.0) turned into study
// packs, and original Charis Study practice papers with marking keys. Runs once in the background
// after the database is ready; set LIBRARY_SEED=off to skip it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config';
import { db, now } from '../db';
import { buildStudyPack, type SourceBlock } from '../../shared/engine';
import { analyzeKey, analyzePaper } from '../../shared/engine/paper';
import { hashOf } from '../routes/library';
import { SEED_PAPERS } from './papers';

const SEED_VERSION = 1;
const SYSTEM_EMAIL = 'library@charis-study.local';
const SYSTEM_NAME = 'Charis Study Library';
// seeded items sit a month in the past, so students' own uploads show first under "Just added"
const BACKDATE = 30 * 86400_000;

interface SeedBook {
  book: string;
  short: string;
  faculty: string;
  slug: string;
  license: { url: string; name: string } | null;
  url: string;
  chapters: { n: number; title: string; unit: string | null; words: number; blocks: SourceBlock[] }[];
}

async function systemUser(): Promise<number> {
  const u = await db('users').where({ email: SYSTEM_EMAIL }).first('id');
  if (u) return Number(u.id);
  // nobody can log in as the library: the password is random and never stored anywhere
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  const [id] = await db('users').insert({ name: SYSTEM_NAME, email: SYSTEM_EMAIL, password_hash: hash, created_at: now(), leaderboard: false });
  return Number(id);
}

const sourceText = (blocks: SourceBlock[]) => blocks.map((b) => (b.kind === 'heading' ? `\n${b.text}\n` : b.kind === 'item' ? `- ${b.text}` : b.text)).join('\n');
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function seedLibrary(): Promise<void> {
  if (process.env.LIBRARY_SEED === 'off') return;
  const done = await db('app_settings').where({ key: 'library_seed' }).first();
  if (done && Number(done.value) >= SEED_VERSION) return;
  const dir = path.join(config.root, 'seed', 'books');
  if (!fs.existsSync(dir)) return;
  const owner = await systemUser();
  const t0 = now() - BACKDATE;
  let added = 0;
  const started = Date.now();
  const bookTitles = new Map<string, string>();

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort()) {
    let book: SeedBook;
    try {
      book = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, file))).toString('utf8'));
    } catch (err: any) {
      console.warn(`Library seed: could not read ${file}: ${err?.message}`);
      continue;
    }
    const licence = book.license?.name || 'Creative Commons';
    bookTitles.set(book.slug, book.book);
    for (const ch of book.chapters) {
      const text = sourceText(ch.blocks);
      const hash = hashOf(text);
      if (await db('library_items').where({ text_hash: hash }).first('id')) continue;
      const title = `${book.short}: ${ch.title}`.slice(0, 200);
      const pack = buildStudyPack(ch.blocks, { title, seed: `${book.slug}:${ch.n}` });
      if (pack.stats.words < 300) continue;
      pack.resources = [{ name: `${book.book} (OpenStax, free online)`, url: book.url, kind: 'book', note: `The original textbook. ${licence}.` }];
      await db('library_items').insert({
        owner_id: owner,
        kind: 'pack',
        item_type: 'book',
        title,
        faculty: book.faculty,
        university: null,
        course_code: null,
        course_name: book.book.slice(0, 160),
        year: null,
        semester: null,
        author: 'OpenStax (Rice University)',
        description: `Chapter ${ch.n} of “${book.book}” by OpenStax, ${licence} (${book.url}). Turned into lessons, flashcards and quizzes by Charis Study and shared under the same licence, free for everyone.`.slice(0, 600),
        text_hash: hash,
        words: pack.stats.words,
        lessons: pack.chunks.length,
        cards: pack.cards.length,
        smart: false,
        has_key: false,
        data: JSON.stringify(pack),
        source_text: text,
        created_at: t0 + added,
        updated_at: t0 + added,
      });
      added++;
      await pause(30); // keep the server responsive while it works
    }
  }

  for (const p of SEED_PAPERS) {
    const hash = hashOf(p.text);
    if (await db('library_items').where({ text_hash: hash }).first('id')) continue;
    const analysis = analyzePaper(p.text);
    const key = analyzeKey(p.keyText, analysis);
    await db('library_items').insert({
      owner_id: owner,
      kind: 'paper',
      item_type: 'paper',
      title: p.name,
      faculty: p.faculty,
      university: null,
      course_code: null,
      course_name: (p.book && bookTitles.get(p.book)) || p.courseName,
      year: null,
      semester: null,
      author: null,
      description: 'An original Charis Study practice paper in university exam format, with a marking key. It is not a past examination of any university.',
      text_hash: hash,
      words: p.text.split(/\s+/).length,
      lessons: 0,
      cards: analysis.questionCount,
      smart: false,
      has_key: true,
      data: JSON.stringify({ name: p.name, analysis, keyText: p.keyText, key }),
      source_text: p.text,
      created_at: t0 + added,
      updated_at: t0 + added,
    });
    added++;
  }

  const exists = await db('app_settings').where({ key: 'library_seed' }).first();
  if (exists) await db('app_settings').where({ key: 'library_seed' }).update({ value: String(SEED_VERSION) });
  else await db('app_settings').insert({ key: 'library_seed', value: String(SEED_VERSION) });
  console.log(`  Library seed: added ${added} items in ${Math.round((Date.now() - started) / 1000)} s.`);
}

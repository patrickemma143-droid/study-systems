import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The project root, worked out from this file's location (server/ in dev, build/ in production),
// so the app works no matter which folder the host starts it from.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

/**
 * Where the SQLite database and the session secret live.
 * Hostinger rebuilds Node.js apps into a fresh `.../hbuilds/<version>/` folder on every deploy,
 * so on Hostinger we keep data one level above, in `<domain folder>/charis-data`, where it survives redeploys.
 */
function resolveDataDir(): string {
  if (process.env.DATA_DIR) return path.resolve(root, process.env.DATA_DIR);
  const marker = `${path.sep}hbuilds${path.sep}`;
  if (root.includes(marker)) return path.join(root.split(marker)[0], 'charis-data');
  return path.join(root, 'data');
}

/** Use the first folder we can actually create/write; never crash at startup over it. */
function usableDir(candidates: string[]): string {
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      /* try the next one */
    }
  }
  return os.tmpdir();
}

const dataDir = usableDir([resolveDataDir(), path.join(root, 'data'), path.join(os.tmpdir(), 'charis-data')]);

function loadSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv !== 'change-me-to-a-long-random-string' && fromEnv.length >= 24) return fromEnv;
  // No secret set: create one and keep it next to the data so logins survive restarts and redeploys.
  const file = path.join(dataDir, '.secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(file, secret, { mode: 0o600 });
  } catch {
    console.warn('⚠  Could not save the session secret to disk; logins will reset on restart. Set JWT_SECRET.');
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn(`⚠  JWT_SECRET is not set — generated one in ${file}. Set JWT_SECRET in your host's environment variables.`);
  }
  return secret;
}

// MySQL settings: accepts MYSQL_* names, Hostinger's DB_* names, or a single DATABASE_URL.
const env = process.env;
const url = env.DATABASE_URL && /^mysql:/i.test(env.DATABASE_URL) ? new URL(env.DATABASE_URL) : null;
const mysql = {
  host: env.MYSQL_HOST || env.DB_HOST || url?.hostname || 'localhost',
  port: Number(env.MYSQL_PORT || env.DB_PORT || url?.port) || 3306,
  user: env.MYSQL_USER || env.DB_USER || decodeURIComponent(url?.username || ''),
  password: env.MYSQL_PASSWORD || env.DB_PASSWORD || decodeURIComponent(url?.password || ''),
  database: env.MYSQL_DATABASE || env.DB_NAME || url?.pathname.replace(/^\//, '') || 'charis_study',
};
const dbClient = (env.DB_CLIENT || (url || env.MYSQL_USER || env.DB_USER ? 'mysql' : 'sqlite')).toLowerCase() as 'sqlite' | 'mysql';

/** Website port. Hostinger expects 3000 when it doesn't pass PORT; 3306 is MySQL's port, a common mix-up. */
function webPort(): number {
  const p = Number(process.env.PORT) || 3000;
  if (p === 3306) {
    console.warn('⚠  PORT=3306 is the database port. Using 3000 for the website — put the database port in DB_PORT instead.');
    return 3000;
  }
  return p;
}

// ─── AI (optional) ───────────────────────────────────────────
// No key → the app stays fully API-free. Set GEMINI_API_KEY or ANTHROPIC_API_KEY (or AI_PROVIDER + AI_API_KEY).
export type AiKind = 'simplify' | 'tutor' | 'feedback';
type Limits = Record<AiKind, number>;

function parseLimits(text: string | undefined, fallback: Limits): Limits {
  const out = { ...fallback };
  for (const part of (text || '').split(',')) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (k in out && v !== undefined && !Number.isNaN(Number(v))) out[k as AiKind] = Math.max(0, Number(v));
  }
  return out;
}

const aiProvider = (env.AI_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : env.ANTHROPIC_API_KEY ? 'claude' : 'none')).toLowerCase() as 'gemini' | 'claude' | 'mock' | 'none';
const DEFAULT_MODEL = { gemini: 'gemini-3.5-flash-lite', claude: 'claude-haiku-5-5', mock: 'mock-model', none: '' } as const;

export const ai = {
  provider: aiProvider,
  key: env.AI_API_KEY || (aiProvider === 'gemini' ? env.GEMINI_API_KEY : aiProvider === 'claude' ? env.ANTHROPIC_API_KEY : '') || '',
  model: env.AI_MODEL || DEFAULT_MODEL[aiProvider] || '',
  get enabled() {
    return this.provider === 'mock' || ((this.provider === 'gemini' || this.provider === 'claude') && !!this.key);
  },
  /** Gemini only: send a thinking level (e.g. "minimal") — leave empty to use the model's default. */
  geminiThinkingLevel: env.AI_GEMINI_THINKING_LEVEL || '',
  /** Optional price override, USD per 1M tokens (otherwise a built-in table is used). */
  priceInput: env.AI_PRICE_INPUT ? Number(env.AI_PRICE_INPUT) : null,
  priceOutput: env.AI_PRICE_OUTPUT ? Number(env.AI_PRICE_OUTPUT) : null,
  limits: {
    free: parseLimits(env.AI_LIMITS_FREE, { simplify: 10, tutor: 5, feedback: 3 }),
    pro: parseLimits(env.AI_LIMITS_PRO, { simplify: 200, tutor: 60, feedback: 30 }),
  },
};

export const adminEmails = (env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  root,
  dataDir,
  port: webPort(),
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: loadSecret(),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  dbClient,
  sqliteFile: process.env.SQLITE_FILE ? path.resolve(root, process.env.SQLITE_FILE) : path.join(dataDir, 'charis-study.db'),
  mysql,
  contactEmail: process.env.CONTACT_EMAIL || 'hello@example.com',
  distDir: path.join(root, 'dist'),
};

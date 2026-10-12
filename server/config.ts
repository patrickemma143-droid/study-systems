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

export const config = {
  root,
  dataDir,
  // Hostinger expects Node apps on port 3000 when it doesn't pass PORT.
  port: Number(process.env.PORT) || 3000,
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: loadSecret(),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  dbClient,
  sqliteFile: process.env.SQLITE_FILE ? path.resolve(root, process.env.SQLITE_FILE) : path.join(dataDir, 'charis-study.db'),
  mysql,
  contactEmail: process.env.CONTACT_EMAIL || 'hello@example.com',
  distDir: path.join(root, 'dist'),
};

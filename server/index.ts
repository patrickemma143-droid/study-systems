import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { ai, config } from './config';
import { complete } from './ai/providers';
import { db, migrate } from './db';
import { authRouter, HttpError } from './auth';
import { packsRouter } from './routes/packs';
import { studyRouter } from './routes/study';
import { aiRouter } from './routes/ai';
import { adminRouter } from './routes/admin';
import { planRouter } from './routes/plan';
import { pointsRouter } from './routes/points';
import { papersRouter } from './routes/papers';
import { libraryRouter } from './routes/library';
import { coachRouter } from './routes/coach';
import { classesRouter } from './routes/classes';
import { battlesRouter } from './routes/battles';
import { seedLibrary } from './seed/library';
import { anatomyRouter } from './routes/anatomy';
import { tutorRouter } from './routes/tutor';
import { publicRouter } from './public';
import { startReminders } from './notify';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", "'wasm-unsafe-eval'"], // wasm: text recognition runs in the browser
        'style-src': ["'self'", "'unsafe-inline'"],
        'font-src': ["'self'", 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'worker-src': ["'self'", 'blob:'],
        'media-src': ["'self'", 'blob:'], // the whiteboard tutor's voice

        'connect-src': ["'self'"],
        'upgrade-insecure-requests': config.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// The web server starts straight away; the database connects (and retries) in the background.
// Until it is ready, API calls get a clear 503 and /api/health explains why — no silent crash.
const dbState: { ready: boolean; error: string | null } = { ready: false, error: 'Connecting…' };

app.get('/api/health', async (_req, res) => {
  let dbOk = dbState.ready;
  if (dbOk) dbOk = await db.raw('select 1').then(() => true, () => false);
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    database: dbOk ? `${config.dbClient} connected` : `${config.dbClient}: ${dbState.error}`,
    engine: ai.enabled ? `built-in + AI (${ai.provider}, ${ai.model})` : 'built-in (API-free)',
    ...(ai.enabled ? { aiCheck } : {}),
    node: process.version,
  });
});
// Crashes in students' browsers are written to the server log (hPanel → your app → logs) so they can be fixed.
const errorReports = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
app.post('/api/client-error', errorReports, (req, res) => {
  const b = req.body || {};
  const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n).replace(/[\r\n]+/g, ' ⏎ ');
  console.error(`[client error] ${clip(b.message, 500)} | page ${clip(b.url, 200)} | ${clip(b.stack, 1500)} | ${clip(req.get('user-agent'), 160)}`);
  res.status(204).end();
});

app.use('/api', (req, res, next) => {
  if (dbState.ready) return next();
  res.status(503).json({ error: 'Charis Study is starting up or can’t reach its database. Try again in a minute.' });
});
app.use('/api/auth', authRouter);
app.use('/api/packs', packsRouter);
app.use('/api/study', studyRouter);
app.use('/api/ai', aiRouter);
app.use('/api/admin', adminRouter);
app.use('/api/plan', planRouter);
app.use('/api/points', pointsRouter);
app.use('/api/packs', papersRouter);
app.use('/api/library', libraryRouter);
app.use('/api/coach', coachRouter);
app.use('/api/classes', classesRouter);
app.use('/api/battles', battlesRouter);
app.use('/api/anatomy', anatomyRouter);
app.use('/api/tutor', tutorRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Public, search-engine-friendly pages (opt-in student profiles, top students, sitemap)
app.use((req, res, next) => (dbState.ready ? publicRouter(req, res, next) : next()));

// Serve the built web app in production (npm run build && npm start)
if (fs.existsSync(path.join(config.distDir, 'index.html'))) {
  app.use(
    express.static(config.distDir, {
      index: false,
      // /anatomy is both a page and the folder of 3D models: don't redirect the page to /anatomy/
      redirect: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        // 3D models are fetched with ?v=<size>, so a week of caching is safe and saves students' data
        else if (/[\\/](anatomy|draco)[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=604800');
      },
    }),
  );
  // A missing file (e.g. a script from an older deploy) must be a real 404 — sending the
  // web page instead makes the browser try to run HTML as code, which shows a blank screen.
  app.use((req, res, next) => {
    if (req.method === 'GET' && /\.[a-z0-9]{1,8}$/i.test(req.path)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).type('text/plain').send('Not found');
    }
    next();
  });
  app.get('/{*splat}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache'); // always check for a newer version of the app shell
    res.sendFile(path.join(config.distDir, 'index.html'));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message || 'Some details are missing or not valid.' });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if ((err as any)?.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large to upload in one go. Try splitting it into chapters.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`\n  Charis Study running on port ${config.port}`);
  console.log(`  AI: ${ai.enabled ? `${ai.provider} (${ai.model})` : 'off (API-free)'}`);
  console.log(`  Database: ${config.dbClient === 'mysql' ? `MySQL (${config.mysql.database} on ${config.mysql.host})` : config.sqliteFile}`);
  if (!fs.existsSync(path.join(config.distDir, 'index.html'))) console.log('  Web app (dev): http://localhost:5173\n');
});

/** Hide user names in database errors that /api/health shows publicly. */
function safeMessage(err: any): string {
  let msg = String(err?.message || err).replace(/'[^']*'@'[^']*'/g, "'***'@'***'");
  if (msg.includes('better-sqlite3')) msg = 'SQLite driver not installed on this server. Set the DB_* variables to use MySQL.';
  else if (config.dbClient === 'mysql' && /ECONNREFUSED|ENOTFOUND|Access denied|Unknown database/i.test(msg)) msg += ' — check DB_HOST, DB_USER, DB_PASSWORD and DB_NAME.';
  return msg;
}

/** One tiny request at start-up, so /api/health shows whether the AI key really works. */
let aiCheck = 'not checked yet';
async function checkAi() {
  if (!ai.enabled || ai.provider === 'mock') {
    aiCheck = ai.provider === 'mock' ? 'mock' : aiCheck;
    return;
  }
  try {
    const r = await complete({ system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'Say OK' }], maxTokens: 64, temperature: 0 });
    aiCheck = r.text ? 'working' : 'empty reply';
  } catch (err: any) {
    aiCheck = `failed: ${String(err?.message || err).slice(0, 160)}`;
    console.error('AI check failed:', err?.message || err);
  }
}

async function connectDatabase(attempt = 1): Promise<void> {
  try {
    await migrate();
    dbState.ready = true;
    dbState.error = null;
    startReminders();
    checkAi();
    console.log('  Database ready.');
    // fill the shared library with open textbooks and practice papers (once, in the background)
    seedLibrary().catch((err) => console.error('Library seed failed:', err?.message || err));
  } catch (err) {
    dbState.error = safeMessage(err);
    console.error(`Could not set up the database (attempt ${attempt}): ${dbState.error}`);
    setTimeout(() => connectDatabase(attempt + 1), Math.min(60000, 5000 * attempt));
  }
}
connectDatabase();

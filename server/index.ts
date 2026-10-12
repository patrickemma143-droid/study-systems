import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { config } from './config';
import { db, migrate } from './db';
import { authRouter, HttpError } from './auth';
import { packsRouter } from './routes/packs';
import { studyRouter } from './routes/study';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'font-src': ["'self'", 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'worker-src': ["'self'", 'blob:'],
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
    engine: 'built-in (API-free)',
    node: process.version,
  });
});
app.use('/api', (req, res, next) => {
  if (dbState.ready) return next();
  res.status(503).json({ error: 'Charis Study is starting up or can’t reach its database. Try again in a minute.' });
});
app.use('/api/auth', authRouter);
app.use('/api/packs', packsRouter);
app.use('/api/study', studyRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built web app in production (npm run build && npm start)
if (fs.existsSync(path.join(config.distDir, 'index.html'))) {
  app.use(
    express.static(config.distDir, {
      index: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(config.distDir, 'index.html')));
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

async function connectDatabase(attempt = 1): Promise<void> {
  try {
    await migrate();
    dbState.ready = true;
    dbState.error = null;
    console.log('  Database ready.');
  } catch (err) {
    dbState.error = safeMessage(err);
    console.error(`Could not set up the database (attempt ${attempt}): ${dbState.error}`);
    setTimeout(() => connectDatabase(attempt + 1), Math.min(60000, 5000 * attempt));
  }
}
connectDatabase();

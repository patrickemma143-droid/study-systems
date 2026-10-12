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

app.get('/api/health', async (_req, res) => {
  await db.raw('select 1');
  res.json({ ok: true, engine: 'built-in (API-free)' });
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

migrate()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`\n  Charis Study API running on http://localhost:${config.port}`);
      console.log(`  Database: ${config.dbClient === 'mysql' ? `MySQL (${config.mysql.database} on ${config.mysql.host})` : config.sqliteFile}`);
      if (!fs.existsSync(path.join(config.distDir, 'index.html'))) console.log('  Web app (dev): http://localhost:5173\n');
    });
  })
  .catch((err) => {
    console.error('Could not set up the database:', err?.message || err);
    if (String(err?.message).includes('better-sqlite3')) {
      console.error('The SQLite driver is not installed on this server. Set DB_CLIENT=mysql and the MYSQL_* variables to use MySQL instead.');
    } else if (config.dbClient === 'mysql') {
      console.error('Check MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE, and that the database exists.');
    }
    process.exit(1);
  });

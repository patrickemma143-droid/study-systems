// Public pages that search engines can read: opt-in student profiles, the weekly
// top students, a sitemap and robots.txt. Plain server-rendered HTML, no login needed.
import { Router, type Request } from 'express';
import { db } from './db';
import { leaderboard, thisWeek, lastWeek, CATEGORY_LABEL, type Category } from './points';

export const publicRouter = Router();

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function baseUrl(req: Request) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .slice(0, 50) || 'student'
  );
}

const fmtWeek = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function page(opts: { req: Request; title: string; description: string; path: string; body: string; jsonLd?: unknown }) {
  const url = `${baseUrl(opts.req)}${opts.path}`;
  const img = `${baseUrl(opts.req)}/icon-512.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="Charis Study">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(opts.title)}">
<meta name="twitter:description" content="${esc(opts.description)}">
${opts.jsonLd ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
<style>
:root{--ink:#17172f;--muted:#5d6080;--biro:#5a48f5;--paper:#fff;--desk:#f6f7fc;--line:#e8eaf3;--gold:#d4a017}
*{box-sizing:border-box}body{margin:0;background:var(--desk);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--biro)}header{background:var(--paper);border-bottom:1px solid var(--line)}
.wrap{max-width:900px;margin:0 auto;padding:16px}.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none;color:var(--ink)}
.brand img{width:32px;height:32px}.card{background:var(--paper);border-radius:18px;padding:22px;margin:16px 0;box-shadow:0 1px 0 var(--line),0 10px 30px -18px rgba(22,33,61,.35)}
h1{margin:0 0 4px;font-size:1.9rem;line-height:1.2}h2{font-size:1.15rem;margin:0 0 10px}.muted{color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}.stat{background:var(--desk);border-radius:12px;padding:12px}.stat b{display:block;font-size:1.5rem}
.badges{display:flex;flex-wrap:wrap;gap:8px}.badge{background:#fff7dd;border:1px solid #f0d77a;border-radius:999px;padding:4px 12px;font-size:.9rem}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);font-size:.95rem}th{color:var(--muted);font-weight:500;font-size:.8rem}
.cta{display:inline-block;background:var(--biro);color:#fff;text-decoration:none;padding:10px 18px;border-radius:12px;font-weight:600}
footer{color:var(--muted);font-size:.85rem;text-align:center;padding:24px 16px}
</style>
</head>
<body>
<header><div class="wrap"><a class="brand" href="/"><img src="/icon.svg" alt="">Charis Study</a></div></header>
<main class="wrap">${opts.body}</main>
<footer>Charis Study by Charis Creations, Kampala · Points are earned for real study work and re-checked by the app.</footer>
</body>
</html>`;
}

/** Achievements for a student across recent weeks: overall and university ranks, category wins. */
async function achievements(userId: number, university: string | null) {
  const weeks = (await db('points_events').where({ user_id: userId }).distinct('week').orderBy('week', 'desc').limit(10)).map((r: any) => r.week as string);
  const out: { week: string; text: string; rank: number }[] = [];
  for (const w of weeks) {
    const final = w !== thisWeek();
    const all = await leaderboard(w);
    const me = all.find((r) => r.userId === userId);
    if (!me) continue;
    if (me.rank <= 10) out.push({ week: w, rank: me.rank, text: `#${me.rank} overall${final ? '' : ' (this week so far)'}` });
    if (university) {
      const uni = await leaderboard(w, { university });
      const mine = uni.find((r) => r.userId === userId);
      if (mine && mine.rank <= 3 && uni.length >= 2) out.push({ week: w, rank: mine.rank, text: `#${mine.rank} at ${university}${final ? '' : ' (so far)'}` });
      for (const cat of ['memory', 'fast', 'explain'] as Category[]) {
        const best = [...uni].sort((a, b) => b[cat] - a[cat])[0];
        if (final && best?.userId === userId && best[cat] > 0 && uni.length >= 3) out.push({ week: w, rank: 1, text: `Top ${CATEGORY_LABEL[cat]} at ${university}` });
      }
    }
  }
  return out;
}

publicRouter.get('/u/:slug', async (req, res, next) => {
  try {
    const u = await db('users').where({ public_slug: String(req.params.slug).slice(0, 80), public_profile: true }).select('id', 'name', 'university', 'course', 'bio', 'created_at').first();
    if (!u) return res.status(404).type('html').send(page({ req, title: 'Profile not found | Charis Study', description: 'This student profile is private or does not exist.', path: req.path, body: '<div class="card"><h1>Profile not found</h1><p class="muted">This profile is private or no longer exists.</p><a class="cta" href="/">Go to Charis Study</a></div>' }));
    const total = await db('points_events').where({ user_id: u.id }).sum({ p: 'points' }).first();
    const byCat = await db('points_events').where({ user_id: u.id }).groupBy('category').select('category').sum({ p: 'points' });
    const cats: Record<string, number> = {};
    for (const r of byCat as any[]) cats[r.category] = Number(r.p);
    const proven = await db('points_events').where({ user_id: u.id }).andWhere('dedupe', 'like', 'proven-%').count({ n: '*' }).first();
    const best = await db('points_events').where({ user_id: u.id }).max({ q: db.raw("CASE WHEN dedupe LIKE 'quiz-%' THEN score END") }).max({ e: db.raw("CASE WHEN category = 'explain' THEN score END") }).first();
    const strong = await db('cards').where({ user_id: u.id }).andWhere('interval_days', '>=', 7).count({ n: '*' }).first();
    const ach = await achievements(u.id, u.university);
    const where = [u.course, u.university].filter(Boolean).join(', ');
    const pts = Number((total as any)?.p || 0);
    const title = `${u.name}${u.university ? ` — ${u.university}` : ''} | Charis Study`;
    const description = `${u.name}${where ? `, ${where}` : ''}: ${pts} study points on Charis Study${ach[0] ? `, ${ach[0].text} (week of ${fmtWeek(ach[0].week)})` : ''}. ${Number((proven as any)?.n || 0)} lessons mastered and ${Number((strong as any)?.n || 0)} facts in long-term memory.`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      mainEntity: {
        '@type': 'Person',
        name: u.name,
        description: u.bio || undefined,
        ...(u.university ? { affiliation: { '@type': 'CollegeOrUniversity', name: u.university } } : {}),
        ...(u.course ? { knowsAbout: u.course } : {}),
        award: ach.slice(0, 10).map((a) => `${a.text}, Charis Study, week of ${fmtWeek(a.week)}`),
      },
    };
    const body = `
<div class="card">
  <h1>${esc(u.name)}</h1>
  <div class="muted">${esc(where || 'Student')}</div>
  ${u.bio ? `<p>${esc(u.bio)}</p>` : ''}
</div>
<div class="card">
  <h2>Study record</h2>
  <div class="stats">
    <div class="stat"><b>${pts}</b>study points</div>
    <div class="stat"><b>${cats.memory || 0}</b>memory points</div>
    <div class="stat"><b>${cats.fast || 0}</b>fast learner points</div>
    <div class="stat"><b>${cats.explain || 0}</b>explainer points</div>
    <div class="stat"><b>${Number((proven as any)?.n || 0)}</b>lessons mastered</div>
    <div class="stat"><b>${Number((strong as any)?.n || 0)}</b>facts in long-term memory</div>
    ${(best as any)?.q != null ? `<div class="stat"><b>${Number((best as any).q)}%</b>best quiz</div>` : ''}
    ${(best as any)?.e != null ? `<div class="stat"><b>${Number((best as any).e)}%</b>best explanation</div>` : ''}
  </div>
</div>
${ach.length ? `<div class="card"><h2>Achievements</h2><div class="badges">${ach.map((a) => `<span class="badge">🏆 ${esc(a.text)} · week of ${esc(fmtWeek(a.week))}</span>`).join('')}</div></div>` : ''}
<div class="card"><p>Charis Study turns lecture notes into lessons, flashcards and quizzes, and ranks students every week for memory, fast learning and explaining ideas in their own words.</p><a class="cta" href="/register">Start studying free</a> &nbsp; <a href="/leaderboard">See this week’s top students</a></div>`;
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.type('html').send(page({ req, title, description, path: req.path, body, jsonLd }));
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/leaderboard', async (req, res, next) => {
  try {
    const week = req.query.week === 'last' ? lastWeek() : thisWeek();
    const all = (await leaderboard(week)).filter((r) => r.total > 0);
    const pub = new Map((await db('users').whereIn('id', all.map((r) => r.userId).slice(0, 500)).andWhere({ public_profile: true }).select('id', 'public_slug')).map((u: any) => [u.id, u.public_slug]));
    // Only students who made their profile public are named; everyone else is counted, not shown.
    const rows = all.filter((r) => pub.has(r.userId)).slice(0, 50);
    const unis = new Map<string, number>();
    for (const r of all) if (r.university) unis.set(r.university, (unis.get(r.university) || 0) + r.total);
    const topUnis = [...unis.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const title = `Top students this week (${fmtWeek(week)}) | Charis Study`;
    const description = `Weekly ranking of university students on Charis Study for memory, fast learning and explaining. ${all.length} students earned points in the week of ${fmtWeek(week)}.`;
    const body = `
<div class="card"><h1>Top students</h1><div class="muted">Week of ${esc(fmtWeek(week))} · ${req.query.week === 'last' ? 'final results' : 'live'} · <a href="/leaderboard${req.query.week === 'last' ? '' : '?week=last'}">${req.query.week === 'last' ? 'this week' : 'last week’s results'}</a></div></div>
<div class="card"><table><thead><tr><th>#</th><th>Student</th><th>University</th><th>Points</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${r.rank}</td><td><a href="/u/${esc(pub.get(r.userId))}">${esc(r.name)}</a><div class="muted" style="font-size:.85rem">${esc(r.course || '')}</div></td><td>${esc(r.university || '')}</td><td><b>${r.total}</b></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No public profiles on the board yet this week.</td></tr>'}
</tbody></table></div>
${topUnis.length ? `<div class="card"><h2>Universities this week</h2><table><tbody>${topUnis.map(([u, p], i) => `<tr><td>${i + 1}</td><td>${esc(u)}</td><td><b>${p}</b> points</td></tr>`).join('')}</tbody></table></div>` : ''}
<div class="card"><a class="cta" href="/register">Join and compete</a></div>`;
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('html').send(page({ req, title, description, path: '/leaderboard', body }));
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = baseUrl(req);
    const users = await db('users').where({ public_profile: true }).whereNotNull('public_slug').select('public_slug', 'id');
    const urls = [`${base}/`, `${base}/leaderboard`, ...users.map((u: any) => `${base}/u/${u.public_slug}`)];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>`);
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /$\nAllow: /u/\nAllow: /leaderboard\nAllow: /register\nDisallow: /api/\nDisallow: /home\nDisallow: /pack/\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});

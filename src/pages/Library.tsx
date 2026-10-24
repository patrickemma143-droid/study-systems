import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Library as LibraryIcon, Search, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorState, Loading } from '../components/ui';
import { FACULTY_ICON, FACULTY_TINT, ItemCard, type LibItem } from '../components/LibraryParts';
import { FACULTIES, facultyById, ITEM_TYPES } from '@shared/library';

interface Home {
  faculties: { id: string; label: string; short: string; packs: number; books: number; papers: number }[];
  popular: LibItem[];
  fresh: LibItem[];
  total: number;
}
interface Results {
  items: LibItem[];
  total: number;
  page: number;
  pages: number;
}

export default function Library() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const q = params.get('q') || '';
  const faculty = params.get('faculty') || '';
  const type = params.get('type') || '';
  const sort = params.get('sort') || 'popular';
  const year = params.get('year') || '';
  const uni = params.get('uni') || '';
  const page = Number(params.get('page') || 1);
  const browsing = !!(q || faculty || type || year || uni || params.get('all'));

  const [home, setHome] = useState<Home | null>(null);
  const [res, setRes] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState(q);
  const [mine, setMine] = useState<LibItem[]>([]);

  useEffect(() => {
    setText(q);
  }, [q]);
  useEffect(() => {
    api<Home>('/library/home')
      .then(setHome)
      .catch((e) => setError(e.message));
    api<{ items: LibItem[] }>('/library/mine')
      .then((r) => setMine(r.items))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!browsing) return;
    setRes(null);
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (faculty) sp.set('faculty', faculty);
    if (type) sp.set('type', type);
    if (year) sp.set('year', year);
    if (uni) sp.set('university', uni);
    sp.set('sort', sort);
    sp.set('page', String(page));
    api<Results>(`/library?${sp}`)
      .then(setRes)
      .catch((e) => setError(e.message));
  }, [browsing, q, faculty, type, sort, year, uni, page, params]);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };
  function search(e: FormEvent) {
    e.preventDefault();
    update({ q: text.trim() });
  }

  if (error) return <ErrorState message={error} />;
  if (!home) return <Loading />;

  return (
    <div>
      <div className="lib-hero">
        <h1 className="row" style={{ gap: 10 }}>
          <LibraryIcon size={30} color="var(--biro)" /> Library
        </h1>
        <p className="muted" style={{ margin: '0 0 14px', maxWidth: 640 }}>
          Notes, books and past papers shared by students. Find your course, add it to your packs in one tap, and start studying without uploading anything.
        </p>
        <form className="lib-search" onSubmit={search} role="search">
          <Search size={18} aria-hidden />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search a course code, topic, book or university, e.g. “BST 2101”" aria-label="Search the library" />
          {text && (
            <button type="button" className="btn icon ghost" aria-label="Clear search" onClick={() => { setText(''); update({ q: '' }); }}>
              <X size={16} />
            </button>
          )}
          <button className="btn primary" type="submit">
            Search
          </button>
        </form>
        <div className="row" style={{ gap: 6, marginTop: 12 }}>
          <button className="chip" aria-pressed={!type} onClick={() => update({ type: '' })}>
            Everything
          </button>
          {ITEM_TYPES.map((t) => (
            <button key={t.id} className="chip" aria-pressed={type === t.id} onClick={() => update({ type: type === t.id ? '' : t.id })}>
              {t.label === 'Book' ? 'Books' : t.label === 'Past paper' ? 'Past papers' : t.label}
            </button>
          ))}
          {user?.university && (
            <button className="chip" aria-pressed={uni === user.university} onClick={() => update({ uni: uni ? '' : user.university! })}>
              Only {user.university}
            </button>
          )}
        </div>
      </div>

      {!browsing ? (
        <>
          <section className="section">
            <div className="section-head">
              <h2>Browse by faculty</h2>
              <span className="small muted">{home.total} item{home.total === 1 ? '' : 's'} shared</span>
            </div>
            <div className="fac-grid">
              {home.faculties.map((f) => {
                const Icon = FACULTY_ICON[f.id];
                const n = f.packs + f.books + f.papers;
                return (
                  <button key={f.id} className="fac-tile" onClick={() => update({ faculty: f.id })}>
                    <span className="fac-icon" style={{ background: FACULTY_TINT[f.id] }}>
                      <Icon size={22} />
                    </span>
                    <span className="fac-name">{f.label}</span>
                    <span className="small muted">{n ? [f.packs && `${f.packs} notes`, f.books && `${f.books} book${f.books === 1 ? '' : 's'}`, f.papers && `${f.papers} past paper${f.papers === 1 ? '' : 's'}`].filter(Boolean).join(' · ') : 'Be the first to share'}</span>
                  </button>
                );
              })}
            </div>
          </section>
          {home.popular.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>Most used</h2>
                <button className="btn small ghost" onClick={() => update({ all: '1', sort: 'popular' })}>
                  See everything
                </button>
              </div>
              <div className="lib-grid">
                {home.popular.map((it) => (
                  <ItemCard key={it.id} item={it} />
                ))}
              </div>
            </section>
          )}
          {home.fresh.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>Just added</h2>
              </div>
              <div className="lib-grid">
                {home.fresh.map((it) => (
                  <ItemCard key={it.id} item={it} />
                ))}
              </div>
            </section>
          )}
          {home.total === 0 && (
            <div className="sheet empty" style={{ marginTop: 18 }}>
              <h2>The library is just starting</h2>
              <p className="muted">Open one of your study packs and press “Share to the library”. Every pack you share saves a classmate the upload, and you earn Helper points each time someone uses it.</p>
              <Link to="/home" className="btn primary">
                Go to my packs
              </Link>
            </div>
          )}
        </>
      ) : (
        <section className="section">
          <div className="lib-filters">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn small ghost" onClick={() => setParams(new URLSearchParams())}>
                ← All faculties
              </button>
              <select className="input small-input" value={faculty} onChange={(e) => update({ faculty: e.target.value })} aria-label="Faculty">
                <option value="">All faculties</option>
                {FACULTIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input className="input small-input" type="number" min={1980} max={2100} value={year} onChange={(e) => update({ year: e.target.value })} placeholder="Year" aria-label="Year" style={{ width: 100 }} />
              <select className="input small-input" value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
                <option value="popular">Most used</option>
                <option value="rated">Best rated</option>
                <option value="new">Newest</option>
              </select>
            </div>
            <div className="small muted">
              {res ? `${res.total} result${res.total === 1 ? '' : 's'}` : 'Searching…'}
              {faculty ? ` in ${facultyById(faculty).label}` : ''}
              {q ? ` for “${q}”` : ''}
            </div>
          </div>
          {!res ? (
            <Loading />
          ) : res.items.length === 0 ? (
            <div className="sheet empty">
              <h2>Nothing here yet</h2>
              <p className="muted">No one has shared this yet. Upload your notes or past paper and share it — your classmates will thank you.</p>
              <Link to="/new" className="btn primary">
                Upload notes
              </Link>
            </div>
          ) : (
            <>
              <div className="lib-grid">
                {res.items.map((it) => (
                  <ItemCard key={it.id} item={it} />
                ))}
              </div>
              {res.pages > 1 && (
                <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
                  <button className="btn small" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                    Previous
                  </button>
                  <span className="small muted">
                    Page {page} of {res.pages}
                  </span>
                  <button className="btn small" disabled={page >= res.pages} onClick={() => update({ page: String(page + 1) })}>
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {mine.length > 0 && !browsing && (
        <section className="section">
          <div className="section-head">
            <h2>Shared by you</h2>
            <span className="small muted">{mine.reduce((n, m) => n + m.uses, 0)} uses by classmates</span>
          </div>
          <div className="lib-grid">
            {mine.map((it) => (
              <ItemCard key={it.id} item={it} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

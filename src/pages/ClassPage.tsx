import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, CalendarDays, Copy, FileQuestion, Megaphone, Plus, Share2, Trash2, Trophy, Users } from 'lucide-react';
import { api } from '../api';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';
import { examLabel } from '../lib/util';

interface ClassDetail {
  class: { id: number; name: string; courseCode: string | null; university: string | null; examDate: string | null; joinCode: string | null };
  role: 'owner' | 'rep' | 'member';
  members: { id: number; name: string; role: string }[];
  items: { id: number; kind: 'pack' | 'paper'; title: string; year: number | null; lessons: number; cards: number; addedBy: string; createdAt: number; myPackId: number | null }[];
  posts: { id: number; text: string; at: number; name: string; mine: boolean }[];
  ranking: { userId: number; name: string; total: number; rank: number }[];
  myPacks: { id: number; title: string }[];
  myPapers: { id: number; name: string; packTitle: string }[];
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default function ClassPage() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<ClassDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState('');
  const [adding, setAdding] = useState('');
  const [paperTarget, setPaperTarget] = useState<Record<number, number>>({});
  const [exam, setExam] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ClassDetail>(`/classes/${id}`)
      .then(setD)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} action={<Link to="/classes" className="btn">My classes</Link>} />;
  if (!d) return <Loading />;
  const manage = d.role !== 'member';
  const link = d.class.joinCode ? `${location.origin}/join/${d.class.joinCode}` : '';

  async function share(e: FormEvent) {
    e.preventDefault();
    if (!adding) return;
    const [kind, sid] = adding.split(':');
    try {
      await api(`/classes/${id}/items`, { body: kind === 'pack' ? { packId: Number(sid) } : { paperId: Number(sid) } });
      setAdding('');
      toast('Shared with the class.');
      load();
    } catch (err: any) {
      toast(err.message);
    }
  }
  async function addItem(itemId: number, kind: string) {
    try {
      const r = await api<{ packId: number }>(`/classes/${id}/items/${itemId}/add`, { body: kind === 'paper' ? { packId: paperTarget[itemId] || d!.myPacks[0]?.id } : {} });
      if (kind === 'pack') nav(`/pack/${r.packId}`);
      else {
        toast('Past paper added to your pack.');
        load();
      }
    } catch (err: any) {
      toast(err.message);
    }
  }
  async function sendPost(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/classes/${id}/posts`, { body: { text: post } });
      setPost('');
      load();
    } catch (err: any) {
      toast(err.message);
    }
  }
  async function saveExam() {
    await api(`/classes/${id}`, { method: 'PATCH', body: { examDate: exam || null } });
    setExam(null);
    toast('Exam date saved for the whole class.');
    load();
  }
  async function member(uid: number, action: 'rep' | 'member' | 'remove') {
    try {
      await api(`/classes/${id}/members/${uid}`, { body: { action } });
      load();
    } catch (err: any) {
      toast(err.message);
    }
  }
  async function leaveOrDelete() {
    if (d!.role === 'owner') {
      if (!confirm('Delete this class for everyone? Packs students already added stay in their accounts.')) return;
      await api(`/classes/${id}`, { method: 'DELETE' });
    } else {
      if (!confirm('Leave this class?')) return;
      const me = await api<{ user: { id: number } }>('/auth/me');
      await api(`/classes/${id}/members/${me.user.id}`, { body: { action: 'remove' } });
    }
    nav('/classes');
  }
  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast('Copied.'),
      () => toast(text),
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/classes', label: 'Classes' }, { label: d.class.name }]} />
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{d.class.name}</h1>
          <div className="muted">{[d.class.courseCode, d.class.university, `${d.members.length} member${d.members.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</div>
        </div>
        {exam !== null ? (
          <span className="row" style={{ gap: 6 }}>
            <input type="date" className="input" value={exam} onChange={(e) => setExam(e.target.value)} aria-label="Exam date" style={{ width: 'auto' }} />
            <button className="btn small primary" onClick={saveExam}>
              Save
            </button>
          </span>
        ) : (
          <button className={`chip ${d.class.examDate ? 'exam' : ''}`} onClick={() => manage && setExam(d.class.examDate || '')} disabled={!manage}>
            <CalendarDays size={14} /> {examLabel(d.class.examDate) || (manage ? 'Set the exam date' : 'No exam date yet')}
          </button>
        )}
      </div>

      {manage && d.class.joinCode && (
        <div className="sheet tight lib-banner" style={{ marginTop: 16 }}>
          <span>
            Class code <strong style={{ letterSpacing: '.14em', fontSize: '1.1rem' }}>{d.class.joinCode}</strong>
            <span className="small muted"> — share it in your class WhatsApp group</span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn small" onClick={() => copy(link)}>
              <Copy size={15} /> Copy link
            </button>
            <a className="btn small" href={`https://wa.me/?text=${encodeURIComponent(`Join our class "${d.class.name}" on Charis Study: ${link}`)}`} target="_blank" rel="noreferrer">
              <Share2 size={15} /> WhatsApp
            </a>
          </span>
        </div>
      )}

      <div className="grid cols-2" style={{ alignItems: 'start', marginTop: 18 }}>
        <div className="stack">
          <div className="sheet stack">
            <strong className="row" style={{ gap: 6 }}>
              <BookOpen size={18} /> Class materials
            </strong>
            {d.items.length === 0 && <span className="small muted">{manage ? 'Share your study packs and past papers below, and the whole class gets them.' : 'Nothing shared yet. Your course rep will add notes and past papers here.'}</span>}
            {d.items.map((it) => (
              <div key={it.id} className="class-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    {it.kind === 'pack' ? <BookOpen size={15} /> : <FileQuestion size={15} />}
                    <strong>{it.title}</strong>
                  </div>
                  <div className="small muted">
                    {it.kind === 'pack' ? `${it.lessons} lessons · ${it.cards} cards` : `Past paper${it.year ? ` ${it.year}` : ''} · ${it.cards} questions`} · shared by {it.addedBy} {ago(it.createdAt)}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {it.kind === 'pack' ? (
                    it.myPackId ? (
                      <Link to={`/pack/${it.myPackId}`} className="btn small">
                        Open
                      </Link>
                    ) : (
                      <button className="btn small primary" onClick={() => addItem(it.id, 'pack')}>
                        <Plus size={14} /> Add to my packs
                      </button>
                    )
                  ) : d.myPacks.length ? (
                    <>
                      <select className="input small-input" value={paperTarget[it.id] || d.myPacks[0].id} onChange={(e) => setPaperTarget({ ...paperTarget, [it.id]: Number(e.target.value) })} aria-label="Add to which pack" style={{ maxWidth: 150 }}>
                        {d.myPacks.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      <button className="btn small primary" onClick={() => addItem(it.id, 'paper')}>
                        Add
                      </button>
                    </>
                  ) : null}
                  {manage && (
                    <button
                      className="btn small ghost icon"
                      aria-label="Remove from class"
                      onClick={async () => {
                        await api(`/classes/${id}/items/${it.id}`, { method: 'DELETE' });
                        load();
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {manage && (d.myPacks.length > 0 || d.myPapers.length > 0) && (
              <form className="row" style={{ gap: 8, marginTop: 6 }} onSubmit={share}>
                <select className="input" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Share with the class" style={{ flex: 1, minWidth: 0 }}>
                  <option value="">Share one of mine…</option>
                  <optgroup label="Study packs">
                    {d.myPacks.map((p) => (
                      <option key={p.id} value={`pack:${p.id}`}>
                        {p.title}
                      </option>
                    ))}
                  </optgroup>
                  {d.myPapers.length > 0 && (
                    <optgroup label="Past papers">
                      {d.myPapers.map((p) => (
                        <option key={p.id} value={`paper:${p.id}`}>
                          {p.name} ({p.packTitle})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button className="btn primary" disabled={!adding}>
                  Share
                </button>
              </form>
            )}
          </div>

          <div className="sheet stack">
            <strong className="row" style={{ gap: 6 }}>
              <Megaphone size={18} /> Class board
            </strong>
            <form className="row" style={{ gap: 8 }} onSubmit={sendPost}>
              <input className="input" value={post} onChange={(e) => setPost(e.target.value)} placeholder={manage ? 'Announce something to the class…' : 'Ask the class something…'} aria-label="Message" maxLength={1000} style={{ flex: 1 }} />
              <button className="btn" disabled={!post.trim()}>
                Post
              </button>
            </form>
            {d.posts.length === 0 && <span className="small muted">No messages yet.</span>}
            {d.posts.map((p) => (
              <div key={p.id} className="class-post">
                <div className="small">
                  <strong>{p.name}</strong> <span className="muted">· {ago(p.at)}</span>
                  {(p.mine || manage) && (
                    <button
                      className="btn ghost small icon"
                      aria-label="Delete message"
                      style={{ float: 'right', minHeight: 0, padding: 2 }}
                      onClick={async () => {
                        await api(`/classes/${id}/posts/${p.id}`, { method: 'DELETE' });
                        load();
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="sheet stack">
            <strong className="row" style={{ gap: 6 }}>
              <Trophy size={18} /> Class ranking this week
            </strong>
            {d.ranking.length === 0 ? (
              <span className="small muted">No points yet this week. Study to put yourself on the board.</span>
            ) : (
              <ol className="class-rank">
                {d.ranking.slice(0, 15).map((r) => (
                  <li key={r.userId}>
                    <span className="rank-n">{r.rank}</span>
                    <span style={{ flex: 1 }}>{r.name}</span>
                    <strong>{r.total}</strong>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="sheet stack">
            <strong className="row" style={{ gap: 6 }}>
              <Users size={18} /> Members
            </strong>
            {d.members.map((m) => (
              <div key={m.id} className="row between small" style={{ gap: 6 }}>
                <span>
                  {m.name} {m.role !== 'member' && <span className="chip">{m.role === 'owner' ? 'Owner' : 'Course rep'}</span>}
                </span>
                {d.role === 'owner' && m.role !== 'owner' && (
                  <span className="row" style={{ gap: 4 }}>
                    <button className="btn ghost small" onClick={() => member(m.id, m.role === 'rep' ? 'member' : 'rep')}>
                      {m.role === 'rep' ? 'Remove rep' : 'Make rep'}
                    </button>
                    <button className="btn ghost small" onClick={() => member(m.id, 'remove')}>
                      Remove
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
          <button className="btn ghost small" onClick={leaveOrDelete}>
            {d.role === 'owner' ? 'Delete this class' : 'Leave this class'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, Eye, EyeOff, Shuffle, Sparkles } from 'lucide-react';
import type { Mnemonic } from '@shared/engine/types';
import { acrosticFor, buildMnemonic } from '@shared/engine/mnemonics';
import { api, type Note } from '../api';
import { Crumbs, ErrorState, Loading, useToast } from '../components/ui';
import { usePack, useStudyTimer } from '../lib/usePack';

function MnemonicCard({ m, packId, saved, onSave }: { m: Mnemonic; packId: number; saved?: string; onSave: (key: string, text: string) => void }) {
  const [acrostic, setAcrostic] = useState(m.acrostics[0]);
  const [mine, setMine] = useState(saved || '');
  const [story, setStory] = useState(false);
  const [testing, setTesting] = useState(false);
  const letters = m.acronym.split('');
  const ordered = m.order.map((i) => m.items[i]);

  useEffect(() => setMine(saved || ''), [saved]);

  return (
    <div className="sheet stack">
      <div className="row between">
        <div>
          <div className="small muted">{m.ordered ? 'In this order' : 'Any order'}</div>
          <h3 style={{ margin: 0 }}>{m.category.charAt(0).toUpperCase() + m.category.slice(1)}</h3>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {m.chunk >= 0 && (
            <Link to={`/pack/${packId}/learn/${m.chunk}`} className="btn ghost small">
              <BookOpen size={16} /> Lesson {m.chunk + 1}
            </Link>
          )}
          <button className="btn small" onClick={() => setTesting((t) => !t)} aria-pressed={testing}>
            {testing ? <Eye size={16} /> : <EyeOff size={16} />} {testing ? 'Show list' : 'Test me'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label={`Acronym ${m.acronym}`}>
        {letters.map((l, i) => (
          <span key={i} style={{ width: 46, height: 52, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--hl-pink)', color: 'var(--hl-ink)', fontWeight: 700, fontSize: '1.5rem' }}>
            {l}
          </span>
        ))}
      </div>

      {testing ? (
        <p className="muted" style={{ margin: 0 }}>
          Say what each letter stands for, out loud, then tap “Show list” to check.
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
          {ordered.map((it, i) => (
            <li key={i} style={{ padding: '4px 0' }}>
              <mark className="hl-pink" style={{ fontWeight: 700 }}>
                {it.charAt(0)}
              </mark>
              {it.slice(1)}
            </li>
          ))}
        </ul>
      )}

      <div style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--paper-2)' }}>
        <div className="row between">
          <span className="small muted">Silly sentence</span>
          <button className="btn ghost small" onClick={() => setAcrostic(acrosticFor(letters))}>
            <Shuffle size={15} /> Another one
          </button>
        </div>
        <div className="hand" style={{ fontSize: '1.7rem', color: 'var(--biro)' }}>
          {acrostic}
        </div>
      </div>

      <div className="field">
        <label htmlFor={`mine-${m.category}`}>Make your own (yours will stick best)</label>
        <input
          id={`mine-${m.category}`}
          className="input"
          placeholder={`A sentence where the words start with ${letters.join(', ')}`}
          value={mine}
          onChange={(e) => setMine(e.target.value)}
          onBlur={() => mine.trim() && mine !== saved && onSave(m.category, mine.trim())}
        />
      </div>

      <div>
        <button className="btn ghost small" onClick={() => setStory((s) => !s)} aria-expanded={story}>
          <Sparkles size={15} /> {story ? 'Hide the story' : 'Turn it into a story'}
        </button>
        {story && <p style={{ margin: '8px 0 0' }}>{m.story}</p>}
      </div>
    </div>
  );
}

export default function Mnemonics() {
  const id = Number(useParams().id);
  const toast = useToast();
  const { data, error } = usePack(id);
  useStudyTimer('mnemonics', id);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [customName, setCustomName] = useState('');
  const [customItems, setCustomItems] = useState('');
  const [custom, setCustom] = useState<Mnemonic[]>([]);

  useEffect(() => {
    api<{ notes: Note<{ key: string; text?: string; items?: string[]; ordered?: boolean }>[] }>(`/study/notes?packId=${id}&kind=mnemonic`).then((r) => {
      const m: Record<string, string> = {};
      const own: Mnemonic[] = [];
      for (const n of r.notes) {
        if (n.content.items) own.push(buildMnemonic({ category: n.content.key.replace(/^custom:/, ''), items: n.content.items.map((label) => ({ label })), ordered: !!n.content.ordered, chunk: -1 }, n.content.key));
        else if (n.content.text) m[n.content.key] = n.content.text;
      }
      setSaved(m);
      setCustom(own);
    });
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  async function saveMine(key: string, text: string) {
    await api('/study/notes', { body: { packId: id, kind: 'mnemonic', content: { key, text } } });
    setSaved((s) => ({ ...s, [key]: text }));
    toast('Your mnemonic is saved');
  }

  async function makeCustom() {
    const items = customItems.split('\n').map((s) => s.trim()).filter(Boolean);
    if (items.length < 2 || !customName.trim()) return toast('Add a name and at least two items, one per line.');
    const key = `custom:${customName.trim()}`;
    await api('/study/notes', { body: { packId: id, kind: 'mnemonic', content: { key, items, ordered: true } } });
    setCustom((c) => [buildMnemonic({ category: customName.trim(), items: items.map((label) => ({ label })), ordered: true, chunk: -1 }, key), ...c]);
    setCustomName('');
    setCustomItems('');
  }

  const list = data.pack.data.mnemonics;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <Crumbs items={[{ to: '/home', label: 'Home' }, { to: `/pack/${id}`, label: data.pack.title }, { label: 'Mnemonics' }]} />
      <h1>Mnemonics</h1>
      <p className="muted">Turn every list into a word you can say and a sentence you can’t forget. The sillier the sentence, the better it works.</p>

      <div className="stack" style={{ marginTop: 18 }}>
        {[...custom, ...list].map((m, i) => (
          <MnemonicCard key={`${m.category}-${i}`} m={m} packId={id} saved={saved[m.category]} onSave={saveMine} />
        ))}
        {!list.length && !custom.length && (
          <div className="sheet empty">
            <h2>No lists found in these notes</h2>
            <p className="muted">Mnemonics work best for lists, like “the four stages of mitosis”. Make one yourself below.</p>
          </div>
        )}

        <div className="sheet stack">
          <h3 style={{ margin: 0 }}>Make a mnemonic for any list</h3>
          <div className="field">
            <label htmlFor="cn">What is the list?</label>
            <input id="cn" className="input" placeholder="e.g. Functions of management" value={customName} onChange={(e) => setCustomName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ci">Items, one per line, in order</label>
            <textarea id="ci" className="textarea" placeholder={'Planning\nOrganising\nLeading\nControlling'} value={customItems} onChange={(e) => setCustomItems(e.target.value)} />
          </div>
          <button className="btn primary" onClick={makeCustom}>
            <Sparkles size={18} /> Make my mnemonic
          </button>
        </div>
      </div>
    </div>
  );
}

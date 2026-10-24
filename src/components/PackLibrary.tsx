// The library on a pack's page: share it, see where it came from, or spot that it's already shared.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Library as LibraryIcon, Sparkles, Users } from 'lucide-react';
import { api } from '../api';
import { ShareToLibrary, type LibItem } from './LibraryParts';
import { useToast } from './ui';

export function PackLibraryCard({ packId, libraryItemId, sharedItemId, onShared }: { packId: number; libraryItemId: number | null; sharedItemId: number | null; onShared: () => void }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  if (libraryItemId) {
    return (
      <section className="section">
        <div className="sheet tight row between lib-banner">
          <span className="row" style={{ gap: 8 }}>
            <LibraryIcon size={18} color="var(--biro)" /> This pack came from the library. Your progress, cards and timetable are your own.
          </span>
          <Link to={`/library/${libraryItemId}`} className="btn small">
            View in library
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className="section" id="share">
      <div className="sheet stack">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <strong className="row" style={{ gap: 6 }}>
              <LibraryIcon size={18} color="var(--biro)" /> {sharedItemId ? 'Shared in the library' : 'Share this pack with your classmates'}
            </strong>
            <div className="small muted" style={{ marginTop: 2 }}>
              {sharedItemId
                ? 'Classmates can find it by course, university and faculty, and add it in one tap. You earn Helper points each time someone uses it.'
                : 'Put it in the library so others can study it without uploading anything. If you made it smart, they get the AI cards too, free.'}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {sharedItemId && (
              <Link to={`/library/${sharedItemId}`} className="btn small">
                View
              </Link>
            )}
            {!open && (
              <button className="btn small primary" onClick={() => setOpen(true)}>
                <LibraryIcon size={15} /> {sharedItemId ? 'Update details' : 'Share to the library'}
              </button>
            )}
          </div>
        </div>
        {open && (
          <ShareToLibrary
            packId={packId}
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              toast('Shared to the library. Thank you!');
              onShared();
            }}
          />
        )}
      </div>
    </section>
  );
}

/** After uploading: "these notes are already in the library (and already smart)". */
export function LibraryMatch({ packId, onResult }: { packId: number; onResult?: (found: boolean) => void }) {
  const [m, setM] = useState<LibItem | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    api<{ match: LibItem | null }>(`/library/match/${packId}`)
      .then((r) => {
        setM(r.match);
        onResult?.(!!r.match);
      })
      .catch(() => onResult?.(false));
  }, [packId]);
  if (!m) return null;
  async function swap() {
    setBusy(true);
    try {
      const r = await api<{ packId: number }>(`/library/${m!.id}/add`, { body: {} });
      // the shared copy replaces the one just uploaded
      await api(`/packs/${packId}`, { method: 'DELETE' }).catch(() => {});
      nav(`/pack/${r.packId}`, { replace: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheet tight lib-banner" style={{ marginBottom: 18 }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <strong>These notes are already in the library.</strong>{' '}
        <span className="small">
          “{m.title}”{m.courseCode ? ` (${m.courseCode})` : ''} — <Users size={13} style={{ verticalAlign: '-2px' }} /> {m.uses} students use it
          {m.smart && (
            <>
              , and it’s already a <Sparkles size={13} style={{ verticalAlign: '-2px' }} /> smart pack
            </>
          )}
          .
        </span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Link to={`/library/${m.id}`} className="btn small">
          Look at it
        </Link>
        <button className="btn small primary" onClick={swap} disabled={busy}>
          {busy ? 'Switching…' : 'Use the library copy'}
        </button>
      </div>
    </div>
  );
}

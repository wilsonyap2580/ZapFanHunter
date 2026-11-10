import { useEffect, useState } from 'react';
import { api, km } from './api.js';
import Icon from './Icon.jsx';

// "Can't find a shop? Add it": search Google for the shop by name, pick it, and it joins the results.
// Searching only runs on submit (not while typing) to keep Google calls down.
export default function AddShop({ center, initialQuery = '', onAdded, onClose }) {
  const [q, setQ] = useState(initialQuery);
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [addingId, setAddingId] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  async function search(e) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setMsg('');
    try { setList(await api.candidates(q.trim(), center)); } catch (err) { setMsg(err.message); setList(null); } finally { setBusy(false); }
  }

  async function add(c) {
    setAddingId(c.placeId);
    setMsg('');
    try {
      const spot = await api.addShop(c.placeId, center);
      onAdded(spot);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setAddingId('');
    }
  }

  return (
    <div className="fixed inset-0 z-40 animate-fade bg-kicap/55 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Add a missing shop"
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[90%] max-w-lg animate-rise overflow-y-auto rounded-t-[2rem] bg-santan p-5 pb-8 sm:inset-y-auto sm:top-[10%] sm:rounded-[2rem]">
        <button aria-label="Close" onClick={onClose}
          className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white text-kicap shadow-md transition hover:scale-105">
          <Icon name="x" className="size-5" />
        </button>
        <h2 className="pr-12 font-display text-2xl font-bold">Add a missing shop</h2>
        <p className="mt-1 text-sm text-kopi">Know a zap fan spot we don't show? Find it on Google Maps by name and add it for everyone.</p>

        <form onSubmit={search} className="mt-4 flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Shop name</span>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-kopi-light" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} placeholder="Shop name, e.g. Restoran Ah Kow"
              className="h-12 w-full rounded-2xl border border-kicap/10 bg-white pl-11 pr-3 outline-none transition placeholder:text-kopi-light focus:border-sambal/50 focus:ring-4 focus:ring-sambal/10" />
          </label>
          <button disabled={busy || q.trim().length < 2}
            className="h-12 shrink-0 rounded-2xl bg-sambal px-5 font-semibold text-white shadow-md shadow-sambal/25 transition hover:bg-sambal-deep disabled:opacity-45 disabled:shadow-none">
            {busy ? 'Finding…' : 'Find'}
          </button>
        </form>

        {msg && <p className="mt-3 text-sm text-sambal-deep">{msg}</p>}

        {list && list.length === 0 && (
          <p className="mt-4 rounded-2xl bg-white p-4 text-sm text-kopi ring-1 ring-kicap/5">
            No eateries on Google Maps match “{q}”. Check the spelling, or try the name on its signboard.
          </p>
        )}
        {list && list.length > 0 && (
          <ul className="mt-4 space-y-2" data-testid="candidates">
            {list.map((c) => (
              <li key={c.placeId} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-kicap/5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="truncate text-sm text-kopi">{c.address}</p>
                  {c.distanceKm != null && <p className="font-mono text-xs text-kopi-light">{km(c.distanceKm)} away</p>}
                </div>
                {c.added ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-pandan"><Icon name="check" className="size-4" />Already in ZapFan</span>
                ) : (
                  <button onClick={() => add(c)} disabled={!!addingId}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-kicap px-4 text-sm font-semibold text-santan transition hover:bg-kicap/85 disabled:opacity-45">
                    <Icon name="plus" className="size-4" />{addingId === c.placeId ? 'Adding…' : 'Add'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-kopi-light">Only add shops that sell zap fan (economy rice). Shop info comes from Google Maps.</p>
      </div>
    </div>
  );
}

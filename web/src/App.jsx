import { useEffect, useMemo, useState } from 'react';
import { api, km, artSeed } from './api.js';
import { plateArt } from './plate.js';
import { useLiveLocation, useSaved } from './useLocation.js';
import Icon from './Icon.jsx';
import SpotSheet from './SpotSheet.jsx';
import SpinWheel from './SpinWheel.jsx';

const KL = { lat: 3.139, lng: 101.687 };
const QUICK_RADII = [2, 5, 10];
const MAX_RADIUS = 10;
const PAGE_SIZE = 6;

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const chip = (on) =>
  `shrink-0 h-9 px-3.5 rounded-full text-sm font-medium border transition-colors ${
    on ? 'bg-kicap text-santan border-kicap' : 'bg-white text-kopi border-kicap/10 hover:border-kicap/25 hover:text-kicap'
  }`;

export default function App() {
  const geo = useLiveLocation();
  const { saved, toggle } = useSaved();
  const [tab, setTab] = useState('search');
  const [q, setQ] = useState('');
  const [radius, setRadius] = useState(5);
  const [area, setArea] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [areas, setAreas] = useState([]);
  const [data, setData] = useState({ spots: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [spinOpen, setSpinOpen] = useState(false);
  const dq = useDebounced(q, 250);

  const center = geo.pos ? { lat: geo.pos.lat, lng: geo.pos.lng } : KL;
  // Saved spots can be anywhere (Google places too), so the My spots tab asks for them by id.
  const savedIds = tab === 'saved' ? saved.join(',') : '';

  useEffect(() => { api.areas().then(setAreas).catch(() => {}); }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .spots(tab === 'saved'
        ? { lat: center.lat, lng: center.lng, ids: savedIds || undefined }
        : { lat: center.lat, lng: center.lng, radius, q: dq, area, open: openOnly ? 1 : undefined })
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [center.lat, center.lng, radius, dq, area, openOnly, tab, savedIds]);

  const list = useMemo(
    () => (tab === 'saved' ? data.spots.filter((s) => saved.includes(s.id)) : data.spots),
    [tab, data.spots, saved]
  );
  const openCount = list.filter((s) => s.status.open).length;

  // Six cards per page; go back to page 1 whenever the results change.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [list]);
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const shown = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const goTo = (p) => {
    setPage(p);
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const whereLabel = area || (geo.pos ? 'you' : 'KL city centre');

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="relative overflow-hidden bg-sambal text-santan">
        <div className="absolute inset-0 bg-dots" aria-hidden="true" />
        <img
          src={plateArt(7)} alt="" aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-16 w-56 rotate-12 rounded-full opacity-35 shadow-2xl shadow-sambal-deep/60 sm:-right-6 sm:-top-10 sm:w-96 sm:opacity-95 [clip-path:circle(45%)]"
        />
        <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-8 sm:pb-24 sm:pt-12">
          <h1 className="flex max-w-md items-center gap-3 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            <img src="/favicon.svg" alt="" className="size-10 shrink-0 rounded-full ring-2 ring-santan/80 sm:size-12" />
            ZapFan in your Area
          </h1>
        </div>
      </header>

      <main className="relative mx-auto -mt-12 max-w-5xl px-4">
        {/* Search + filters card */}
        {tab === 'search' && (
          <section className="rounded-3xl bg-white p-4 shadow-xl shadow-kicap/10 ring-1 ring-kicap/5 sm:p-5">
            <label className="relative block">
              <span className="sr-only">Search an area or shop</span>
              <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-kopi-light" />
              <input
                type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search an area or shop"
                className="h-14 w-full rounded-2xl border border-kicap/10 bg-santan pl-12 pr-4 text-base outline-none transition placeholder:text-kopi-light focus:border-sambal/50 focus:bg-white focus:ring-4 focus:ring-sambal/10"
              />
            </label>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-kopi">
                Within <b className="font-mono font-medium text-kicap">{radius} km</b>
                {(dq || area) && <span className="ml-2 text-xs text-kopi-light">(paused while searching)</span>}
              </p>
              <div className="flex gap-1">
                {QUICK_RADII.map((r) => (
                  <button key={r} onClick={() => setRadius(r)}
                    className={`h-7 rounded-full px-2.5 font-mono text-xs transition-colors ${radius === r ? 'bg-sambal text-white' : 'text-kopi hover:bg-santan-deep'}`}>
                    {r} km
                  </button>
                ))}
              </div>
            </div>
            <input type="range" min="1" max={MAX_RADIUS} value={radius} onChange={(e) => setRadius(Number(e.target.value))}
              aria-label="Search radius in km" disabled={!!(dq || area)} className="mt-2 w-full disabled:opacity-40" />

            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
              <button className={`${chip(openOnly)} inline-flex items-center gap-1.5`} onClick={() => setOpenOnly((v) => !v)}>
                <span className={`size-2 rounded-full ${openOnly ? 'bg-pandan-soft' : 'bg-pandan'}`} />Open now
              </button>
              <button className={chip(!area)} onClick={() => setArea('')}>Near {geo.pos ? 'me' : 'KL'}</button>
              {areas.map((a) => (
                <button key={a.name} className={chip(area === a.name)} onClick={() => setArea(area === a.name ? '' : a.name)}>{a.name}</button>
              ))}
            </div>
          </section>
        )}

        {tab === 'saved' && (
          <section className="rounded-3xl bg-white p-5 shadow-xl shadow-kicap/10 ring-1 ring-kicap/5">
            <h2 className="font-display text-2xl font-bold">My spots</h2>
            <p className="mt-1 text-sm text-kopi">The places you've hearted, nearest first. Saved on this device.</p>
          </section>
        )}

        <LocationBar geo={geo} />

        {/* Result summary */}
        <div id="results" className="mb-4 mt-8 flex scroll-mt-4 items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-bold leading-tight">
            {error ? 'Hmm, no connection' : tab === 'saved'
              ? `${list.length} saved ${list.length === 1 ? 'spot' : 'spots'}`
              : dq ? <>Results for “{dq}”</> : area ? <>Spots in {area}</> : <>Near {whereLabel}</>}
          </h2>
          {!error && list.length > 0 && (
            <p className="shrink-0 text-sm text-kopi">
              <b className="font-semibold text-pandan">{openCount} open</b> of {list.length}
            </p>
          )}
        </div>
        {!error && (data.source || shown.length > 0) && (
          <div className="-mt-2 mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-kopi-light" data-testid="source">
              {data.source === 'google'
                ? 'Live from Google Maps.'
                : data.fallback
                  ? "Google Maps isn't responding, so this is the ZapFan saved list."
                  : data.source ? 'From the ZapFan saved list.' : ''}
            </p>
            <button onClick={() => setSpinOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-kunyit px-4 text-sm font-semibold text-kicap shadow-sm transition hover:brightness-105 active:scale-95">
              <Icon name="wheel" />Can't decide? Spin
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-sambal-soft p-4 text-sm text-sambal-deep">
            Can't reach the ZapFan API. Is the server running? ({error})
          </div>
        )}

        {/* Cards */}
        <div className={`grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
          {shown.map((s) => (
            <SpotCard key={s.id} s={s} saved={saved.includes(s.id)} onSave={() => toggle(s.id)} onOpen={() => setOpenId(s.id)} />
          ))}
        </div>

        {pageCount > 1 && (
          <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3">
            <button onClick={() => goTo(page - 1)} disabled={page === 0}
              className="h-10 rounded-full border border-kicap/15 bg-white px-4 text-sm font-medium text-kopi transition hover:bg-santan-deep disabled:opacity-40 disabled:hover:bg-white">
              Previous
            </button>
            <span className="font-mono text-sm text-kopi">{page + 1} / {pageCount}</span>
            <button onClick={() => goTo(page + 1)} disabled={page >= pageCount - 1}
              className="h-10 rounded-full bg-sambal px-4 text-sm font-semibold text-white shadow-md shadow-sambal/30 transition hover:bg-sambal-deep disabled:opacity-40 disabled:shadow-none disabled:hover:bg-sambal">
              Next
            </button>
          </nav>
        )}

        {!loading && !error && list.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-kicap/10 bg-white/60 px-6 py-12 text-center">
            <img src={plateArt(3)} alt="" className="mx-auto size-24 rounded-full opacity-70 grayscale-[.4]" />
            <p className="mt-4 font-display text-xl font-bold">
              {tab === 'saved' ? 'No saved spots yet' : 'No Chinese mixed rice found'}
            </p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-kopi">
              {tab === 'saved'
                ? 'Tap the heart on any spot to keep it here.'
                : `No spots ${dq ? `for “${dq}”` : `within ${radius} km`}${openOnly ? ' open right now' : ''}. Try a wider radius or another area.`}
            </p>
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="flex gap-1 rounded-full bg-kicap p-1.5 shadow-2xl shadow-kicap/30">
          {[['search', 'search', 'Discover'], ['saved', 'heart', 'My spots']].map(([key, icon, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors ${tab === key ? 'bg-santan text-kicap' : 'text-santan/75 hover:text-santan'}`}>
              <Icon name={icon} className={`size-4 ${tab === key ? 'text-sambal' : ''}`} />
              {label}
              {key === 'saved' && saved.length > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sambal px-1.5 font-mono text-[11px] text-white">{saved.length}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {spinOpen && (
        <SpinWheel
          spots={shown.map((s) => ({ id: s.id, name: s.name }))}
          onOpenSpot={(id) => { setSpinOpen(false); setOpenId(id); }}
          onClose={() => setSpinOpen(false)}
        />
      )}

      {openId !== null && (
        <SpotSheet id={openId} center={center} live={!!geo.pos} saved={saved.includes(openId)} onToggleSave={() => toggle(openId)} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function SpotCard({ s, saved, onSave, onOpen }) {
  const open = s.status.open;
  return (
    <article
      onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group cursor-pointer overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-kicap/5 transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-kicap/10"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-santan-deep">
        <img src={s.photo || plateArt(artSeed(s.id))} alt={s.photo ? `Photo of ${s.name}` : ''} loading="lazy"
          onError={(e) => { const art = plateArt(artSeed(s.id)); if (e.currentTarget.src !== art) e.currentTarget.src = art; }}
          className={`size-full object-cover transition duration-500 group-hover:scale-105 ${open ? '' : 'saturate-[.35] opacity-80'}`} />
        <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${open ? 'bg-pandan text-white' : 'bg-white/90 text-kopi'}`}>
          <span className={`size-1.5 rounded-full ${open ? 'bg-white' : 'bg-kopi-light'}`} />
          {open ? 'Open now' : 'Closed'}
        </span>
        <button
          aria-label={saved ? 'Remove from my spots' : 'Save spot'}
          onClick={(e) => { e.stopPropagation(); onSave(); }}
          className={`absolute right-3 top-3 grid size-9 place-items-center rounded-full shadow-sm backdrop-blur transition active:scale-90 ${saved ? 'bg-sambal text-white' : 'bg-white/90 text-kopi hover:text-sambal'}`}
        >
          <Icon name="heart" className={`size-[18px] ${saved ? 'fill-current' : ''}`} />
        </button>
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-kunyit px-2.5 py-1 text-xs font-bold text-kicap shadow-sm">
          <Icon name="star" className="size-3.5 fill-current stroke-none" />{s.reviewCount ? s.rating.toFixed(1) : 'New'}
        </span>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-1 text-lg font-semibold leading-snug">{s.name}</h3>
        <p className="mt-0.5 line-clamp-1 text-sm text-kopi">{s.address}, {s.area}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-kopi">
          <span className="inline-flex items-center gap-1 font-mono"><Icon name="pin" className="size-3.5 text-sambal" />{km(s.distanceKm)}</span>
          <span className="inline-flex items-center gap-1"><Icon name="clock" className="size-3.5" />{s.status.text}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {s.types.map((t) => (
            <span key={t} className="rounded-full bg-santan-deep px-2 py-0.5 text-[11px] font-medium text-kopi">{t}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

function LocationBar({ geo }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15000); return () => clearInterval(t); }, []);
  const ago = geo.pos ? Math.round((Date.now() - geo.pos.at) / 1000) : 0;
  const agoText = ago < 20 ? 'just now' : ago < 90 ? `${ago}s ago` : `${Math.round(ago / 60)} min ago`;

  const primary = 'inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-sambal px-4 text-sm font-semibold text-white shadow-md shadow-sambal/30 transition hover:bg-sambal-deep active:scale-95';
  const ghost = 'inline-flex h-10 shrink-0 items-center rounded-full border border-kicap/15 px-4 text-sm font-medium text-kopi transition hover:bg-santan-deep';

  let text, btn;
  if (geo.state === 'live') {
    text = <><b className="font-semibold text-kicap">Live location on.</b> Sorted by distance from you. <span className="font-mono text-xs text-kopi-light">±{Math.round(geo.pos?.accuracy || 0)} m, {agoText}</span></>;
    btn = <button className={ghost} onClick={() => geo.stop()}>Stop</button>;
  } else if (geo.state === 'asking') {
    text = <>Finding you. If your browser asks, tap <b className="font-semibold text-kicap">Allow</b>.</>;
    btn = <button className={ghost} onClick={() => geo.stop()}>Cancel</button>;
  } else if (geo.state === 'denied') {
    text = <>Location is off for this page, so we're using <b className="font-semibold text-kicap">KL city centre</b>. Allow it in your browser's site settings, or pick an area.</>;
    btn = <button className={primary} onClick={geo.start}>Try again</button>;
  } else if (geo.state === 'error') {
    text = <>No fix on you yet, so we're using <b className="font-semibold text-kicap">KL city centre</b> for now. Still trying.</>;
    btn = <button className={ghost} onClick={() => geo.stop()}>Stop</button>;
  } else if (geo.state === 'unsupported') {
    text = <>This browser can't share your location, so we're using <b className="font-semibold text-kicap">KL city centre</b>.</>;
  } else {
    text = <>Showing spots around <b className="font-semibold text-kicap">KL city centre</b>. Share your location to see what's near you.</>;
    btn = <button className={primary} onClick={geo.start}><Icon name="locate" />Use my location</button>;
  }
  const on = geo.state === 'live' || geo.state === 'asking';
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-kunyit-soft px-4 py-3 text-sm text-kopi ring-1 ring-kunyit/30 sm:flex-row sm:items-center">
      <p className="flex flex-1 items-start gap-3 sm:items-center">
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full sm:mt-0 ${on ? 'live-dot bg-pandan' : 'bg-kopi-light'}`} />
        <span>{text}</span>
      </p>
      {btn && <div className="pl-5.5 sm:pl-0">{btn}</div>}
    </div>
  );
}

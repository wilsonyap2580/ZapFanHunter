import { useEffect, useMemo, useState } from 'react';
import { api, km } from './api.js';
import { plateArt } from './plate.js';
import { useLiveLocation, useSaved } from './useLocation.js';
import Icon from './Icon.jsx';
import SpotSheet from './SpotSheet.jsx';

const KL = { lat: 3.139, lng: 101.687 };
const QUICK_RADII = [2, 5, 10, 20];

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

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
  const dq = useDebounced(q, 250);

  const center = geo.pos ? { lat: geo.pos.lat, lng: geo.pos.lng } : KL;

  useEffect(() => { api.areas().then(setAreas).catch(() => {}); }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .spots(tab === 'saved'
        ? { lat: center.lat, lng: center.lng }
        : { lat: center.lat, lng: center.lng, radius, q: dq, area, open: openOnly ? 1 : undefined })
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [center.lat, center.lng, radius, dq, area, openOnly, tab]);

  const list = useMemo(
    () => (tab === 'saved' ? data.spots.filter((s) => saved.includes(s.id)) : data.spots),
    [tab, data.spots, saved]
  );

  const whereLabel = area || (geo.pos ? 'you' : 'KL city centre');

  return (
    <>
      <div className="wrap">
        <header>
          <div className="brand">
            <img src="/favicon.svg" alt="" width="24" height="24" />
            <h1>ZapFan</h1>
          </div>
          <p className="tag">Zap fan, chap fan and nasi campur spots near you, across Klang Valley and Seremban</p>
        </header>

        {tab === 'search' && (
          <div className="filters">
            <div className="srch">
              <Icon name="search" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an area or shop" aria-label="Search an area or shop" />
            </div>
            <div className="rng">
              <div className="rng-top">
                <span>Within <b>{radius} km</b></span>
                <div className="chips">
                  {QUICK_RADII.map((r) => (
                    <button key={r} className={`chip sm ${radius === r ? 'on' : ''}`} onClick={() => setRadius(r)}>{r} km</button>
                  ))}
                </div>
              </div>
              <input type="range" min="1" max="30" value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Search radius in km" disabled={!!(dq || area)} />
              {(dq || area) && <small className="hint">Searching by name or area looks everywhere, so the distance limit is paused.</small>}
            </div>
            <div className="areas">
              <span className="lbl">Area</span>
              <div className="chips">
                <button className={`chip ${openOnly ? 'on' : ''}`} onClick={() => setOpenOnly((v) => !v)}>Open now</button>
                <button className={`chip ${!area ? 'on' : ''}`} onClick={() => setArea('')}>Near {geo.pos ? 'me' : 'KL'}</button>
                {areas.map((a) => (
                  <button key={a.name} className={`chip ${area === a.name ? 'on' : ''}`} onClick={() => setArea(area === a.name ? '' : a.name)}>{a.name}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        <LocationBar geo={geo} />

        <div className="info">
          {error ? (
            <span className="err">Can't reach the ZapFan API. Is the server running? ({error})</span>
          ) : tab === 'saved' ? (
            <><b>{list.length}</b> saved {list.length === 1 ? 'spot' : 'spots'}</>
          ) : (
            <><b>{list.length}</b> {list.length === 1 ? 'spot' : 'spots'} {dq ? <>matching "{dq}"</> : area ? <>in {area}</> : <>within {radius} km of {whereLabel}</>}{openOnly && ', open now'}</>
          )}
        </div>

        <div className={`list ${loading ? 'busy' : ''}`}>
          {list.map((s) => (
            <article key={s.id} className={`card ${s.status.open ? '' : 'cl'}`} onClick={() => setOpenId(s.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(s.id)}>
              <div className="pic"><img src={plateArt(s.id)} alt="" loading="lazy" /></div>
              <div className="cb">
                <div className="ttl">
                  <h3>{s.name}</h3>
                  <button className={`heart ${saved.includes(s.id) ? 'on' : ''}`} aria-label={saved.includes(s.id) ? 'Remove from my spots' : 'Save spot'} onClick={(e) => { e.stopPropagation(); toggle(s.id); }}>
                    <Icon name="heart" />
                  </button>
                </div>
                <p className="addr">{s.address}, {s.area}</p>
                <p className="meta">
                  <span className="n"><Icon name="star" />{s.rating.toFixed(1)}</span>
                  <span className="n">{km(s.distanceKm)}</span>
                  <span>{s.types[0]}</span>
                </p>
                <p className={`st ${s.status.open ? 'open' : ''}`}><i />{s.status.text}</p>
              </div>
            </article>
          ))}
          {!loading && !error && list.length === 0 && (
            <div className="empty">
              {tab === 'saved'
                ? 'Nothing saved yet. Tap the heart on a spot to keep it here.'
                : `No spots found ${dq ? `for "${dq}"` : `within ${radius} km`}${openOnly ? ' that are open right now' : ''}. Try a wider radius or another area.`}
            </div>
          )}
        </div>
      </div>

      <nav>
        <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}><Icon name="search" />Search</button>
        <button className={tab === 'saved' ? 'on' : ''} onClick={() => setTab('saved')}><Icon name="heart" />My spots {saved.length > 0 && <span className="fc">{saved.length}</span>}</button>
      </nav>

      {openId !== null && (
        <SpotSheet id={openId} center={center} live={!!geo.pos} saved={saved.includes(openId)} onToggleSave={() => toggle(openId)} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

function LocationBar({ geo }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15000); return () => clearInterval(t); }, []);
  const ago = geo.pos ? Math.round((Date.now() - geo.pos.at) / 1000) : 0;
  const agoText = ago < 20 ? 'just now' : ago < 90 ? `${ago}s ago` : `${Math.round(ago / 60)} min ago`;

  let text, btn;
  if (geo.state === 'live') {
    text = <><b>Live location on.</b> Sorted by distance from you. <small>±{Math.round(geo.pos?.accuracy || 0)} m, {agoText}</small></>;
    btn = <button className="ghost" onClick={() => geo.stop()}>Stop</button>;
  } else if (geo.state === 'asking') {
    text = <>Finding you. If your browser asks, tap <b>Allow</b>.</>;
    btn = <button className="ghost" onClick={() => geo.stop()}>Cancel</button>;
  } else if (geo.state === 'denied') {
    text = <>Location is off for this page, so we're using <b>KL city centre</b>. Allow it in your browser's site settings, or pick an area above.</>;
    btn = <button onClick={geo.start}>Try again</button>;
  } else if (geo.state === 'error') {
    text = <>No fix on you yet, so we're using <b>KL city centre</b> for now. Still trying.</>;
    btn = <button className="ghost" onClick={() => geo.stop()}>Stop</button>;
  } else if (geo.state === 'unsupported') {
    text = <>This browser can't share your location, so we're using <b>KL city centre</b>.</>;
  } else {
    text = <>Showing spots around <b>KL city centre</b>. Turn on your location to see what's near you.</>;
    btn = <button onClick={geo.start}><Icon name="locate" />Use my location</button>;
  }
  const on = geo.state === 'live' || geo.state === 'asking';
  return (
    <div className="locbar">
      <i className={`dot ${on ? '' : 'off'}`} />
      <span>{text}</span>
      {btn}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, km, mapsUrl, wazeUrl, directionsUrl } from './api.js';
import { plateArt } from './plate.js';
import Icon from './Icon.jsx';

const KL_DAY = () => new Date(Date.now() + 8 * 3600 * 1000).getUTCDay();

export default function SpotSheet({ id, center, live, saved, onToggleSave, onClose }) {
  const [spot, setSpot] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let on = true;
    api.spot(id, center).then((s) => on && setSpot(s)).catch((e) => on && setError(e.message));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const today = KL_DAY();

  return (
    <div className="sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={spot?.name || 'Spot details'}>
        <button className="x" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        <figure className="hero">
          <img src={plateArt(id)} alt="" />
          <figcaption>Illustration of a typical plate</figcaption>
        </figure>

        {error && <div className="det"><p className="err">{error}</p></div>}
        {!spot && !error && <div className="det"><p className="muted">Loading…</p></div>}

        {spot && (
          <div className="det">
            <h2>{spot.name}</h2>
            <p className="addr">{spot.address}, {spot.area}</p>
            <p className="types">{spot.types.join(' · ')}</p>

            <div className="stats">
              <div><b>{spot.rating.toFixed(1)}</b><small>Rating</small></div>
              <div><b>{km(spot.distanceKm)}</b><small>{live ? 'From you' : 'From KL centre'}</small></div>
              <div><b>{spot.reviewCount.toLocaleString('en-MY')}</b><small>Google reviews</small></div>
            </div>

            <div className="acts">
              <a className="btn p" target="_blank" rel="noopener noreferrer" href={mapsUrl(spot)}><Icon name="map" />Google Maps</a>
              <a className="btn" target="_blank" rel="noopener noreferrer" href={wazeUrl(spot)}><Icon name="nav" />Waze</a>
            </div>
            {live && (
              <a className="btn mb" target="_blank" rel="noopener noreferrer" href={directionsUrl(spot, center)}>
                <Icon name="route" />Directions from where I am <span className="km">{km(spot.distanceKm)}</span>
              </a>
            )}
            <button className={`btn s ${saved ? 'on' : ''}`} onClick={onToggleSave}>
              <Icon name="heart" />{saved ? 'Saved to my spots' : 'Save this spot'}
            </button>

            <h4>Opening hours</h4>
            <div className="rv">
              <div className={`hrs-now ${spot.status.open ? 'open' : ''}`}><i />{spot.status.text}</div>
              {spot.hours.map((h) => (
                <div key={h.day} className={`hr ${h.dayIndex === today ? 'today' : ''}`}><span>{h.day}</span><span>{h.hours}</span></div>
              ))}
            </div>

            <h4>What people say here</h4>
            <ReviewForm spotId={spot.id} onAdded={(r) => setSpot((s) => ({ ...s, reviews: [r, ...s.reviews] }))} />
            {spot.reviews.map((r) => (
              <div key={r.id} className="rv">
                <b>{r.author} <span className="stars" aria-label={`${r.stars} out of 5`}>{'★'.repeat(r.stars)}<span className="dim">{'★'.repeat(5 - r.stars)}</span></span></b>
                {r.body}
                <small className="when">{new Date(r.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</small>
              </div>
            ))}

            <p className="foot">Shop info from Google Maps, saved 30 Oct 2026. Hours do change, so a quick check before you head out never hurts. Diner notes on this page are stored in your local ZapFan database.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewForm({ spotId, onAdded }) {
  const [author, setAuthor] = useState(() => { try { return localStorage.getItem('zf.name') || ''; } catch { return ''; } });
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await api.addReview(spotId, { author, stars, body });
      try { localStorage.setItem('zf.name', author); } catch {}
      onAdded(r);
      setBody('');
      setStars(0);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="rv form" onSubmit={submit}>
      <b>Been here? Leave a note for other diners</b>
      <div className="starpick" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={stars === n} className={n <= stars ? 'on' : ''} onClick={() => setStars(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>★</button>
        ))}
      </div>
      <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" maxLength={40} aria-label="Your name" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What was good? Which dishes should people get?" maxLength={600} rows={3} aria-label="Your note" />
      {msg && <small className="err">{msg}</small>}
      <button className="btn p" disabled={busy || !author.trim() || !body.trim() || !stars}>{busy ? 'Posting…' : 'Post note'}</button>
    </form>
  );
}

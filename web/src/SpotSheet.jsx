import { useEffect, useState } from 'react';
import { api, km, mapsUrl, wazeUrl, directionsUrl, artSeed } from './api.js';
import { plateArt } from './plate.js';
import Icon from './Icon.jsx';

const KL_DAY = () => new Date(Date.now() + 8 * 3600 * 1000).getUTCDay();

const btn = 'flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-semibold transition active:scale-[.98]';
const btnPrimary = `${btn} bg-sambal text-white shadow-lg shadow-sambal/25 hover:bg-sambal-deep`;
const btnSoft = `${btn} bg-white text-kicap ring-1 ring-kicap/10 hover:bg-santan-deep`;

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
    <div className="fixed inset-0 z-40 animate-fade bg-kicap/55 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={spot?.name || 'Spot details'}
        className="absolute inset-x-0 bottom-0 top-[5%] mx-auto max-w-2xl animate-rise overflow-y-auto rounded-t-[2rem] bg-santan pb-10 sm:inset-y-6 sm:rounded-[2rem]">
        <button aria-label="Close" onClick={onClose}
          className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-white/95 text-kicap shadow-md transition hover:scale-105">
          <Icon name="x" className="size-5" />
        </button>

        {spot?.photos?.length ? (
          <PhotoStrip photos={spot.photos} name={spot.name} />
        ) : (
          <figure className="relative">
            <img src={plateArt(artSeed(id))} alt="" className="aspect-[16/10] w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-santan to-transparent" />
            <figcaption className="absolute left-4 top-4 rounded-full bg-kicap/70 px-3 py-1 text-xs text-white backdrop-blur">
              Illustration of a typical plate
            </figcaption>
          </figure>
        )}

        {error && <p className="px-5 text-sambal-deep">{error}</p>}
        {!spot && !error && <p className="px-5 text-kopi">Loading…</p>}

        {spot && (
          <div className="-mt-8 px-5">
            <div className="relative flex flex-wrap gap-1.5">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${spot.status.open ? 'bg-pandan text-white' : 'bg-white text-kopi ring-1 ring-kicap/10'}`}>
                <span className={`size-1.5 rounded-full ${spot.status.open ? 'bg-white' : 'bg-kopi-light'}`} />{spot.status.text}
              </span>
              {spot.types.map((t) => (
                <span key={t} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-kopi ring-1 ring-kicap/10">{t}</span>
              ))}
            </div>

            <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight">{spot.name}</h2>
            <p className="mt-1 flex items-start gap-1.5 text-kopi"><Icon name="pin" className="mt-0.5 size-4 text-sambal" />{spot.address}, {spot.area}</p>
            {spot.limited && (
              <p className="mt-3 rounded-2xl bg-kunyit-soft px-4 py-3 text-sm text-kopi ring-1 ring-kunyit/30">
                {spot.limited === 'daily-limit'
                  ? "Today's Google lookups are used up, so this shows the saved info from the list."
                  : "Google Maps can't be reached right now, so this shows the saved info from the list."}
                {' '}Google reviews and more photos will be back {spot.limited === 'daily-limit' ? 'tomorrow' : 'soon'}.
              </p>
            )}

            <div className="mt-5 grid grid-cols-3 divide-x divide-kicap/10 rounded-2xl bg-white ring-1 ring-kicap/5">
              <Stat value={<span className="inline-flex items-center gap-1"><Icon name="star" className="size-4 fill-kunyit stroke-none" />{spot.reviewCount ? spot.rating.toFixed(1) : 'New'}</span>} label="Rating" />
              <Stat value={km(spot.distanceKm)} label={live ? 'From you' : 'From KL centre'} />
              <Stat value={spot.reviewCount.toLocaleString('en-MY')} label="Google reviews" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <a className={btnPrimary} target="_blank" rel="noopener noreferrer" href={mapsUrl(spot)}><Icon name="map" className="size-5" />Google Maps</a>
              <a className={btnSoft} target="_blank" rel="noopener noreferrer" href={wazeUrl(spot)}><Icon name="nav" className="size-5" />Waze</a>
            </div>
            {live && (
              <a className={`${btnSoft} mt-2`} target="_blank" rel="noopener noreferrer" href={directionsUrl(spot, center)}>
                <Icon name="route" className="size-5" />Directions from where I am <span className="font-mono text-sm font-normal text-kopi">{km(spot.distanceKm)}</span>
              </a>
            )}
            <button onClick={onToggleSave}
              className={`${btn} mt-2 ${saved ? 'bg-sambal-soft text-sambal-deep' : 'bg-white text-kicap ring-1 ring-kicap/10 hover:bg-santan-deep'}`}>
              <Icon name="heart" className={`size-5 ${saved ? 'fill-current' : ''}`} />{saved ? 'Saved to my spots' : 'Save this spot'}
            </button>

            <SectionTitle icon="clock">Opening hours</SectionTitle>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-kicap/5">
              {spot.hours.length === 0 && <p className="px-2 py-1.5 text-sm text-kopi">Hours not listed. Check Google Maps before you go.</p>}
              {spot.hours.map((h) => {
                const isToday = h.dayIndex === today;
                return (
                  <div key={h.day} className={`flex justify-between rounded-lg px-2 py-1.5 text-sm ${isToday ? 'bg-kunyit-soft font-semibold text-kicap' : 'text-kopi'}`}>
                    <span>{h.day}{isToday && <span className="ml-2 text-xs font-medium text-kunyit">today</span>}</span>
                    <span className={`font-mono ${h.hours === 'Closed' ? 'text-kopi-light' : ''}`}>{h.hours}</span>
                  </div>
                );
              })}
            </div>

            {spot.googleReviews?.length > 0 && (
              <>
                <SectionTitle icon="star">Google reviews</SectionTitle>
                <div className="space-y-2" data-testid="google-reviews">
                  {spot.googleReviews.map((r) => (
                    <div key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-kicap/5">
                      <div className="flex items-center gap-3">
                        {r.author?.photo
                          ? <img src={r.author.photo} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full bg-santan-deep object-cover" />
                          : <Avatar name={r.author?.name} />}
                        <div className="min-w-0 flex-1">
                          {r.author?.uri
                            ? <a href={r.author.uri} target="_blank" rel="noopener noreferrer" className="block truncate font-semibold hover:underline">{r.author.name}</a>
                            : <p className="truncate font-semibold">{r.author?.name || 'Google user'}</p>}
                          <p className="font-mono text-xs text-kopi-light">{r.when}</p>
                        </div>
                        <Stars n={r.stars} />
                      </div>
                      {r.text && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-kopi">{r.text}</p>}
                    </div>
                  ))}
                </div>
                <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-kopi-light">
                  <span>Reviews from Google Maps</span>
                  {spot.googleMapsUri && (
                    <a href={spot.googleMapsUri} target="_blank" rel="noopener noreferrer" className="font-semibold text-sambal hover:underline">See all on Google Maps</a>
                  )}
                </p>
              </>
            )}

            <SectionTitle icon="flame">ZapFan diner notes</SectionTitle>
            <ReviewForm spotId={spot.id} onAdded={(r) => setSpot((s) => ({ ...s, reviews: [r, ...s.reviews] }))} />
            <div className="mt-3 space-y-2">
              {spot.reviews.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-kicap/5">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.author} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold">
                        <span className="truncate">{r.author}</span>
                        {r.sample && (
                          <span title="Made-up example note for development, not a real review"
                            className="shrink-0 rounded-full bg-santan-deep px-2 py-0.5 text-[11px] font-medium text-kopi">Sample note</span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-kopi-light">
                        {new Date(r.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <Stars n={r.stars} />
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-kopi">{r.body}</p>
                  {r.photo && (
                    <a href={r.photo} target="_blank" rel="noopener noreferrer" className="mt-3 block overflow-hidden rounded-xl">
                      <img src={r.photo} alt={`Photo from ${r.author}`} loading="lazy" className="max-h-72 w-full object-cover" />
                    </a>
                  )}
                </div>
              ))}
            </div>

            <p className="mt-6 text-xs leading-relaxed text-kopi-light">
              {spot.source === 'google' || spot.photos?.length
                ? 'Place info, photos and reviews from Google Maps, fetched live. '
                : 'Shop info from Google Maps, saved 30 Oct 2026. '}
              Hours do change, so a quick check before you head out never hurts.
              Diner notes and their photos are stored in your local ZapFan database.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoStrip({ photos, name }) {
  return (
    <div className="relative">
      <div className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto" data-testid="photo-strip" aria-label={`Photos of ${name}`}>
        {photos.map((p, i) => (
          <figure key={p.url} className="relative w-full shrink-0 snap-center">
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              <img src={p.thumb} srcSet={`${p.thumb} 480w, ${p.url} 1200w`} sizes="(min-width: 672px) 672px, 100vw"
                alt={`Photo ${i + 1} of ${photos.length} of ${name}`} loading={i === 0 ? 'eager' : 'lazy'}
                className="aspect-[16/10] w-full bg-santan-deep object-cover" />
            </a>
            <figcaption className="absolute bottom-10 left-4 max-w-[70%] truncate rounded-full bg-kicap/70 px-3 py-1 text-xs text-white backdrop-blur">
              {p.author?.name
                ? <>Photo: {p.author.uri ? <a href={p.author.uri} target="_blank" rel="noopener noreferrer" className="underline">{p.author.name}</a> : p.author.name}</>
                : 'Photo from Google Maps'}
            </figcaption>
          </figure>
        ))}
      </div>
      <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-kicap/70 px-3 py-1 font-mono text-xs text-white backdrop-blur">
        {photos.length} {photos.length === 1 ? 'photo' : 'photos'}{photos.length > 1 ? ', swipe for more' : ''}
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-santan to-transparent" />
    </div>
  );
}

function Avatar({ name }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-kunyit-soft font-display font-bold text-kicap">
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

function Stars({ n }) {
  const s = Math.max(0, Math.min(5, Math.round(n || 0)));
  return (
    <span className="shrink-0 text-sm tracking-wider text-kunyit" aria-label={`${s} out of 5`}>
      {'★'.repeat(s)}<span className="text-kicap/15">{'★'.repeat(5 - s)}</span>
    </span>
  );
}

function Stat({ value, label }) {
  return (
    <div className="px-3 py-3 text-center">
      <b className="block font-mono text-lg font-medium">{value}</b>
      <small className="text-xs text-kopi">{label}</small>
    </div>
  );
}

function SectionTitle({ icon, children }) {
  return (
    <h4 className="mb-3 mt-8 flex items-center gap-2 font-display text-xl font-bold">
      <span className="grid size-8 place-items-center rounded-full bg-sambal-soft text-sambal"><Icon name={icon} className="size-4" /></span>
      {children}
    </h4>
  );
}

function ReviewForm({ spotId, onAdded }) {
  const [author, setAuthor] = useState(() => { try { return localStorage.getItem('zf.name') || ''; } catch { return ''; } });
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [fileKey, setFileKey] = useState(0); // remounts the file input to clear it
  // Photo uploads are off where the server can't keep files (e.g. on Vercel).
  const [uploads, setUploads] = useState(false);
  useEffect(() => { api.health().then((h) => setUploads(!!h.uploads)).catch(() => {}); }, []);

  useEffect(() => {
    if (!photo) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function pickPhoto(e) {
    const f = e.target.files?.[0] || null;
    setMsg('');
    if (f && !['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setMsg('Photo must be a JPEG, PNG or WebP image.');
      return clearPhoto();
    }
    if (f && f.size > 5 * 1024 * 1024) {
      setMsg('Photo must be 5 MB or smaller.');
      return clearPhoto();
    }
    setPhoto(f);
  }
  function clearPhoto() { setPhoto(null); setFileKey((k) => k + 1); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await api.addReview(spotId, { author, stars, body, photo });
      try { localStorage.setItem('zf.name', author); } catch {}
      onAdded(r);
      setBody('');
      setStars(0);
      clearPhoto();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-xl border border-kicap/10 bg-santan px-3.5 py-2.5 outline-none transition placeholder:text-kopi-light focus:border-sambal/50 focus:bg-white focus:ring-4 focus:ring-sambal/10';

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-kicap/5">
      <p className="font-semibold">Been here? Leave a note.</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={stars === n} onClick={() => setStars(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={`text-3xl leading-none transition hover:scale-110 ${n <= stars ? 'text-kunyit' : 'text-kicap/15'}`}>★</button>
        ))}
      </div>
      <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" maxLength={40} aria-label="Your name" className={field} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you order? How was it?" maxLength={600} rows={3} aria-label="Your note" className={`${field} resize-y`} />
      {uploads && <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-kicap/20 px-3.5 text-sm font-medium text-kopi transition hover:border-sambal/50 hover:text-kicap focus-within:ring-4 focus-within:ring-sambal/10">
          <Icon name="camera" className="size-4" />
          {photo ? 'Change photo' : 'Add a photo of your plate'}
          <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} aria-label="Photo of your plate" className="sr-only" />
        </label>
        {preview && (
          <span className="inline-flex items-center gap-2">
            <img src={preview} alt="Selected photo preview" className="size-12 rounded-lg object-cover ring-1 ring-kicap/10" />
            <button type="button" onClick={clearPhoto} className="text-xs font-semibold text-sambal hover:underline">Remove</button>
          </span>
        )}
        <small className="text-xs text-kopi-light">Optional. JPEG, PNG or WebP, up to 5 MB.</small>
      </div>}
      {msg && <small className="text-sambal-deep">{msg}</small>}
      <button disabled={busy || !author.trim() || !body.trim() || !stars} className={`${btnPrimary} disabled:opacity-45 disabled:shadow-none`}>
        {busy ? 'Posting…' : 'Post note'}
      </button>
    </form>
  );
}

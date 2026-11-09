import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const MAX_CHOICES = 6;
const SPIN_MS = 4200;
const STORE_KEY = 'zapfan.spinChoices';

// Slice colours from the ZapFan palette, with a readable text colour for each.
const SLICES = [
  ['var(--color-sambal)', '#fff'],
  ['var(--color-kunyit)', 'var(--color-kicap)'],
  ['var(--color-pandan)', '#fff'],
  ['var(--color-kopi)', '#fff'],
  ['var(--color-sambal-deep)', '#fff'],
  ['var(--color-kunyit-soft)', 'var(--color-kicap)'],
];

const loadChoices = () => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(v) && v.length) return v.slice(0, MAX_CHOICES).map(String);
  } catch { /* storage blocked or empty */ }
  return ['', ''];
};
const saveChoices = (v) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* ignore */ } };

const randomIndex = (n) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
};

// Point on the wheel: angle in degrees clockwise from the top.
const pt = (deg, r) => {
  const t = (deg * Math.PI) / 180;
  return [r * Math.sin(t), -r * Math.cos(t)];
};
const short = (s, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * "Can't decide?" wheel. Spins either the spots on the current page or up to six
 * choices the user types in. `spots` is [{ id, name }].
 */
export default function SpinWheel({ spots, onOpenSpot, onClose }) {
  const [mode, setMode] = useState(spots.length >= 2 ? 'page' : 'own');
  const [choices, setChoices] = useState(loadChoices);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const timer = useRef(null);

  useEffect(() => saveChoices(choices), [choices]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const items = mode === 'page'
    ? spots.map((s) => ({ label: s.name, id: s.id }))
    : choices.map((c) => c.trim()).filter(Boolean).map((label) => ({ label }));
  const n = items.length;
  const slice = n ? 360 / n : 360;
  const canSpin = n >= 2 && !spinning;

  const switchMode = (m) => { if (!spinning) { setMode(m); setWinner(null); } };
  const editChoice = (i, v) => { setChoices((c) => c.map((x, j) => (j === i ? v : x))); setWinner(null); };
  const addChoice = () => setChoices((c) => (c.length < MAX_CHOICES ? [...c, ''] : c));
  const removeChoice = (i) => { setChoices((c) => (c.length > 2 ? c.filter((_, j) => j !== i) : c.map((x, j) => (j === i ? '' : x)))); setWinner(null); };

  const spin = () => {
    if (!canSpin) return;
    const pick = randomIndex(n);
    // Land somewhere inside the picked slice (not always dead centre), under the top pointer.
    const jitter = (Math.random() - 0.5) * slice * 0.7;
    const target = (360 - ((pick + 0.5) * slice + jitter) % 360) % 360;
    const current = ((rotation % 360) + 360) % 360;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setWinner(null);
    setSpinning(true);
    setRotation(rotation + (reduced ? 0 : 360 * 6) + ((target - current + 360) % 360));
    timer.current = setTimeout(() => { setSpinning(false); setWinner(items[pick]); }, reduced ? 50 : SPIN_MS);
  };

  const tab = (on) => `flex-1 h-10 rounded-full text-sm font-semibold transition-colors ${on ? 'bg-kicap text-santan' : 'text-kopi hover:text-kicap'}`;

  return (
    <div className="fixed inset-0 z-40 animate-fade bg-kicap/55 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Spin the wheel"
        className="absolute inset-x-0 bottom-0 top-[4%] mx-auto max-w-md animate-rise overflow-y-auto rounded-t-[2rem] bg-santan px-5 pb-10 pt-6 sm:inset-y-6 sm:rounded-[2rem]">
        <button aria-label="Close" onClick={onClose}
          className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-white text-kicap shadow-md transition hover:scale-105">
          <Icon name="x" className="size-5" />
        </button>

        <h2 className="pr-12 font-display text-2xl font-bold">Can't decide?</h2>
        <p className="mt-1 text-sm text-kopi">Spin and let the wheel pick for you.</p>

        <div className="mt-4 flex gap-1 rounded-full bg-white p-1 ring-1 ring-kicap/10" role="tablist">
          <button role="tab" aria-selected={mode === 'page'} className={tab(mode === 'page')} onClick={() => switchMode('page')} disabled={spinning}>
            This page{spots.length ? ` (${spots.length})` : ''}
          </button>
          <button role="tab" aria-selected={mode === 'own'} className={tab(mode === 'own')} onClick={() => switchMode('own')} disabled={spinning}>
            My own
          </button>
        </div>

        {/* Wheel */}
        <div className="relative mx-auto mt-6 aspect-square w-full max-w-[320px]">
          <svg viewBox="-104 -104 208 208" className="size-full drop-shadow-xl" aria-hidden="true">
            <g style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.15,.75,.15,1)` : 'none' }}>
              <circle r="100" fill="var(--color-santan-deep)" />
              {n === 1 && <circle r="100" fill={SLICES[0][0]} />}
              {n >= 2 && items.map((it, i) => {
                const [x1, y1] = pt(i * slice, 100);
                const [x2, y2] = pt((i + 1) * slice, 100);
                const [fill, ink] = SLICES[i % SLICES.length];
                const mid = (i + 0.5) * slice;
                return (
                  <g key={i}>
                    <path d={`M0 0 L${x1} ${y1} A100 100 0 ${slice > 180 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={fill} stroke="var(--color-santan)" strokeWidth="1.5" />
                    <text transform={`rotate(${mid - 90})`} x="90" y="0" textAnchor="end" dominantBaseline="middle"
                      fill={ink} fontSize={n > 4 ? 9 : 10.5} fontWeight="600" fontFamily="Figtree, system-ui, sans-serif">
                      {short(it.label, n > 4 ? 15 : 18)}
                    </text>
                  </g>
                );
              })}
              {n === 0 && <text textAnchor="middle" dominantBaseline="middle" fill="var(--color-kopi)" fontSize="10">Add choices below</text>}
            </g>
            <circle r="15" fill="var(--color-kicap)" stroke="var(--color-santan)" strokeWidth="3" />
            {/* Pointer at the top */}
            <path d="M-9 -106 L9 -106 L0 -88 Z" fill="var(--color-kicap)" stroke="var(--color-santan)" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <button onClick={spin} disabled={!canSpin}
            className="absolute left-1/2 top-1/2 grid size-[19%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-xs font-bold uppercase text-santan disabled:opacity-60"
            aria-label="Spin">
            {spinning ? '' : 'Spin'}
          </button>
        </div>

        {/* Result */}
        <div aria-live="polite" className="mt-5 min-h-[88px]">
          {winner ? (
            <div className="animate-rise rounded-2xl bg-white p-4 text-center shadow-md ring-1 ring-kicap/5">
              <p className="text-xs font-semibold uppercase tracking-wide text-kopi-light">The wheel says</p>
              <p className="mt-1 font-display text-xl font-bold text-sambal">{winner.label}</p>
              {winner.id !== undefined && (
                <button onClick={() => onOpenSpot(winner.id)}
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-sambal px-4 text-sm font-semibold text-white shadow-md shadow-sambal/30 transition hover:bg-sambal-deep">
                  <Icon name="pin" />Open this spot
                </button>
              )}
            </div>
          ) : (
            <button onClick={spin} disabled={!canSpin}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-sambal text-[15px] font-semibold text-white shadow-lg shadow-sambal/25 transition hover:bg-sambal-deep active:scale-[.98] disabled:opacity-50 disabled:shadow-none">
              {spinning ? 'Spinning…' : n < 2 ? (mode === 'page' ? 'Need at least 2 spots on this page' : 'Add at least 2 choices') : 'Spin the wheel'}
            </button>
          )}
          {winner && (
            <button onClick={spin} className="mt-3 w-full text-sm font-medium text-kopi underline-offset-2 hover:text-kicap hover:underline">Spin again</button>
          )}
        </div>

        {/* Own choices */}
        {mode === 'own' && (
          <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-kicap/5">
            <p className="text-sm font-semibold">Your choices <span className="font-normal text-kopi-light">(up to {MAX_CHOICES})</span></p>
            <div className="mt-3 space-y-2">
              {choices.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: SLICES[i % SLICES.length][0] }} />
                  <input value={c} onChange={(e) => editChoice(i, e.target.value)} maxLength={40} disabled={spinning}
                    placeholder={`Choice ${i + 1}`} aria-label={`Choice ${i + 1}`}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-kicap/10 bg-santan px-3 text-sm outline-none focus:border-sambal/50 focus:bg-white" />
                  <button onClick={() => removeChoice(i)} disabled={spinning} aria-label={`Remove choice ${i + 1}`}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-kopi-light transition hover:bg-santan-deep hover:text-kicap">
                    <Icon name="x" />
                  </button>
                </div>
              ))}
            </div>
            {choices.length < MAX_CHOICES && (
              <button onClick={addChoice} disabled={spinning}
                className="mt-3 h-9 rounded-full border border-dashed border-kicap/20 px-4 text-sm font-medium text-kopi transition hover:border-kicap/40 hover:text-kicap">
                + Add choice
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

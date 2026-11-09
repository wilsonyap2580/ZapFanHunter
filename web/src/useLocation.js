import { useCallback, useEffect, useRef, useState } from 'react';

// Live location with watchPosition. state: off | asking | live | denied | error | unsupported
export function useLiveLocation() {
  const [state, setState] = useState('off');
  const [pos, setPos] = useState(null); // { lat, lng, accuracy, at }
  const watch = useRef(null);

  const stop = useCallback((next = 'off') => {
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    setPos(null);
    setState(next);
    if (next === 'off') try { localStorage.removeItem('zf.geo'); } catch {}
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) return setState('unsupported');
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    setState('asking');
    try { localStorage.setItem('zf.geo', '1'); } catch {}
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setState('live');
        setPos((old) => {
          const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() };
          // Only move the centre (and refetch) when the user has moved ~30 m or more.
          if (old && Math.abs(old.lat - next.lat) < 0.0003 && Math.abs(old.lng - next.lng) < 0.0003) return { ...old, accuracy: next.accuracy, at: next.at };
          return next;
        });
      },
      (e) => (e.code === 1 ? stop('denied') : setState((s) => (s === 'live' ? s : 'error'))),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
  }, [stop]);

  // Resume automatically if the user turned it on last time.
  useEffect(() => {
    let on = false;
    try { on = localStorage.getItem('zf.geo') === '1'; } catch {}
    if (on) start();
    return () => { if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current); };
  }, [start]);

  return { state, pos, start, stop };
}

export function useSaved() {
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zf.saved') || '[]'); } catch { return []; }
  });
  const toggle = useCallback((id) => {
    setSaved((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [id, ...s];
      try { localStorage.setItem('zf.saved', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return { saved, toggle };
}

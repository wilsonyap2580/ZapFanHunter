// Drawn illustration of a zap fan plate (rice + three dishes), deterministic per spot id.
// Used until real photos are added. Clearly captioned as an illustration in the UI.

const DISH = [
  { b: '#BF661F', d: ['#8A4513', '#E3B155'], k: 'chunk' }, // curry chicken and potato
  { b: '#3B6824', d: ['#72A03D', '#2A4D18'], k: 'leaf' },  // stir-fried greens
  { b: '#A3261B', d: ['#FBF8F0', '#E9A825'], k: 'egg' },   // sambal egg
  { b: '#CF532E', d: ['#EEC27F', '#F4E6C8'], k: 'chunk' }, // sweet and sour
  { b: '#6B3B1D', d: ['#DDBA78', '#4A2812'], k: 'cube' },  // braised tofu
  { b: '#5A8833', d: ['#82AB4C', '#BF661F'], k: 'stick' }, // long beans
  { b: '#B3702C', d: ['#88501E', '#D89C50'], k: 'chunk' }, // fried chicken
  { b: '#D8D09A', d: ['#B6B173', '#BF661F'], k: 'leaf' },  // cabbage
];
const TABLE = ['#E2DBCF', '#D7DED9', '#E4D9C9', '#D9D3CB', '#DCE0E3'];

function rnd(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function blob(cx, cy, r, R, n = 10) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = r * (0.82 + R() * 0.3);
    p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.86]);
  }
  let d = `M${((p[0][0] + p[n - 1][0]) / 2).toFixed(1)} ${((p[0][1] + p[n - 1][1]) / 2).toFixed(1)}`;
  for (let j = 0; j < n; j++) {
    const a1 = p[j], a2 = p[(j + 1) % n];
    d += `Q${a1[0].toFixed(1)} ${a1[1].toFixed(1)} ${((a1[0] + a2[0]) / 2).toFixed(1)} ${((a1[1] + a2[1]) / 2).toFixed(1)}`;
  }
  return d + 'Z';
}

function bits(D, cx, cy, r, R, n) {
  let v = '';
  if (D.k === 'egg') {
    for (let e = 0; e < 2; e++) {
      const ex = cx - r * 0.3 + e * r * 0.6, ey = cy + (e ? -r * 0.1 : r * 0.15);
      v += `<ellipse cx="${ex}" cy="${ey}" rx="${r * 0.34}" ry="${r * 0.28}" fill="${D.d[0]}"/><circle cx="${ex + 2}" cy="${ey}" r="${r * 0.16}" fill="${D.d[1]}"/>`;
    }
    return v;
  }
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, dd = Math.sqrt(R()) * r * 0.7;
    const x = cx + Math.cos(a) * dd, y = cy + Math.sin(a) * dd * 0.85, c = D.d[i % 2], rot = (R() * 180) | 0;
    const t = `transform="rotate(${rot} ${x} ${y})"`;
    if (D.k === 'leaf') v += `<path d="M${x - 9} ${y}q9 -8 18 0" stroke="${c}" stroke-width="4" stroke-linecap="round" fill="none" ${t}/>`;
    else if (D.k === 'stick') v += `<rect x="${x - 10}" y="${y - 2.5}" width="20" height="5" rx="2.5" fill="${c}" ${t}/>`;
    else if (D.k === 'cube') v += `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3" fill="${c}" ${t}/>`;
    else v += `<ellipse cx="${x}" cy="${y}" rx="${6 + R() * 5}" ry="${5 + R() * 3}" fill="${c}" ${t}/>`;
  }
  return v;
}

const cache = new Map();

export function plateArt(id) {
  if (cache.has(id)) return cache.get(id);
  const R = rnd(id * 7 + 3);
  let v = `<rect width="400" height="300" fill="${TABLE[id % TABLE.length]}"/>` +
    '<ellipse cx="206" cy="160" rx="142" ry="136" fill="#2a1f14" opacity=".14"/>' +
    '<circle cx="200" cy="150" r="138" fill="#FBFAF6"/><circle cx="200" cy="150" r="134" fill="none" stroke="#2F5A86" stroke-width="5"/>' +
    '<circle cx="200" cy="150" r="104" fill="#F2EFE8"/>' +
    `<path d="${blob(158, 138, 58, R, 12)}" fill="#FFFEFA"/>`;
  for (let q = 0; q < 60; q++) {
    const a = R() * Math.PI * 2, dd = Math.sqrt(R()) * 50;
    const x = (158 + Math.cos(a) * dd).toFixed(1), y = (138 + Math.sin(a) * dd * 0.85).toFixed(1);
    v += `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="1.4" fill="#E9E3D6" transform="rotate(${(R() * 180) | 0} ${x} ${y})"/>`;
  }
  [[252, 96, 40], [262, 186, 42], [178, 214, 38]].forEach(([x, y, r], i) => {
    const D = DISH[(id * 3 + i * 5 + (id >> 2)) % DISH.length];
    v += `<path d="${blob(x, y, r, R, 10)}" fill="${D.b}"/>` + bits(D, x, y, r, R, 9);
  });
  const url = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">${v}</svg>`);
  cache.set(id, url);
  return url;
}

// Opening hours helpers. All times are Malaysia time (UTC+8, no DST).

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** "10:00-20:00|0=" -> [[open,close] | null] x 7, index 0 = Sunday */
export function parseHours(str) {
  const [def, ...overrides] = str.split('|');
  const range = (v) => (v ? v.split('-').map(toMin) : null);
  const week = Array.from({ length: 7 }, () => range(def));
  for (const o of overrides) week[Number(o[0])] = range(o.slice(2));
  return week;
}

export function nowInMalaysia(date = new Date()) {
  const kl = new Date(date.getTime() + 8 * 3600 * 1000);
  return { day: kl.getUTCDay(), minutes: kl.getUTCHours() * 60 + kl.getUTCMinutes() };
}

export function formatTime(min) {
  let h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}${m ? ':' + String(m).padStart(2, '0') : ''}${ap}`;
}

export function openStatus(week, date = new Date()) {
  const { day, minutes } = nowInMalaysia(date);
  const today = week[day];
  if (today && minutes >= today[0] && minutes < today[1]) {
    return { open: true, text: `Open until ${formatTime(today[1])}` };
  }
  for (let k = today && minutes < today[0] ? 0 : 1; k <= 7; k++) {
    const d = (day + k) % 7;
    const next = week[d];
    if (next) {
      const when = k === 0 ? 'today' : k === 1 ? 'tomorrow' : DAY[d];
      return { open: false, text: `Closed, opens ${when} ${formatTime(next[0])}` };
    }
  }
  return { open: false, text: 'Closed' };
}

/** Mon..Sun rows for display */
export function weekTable(week) {
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    day: DAY[d],
    dayIndex: d,
    hours: week[d] ? `${formatTime(week[d][0])} – ${formatTime(week[d][1])}` : 'Closed',
  }));
}

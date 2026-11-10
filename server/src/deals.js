// Night deals posted by diners, plus the per-person limits used for anything users add.
// Google has no discount data, so deals come from people: anyone can post one, others tap
// "Still on" or "Not anymore". A deal nobody has confirmed for DEAL_FRESH_DAYS stops showing.
import { createHash } from 'node:crypto';
import { all, one, run } from './db.js';
import { formatTime, nowInMalaysia } from './hours.js';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK = 7 * 1440;
export const DEAL_FRESH_DAYS = 30;
const MAX_REPORTS = 3;

// ---- who is asking -------------------------------------------------------------------
// No logins, so a person is a salted hash of their IP and browser. Good enough to stop
// one person confirming a deal 50 times, and no raw IPs are stored.
const SALT = process.env.VOTER_SALT || 'zapfan';
export function voterId(req) {
  return createHash('sha256').update(`${SALT}|${req.ip}|${req.get('user-agent') || ''}`).digest('base64url').slice(0, 22);
}

const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

/** Counts one use of `kind` for this person today. False once they've used `max` today. */
export async function withinDailyLimit(kind, voter, max) {
  const { changes } = await run(`INSERT INTO rate_limits (key, day, n) VALUES (?, ?, 1)
    ON CONFLICT(key, day) DO UPDATE SET n = n + 1 WHERE n < ?`, [`${kind}|${voter}`, today(), max]);
  return changes > 0;
}

// ---- when a deal is on ---------------------------------------------------------------
/** Every window in the week as [start, end) minutes from Sunday 00:00. */
function windows(deal) {
  return [...deal.days].map(Number).map((d) => {
    const start = d * 1440 + deal.start_min;
    let end = d * 1440 + deal.end_min;
    if (end <= start) end += 1440; // runs past midnight
    return [start, end];
  });
}

/** { active, text } for a card, e.g. "Deal on until 10pm" or "Deal from 8pm". */
export function dealStatus(deal, now = new Date()) {
  const { day, minutes } = nowInMalaysia(now);
  const t = day * 1440 + minutes;
  let next = Infinity;
  for (const [start, end] of windows(deal)) {
    // Check this week and the end of last week's Saturday-night window.
    for (const shift of [-WEEK, 0]) {
      if (t >= start + shift && t < end + shift) return { active: true, text: `Deal on until ${formatTime(end % 1440)}` };
    }
    next = Math.min(next, (start - t + WEEK) % WEEK);
  }
  const at = t + next;
  const dayDiff = Math.floor(at / 1440) - day;
  const when = dayDiff === 0 ? '' : dayDiff === 1 ? 'tomorrow ' : `${DAY[Math.floor(at / 1440) % 7]} `;
  return { active: false, text: `Deal ${when}from ${formatTime(at % 1440)}`, startsIn: next };
}

/** "Daily", "Mon–Fri", "Sat, Sun" … */
function daysLabel(days) {
  const set = [...new Set(days)].map(Number).sort();
  if (set.length === 7) return 'Daily';
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => set.includes(d));
  if (order.join() === '1,2,3,4,5') return 'Mon–Fri';
  if (order.join() === '6,0') return 'Weekends';
  return order.map((d) => DAY[d]).join(', ');
}

const fresh = () => Date.now() - DEAL_FRESH_DAYS * 86400e3;

function shapeDeal(d, now) {
  return {
    id: d.id,
    text: d.text,
    days: d.days,
    start: d.start_min,
    end: d.end_min,
    when: `${daysLabel(d.days)}, ${formatTime(d.start_min)} – ${formatTime(d.end_min)}`,
    status: dealStatus(d, now),
    confirms: d.confirms,
    lastConfirmedAt: d.last_confirmed_at,
  };
}

// Active deals first, then the one starting soonest.
const byBest = (a, b) => (b.status.active - a.status.active) || (a.status.startsIn ?? 0) - (b.status.startsIn ?? 0);

/** Live deals for a list of spots, as Map(spot id -> deals sorted best first). One query. */
async function dealsBySpot(spots, now = new Date()) {
  const ids = spots.map((s) => s.id).filter((id) => typeof id === 'number');
  const placeIds = spots.map((s) => s.placeId).filter(Boolean);
  const out = new Map();
  if (!ids.length && !placeIds.length) return out;
  const marks = (a) => (a.length ? a.map(() => '?').join(',') : 'NULL');
  const rows = await all(`SELECT * FROM deals
    WHERE (spot_id IN (${marks(ids)}) OR place_id IN (${marks(placeIds)}))
      AND last_confirmed_at > ? AND reports < ?`, [...ids, ...placeIds, fresh(), MAX_REPORTS]);
  for (const s of spots) {
    const mine = rows.filter((d) => (d.spot_id != null && d.spot_id === s.id) || (d.place_id && d.place_id === s.placeId));
    if (mine.length) out.set(s.id, mine.map((d) => shapeDeal(d, now)).sort(byBest));
  }
  return out;
}

/** Adds `deal` (the best one, or null) to each spot card. */
export async function attachDeals(spots) {
  const map = await dealsBySpot(spots);
  return spots.map((s) => {
    const best = map.get(s.id)?.[0];
    return { ...s, deal: best ? { id: best.id, text: best.text, status: best.status } : null };
  });
}

/** All live deals for one spot, for the details sheet. */
export async function dealsForSpot(spot) {
  return (await dealsBySpot([spot])).get(spot.id) || [];
}

// ---- adding and voting ---------------------------------------------------------------
const toMin = (v) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ''));
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : NaN;
};

/** Checks a posted deal. Returns { error } or { text, days, start, end }. */
export function parseDeal(body) {
  const text = String(body?.text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const days = [...new Set(String(body?.days || '').replace(/[^0-6]/g, ''))].sort().join('');
  const start = toMin(body?.start);
  const end = toMin(body?.end);
  if (text.length < 3) return { error: 'Describe the deal, e.g. "20% off all dishes".' };
  if (!days) return { error: 'Pick at least one day.' };
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { error: 'Add the time the deal starts and ends.' };
  if (start === end) return { error: 'The deal has to end at a different time than it starts.' };
  return { text, days, start, end };
}

/** The id of a live deal at this shop with the same wording, so a repeat post counts as "still on" instead. */
export async function sameDealId(target, deal) {
  const row = await one(`SELECT id FROM deals WHERE (spot_id = ? OR place_id = ?) AND lower(text) = lower(?)
    AND reports < ? ORDER BY last_confirmed_at DESC LIMIT 1`, [target.spotId ?? -1, target.placeId || '', deal.text, MAX_REPORTS]);
  return row?.id ?? null;
}

export async function addDeal(target, deal, voter) {
  const now = Date.now();
  const { lastId } = await run(`INSERT INTO deals (spot_id, place_id, text, days, start_min, end_min, created_at, last_confirmed_at, voter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [target.spotId, target.placeId, deal.text, deal.days, deal.start, deal.end, now, now, voter]);
  // Posting counts as today's "still on" from this person.
  await run("INSERT OR IGNORE INTO deal_votes (deal_id, voter, kind, day) VALUES (?, ?, 'confirm', ?)", [lastId, voter, today()]);
  return shapeDeal(await one('SELECT * FROM deals WHERE id = ?', [lastId]));
}

/**
 * "Still on" (confirm, once a day per person) or "Not anymore" (report, once per person).
 * Returns the updated deal (hidden: true once it's no longer shown), or null if there's no such deal.
 */
export async function voteDeal(id, kind, voter) {
  const deal = await one('SELECT id FROM deals WHERE id = ?', [id]);
  if (!deal) return null;
  const { changes } = await run('INSERT OR IGNORE INTO deal_votes (deal_id, voter, kind, day) VALUES (?, ?, ?, ?)',
    [id, voter, kind, kind === 'confirm' ? today() : '']);
  if (changes && kind === 'confirm') await run('UPDATE deals SET confirms = confirms + 1, last_confirmed_at = ? WHERE id = ?', [Date.now(), id]);
  if (changes && kind === 'report') await run('UPDATE deals SET reports = reports + 1 WHERE id = ?', [id]);
  const row = await one('SELECT * FROM deals WHERE id = ?', [id]);
  return { ...shapeDeal(row), counted: changes > 0, hidden: row.reports >= MAX_REPORTS || row.last_confirmed_at <= fresh() };
}

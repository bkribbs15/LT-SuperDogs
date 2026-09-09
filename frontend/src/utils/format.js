/** Kickoff as "Sat 2:30 PM" in the viewer's local time. */
export const fmtKickoff = (iso, { withDate = true } = {}) => {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!withDate) return time;
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
};

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');

/** "+6.5" — the points the dog is getting. */
export const fmtSpread = (n) => (n == null ? '—' : `+${Number(n) % 1 === 0 ? Number(n) : n}`);

/** The on-air SuperDog rules. The API sends the same numbers; these are the fallback. */
export const DEFAULT_RULES = { min_spread: 4.5, cover_points: 5, push_points: 1 };

/** "11.5" / "5" / "0" — points are halves at most, so plain String() is right. */
export const fmtPoints = (n) => (n == null ? '—' : String(n));

export const RESULTS = {
  upset: { label: 'Upset', short: 'W', badge: 'badge-upset', text: 'text-result-upset', win: true, scoring: '5 + the spread' },
  cover: { label: 'Covered', short: 'W', badge: 'badge-cover', text: 'text-result-cover', win: true, scoring: '5 points' },
  loss:  { label: 'Loss', short: 'L', badge: 'badge-loss', text: 'text-result-loss', win: false, scoring: '0 points' },
  push:  { label: 'Push', short: 'P', badge: 'badge-push', text: 'text-result-push', win: false, scoring: '1 point' },
  void:  { label: 'Voided', short: '—', badge: 'badge-push', text: 'text-result-push', win: false, scoring: 'game postponed or canceled · 0' },
};

export const resultMeta = (result) => RESULTS[result] || null;

/** "#12 Kansas" or just "Kansas". */
export const rankedName = (rank, name) => (rank ? `#${rank} ${name}` : name);

export const ordinal = (n) => {
  if (n == null) return '—';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/** The season label shown in headers, e.g. "2026 Season". */
export const seasonLabel = (season) => `${season} Season`;

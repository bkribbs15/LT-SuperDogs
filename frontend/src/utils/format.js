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

export const RESULTS = {
  upset: { label: 'Upset', short: 'W', badge: 'badge-upset', text: 'text-result-upset', win: true },
  cover: { label: 'Covered', short: 'W', badge: 'badge-cover', text: 'text-result-cover', win: true },
  loss:  { label: 'Loss', short: 'L', badge: 'badge-loss', text: 'text-result-loss', win: false },
  push:  { label: 'Push', short: 'P', badge: 'badge-push', text: 'text-result-push', win: false },
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

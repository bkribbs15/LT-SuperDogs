import { useEffect, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');

/** Ticks down to `to` (ISO). Renders `done` text once it passes. */
const Countdown = ({ to, done = 'Kicked off', className = '' }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!to) return null;
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return <span className={className}>{done}</span>;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <span className={`font-mono-data ${className}`}>
      {d > 0 ? `${d}d ` : ''}{pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
};

export default Countdown;

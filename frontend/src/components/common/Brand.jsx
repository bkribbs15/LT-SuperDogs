/** Paw-print mark on a navy tile — the app's logo. */
export const PawMark = ({ className = 'w-10 h-10' }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#16264A" />
    <g fill="#E4572E">
      <ellipse cx="20" cy="22" rx="5.5" ry="7" transform="rotate(-18 20 22)" />
      <ellipse cx="32" cy="17" rx="5.5" ry="7" />
      <ellipse cx="44" cy="22" rx="5.5" ry="7" transform="rotate(18 44 22)" />
      <ellipse cx="11" cy="34" rx="4.5" ry="5.5" transform="rotate(-40 11 34)" />
      <ellipse cx="53" cy="34" rx="4.5" ry="5.5" transform="rotate(40 53 34)" />
      <path d="M32 30c8 0 15 6 17 13 1.5 5-2 9-7 9-3 0-5-1.5-10-1.5S25 52 22 52c-5 0-8.5-4-7-9 2-7 9-13 17-13z" />
    </g>
  </svg>
);

/** Centered brand block used on the auth screens. */
const Brand = ({ title = 'LT SuperDogs', subtitle }) => (
  <div className="text-center mb-7">
    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-[0_10px_30px_rgba(22,38,74,0.28)]">
      <PawMark className="w-20 h-20" />
    </div>
    <h1 className="font-display text-4xl font-extrabold text-text-primary tracking-wide uppercase">{title}</h1>
    {subtitle && (
      <p className="text-text-orange text-xs font-bold tracking-[0.2em] uppercase mt-1">{subtitle}</p>
    )}
  </div>
);

export default Brand;

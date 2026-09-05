import { useState } from 'react';

/** Team logo with a colored-initials fallback when ESPN's PNG is missing. */
const TeamMark = ({ logo, abbr, color, size = 'md', className = '' }) => {
  const [broken, setBroken] = useState(false);
  const dims = { sm: 'w-7 h-7 text-[10px]', md: 'w-10 h-10 text-xs', lg: 'w-14 h-14 text-sm' }[size];
  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt={abbr || ''}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${dims} object-contain shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      className={`${dims} rounded-full shrink-0 flex items-center justify-center font-bold text-white ${className}`}
      style={{ background: color ? `#${color}` : '#3C5385' }}
    >
      {(abbr || '?').slice(0, 4)}
    </div>
  );
};

export default TeamMark;

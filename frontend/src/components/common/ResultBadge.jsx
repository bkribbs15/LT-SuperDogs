import { resultMeta, fmtPoints } from '../../utils/format';

/** Upset / Covered / Loss / Push pill (with points when given); "Live" or "Pending" when unresolved. */
const ResultBadge = ({ result, gameStatus, points, className = '' }) => {
  const meta = resultMeta(result);
  if (meta) {
    return (
      <span className={`badge ${meta.badge} ${className}`} title={meta.scoring}>
        {meta.label}
        {points != null && <span className="font-mono-data normal-case tracking-normal opacity-90">· {fmtPoints(points)}</span>}
      </span>
    );
  }
  if (gameStatus === 'in') {
    return (
      <span className={`badge badge-live ${className}`}>
        <span className="w-1.5 h-1.5 bg-white rounded-full animate-live-pulse" /> Live
      </span>
    );
  }
  return <span className={`badge badge-muted ${className}`}>Pending</span>;
};

export default ResultBadge;

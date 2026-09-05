import { resultMeta } from '../../utils/format';

/** Upset / Covered / Loss / Push pill; "Live" or "Pending" when unresolved. */
const ResultBadge = ({ result, gameStatus, className = '' }) => {
  const meta = resultMeta(result);
  if (meta) return <span className={`badge ${meta.badge} ${className}`}>{meta.label}</span>;
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

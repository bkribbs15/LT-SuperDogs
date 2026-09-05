import { AlertCircle, CheckCircle } from 'lucide-react';

const Alert = ({ type = 'error', children, className = '' }) => {
  if (!children) return null;
  const ok = type === 'success';
  return (
    <div
      className={`px-4 py-3 rounded-xl flex items-center gap-2 text-sm border animate-slide-down ${
        ok
          ? 'bg-result-upset/10 border-result-upset/30 text-result-upset'
          : 'bg-result-loss/10 border-result-loss/30 text-result-loss'
      } ${className}`}
    >
      {ok ? <CheckCircle className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
      <span>{children}</span>
    </div>
  );
};

export default Alert;

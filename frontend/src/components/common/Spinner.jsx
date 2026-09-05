const Spinner = ({ label = 'Loading…', className = '' }) => (
  <div className={`text-center py-14 ${className}`}>
    <div className="w-12 h-12 border-4 border-dog-navy border-t-transparent rounded-full animate-spin mx-auto mb-4" />
    <p className="text-text-muted">{label}</p>
  </div>
);

export default Spinner;

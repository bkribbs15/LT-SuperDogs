import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import Brand from '../common/Brand';
import Alert from '../common/Alert';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authAPI.forgotPassword(email);
      setMessage(res.message);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again in a moment.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md animate-scale-in">
        <Brand subtitle="College Football · Underdog Pick'em" />
        <div className="glass-card">
          {submitted ? (
            <div className="text-center py-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-result-upset/10 text-result-upset mb-4">
                <CheckCircle className="h-7 w-7" />
              </div>
              <h2 className="font-display text-3xl font-bold text-text-primary mb-2">Request sent</h2>
              <p className="text-text-muted text-sm mb-6">{message}</p>
              <Link to="/login" className="btn-secondary !py-2 !px-5 text-sm"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>
            </div>
          ) : (
            <>
              <h2 className="font-display text-3xl font-bold text-text-primary mb-1">Forgot your password?</h2>
              <p className="text-text-muted text-sm mb-6">Enter your email and the pool admin will set a temporary password and get back to you.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Alert>{error}</Alert>
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-text-secondary mb-2">Email address</label>
                  <div className="relative">
                    <Mail className="absolute inset-y-0 left-3 my-auto h-5 w-5 text-text-dim pointer-events-none" />
                    <input id="email" name="email" type="email" autoComplete="email" required value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }} className="input-field pl-10" placeholder="you@example.com" />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-dog w-full !py-3 mt-2">
                  {loading ? (<><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>) : 'Send reset request'}
                </button>
              </form>
              <div className="divider" />
              <div className="text-center">
                <Link to="/login" className="inline-flex items-center gap-1 text-dog-navy hover:text-dog-orange font-bold text-sm transition-colors">
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;

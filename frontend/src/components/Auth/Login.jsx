import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import Brand from '../common/Brand';
import Alert from '../common/Alert';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const year = new Date().getFullYear();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(formData.email, formData.password);
    if (result.success) navigate('/dashboard');
    else setError(result.error);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md animate-scale-in">
        <Brand subtitle="College Football · Underdog Pick'em" />

        <div className="glass-card">
          <h2 className="font-display text-3xl font-bold text-text-primary mb-1">Welcome back</h2>
          <p className="text-text-muted text-sm mb-6">Sign in to lock in this week's SuperDog.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Alert>{error}</Alert>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-text-secondary mb-2">Email address</label>
              <div className="relative">
                <Mail className="absolute inset-y-0 left-3 my-auto h-5 w-5 text-text-dim pointer-events-none" />
                <input id="email" name="email" type="email" autoComplete="email" required
                  value={formData.email} onChange={handleChange} className="input-field pl-10" placeholder="you@example.com" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-semibold text-text-secondary">Password</label>
                <Link to="/forgot-password" className="text-sm font-semibold text-dog-navy hover:text-dog-orange transition-colors">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute inset-y-0 left-3 my-auto h-5 w-5 text-text-dim pointer-events-none" />
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                  value={formData.password} onChange={handleChange} className="input-field pl-10 pr-12" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-3 my-auto flex items-center text-text-dim hover:text-text-secondary"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full !py-3 mt-2">
              {loading ? (<><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in…</>) : 'Sign in'}
            </button>
          </form>

          <div className="divider" />

          <div className="text-center">
            <span className="text-text-muted text-sm">New to the pool? </span>
            <Link to="/register" className="inline-flex items-center gap-1 text-dog-navy hover:text-dog-orange font-bold text-sm transition-colors">
              Create an account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <p className="text-center text-text-dim text-xs mt-6">© {year} LT SuperDogs · Who's got the dog?</p>
      </div>
    </div>
  );
};

export default Login;

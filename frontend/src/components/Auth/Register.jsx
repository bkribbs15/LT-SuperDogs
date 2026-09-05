import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Mail, Lock, User, Eye, EyeOff, CheckCircle } from 'lucide-react';
import Brand from '../common/Brand';
import Alert from '../common/Alert';

const Register = () => {
  const { register } = useAuth();
  const year = new Date().getFullYear();
  const [formData, setFormData] = useState({ email: '', firstName: '', lastName: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    if (!firstName || !lastName) { setError('Please enter both your first and last name'); setLoading(false); return; }
    if (formData.password !== formData.confirmPassword) { setError('Passwords do not match'); setLoading(false); return; }
    if (formData.password.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return; }

    const fullName = `${firstName} ${lastName}`;
    const result = await register({ email: formData.email, username: fullName, display_name: fullName, password: formData.password });
    if (result.success) setPendingMessage(result.message);
    else setError(result.error);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-10">
      <div className="relative z-10 w-full max-w-md animate-scale-in">
        <Brand title="Join the Pool" subtitle="College Football · Underdog Pick'em" />

        <div className="glass-card">
          {pendingMessage ? (
            <div className="text-center py-4">
              <CheckCircle className="h-12 w-12 text-result-upset mx-auto mb-4" />
              <h2 className="font-display text-3xl font-bold text-text-primary mb-2">You're on the list</h2>
              <p className="text-text-body mb-6">{pendingMessage}</p>
              <Link to="/login" className="btn-primary inline-flex">Back to sign in</Link>
            </div>
          ) : (
            <>
              <h2 className="font-display text-3xl font-bold text-text-primary mb-1">Create your account</h2>
              <p className="text-text-muted text-sm mb-6">The admin approves new players before they can pick.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Alert>{error}</Alert>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-semibold text-text-secondary mb-2">First name</label>
                    <div className="relative">
                      <User className="absolute inset-y-0 left-3 my-auto h-5 w-5 text-text-dim pointer-events-none" />
                      <input id="firstName" name="firstName" type="text" autoComplete="given-name" required
                        value={formData.firstName} onChange={handleChange} className="input-field pl-10" placeholder="Kirk" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-semibold text-text-secondary mb-2">Last name</label>
                    <input id="lastName" name="lastName" type="text" autoComplete="family-name" required
                      value={formData.lastName} onChange={handleChange} className="input-field" placeholder="Herbstreit" />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-text-secondary mb-2">Email address</label>
                  <div className="relative">
                    <Mail className="absolute inset-y-0 left-3 my-auto h-5 w-5 text-text-dim pointer-events-none" />
                    <input id="email" name="email" type="email" autoComplete="email" required
                      value={formData.email} onChange={handleChange} className="input-field pl-10" placeholder="you@example.com" />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-text-secondary mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute inset-y-0 left-3 my-auto h-5 w-5 text-text-dim pointer-events-none" />
                    <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required
                      value={formData.password} onChange={handleChange} className="input-field pl-10 pr-12" placeholder="At least 8 characters" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 my-auto flex items-center text-text-dim hover:text-text-secondary"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-semibold text-text-secondary mb-2">Confirm password</label>
                  <div className="relative">
                    <Lock className="absolute inset-y-0 left-3 my-auto h-5 w-5 text-text-dim pointer-events-none" />
                    <input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required
                      value={formData.confirmPassword} onChange={handleChange} className="input-field pl-10" placeholder="Re-enter your password" />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full !py-3 mt-2">
                  {loading ? (<><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating account…</>) : 'Create account'}
                </button>
              </form>

              <div className="divider" />
              <div className="text-center">
                <span className="text-text-muted text-sm">Already have an account? </span>
                <Link to="/login" className="text-dog-navy hover:text-dog-orange font-bold text-sm transition-colors">Sign in instead</Link>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-text-dim text-xs mt-6">© {year} LT SuperDogs · Who's got the dog?</p>
      </div>
    </div>
  );
};

export default Register;

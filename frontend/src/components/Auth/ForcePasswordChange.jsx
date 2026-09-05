import { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';

/**
 * Blocking overlay shown when the account is on an admin-issued temporary
 * password. The API refuses everything else until a real one is set.
 */
const ForcePasswordChange = () => {
  const { isAuthenticated, mustChangePassword, updateUser, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isAuthenticated || !mustChangePassword) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters.');
    if (newPassword !== confirm) return setError('Passwords do not match.');
    setSaving(true);
    try {
      await authAPI.changePassword(current, newPassword);
      updateUser({ must_change_password: false });
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not change password. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-dog-darknavy/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="glass-card max-w-md w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-dog-orange/10 border border-dog-orange/30 rounded-full mb-5">
          <Lock className="h-3.5 w-3.5 text-text-orange" strokeWidth={2.5} />
          <span className="text-xs font-bold text-text-orange tracking-widest uppercase">Set your password</span>
        </div>
        <h3 className="font-display text-3xl font-bold text-text-primary mb-2">Choose a new password</h3>
        <p className="text-text-body mb-6">You're signed in with a temporary password from the admin. Set your own to continue.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Temporary password</label>
            <input type="password" className="input-field" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">New password</label>
            <input type="password" className="input-field" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Confirm password</label>
            <input type="password" className="input-field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your new password" />
          </div>
          {error && <p className="text-sm font-semibold text-result-loss">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            <ShieldCheck className="h-4 w-4" /> {saving ? 'Saving…' : 'Save and continue'}
          </button>
        </form>
        <button onClick={logout} className="mt-4 w-full text-sm text-text-muted hover:text-text-secondary transition-colors">Log out instead</button>
      </div>
    </div>
  );
};

export default ForcePasswordChange;

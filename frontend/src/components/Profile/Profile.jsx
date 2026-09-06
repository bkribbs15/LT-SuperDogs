import { useState, useEffect } from 'react';
import Page from '../Layout/Page';
import { useAuth } from '../../context/AuthContext';
import { authAPI, picksAPI, standingsAPI } from '../../services/api';
import { User, Lock, Save, Eye, EyeOff, Shield, Trophy, Zap, Target, Dog } from 'lucide-react';
import Alert from '../common/Alert';
import TeamMark from '../common/TeamMark';
import ResultBadge from '../common/ResultBadge';
import { fmtSpread, fmtKickoff, fmtPoints, ordinal, initials, rankedName } from '../../utils/format';

const Profile = () => {
  const { user, updateUser, isOwner } = useAuth();
  const [message, setMessage] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);
  const [picks, setPicks] = useState([]);
  const [me, setMe] = useState(null);
  const [season, setSeason] = useState(null);
  const [loadingPicks, setLoadingPicks] = useState(true);

  const [profileForm, setProfileForm] = useState({
    display_name: user?.display_name || user?.username || '',
    nickname: user?.nickname || '',
    email: user?.email || '',
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });

  useEffect(() => {
    (async () => {
      try {
        const [mine, table] = await Promise.all([picksAPI.getMine(), standingsAPI.get()]);
        setPicks(mine);
        setSeason(table.season);
        setMe(table.standings.find((e) => e.user_id === user.user_id) || null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPicks(false);
      }
    })();
  }, [user.user_id]);

  const flash = (setter, type, text) => {
    setter({ type, text });
    setTimeout(() => setter(null), 3500);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (profileForm.display_name.trim().split(/\s+/).length < 2) return flash(setMessage, 'error', 'Please use your full name — first and last.');
    setSavingProfile(true);
    try {
      const updated = await authAPI.updateProfile({
        username: profileForm.display_name, display_name: profileForm.display_name,
        nickname: profileForm.nickname, email: profileForm.email,
      });
      updateUser(updated);
      flash(setMessage, 'success', 'Profile updated!');
    } catch (err) {
      const d = err.response?.data?.detail;
      flash(setMessage, 'error', (Array.isArray(d) ? d.map((x) => x.msg).join(' ') : d) || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword.length < 8) return flash(setPasswordMessage, 'error', 'Password must be at least 8 characters');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return flash(setPasswordMessage, 'error', 'Passwords do not match');
    setSavingPassword(true);
    try {
      await authAPI.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      flash(setPasswordMessage, 'success', 'Password updated!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      flash(setPasswordMessage, 'error', err.response?.data?.detail || 'Failed to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const statCards = [
    { label: 'Points', value: me ? fmtPoints(me.points) : '—', icon: Zap },
    { label: 'Place', value: me ? `${me.tied ? 'T' : ''}${ordinal(me.rank)}` : '—', icon: Trophy },
    { label: 'Record', value: me ? me.record : '—', icon: Target },
    { label: 'Upsets', value: me ? me.upsets : '—', icon: Dog },
  ];

  return (
    <Page width="max-w-4xl">
      <div className="space-y-8">
        <div className="animate-fade-in flex items-center gap-4">
          <div className="w-16 h-16 bg-navy-gradient rounded-2xl flex items-center justify-center text-white font-display font-bold text-2xl shadow-md">
            {initials(user?.display_name || user?.username)}
          </div>
          <div>
            <h1 className="font-display text-4xl font-extrabold uppercase tracking-wide text-text-primary leading-tight">{user?.display_name || user?.username}</h1>
            <div className="flex items-center gap-2 text-text-muted text-sm flex-wrap">
              {user?.nickname && <span className="font-semibold text-text-orange">"{user.nickname}"</span>}
              <span>{user?.email}</span>
              {isOwner && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-dog-gold/20 text-text-gold text-[10px] rounded-full font-bold uppercase tracking-wide">
                  <Shield className="h-2.5 w-2.5" /> Owner
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map((s) => (
            <div key={s.label} className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-dog-navy/10 shrink-0"><s.icon className="h-4 w-4 text-dog-navy" /></div>
                <p className="text-[11px] text-text-muted font-bold uppercase tracking-wide leading-tight">{s.label}</p>
              </div>
              <p className="font-display text-3xl font-bold text-text-primary leading-none">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Dog className="h-5 w-5 text-text-orange" />
            <h2 className="font-display text-2xl font-bold text-text-primary">My {season || ''} SuperDogs</h2>
          </div>
          {loadingPicks ? (
            <p className="text-text-muted py-6 text-center">Loading your picks…</p>
          ) : picks.length === 0 ? (
            <p className="text-text-muted py-6 text-center">No picks yet — head to the board and grab a dog.</p>
          ) : (
            <div className="space-y-2">
              {[...picks].reverse().map((p) => (
                <div key={p.pick_id} className="flex items-center gap-3 px-3 sm:px-4 py-3 bg-white/55 border border-glass rounded-xl">
                  <span className="font-display text-lg font-bold text-text-muted w-12 shrink-0">Wk {p.week}</span>
                  <TeamMark logo={p.team_logo} abbr={p.team_abbr} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-text-primary truncate">{rankedName(p.team_rank, p.team_name)} <span className="font-mono-data text-text-orange">{fmtSpread(p.locked_spread)}</span></div>
                    <div className="text-xs text-text-muted truncate">
                      {p.side === 'home' ? 'vs' : 'at'} {rankedName(p.opponent_rank, p.opponent_name)}
                      {p.game_status === 'pre' ? ` · ${fmtKickoff(p.kickoff)}` : p.team_score != null ? ` · ${p.team_score}–${p.opponent_score}` : ''}
                    </div>
                  </div>
                  <ResultBadge result={p.result} gameStatus={p.game_status} points={p.points} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <User className="h-5 w-5 text-dog-navy" />
            <h2 className="font-display text-2xl font-bold text-text-primary">Account</h2>
          </div>
          {message && <Alert type={message.type} className="mb-5">{message.text}</Alert>}
          <form onSubmit={handleProfileSubmit} className="space-y-5">
            <div>
              <label htmlFor="display_name" className="block text-sm font-semibold text-text-secondary mb-2">Display name</label>
              <input type="text" id="display_name" value={profileForm.display_name}
                onChange={(e) => setProfileForm({ ...profileForm, display_name: e.target.value })} className="input-field" required />
              <p className="mt-2 text-sm text-text-muted">Shown in the standings.</p>
            </div>
            <div>
              <label htmlFor="nickname" className="block text-sm font-semibold text-text-secondary mb-2">Nickname</label>
              <input type="text" id="nickname" value={profileForm.nickname}
                onChange={(e) => setProfileForm({ ...profileForm, nickname: e.target.value })} className="input-field" placeholder="e.g. Stanford Steve" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-text-secondary mb-2">Email address</label>
              <input type="email" id="email" value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="input-field" required />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={savingProfile} className="btn-primary">
                {savingProfile ? 'Saving…' : (<><Save className="h-5 w-5" /> Save changes</>)}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="h-5 w-5 text-dog-navy" />
            <h2 className="font-display text-2xl font-bold text-text-primary">Password</h2>
          </div>
          {passwordMessage && <Alert type={passwordMessage.type} className="mb-5">{passwordMessage.text}</Alert>}
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            {[
              { id: 'currentPassword', key: 'current', label: 'Current password' },
              { id: 'newPassword', key: 'new', label: 'New password', hint: 'Must be at least 8 characters.' },
              { id: 'confirmPassword', key: 'confirm', label: 'Confirm new password' },
            ].map((field) => (
              <div key={field.id}>
                <label htmlFor={field.id} className="block text-sm font-semibold text-text-secondary mb-2">{field.label}</label>
                <div className="relative">
                  <input type={showPasswords[field.key] ? 'text' : 'password'} id={field.id} value={passwordForm[field.id]}
                    onChange={(e) => setPasswordForm({ ...passwordForm, [field.id]: e.target.value })} className="input-field pr-12" required />
                  <button type="button" onClick={() => setShowPasswords({ ...showPasswords, [field.key]: !showPasswords[field.key] })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-secondary" aria-label="Toggle visibility">
                    {showPasswords[field.key] ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {field.hint && <p className="mt-2 text-sm text-text-muted">{field.hint}</p>}
              </div>
            ))}
            <div className="flex justify-end">
              <button type="submit" disabled={savingPassword} className="btn-primary">
                {savingPassword ? 'Updating…' : (<><Lock className="h-5 w-5" /> Update password</>)}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Page>
  );
};

export default Profile;

import { Fragment, useEffect, useState, useCallback } from 'react';
import {
  Shield, Users, Calendar, CheckCircle, KeyRound, Power, PowerOff, ShieldCheck, ShieldOff,
  UserPlus, Check, X, RefreshCw, Save, Trash2, Inbox, ClipboardList, Mail, Link2,
} from 'lucide-react';
import Page from '../Layout/Page';
import Alert from '../common/Alert';
import Spinner from '../common/Spinner';
import { adminAPI, boardAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fmtKickoff, fmtSpread, initials } from '../../utils/format';

const ACTION_BTN =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ' +
  'whitespace-nowrap hover:border-transparent hover:-translate-y-px active:translate-y-0 disabled:opacity-50';
const BTN_GREEN = `${ACTION_BTN} bg-result-upset/10 text-result-upset border-result-upset/25 hover:bg-result-upset hover:text-white`;
const BTN_RED = `${ACTION_BTN} bg-result-loss/10 text-result-loss border-result-loss/25 hover:bg-result-loss hover:text-white`;
const BTN_NAVY = `${ACTION_BTN} bg-white/70 text-text-secondary border-glass hover:bg-dog-navy hover:text-white`;
const BTN_GOLD = `${ACTION_BTN} bg-dog-gold/15 text-text-gold border-dog-gold/30 hover:bg-text-gold hover:text-white`;

const AdminSettings = () => {
  const { user: me } = useAuth();
  const [tab, setTab] = useState('users');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const flash = (ok, msg) => {
    setError(ok ? '' : msg);
    setSuccess(ok ? msg : '');
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };
  const fail = (err, fallback) => flash(false, err.response?.data?.detail || fallback);

  // ── Users ──────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [resetTarget, setResetTarget] = useState(null); // {kind:'user'|'request', ...}
  const [resetPwd, setResetPwd] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const [u, r] = await Promise.all([adminAPI.getAllUsers(), adminAPI.getResetRequests()]);
      setUsers(u);
      setRequests(r);
    } catch (err) {
      fail(err, 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const userAction = async (fn, msg) => {
    try { await fn(); flash(true, msg); fetchUsers(); } catch (err) { fail(err, 'Action failed'); }
  };

  const handleReset = async () => {
    if (resetPwd.length < 8) return;
    setResetting(true);
    try {
      if (resetTarget.kind === 'user') await adminAPI.resetPassword(resetTarget.user_id, resetPwd);
      else await adminAPI.resolveResetRequest(resetTarget.token, resetPwd);
      flash(true, `Temporary password set for ${resetTarget.label}. Send it to them — they'll be asked to change it at login.`);
      setResetTarget(null);
      setResetPwd('');
      fetchUsers();
    } catch (err) {
      fail(err, 'Failed to set password');
    } finally {
      setResetting(false);
    }
  };

  const pendingUsers = users.filter((u) => u.pending_approval).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const sortedUsers = users.filter((u) => !u.pending_approval)
    .sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0) || (a.username || '').localeCompare(b.username || ''));
  const inboxCount = pendingUsers.length + requests.length;

  // ── Season ─────────────────────────────────────────────────────────────────
  const [season, setSeason] = useState(null);
  const [weekOverride, setWeekOverride] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncWeek, setSyncWeek] = useState('');
  const [gamesWeek, setGamesWeek] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [edits, setEdits] = useState({}); // game_id -> {spread, favorite_team_id, home_score, away_score}
  const [gameFilter, setGameFilter] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);

  const sendTest = async () => {
    setTestingEmail(true);
    try { const r = await adminAPI.testEmail(); flash(r.sent, r.message); } catch (err) { fail(err, 'Test failed'); } finally { setTestingEmail(false); }
  };
  const copyShare = async () => {
    try { await navigator.clipboard.writeText(season.share_url); flash(true, 'Share link copied'); } catch { window.prompt('Copy this link:', season.share_url); }
  };
  const rotateShare = async () => {
    if (!window.confirm('Rotate the public standings link? The old link will stop working.')) return;
    try { await adminAPI.rotateShare(); flash(true, 'New share link created'); fetchSeason(); } catch (err) { fail(err, 'Failed to rotate'); }
  };
  const shownGames = games.filter((g) => !gameFilter || `${g.short_name} ${g.home_name} ${g.away_name}`.toLowerCase().includes(gameFilter.toLowerCase()));

  const fetchSeason = useCallback(async () => {
    try {
      const s = await adminAPI.getSeason();
      setSeason(s);
      setWeekOverride(s.week_override ?? '');
      setGamesWeek((w) => w ?? s.current_week);
    } catch (err) {
      fail(err, 'Failed to load season');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchGames = useCallback(async () => {
    if (gamesWeek == null) return;
    try {
      setLoadingGames(true);
      const [b, p] = await Promise.all([boardAPI.getWeek(gamesWeek), adminAPI.getPicks(gamesWeek)]);
      setGames(b.games);
      setPicks(p);
      setEdits({});
    } catch (err) {
      fail(err, 'Failed to load games');
    } finally {
      setLoadingGames(false);
    }
  }, [gamesWeek]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (tab === 'season') fetchSeason(); }, [tab, fetchSeason]);
  useEffect(() => { if (tab === 'season') fetchGames(); }, [tab, fetchGames]);

  const saveOverride = async () => {
    try {
      const r = await adminAPI.updateSeason({ week_override: weekOverride === '' ? null : Number(weekOverride) });
      flash(true, `Board now shows week ${r.current_week}`);
      fetchSeason();
    } catch (err) { fail(err, 'Failed to save'); }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const r = await adminAPI.sync(syncWeek === '' ? undefined : Number(syncWeek));
      const list = Array.isArray(r) ? r : [r];
      flash(list.every((x) => x.success), list.map((x) => x.message).join(' · '));
      fetchSeason();
      fetchGames();
    } catch (err) { fail(err, 'Sync failed'); } finally { setSyncing(false); }
  };

  const edit = (g, field, value) => setEdits((e) => ({ ...e, [g.game_id]: { ...e[g.game_id], [field]: value } }));
  const val = (g, field, fallback) => edits[g.game_id]?.[field] ?? fallback ?? '';

  const saveSpread = async (g) => {
    const spread = Number(val(g, 'spread', g.spread));
    const fav = val(g, 'favorite_team_id', g.favorite_team_id) || null;
    if (Number.isNaN(spread) || (spread > 0 && !fav)) return flash(false, 'Enter a spread and pick the favorite');
    try { await adminAPI.setSpread(g.game_id, spread, fav); flash(true, `Line saved for ${g.short_name}`); fetchGames(); } catch (err) { fail(err, 'Failed to save line'); }
  };

  const saveResult = async (g) => {
    const h = Number(val(g, 'home_score', g.home_score)), a = Number(val(g, 'away_score', g.away_score));
    if (Number.isNaN(h) || Number.isNaN(a) || val(g, 'home_score', g.home_score) === '' || val(g, 'away_score', g.away_score) === '') return flash(false, 'Enter both scores');
    if (!window.confirm(`Mark ${g.short_name} FINAL at ${g.away_abbr} ${a} – ${g.home_abbr} ${h}?`)) return;
    try { const r = await adminAPI.setResult(g.game_id, h, a); flash(true, r.message); fetchGames(); } catch (err) { fail(err, 'Failed to save result'); }
  };

  const removePick = async (p) => {
    if (!window.confirm(`Remove ${p.user_name}'s week ${p.week} pick (${p.team_abbr})?`)) return;
    try { await adminAPI.deletePick(p.pick_id); flash(true, 'Pick removed'); fetchGames(); } catch (err) { fail(err, 'Failed to remove pick'); }
  };

  const alerts = (<><Alert className="mb-5">{error}</Alert>{success && <Alert type="success" className="mb-5">{success}</Alert>}</>);

  const tabs = [
    { value: 'users', label: 'Users', icon: Users, badge: inboxCount },
    { value: 'season', label: 'Season & Games', icon: Calendar },
  ];

  return (
    <Page eyebrow="Admin" icon={Shield} title="Admin" subtitle="Approve players, fix lines, enter scores, keep the board honest." width="max-w-7xl">
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button key={t.value} onClick={() => { setTab(t.value); setError(''); setSuccess(''); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${tab === t.value ? 'bg-dog-navy text-white shadow-[0_4px_14px_rgba(22,38,74,0.22)]' : 'bg-white/60 border border-glass text-text-secondary hover:text-dog-navy'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
            {t.badge > 0 && <span className="ml-0.5 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-dog-orange text-white text-[11px] font-bold">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <>
          {alerts}

          {!loadingUsers && (pendingUsers.length > 0 || requests.length > 0) && (
            <div className="card mb-6 border-2 border-dog-gold/50">
              <div className="flex items-center gap-2 mb-1">
                <Inbox className="h-5 w-5 text-text-gold" />
                <h2 className="font-display text-2xl font-bold text-text-primary">Needs you</h2>
                <span className="min-w-[1.5rem] h-6 px-2 inline-flex items-center justify-center rounded-full bg-dog-orange text-white text-xs font-bold">{inboxCount}</span>
              </div>
              <p className="text-sm text-text-muted mb-4">New registrations and password-reset requests.</p>
              <div className="divide-y divide-black/[0.06]">
                {pendingUsers.map((u) => (
                  <div key={u.user_id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="shrink-0 h-10 w-10 bg-navy-gradient rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md"><UserPlus className="h-4 w-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">{u.username} <span className="badge badge-gold ml-1">New player</span></div>
                      <div className="text-sm text-text-body truncate">{u.email}</div>
                      <div className="text-xs text-text-muted">Requested {u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => userAction(() => adminAPI.approveUser(u.user_id), `${u.username} approved — they can log in`)} className={BTN_GREEN}><Check className="h-3.5 w-3.5" /> Approve</button>
                      <button onClick={() => window.confirm(`Deny ${u.username}? Their registration will be deleted.`) && userAction(() => adminAPI.denyUser(u.user_id), `${u.username} denied`)} className={BTN_RED}><X className="h-3.5 w-3.5" /> Deny</button>
                    </div>
                  </div>
                ))}
                {requests.map((r) => (
                  <div key={r.token} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="shrink-0 h-10 w-10 bg-dog-orange/15 text-text-orange rounded-full flex items-center justify-center"><KeyRound className="h-4 w-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">{r.username || r.email} <span className="badge badge-navy ml-1">Password reset</span></div>
                      <div className="text-sm text-text-body truncate">{r.email}</div>
                      <div className="text-xs text-text-muted">Asked {new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setResetTarget({ kind: 'request', token: r.token, label: r.username || r.email }); setResetPwd(''); }} className={BTN_GREEN}><KeyRound className="h-3.5 w-3.5" /> Set temp password</button>
                      <button onClick={() => userAction(() => adminAPI.dismissResetRequest(r.token), 'Request dismissed')} className={BTN_NAVY}><X className="h-3.5 w-3.5" /> Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {[
              { label: 'Total Users', value: users.length, icon: Users },
              { label: 'Active', value: users.filter((u) => u.is_active).length, icon: CheckCircle },
              { label: 'Admins', value: users.filter((u) => u.is_admin).length, icon: Shield },
              { label: 'Temp Password', value: users.filter((u) => u.must_change_password).length, icon: KeyRound },
            ].map((s) => (
              <div key={s.label} className="stat-card">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-dog-navy/10 hidden sm:block"><s.icon className="h-5 w-5 text-dog-navy" /></div>
                  <div>
                    <p className="text-[11px] text-text-muted font-bold uppercase tracking-wide mb-0.5">{s.label}</p>
                    <p className="font-display text-3xl font-bold text-text-primary leading-none">{s.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-dog-navy" />
              <h2 className="font-display text-2xl font-bold text-text-primary">Players</h2>
            </div>
            {loadingUsers ? <Spinner label="Loading users…" /> : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b-2 border-glass">
                      {['Player', 'Email', 'Status', 'Role', 'Actions'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {sortedUsers.map((u, i) => (
                      <Fragment key={u.user_id}>
                        {!u.is_active && (i === 0 || sortedUsers[i - 1].is_active) && (
                          <tr><td colSpan={5} className="pt-6 pb-2 px-4"><div className="flex items-center gap-3"><span className="text-xs font-bold uppercase tracking-widest text-text-muted whitespace-nowrap">Deactivated · no access</span><div className="flex-1 border-t-2 border-glass" /></div></td></tr>
                        )}
                        <tr className={`transition-colors ${u.is_active ? 'hover:bg-white/40' : 'opacity-60 hover:opacity-100 hover:bg-white/40'}`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="shrink-0 h-9 w-9 bg-navy-gradient rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">{initials(u.username)}</div>
                              <div className="text-sm font-semibold text-text-primary">{u.username}{u.nickname ? <span className="text-text-muted font-normal"> "{u.nickname}"</span> : null}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-text-body">{u.email}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className={`badge ${u.is_active ? 'badge-upset' : 'badge-loss'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                              {u.must_change_password && <span className="badge badge-gold" title="On a temporary password">Temp PW</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap"><span className={`badge ${u.is_owner ? 'badge-gold' : u.is_admin ? 'badge-navy' : 'badge-muted'}`}>{u.is_owner ? 'Owner' : u.is_admin ? 'Admin' : 'Player'}</span></td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button onClick={() => userAction(() => adminAPI.toggleActiveStatus(u.user_id), 'Status updated')} disabled={u.is_owner || u.user_id === me.user_id} title={u.is_active ? 'Deactivate' : 'Activate'} className={u.is_active ? BTN_RED : BTN_GREEN}>
                                {u.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}<span className="hidden md:inline">{u.is_active ? 'Deactivate' : 'Activate'}</span>
                              </button>
                              <button onClick={() => userAction(() => adminAPI.toggleAdminStatus(u.user_id), 'Role updated')} disabled={u.is_owner || u.user_id === me.user_id} title={u.is_admin ? 'Remove admin' : 'Make admin'} className={u.is_admin ? BTN_NAVY : BTN_GOLD}>
                                {u.is_admin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}<span className="hidden md:inline">{u.is_admin ? 'Remove Admin' : 'Make Admin'}</span>
                              </button>
                              {(!u.is_owner || me.is_owner) && u.user_id !== me.user_id && (
                                <button onClick={() => { setResetTarget({ kind: 'user', user_id: u.user_id, label: u.username }); setResetPwd(''); }} title="Set a temporary password" className={BTN_NAVY}>
                                  <KeyRound className="h-3.5 w-3.5" /><span className="hidden md:inline">Reset</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'season' && (
        <>
          {alerts}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-dog-navy" />
                <h2 className="font-display text-2xl font-bold text-text-primary">{season ? `${season.season} Season` : 'Season'}</h2>
              </div>
              {season && (
                <dl className="space-y-2 text-sm mb-5">
                  {[
                    ['Season starts', `Week ${season.first_week}`],
                    ['Board week', `Week ${season.current_week}${season.week_override ? ' (pinned)' : ' (calendar)'}`],
                    ['Weeks loaded', season.weeks.length],
                    ['Last ESPN sync', season.last_sync ? new Date(season.last_sync).toLocaleString() : 'never'],
                    ['Auto-sync', season.scheduler.running ? `running · next ${season.scheduler.jobs[0]?.next_run ? new Date(season.scheduler.jobs[0].next_run).toLocaleTimeString() : '—'}` : 'stopped'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between px-4 py-2.5 bg-white/50 rounded-xl"><dt className="text-text-muted font-medium">{k}</dt><dd className="font-semibold text-text-primary">{v}</dd></div>
                  ))}
                </dl>
              )}
              <label className="block text-sm font-semibold text-text-secondary mb-2">Pin the board to a week</label>
              <div className="flex gap-2">
                <select value={weekOverride} onChange={(e) => setWeekOverride(e.target.value)} className="input-field">
                  <option value="">Follow the calendar</option>
                  {(season?.weeks || []).map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}
                </select>
                <button onClick={saveOverride} className="btn-primary !py-2"><Save className="h-4 w-4" /> Save</button>
              </div>
              <p className="mt-2 text-xs text-text-muted">Useful for testing, or if ESPN's calendar rolls over at an awkward time.</p>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <RefreshCw className="h-5 w-5 text-dog-navy" />
                <h2 className="font-display text-2xl font-bold text-text-primary">Sync from ESPN</h2>
              </div>
              <p className="text-sm text-text-body mb-4">Runs automatically every 10 minutes for this week and next. Trigger it by hand to pull fresh lines or scores now, or to load a specific week.</p>
              <div className="flex gap-2">
                <select value={syncWeek} onChange={(e) => setSyncWeek(e.target.value)} className="input-field">
                  <option value="">This week + next</option>
                  {(season?.weeks || []).map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}
                </select>
                <button onClick={runSync} disabled={syncing} className="btn-dog !py-2"><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync now'}</button>
              </div>
              <button onClick={async () => { try { const r = await adminAPI.resolvePicks(); flash(true, r.message); fetchGames(); } catch (err) { fail(err, 'Failed'); } }} className="btn-outline !py-2 mt-3 text-sm">
                Re-settle every pick on final games
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Mail className="h-5 w-5 text-dog-navy" />
                <h2 className="font-display text-2xl font-bold text-text-primary">Email</h2>
                {season && <span className={`badge ${season.email?.configured ? 'badge-upset' : 'badge-muted'}`}>{season.email?.configured ? 'On' : 'Off'}</span>}
              </div>
              {season?.email?.configured ? (
                <p className="text-sm text-text-body mb-4">Sending as <span className="font-semibold">{season.email.from}</span> via {season.email.host}. Reminders go out {season.email.reminder_hours.split(',').map((h) => `${h.trim()}h`).join(' and ')} before the week's first kickoff to anyone without a pick; result emails when a dog settles. {season.email.sent} sent so far.</p>
              ) : (
                <p className="text-sm text-text-body mb-4">Not configured. Set <code className="font-mono-data text-xs">SMTP_HOST</code>, <code className="font-mono-data text-xs">SMTP_FROM</code>, <code className="font-mono-data text-xs">SMTP_USER</code> and <code className="font-mono-data text-xs">SMTP_PASSWORD</code> in <code className="font-mono-data text-xs">backend/.env</code> and restart. A Gmail app password works.</p>
              )}
              <button onClick={sendTest} disabled={testingEmail} className="btn-secondary !py-2"><Mail className="h-4 w-4" /> {testingEmail ? 'Sending…' : 'Send me a test email'}</button>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-5 w-5 text-dog-navy" />
                <h2 className="font-display text-2xl font-bold text-text-primary">Public standings link</h2>
              </div>
              <p className="text-sm text-text-body mb-3">Read-only, no login. Paste it in the group chat. Picks stay hidden until kickoff, same as in the app.</p>
              {season?.share_url && <div className="font-mono-data text-xs bg-white/70 border border-glass rounded-lg px-3 py-2 mb-3 break-all">{season.share_url}</div>}
              <div className="flex gap-2">
                <button onClick={copyShare} className="btn-primary !py-2"><Link2 className="h-4 w-4" /> Copy link</button>
                <button onClick={rotateShare} className="btn-outline !py-2">Rotate</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-dog-navy" />
                <h2 className="font-display text-2xl font-bold text-text-primary">Games</h2>
              </div>
              <div className="flex items-center gap-2">
                <input type="search" value={gameFilter} onChange={(e) => setGameFilter(e.target.value)} placeholder="Filter teams…" className="input-field !w-40 !py-2" />
                <select value={gamesWeek ?? ''} onChange={(e) => setGamesWeek(Number(e.target.value))} className="input-field !w-auto !py-2 font-semibold">
                  {(season?.weeks || []).map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}
                </select>
                <button onClick={fetchGames} disabled={loadingGames} className="btn-secondary !py-2 !px-3"><RefreshCw className={`h-4 w-4 ${loadingGames ? 'animate-spin' : ''}`} /></button>
              </div>
            </div>
            <p className="text-sm text-text-muted mb-4">Edit a line to override ESPN (it sticks). Enter both scores to mark a game final by hand — picks on it re-settle immediately.</p>
            {loadingGames ? <Spinner label="Loading games…" /> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-glass">
                      {['Game', 'Kickoff', 'Line', 'Score', 'Picks', ''].map((h, i) => <th key={i} className="px-3 py-2 text-left text-xs font-bold text-text-muted uppercase tracking-wider">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {shownGames.map((g) => {
                      const gp = picks.filter((p) => p.game_id === g.game_id);
                      return (
                        <tr key={g.game_id} className="hover:bg-white/40 align-top">
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="font-semibold text-text-primary">{g.away_abbr} @ {g.home_abbr}</div>
                            <div className="text-xs text-text-muted">{g.status === 'in' ? <span className="text-text-orange font-semibold">● {g.status_detail}</span> : g.status === 'post' ? 'Final' : g.status === 'canceled' ? <span className="text-result-loss font-semibold">{g.status_detail || 'Postponed'}</span> : 'Scheduled'}{g.spread_source === 'manual' && <span className="badge badge-gold ml-1.5 !text-[9px]">manual line</span>}</div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-text-body">{fmtKickoff(g.kickoff)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <select value={val(g, 'favorite_team_id', g.favorite_team_id)} onChange={(e) => edit(g, 'favorite_team_id', e.target.value)} className="input-field !w-auto !py-1 !px-2 !text-xs" disabled={g.kicked_off}>
                                <option value="">— fav —</option>
                                <option value={g.away_team_id}>{g.away_abbr}</option>
                                <option value={g.home_team_id}>{g.home_abbr}</option>
                              </select>
                              <input type="number" step="0.5" min="0" value={val(g, 'spread', g.spread)} onChange={(e) => edit(g, 'spread', e.target.value)} className="input-field !w-20 !py-1 !px-2 !text-xs font-mono-data" placeholder="pts" disabled={g.kicked_off} />
                              {!g.kicked_off && edits[g.game_id] && (edits[g.game_id].spread != null || edits[g.game_id].favorite_team_id != null) && (
                                <button onClick={() => saveSpread(g)} className={BTN_GREEN} title="Save line"><Save className="h-3.5 w-3.5" /></button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <input type="number" min="0" value={val(g, 'away_score', g.away_score)} onChange={(e) => edit(g, 'away_score', e.target.value)} className="input-field !w-16 !py-1 !px-2 !text-xs font-mono-data" placeholder={g.away_abbr} />
                              <span className="text-text-dim">–</span>
                              <input type="number" min="0" value={val(g, 'home_score', g.home_score)} onChange={(e) => edit(g, 'home_score', e.target.value)} className="input-field !w-16 !py-1 !px-2 !text-xs font-mono-data" placeholder={g.home_abbr} />
                              {edits[g.game_id] && (edits[g.game_id].home_score != null || edits[g.game_id].away_score != null) && (
                                <button onClick={() => saveResult(g)} className={BTN_GREEN} title="Save as final"><Save className="h-3.5 w-3.5" /> Final</button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {gp.length === 0 ? <span className="text-text-dim">—</span> : (
                              <div className="flex flex-col gap-1">
                                {gp.map((p) => (
                                  <span key={p.pick_id} className="inline-flex items-center gap-1.5 text-xs">
                                    <span className="font-semibold text-text-primary">{p.user_name}</span>
                                    <span className="font-mono-data text-text-orange">{p.team_abbr} {fmtSpread(p.locked_spread)}</span>
                                    {p.result && <span className={`badge badge-${p.result} !text-[9px] !px-1.5 !py-0`}>{p.result}</span>}
                                    <button onClick={() => removePick(p)} className="text-text-dim hover:text-result-loss" title="Remove pick"><Trash2 className="h-3.5 w-3.5" /></button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {games.length === 0 && <p className="text-center text-text-muted py-8">No games loaded for this week. Run a sync.</p>}
                {games.length > 0 && shownGames.length === 0 && <p className="text-center text-text-muted py-8">No games match "{gameFilter}".</p>}
              </div>
            )}
          </div>
        </>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dog-darknavy/50 backdrop-blur-sm animate-fade-in" onClick={() => setResetTarget(null)}>
          <div className="w-full max-w-md bg-surface-overlay rounded-2xl p-7 border border-dog-gold/50 shadow-[0_28px_80px_-12px_rgba(22,38,74,0.55)] animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1"><KeyRound className="h-5 w-5 text-text-gold" /><h3 className="font-display text-2xl font-bold text-text-primary">Temporary password</h3></div>
            <p className="text-text-muted text-sm mb-4">Set a temporary password for <span className="font-semibold text-text-secondary">{resetTarget.label}</span>. Send it to them — they'll be forced to choose their own at next login.</p>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Temporary password</label>
            <input type="text" className="input-field" placeholder="At least 8 characters" value={resetPwd} autoFocus onChange={(e) => setResetPwd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleReset(); }} />
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn-outline !py-2" onClick={() => setResetTarget(null)} disabled={resetting}>Cancel</button>
              <button className="btn-primary !py-2" onClick={handleReset} disabled={resetting || resetPwd.length < 8}>{resetting ? 'Saving…' : (<><KeyRound className="h-4 w-4" /> Set password</>)}</button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
};

export default AdminSettings;

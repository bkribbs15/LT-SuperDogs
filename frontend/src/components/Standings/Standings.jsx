import { useEffect, useMemo, useState } from 'react';
import { Trophy, Target, Zap, RefreshCw, ChevronDown, Lock, Crown, Share2, Check } from 'lucide-react';
import Page from '../Layout/Page';
import { standingsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import TeamMark from '../common/TeamMark';
import ResultBadge from '../common/ResultBadge';
import Spinner from '../common/Spinner';
import Alert from '../common/Alert';
import { fmtSpread, fmtKickoff, fmtPoints, ordinal, rankedName, DEFAULT_RULES } from '../../utils/format';

const Standings = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('season'); // season | week
  const [week, setWeek] = useState(null);
  const [open, setOpen] = useState(new Set());
  const [copied, setCopied] = useState(false);

  const share = async () => {
    try {
      const { url } = await standingsAPI.share();
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        window.prompt('Copy this link:', url);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not create a share link');
    }
  };

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      const d = await standingsAPI.get(season);
      setData(d);
      if (!season) setSeason(d.season);
      if (week == null) setWeek(d.current_week || (d.weeks.at(-1)?.week ?? 1));
      if (!silent) setOpen(new Set([user.user_id]));
      setError('');
    } catch (err) {
      setError('Failed to load standings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [season]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => load(true), 60000);
    return () => clearInterval(id);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const rows = data?.standings || [];
  const me = rows.find((e) => e.user_id === user.user_id);
  const leader = rows[0];
  const behind = me && leader ? Math.round((leader.points - me.points) * 2) / 2 : null;
  const rules = data?.rules || DEFAULT_RULES;

  const stats = [
    { icon: Trophy, label: `Place${rows.length ? ` of ${rows.length}` : ''}`, value: me ? `${me.tied ? 'T' : ''}${ordinal(me.rank)}` : '—' },
    { icon: Zap, label: 'Points', value: me ? fmtPoints(me.points) : '—' },
    { icon: Target, label: 'Pts Behind', value: me ? (behind === 0 ? 'Leading' : fmtPoints(behind)) : '—' },
  ];

  const weekPicks = useMemo(() => {
    if (!data || week == null) return [];
    return rows.map((e) => ({ user: e, pick: e.picks.find((p) => p.week === week) || null }))
      .sort((a, b) => (a.user.name || '').localeCompare(b.user.name || ''));
  }, [data, rows, week]);

  const pos = (rank, tied) => {
    const text = `${tied ? 'T' : ''}${rank}`;
    if (rank === 1) return { text, tile: 'bg-dog-gold text-dog-darknavy' };
    if (rank === 2) return { text, tile: 'bg-[#D8D8D8] text-[#3a3a3a]' };
    if (rank === 3) return { text, tile: 'bg-[#C9925E] text-white' };
    return { text, tile: 'bg-dog-navy/10 text-dog-navy' };
  };

  const actions = data && (
    <div className="flex items-center gap-2">
      {data.seasons.length > 1 && (
        <select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="input-field !w-auto !py-2 font-semibold">
          {data.seasons.map((s) => <option key={s} value={s}>{s} Season</option>)}
        </select>
      )}
      <button onClick={share} className="btn-secondary !py-2" title="Copy a read-only link for the group chat">
        {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Share2 className="h-4 w-4" /> Share</>}
      </button>
      <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary !py-2 !px-3" aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
    </div>
  );

  return (
    <Page eyebrow={data ? `${data.season} Season` : 'Standings'} icon={Trophy} title="Standings" subtitle="Most points takes the year. Outright upsets break ties." actions={actions}>
      <Alert className="mb-4">{error}</Alert>

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-dog-navy/10 hidden sm:block"><s.icon className="h-5 w-5 text-dog-navy" /></div>
              <div className="min-w-0">
                <p className="text-[11px] text-text-muted font-bold uppercase tracking-wide mb-0.5 truncate">{s.label}</p>
                <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary truncate">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {[{ v: 'season', l: 'Season' }, { v: 'week', l: 'By week' }].map((t) => (
          <button key={t.v} onClick={() => setView(t.v)}
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all ${view === t.v ? 'bg-dog-navy text-white shadow-[0_4px_14px_rgba(22,38,74,0.22)]' : 'bg-white/60 border border-glass text-text-secondary hover:text-dog-navy'}`}>
            {t.l}
          </button>
        ))}
        {view === 'week' && data && (
          <select value={week ?? ''} onChange={(e) => setWeek(Number(e.target.value))} className="input-field !w-auto !py-2 font-semibold ml-auto">
            {data.weeks.map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <Spinner label="Reading the board…" />
      ) : rows.length === 0 ? (
        <div className="card text-center py-14">
          <Trophy className="h-12 w-12 text-text-dim mx-auto mb-3" />
          <h3 className="font-display text-2xl font-bold text-text-primary mb-1">Empty board</h3>
          <p className="text-text-muted">Nobody's been approved yet.</p>
        </div>
      ) : view === 'season' ? (
        <div className="board">
          <div className="board-head flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3">
            <span className="w-9 sm:w-10 text-center">Pos</span>
            <span className="flex-1">Player · tap for picks</span>
            <span className="w-14 text-center hidden sm:block">Record</span>
            <span className="w-12 text-center hidden sm:block" title="Outright upsets">Upsets</span>
            <span className="w-16 text-right">Points</span>
            <span className="w-4" />
          </div>
          {rows.map((e) => {
            const p = pos(e.rank, e.tied);
            const isOpen = open.has(e.user_id);
            const mine = e.user_id === user.user_id;
            return (
              <div key={e.user_id} className={`board-row ${mine ? 'board-you' : ''}`}>
                <button type="button" onClick={() => toggle(e.user_id)} aria-expanded={isOpen} className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 text-left">
                  <div className={`board-num shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-bold ${p.tile}`}>{p.text}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text-primary">{e.nickname || e.name}</span>
                      {e.rank === 1 && e.wins > 0 && <Crown className="h-4 w-4 text-dog-gold" />}
                      {mine && <span className="shrink-0 px-1.5 py-0.5 bg-dog-gold text-dog-darknavy text-[10px] font-bold rounded uppercase tracking-wide">You</span>}
                    </div>
                    <div className="text-xs text-text-muted">
                      {e.nickname && <span>{e.name} · </span>}
                      <span className="sm:hidden font-mono-data">{e.record} · </span>
                      {e.picks_made} pick{e.picks_made === 1 ? '' : 's'}{e.pending ? ` · ${e.pending} pending` : ''}{e.upsets ? ` · ${e.upsets} upset${e.upsets === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  <span className="board-num w-14 text-center hidden sm:block text-text-secondary">{e.record}</span>
                  <span className="board-num w-12 text-center hidden sm:block text-text-orange font-bold">{e.upsets}</span>
                  <span className="board-num w-16 text-right text-xl font-bold text-text-primary">{fmtPoints(e.points)}</span>
                  <ChevronDown className={`shrink-0 h-4 w-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-4 sm:px-6 pb-4 pl-[3.25rem] sm:pl-[4.5rem]">
                    {e.picks.length === 0 ? (
                      <p className="text-sm text-text-muted">No picks yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {e.picks.map((pk) => <PickChip key={pk.pick_id} pick={pk} />)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="board">
          <div className="board-head flex items-center gap-3 px-4 sm:px-6 py-3">
            <span className="flex-1">Player</span>
            <span className="flex-[2]">Week {week} SuperDog</span>
            <span className="w-28 text-right">Result · Pts</span>
          </div>
          {weekPicks.map(({ user: u, pick }) => (
            <div key={u.user_id} className={`board-row flex items-center gap-3 px-4 sm:px-6 py-3 ${u.user_id === user.user_id ? 'board-you' : ''}`}>
              <div className="flex-1 min-w-0 font-semibold text-text-primary truncate">{u.nickname || u.name}</div>
              <div className="flex-[2] min-w-0">
                {!pick ? (
                  <span className="text-sm text-text-dim">No pick</span>
                ) : pick.hidden ? (
                  <span className="text-sm text-text-muted flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Locked in · revealed at kickoff</span>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamMark logo={pick.team_logo} abbr={pick.team_abbr} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">{rankedName(pick.team_rank, pick.team_name)} <span className="font-mono-data text-text-orange">{fmtSpread(pick.locked_spread)}</span></div>
                      <div className="text-xs text-text-muted truncate">
                        {pick.side === 'home' ? 'vs' : 'at'} {pick.opponent_abbr}
                        {pick.team_score != null ? ` · ${pick.team_score}–${pick.opponent_score}` : ` · ${fmtKickoff(pick.kickoff)}`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="w-28 flex justify-end">{pick && !pick.hidden && <ResultBadge result={pick.result} gameStatus={pick.game_status} points={pick.points} />}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-text-muted">
        <span className="flex items-center gap-2"><span className="badge badge-upset">Upset</span> won outright · {fmtPoints(rules.cover_points)} + the spread</span>
        <span className="flex items-center gap-2"><span className="badge badge-cover">Covered</span> lost by less than the spread · {fmtPoints(rules.cover_points)}</span>
        <span className="flex items-center gap-2"><span className="badge badge-push">Push</span> lost by exactly the spread · {fmtPoints(rules.push_points)}</span>
        <span className="flex items-center gap-2"><span className="badge badge-loss">Loss</span> didn't cover · 0</span>
        <span className="flex items-center gap-2 text-text-dim">min spread +{rules.min_spread}</span>
      </div>
    </Page>
  );
};

const PickChip = ({ pick: pk }) => {
  const tone = pk.result === 'upset' ? 'border-result-upset/40 bg-result-upset/8'
    : pk.result === 'cover' ? 'border-result-cover/40 bg-result-cover/8'
    : pk.result === 'loss' ? 'border-result-loss/35 bg-result-loss/6 opacity-80'
    : 'border-glass bg-white/60';
  return (
    <span className={`inline-flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg border text-sm ${tone}`} title={pk.hidden ? 'Revealed at kickoff' : `${pk.team_name} ${fmtSpread(pk.locked_spread)}`}>
      <span className="font-mono-data text-[11px] text-text-dim">W{pk.week}</span>
      {pk.hidden ? (
        <span className="flex items-center gap-1 text-text-muted"><Lock className="h-3 w-3" /> Locked in</span>
      ) : (
        <>
          <TeamMark logo={pk.team_logo} abbr={pk.team_abbr} size="sm" />
          <span className="font-semibold text-text-primary">{pk.team_abbr} <span className="font-mono-data text-text-orange">{fmtSpread(pk.locked_spread)}</span></span>
          {pk.team_score != null && <span className="font-mono-data text-xs text-text-muted">{pk.team_score}–{pk.opponent_score}</span>}
        </>
      )}
      {!pk.hidden && <ResultBadge result={pk.result} gameStatus={pk.game_status} points={pk.points} className="!text-[9px] !px-1.5 !py-0.5" />}
    </span>
  );
};

export default Standings;

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ClipboardList, RefreshCw, Lock, Check, X, Tv, Clock, Dog, ChevronLeft, ChevronRight } from 'lucide-react';
import Page from '../Layout/Page';
import { boardAPI, picksAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import TeamMark from '../common/TeamMark';
import Countdown from '../common/Countdown';
import Alert from '../common/Alert';
import Spinner from '../common/Spinner';
import { fmtSpread, fmtKickoff, rankedName } from '../../utils/format';

const FILTERS = [
  { value: 'available', label: 'Available' },
  { value: 'all', label: 'All games' },
  { value: 'taken', label: 'Taken' },
  { value: 'live', label: 'Live & Final' },
];

const dayKey = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

const WeeklyBoard = () => {
  const { week: weekParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('available');
  const [busy, setBusy] = useState(null); // game_id being picked

  const load = useCallback(async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      const data = weekParam ? await boardAPI.getWeek(Number(weekParam)) : await boardAPI.getCurrent();
      setBoard(data);
      if (!silent) setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load the board');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [weekParam]);

  useEffect(() => { load(); }, [load]);

  // Live scores move — refresh quietly every minute
  useEffect(() => {
    const id = setInterval(() => load(true), 60000);
    return () => clearInterval(id);
  }, [load]);

  const isCurrentWeek = board && board.week === board.current_week;
  const isPastWeek = board && board.week < board.current_week;

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 4000); };

  const takeDog = async (game) => {
    setBusy(game.game_id);
    setError('');
    try {
      const p = await picksAPI.makePick(game.game_id, game.underdog_team_id);
      flash(`${p.team_name} ${fmtSpread(p.locked_spread)} is your Week ${p.week} SuperDog.`);
      await load(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not make that pick');
      await load(true);
    } finally {
      setBusy(null);
    }
  };

  const dropDog = async () => {
    if (!window.confirm('Remove your pick for this week?')) return;
    setBusy('drop');
    try {
      await picksAPI.dropPick();
      flash('Pick removed.');
      await load(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not remove your pick');
    } finally {
      setBusy(null);
    }
  };

  const games = board?.games || [];
  const counts = useMemo(() => ({
    available: games.filter((g) => g.pickable && !g.taken).length,
    all: games.length,
    taken: games.filter((g) => g.taken).length,
    live: games.filter((g) => g.status !== 'pre').length,
  }), [games]);

  const visible = useMemo(() => {
    let list = games;
    if (filter === 'available') list = games.filter((g) => (g.pickable && !g.taken) || g.is_mine);
    else if (filter === 'taken') list = games.filter((g) => g.taken);
    else if (filter === 'live') list = games.filter((g) => g.status !== 'pre');
    const groups = new Map();
    for (const g of list) {
      const k = g.kickoff ? dayKey(g.kickoff) : 'TBD';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(g);
    }
    return [...groups.entries()];
  }, [games, filter]);

  const myPick = board?.my_pick;
  const weeks = board?.weeks || [];
  const goWeek = (w) => navigate(w === board.current_week ? '/board' : `/board/${w}`);

  const Header = board && (
    <div className="flex items-center gap-2">
      <button onClick={() => goWeek(board.week - 1)} disabled={!weeks.some((w) => w.week === board.week - 1)} className="btn-outline !px-2.5 !py-2" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
      <select value={board.week} onChange={(e) => goWeek(Number(e.target.value))} className="input-field !w-auto !py-2 font-semibold">
        {weeks.map((w) => <option key={w.week} value={w.week}>{w.label}{w.week === board.current_week ? ' · current' : ''}</option>)}
      </select>
      <button onClick={() => goWeek(board.week + 1)} disabled={!weeks.some((w) => w.week === board.week + 1)} className="btn-outline !px-2.5 !py-2" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
      <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary !py-2 !px-3" aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
    </div>
  );

  return (
    <Page
      eyebrow={board ? `${board.season} Season` : 'The Board'}
      icon={ClipboardList}
      title={board ? `Week ${board.week} Board` : 'The Board'}
      subtitle={board ? `${board.picks_in} pick${board.picks_in === 1 ? '' : 's'} in · lines refresh every 10 min · times shown in your local zone` : ''}
      actions={Header}
    >
      <Alert className="mb-4">{error}</Alert>
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}

      {/* My pick banner */}
      {board && isCurrentWeek && (
        <div className={`mb-6 rounded-2xl border p-4 sm:p-5 flex items-center gap-4 flex-wrap ${myPick ? 'bg-dog-navy text-white border-transparent shadow-[0_12px_36px_rgba(22,38,74,0.30)]' : 'bg-white/70 border-glass'}`}>
          {myPick ? (
            <>
              <TeamMark logo={myPick.team_logo} abbr={myPick.team_abbr} size="lg" className="bg-white rounded-xl p-1" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/70">Your SuperDog</div>
                <div className="font-display text-2xl sm:text-3xl font-bold leading-tight truncate">
                  {rankedName(myPick.team_rank, myPick.team_name)} <span className="text-dog-orange">{fmtSpread(myPick.locked_spread)}</span>
                </div>
                <div className="text-sm text-white/75 truncate">{myPick.side === 'home' ? 'vs' : 'at'} {rankedName(myPick.opponent_rank, myPick.opponent_name)} · {fmtKickoff(myPick.kickoff)}</div>
              </div>
              {myPick.kicked_off ? (
                <span className="badge bg-white/15 text-white border border-white/25"><Lock className="h-3 w-3" /> Locked</span>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/75 hidden sm:flex items-center gap-1.5"><Clock className="h-4 w-4" /> <Countdown to={myPick.kickoff} className="text-white font-semibold" /></span>
                  <button onClick={dropDog} disabled={busy === 'drop'} className="btn-outline !border-white/30 !text-white hover:!bg-white/10 !py-2"><X className="h-4 w-4" /> Drop</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="p-2.5 rounded-xl bg-dog-orange/12"><Dog className="h-6 w-6 text-text-orange" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-2xl font-bold text-text-primary leading-tight">No dog yet</div>
                <div className="text-sm text-text-muted">Take one below. You can switch until your game kicks off.</div>
              </div>
              {board.first_kickoff && (
                <div className="text-sm text-text-muted flex items-center gap-1.5"><Clock className="h-4 w-4 text-text-orange" /> First kick <Countdown to={board.first_kickoff} done="underway" className="font-semibold text-text-primary" /></div>
              )}
            </>
          )}
        </div>
      )}

      {board && !isCurrentWeek && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-white/60 border border-glass text-sm text-text-muted flex items-center gap-2 flex-wrap">
          <Lock className="h-4 w-4" /> {isPastWeek ? 'This week is in the books — picks are closed.' : 'This week isn\'t open yet. Picks open when the calendar rolls over.'}
          <Link to="/board" className="ml-auto font-semibold text-dog-navy hover:text-dog-orange">Back to this week →</Link>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`shrink-0 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${filter === f.value ? 'bg-dog-navy text-white shadow-[0_4px_14px_rgba(22,38,74,0.22)]' : 'bg-white/60 border border-glass text-text-secondary hover:text-dog-navy'}`}>
            {f.label} <span className={`ml-1 font-mono-data text-xs ${filter === f.value ? 'text-white/70' : 'text-text-dim'}`}>{counts[f.value]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Reading the lines…" />
      ) : visible.length === 0 ? (
        <div className="card text-center py-14">
          <Dog className="h-12 w-12 text-text-dim mx-auto mb-3" />
          <h3 className="font-display text-2xl font-bold text-text-primary mb-1">Nothing here</h3>
          <p className="text-text-muted">{games.length === 0 ? 'No games loaded for this week yet — lines usually post early in the week.' : 'Try another filter.'}</p>
        </div>
      ) : (
        <div className="space-y-7">
          {visible.map(([day, list]) => (
            <section key={day}>
              <h2 className="font-display text-xl font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-3">
                {day} <span className="flex-1 border-t border-glass" />
              </h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {list.map((g) => (
                  <GameCard key={g.game_id} game={g} canPick={isCurrentWeek} hasPick={!!myPick} busy={busy === g.game_id} onPick={() => takeDog(g)} userId={user.user_id} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
};

const TeamRow = ({ side, game, isDog }) => {
  const name = game[`${side}_name`], abbr = game[`${side}_abbr`], rank = game[`${side}_rank`], score = game[`${side}_score`];
  const won = game.status === 'post' && game.home_score != null && game.away_score != null &&
    (side === 'home' ? game.home_score > game.away_score : game.away_score > game.home_score);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <TeamMark logo={game[`${side}_logo`]} abbr={abbr} color={game[`${side}_color`]} />
      <div className="flex-1 min-w-0">
        <div className={`font-semibold truncate ${isDog ? 'text-text-primary' : 'text-text-secondary'}`}>
          {rank && <span className="text-text-muted font-mono-data text-xs mr-1">#{rank}</span>}
          {name}
          {isDog && <span className="ml-2 badge badge-navy !py-0 !px-1.5 !text-[9px]">Dog</span>}
        </div>
        <div className="text-xs text-text-dim">{side === 'home' ? 'Home' : 'Away'}</div>
      </div>
      {score != null && <span className={`board-num text-xl ${won ? 'text-text-primary' : 'text-text-dim'}`}>{score}</span>}
    </div>
  );
};

const GameCard = ({ game: g, canPick, hasPick, busy, onPick }) => {
  const dogSide = g.underdog_team_id === g.home_team_id ? 'home' : g.underdog_team_id === g.away_team_id ? 'away' : null;
  const dogAbbr = dogSide ? g[`${dogSide}_abbr`] : null;
  const noLine = !dogSide;

  let action;
  if (g.is_mine) {
    action = <span className="badge badge-upset !py-1.5 !px-3 !text-[11px]"><Check className="h-3.5 w-3.5" /> Your dog</span>;
  } else if (noLine) {
    action = <span className="badge badge-muted !py-1.5 !px-3 !text-[11px]">{g.spread === 0 ? "Pick'em" : 'No line yet'}</span>;
  } else if (g.taken) {
    action = <span className="badge badge-muted !py-1.5 !px-3 !text-[11px]" title={g.taken_by ? `Taken by ${g.taken_by}` : 'Taken'}>{g.taken_by ? `${g.taken_by.split(' ')[0]} has ${dogAbbr}` : `${dogAbbr} taken`}</span>;
  } else if (g.kicked_off) {
    action = <span className="badge badge-muted !py-1.5 !px-3 !text-[11px]"><Lock className="h-3 w-3" /> Kicked off</span>;
  } else if (canPick) {
    action = (
      <button onClick={onPick} disabled={busy} className="btn-dog !py-2 !px-4 text-sm">
        {busy ? '…' : `${hasPick ? 'Switch to' : 'Take'} ${dogAbbr} ${fmtSpread(g.spread)}`}
      </button>
    );
  }

  const statusLine = g.status === 'in'
    ? <span className="flex items-center gap-1.5 text-text-orange font-semibold"><span className="live-dot" /> {g.status_detail || 'Live'}</span>
    : g.status === 'post'
      ? <span className="font-semibold text-text-muted">{g.status_detail || 'Final'}</span>
      : <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {fmtKickoff(g.kickoff)}</span>;

  return (
    <div className={`game-card p-4 ${g.is_mine ? 'game-card--mine' : ''} ${g.taken && !g.is_mine && g.status === 'pre' ? 'game-card--locked' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-xs text-text-muted flex items-center gap-3 flex-wrap">
          {statusLine}
          {g.broadcast && <span className="flex items-center gap-1"><Tv className="h-3.5 w-3.5" /> {g.broadcast}</span>}
        </div>
        {dogSide && (
          <span className={`spread-chip ${g.is_mine ? 'spread-chip--dog' : ''}`} title={`${dogAbbr} getting ${g.spread}`}>{dogAbbr} {fmtSpread(g.spread)}</span>
        )}
      </div>
      <div className="space-y-2.5">
        <TeamRow side="away" game={g} isDog={dogSide === 'away'} />
        <TeamRow side="home" game={g} isDog={dogSide === 'home'} />
      </div>
      <div className="mt-3 pt-3 border-t border-glass flex items-center justify-between gap-3">
        <span className="text-xs text-text-dim truncate">{g.venue || ''}{g.spread_source === 'manual' ? ' · line set by admin' : ''}</span>
        {action}
      </div>
    </div>
  );
};

export default WeeklyBoard;

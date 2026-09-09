import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, Crown, ChevronDown } from 'lucide-react';
import { publicAPI } from '../../services/api';
import { PawMark } from '../common/Brand';
import Spinner from '../common/Spinner';
import TeamMark from '../common/TeamMark';
import ResultBadge from '../common/ResultBadge';
import { fmtPoints, fmtSpread } from '../../utils/format';

/** Login-free standings behind a share token. Picks stay hidden until kickoff. */
const PublicStandings = () => {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(new Set());

  const load = () => publicAPI.standings(token).then(setData).catch((e) => setError(e.response?.data?.detail || 'This link isn\'t valid.'));
  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pos = (rank, tied) => rank === 1 ? 'bg-dog-gold text-dog-darknavy' : rank === 2 ? 'bg-[#D8D8D8] text-[#3a3a3a]' : rank === 3 ? 'bg-[#C9925E] text-white' : 'bg-dog-navy/10 text-dog-navy';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/75 backdrop-blur-xl border-b border-glass">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <PawMark className="w-10 h-10 rounded-xl" />
            <div className="leading-tight">
              <div className="font-display font-extrabold text-2xl uppercase tracking-wide text-dog-navy">LT SuperDogs</div>
              <div className="text-[10px] text-text-orange font-bold tracking-[0.2em] uppercase">{data ? `${data.season} standings` : 'Standings'}</div>
            </div>
          </div>
          <Link to="/login" className="btn-outline !py-1.5 text-sm">Sign in</Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {error ? (
          <div className="card text-center py-14"><h2 className="font-display text-3xl font-bold text-text-primary mb-2">Dead link</h2><p className="text-text-muted">{error}</p></div>
        ) : !data ? <Spinner label="Reading the board…" /> : (
          <>
            <div className="mb-5">
              <h1 className="font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-wide text-text-primary">Standings</h1>
              <p className="text-text-body">Week {data.current_week} · most points takes the year · updates every minute</p>
            </div>
            <div className="board">
              <div className="board-head flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3">
                <span className="w-9 sm:w-10 text-center">Pos</span>
                <span className="flex-1">Player</span>
                <span className="w-14 text-center hidden sm:block">Record</span>
                <span className="w-16 text-right">Points</span>
                <span className="w-4" />
              </div>
              {data.standings.map((e) => {
                const isOpen = open.has(e.user_id);
                return (
                  <div key={e.user_id} className="board-row">
                    <button type="button" onClick={() => toggle(e.user_id)} aria-expanded={isOpen} className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 text-left">
                      <div className={`board-num shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-bold ${pos(e.rank, e.tied)}`}>{e.tied ? 'T' : ''}{e.rank}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2"><span className="font-semibold text-text-primary truncate">{e.nickname || e.name}</span>{e.rank === 1 && e.points > 0 && <Crown className="h-4 w-4 text-dog-gold" />}</div>
                        <div className="text-xs text-text-muted"><span className="sm:hidden font-mono-data">{e.record} · </span>{e.upsets} upset{e.upsets === 1 ? '' : 's'}{e.pending ? ` · ${e.pending} pending` : ''}</div>
                      </div>
                      <span className="board-num w-14 text-center hidden sm:block text-text-secondary">{e.record}</span>
                      <span className="board-num w-16 text-right text-xl font-bold text-text-primary">{fmtPoints(e.points)}</span>
                      <ChevronDown className={`shrink-0 h-4 w-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-4 sm:px-6 pb-4 pl-[3.25rem] sm:pl-[4.5rem] flex flex-wrap gap-2">
                        {e.picks.length === 0 ? <span className="text-sm text-text-muted">No picks yet.</span> : e.picks.map((pk) => (
                          <span key={pk.pick_id} className="inline-flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg border border-glass bg-white/60 text-sm">
                            <span className="font-mono-data text-[11px] text-text-dim">W{pk.week}</span>
                            {pk.hidden ? <span className="flex items-center gap-1 text-text-muted"><Lock className="h-3 w-3" /> Locked in</span> : (
                              <><TeamMark logo={pk.team_logo} abbr={pk.team_abbr} size="sm" /><span className="font-semibold text-text-primary">{pk.team_abbr} <span className="font-mono-data text-text-orange">{fmtSpread(pk.locked_spread)}</span></span><ResultBadge result={pk.result} gameStatus={pk.game_status} points={pk.points} className="!text-[9px] !px-1.5 !py-0.5" /></>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-center text-sm text-text-muted">One underdog a week · cover = 5 · outright win = 5 + the spread · push = 1</p>
          </>
        )}
      </div>
    </div>
  );
};

export default PublicStandings;

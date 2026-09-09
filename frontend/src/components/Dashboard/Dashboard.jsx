import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { boardAPI, standingsAPI, picksAPI } from '../../services/api';
import { Trophy, Target, Zap, Users, ArrowRight, Dog, Clock, Lock, Flag, Crown, Radio, Flame, Newspaper } from 'lucide-react';
import Page from '../Layout/Page';
import TeamMark from '../common/TeamMark';
import Countdown from '../common/Countdown';
import ResultBadge from '../common/ResultBadge';
import { fmtSpread, fmtKickoff, fmtPoints, ordinal, rankedName, initials, DEFAULT_RULES } from '../../utils/format';

const rulesList = (r) => [
  `Every week, pick one game and take the point-spread underdog — the SuperDog. Minimum spread is +${r.min_spread}.`,
  `Cover the spread and score ${r.cover_points} points.`,
  `Win outright and score ${r.cover_points} plus the spread — a +10.5 dog that wins is worth ${r.cover_points + 10.5}.`,
  `Lose by exactly the spread and it's a push, worth ${r.push_points} point. A loss is 0.`,
  'First to lock in a dog owns it. Nobody else can take the same team that week.',
  'Picks lock at kickoff. Switch as often as you like before then.',
  'Most points at the end of the regular season takes the title. Outright upsets break ties.',
];

const Dashboard = () => {
  const { user } = useAuth();
  const [board, setBoard] = useState(null);
  const [table, setTable] = useState(null);
  const [weekPicks, setWeekPicks] = useState([]);
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [b, t] = await Promise.all([boardAPI.getCurrent(), standingsAPI.get()]);
      setBoard(b);
      setTable(t);
      picksAPI.getWeek(b.week).then(setWeekPicks).catch(() => {});
      standingsAPI.recap().then((r) => setRecap(r.recap)).catch(() => {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);   // scores move on Saturdays
    return () => clearInterval(id);
  }, []);

  // Everyone's dog this week: live first, then finals, then still-to-kick
  const order = { in: 0, post: 1, pre: 2, canceled: 3 };
  const dogs = [...weekPicks].sort((a, b) => (order[a.game_status] ?? 9) - (order[b.game_status] ?? 9) || (a.kickoff || '').localeCompare(b.kickoff || ''));
  const inPlay = dogs.filter((p) => p.game_status === 'in').length;
  const avgSpread = dogs.length ? Math.round((dogs.reduce((s, p) => s + (p.locked_spread || 0), 0) / dogs.length) * 10) / 10 : null;
  const biggestDog = dogs.filter((p) => !p.hidden).sort((a, b) => b.locked_spread - a.locked_spread)[0];

  const me = table?.standings.find((e) => e.user_id === user.user_id);
  const pick = board?.my_pick;
  const players = table?.standings.length || 0;
  const leader = table?.standings[0];
  const rules = board?.rules || table?.rules || DEFAULT_RULES;
  const RULES = rulesList(rules);

  const stats = [
    { icon: Zap, label: 'Your Points', value: me ? fmtPoints(me.points) : '0', accent: 'orange' },
    { icon: Trophy, label: 'Your Place', value: me ? `${me.tied ? 'T' : ''}${ordinal(me.rank)}` : '—', accent: 'gold' },
    { icon: Target, label: 'Your Record', value: me ? me.record : '0-0', accent: 'navy' },
    { icon: Users, label: 'Picks In', value: board ? `${board.picks_in}/${players}` : '—', accent: 'navy' },
  ];
  const accent = {
    navy: 'bg-dog-navy/10 text-dog-navy',
    gold: 'bg-dog-gold/20 text-text-gold',
    orange: 'bg-dog-orange/12 text-text-orange',
  };

  return (
    <Page>
      <header className="mb-8 animate-fade-in">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/60 border border-glass rounded-full mb-4">
          <Flag className="h-3.5 w-3.5 text-text-orange" strokeWidth={2.5} />
          <span className="text-[11px] font-bold text-text-orange tracking-[0.18em] uppercase">
            {board ? `${board.season} Season · Week ${board.week}` : 'Loading…'}
          </span>
        </div>
        <h1 className="font-display text-5xl sm:text-6xl font-extrabold uppercase tracking-wide text-text-primary leading-none mb-3">
          Who's got<br className="sm:hidden" /> <span className="text-gradient-orange">the dog?</span>
        </h1>
        <p className="text-lg text-text-body max-w-xl">
          Welcome back, {user?.nickname || user?.display_name?.split(' ')[0] || user?.username}. One underdog a week. Most points takes the year.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className={`inline-flex p-2 rounded-xl mb-2.5 ${accent[s.accent]}`}><s.icon className="h-5 w-5" /></div>
            <p className="text-[11px] text-text-muted font-bold uppercase tracking-wide mb-0.5">{s.label}</p>
            <p className="font-display text-3xl font-bold text-text-primary leading-none">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        {/* This week's pick */}
        <div className="glass-card lg:col-span-3 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-dog-orange/12"><Dog className="h-5 w-5 text-text-orange" /></div>
              <h3 className="font-display text-2xl font-bold text-text-primary">Your Week {board?.week} SuperDog</h3>
            </div>
            {pick && (pick.kicked_off
              ? <span className="badge badge-navy"><Lock className="h-3 w-3" /> Locked</span>
              : <span className="badge badge-upset">Locked in</span>)}
          </div>

          {loading ? (
            <p className="text-text-muted py-6">Checking the board…</p>
          ) : pick ? (
            <>
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/70 border border-glass">
                <TeamMark logo={pick.team_logo} abbr={pick.team_abbr} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="font-display text-2xl sm:text-3xl font-bold text-text-primary leading-tight truncate">
                    {rankedName(pick.team_rank, pick.team_name)}
                  </div>
                  <div className="text-text-muted text-sm truncate">
                    {pick.side === 'home' ? 'vs' : 'at'} {rankedName(pick.opponent_rank, pick.opponent_name)} · {fmtKickoff(pick.kickoff)}
                  </div>
                </div>
                <span className="spread-chip spread-chip--dog text-lg">{fmtSpread(pick.locked_spread)}</span>
              </div>

              <div className="mt-auto pt-4 flex items-center justify-between gap-3 flex-wrap">
                {pick.game_status === 'canceled' ? (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <span className="badge badge-loss">Postponed</span> Your game was called off — grab another dog before kickoff.
                  </div>
                ) : pick.result || pick.game_status !== 'pre' ? (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <ResultBadge result={pick.result} gameStatus={pick.game_status} points={pick.points} />
                    {pick.team_score != null && <span className="font-mono-data">{pick.team_abbr} {pick.team_score} – {pick.opponent_abbr} {pick.opponent_score}</span>}
                    {pick.status_detail && pick.game_status === 'in' && <span>{pick.status_detail}</span>}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-text-muted flex-wrap">
                    <Clock className="h-4 w-4 text-text-orange" /> Locks in <Countdown to={pick.kickoff} className="font-semibold text-text-primary" />
                    <span className="text-text-dim">· worth {fmtPoints(rules.cover_points)} on a cover, {fmtPoints(rules.cover_points + pick.locked_spread)} outright</span>
                  </div>
                )}
                {!pick.kicked_off && <Link to="/board" className={pick.game_status === 'canceled' ? 'btn-dog !py-2' : 'btn-outline !py-2'}>{pick.game_status === 'canceled' ? 'Pick another dog' : 'Change pick'}</Link>}
              </div>
            </>
          ) : (
            <>
              <p className="text-text-body mb-5 flex-1">
                No dog yet. {board?.games?.length ? `${board.games.filter((g) => g.pickable && !g.taken).length} underdogs are still on the board.` : 'The board is loading lines.'}
              </p>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Link to="/board" className="btn-dog">Pick your dog <ArrowRight className="h-4 w-4" /></Link>
                {board?.next_kickoff && (
                  <div className="text-sm text-text-muted flex items-center gap-2">
                    <Clock className="h-4 w-4 text-text-orange" /> Next kickoff in <Countdown to={board.next_kickoff} done="underway" className="font-semibold text-text-primary" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Standings snapshot */}
        <div className="card lg:col-span-2 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-xl bg-dog-gold/20"><Crown className="h-5 w-5 text-text-gold" /></div>
            <h3 className="font-display text-2xl font-bold text-text-primary">Standings</h3>
          </div>
          {loading ? (
            <p className="text-text-muted">Loading…</p>
          ) : !table?.standings.length ? (
            <p className="text-text-muted">Nobody's on the board yet.</p>
          ) : (
            <ol className="space-y-1.5 flex-1">
              {table.standings.slice(0, 6).map((e) => (
                <li key={e.user_id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${e.user_id === user.user_id ? 'bg-dog-gold/15' : 'bg-white/50'}`}>
                  <span className={`board-num w-7 h-7 rounded-lg flex items-center justify-center text-sm ${e.rank === 1 ? 'bg-dog-gold text-dog-darknavy' : 'bg-dog-navy/10 text-dog-navy'}`}>
                    {e.tied ? 'T' : ''}{e.rank}
                  </span>
                  <span className="flex-1 truncate font-semibold text-text-primary">{e.nickname || e.name}</span>
                  <span className="text-xs text-text-muted font-mono-data hidden sm:inline">{e.record}</span>
                  <span className="board-num text-text-primary">{fmtPoints(e.points)}<span className="text-[10px] text-text-dim ml-0.5">pts</span></span>
                </li>
              ))}
            </ol>
          )}
          <Link to="/standings" className="btn-secondary self-start mt-5">Full standings <ArrowRight className="h-4 w-4" /></Link>
          {leader && <p className="mt-3 text-xs text-text-muted">{fmtPoints(leader.points)} pts leads · {leader.record} · {leader.upsets} outright upset{leader.upsets === 1 ? '' : 's'}</p>}
        </div>
      </div>

      {dogs.length > 0 && (
        <div className="card mb-8">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-dog-orange/12 rounded-xl"><Radio className="h-5 w-5 text-text-orange" /></div>
              <h3 className="font-display text-2xl font-bold text-text-primary">Week {board?.week} dogs</h3>
            </div>
            <span className="text-sm text-text-muted flex items-center gap-x-3 gap-y-1 flex-wrap">
              {inPlay > 0 ? <span className="inline-flex items-center gap-1.5 text-text-orange font-semibold"><span className="live-dot" /> {inPlay} in play</span> : <span>{dogs.length} locked in</span>}
              {avgSpread != null && <span>· avg <span className="font-mono-data text-text-orange">{fmtSpread(avgSpread)}</span></span>}
              {biggestDog && <span>· biggest dog <span className="font-semibold text-text-primary">{biggestDog.team_abbr}</span> <span className="font-mono-data text-text-orange">{fmtSpread(biggestDog.locked_spread)}</span></span>}
            </span>
          </div>
          <ul className="divide-y divide-black/[0.06]">
            {dogs.map((p) => (
              <li key={p.pick_id} className={`flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 py-2.5 ${p.user_id === user.user_id ? 'bg-dog-gold/10 -mx-2 px-2 rounded-lg' : ''}`}>
                <div className="flex items-center gap-2 w-full sm:w-44 shrink-0 min-w-0">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-navy-gradient rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0">{initials(p.user_name)}</div>
                  <div className="font-semibold text-text-primary truncate">{p.user_name}</div>
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2 pl-9 sm:pl-0">
                  {p.hidden ? (
                    <span className="text-sm text-text-muted flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Locked in</span>
                  ) : (
                    <>
                      <TeamMark logo={p.team_logo} abbr={p.team_abbr} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{p.team_abbr} <span className="font-mono-data text-text-orange">{fmtSpread(p.locked_spread)}</span> <span className="text-text-muted font-normal">{p.side === 'home' ? 'vs' : 'at'} {p.opponent_abbr}</span></div>
                        <div className="text-xs text-text-muted truncate">
                          {p.game_status === 'in' && <span className="text-text-orange font-semibold">● {p.status_detail} · </span>}
                          {p.team_score != null ? <span className="font-mono-data">{p.team_abbr} {p.team_score} – {p.opponent_abbr} {p.opponent_score}</span> : fmtKickoff(p.kickoff)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {!p.hidden && <ResultBadge result={p.result} gameStatus={p.game_status} points={p.points} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recap && (
        <div className="card mb-8">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-dog-gold/20 rounded-xl"><Newspaper className="h-5 w-5 text-text-gold" /></div>
              <h3 className="font-display text-2xl font-bold text-text-primary">Week {recap.week} recap</h3>
            </div>
            <span className="text-sm text-text-muted">
              {recap.picks} dogs · {recap.upsets} upset{recap.upsets === 1 ? '' : 's'} · {recap.covers} cover{recap.covers === 1 ? '' : 's'} · {recap.losses} loss{recap.losses === 1 ? '' : 'es'}{recap.pushes ? ` · ${recap.pushes} push` : ''} · {fmtPoints(recap.points)} pts scored
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-dog-gold/10 border border-dog-gold/40">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-gold mb-2 flex items-center gap-1.5"><Crown className="h-3.5 w-3.5" /> Dog of the week</div>
              <div className="flex items-center gap-3">
                <TeamMark logo={recap.dog_of_week.team_logo} abbr={recap.dog_of_week.team_abbr} />
                <div className="min-w-0">
                  <div className="font-display text-2xl font-bold text-text-primary leading-tight truncate">{recap.dog_of_week.user_name}</div>
                  <div className="text-sm text-text-muted truncate">{recap.dog_of_week.team_abbr} <span className="font-mono-data text-text-orange">{fmtSpread(recap.dog_of_week.locked_spread)}</span> · <span className="font-mono-data">{recap.dog_of_week.team_score}–{recap.dog_of_week.opponent_score}</span> {recap.dog_of_week.opponent_abbr}</div>
                </div>
                <span className="ml-auto font-display text-3xl font-bold text-text-primary">{fmtPoints(recap.dog_of_week.points)}</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white/60 border border-glass">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-text-orange" /> Biggest upset</div>
              {recap.biggest_upset ? (
                <div className="flex items-center gap-3">
                  <TeamMark logo={recap.biggest_upset.team_logo} abbr={recap.biggest_upset.team_abbr} />
                  <div className="min-w-0">
                    <div className="font-display text-2xl font-bold text-text-primary leading-tight truncate">{recap.biggest_upset.team_name}</div>
                    <div className="text-sm text-text-muted truncate">beat {recap.biggest_upset.opponent_abbr} as a <span className="font-mono-data text-text-orange">{fmtSpread(recap.biggest_upset.locked_spread)}</span> dog · {recap.biggest_upset.user_name}</div>
                  </div>
                </div>
              ) : <p className="text-text-muted">The favorites all held on. Nobody won outright.</p>}
            </div>
            <div className="p-4 rounded-xl bg-white/60 border border-glass">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5"><Flame className="h-3.5 w-3.5 text-text-orange" /> Hot streaks</div>
              {recap.hot_streaks.length ? (
                <ul className="space-y-1">
                  {recap.hot_streaks.map((s) => (
                    <li key={s.user_id} className="flex items-center justify-between"><span className="font-semibold text-text-primary">{s.user_name}</span><span className="font-mono-data text-text-orange">{s.streak} straight</span></li>
                  ))}
                </ul>
              ) : <p className="text-text-muted">No one's on a run of two or more yet.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-dog-navy/10 rounded-xl"><Flag className="h-5 w-5 text-dog-navy" strokeWidth={2.5} /></div>
          <h3 className="font-display text-2xl font-bold text-text-primary">How it works</h3>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3 bg-white/50 rounded-xl">
              <span className="shrink-0 w-6 h-6 bg-navy-gradient rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5">{i + 1}</span>
              <span className="text-text-body font-medium">{rule}</span>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
};

export default Dashboard;

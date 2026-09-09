import { useEffect, useState } from 'react';
import { History as HistoryIcon, Crown, Medal } from 'lucide-react';
import Page from '../Layout/Page';
import { standingsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../common/Spinner';
import Alert from '../common/Alert';
import { fmtPoints, initials } from '../../utils/format';

const PODIUM = [
  { tile: 'bg-dog-gold text-dog-darknavy', label: 'Champion', icon: Crown },
  { tile: 'bg-[#D8D8D8] text-[#3a3a3a]', label: 'Runner-up', icon: Medal },
  { tile: 'bg-[#C9925E] text-white', label: 'Third', icon: Medal },
];

const History = () => {
  const { user } = useAuth();
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    standingsAPI.history()
      .then(setSeasons)
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Page eyebrow="Trophy room" icon={HistoryIcon} title="Season History" subtitle="Every season's podium. The current one is still being written." width="max-w-4xl">
      <Alert className="mb-4">{error}</Alert>
      {loading ? <Spinner label="Opening the trophy room…" /> : (
        <div className="space-y-5">
          {seasons.map((s) => (
            <div key={s.season} className="card">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <h2 className="font-display text-3xl font-extrabold text-text-primary">{s.season} Season</h2>
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <span>{s.players} player{s.players === 1 ? '' : 's'} · {s.weeks_played} week{s.weeks_played === 1 ? '' : 's'} settled</span>
                  <span className={`badge ${s.complete ? 'badge-navy' : 'badge-live'}`}>{s.complete ? 'Final' : 'In progress'}</span>
                </div>
              </div>
              {s.podium.length === 0 ? (
                <p className="text-text-muted">No picks yet this season.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {s.podium.map((p, i) => {
                    const meta = PODIUM[Math.min(p.rank - 1, 2)];
                    return (
                      <div key={p.user_id} className={`p-4 rounded-xl border ${i === 0 ? 'bg-dog-gold/10 border-dog-gold/40' : 'bg-white/55 border-glass'} ${p.user_id === user.user_id ? 'ring-2 ring-dog-orange/40' : ''}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`board-num w-8 h-8 rounded-lg flex items-center justify-center font-bold ${meta.tile}`}>{p.tied ? 'T' : ''}{p.rank}</span>
                          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{s.complete ? meta.label : `${meta.label} (so far)`}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-navy-gradient rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">{initials(p.name)}</div>
                          <div className="min-w-0">
                            <div className="font-display text-xl font-bold text-text-primary truncate">{p.nickname || p.name}</div>
                            <div className="text-xs text-text-muted">{p.record} · {p.upsets} upset{p.upsets === 1 ? '' : 's'}</div>
                          </div>
                          <span className="ml-auto font-display text-3xl font-bold text-text-primary">{fmtPoints(p.points)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
};

export default History;

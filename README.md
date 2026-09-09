# LT SuperDogs

A College GameDay–style **SuperDog pick'em** for college football. Every week each
player takes one point-spread underdog of at least +4.5. Covers score 5, outright
upsets score 5 plus the spread, pushes score 1. Most points at the end of the
regular season takes the year.

Sister app to the [LT Masters Pool](../masters-pool) — same stack, same auth model.

## The rules (straight from the GameDay graphic)

1. **One SuperDog a week.** Pick any FBS game and take the underdog. **Minimum
   spread is +4.5** — smaller dogs aren't on the board.
2. **Cover the spread: 5 points.**
3. **Win outright: 5 points + the spread.** A +10.5 dog that wins is worth 15.5.
4. **Push (lose by exactly the spread): 1 point.** A loss is 0.
5. **No duplicate dogs.** First to lock a team in owns it for the week; everyone
   else has to find a different game.
6. **Picks lock at kickoff** of your game. Switch as often as you like before then.
7. **The spread you saw is the spread you get.** Lines move all week; yours freezes
   the moment you pick, and that's the number your points are computed from.
8. **Standings** rank by total points, then outright upsets, then wins. Picks stay
   hidden from other players until the game kicks off.
9. **Postponed or canceled game?** The pick is voided (0 points, not a loss) and
   the player can move to any dog that hasn't kicked off. If the game is
   rescheduled, the pick comes back and settles on the real result.

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 19, React Router 7, Tailwind v4, Vite |
| Backend | FastAPI (Python 3.12+), SQLite, JWT auth, APScheduler |
| Data | ESPN public college football scoreboard (games, lines, scores) |
| Deploy | Docker/Podman, nginx, Cloudflare Tunnel (like the Masters pool) |

The pool starts in **week 2** (`SEASON_FIRST_WEEK` in `backend/.env`). Earlier
weeks never appear on the board, and before week 2 opens on the calendar the
board already sits on week 2 so picks can go in early.

Lines and scores are synced from ESPN every 10 minutes (this week and next),
tightening to every 2 minutes while any game on the board is in play. ESPN
removes odds once a game is final, so the app persists each game's spread and
locks the spread onto each pick.

## Quick start (local dev)

Ports are offset from the Masters pool so both can run on the same machine:

| | Masters pool | SuperDogs |
|---|---|---|
| Dev backend | 8001 | **8101** |
| Dev frontend | 5173 | **5174** |
| Prod backend (host) | 8000 | **8100** |
| Prod frontend (host) | 8090 | **8190** |

### Backend

```bash
cd backend
python3 -m venv env && source env/bin/activate
pip install -r requirements.txt
cp .env.example .env         # set JWT_SECRET_KEY (openssl rand -hex 32), ADMIN_* etc.
uvicorn main:app --host 127.0.0.1 --port 8101 --reload
```

On first boot the schema is created, the admin user is created from `ADMIN_EMAIL`
/ `ADMIN_PASSWORD`, and the current + next week are pulled from ESPN.

### Frontend

```bash
cd frontend
npm install
npm run dev                  # http://localhost:5174 (talks to :8101)
```

### Tests

```bash
cd backend && python -m unittest discover -s tests -t . -v
```

## Admin

Log in as the admin (owner) and open **Admin**:

- **Users** — approve/deny registrations, deactivate, promote, issue temporary
  passwords (the user must change it at next login), handle reset requests.
- **Season & Games** — pin the board to a week, trigger an ESPN sync, override a
  spread by hand (sticks; picks on that game before kickoff take the new number),
  enter a final score by hand (re-settles picks), remove a stray pick.

## Deploy

`docker-compose.local.yml` publishes to the LAN for phone testing;
`docker-compose.prod.yml` publishes on host loopback for the Cloudflare tunnel.
Set `FRONTEND_URL`, `BACKEND_URL` and `DB_DATA_DIR` in the environment when
running the prod compose. See the comments at the top of each file.

### Pre-flight checklist

- [ ] `backend/.env`: real `JWT_SECRET_KEY` (`openssl rand -hex 32`). The API
      refuses to boot on the example placeholder.
- [ ] `backend/.env`: `ADMIN_EMAIL` is you, `ADMIN_PASSWORD` is not the default,
      and you change it again after first login.
- [ ] `DB_DATA_DIR` points at persistent storage (NAS mount), not the repo.
- [ ] Two tunnel hostnames: web → `localhost:8190`, API → `localhost:8100`.
      `FRONTEND_URL` = the web hostname, `BACKEND_URL` = the API hostname.
- [ ] Nightly `scripts/backup.sh <db> <backup-dir>` in cron/launchd. It uses
      SQLite's online backup, so it's safe while the app runs; keeps 30 copies.
- [ ] `curl https://<api-host>/health` shows `last_sync` within the last 10 min.

### What's already in place

- Rate limits on login/register/reset keyed by the Cloudflare client IP, not the
  tunnel's loopback address.
- Security headers on both the API and nginx; API responses are `no-store`.
- Container healthchecks + `restart: unless-stopped`; the ESPN job is
  single-instance with coalescing, so a slow fetch never piles up.
- Finals never un-final and hand-entered scores stick even if ESPN lags.
- The web app is installable to a phone home screen (manifest + icons).

## Project structure

```
backend/
  main.py                      FastAPI entry, CORS, admin bootstrap
  app/database.py              SQLite schema (users, games, picks, weeks, settings)
  app/services/
    cfb_data_service.py        ESPN scoreboard fetch + parse
    season_service.py          season/week logic + the scoring rule
    sync_service.py            upsert games, freeze spreads, settle picks
    pick_views.py              shared JSON shapes
  app/routers/
    auth.py  admin.py  board.py  picks.py  standings.py
  app/tasks/sync_scheduler.py  10-minute ESPN sync
  tests/test_scoring.py        rules safety net
frontend/src/
  components/Picks/WeeklyBoard.jsx     the weekly board + pick flow
  components/Standings/Standings.jsx   season table + by-week view
  components/Dashboard/Dashboard.jsx   your pick, countdown, snapshot
  components/Admin/AdminSettings.jsx   users + season/games tools
```

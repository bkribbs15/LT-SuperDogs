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

Lines and scores are synced from ESPN every 10 minutes (this week and next).
ESPN removes odds once a game is final, so the app persists each game's spread
and locks the spread onto each pick.

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

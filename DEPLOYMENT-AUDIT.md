# Pre-Deployment Readiness Audit

## Ready

**Health endpoint** — `/api/health` exists, returns 200, no auth required, no DB query. Simple and correct for Railway health checks.

**Logging** — All backend code uses `loguru` consistently. Zero `print()` statements. Session IDs are included in all relevant log messages. Log format is parseable.

**Session ID tracing** — Every log line in the pipeline includes `session_id`. Traceable end-to-end.

**Alembic reads DATABASE_URL from env** — Both offline and online migration modes use `os.getenv("DATABASE_URL")`. No hardcoded DB URL in `alembic.ini`.

**Recording storage handles missing directories** — `os.makedirs(recordings_dir, exist_ok=True)` + try/except. Won't crash if directory doesn't persist.

**Daily token separation** — Bot gets `owner=True`, student gets `owner=False`. Room expiry set to 1500s (25 min). Correct.

**No secrets in git history** — Checked `git log --all` for `.env` files. None ever committed.

**CORS reads from env** — `FRONTEND_URL` env var used for allowed origin. `allow_credentials=True` is correct for cookie-based auth.

**Site password gate** — Password page, httpOnly cookie, middleware protection on `/dev` and `/instructor`. Backend dev API also protected.

---

## Needs Small Fix

### 1. Backend Dockerfile — stale system deps (~10 min)
`backend/Dockerfile` installs `aiortc` dependencies (`libavformat-dev`, `libopus-dev`, `libvpx-dev`) for SmallWebRTCTransport which we removed. `daily-python` needs `glibc 2.28+` (Debian slim is fine) but doesn't need these media libs. Remove the stale `apt-get` block, add `libsndfile1` for audio processing.

Also: CMD should read `$PORT` from env for Railway: `CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]`

### 2. Frontend Dockerfile — no standalone output (~10 min)
`frontend/Dockerfile` does `npm run build` + `npm start` but doesn't use Next.js standalone output. For Docker:
- Add `next.config.js` with `output: 'standalone'`
- Change CMD to `node .next/standalone/server.js`
- This reduces image size from ~500MB to ~100MB

### 3. No `.dockerignore` files (~5 min)
Neither backend nor frontend have `.dockerignore`. Without them, Docker copies `.env`, `node_modules`, `__pycache__`, `recordings/`, `.next/` into the image. Create both:

**backend/.dockerignore:** `.env`, `__pycache__`, `*.pyc`, `.venv`, `recordings/`, `*.wav`
**frontend/.dockerignore:** `.env*`, `node_modules`, `.next`, `*.tsbuildinfo`

### 4. `.env.example` is stale (~10 min)
Root `.env.example` references TURN vars (removed), missing `DAILY_API_KEY`, `INWORLD_TTS_API_KEY`, `SITE_PASSWORD`. Create separate `.env.example` for each service with all required vars documented.

### 5. Hardcoded `localhost:3001` in CORS (~2 min)
`main.py:42` has `"http://localhost:3001"` hardcoded alongside the env-driven `FRONTEND_URL`. Should be removed or made configurable.

### 6. `--reload` in production CMD (~2 min)
`docker-compose.yml` uses `uvicorn main:app --reload` which is dev-only. The Dockerfile CMD doesn't have `--reload` (good), but confirm Railway uses the Dockerfile CMD, not the compose command.

### 7. No migration startup hook (~15 min)
No entrypoint script that runs `alembic upgrade head` before uvicorn starts. Create a `start.sh`:
```bash
#!/bin/bash
alembic upgrade head
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```
Add `pg_advisory_lock(1)` wrapper for multi-replica safety.

### 8. Inconsistent JWT_SECRET defaults (~5 min)
`api/deps.py` defaults to `"dev-secret-change-me"`, `api/dev.py` defaults to `"change-this-to-a-random-256-bit-secret"`. Should be the same default or (better) no default — fail loudly in production if not set.

### 9. No `next.config.js` exists (~5 min)
Frontend has no `next.config.js` at all. Need to create one with `output: 'standalone'` for Docker deployment.

### 10. Daily API error handling (~15 min)
`signaling.py` lines 77-96 have no try/except around `helper.create_room()` and `helper.get_token()`. If Daily API fails (auth error, rate limit, network), the endpoint crashes with an unhandled exception. Wrap in try/except, return a 503 with useful error message.

### 11. Pipeline top-level exception handling (~15 min)
`run_bot()` has no top-level try/except. If any initialization fails (DailyTransport, Deepgram, Gemini, Inworld), the background task crashes silently and the session stays "active" in the DB forever. Wrap in try/except, mark session as "error" status.

### 12. Recording TODO for S3/R2 (~2 min)
Add a clear TODO comment at the recording write site noting it needs to move to cloud storage before real verification use. `recording_storage.py` already has S3 code but it's not wired up.

---

## Needs Discussion

### A. PORT binding for Railway
Railway injects `PORT` as an env var. Backend Dockerfile CMD should use `${PORT:-8000}`. But the frontend also needs this — Next.js standalone listens on 3000 by default. Railway expects the app to listen on `PORT`. Frontend start command needs: `PORT=${PORT:-3000} node .next/standalone/server.js`.

### B. Database connection for Railway
Railway provides `DATABASE_URL` in a Postgres-standard format: `postgresql://user:pass@host:port/db`. But our code uses `postgresql+asyncpg://...` (SQLAlchemy async format). Options:
- Railway sets the var with the `+asyncpg` prefix (manual config)
- We transform the URL in code: `url.replace("postgresql://", "postgresql+asyncpg://")`
- We use a separate env var name and map it

### C. Frontend API URL at build time vs runtime
`NEXT_PUBLIC_API_URL` is baked into the Next.js build (it's a `NEXT_PUBLIC_` var). If we build the Docker image once and deploy to different environments, the API URL is frozen at build time. Options:
- Build per environment (simple, Railway does this naturally with GitHub integration)
- Use runtime env injection (more complex, requires custom server)

Railway rebuilds on every deploy from GitHub, so build-time is probably fine.

### D. Daily room cleanup
Daily rooms are created with 25-min expiry and `eject_at_room_exp=True`. But if the bot crashes, the Daily room persists until expiry. Daily charges per-minute per participant. Should we add a cleanup job that deletes orphaned rooms? For now at prototype scale, the 25-min expiry is probably sufficient — just something to monitor.

### E. CORS for production domain
Currently CORS allows `FRONTEND_URL` (one origin). In production with a custom domain (e.g., `https://app.argo.edu`), this is correct. But if we need both `www` and non-`www`, or staging + production, we'd need to allow multiple origins from env (comma-separated, split in code). Decide the domain structure first.

### F. Session recording on ephemeral filesystem
Railway containers have ephemeral filesystems. Recordings saved locally will be lost on redeploy. For the initial prototype this is acceptable (recordings are optional). But document this as a known limitation and plan for R2/S3 before any real verification use.

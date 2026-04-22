# Aver — AI Oral Assessment Platform

Voice-based dynamic oral assessment for education. Students have a 10–20 minute voice conversation with an AI assessor that adapts in real time.

## Quick Start (Development)

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- API keys: Google (Gemini), Anthropic (Claude), Deepgram

### 1. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env  # Fill in API keys
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. Test Voice Pipeline (Phase 1)
Navigate to `http://localhost:8000/prebuilt` for the Pipecat test UI.
This uses a hardcoded assessment prompt — no session plan or database needed.

### Docker Compose (Full Stack)
```bash
cp .env.example .env  # Fill in API keys
docker compose up
```

## Architecture

```
Browser (Next.js + Pipecat SDK)
  ↕ WebRTC (SmallWebRTCTransport, self-hosted)
Server (FastAPI + Pipecat pipeline)
  ├── Deepgram STT (streaming)
  ├── Rules Engine (ephemeral domain window)
  ├── Gemini 2.5 Flash (conversational agent)
  └── Claude Sonnet 4.6 (session plan compiler + profiler)
```

See the technical specification for full details.

## Build Phases

| Phase | Description |
|-------|-------------|
| 1 | Voice loop: Deepgram STT → Gemini Flash → text display |
| 2 | Rules engine: session plan navigation, domain window injection |
| 3 | Compiler: LOs + rubric → session plan (Claude Sonnet) |
| 4 | Instructor UI: LO entry → scaffold selection → rubric review → publish |
| 5 | Profiler: transcript → competency profile (Claude Sonnet) |
| 6 | Auth, persistence, dashboard |
| 7 | Recording, playback, session review |

## Key Documents
- `aver-mvp-requirements.md` — Product requirements
- `aver-technical-specification.md` — Technical spec
- `aver-implementation-notes.md` — Build notes & compatibility
- `exemplar-conversations.md` — Annotated assessment transcripts

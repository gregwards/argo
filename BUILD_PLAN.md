# Aver — Build Plan (Step-by-Step)

*Give this to Claude Code alongside CLAUDE_CODE_CONTEXT.md. Each phase is a discrete task with a clear "done when" condition.*

---

## Phase 1: Voice Loop ✅ (in progress)

**What:** `bot.py` connects browser mic → Deepgram STT → Gemini Flash → text response displayed in browser.

**Done when:** I can talk into the mic, see my speech transcribed, and see the AI respond with assessment questions about microeconomics.

**Files:** `backend/bot.py`, `backend/pipeline/prompts.py`, `backend/pipeline/evaluation_schema.py`

---

## Phase 2: Wire into FastAPI

**What:** Move the working pipeline from `bot.py` into `main.py` so the full FastAPI app serves both the API and voice sessions.

**Specific tasks:**
1. Fix the `/start` endpoint in `main.py` to work with the prebuilt UI's signaling protocol. `bot.py` uses `pipecat.runner.run.main` which handles this — look at what it does internally and replicate it in the FastAPI endpoint. Alternatively, mount Pipecat's runner alongside FastAPI.
2. The session runner (`pipeline/session_runner.py`) should be called from the signaling endpoint. Its `run_bot()` function takes a transport and session_id.
3. Test: `uvicorn main:app --reload`, open `/prebuilt`, voice loop works exactly as it did with `bot.py`.
4. The other API routes (`/api/assessments`, `/api/sessions`, etc.) should also work — they'll 500 on database calls which is fine for now.

**Done when:** `localhost:8000/prebuilt` has a working voice loop AND `localhost:8000/api/health` returns `{"status": "ok"}`.

**Files to modify:** `backend/main.py`, `backend/api/signaling.py`, `backend/pipeline/session_runner.py`

---

## Phase 3: Database + Auth

**What:** Connect to Postgres, create tables, wire up auth so we can create users and track sessions.

**Specific tasks:**
1. Uncomment `await init_db()` in `main.py` lifespan.
2. Verify the database models in `db/database.py` create tables correctly when the app starts. Postgres is running in Docker on `localhost:5432` (user: `aver`, password: `changeme`, db: `aver`).
3. Test the auth flow: `POST /api/auth/magic-link` with an email → get a token → `GET /api/auth/verify?token=xxx` → get a JWT.
4. Add a simple auth dependency that extracts the user from the JWT and use it on protected routes.

**Done when:** I can create a user via magic link, get a JWT, and use it to call protected endpoints.

**Files:** `backend/db/database.py`, `backend/api/auth.py`, `backend/main.py`

---

## Phase 4: Compiler (Rubric + Session Plan Generation)

**What:** When an instructor provides learning outcomes and a scaffold type, the system calls Claude Sonnet 4.6 to generate a rubric and compile a session plan.

**Specific tasks:**
1. The LLM adapter (`services/llm.py`) calls Claude Sonnet using the `anthropic` Python SDK. Model string: `claude-sonnet-4-6`. Uses `AsyncAnthropic` client.
2. The compiler (`compiler/compiler.py`) has two functions:
   - `generate_rubric(learning_outcomes, scaffold_type, additional_instructions)` — calls Claude with the rubric prompt, parses JSON response, returns rubric rows + coverage summary.
   - `compile_session_plan(learning_outcomes, rubric, scaffold_type, duration_target, additional_instructions)` — calls Claude with the session plan prompt, parses JSON response, returns the full session plan (nodes with domain packets, rubric descriptors, follow-up rules, phase assignments).
3. The prompts are in `compiler/prompts.py`. They instruct Claude to return JSON only.
4. Wire these into the assessment API (`api/assessments.py`):
   - `POST /api/assessments` creates the assessment with LOs
   - `POST /api/assessments/{id}/generate-rubric` calls `generate_rubric`, stores result
   - `POST /api/assessments/{id}/publish` calls `compile_session_plan`, stores result, sets status to published

**Test:** Use curl or the API directly:
```bash
# Create assessment
curl -X POST localhost:8000/api/assessments -H "Content-Type: application/json" -d '{
  "course_id": "test", "title": "Micro Econ Midterm", "scaffold_type": "competency_map",
  "duration_target_minutes": 15,
  "learning_outcomes": [
    {"text": "Explain causal mechanisms of supply and demand"},
    {"text": "Apply price elasticity concepts to real-world markets"}
  ]
}'

# Generate rubric (use the assessment ID from above)
curl -X POST localhost:8000/api/assessments/{id}/generate-rubric

# Publish (compiles session plan)
curl -X POST localhost:8000/api/assessments/{id}/publish
```

**Done when:** The publish endpoint returns a session plan with multiple nodes, each containing a domain packet, rubric descriptors, sample questions, and follow-up rules. Inspect the JSON — the domain packets should contain knowledge relevant to evaluating responses, NOT the answers themselves.

**Files:** `backend/services/llm.py`, `backend/compiler/compiler.py`, `backend/compiler/prompts.py`, `backend/api/assessments.py`

---

## Phase 5: Rules Engine Integration

**What:** The voice pipeline uses a compiled session plan instead of the hardcoded prompt. The rules engine manages phase transitions, domain window swapping, and belief model updates based on the LLM's `evaluate_response()` function calls.

**Specific tasks:**
1. Modify `pipeline/session_runner.py` to accept a session plan and pass it to the `RulesEngine`.
2. When a session plan is provided:
   - The `RulesEngine` builds the system prompt using the current node's data (question instructions, domain packet, rubric descriptors, belief model state) via `pipeline/prompts.py` `RUNTIME_SYSTEM_PROMPT`.
   - After each turn, the LLM's `evaluate_response()` function call is routed to `rules_engine.on_evaluation()`.
   - The rules engine updates the belief model, records the evaluation, and determines the next navigation action (advance, follow up, scaffold, end phase).
   - On the next turn, if navigation advanced to a new node, the system prompt is rebuilt with the new node's domain packet. The previous domain packet is gone — this is the ephemeral domain window.
3. The context manager (`pipeline/context_manager.py`) handles the domain window swap. The rules engine calls `ctx.set_current_node(node_id)` when advancing.
4. Modify the signaling endpoint to load the session plan from the database when a session starts, and pass it to the session runner.
5. At session end, save the session state (transcript, competency state, belief model, evaluation log, key moments) to the database.

**Test:** 
1. Create and publish an assessment via the API (Phase 4).
2. Start a session that references that assessment.
3. Have a conversation — the AI should follow the session plan, starting with orientation, moving through foundation probe, scaling, scenario, and synthesis.
4. Check the saved session state in the database — it should have a populated transcript, evaluation log, and belief model.

**Done when:** A full 5-phase assessment session runs from start to finish, driven by the compiled session plan, with all state saved to the database.

**Files:** `backend/pipeline/session_runner.py`, `backend/pipeline/rules_engine.py`, `backend/pipeline/context_manager.py`, `backend/pipeline/prompts.py`, `backend/api/signaling.py`

---

## Phase 6: Profiler

**What:** After a session completes, generate a competency profile from the transcript and accumulated state.

**Specific tasks:**
1. The profiler (`profiler/profiler.py`) calls Claude Sonnet with the full transcript, competency state, belief model, evaluation log, key moments, and rubric.
2. Claude returns a JSON competency profile: scores per dimension (1-5), narrative assessment, strengths, growth areas.
3. The profile is saved to the `competency_profiles` table.
4. Trigger profiling automatically when a session completes (in the session runner, after the pipeline finishes), or via an API endpoint `POST /api/sessions/{id}/generate-profile`.
5. The profile is retrievable via `GET /api/sessions/{id}/profile`.

**Test:** Complete a session, then fetch the profile. It should reference specific moments from the actual conversation.

**Done when:** A competency profile is generated and retrievable after each session.

**Files:** `backend/profiler/profiler.py`, `backend/profiler/prompts.py`, `backend/api/sessions.py`, `backend/pipeline/session_runner.py`

---

## Phase 7: Instructor Frontend

**What:** The Next.js frontend for instructors to create and configure assessments.

**Specific tasks:**
1. The page exists at `frontend/app/instructor/assessment/new/page.tsx`. It has a 3-step flow:
   - Step 1: Enter title + learning outcomes + optional additional instructions
   - Step 2: Select scaffold type (Competency Map or Socratic Exploration) + duration slider
   - Step 3: Review generated rubric (editable table) + coverage summary + publish button
2. Connect it to the backend API using `frontend/lib/api.ts`:
   - Step 2 "Generate Assessment" button → `POST /api/assessments` then `POST /api/assessments/{id}/generate-rubric`
   - Step 3 "Publish" button → `PUT /api/assessments/{id}/rubric` (save edits) then `POST /api/assessments/{id}/publish`
3. Show a loading state during rubric generation (takes a few seconds).
4. After publish, show the shareable student link.
5. Set up the Next.js frontend to run: `cd frontend && npm install && npm run dev`. It should proxy API calls to `localhost:8000`.

**Test:** Open `localhost:3000/instructor/assessment/new`, create an assessment with 3 LOs, generate rubric, review it, publish. The share link should point to a session page.

**Done when:** The full instructor flow works end-to-end in the browser.

**Files:** `frontend/app/instructor/assessment/new/page.tsx`, `frontend/lib/api.ts`, `frontend/package.json` (may need next.config.js for API proxy)

---

## Phase 8: Student Frontend

**What:** The student session page with live transcription + the competency profile view.

**Specific tasks:**
1. Session page (`frontend/app/assess/[sessionId]/page.tsx`):
   - Pre-session: mic permission check, equipment test with live transcription preview
   - Active session: transcript panel showing AI messages and student messages with live interim transcription (gray text that updates as they speak, replaced by final text when they pause)
   - Post-session: "Profile generating..." spinner, redirect to profile when ready
2. Connect to the backend via Pipecat's client SDK (`frontend/lib/pipecat.ts`):
   - Uses `@pipecat-ai/client-js` and `@pipecat-ai/small-webrtc-transport`
   - The signaling URL points to the backend's session offer endpoint
   - Listen for bot text events (AI responses) and user transcript events (interim + final)
3. Profile page (`frontend/app/student/profile/[sessionId]/page.tsx`):
   - Horizontal bar charts for competency dimensions
   - Narrative assessment text
   - Strengths and growth areas lists
4. The exact Pipecat client SDK event names for interim vs final transcription need to be verified — check the SDK docs or source.

**Test:** Navigate to a session URL, complete a short assessment, see the live transcription, then view the generated profile.

**Done when:** A student can complete an assessment end-to-end in the browser and see their competency profile.

**Files:** `frontend/app/assess/[sessionId]/page.tsx`, `frontend/app/student/profile/[sessionId]/page.tsx`, `frontend/lib/pipecat.ts`, `frontend/components/session/`

---

## Phase 9: Dashboard + Polish

**What:** Instructor dashboard showing aggregate results, session review page, and general polish.

**Specific tasks:**
1. Dashboard page (`frontend/app/instructor/assessment/[assessmentId]/page.tsx`):
   - Summary stats: sessions completed, avg duration, avg turns
   - Session table: student, status, turns, duration, flags, date
   - Click a row to view the full transcript + competency profile
2. Connect to dashboard API: `GET /api/dashboard/assessments/{id}/summary` and `GET /api/dashboard/assessments/{id}/sessions`
3. Session review page: side-by-side transcript + profile view for instructors
4. Polish: error handling, loading states, empty states, responsive layout

**Done when:** An instructor can see aggregate results for their assessment and drill into individual student sessions.

**Files:** `frontend/app/instructor/assessment/[assessmentId]/page.tsx`, `backend/api/dashboard.py`

---

## Notes for Claude Code

- **Commit after each phase.** Use descriptive commit messages.
- **Don't refactor code from previous phases** unless something is broken. Ship, then polish.
- **When something doesn't work,** read the installed Pipecat source code directly (`backend/.venv/lib/python3.12/site-packages/pipecat/`) — it's more reliable than guessing at APIs.
- **The evaluation function schema** needs to be in a format that Pipecat's GoogleLLMService accepts. This was a problem in Phase 1 — whatever format works there, use it consistently.
- **Test with curl** before testing in the browser. API issues are easier to debug without the frontend in the way.

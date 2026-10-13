# Changes in this patch — fixes 1, 2, 3, 4, 6, 7, 8

| # | Fix | Files |
|---|-----|-------|
| 1 | `google-genai` instead of `google-generativeai`; Gemini model moved to config (`GEMINI_MODEL`, default `gemini-2.5-flash`); SDK imported lazily so failure falls back to Qwen; `.env.example` restored; unused deps removed | `requirements.txt`, `config.py`, `llm/providers/gemini.py`, `.env.example` |
| 2 | Actions sorted by real priority rank (high > medium > low), not alphabetically | `backend/routes/get_tickets.py` |
| 3 | Uploads run in a thread pool; `POST /api/calls/upload` returns `job_id` (202); `GET /api/calls/jobs/{id}` gives stage, providers, result/error; UI polls and shows real stages | `backend/jobs.py`, `backend/routes/upload_call.py`, `pipeline/orchestrator.py`, `frontend/src/services/api.js`, `frontend/src/components/UploadModal.jsx` |
| 4 | Sarvam `saaras:v3` + `mode="translit"` (Roman output); language dropdown sent to Sarvam and Whisper; audio >25 s split into chunks (Sarvam REST max 30 s); LLM trigger phrase copied verbatim in transcript's script; actions whose trigger isn't in the transcript are capped below the review threshold; Whisper model size from config + Roman initial_prompt nudge | `asr/*`, `llm/prompts/action_extraction.txt`, `pipeline/orchestrator.py`, `config.py` |
| 6 | LLM output is parsed + validated inside `dual_mode`: bad JSON -> retry once -> switch provider. JSON mode on Gemini and Ollama; Ollama `num_ctx` 8192 | `llm/dual_mode.py`, `llm/extract_actions.py`, `llm/providers/*` |

| 7 | Whisper fallback -> `faster-whisper` (no torch). Model/device/compute type from config (default `small`, int8, CPU); language from the dropdown; Roman hospital-vocabulary prompt; VAD to cut silence hallucinations | `asr/providers/local_asr.py`, `config.py`, `requirements.txt`, `.env.example` |
| 8 | Dashboard "Actions" column now filled (`action_count` in `/api/calls`); transcript highlighting no longer skips matches (stateful `/g` regex removed); status change rolls back + shows an error if saving fails; "Calls Today" uses the IST day | `backend/routes/get_tickets.py`, `backend/routes/dashboard_stats.py`, `frontend/src/pages/CallDetail.jsx`, `frontend/src/components/ActionCard.jsx` |

Not done (by choice): 5, 9, 10 (security), 17 (demo helpers).

# UI patch — items 11–16

| # | Change | Files |
|---|--------|-------|
| 11 | Responsive layout: tablet/phone breakpoints, sidebar becomes a top bar on phones, tables scroll, modal fits the screen | `index.css` |
| 12 | New **Queue Board** page (`/board`): department tabs, Open / In Progress / Resolved columns, drag-and-drop or status menu. Dashboard department bars link to it | `pages/Board.jsx`, `GET /api/actions` |
| 13 | Pipeline stepper (Upload → ASR → LLM → Routing) with the provider that ran each step and a `fallback` tag | `components/PipelineStepper.jsx`, `UploadModal.jsx` |
| 14 | Patient header: editable name, "Please verify" / "Verified" tag, urgent red banner (unresolved high-priority Clinical action) | `pages/CallDetail.jsx`, `PATCH /api/calls/{id}`, `database/migrations/002_patient_verified.sql` (optional) |
| 15 | Transcript split into readable turns; click a label to tag Patient / Staff (saved in the browser) | `pages/CallDetail.jsx` |
| 16 | All Calls search + filters (department, priority, status, sentiment); real Live badge: auto-refresh every 15s, pause, Offline state | `pages/AllCalls.jsx`, `hooks/useLive.js`, `components/LiveStatus.jsx`, `GET /api/calls` filters |

## Frontend build warning fix
`Invalid input options ... Invalid key: Expected never but received "jsx"` came from
`vite ^8` + `@vitejs/plugin-react ^4` (v4 is not Vite 8 compatible). `package.json` now uses
`@vitejs/plugin-react ^6.0.0`. The stale `package-lock.json` was removed; `npm install` regenerates it.


# More departments

Added **Insurance, Lab Reports, Radiology** (8 total). `routing/departments.json` is the single source of truth for the backend (router validates against it); the LLM prompt lists them; the UI list lives in `frontend/src/departments.js`. No database change needed (`actions.department` is free text). Insurance/lab/scan keywords moved out of Billing/Clinical to avoid overlap.


# Groq for ASR and LLM

One `GROQ_API_KEY` now powers both steps (no new Python package; uses httpx).

| What | Detail | Files |
|---|---|---|
| ASR | Groq Whisper (`whisper-large-v3`, switch to `whisper-large-v3-turbo` via `GROQ_ASR_MODEL`). Language from the dropdown, Roman vocabulary prompt, audio split into 10 min chunks (25 MB upload cap) | `asr/providers/groq_asr.py` |
| LLM | Groq chat completions, JSON mode, default `llama-3.3-70b-versatile` (`GROQ_MODEL`; `openai/gpt-oss-120b` also works) | `llm/providers/groq_llm.py` |
| Provider order | `ASR_ORDER` (default `groq,sarvam,whisper`) and `LLM_ORDER` (default `groq,gemini,qwen`). Providers without a key are skipped. Bad JSON still retries once, then moves to the next provider | `config.py`, `asr/dual_mode.py`, `llm/dual_mode.py` |
| Stepper | The `fallback` tag now comes from the backend (true if the first configured provider didn't run) | `pipeline/orchestrator.py`, `backend/jobs.py`, `PipelineStepper.jsx` |

Notes: Whisper returns native script (Devanagari / Kannada), not Roman like Sarvam's `translit` mode. Trigger phrases are copied verbatim in the transcript's own script, so highlighting still works. Free-tier Groq has rate limits; a 429 falls through to the next provider. No database change.


# UI redesign + structured output (this patch)

**Look and feel.** New design system in `frontend/src/index.css`: warm paper neutrals, one teal accent, Source Serif 4 for titles and numbers, IBM Plex Sans for UI, IBM Plex Mono for IDs. Hairline borders, no gradients or glow. Priority is shown as a left rule plus a word instead of coloured pills everywhere. Responsive down to phone width.

| Area | Change | Files |
|---|---|---|
| Shell | One `Layout` (sidebar, title bar, live badge, upload dialog) used by every page | `components/Layout.jsx`, `Sidebar.jsx`, `Icons.jsx` |
| Overview | KPI strip (calls today, unresolved, high priority, needs review, avg length), **Needs attention** queue of open high-priority actions, department load with urgent share, sentiment mix, "how a call becomes work" empty state | `pages/Dashboard.jsx` |
| Call brief | Summary, then actions **grouped as Patient requests / Staff commitments / Follow-ups**, each with due date, evidence quote and confidence. Hover an action and its evidence is highlighted in the transcript. **Copy note** (paste into the hospital system) and JSON download | `pages/CallDetail.jsx`, `components/ActionCard.jsx`, `lib/format.js` |
| Re-route | Staff can move an action to another department; assignee updates to that team's default | `ActionCard.jsx`, `PATCH /api/actions/{id}` (`department` field) |
| Queue board | Search, "High priority only", owner label and due date on tickets | `pages/Board.jsx` |
| All calls | Summary column, routed-to chips, CSV export of the current page | `pages/AllCalls.jsx` |

**Backend: keep what the LLM already extracts.** `owner` (patient_request / staff_commitment / follow_up), `due_by`, `entities` and the urgent flag were extracted but dropped before saving. They are now saved.
Run `database/migrations/003_structured_fields.sql` in Supabase to enable this. If you don't, uploads still work (the save falls back to the old columns) and the UI simply hides those fields.
Files: `routing/router.py`, `pipeline/orchestrator.py`, `llm/prompts/action_extraction.txt`, `backend/routes/get_tickets.py`.

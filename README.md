# Smart CPGRAM Assistant

Smart CPGRAM Assistant is an independent, browser-based prototype that helps citizens prepare a grievance before they submit it themselves on CPGRAMS. It is built for **Build What Moves India — Track 1: AI for Digital Public Infrastructure & Governance** and is not affiliated with or endorsed by the Government of India.

## Problem and solution

Citizens often know what went wrong but not the correct department/category, whether they already raised a related issue, or how to state the grievance concisely. This application provides a guided journey: authenticate or try a synthetic demo, describe the issue, add only essential missing context, receive controlled category guidance, review a possible previous grievance, edit/copy/save a draft, and explicitly continue to the official CPGRAMS portal.

Nothing is automatically submitted to CPGRAMS.

## Architecture and stack

```text
React/Vite/Tailwind browser app
├── Supabase Auth and RLS-protected grievance drafts
└── FastAPI API
    ├── OpenRouter-hosted model: structured assistance
    ├── controlled taxonomy derived from local category paths
    └── lightweight candidate-scoped TF-IDF similarity
```

- Frontend: React 19, Vite, Tailwind CSS, Supabase JS
- Backend: FastAPI, Pydantic, OpenAI-compatible OpenRouter client, scikit-learn
- Storage/authentication: Supabase with Row Level Security

## What works

- Email/password signup, verification-compatible login, persisted sessions, and logout
- RLS-protected authenticated grievance history and draft saving
- No-account Demo Mode with synthetic history
- One-call department/category routing, missing-information questions, and grievance preparation
- Authenticated candidate-scoped and synthetic-demo duplicate/related-issue checks
- Editable final review, copy feedback, and explicit official CPGRAMS handoff

## What is mocked

- Government submission is never automated; users submit on the official portal themselves.
- Demo history is privacy-safe synthetic data, not live CPGRAMS data.
- Suggested routing is assistance, not an authoritative government routing decision.
- No private or internal government API is accessed.

The local dataset is privacy-safe synthetic data derived from patterns and category structure observed during analysis of a public CPGRAMS-related dataset. It contains no intentional real citizen PII.

## Local setup

Prerequisites: Node.js supported by Vite 8 and Python 3.12+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload
```

In another terminal:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Environment variables:

- Backend: `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`, comma-separated `ALLOWED_ORIGINS`; for the protected simulated lifecycle only: `DEMO_ADMIN_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`

Never put a Supabase service-role key, demo admin key, or OpenRouter key in frontend variables. The service-role key is used only by the protected simulated status-update path.

## Deployment

Deploy `frontend` as a Vite static build (`npm ci && npm run build`, output `dist`). Deploy `backend` as a Python web service (`pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`). Set the public backend URL in `VITE_API_BASE_URL`, the frontend origin in `ALLOWED_ORIGINS`, and the public frontend URL in Supabase Auth Site URL/redirect settings.

## Codex usage

**Built with Codex.** Codex was used for architecture review, Supabase authentication, frontend refactoring, authenticated history and draft integration, mode isolation, structured assistance and duplicate checking, validation, tests, documentation, and deployment preparation. Runtime inference uses OpenRouter-hosted models; Codex is the development qualification path, not the runtime model claim.

## Limitations

- The category list is derived from the included dataset’s 35 paths, not the complete live CPGRAMS taxonomy.
- Similarity identifies a possible related issue and deliberately leaves the decision to the citizen.
- In-memory rate protection is per backend process and is not a distributed production limiter.
- Public deployment and live Supabase/OpenRouter credentials must be configured by the operator.
- Prototype submission stores a Pending record but does not contact CPGRAMS. Later processing statuses are simulated through a protected backend-only API.

## Simulated status lifecycle

The prototype enforces `Draft → Pending → Under Review → Resolved → Closed`. Citizen submission creates or upgrades a record to Pending. Later transitions use the protected backend endpoint and require `DEMO_ADMIN_API_KEY`; server-only `SUPABASE_SERVICE_ROLE_KEY` access is isolated to that path. These variables must never be configured in Vercel or exposed to the browser.

See [docs/hackathon.md](docs/hackathon.md) for the evaluation-oriented product summary.

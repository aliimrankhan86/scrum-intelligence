# Scrum Intelligence — AI Handoff

## Purpose

Use this file as repo-local guidance for AI coding assistants.
The app itself does not depend on this file at runtime.

## First Rule

Query the code graph first, then read only the source files you actually need.
The graph is a token-saving discovery tool, not a replacement for source inspection.

## Graph Session Opener

```bash
sqlite3 .code-review-graph/graph.db "
SELECT 'Files' AS metric, COUNT(*) AS count FROM nodes WHERE kind = 'File'
UNION ALL SELECT 'Functions', COUNT(*) FROM nodes WHERE kind = 'Function'
UNION ALL SELECT 'Tests', COUNT(*) FROM nodes WHERE kind = 'Test'
UNION ALL SELECT 'Call edges', COUNT(*) FROM edges WHERE kind = 'CALLS'
UNION ALL SELECT 'Tested functions', COUNT(DISTINCT source) FROM edges WHERE kind = 'TESTED_BY';"
```

## Runtime Summary

- React 19 + Create React App
- Shared sync server backed by SQLite
- State in `localStorage`
- Current store key: `scrum_intelligence_v8`
- Legacy migration: `rpab_v8` → `scrum_intelligence_v8`
- AI routing: OpenRouter only with Gemma 4 → Llama 3.3 70B → Qwen 3 Coder → Free Router fallback order

## Current Operating Mode

- Assume OpenRouter may be unavailable for day-to-day use
- Do not remove the OpenRouter capability; keep it intact for later reactivation
- Keep provider routing/test logic intact, but keep provider/model badges hidden from the main dashboard UI unless explicitly re-enabled
- Prefer direct JSON from Jira Rovo for `Project setup`, `Daily standup`, `Refinement`, `Sprint planning`, `Sprint review`, `Retrospective`, and `Velocity & insights`
- These Rovo JSON flows should work without any LLM key when the pasted response already matches the dashboard JSON shape
- Meeting-transcript parsing remains an optional LLM-assisted path and may be dormant until an API key is restored
- Treat dashboard sprint labels as hints only. Rovo prompts must verify the live Jira sprint number, name, and dates before returning JSON.

## Architecture Rules

- `projectProfile` is first-class state and drives project adaptation
- `projectContext` is the lightweight runtime context used by dashboards and prompts
- Sprint timeline logic must prefer the real active sprint and auto-generate the next sprint from cadence when the current sprint closes
- If a setup payload marks one sprint row as `active: true` but the top-level `activeSprint` number disagrees, prefer the flagged sprint row and keep history numbering aligned to Jira
- When a sprint is archived, persist explicit sprint identity inside the archive snapshot: sprint number, sprint name, and sprint dates
- All AI calls go through `src/api.js`
- Prompt contracts live in `src/config.js`
- Do not hardcode project-specific values when runtime profile data already exists
- Do not change `Clear data` to wipe keys, theme, or Jira base URL

## Source-of-Truth Rules

- Daily standup board state: Rovo first
- Daily standup context: meeting notes after the meeting when LLM parsing is available
- Velocity and insights: Rovo only
- Refinement and sprint planning: Rovo JSON first, meeting notes optional when LLM parsing is available
- Sprint review and retrospective: Rovo JSON first, meeting notes optional when LLM parsing is available
- Sprint review deck prep: separate prompt toolkit

## Read Order

1. `src/projectProfile.js`
2. `src/store.js`
3. `src/config.js`
4. `src/api.js`
5. `src/App.js`
6. `src/Insights.js`
7. `src/App.test.js`

## Validation Gates

Every change should pass:

```bash
CI=true npm test -- --watchAll=false
npm run build
```

## Repo Boundary

This app repo is self-contained in the `scrum-intelligence` folder.
Parent workspace files outside this folder are not part of the app repo.

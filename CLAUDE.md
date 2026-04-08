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
- No backend
- State in `localStorage`
- Current store key: `scrum_intelligence_v8`
- Legacy migration: `rpab_v8` → `scrum_intelligence_v8`
- AI providers: Groq primary, Cerebras fallback

## Architecture Rules

- `projectProfile` is first-class state and drives project adaptation
- `projectContext` is the lightweight runtime context used by dashboards and prompts
- All AI calls go through `src/api.js`
- Prompt contracts live in `src/config.js`
- Do not hardcode project-specific values when runtime profile data already exists
- Do not change `Clear data` to wipe keys, theme, or Jira base URL

## Source-of-Truth Rules

- Daily standup board state: Rovo first
- Daily standup context: Hedy after the meeting
- Velocity and insights: Rovo only
- Planning and refinement: Hedy only
- Sprint review dashboard: Hedy only
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

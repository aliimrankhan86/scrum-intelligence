# RPAB Scrum Dashboard — Claude Context

## MANDATORY: Read Before Touching Any File

**A code graph DB exists at `.code-review-graph/graph.db`. You MUST query it before reading any source file.**

This is not optional. Reading source files without querying the graph first wastes tokens and context window unnecessarily. The graph gives you functions, call relationships, dependencies, and test coverage in one fast query.

**Session opener — run this first, every time:**
```bash
sqlite3 .code-review-graph/graph.db "
SELECT 'Files' AS metric, COUNT(*) AS count FROM nodes WHERE kind = 'File'
UNION ALL SELECT 'Functions', COUNT(*) FROM nodes WHERE kind = 'Function'
UNION ALL SELECT 'Tests', COUNT(*) FROM nodes WHERE kind = 'Test'
UNION ALL SELECT 'Call edges', COUNT(*) FROM edges WHERE kind = 'CALLS'
UNION ALL SELECT 'Tested functions', COUNT(DISTINCT source) FROM edges WHERE kind = 'TESTED_BY';"
```

**Before reading any file — get its function map first:**
```bash
sqlite3 .code-review-graph/graph.db "
SELECT n.name, n.kind, n.signature
FROM nodes n
JOIN edges e ON e.target = n.id
JOIN nodes f ON e.source = f.id
WHERE f.kind = 'File' AND f.name LIKE '%FILENAME%' AND e.kind = 'CONTAINS'
ORDER BY n.kind, n.name;"
```

**Before changing any function — check blast radius first:**
```bash
sqlite3 .code-review-graph/graph.db "
SELECT caller.name, caller.kind
FROM nodes caller
JOIN edges e ON e.source = caller.id
JOIN nodes t ON e.target = t.id
WHERE t.name = 'FUNCTION_NAME' AND e.kind = 'CALLS'
ORDER BY caller.name;"
```

Only read a source file if the graph query is insufficient for the task. Rebuild the graph after any code change: `code-review-graph build --repo .`

---

## What This Is
React SPA for Ali Khan (Senior Scrum Master, UEL). Converts Jira Rovo output and Hedy AI meeting transcripts into Scrum ceremony information radiators. Project-adaptive: switches to a new project profile without code changes. No backend — all state in `localStorage`.

## Tech Stack
- React 19, Create React App (no eject)
- State: `localStorage` key `rpab_v8`
- AI providers: Groq `llama-3.3-70b-versatile` (primary) → Cerebras `llama3.1-8b` (fallback)
- No TypeScript, no external state library, no router
- Testing: React Testing Library + Jest via `CI=true npm test -- --watchAll=false`

## Read This First (in order)
1. `src/projectProfile.js` — project profile shape and defaults
2. `src/store.js` — how project setup is applied and what gets cleared
3. `src/config.js` — meeting definitions and prompt contracts
4. `src/App.js` — merge logic, render, project setup flow, history/archive

## File Ownership
| File | Owns |
|------|------|
| `src/App.js` | Main UI, merge logic, project setup flow, history/archive |
| `src/config.js` | Meeting definitions, prompt contracts |
| `src/projectProfile.js` | Reusable project profile defaults, setup prompt, sprint-name helper |
| `src/store.js` | Persisted state, project setup application, clear/reset behaviour |
| `src/api.js` | Groq/Cerebras calls, shared AI context builder |
| `src/Insights.js` | Velocity and insights screen |
| `src/features/sprint-review/` | Locked-deck prompt toolkit |
| `src/App.test.js` | Regression tests |

## Architecture Rules (non-negotiable)
- `projectProfile` is first-class state — it drives everything adaptive
- `projectContext` is the lightweight runtime context used by dashboards and prompts: `projectKey`, `epic`, `epicName` only
- Never hardcode project-specific values where `projectProfile` runtime data already exists
- All AI calls go through `src/api.js` — no ad-hoc fetch calls in components
- Prompt contracts live in `src/config.js` — do not inline prompts in components

## Data Source Rules
| Ceremony | Rovo | Hedy | Notes |
|----------|------|------|-------|
| Daily standup (before) | ✅ | ❌ | Board state, counts, blockers |
| Daily standup (after) | ❌ | ✅ | Actions, verbal intel, decisions |
| Velocity & insights | ✅ | ❌ | Pure Jira data |
| Sprint planning | ❌ | ✅ | Upcoming sprint only |
| Sprint review | ❌ | ✅ | Internal intel only; deck prep is separate |
| Discovery | ❌ | ✅ | Conversation data > board |
| Retrospective | Confluence | ❌ | Skip Hedy here |

## Blocked Definition (strict)
Blocked = current Jira status `Blocked` OR `Flagged / Impediment`.  
Never infer blocked from description text alone.

## Project Setup Flow
1. User copies setup prompt → runs in Rovo → pastes response → applies
2. Applying setup updates: `projectProfile`, `projectContext`, `sprints`, `activeSprint`, `projectSetupAppliedAt`, active sprint standup board seed data
3. If `projectKey`, primary epic, or project name changes → clears: `meetingData`, `sprintSummaries`, `velocityData`, `reviewPromptContext`
4. Always preserves: API keys, theme, Jira base URL

## Clear Data Rules
`Clear data` clears dashboard/history content only.  
Must always preserve: API keys, theme, Jira base URL, current `projectProfile`, current `projectContext`.  
Normal refresh/reopen must never wipe data.

## Sprint Review Split
- Hedy in review = internal meeting intelligence only (goal outcome, delivered/not, stakeholder feedback, actions, decisions)
- Deck prep = separate, in `Sprint Review Prompt Toolkit`, reads `projectProfile.reviewDeckReference`

## History / Archive
End sprint archives: project context, per-meeting summary, per-meeting highlights, velocity summary/recommendation, planning/refinement highlights.

## Anti-Patterns — Never Do These
- Do not reintroduce hardcoded project keys, epic keys, or project names
- Do not add a router — this is a single-page app by design
- Do not add TypeScript — out of scope
- Do not create new localStorage keys without updating `store.js`
- Do not inline AI prompts in components — all prompts belong in `config.js`
- Do not make direct fetch/API calls outside `api.js`
- Do not modify `Clear data` behaviour to wipe API keys or theme

## Validation Gates
Every change must pass:
```bash
CI=true npm test -- --watchAll=false
npm run build
```
Both must succeed with zero errors before a task is considered done.

## Code Graph — Token-Efficient Context Queries

A `code-review-graph` graph DB lives at `.code-review-graph/graph.db` (schema v6).  
**Before reading source files, query the graph first.** It gives you structured facts at a fraction of the token cost.

Stats: 19 files · 234 nodes (192 functions, 23 tests) · 2,928 edges · JavaScript only.

### All functions in a file
```bash
sqlite3 .code-review-graph/graph.db "
SELECT n.name, n.kind, n.signature
FROM nodes n
JOIN edges e ON e.target = n.id
JOIN nodes f ON e.source = f.id
WHERE f.kind = 'File' AND f.name LIKE '%FILENAME%' AND e.kind = 'CONTAINS'
ORDER BY n.kind, n.name;"
```

### Blast radius — what calls a function
```bash
sqlite3 .code-review-graph/graph.db "
SELECT caller.name, caller.kind
FROM nodes caller
JOIN edges e ON e.source = caller.id
JOIN nodes t ON e.target = t.id
WHERE t.name = 'FUNCTION_NAME' AND e.kind = 'CALLS'
ORDER BY caller.name;"
```

### Dependencies — what a function calls
```bash
sqlite3 .code-review-graph/graph.db "
SELECT callee.name, callee.kind
FROM nodes callee
JOIN edges e ON e.target = callee.id
JOIN nodes s ON e.source = s.id
WHERE s.name = 'FUNCTION_NAME' AND e.kind = 'CALLS'
ORDER BY callee.name;"
```

### Untested functions
```bash
sqlite3 .code-review-graph/graph.db "
SELECT name, signature FROM nodes
WHERE kind = 'Function'
  AND id NOT IN (SELECT source FROM edges WHERE kind = 'TESTED_BY')
ORDER BY name;"
```

### Hotspots — most-called functions (highest change risk)
```bash
sqlite3 .code-review-graph/graph.db "
SELECT n.name, COUNT(*) AS times_called
FROM nodes n
JOIN edges e ON e.target = n.id
WHERE e.kind = 'CALLS' AND n.kind = 'Function'
GROUP BY n.id, n.name
ORDER BY times_called DESC LIMIT 10;"
```

### Codebase overview (low-cost session opener)
```bash
sqlite3 .code-review-graph/graph.db "
SELECT 'Files' AS metric, COUNT(*) AS count FROM nodes WHERE kind = 'File'
UNION ALL SELECT 'Functions', COUNT(*) FROM nodes WHERE kind = 'Function'
UNION ALL SELECT 'Tests', COUNT(*) FROM nodes WHERE kind = 'Test'
UNION ALL SELECT 'Call edges', COUNT(*) FROM edges WHERE kind = 'CALLS'
UNION ALL SELECT 'Tested functions', COUNT(DISTINCT source) FROM edges WHERE kind = 'TESTED_BY';"
```

### Rebuild the graph after code changes
```bash
code-review-graph build --repo .
```

## GSD Phase Hints
When running `/gsd-new-project` or `/gsd-discuss-phase`, the logical work boundaries for this project are:
- **Data layer**: `store.js`, `projectProfile.js`, `api.js`
- **Config/prompts**: `config.js`, sprint-review feature folder
- **UI/render**: `App.js`, `Insights.js`, `App.css`
- **Tests**: `App.test.js` — update alongside any logic change, not as a separate phase

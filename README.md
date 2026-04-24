# scrum-intelligence

Adaptive Scrum intelligence dashboard for ceremony preparation, live sprint visibility, and archived sprint recall.

## Purpose

This product is currently developed for teams working in Jira and Confluence, with project and sprint extraction done through Rovo AI.
It combines Jira / Rovo board truth, meeting notes or transcripts, archived sprint context, and project setup into one reusable dashboard.

Meeting-note input is flexible by design. It works with Hedy, Apple Notes, Teams transcripts, Notion, Granola, other meeting-notes tools, or manual notes.

Current operating mode:
- Rovo JSON is the primary path for `Project setup`, `Daily standup`, `Refinement`, `Sprint planning`, `Sprint review`, `Retrospective`, and `Velocity & insights`
- Groq is the primary AI parser, Cohere is the fallback parser, and Gemini is the tertiary parser
- OpenRouter is kept only as an optional legacy fallback; leave it blank if Groq, Cohere, and Gemini are enough
- Provider/model badges are intentionally hidden from the main dashboard UI for now, but the AI route test flow remains available in `API keys`
- If no LLM key is available, direct Rovo JSON still works for board, planning, review, and sprint updates
- Meeting-note parsing remains optional and depends on a Groq, Cohere, Gemini, or optional OpenRouter key being available

## Who It Is For

- Scrum Masters
- Delivery Leads
- Agile PMs
- Project leads who need one place to review sprint context quickly

## Core Principles

- Project-adaptive, not permanently tied to one programme
- Shared-dashboard first, so every connected instance sees the same latest state
- Ceremony-specific inputs with one cross-sprint reference view
- User-supplied AI keys only, with Groq first, Cohere second, and Gemini third as the normal queue
- Reusable for other teams, as long as they can provide Jira / Rovo setup data and meeting notes

## Functionality

- Daily standup dashboard with Jira / Rovo board truth and meeting-note context
- Dedicated refinement and planning intelligence for the upcoming sprint
- Sprint review intelligence plus a locked-format prompt toolkit for stakeholder decks
- Retrospective, discovery, and stakeholder update capture
- Project setup flow that seeds the board from one Rovo response
- Sprint archive history for quick future revisit
- Sprint reference view that rolls key current-sprint information into one place
- Archived sprint history now stores explicit sprint identity too: sprint number, sprint name, and sprint dates are saved inside each archive snapshot, not only inferred from the storage key

## First-Time Setup

1. Run the app with shared sync enabled.
2. Open `Project setup` from the left menu.
3. Copy the setup prompt.
4. Run it in Rovo.
5. Paste the response once and apply setup.
6. Add your Groq, Cohere, and/or Gemini key in `API keys`.
7. Open `Daily standup` and use the Rovo prompt plus meeting notes input to keep the dashboard current.

If the pasted setup response is already valid JSON in the expected schema, the app applies it directly without sending it through an LLM again. The AI parsing fallback is used only when the pasted setup response needs cleanup or conversion.
The same direct-JSON rule now applies to Rovo updates in `Daily standup`, `Refinement`, `Sprint planning`, `Sprint review`, `Retrospective`, and `Velocity & insights`.

AI model order:
- `llama-3.3-70b-versatile` first through Groq
- `command-r7b-12-2024` second through Cohere
- `gemini-2.5-flash` third through the Gemini API
- `openrouter/free` only if an optional OpenRouter key is saved

Rate-limit rule:
- On `429`, the app waits 10 seconds before rotating to the next route.
- `Test AI routes` checks each configured route with a small JSON request.
- If you are not using OpenRouter, leave that key blank so the test result only reports the active Groq → Cohere → Gemini queue.

The setup prompt is designed to gather:
- project profile and workstreams / epics
- active sprint and known upcoming sprints
- recent completed sprint history with epics, delivered tickets, carry-over tickets, and quantitative metrics when available
- sprint cadence, including sprint duration and gap between sprints when known
- active sprint board items grouped by status
- current team members visible from the scrum board / active sprint context
- watch tickets, current risks, and known decisions when available

If team membership changes later, rerun `Project setup`. For the same project, the app updates team and setup context without wiping the current sprint data. If you switch to a different project, the app intentionally clears old project-specific sprint data.
If the current sprint closes and Jira has already moved to the next sprint, rerunning `Project setup` will prefer the newer active sprint and generate the next sprint dates from cadence when needed.
If a setup response marks one sprint row as `active: true` but the top-level `activeSprint` number disagrees, the app now trusts the flagged sprint row and keeps sprint history numbering aligned to Jira.

## Run

```bash
npm start
```

`npm start` now starts both the React app and the shared SQLite sync server together.
That same server also proxies Groq, Cohere, Gemini, and optional OpenRouter requests, so AI connectivity depends on it as well as shared sync.

If you already have a shared sync server running and only want the frontend:

```bash
npm run start:ui
```

## Shared Sync

The app now uses a small Node server with a shared SQLite database at `data/scrum-intelligence.sqlite`.
Any instance connected to the same sync server will pull the latest saved dashboard state and push new updates back into the common database.

How the shared-state model works:
- The shared SQLite store is the source of truth for project, sprint, meeting, and dashboard data.
- Browser local storage keeps local-only settings such as theme, AI API keys, Jira base URL, and a local backup of the last saved dashboard state.
- On startup, the app connects to the shared store and loads the latest shared snapshot.
- If the shared store is empty, the newest surviving local dashboard backup seeds the shared store automatically.
- If the shared store already has data but a local backup is newer, the newer local backup is restored into the shared store automatically.
- Older stale snapshots are rejected by the server, so an old instance cannot overwrite newer data.
- If the shared store is unavailable, the app becomes read-only instead of silently drifting into a separate local copy.
- AI requests are sent through this server at `/api/groq/chat`, `/api/cohere/chat`, `/api/gemini/generate`, or `/api/openrouter/chat`, so browser CORS does not need to be bypassed manually.

You can still run the sync server by itself:

```bash
npm run server
```

If you want multiple machines to use one central sync server, host `server.js` once and point the frontend at it with:

```bash
REACT_APP_SYNC_SERVER_ORIGIN=https://your-shared-host.example.com
```

The dashboard shell will show the current sync status:
- `Connected` means the instance is using the shared store.
- `Syncing` means a new save is being pushed.
- `Offline` means the server cannot be reached and editing is locked.
- `Local only` appears only in test mode.

## Daily Standup Workflow

Daily standup is the main operational flow.

Recommended sequence:
1. Before the meeting, open `Daily standup` and copy the Jira / Rovo prompt.
2. Run that prompt in Rovo so the dashboard gets the live board truth for the current sprint.
3. Paste the Rovo JSON result into the left capture panel and update the dashboard.
4. After the meeting, if Groq, Cohere, or Gemini is configured, paste the Hedy transcript or notes into the right capture panel and update the dashboard again.

The standup prompts and AI context are designed to include:
- current sprint and next sprint context
- project / epic / workstream context
- watch tickets
- recent sprint history
- known risks and decisions
- live Jira board truth from Rovo

Standup rules:
- Jira / Rovo remains the source of truth for status, counts, blocked work, and stale work.
- Meeting notes add actions, next steps, decisions, risks, and briefing context.
- The standup prompt is intentionally strict so the dashboard stays quantitative and useful for day-to-day Scrum leadership.
- The copied standup prompt treats the dashboard sprint as a hint only and requires Rovo to verify the live open Jira sprint number, name, and dates before answering.
- If a pasted standup payload is for a different sprint number than the dashboard's active sprint, the app rejects it instead of updating the board with stale sprint data.
- If no AI key is available, the Rovo board update still works; only free-form transcript parsing is paused.
- The `Capture` summary card keeps the last resolved AI model visible so you can see which LLM handled the most recent AI-assisted update.

## AI Enablement

AI parsing is intentionally isolated behind `src/aiDashboardAdapter.js`.
The adapter handles capture source labels, no-key messaging, Hedy / meeting-note context, and the small bridge into `src/api.js`.

Removal boundary:
- Keep direct Rovo JSON capture in `App.js`; that path does not require an LLM key.
- Remove or bypass `src/aiDashboardAdapter.js` only if transcript / Hedy parsing is not wanted.
- Do not refactor dashboard state, routing, layout, sync, or prompt contracts just to change AI providers.

Hedy usage:
- Paste Hedy notes, Teams transcripts, AI summaries, or manual notes into the meeting-notes capture panel.
- When Groq, Cohere, or Gemini is available, the app parses that context into dashboard actions, risks, questions, decisions, and next steps.
- If Hedy returns dashboard-ready JSON, paste it into the meeting-notes capture panel and it can update without an LLM key.
- When no AI key is available and Hedy output is free-form notes, paste Rovo JSON for board truth and keep Hedy notes as source material until AI parsing is restored.

Other ceremony prompts:
- `Refinement` now asks Rovo for target-sprint JSON covering carry-forward work, candidate backlog, dependency gates, team load, recommendations, actions, and decisions.
- `Sprint planning` now asks Rovo for planned-sprint JSON covering carry-over, selected scope, capacity, dependencies, risks, and follow-ups.
- `Sprint review` now asks Rovo for sprint-close JSON covering sprint-goal outcome, completed work, incomplete work, stakeholder feedback, decisions, and follow-ups.
- `Retrospective` now asks Rovo for retro JSON covering what went well, what did not, improvement actions, and concise notes.

## Recovery And Current Project Use

If a dashboard looks empty or out of date:
- Make sure the `Shared sync` card is not `Offline`.
- Restart the app with `npm start` so the shared server is available locally.
- Refresh the instance that contains the latest project data. If that instance still has the latest saved dashboard snapshot in browser storage, it will repopulate the shared store automatically when it reconnects.
- If no surviving browser instance still has the project data, rerun `Project setup` for the current project and then refresh the `Daily standup` page with the latest Rovo output and meeting notes.

This means the safest recovery path for a current project is:
1. Reconnect the shared sync server.
2. Open the browser instance that last had the correct data.
3. Let it reconnect and republish that snapshot to the shared store.
4. Refresh the other instances.

## Test

```bash
CI=true npm test -- --watchAll=false
```

## Build

```bash
npm run build
```

## Security And Connectors

- No API keys are committed to this repository.
- Keys are entered by the user in the app UI and stored only in that browser's local storage.
- Completions run through Groq first, Cohere second, Gemini third, and optional OpenRouter only if a fallback key is saved.
- The browser sends saved keys only to the local/shared server proxy, which then calls the selected provider.
- If someone downloads this repository, they must use their own keys.
- This is safe for local/private use and repo sharing.
- For public multi-user deployment, use a backend or proxy if keys must remain secret from end users.

Direct Jira / Confluence connectors were intentionally not added.
That avoids introducing data-leakage, connector-governance, or access-control concerns that can be a serious disciplinary or even sackable issue in some organisations.

## Reusability

- The app is project-adaptive.
- `Project setup` is the first-run mechanism for changing project, sprint, epic, workstream, cadence, team, and board context.
- The checked-in defaults are example defaults only; they are not required for a new project.
- Existing local data from the old `rpab_v8` key is migrated automatically into `scrum_intelligence_v8`.
- Shared dashboard data is kept in SQLite; local storage is used for local settings plus recovery bootstrap only.

## Repo Notes

- App package name: `scrum-intelligence`
- Browser title: `Scrum Intelligence`
- Local storage key: `scrum_intelligence_v8`
- This repo is self-contained in the `scrum-intelligence` folder
- Parent workspace files outside this folder are not part of the app repo

## AI Assistant Context

- `AGENTS.md` and `CLAUDE.md` are repo-local handoff files for coding assistants.
- They document the current Groq → Cohere → Gemini → optional OpenRouter AI routing, the shared proxy endpoints, Rovo-first data flow, Hedy notes handling, and the removable `src/aiDashboardAdapter.js` boundary.
- They do not affect runtime behavior.

# scrum-intelligence

Adaptive Scrum intelligence dashboard for ceremony preparation, live sprint visibility, and archived sprint recall.

## Purpose

This product is currently developed for teams working in Jira and Confluence, with project and sprint extraction done through Rovo AI.
It combines Jira / Rovo board truth, meeting notes or transcripts, archived sprint context, and project setup into one reusable dashboard.

Meeting-note input is flexible by design. It works with Hedy, Apple Notes, Teams transcripts, Notion, Granola, other meeting-notes tools, or manual notes.

Current operating mode:
- Rovo JSON is the primary path for `Project setup`, `Daily standup`, `Refinement`, `Sprint planning`, `Sprint review`, `Retrospective`, and `Velocity & insights`
- OpenRouter support is kept in the app, but it may be unavailable at times
- Provider/model badges are intentionally hidden from the main dashboard UI for now, but the OpenRouter routing and test flow remain available in `API keys`
- If OpenRouter is unavailable, direct Rovo JSON still works for board, planning, review, and sprint updates
- Meeting-note parsing remains optional and depends on OpenRouter being available

## Who It Is For

- Scrum Masters
- Delivery Leads
- Agile PMs
- Project leads who need one place to review sprint context quickly

## Core Principles

- Project-adaptive, not permanently tied to one programme
- Shared-dashboard first, so every connected instance sees the same latest state
- Ceremony-specific inputs with one cross-sprint reference view
- User-supplied OpenRouter key only, with a fixed free-tier retry chain
- Reusable for other teams, as long as they can provide Jira / Rovo setup data and meeting notes

## Functionality

- Daily standup dashboard with Jira / Rovo board truth and meeting-note context
- Dedicated refinement and planning intelligence for the upcoming sprint
- Sprint review intelligence plus a locked-format prompt toolkit for stakeholder decks
- Retrospective, discovery, and stakeholder update capture
- Project setup flow that seeds the board from one Rovo response
- Sprint archive history for quick future revisit
- Sprint reference view that rolls key current-sprint information into one place

## First-Time Setup

1. Run the app with shared sync enabled.
2. Open `Project setup` from the left menu.
3. Copy the setup prompt.
4. Run it in Rovo.
5. Paste the response once and apply setup.
6. Add your OpenRouter key in `API keys`.
7. Open `Daily standup` and use the Rovo prompt plus meeting notes input to keep the dashboard current.

If the pasted setup response is already valid JSON in the expected schema, the app applies it directly without sending it through an LLM again. The AI parsing fallback is used only when the pasted setup response needs cleanup or conversion.
The same direct-JSON rule now applies to Rovo updates in `Daily standup`, `Refinement`, `Sprint planning`, `Sprint review`, `Retrospective`, and `Velocity & insights`.

OpenRouter model order:
- `google/gemma-4-31b-it:free` first
- `meta-llama/llama-3.3-70b-instruct:free` on `429` or `404`
- `qwen/qwen3-coder:free` as the emergency fallback on `429` or `404`
- `openrouter/free` as the safety router after that

Rate-limit rule:
- On `429`, the app waits 10 seconds before rotating to the next route.
- `Test OpenRouter` is a smoke test. It confirms the app is operational without probing every fallback route on every click.

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

## Run

```bash
npm start
```

`npm start` now starts both the React app and the shared SQLite sync server together.
That same server also proxies OpenRouter requests, so AI connectivity depends on it as well as shared sync.

If you already have a shared sync server running and only want the frontend:

```bash
npm run start:ui
```

## Shared Sync

The app now uses a small Node server with a shared SQLite database at `data/scrum-intelligence.sqlite`.
Any instance connected to the same sync server will pull the latest saved dashboard state and push new updates back into the common database.

How the shared-state model works:
- The shared SQLite store is the source of truth for project, sprint, meeting, and dashboard data.
- Browser local storage keeps local-only settings such as theme, the OpenRouter API key, Jira base URL, and a local backup of the last saved dashboard state.
- On startup, the app connects to the shared store and loads the latest shared snapshot.
- If the shared store is empty, the newest surviving local dashboard backup seeds the shared store automatically.
- If the shared store already has data but a local backup is newer, the newer local backup is restored into the shared store automatically.
- Older stale snapshots are rejected by the server, so an old instance cannot overwrite newer data.
- If the shared store is unavailable, the app becomes read-only instead of silently drifting into a separate local copy.
- OpenRouter requests are sent through this server at `/api/openrouter/chat`, so browser CORS does not need to be bypassed manually.

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
4. After the meeting, if OpenRouter is available, paste the meeting transcript or notes into the right capture panel and update the dashboard again.

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
- If OpenRouter is unavailable, the Rovo board update still works; only transcript parsing is paused.

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
- All completions run through OpenRouter only, using the fixed Gemma 4 → Llama 3.3 70B → Qwen 3 Coder → Free Router retry order.
- The browser sends the saved key only to the local/shared server proxy, which then calls OpenRouter.
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

- `CLAUDE.md` is included as an optional repo-local handoff file for coding assistants.
- It does not affect runtime behavior.

# scrum-intelligence

Adaptive Scrum intelligence dashboard for ceremony preparation, live sprint visibility, and archived sprint recall.

## Purpose

This product is currently developed for teams working in Jira and Confluence, with project and sprint extraction done through Rovo AI.
It combines Jira / Rovo board truth, meeting notes or transcripts, archived sprint context, and project setup into one reusable dashboard.

Meeting-note input is flexible by design. It works with Hedy, Apple Notes, Teams transcripts, Notion, Granola, other meeting-notes tools, or manual notes.

## Who It Is For

- Scrum Masters
- Delivery Leads
- Agile PMs
- Project leads who need one place to review sprint context quickly

## Core Principles

- Project-adaptive, not permanently tied to one programme
- Local-first, with no backend required
- Ceremony-specific inputs with one cross-sprint reference view
- User-supplied AI keys only
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

1. Run the app.
2. Open `Project setup` from the left menu.
3. Copy the setup prompt.
4. Run it in Rovo.
5. Paste the response once and apply setup.
6. Add your own keys in `API keys`.

The setup prompt is designed to gather:
- project profile and workstreams / epics
- active sprint and known upcoming sprints
- sprint cadence, including sprint duration and gap between sprints when known
- active sprint board items grouped by status
- current team members visible from the scrum board / active sprint context

If team membership changes later, rerun `Project setup`. For the same project, the app updates team and setup context without wiping the current sprint data. If you switch to a different project, the app intentionally clears old project-specific sprint data.

## Run

```bash
npm start
```

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

## Repo Notes

- App package name: `scrum-intelligence`
- Browser title: `Scrum Intelligence`
- Local storage key: `scrum_intelligence_v8`
- This repo is self-contained in the `scrum-intelligence` folder
- Parent workspace files outside this folder are not part of the app repo

## AI Assistant Context

- `CLAUDE.md` is included as an optional repo-local handoff file for coding assistants.
- It does not affect runtime behavior.

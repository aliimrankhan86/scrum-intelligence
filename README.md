# scrum-intelligence

Adaptive Scrum intelligence dashboard for standups, refinement, planning, review, retrospectives, discovery, and stakeholder updates.

## Purpose

This app gives a Scrum Master or delivery lead one adaptive workspace for ceremony intelligence.
It combines Jira/Rovo board truth, Hedy transcript insight, archived sprint context, and project setup into a single reusable dashboard.

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

## First-Time Setup

1. Run the app
2. Open `Project setup` from the left menu
3. Copy the setup prompt
4. Run it in Rovo or prepare an equivalent project brief
5. Paste the response and apply setup
6. Add your own keys in `API keys`

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

## Security

- No API keys are committed to this repository.
- Keys are entered by the user in the app UI and stored only in that browser's local storage.
- If someone downloads this repository, they must use their own keys.
- This is safe for local/private use and repo sharing.
- For public multi-user deployment, use a backend or proxy if keys must remain secret from end users.

## Reusability

- The app is project-adaptive.
- `Project setup` is the first-run mechanism for changing project, sprint, epic, workstream, and board context.
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

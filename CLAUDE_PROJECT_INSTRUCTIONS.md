# Scrum Dashboard — AI Handoff

## Purpose
- React SPA for a Scrum Master.
- Converts Jira/Rovo output and Hedy transcripts into practical information radiators.
- Architecture is now project-adaptive: the app can switch to a new project profile without code changes.

## Runtime
- App path: `/Users/aliimrankhan/Documents/UEL/dashboard/rpab-app`
- App name: `scrum-intelligence`
- State store: `localStorage` key `scrum_intelligence_v8` with legacy migration from `rpab_v8`
- Main files:
  - `src/App.js`: main UI, merge logic, project setup flow, history/archive
  - `src/config.js`: meeting definitions and prompt contracts
  - `src/projectProfile.js`: reusable project profile defaults, setup prompt, setup parser contract, sprint-name helper
  - `src/store.js`: persisted state, project setup application, clear/reset behavior
  - `src/api.js`: Groq/Cerebras calls and shared AI context builder
  - `src/Insights.js`: velocity/insights screen
  - `src/features/sprint-review/`: locked-deck prompt toolkit
  - `src/App.test.js`: regression tests

## Core Architecture
- `projectProfile` is now first-class state.
- `projectContext` remains the lightweight runtime context used by dashboards and prompts:
  - `projectKey`
  - `epic`
  - `epicName`
- `projectProfile` contains the richer adaptable setup:
  - dashboard title
  - footer/project label
  - project key and name
  - primary epic key and title
  - goal / phase / summary
  - sprint naming template
  - review deck reference
  - team / stakeholders
  - watch tickets / known risks / known decisions

## Project Setup Flow
- Header button: `Project setup`
- First-run landing callout: `Project Setup`
- Intended flow:
  1. Copy the setup prompt
  2. Run it in Rovo or use a project brief
  3. Paste the response into the setup modal
  4. Apply setup
- The setup parser updates:
  - `projectProfile`
  - `projectContext`
  - `sprints`
  - `activeSprint`
  - `projectSetupAppliedAt`
  - active sprint standup board seed data
- The one setup prompt must gather:
  - project metadata
  - team / stakeholders
  - all workstreams / epics in play
  - active sprint and known upcoming sprints
  - active sprint board snapshot:
    - stories / tasks / bugs / spikes / sub-tasks grouped by status
    - blockers
    - risks
    - actions / next steps / decisions
- If the project key / primary epic / project name changes, applying setup clears:
  - `meetingData`
  - `sprintSummaries`
  - `velocityData`
  - `reviewPromptContext`
- It preserves:
  - API keys
  - theme
  - Jira base URL

## Meeting Source Rules
- `Daily standup`: Jira Rovo before meeting + Hedy after meeting
- `Velocity & insights`: Jira Rovo only
- `Sprint planning`: Hedy only
- `Sprint review`: Hedy only for review intelligence, plus separate deck-prep prompt toolkit
- `Discovery`: Hedy only
- `Stakeholder update`: Hedy only

## Standup Rules
- `Rovo` is source of truth for board-state:
  - status arrays
  - blocked lists
  - counts
- `Hedy` adds context only:
  - actions for Ali
  - next steps to watch
  - decisions
  - risks
  - questions
  - briefing notes
- Blocked is strict:
  - only current Jira `Blocked`
  - or current `Flagged / Impediment`
  - never inferred from description text alone

## Sprint Planning / Refinement
- Planning tab is Hedy-only and framed as the upcoming sprint.
- UI now labels it explicitly as:
  - `Upcoming sprint — <name>`
  - `Refinement notes / Hedy AI`
- Archived history keeps planning highlights, not just a one-line summary.

## Sprint Review Split
- `Hedy` in review is for internal meeting intelligence only:
  - sprint goal outcome
  - delivered / not completed
  - stakeholder feedback
  - actions
  - decisions
  - notes
- Deck prep is separate in `Sprint Review Prompt Toolkit`.
- The deck prompt toolkit now reads the active `projectProfile.reviewDeckReference` rather than assuming one fixed deck forever.

## History / Archive
- `End sprint` archives the current sprint.
- Archived sprint history now keeps:
  - project context
  - per-meeting summary
  - per-meeting highlights
  - velocity summary / recommendation
- Planning/refinement highlights are preserved for quick revisit.

## Current Provider Runtime
- Primary: Groq `llama-3.3-70b-versatile`
- Fallback: Cerebras `llama3.1-8b`
- API modal stores `groqKey`, `cerebrasKey`, and optional `jiraBase`
- Header chips show provider state

## Important Behaviors
- `Clear data` clears dashboard/history content only
- `Clear data` must preserve:
  - API keys
  - theme
  - Jira base URL
  - current project profile
  - current project context
- Normal refresh/reopen must not wipe data

## Validation
- `CI=true npm test -- --watchAll=false`
- `npm run build`

## If Another AI Picks This Up
- Read `src/projectProfile.js` first.
- Then read `src/store.js` for how project setup is applied.
- Then read `src/config.js` for meeting prompt rules.
- Then read `src/App.js` for merge/render/history logic.
- Do not reintroduce project-specific hardcoding where runtime profile data already exists.

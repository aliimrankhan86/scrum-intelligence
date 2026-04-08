# scrum-intelligence

Adaptive Scrum intelligence dashboard for standups, refinement, planning, review, retrospectives, discovery, and stakeholder updates.

## What It Does

- Uses `Jira Rovo` for sprint and board truth where needed
- Uses `Hedy` transcripts for meeting intelligence and context
- Keeps ceremony data stored locally until `Clear data` is used
- Archives sprint summaries and highlights for future revisit
- Adapts to new projects through `Project setup`

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

## Notes

- App package name: `scrum-intelligence`
- Browser title: `Scrum Intelligence`
- Local storage key: `scrum_intelligence_v8`
- Existing `rpab_v8` local data is migrated automatically on first load

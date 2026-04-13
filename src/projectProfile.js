function textValue(value) {
  if (value == null) return "";
  const text = String(value).trim();
  return text && text !== "null" ? text : "";
}

function cleanWholeNumber(value, fallback, min = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < min) return fallback;
  return num;
}

function cleanList(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => textValue(item))
    .filter(Boolean);
}

function cleanPeople(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: textValue(item?.name),
      role: textValue(item?.role),
    }))
    .filter((item) => item.name);
}

function cleanWorkstreams(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      epic: textValue(item?.epic),
      epicName: textValue(item?.epicName),
      focus: textValue(item?.focus),
    }))
    .filter((item) => item.epic || item.epicName);
}

function parseIsoDate(value) {
  const text = textValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function dayDiff(start, end) {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function inclusiveDaySpan(start, end) {
  const diff = dayDiff(start, end);
  return diff == null ? null : diff + 1;
}

function sprintGapDaysBetween(previousEnd, nextStart) {
  const diff = dayDiff(previousEnd, nextStart);
  return diff == null ? null : Math.max(0, diff - 1);
}

export const DEFAULT_PROJECT_PROFILE = {
  dashboardTitle: "Scrum Intelligence",
  projectLabel: "Project dashboard",
  projectKey: "",
  projectName: "",
  primaryEpic: "",
  primaryEpicName: "",
  goal: "",
  phase: "",
  what: "",
  scrumMasterName: "",
  scrumMasterRole: "Scrum lead",
  sprintNameTemplate: "{projectKey} Sprint {num}",
  sprintDurationDays: 14,
  sprintGapDays: 0,
  reviewDeckReference: "",
  reviewDeckGuidance: "",
  workstreams: [],
  team: [],
  stakeholders: [],
  watchTickets: [],
  knownRisks: [],
  knownDecisions: [],
};

export function normaliseProjectProfile(profile = {}, options = {}) {
  const useDefaults = options.useDefaults !== false;
  const merged = useDefaults
    ? {
        ...DEFAULT_PROJECT_PROFILE,
        ...(profile || {}),
      }
    : { ...(profile || {}) };

  const projectKey = textValue(merged.projectKey) || (useDefaults ? DEFAULT_PROJECT_PROFILE.projectKey : "");
  const projectName = textValue(merged.projectName) || (useDefaults ? DEFAULT_PROJECT_PROFILE.projectName : "");
  const primaryEpic = textValue(merged.primaryEpic) || (useDefaults ? DEFAULT_PROJECT_PROFILE.primaryEpic : "");
  const primaryEpicName = textValue(merged.primaryEpicName) || projectName || (useDefaults ? DEFAULT_PROJECT_PROFILE.primaryEpicName : "");

  return {
    dashboardTitle: textValue(merged.dashboardTitle) || (useDefaults ? DEFAULT_PROJECT_PROFILE.dashboardTitle : "Scrum Intelligence"),
    projectLabel: textValue(merged.projectLabel) || projectName || (useDefaults ? DEFAULT_PROJECT_PROFILE.projectLabel : "Project"),
    projectKey,
    projectName,
    primaryEpic,
    primaryEpicName,
    goal: textValue(merged.goal),
    phase: textValue(merged.phase),
    what: textValue(merged.what),
    scrumMasterName: textValue(merged.scrumMasterName) || (useDefaults ? DEFAULT_PROJECT_PROFILE.scrumMasterName : ""),
    scrumMasterRole: textValue(merged.scrumMasterRole) || (useDefaults ? DEFAULT_PROJECT_PROFILE.scrumMasterRole : ""),
    sprintNameTemplate: textValue(merged.sprintNameTemplate) || (useDefaults ? DEFAULT_PROJECT_PROFILE.sprintNameTemplate : "{projectKey} Sprint {num}"),
    sprintDurationDays: cleanWholeNumber(merged.sprintDurationDays, useDefaults ? DEFAULT_PROJECT_PROFILE.sprintDurationDays : null, 1),
    sprintGapDays: cleanWholeNumber(merged.sprintGapDays, useDefaults ? DEFAULT_PROJECT_PROFILE.sprintGapDays : null, 0),
    reviewDeckReference: textValue(merged.reviewDeckReference) || (useDefaults ? DEFAULT_PROJECT_PROFILE.reviewDeckReference : ""),
    reviewDeckGuidance: textValue(merged.reviewDeckGuidance) || (useDefaults ? DEFAULT_PROJECT_PROFILE.reviewDeckGuidance : ""),
    workstreams: cleanWorkstreams(merged.workstreams),
    team: cleanPeople(merged.team),
    stakeholders: cleanPeople(merged.stakeholders),
    watchTickets: cleanList(merged.watchTickets),
    knownRisks: cleanList(merged.knownRisks),
    knownDecisions: cleanList(merged.knownDecisions),
  };
}

export function deriveProjectContextFromProfile(profile) {
  const safe = normaliseProjectProfile(profile);
  return {
    projectKey: safe.projectKey,
    epic: safe.primaryEpic,
    epicName: safe.primaryEpicName || safe.projectName,
  };
}

export function buildSprintName(profile, num) {
  const safe = normaliseProjectProfile(profile);
  const template = safe.sprintNameTemplate || "{projectKey} Sprint {num}";
  if (!num) {
    return template
      .replace(/\{projectKey\}/g, safe.projectKey)
      .replace(/\{num\}/g, "");
  }
  return template
    .replace(/\{projectKey\}/g, safe.projectKey)
    .replace(/\{num\}/g, String(num))
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseSprints(sprints, profile) {
  const safe = normaliseProjectProfile(profile);
  const items = (Array.isArray(sprints) ? sprints : [])
    .map((sprint) => {
      const num = Number(sprint?.num);
      const start = textValue(sprint?.start);
      const end = textValue(sprint?.end);
      if (!Number.isFinite(num) || !start || !end) return null;
      return {
        num,
        name: textValue(sprint?.name) || buildSprintName(safe, num),
        start,
        end,
        active: Boolean(sprint?.active),
      };
    })
    .filter(Boolean);

  const deduped = Array.from(
    items.reduce((map, item) => map.set(item.num, item), new Map()).values(),
  ).sort((a, b) => a.num - b.num);

  return deduped.length ? deduped : [];
}

export function inferSprintCadence(profile, sprints = []) {
  const safe = normaliseProjectProfile(profile);
  const items = normaliseSprints(sprints, safe);
  const latest = items[items.length - 1];
  const explicitDuration = cleanWholeNumber(safe.sprintDurationDays, null, 1);
  const explicitGap = cleanWholeNumber(safe.sprintGapDays, null, 0);
  const derivedDuration = latest ? inclusiveDaySpan(latest.start, latest.end) : null;

  let derivedGap = null;
  for (let index = items.length - 1; index > 0; index -= 1) {
    const gap = sprintGapDaysBetween(items[index - 1].end, items[index].start);
    if (gap != null) {
      derivedGap = gap;
      break;
    }
  }

  return {
    durationDays: explicitDuration || derivedDuration || DEFAULT_PROJECT_PROFILE.sprintDurationDays,
    gapDays: explicitGap ?? derivedGap ?? DEFAULT_PROJECT_PROFILE.sprintGapDays,
  };
}

export function buildGeneratedSprint(profile, sprints = [], num, previousSprint = null) {
  const safe = normaliseProjectProfile(profile);
  const items = normaliseSprints(sprints, safe);
  const base = previousSprint || items.find((item) => item.num === num - 1) || items[items.length - 1];
  if (!base?.end) return null;

  const { durationDays, gapDays } = inferSprintCadence(safe, items.length ? items : [base]);
  const startDate = parseIsoDate(base.end);
  if (!startDate) return null;
  startDate.setUTCDate(startDate.getUTCDate() + gapDays + 1);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + durationDays - 1);

  return {
    num,
    name: buildSprintName(safe, num),
    start: formatIsoDate(startDate),
    end: formatIsoDate(endDate),
    active: false,
  };
}

export function ensureUpcomingSprint(sprints = [], profile, activeSprintNum) {
  const safe = normaliseProjectProfile(profile);
  const items = normaliseSprints(sprints, safe);
  if (!items.length) return items;

  const activeNum = Number(activeSprintNum);
  const activeSprint = items.find((item) => item.num === activeNum) || items.find((item) => item.active) || items[items.length - 1];
  if (items.some((item) => item.num > activeSprint.num)) return items;

  const generated = buildGeneratedSprint(safe, items, activeSprint.num + 1, activeSprint);
  return generated ? [...items, generated] : items;
}

export function generateFutureSprints(sprints = [], profile, count = 6) {
  const safe = normaliseProjectProfile(profile);
  let items = normaliseSprints(sprints, safe);
  if (!items.length || count <= 0) return items;

  for (let index = 0; index < count; index += 1) {
    const last = items[items.length - 1];
    const nextNum = last.num + 1;
    if (items.some((item) => item.num === nextNum)) continue;
    const generated = buildGeneratedSprint(safe, items, nextNum, last);
    if (!generated) break;
    items = [...items, generated];
  }

  return items;
}

function recentHistorySummaryText(summary) {
  if (!summary || typeof summary !== "object") return "";
  const imported = textValue(summary?.setupHistory?.summary);
  if (imported) return imported;
  const meetingSummary = Array.isArray(summary?.meetings)
    ? summary.meetings.map((item) => textValue(item?.summary)).find(Boolean)
    : "";
  if (meetingSummary) return meetingSummary;
  return textValue(summary?.velocity?.summary || summary?.velocity?.recommendation);
}

function sprintStageLabel(sprint, activeSprintNum) {
  if (!sprint) return "planned";
  if (sprint.active) return "active";
  if (Number.isFinite(Number(activeSprintNum))) {
    if (sprint.num === Number(activeSprintNum)) return "active";
    if (sprint.num < Number(activeSprintNum)) return "completed";
    if (sprint.num > Number(activeSprintNum)) return "upcoming";
  }
  return "planned";
}

function hasRealProjectSeed(profile, sprintItems = [], sprintSummaries = {}) {
  const safe = normaliseProjectProfile(profile);
  const hasProjectIdentity = Boolean(
    safe.projectKey ||
    safe.projectName ||
    safe.primaryEpic ||
    safe.primaryEpicName ||
    safe.what ||
    safe.goal ||
    safe.phase ||
    safe.workstreams.length ||
    safe.team.length ||
    safe.stakeholders.length ||
    safe.watchTickets.length ||
    safe.knownRisks.length ||
    safe.knownDecisions.length,
  );

  const hasNonDefaultSprintSeed = sprintItems.some((sprint) => {
    const matchingDefault =
      sprint.num === 1
        ? { name: "Sprint 1", start: "2026-01-05", end: "2026-01-18" }
        : sprint.num === 2
          ? { name: "Sprint 2", start: "2026-01-19", end: "2026-02-01" }
          : null;
    if (!matchingDefault) return true;
    return (
      sprint.name !== matchingDefault.name ||
      sprint.start !== matchingDefault.start ||
      sprint.end !== matchingDefault.end
    );
  });

  return hasProjectIdentity || hasNonDefaultSprintSeed || Object.keys(sprintSummaries || {}).length > 0;
}

export function buildProjectSetupPrompt(profile = DEFAULT_PROJECT_PROFILE, sprints = [], sprintSummaries = {}) {
  const safe = normaliseProjectProfile(profile);
  const sprintItems = normaliseSprints(sprints, safe);
  const hasSeedContext = hasRealProjectSeed(safe, sprintItems, sprintSummaries);
  const activeSprintNum =
    sprintItems.find((item) => item.active)?.num ||
    sprintItems[sprintItems.length - 1]?.num ||
    null;
  const { durationDays, gapDays } = inferSprintCadence(safe, sprintItems);
  const sprintLines = sprintItems
    .slice(-8)
    .map((sprint) => `- ${sprint.num} | ${sprint.name} | ${sprint.start} | ${sprint.end} | ${sprintStageLabel(sprint, activeSprintNum)}`)
    .join("\n");
  const historyLines = Object.entries(sprintSummaries || {})
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, 4)
    .map(([num, summary]) => {
      const label = textValue(summary?.label) || `Sprint ${num}`;
      const detail = recentHistorySummaryText(summary) || "Archived sprint snapshot available";
      return `- ${num} | ${label} | ${detail}`;
    })
    .join("\n");
  const projectKeyLabel = safe.projectKey || "not configured";
  const projectNameLabel = safe.projectName || "not configured";
  const primaryEpicLabel = safe.primaryEpic
    ? `${safe.primaryEpic}${safe.primaryEpicName ? ` — ${safe.primaryEpicName}` : ""}`
    : "not configured";
  const scrumLeadLabel = safe.scrumMasterName
    ? `${safe.scrumMasterName}${safe.scrumMasterRole ? ` — ${safe.scrumMasterRole}` : ""}`
    : safe.scrumMasterRole || "not configured";

  return [
    `Use current Jira / Confluence / project documentation / delivery notes to prepare a reusable first-time project setup pack for a Scrum dashboard.`,
    `This setup must let the dashboard adapt to any project with one response, so return current confirmed project context, recent sprint history, active sprint board data, and sprint cadence.`,
    `Do not assume missing details. If a value is not known, use null or [] rather than guessing.`,
    ``,
    `Return ONLY valid JSON in this exact shape:`,
    `{`,
    `  "projectProfile": {`,
    `    "dashboardTitle": "optional legacy field, set to Scrum Intelligence or null",`,
    `    "projectLabel": "short footer label, or null",`,
    `    "projectKey": "jira project key or null",`,
    `    "projectName": "project / initiative name or null",`,
    `    "primaryEpic": "primary epic key or null",`,
    `    "primaryEpicName": "primary epic title or null",`,
    `    "goal": "current sprint or project goal in one sentence, or null",`,
    `    "phase": "current delivery phase, or null",`,
    `    "what": "short explanation of what the project does, or null",`,
    `    "scrumMasterName": "name, or null",`,
    `    "scrumMasterRole": "role, or null",`,
    `    "sprintNameTemplate": "template like {projectKey} Sprint {num}, or null",`,
    `    "sprintDurationDays": 14,`,
    `    "sprintGapDays": 1,`,
    `    "reviewDeckReference": "locked sprint review deck reference if known, or null",`,
    `    "reviewDeckGuidance": "how the review deck should be treated, or null",`,
    `    "workstreams": [{ "epic": "EPIC-1", "epicName": "workstream / epic title", "focus": "one-line focus or null" }],`,
    `    "team": [{ "name": "person", "role": "role" }],`,
    `    "stakeholders": [{ "name": "person", "role": "role" }],`,
    `    "watchTickets": ["TICKET-123"],`,
    `    "knownRisks": ["risk"],`,
    `    "knownDecisions": ["decision"]`,
    `  },`,
    `  "projectContext": { "projectKey": "jira project key or null", "epic": "primary epic key or null", "epicName": "primary epic title or null" },`,
    `  "sprints": [{ "num": 1, "name": "sprint name", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "active": true }],`,
    `  "activeSprint": 1,`,
    `  "recentSprintHistory": [{`,
    `    "num": 1,`,
    `    "name": "sprint name",`,
    `    "start": "YYYY-MM-DD",`,
    `    "end": "YYYY-MM-DD",`,
    `    "goal": "sprint goal or null",`,
    `    "status": "completed | partial | slipped | cancelled | unknown | null",`,
    `    "summary": "one-line sprint outcome",`,
    `    "carryOver": ["ticket or carry-over theme"],`,
    `    "completedHighlights": ["notable delivered item"],`,
    `    "risks": ["key blocker, risk, or dependency"],`,
    `    "metrics": { "committedPoints": 0, "completedPoints": 0, "committedTickets": 0, "completedTickets": 0 }`,
    `  }],`,
    `  "activeSprintBoard": {`,
    `    "summary": "one-line current sprint summary or null",`,
    `    "sprintGoal": "current sprint goal or null",`,
    `    "ragStatus": "on track | at risk | off track | unknown | null",`,
    `    "ragReason": "why the sprint is in that state, or null",`,
    `    "metrics": { "done": 0, "inprog": 0, "inreview": 0, "blocked": 0, "todo": 0, "backlog": 0, "total": 0, "health": "on track | at risk | off track | unknown | null" },`,
    `    "epicsInPlay": [{ "epic": "EPIC-1", "epicName": "epic title", "status": "active | blocked | review | todo | done | null", "focus": "what this epic is driving now or null", "deliveryNote": "delivery context or null" }],`,
    `    "ticketsDone": [{ "ticket": "TICKET-1", "summary": "title", "type": "epic | story | task | bug | spike | sub-task | null", "status": "Done", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],`,
    `    "ticketsInProgress": [{ "ticket": "TICKET-2", "summary": "title", "type": "story | task | bug | spike | sub-task | null", "status": "In Progress", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],`,
    `    "ticketsInReview": [{ "ticket": "TICKET-3", "summary": "title", "type": "story | task | bug | spike | sub-task | null", "status": "In Review", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],`,
    `    "ticketsBlocked": [{ "ticket": "TICKET-4", "summary": "title", "type": "story | task | bug | spike | sub-task | null", "status": "Blocked", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title", "reason": "current blocker reason or null" }],`,
    `    "ticketsTodo": [{ "ticket": "TICKET-5", "summary": "title", "type": "story | task | bug | spike | sub-task | null", "status": "To Do", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],`,
    `    "blockers": [{ "title": "headline", "detail": "current blocker detail", "ticketId": "TICKET-4", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],`,
    `    "staleInProgress": [{ "ticket": "TICKET-2", "summary": "title", "assignee": "name or unassigned", "days": 6, "epic": "EPIC-1", "epicName": "epic title" }],`,
    `    "notPickedUp": [{ "ticket": "TICKET-5", "summary": "title", "assignee": "name or unassigned", "days": 7, "epic": "EPIC-1", "epicName": "epic title" }],`,
    `    "questions": [{ "target": "person or group", "question": "question to ask", "why": "why this matters now", "needed": "what answer or decision is needed" }],`,
    `    "actions": [{ "focus": "specific follow-up", "owner": "person or group", "why": "reason", "detail": "important detail or null", "urgency": "today | this week | this sprint | next sprint | null", "ticketId": "TICKET-4 or null" }],`,
    `    "nextSteps": [{ "step": "next step", "owner": "person or group", "why": "reason", "detail": "important detail or null", "timing": "today | this week | next session | null" }],`,
    `    "decisions": [{ "decision": "decision made", "owner": "person or group", "why": "reason", "detail": "important detail or null" }],`,
    `    "risks": [{ "risk": "risk statement", "severity": "low | medium | high | null", "detail": "important detail or null", "owner": "person or group or null" }],`,
    `    "notes": ["high-signal setup note"]`,
    `  },`,
    `  "setupNotes": ["short note for the dashboard setup only"]`,
    `}`,
    ``,
    `Rules:`,
    `- Use the current project and current active sprint, not historical defaults.`,
    `- Determine the actual live current sprint from Jira / Rovo / project delivery evidence and return it as both the sprint with "active": true and the numeric "activeSprint" value.`,
    `- If any dashboard seed context below conflicts with current Jira / Confluence / project evidence, trust the live project evidence and return the real current sprint.`,
    `- Prefer confirmed Jira / Confluence / project data over assumptions.`,
    `- Include recent sprint history as quantity data: prefer at least the last 2 completed sprints, the active sprint, and the next 2 planned sprints when available.`,
    `- If future sprint dates are not explicitly listed but cadence is clear from recent sprints or delivery notes, infer the next sprint dates from that cadence.`,
    `- Include sprint cadence when known: sprintDurationDays = inclusive sprint length, sprintGapDays = gap days between sprints.`,
    `- Use recentSprintHistory to capture carry-over, recurring blockers, and delivery trends from previous sprints.`,
    `- Include every epic / workstream currently being worked on in or materially affecting the active sprint.`,
    `- Include all current sprint user stories, tasks, bugs, spikes, and sub-tasks that matter for the board.`,
    `- Include the current active sprint team from the scrum board / assignees when known, not only a generic team list.`,
    `- If team membership has changed, return the latest team only so rerunning setup refreshes the team list cleanly.`,
    `- If a ticket is both in progress and currently blocked / flagged, include it in both "ticketsInProgress" and "ticketsBlocked", and also add blocker detail in "blockers".`,
    `- Only classify blocked when Jira currently shows Blocked or current impediment / flagged evidence exists.`,
    `- Keep team and stakeholder names/roles concise.`,
    `- Keep known risks, decisions, notes, and actions high signal only.`,
    `- Metrics must line up with the ticket arrays when possible.`,
    `- Do not include commentary outside the JSON.`,
    ``,
    `Current dashboard seed context`,
    `Project key: ${projectKeyLabel}`,
    `Project name: ${projectNameLabel}`,
    `Primary epic: ${primaryEpicLabel}`,
    `Scrum lead hint: ${scrumLeadLabel}`,
    `Sprint naming template hint: ${safe.sprintNameTemplate || "not configured"}`,
    hasSeedContext
      ? `Sprint cadence hint: ${durationDays || "unknown"} day sprint${gapDays != null ? ` | ${gapDays} gap day${gapDays === 1 ? "" : "s"}` : ""}`
      : `Sprint cadence hint: no reliable dashboard sprint cadence is configured yet — infer the live cadence from Jira / Rovo / project delivery evidence.`,
    !hasSeedContext
      ? `Dashboard seed status: generic placeholder context only. Ignore placeholder sprint names or dates and determine the real current sprint directly from Jira / Rovo.`
      : "",
    safe.workstreams.length && hasSeedContext
      ? `Known workstreams in the dashboard:
${safe.workstreams.map((item) => `- ${item.epic || "unknown"} | ${item.epicName || "untitled"}${item.focus ? ` | ${item.focus}` : ""}`).join("\n")}`
      : "",
    sprintLines && hasSeedContext ? `Current sprint list in the dashboard:
${sprintLines}` : "",
    historyLines && hasSeedContext ? `Recent archived sprint context already in the dashboard:
${historyLines}` : "",
  ].filter(Boolean).join("\n");
}

export const PROJECT_SETUP_SYSTEM_PROMPT = `You convert project setup notes, delivery notes, or a Rovo project setup response into clean JSON for a Scrum dashboard.
Return ONLY valid JSON — no markdown, no commentary.

Schema:
{
  "projectProfile": {
    "dashboardTitle": "optional legacy field, use Scrum Intelligence or null",
    "projectLabel": "short footer label or null",
    "projectKey": "jira project key or null",
    "projectName": "project / initiative name or null",
    "primaryEpic": "primary epic key or null",
    "primaryEpicName": "primary epic title or null",
    "goal": "current project / sprint goal or null",
    "phase": "delivery phase or null",
    "what": "short explanation of what the project does or null",
    "scrumMasterName": "name or null",
    "scrumMasterRole": "role or null",
    "sprintNameTemplate": "template like {projectKey} Sprint {num} or null",
    "sprintDurationDays": 14,
    "sprintGapDays": 1,
    "reviewDeckReference": "locked review deck reference or null",
    "reviewDeckGuidance": "review deck handling guidance or null",
    "workstreams": [{ "epic": "EPIC-1", "epicName": "title", "focus": "one-line focus or null" }],
    "team": [{ "name": "person", "role": "role" }],
    "stakeholders": [{ "name": "person", "role": "role" }],
    "watchTickets": ["TICKET-123"],
    "knownRisks": ["risk"],
    "knownDecisions": ["decision"]
  },
  "projectContext": { "projectKey": "jira project key or null", "epic": "primary epic key or null", "epicName": "primary epic title or null" },
  "sprints": [{ "num": 1, "name": "sprint name", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "active": true }],
  "activeSprint": 1,
  "recentSprintHistory": [
    {
      "num": 1,
      "name": "sprint name",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "goal": "sprint goal or null",
      "status": "completed | partial | slipped | cancelled | unknown | null",
      "summary": "one-line sprint outcome",
      "carryOver": ["ticket or carry-over theme"],
      "completedHighlights": ["notable delivered item"],
      "risks": ["key blocker, risk, or dependency"],
      "metrics": { "committedPoints": 0, "completedPoints": 0, "committedTickets": 0, "completedTickets": 0 }
    }
  ],
  "activeSprintBoard": {
    "summary": "one-line sprint summary or null",
    "sprintGoal": "current sprint goal or null",
    "ragStatus": "on track | at risk | off track | unknown | null",
    "ragReason": "why the sprint is in that state or null",
    "metrics": { "done": 0, "inprog": 0, "inreview": 0, "blocked": 0, "todo": 0, "backlog": 0, "total": 0, "health": "on track | at risk | off track | unknown | null" },
    "epicsInPlay": [{ "epic": "EPIC-1", "epicName": "title", "status": "active | blocked | review | todo | done | null", "focus": "what this epic is driving now or null", "deliveryNote": "delivery context or null" }],
    "ticketsDone": [{ "ticket": "TICKET-1", "summary": "title", "type": "epic | story | task | bug | spike | sub-task | null", "status": "Done", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],
    "ticketsInProgress": [{ "ticket": "TICKET-2", "summary": "title", "type": "story | task | bug | spike | sub-task | null", "status": "In Progress", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],
    "ticketsInReview": [{ "ticket": "TICKET-3", "summary": "title", "type": "story | task | bug | spike | sub-task | null", "status": "In Review", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],
    "ticketsBlocked": [{ "ticket": "TICKET-4", "summary": "title", "type": "story | task | bug | spike | sub-task | null", "status": "Blocked", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title", "reason": "current blocker reason or null" }],
    "ticketsTodo": [{ "ticket": "TICKET-5", "summary": "title", "type": "story | task | bug | spike | sub-task | null", "status": "To Do", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],
    "blockers": [{ "title": "headline", "detail": "current blocker detail", "ticketId": "TICKET-4", "assignee": "name or unassigned", "epic": "EPIC-1", "epicName": "epic title" }],
    "staleInProgress": [{ "ticket": "TICKET-2", "summary": "title", "assignee": "name or unassigned", "days": 6, "epic": "EPIC-1", "epicName": "epic title" }],
    "notPickedUp": [{ "ticket": "TICKET-5", "summary": "title", "assignee": "name or unassigned", "days": 7, "epic": "EPIC-1", "epicName": "epic title" }],
    "questions": [{ "target": "person or group", "question": "question to ask", "why": "why this matters now", "needed": "what answer or decision is needed" }],
    "actions": [{ "focus": "specific follow-up", "owner": "person or group", "why": "reason", "detail": "important detail or null", "urgency": "today | this week | this sprint | next sprint | null", "ticketId": "TICKET-4 or null" }],
    "nextSteps": [{ "step": "next step", "owner": "person or group", "why": "reason", "detail": "important detail or null", "timing": "today | this week | next session | null" }],
    "decisions": [{ "decision": "decision made", "owner": "person or group", "why": "reason", "detail": "important detail or null" }],
    "risks": [{ "risk": "risk statement", "severity": "low | medium | high | null", "detail": "important detail or null", "owner": "person or group or null" }],
    "notes": ["high-signal setup note"]
  },
  "setupNotes": ["short note"]
}

Rules:
- Use null or [] when information is not available.
- Keep only current project information.
- If sprint names are not given but sprint numbers are given, infer a clean sprint name from the project key when obvious.
- If one sprint is marked active, set activeSprint to that sprint number.
- If no sprint is marked active but activeSprint is clear from the notes, use it.
- Prefer at least the last 2 completed sprints, the active sprint, and the next 2 planned sprints in "sprints" when that information is available.
- If future sprint dates are not explicitly listed but cadence is clear from recent sprints or delivery notes, infer the next sprint dates from that cadence.
- Team and stakeholder arrays should contain unique people only.
- workstreams must cover all epics / workstreams currently in play.
- Include sprint cadence when known: sprintDurationDays = inclusive sprint length, sprintGapDays = gap days between sprints.
- recentSprintHistory should summarise previous sprint outcomes, carry-over, recurring blockers, and quantitative metrics when those are known.
- Include the current active sprint team from the scrum board / assignees when known.
- If team membership has changed, return the latest team list only.
- watchTickets, knownRisks, knownDecisions, setupNotes, and notes must be concise and deduped.
- Include the current active sprint board snapshot with all relevant epics, stories, tasks, bugs, spikes, and sub-tasks grouped by status.
- If a ticket is both in progress and blocked right now, include it in both ticketsInProgress and ticketsBlocked and add the blocker detail.
- Only classify blocked when the current Jira state or current impediment / flagged signal supports it.
- Do not invent dates, Jira keys, assignees, metrics, or sprint cadence.`;

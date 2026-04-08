function textValue(value) {
  if (value == null) return "";
  const text = String(value).trim();
  return text && text !== "null" ? text : "";
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

export const DEFAULT_PROJECT_PROFILE = {
  dashboardTitle: "Scrum Intelligence",
  projectLabel: "UEL RPA Project",
  projectKey: "RPAB",
  projectName: "UK Prospect Data Cleansing Automation",
  primaryEpic: "RPAB-27",
  primaryEpicName: "UK Prospect Data Cleansing Automation",
  goal: "Get Prospect Dataset UAT completed and ready for CAB",
  phase: "Late build / system test — UAT and CAB readiness",
  what: "UiPath bot monitors SharePoint for UCAS/University Search prospect spreadsheets, cleanses and maps records using Crib sheet into CRM-ready Excel, creates Jira ticket with link to output, archives originals. No dispatcher — single Performer via UiPath Integration Service.",
  scrumMasterName: "Ali Khan",
  scrumMasterRole: "Senior Scrum Master",
  sprintNameTemplate: "{projectKey} Sprint {num}",
  reviewDeckReference: "RPA Sprint 2 Review - Recording Link included.pptx",
  reviewDeckGuidance: "Use the latest accepted stakeholder review deck as the locked format reference.",
  workstreams: [
    {
      epic: "RPAB-27",
      epicName: "UK Prospect Data Cleansing Automation",
      focus: "Prospect cleansing, UAT readiness, and CAB preparation",
    },
  ],
  team: [
    { name: "Ali Khan", role: "Senior Scrum Master" },
    { name: "Ahmed Sheikh", role: "Product Owner" },
    { name: "Zohaib Ahmed", role: "Business Analyst" },
    { name: "Marion Raji", role: "Business Analyst / UAT Lead" },
    { name: "Nick Baumer", role: "Solutions Architect / RPA Developer" },
    { name: "Todd Slaughter", role: "Lead Automation Developer" },
    { name: "Jahangir Ali", role: "Lead Automation Developer" },
  ],
  stakeholders: [
    { name: "Stefanie Walton", role: "Business Owner" },
    { name: "Laura Parker", role: "Process Owner" },
    { name: "Kazi Ehsan", role: "Lead UK Recruitment SME" },
    { name: "Meg Ruk", role: "Senior CRM Channel Manager" },
    { name: "Omkar Jaganade", role: "CRM SME" },
  ],
  watchTickets: ["RPAB-98", "RPAB-57", "RPAB-53", "RPAB-54", "RPAB-55", "RPAB-58", "RPAB-59", "RPAB-25"],
  knownRisks: [
    "RPAB-98 Jira API vs GUI unresolved — blocks ticket creation design",
    "UAT test data not provided by business (RPAB-57)",
    "QA environment not started (RPAB-53/54/55/58/59)",
    "Duplicate processing not handled in bot",
    "Audit record design undefined",
  ],
  knownDecisions: [
    "No dispatcher — single Performer via UiPath Integration Service",
    "UiPath workbook activities only — no Excel app",
    "Jira ticket raised with link not attachment",
    "All opt-ins set to FALSE",
    "No PII in Orchestrator logs",
    "Direct CRM upload manual — out of scope",
  ],
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
    .filter(Boolean)
    .sort((a, b) => a.num - b.num);

  return items.length ? items : [];
}

export function buildProjectSetupPrompt(profile = DEFAULT_PROJECT_PROFILE, sprints = []) {
  const safe = normaliseProjectProfile(profile);
  const sprintLines = normaliseSprints(sprints, safe)
    .slice(0, 6)
    .map((sprint) => `- ${sprint.num} | ${sprint.name} | ${sprint.start} | ${sprint.end}${sprint.active ? " | active" : ""}`)
    .join("\n");

  return [
    `Use current Jira / project documentation / delivery notes to prepare a full first-time project setup pack for a Scrum dashboard.`,
    `This setup must let the dashboard adapt to the current project with one response, so return only current confirmed project and sprint information.`,
    `Do not assume missing details. If a value is not known, use null or [] rather than guessing.`,
    ``,
    `Return ONLY valid JSON in this exact shape:`,
    `{`,
    `  "projectProfile": {`,
    `    "dashboardTitle": "short title for the app header, or null",`,
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
    `- Prefer confirmed Jira / project data over assumptions.`,
    `- Include the active sprint and the next few sprints if known.`,
    `- Include every epic / workstream currently being worked on in or materially affecting the active sprint.`,
    `- Include all current sprint user stories, tasks, bugs, spikes, and sub-tasks that matter for the board.`,
    `- If a ticket is both in progress and currently blocked / flagged, include it in both "ticketsInProgress" and "ticketsBlocked", and also add blocker detail in "blockers".`,
    `- Only classify blocked when Jira currently shows Blocked or current impediment / flagged evidence exists.`,
    `- Keep team and stakeholder names/roles concise.`,
    `- Keep known risks, decisions, notes, and actions high signal only.`,
    `- Metrics must line up with the ticket arrays when possible.`,
    `- Do not include commentary outside the JSON.`,
    ``,
    `Current dashboard seed context`,
    `Project key: ${safe.projectKey}`,
    `Project name: ${safe.projectName}`,
    `Primary epic: ${safe.primaryEpic} — ${safe.primaryEpicName}`,
    `Sprint naming template hint: ${safe.sprintNameTemplate}`,
    safe.workstreams.length
      ? `Known workstreams in the dashboard:\n${safe.workstreams.map((item) => `- ${item.epic || "unknown"} | ${item.epicName || "untitled"}${item.focus ? ` | ${item.focus}` : ""}`).join("\n")}`
      : "",
    sprintLines ? `Current sprint list in the dashboard:\n${sprintLines}` : "",
  ].filter(Boolean).join("\n");
}

export const PROJECT_SETUP_SYSTEM_PROMPT = `You convert project setup notes, delivery notes, or a Rovo project setup response into clean JSON for a Scrum dashboard.
Return ONLY valid JSON — no markdown, no commentary.

Schema:
{
  "projectProfile": {
    "dashboardTitle": "short title or null",
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
- Team and stakeholder arrays should contain unique people only.
- workstreams must cover all epics / workstreams currently in play.
- watchTickets, knownRisks, knownDecisions, setupNotes, and notes must be concise and deduped.
- Include the current active sprint board snapshot with all relevant epics, stories, tasks, bugs, spikes, and sub-tasks grouped by status.
- If a ticket is both in progress and blocked right now, include it in both ticketsInProgress and ticketsBlocked and add the blocker detail.
- Only classify blocked when the current Jira state or current impediment / flagged signal supports it.
- Do not invent dates, Jira keys, assignees, or metrics.`;

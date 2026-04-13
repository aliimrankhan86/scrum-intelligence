import { DEFAULT_PROJECT_PROFILE, buildSprintName } from './projectProfile';

export const PROJECT = DEFAULT_PROJECT_PROFILE;

function promptProjectKey(projectContext, projectProfile = PROJECT) {
  return projectContext?.projectKey || projectProfile?.projectKey || PROJECT.projectKey;
}

function promptEpicKey(projectContext, projectProfile = PROJECT) {
  return projectContext?.epic || projectProfile?.primaryEpic || PROJECT.primaryEpic;
}

function promptEpicName(projectContext, projectProfile = PROJECT) {
  return projectContext?.epicName || projectProfile?.primaryEpicName || PROJECT.primaryEpicName;
}

function promptProjectName(projectProfile = PROJECT, projectContext) {
  return (
    projectProfile?.projectName ||
    projectProfile?.primaryEpicName ||
    projectContext?.epicName ||
    PROJECT.projectName ||
    PROJECT.primaryEpicName
  );
}

function promptGoal(projectProfile = PROJECT) {
  return projectProfile?.goal || PROJECT.goal;
}

function promptSprintName(sprint, projectProfile = PROJECT) {
  return sprint?.name || buildSprintName(projectProfile || PROJECT, sprint?.num || 1);
}

function promptSprintNum(sprint) {
  return sprint?.num || 1;
}

function promptNextSprintName(nextSprint, projectProfile = PROJECT, currentSprint) {
  if (nextSprint?.name) return nextSprint.name;
  const nextNum = nextSprint?.num || ((currentSprint?.num || 0) + 1);
  return buildSprintName(projectProfile || PROJECT, nextNum);
}

function promptWorkstreams(projectProfile = PROJECT, projectContext) {
  const items = Array.isArray(projectProfile?.workstreams) ? projectProfile.workstreams : [];
  if (items.length) {
    return items
      .map((item) => {
        const epic = item?.epic || 'unknown epic';
        const epicName = item?.epicName || 'untitled workstream';
        return `${epic} — ${epicName}${item?.focus ? ` (${item.focus})` : ''}`;
      })
      .join(' | ');
  }
  const fallbackEpic = promptEpicKey(projectContext, projectProfile);
  const fallbackEpicName = promptEpicName(projectContext, projectProfile);
  return `${fallbackEpic} — ${fallbackEpicName}`;
}

function promptWatchTickets(projectProfile = PROJECT) {
  const items = Array.isArray(projectProfile?.watchTickets) ? projectProfile.watchTickets : [];
  return items.length ? items.join(' | ') : 'None recorded';
}

const UPCOMING_SPRINT_INTELLIGENCE_PROMPT =
`You extract sprint planning intelligence for the Scrum lead on the current project.
Input is sprint planning notes, refinement notes, or a meeting transcript from Hedy, Apple Notes, Teams, Notion, Granola, another meeting notes tool, or manual notes. Focus on what the team actually agreed or discovered for the next sprint named in the context.
This is upcoming-sprint intelligence, so capture useful context the Scrum lead can revisit later when shaping, prioritising, or committing the sprint.

Return ONLY this JSON — no explanation, no markdown:
{
  "carryForward": [{ "ticketId": "TICKET-123", "summary": "title", "reason": "why not done", "assignee": "name", "recommendation": "carry to next sprint|close|descope" }],
  "backlog": [{ "ticketId": "TICKET-123", "summary": "title", "priority": "high|medium|low", "ready": true, "notes": "any blocker or dependency" }],
  "dependencies": [{ "dependency": "what is needed", "owner": "who owns it", "status": "status", "risk": "impact if not resolved", "detail": "specific date, gate, fallback, or context when known" }],
  "teamLoad": [{ "name": "team member", "tickets": "current tickets", "capacity": "available|limited|none" }],
  "sprintRecommendation": [{ "ticketId": "TICKET-123", "summary": "title", "rationale": "why this sprint" }],
  "actions": [{ "focus": "short follow-up headline for the Scrum lead", "owner": "person or team to chase", "why": "why this matters for planning", "urgency": "today|this sprint|next sprint", "ticketId": "TICKET-123 or null", "detail": "specific follow-up detail the Scrum lead needs, such as target date, old/new change, or exact dependency to chase" }],
  "decisions": [{ "decision": "what was decided", "madeBy": "who", "impact": "brief impact", "detail": "specific agreed detail when known, especially target/fallback dates, rejected options, or changed planning approach" }],
  "risks": [{ "risk": "description", "level": "high|medium|low", "mitigation": "action" }],
  "questions": [{ "target": "ticket, person, or planning topic", "question": "what the Scrum lead should ask", "why": "why it matters for planning", "needed": "decision or confirmation needed" }],
  "notes": ["short refinement or planning context the Scrum lead should remember for the upcoming sprint"],
  "summary": "one sentence: readiness status for the named upcoming sprint"
}
Rules: use only the fields shown above, max 6 per array, max 25 words per item.
Question objects must be concise and use all 4 fields: target, question, why, needed.
Actions must be high-value follow-ups the Scrum lead should stay on top of, not every team task.
Capture the actual upcoming-sprint intelligence, not generic meeting notes. Include carry-forward logic, discovery readiness, dependency gates, and what is shaping the next sprint.
If the notes mention a target date and fallback date, include both in decision.detail, dependency.detail, or action.detail.
If the team rejects an option, capture that as a decision with the reason. Example: "Avoid partial go-live without Jira integration."
If planning approach changes, such as estimating tasks instead of user stories, capture that as a decision with detail.
If discovery work is blocked by access, recordings, test accounts, or requirement clarification, capture that clearly in dependencies or actions.
notes = the small set of useful context points the Scrum lead may need later when planning, prioritising, or revisiting this sprint in history.
Do not repeat the same point across actions, decisions, risks, dependencies, and notes unless each field adds different value.
Ignore humour, filler, and social chat unless it affects delivery, availability, or stakeholder confidence.`;

export const MEETINGS = {

  // ── DAILY STANDUP ──────────────────────────────────────────────────────────
  standup: {
    id: 'standup',
    label: 'Daily standup',
    color: '#2563eb',
    sections: ['questions','blockers','stale','actions'],
    useRovo: true,
    useNotes: true,
    rovoLabel: 'Before the meeting',
    notesLabel: 'After the meeting — paste transcript or meeting notes',
    notesPlaceholder: `Paste your standup transcript or meeting notes here...

Works with Hedy, Apple Notes, Teams transcript, Notion, Granola, other meeting notes tools, or manual notes.`,

    rovoPrompt: ({ projectContext, projectProfile, sprint, nextSprint }) => `Use the live Jira board for ${promptProjectKey(projectContext, projectProfile)} ${promptSprintName(sprint, projectProfile)} and reply in this exact format only. Do not add extra sections, commentary, markdown, or duplicates.
Only include tickets that are in ${promptSprintName(sprint, projectProfile)} unless the section explicitly says Backlog.
For every ticket, include the current Jira status, assignee, epic key, epic title, and most recent update date if available.
Use the latest Jira state from the board, sprint view, and recent ticket updates.
If a value is missing, write "null".

PROJECT: ${promptProjectKey(projectContext, projectProfile)} | PROJECT NAME: ${promptProjectName(projectProfile, projectContext)} | SPRINT: ${promptSprintNum(sprint)}

CONTEXT
Project key | Primary epic ID | Primary epic name | Current sprint name | Next sprint name
${promptProjectKey(projectContext, projectProfile)} | ${promptEpicKey(projectContext, projectProfile)} | ${promptEpicName(projectContext, projectProfile)} | ${promptSprintName(sprint, projectProfile)} | ${promptNextSprintName(nextSprint, projectProfile, sprint)}

WORKSTREAMS / EPICS IN PLAY
${promptWorkstreams(projectProfile, projectContext)}

WATCH TICKETS / PRIORITY ITEMS
${promptWatchTickets(projectProfile)}

TICKETS
List every ticket in ${promptSprintName(sprint, projectProfile)} on a separate line:
TICKET-123 | Epic ID | Epic name | Title | Status | Assignee | Last updated date

STALE IN PROGRESS (status = "In Progress", not updated in 5+ days)
List only tickets stuck in In Progress with no movement for 5 or more days:
TICKET-123 | Epic ID | Epic name | Title | Assignee | Days since update

NOT PICKED UP (status = "To Do" or "Backlog", sitting untouched)
List only tickets that have not been started:
TICKET-123 | Epic ID | Epic name | Title | Assignee | Days in backlog

BLOCKERS
List only tickets that are blocked right now.
Strict rule: a ticket is blocked only if Jira currently shows status = Blocked, or the issue is currently Flagged / Impediment.
Do not mark a ticket as blocked just because the description, comments, or linked work mention dependency issues, missing business input, or pending decisions.
TICKET-123 | Epic ID | Epic name | Title | Assignee | Reason blocked

TICKETS BY STATUS
Done — list each completed ticket:
TICKET-123 | Epic ID | Epic name | Title | Assignee

In Progress — list each active ticket:
TICKET-123 | Epic ID | Epic name | Title | Assignee

In Review — list each ticket under review:
TICKET-123 | Epic ID | Epic name | Title | Assignee

Blocked — list each blocked ticket:
TICKET-123 | Epic ID | Epic name | Title | Assignee

To Do — list each unstarted ticket (in sprint):
TICKET-123 | Epic ID | Epic name | Title | Assignee

COUNTS
Done: X
In Progress: X
In Review: X
Blocked: X
To Do: X
Backlog: X

HEALTH
One sentence: on track or at risk for sprint goal "${promptGoal(projectProfile)}" by the end of ${promptSprintName(sprint, projectProfile)}?

Important:
- Do not invent blocker reasons.
- Do not include the same ticket twice in the same section.
- Keep titles short but recognisable.
- Prefer the latest Jira information over older comments.
- If watch tickets are listed above, make sure their current Jira status is reflected accurately in the relevant section.
- If a ticket is blocked, make sure it also appears in the Blocked status section.
- If a ticket has moved recently, use the current status, not a previous one.
- Do not infer blocked from the title or description alone.
- If a ticket is In Progress, Selected for Sprint, To Do, In Review, or Done and there is no current impediment flag, keep it in its real status and do not put it in BLOCKERS.
- Treat dependency issues as risks/dependencies unless Jira explicitly shows the ticket is blocked right now.
- Before replying, cross-check that the Blocked count matches the number of tickets in the Blocked status list.`,

    systemPrompt:
`You extract standup intelligence for the Scrum lead on the current project.
The input is Rovo/Jira board data OR a standup transcript/notes.

Extract and return ONLY this JSON — no explanation, no markdown:
{
  "context": { "projectKey": "PROJECT or null", "epic": "EPIC-1 or null", "epicName": "epic title or null", "sprintName": "current sprint name or null" },
  "metrics": { "done": null, "inprog": null, "inreview": null, "blocked": null, "todo": null, "backlog": null, "health": "on track|at risk|behind|unknown" },
  "ticketsDone": [{ "ticket": "TICKET-123", "summary": "short title", "assignee": "name or unassigned", "epic": "EPIC-1 or null", "epicName": "epic title or null" }],
  "ticketsInProgress": [{ "ticket": "TICKET-123", "summary": "short title", "assignee": "name or unassigned", "epic": "EPIC-1 or null", "epicName": "epic title or null" }],
  "ticketsInReview": [{ "ticket": "TICKET-123", "summary": "short title", "assignee": "name or unassigned", "epic": "EPIC-1 or null", "epicName": "epic title or null" }],
  "ticketsBlocked": [{ "ticket": "TICKET-123", "summary": "short title", "assignee": "name or unassigned", "epic": "EPIC-1 or null", "epicName": "epic title or null" }],
  "ticketsTodo": [{ "ticket": "TICKET-123", "summary": "short title", "assignee": "name or unassigned", "epic": "EPIC-1 or null", "epicName": "epic title or null" }],
  "staleInProgress": [{ "ticket": "TICKET-123", "summary": "short title", "assignee": "name or unassigned", "days": 5, "epic": "EPIC-1 or null", "epicName": "epic title or null" }],
  "notPickedUp": [{ "ticket": "TICKET-123", "summary": "short title", "assignee": "name or unassigned", "days": 5, "epic": "EPIC-1 or null", "epicName": "epic title or null" }],
  "blockers": [{ "title": "short title", "detail": "reason", "ticketId": "TICKET-123", "assignee": "name", "epic": "EPIC-1 or null", "epicName": "epic title or null" }],
  "actions": [{ "focus": "short follow-up headline for the Scrum lead", "owner": "person or team to chase", "why": "why this matters now", "urgency": "today|this sprint|next sprint", "ticketId": "TICKET-123 or null", "detail": "specific follow-up detail when known, such as what must be updated, changed, confirmed, or communicated" }],
  "questions": [{ "target": "ticket, person, or topic", "question": "what the Scrum lead should ask", "why": "why this matters now", "needed": "decision, update, or confirmation needed" }],
  "notes": ["briefing note in plain English about what matters now"],
  "summary": "one sentence: most important thing to know right now"
}
Rules: use only the fields shown above, max 20 per ticket array, max 5 per other array, max 20 words per item.
Questions must reference a specific ticket, person, or topic, name who the Scrum lead should ask when known, and explain why it matters now. Put the person or team in target first when known.
Question objects must be concise and use all 4 fields: target, question, why, needed.
Actions must be senior-scrum-master follow-ups, not a task log. focus = short headline, owner = who the Scrum lead should chase or align with, why = decision/risk context.
notes = unique senior-scrum-master briefing points, not a transcript dump. Each note must stand on its own, explain what matters now, and avoid repeating the same point in different words.
If a note is about stale work, blockers, or not-started tickets, make the note specific and useful, not generic. Avoid vague notes such as "multiple tickets are stale" unless you also say what that means for the sprint.
Do not repeat counts already obvious from the dashboard unless the count itself is the point.
If epic information is present, always return both the epic Jira key and epic title. If either is missing, set it to "null".
staleInProgress = tickets currently "In Progress" with no status change in 5+ days.
notPickedUp = tickets in "To Do" or "Backlog" that no one has started yet.
ticketsDone/ticketsInProgress/ticketsInReview/ticketsBlocked/ticketsTodo = current board state by status — extract ALL tickets in each status.
Blocked logic:
- Only place a ticket in ticketsBlocked or blockers if the input explicitly shows the ticket is blocked right now: current Jira status = Blocked, current Flagged/Impediment marker, or a transcript explicitly says it is blocked now.
- Do not infer blocked from description text such as "waiting for business data", "dependency", "risk", "not provided", or "decision needed".
- If the ticket status is In Progress, To Do, Selected for Sprint, In Review, or Done and there is no explicit blocked/impediment signal, do not place it in ticketsBlocked or blockers.
- blockers must be a strict subset of ticketsBlocked and use the same ticket ids.
- A ticket can appear in only one of ticketsDone, ticketsInProgress, ticketsInReview, ticketsBlocked, ticketsTodo.
- metrics.done, metrics.inprog, metrics.inreview, metrics.blocked, and metrics.todo must match the ticket arrays whenever the arrays are present.`,

    notesSystemPrompt:
`You extract standup meeting context for the Scrum lead on the current project.
Input is a meeting transcript or standup notes after the meeting. The notes can come from Hedy, Apple Notes, Teams transcript, Notion, Granola, another meeting notes tool, or manual notes.

Important:
- Jira/Rovo remains the source of truth for board status, ticket counts, and blocked lists.
- Use this transcript only to add context, smart questions, follow-ups, and concise briefing notes.
- Do not change board-state arrays unless the transcript explicitly establishes a new current state beyond doubt.
- If status/board details are unclear in the transcript, return empty arrays for ticket/status fields rather than guessing.

Return ONLY this JSON — no explanation, no markdown:
{
  "context": { "projectKey": "PROJECT or null", "epic": "EPIC-1 or null", "epicName": "epic title or null", "sprintName": "current sprint name or null" },
  "metrics": { "done": null, "inprog": null, "inreview": null, "blocked": null, "todo": null, "backlog": null, "health": "on track|at risk|behind|unknown" },
  "ticketsDone": [],
  "ticketsInProgress": [],
  "ticketsInReview": [],
  "ticketsBlocked": [],
  "ticketsTodo": [],
  "staleInProgress": [],
  "notPickedUp": [],
  "blockers": [],
  "actions": [{ "focus": "short follow-up headline for the Scrum lead", "owner": "person or team to chase", "why": "why this matters now", "urgency": "today|this sprint|next sprint", "ticketId": "TICKET-123 or null", "detail": "specific follow-up detail when known, such as what must be updated, changed, confirmed, or communicated" }],
  "nextSteps": [{ "step": "what should happen next", "owner": "person or team", "timing": "today|this week|next standup|next session", "why": "why this matters now", "detail": "specific supporting detail when known, such as old/new time, exact date, or dependency update" }],
  "decisions": [{ "decision": "what was agreed or confirmed", "madeBy": "who", "impact": "brief practical impact", "detail": "specific agreed detail when known, especially before/after changes or exact new arrangements" }],
  "risks": [{ "risk": "delivery risk or dependency", "level": "high|medium|low", "mitigation": "what needs to happen next" }],
  "questions": [{ "target": "person, ticket, or topic", "question": "what the Scrum lead should ask", "why": "why this matters now", "needed": "decision, update, or confirmation needed" }],
  "notes": ["briefing note in plain English about what matters now"],
  "summary": "one sentence: most important standup context to know right now"
}
Rules: use only the fields shown above, max 5 questions, max 5 actions, max 5 nextSteps, max 5 decisions, max 5 risks, max 5 notes, max 20 words per item.
Questions must reference a specific person, ticket, or topic and explain why the Scrum lead should ask now.
Actions must be senior-scrum-master follow-ups, not a task log. Use them for the small set of things the Scrum lead should chase, align, or monitor after the standup.
actions = only the specific follow-ups the Scrum lead should personally do, chase, confirm, or update. Do not use actions for general team work.
actions.detail = the practical detail needed for that follow-up. Example: "Update Jira board and calendar from 11:30–12:30 to 11:00–12:00 every other Wednesday."
If there is a clear Scrum-lead action for a meeting point, put it in actions and do not restate the same point as a generic next step.
nextSteps = the concrete delivery checkpoints or operational follow-through that should happen next. These are not all team tasks; keep only the handful that matter for sprint flow. Do not repeat an action or decision unless the next step adds genuinely different operational value.
decisions = explicit agreements, approvals, or confirmed changes from the standup. Do not restate a decision as a next step unless the next step adds the concrete execution point.
If the transcript includes a changed meeting time, date, owner, support approach, or operating arrangement, capture the exact old/new detail in the right detail field.
Do not say only "time changed" or "support plan changed" when the transcript gives specifics. Example detail: "Changed from 11:30–12:30 to 11:00–12:00 every other Wednesday."
For example, if Sprint Refinement moves from 11:30–12:30 to 11:00–12:00, capture:
- action = "Update Sprint Refinement meeting time in Jira and calendars"
- decision = the approved old/new time change
- do not also add a generic next step like "Conduct Sprint Refinement at the new time"
risks = real delivery or stakeholder risks raised in the standup, not generic worries.
Do not repeat the same meeting point across actions, nextSteps, decisions, risks, and notes unless each section adds a clearly different purpose.
notes must be concise, unique, and useful for running the sprint conversation.
Ignore social chat, humour, personal anecdotes, and informal bonding unless they materially affect delivery, availability, or stakeholder confidence.
If someone confirms a blocker is removed, test data is shared, a meeting time changes, or a support approach is agreed, capture that as a decision, next step, action, or note rather than dropping it.`,
  },

  // ── REFINEMENT ─────────────────────────────────────────────────────────────
  refinement: {
    id: 'refinement',
    label: 'Refinement',
    color: '#22c55e',
    sections: ['questions','carryForward','backlog','dependencies','actions','decisions','notes'],
    useRovo: false,
    useNotes: true,
    rovoLabel: null,
    notesLabel: 'Paste transcript or refinement notes',
    notesPlaceholder: `Paste your refinement transcript or notes here.

Useful content:
- Candidate items for the upcoming sprint
- Carry-forward items and why they remain open
- Discovery readiness and blocked access
- Priority calls, decision gates, and rejected options
- Actions the Scrum lead should chase before planning

Works with Hedy, Apple Notes, Teams transcript, Notion, Granola, other meeting notes tools, or manual notes.`,

    rovoPrompt: null,
    systemPrompt: UPCOMING_SPRINT_INTELLIGENCE_PROMPT,
  },

  // ── SPRINT PLANNING ────────────────────────────────────────────────────────
  planning: {
    id: 'planning',
    label: 'Sprint planning',
    color: '#16a34a',
    sections: ['questions','carryForward','backlog','dependencies','actions','decisions'],
    useRovo: false,
    useNotes: true,
    rovoLabel: null,
    notesLabel: 'Paste transcript or sprint planning notes',
    notesPlaceholder: `Paste your sprint planning transcript or agreed notes here.

Useful content:
- What is carrying forward from the current sprint
- What was selected for the next sprint
- What was left out and why
- Dependencies, risks, and team capacity
- Actions and decisions made during planning

Works with Hedy, Apple Notes, Teams transcript, Notion, Granola, other meeting notes tools, or manual notes.`,

    rovoPrompt: null,
    systemPrompt: UPCOMING_SPRINT_INTELLIGENCE_PROMPT,
  },

  // ── SPRINT REVIEW ──────────────────────────────────────────────────────────
  review: {
    id: 'review',
    label: 'Sprint review',
    color: '#d97706',
    sections: ['goalVerdict','completed','incomplete','actions','decisions','notes'],
    useRovo: false,
    useNotes: true,
    rovoLabel: null,
    notesLabel: 'Paste transcript or sprint review notes',
    notesPlaceholder: `Paste your sprint review transcript or notes here.

Can include:
- What was demoed and stakeholder reactions
- What was completed vs not completed
- Decisions made or confirmed
- Actions agreed
- Any feedback or new requests

Plain notes, bullet points, or full transcript — all accepted.
Works with Hedy, Apple Notes, Teams transcript, Notion, Granola, other meeting notes tools, or manual notes.`,

    systemPrompt:
`You extract sprint review intelligence for the Scrum lead on the current project.
Input is a meeting transcript or sprint review notes — any format accepted. The notes can come from Hedy, Apple Notes, Teams transcript, Notion, Granola, another meeting notes tool, or manual notes.

Return ONLY this JSON — no explanation, no markdown:
{
  "sprintGoal": { "achieved": true, "evidence": "one sentence explanation" },
  "completed": [{ "ticketId": "TICKET-123 or null", "summary": "what was delivered in plain English" }],
  "incomplete": [{ "ticketId": "TICKET-123 or null", "summary": "what", "reason": "why not done" }],
  "stakeholderFeedback": ["feedback point 1", "feedback point 2"],
  "actions": [{ "focus": "short follow-up headline for the Scrum lead", "owner": "person or team to chase", "why": "why it matters after the review", "urgency": "today|this sprint|next sprint", "ticketId": "null" }],
  "decisions": [{ "decision": "what was decided", "madeBy": "who", "impact": "brief" }],
  "notes": ["key note from the review"],
  "summary": "one sentence: sprint review outcome"
}
Rules: use only the fields shown above, max 6 per array, max 25 words per item. If info not in notes, return [].
Actions must capture only material follow-ups the Scrum lead should monitor after the review.
Do not draft slide bullets, deck text, or presentation wording — this prompt is only for review intelligence from the transcript or notes.`,
  },

  // ── RETROSPECTIVE ──────────────────────────────────────────────────────────
  retro: {
    id: 'retro',
    label: 'Retrospective',
    color: '#dc2626',
    sections: ['wentWell','didntGoWell','actions','notes'],
    useRovo: false,
    useNotes: true,
    rovoLabel: null,
    notesLabel: 'Paste transcript or retro notes',
    notesPlaceholder: `Paste your retrospective notes or transcript here.

Can be bullet points like:
WENT WELL: ...
DIDN'T GO WELL: ...
ACTIONS: ...

Or just paste the transcript — any format works.
Works with Hedy, Apple Notes, Teams transcript, Notion, Granola, other meeting notes tools, or manual notes.`,

    systemPrompt:
`You extract retrospective intelligence for the Scrum lead on the current project.
Input is retro notes or a meeting transcript — any format, bullet points or freeform. The notes can come from Hedy, Apple Notes, Teams transcript, Notion, Granola, another meeting notes tool, or manual notes.
Keep everything simple and concise — no over-engineering.

Return ONLY this JSON — no explanation, no markdown:
{
  "wentWell": ["positive point 1", "positive point 2", "positive point 3"],
  "didntGoWell": ["issue 1", "issue 2", "issue 3"],
  "actions": [{ "focus": "short improvement headline", "owner": "person or team to chase", "why": "why this improvement matters", "urgency": "next sprint" }],
  "notes": ["any other important point"],
  "summary": "one sentence: key retro outcome"
}
Rules: use only the fields shown above, max 5 per array, max 20 words per item. Keep it simple.
Actions must stay outcome-focused, not read like a long task list.`,
  },

  // ── RPA DISCOVERY CALL ─────────────────────────────────────────────────────
  discovery: {
    id: 'discovery',
    label: 'RPA discovery call',
    color: '#0891b2',
    sections: ['questions','openQuestions','decisions','actions','risks','notes'],
    useRovo: false,
    useNotes: true,
    rovoLabel: null,
    notesLabel: 'Paste transcript or discovery call notes',
    notesPlaceholder: `Paste your discovery call notes or transcript here...

Works with Hedy, Apple Notes, Teams transcript, Notion, Granola, other meeting notes tools, or manual notes.`,
    rovoPrompt: null,

    systemPrompt:
`You extract discovery call intelligence for the Scrum lead on the current project.
Input is a meeting transcript or discovery call notes after the call. The notes can come from Hedy, Apple Notes, Teams transcript, Notion, Granola, another meeting notes tool, or manual notes.

Return ONLY this JSON — no explanation, no markdown:
{
  "openQuestions": [{ "question": "the question", "source": "TICKET-123 or document source", "status": "open|in progress" }],
  "scopeBoundaries": { "inScope": ["item 1"], "outOfScope": ["item 1"], "unclear": ["item 1"] },
  "unresolvedDecisions": [{ "decision": "what needs deciding", "detail": "context", "owner": "who decides" }],
  "actions": [{ "focus": "short follow-up headline for the Scrum lead", "owner": "person or team to chase", "why": "why this matters now", "urgency": "today|this sprint|next sprint", "ticketId": "TICKET-123 or null" }],
  "decisions": [{ "decision": "what was confirmed", "madeBy": "who", "impact": "brief" }],
  "risks": [{ "risk": "description", "level": "high|medium|low", "mitigation": "action" }],
  "notes": ["key point from call"],
  "questions": [{ "target": "topic, document, or person", "question": "what the Scrum lead should ask", "why": "why it matters now", "needed": "decision or clarification needed" }],
  "summary": "one sentence: key discovery outcome"
}
Rules: use only the fields shown above, max 5 per array, max 25 words per item.
Question objects must be concise and use all 4 fields: target, question, why, needed.
Actions must surface only the follow-ups the Scrum lead should actively chase or monitor.`,
  },

  // ── STAKEHOLDER UPDATE ─────────────────────────────────────────────────────
  stakeholder: {
    id: 'stakeholder',
    label: 'Stakeholder update',
    color: '#7c3aed',
    sections: ['ragStatus','questions','actions','decisions','risks','notes'],
    useRovo: false,
    useNotes: true,
    rovoLabel: null,
    notesLabel: 'Paste transcript or stakeholder update notes',
    notesPlaceholder: `Paste your stakeholder meeting notes or transcript here...

Works with Hedy, Apple Notes, Teams transcript, Notion, Granola, other meeting notes tools, or manual notes.`,
    rovoPrompt: null,

    systemPrompt:
`You extract stakeholder update intelligence for the Scrum lead on the current project.
Input is a meeting transcript or stakeholder meeting notes. The notes can come from Hedy, Apple Notes, Teams transcript, Notion, Granola, another meeting notes tool, or manual notes.
Keep language plain and non-technical — this is for business leadership.

Return ONLY this JSON — no explanation, no markdown:
{
  "ragStatus": "RED|AMBER|GREEN",
  "ragReason": "one sentence plain English explanation",
  "achievements": ["achievement 1 in plain English", "achievement 2"],
  "inProgress": ["what team is working on this week"],
  "actions": [{ "focus": "short follow-up headline for the Scrum lead", "owner": "person or team to chase", "why": "why this matters for stakeholder confidence", "urgency": "today|this sprint|next sprint", "ticketId": "null" }],
  "decisions": [{ "decision": "what was decided or confirmed", "madeBy": "who", "impact": "brief" }],
  "risks": [{ "risk": "plain English description", "level": "high|medium|low", "mitigation": "what is needed" }],
  "stakeholderActions": [{ "action": "what business needs to provide", "owner": "stakeholder name", "urgency": "urgent|this week|this sprint" }],
  "notes": ["key point from meeting"],
  "questions": [{ "target": "stakeholder, decision, or business item", "question": "what the Scrum lead should ask", "why": "why it matters for the update", "needed": "decision, input, or confirmation needed" }],
  "summary": "one sentence plain English project status"
}
Rules: use only the fields shown above, max 5 per array, max 25 words per item, plain English throughout.
Question objects must be concise and use all 4 fields: target, question, why, needed.
Actions must be the small set of follow-ups the Scrum lead should keep on top of after the update.`,
  },
};

export const DEFAULT_SPRINTS = [
  { num: 1, name: buildSprintName(DEFAULT_PROJECT_PROFILE, 1), start: '2026-01-05', end: '2026-01-18', active: true },
  { num: 2, name: buildSprintName(DEFAULT_PROJECT_PROFILE, 2), start: '2026-01-19', end: '2026-02-01', active: false },
];

// ─── Insights / Velocity meeting config ───────────────────────────────────────
export const INSIGHTS_CONFIG = {
  rovoPrompt: ({ projectContext, projectProfile, sprint, nextSprint }) => `Use Jira data for ${promptProjectKey(projectContext, projectProfile)} only and reply in this exact format only. Do not add commentary or estimates.
Use the last 3 completed sprints plus the current sprint.
If a value is missing in Jira, write "not recorded".
Use committed values from the sprint start and completed values from the sprint close, or current completed values for the active sprint.

CONTEXT
Project key | Project name | Primary epic ID | Primary epic name | Current sprint name | Next sprint name
${promptProjectKey(projectContext, projectProfile)} | ${promptProjectName(projectProfile, projectContext)} | ${promptEpicKey(projectContext, projectProfile)} | ${promptEpicName(projectContext, projectProfile)} | ${promptSprintName(sprint, projectProfile)} | ${promptNextSprintName(nextSprint, projectProfile, sprint)}

WORKSTREAMS / EPICS IN PLAY
${promptWorkstreams(projectProfile, projectContext)}

SPRINT VELOCITY

For each of the last 3 completed sprints, provide one block in this exact shape:
Sprint number: [number]
Sprint name: [name]
Committed story points: [number]
Completed story points: [number]
Committed tickets: [number]
Completed tickets: [number]

Current sprint ${promptSprintNum(sprint)} (${promptSprintName(sprint, projectProfile)} — in progress)
Committed story points: [number]
Completed so far: [number]
Committed tickets: [number]
Completed so far: [number]

Important:
- Do not estimate missing story points.
- Keep the real sprint numbering and names from Jira.
- Use ticket counts from Jira, not a manual guess.`,

  systemPrompt: `You extract sprint velocity and coaching insights for the Scrum lead on the current project.
Input is Rovo/Jira velocity data.

Return ONLY this JSON — no explanation, no markdown:
{
  "context": { "projectKey": "PROJECT or null", "epic": "EPIC-1 or null", "epicName": "epic title or null", "sprintName": "current sprint name or null" },
  "sprints": [
    { "num": 11, "name": "Project Sprint 11", "committedPoints": null, "completedPoints": null, "committedTickets": null, "completedTickets": null },
    { "num": 12, "name": "Project Sprint 12", "committedPoints": null, "completedPoints": null, "committedTickets": null, "completedTickets": null },
    { "num": 13, "name": "Project Sprint 13", "committedPoints": null, "completedPoints": null, "committedTickets": null, "completedTickets": null }
  ],
  "current": { "num": null, "name": "current sprint name or null", "committedPoints": null, "completedPoints": null, "committedTickets": null, "completedTickets": null },
  "insights": ["coaching insight 1 — specific pattern or risk observed", "insight 2", "insight 3"],
  "recommendation": "one specific delivery recommendation based on velocity data, or null if none",
  "summary": "one sentence velocity summary"
}
Rules: insights must be specific to the current project's delivery patterns — carry-overs, stale tickets, capacity gaps. Max 3 insights, max 25 words each. Recommendation only if genuinely relevant to the current primary epic.`
};

import { interpolatePrompt } from '../utils/interpolatePrompt';

const LOCKED_DECK_NAME = 'RPA Sprint 2 Review - Recording Link included.pptx';

function textValue(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text && text !== 'null' ? text : '';
}

function optionalContext(label, value) {
  const text = textValue(value);
  return text ? `${label}: ${text}` : '';
}

function resolveWorkstreams(workstreams, epicKey, epicName) {
  const cleaned = (Array.isArray(workstreams) ? workstreams : [])
    .map((item) => ({
      epic: textValue(item?.epic),
      epicName: textValue(item?.epicName),
      focus: textValue(item?.focus),
    }))
    .filter((item) => item.epic || item.epicName);

  if (cleaned.length) return cleaned;

  const fallbackEpic = textValue(epicKey);
  const fallbackEpicName = textValue(epicName);
  if (fallbackEpic || fallbackEpicName) {
    return [{ epic: fallbackEpic, epicName: fallbackEpicName, focus: '' }];
  }
  return [{ epic: '', epicName: 'Primary workstream from Jira', focus: '' }];
}

export function buildRovoMasterPrompt({
  projectKey = 'PROJECT',
  projectName = '',
  epicKey = '',
  epicName = '',
  workstreams = [],
  sprintNumber,
  sprintName,
  sprintDates,
  reviewDeckReference = LOCKED_DECK_NAME,
  reviewNote,
  wordingNote,
  knownNote,
  stakeholderInstruction,
  sensitiveWordingNote,
} = {}) {
  const sprintLabel = textValue(sprintName) || (sprintNumber ? `Sprint ${sprintNumber}` : 'current active sprint');
  const datesLabel = textValue(sprintDates) || 'Use the active sprint dates from Jira.';
  const epicLabel = [textValue(epicKey), textValue(epicName)].filter(Boolean).join(' — ') || 'Use the primary epic shown in Jira';
  const workstreamItems = resolveWorkstreams(workstreams, epicKey, epicName);
  const coreWorkstreams = workstreamItems.slice(0, 2);
  const additionalWorkstreams = workstreamItems.slice(2);
  const workstreamSummary = workstreamItems
    .map((item) => `${item.epic || 'unknown epic'} — ${item.epicName || 'untitled workstream'}${item.focus ? ` (${item.focus})` : ''}`)
    .join(' | ');
  const combinedReviewNote = textValue(reviewNote) || [textValue(knownNote), textValue(stakeholderInstruction)].filter(Boolean).join(' ');
  const combinedWordingNote = textValue(wordingNote) || textValue(sensitiveWordingNote);
  const additionalContext = [
    optionalContext('Optional review note', combinedReviewNote),
    optionalContext('Optional wording note', combinedWordingNote),
  ].filter(Boolean);

  return interpolatePrompt([
    `You are preparing the current sprint review evidence for project ${projectName || projectKey}. Use the latest Jira information only. This is for a wider stakeholder audience, not an internal Jira summary.`,

    `CURRENT SPRINT CONTEXT
Project key: ${projectKey}
Active sprint in Jira: identify and use the current active sprint
Sprint hint from dashboard: ${sprintLabel}
Date hint from dashboard: ${datesLabel}
Primary epic: ${epicLabel}
Known workstreams / epics in play: ${workstreamSummary}`,

    additionalContext.length
      ? ['ADDITIONAL CONTEXT', ...additionalContext].join('\n')
      : '',

    `OBJECTIVE
Gather only the current sprint content needed to update the locked stakeholder deck that follows the sample deck format in ${reviewDeckReference}.
Prefer current sprint board state, completed delivery, and confirmed outcomes over older comments or historical assumptions.
If the sprint hint from the dashboard differs from Jira, trust Jira.`,

    `DECK RULES
- The deck format is locked, so your output must be concise and ready to map into a fixed slide structure.
- Use stakeholder-friendly wording with only light Agile framing.
- Do not turn this into a Jira board summary.
- Avoid heavy delivery jargon, ticket-by-ticket narration, and internal shorthand unless needed as evidence.
- Slide 2 "How We Work Together" is normally treated as fixed unless there is a real reason to change it.
- Focus areas must be specific, outcome-led, and proof-point based.
- Epic / workstream sections must support traceability back to the epic or workstream.
- If a new epic or workstream genuinely needs its own slide, say so clearly. Otherwise do not force it.
- Do not return static business-case content from the sample deck unless it has genuinely changed and you are confident it is confirmed.`,

    `RETURN THIS EXACT STRUCTURE IN UK ENGLISH

SPRINT REVIEW EVIDENCE

1. Cover slide
Sprint name from Jira:
Sprint dates from Jira:
Short sprint subtitle: max 8 words, outcome-led, stakeholder-friendly

2. Sprint overview
Sprint goal:
Committed story points:
Completed story points:
Carry-over note if needed:
3 to 5 focus areas only if evidenced:
- Focus area
- Outcome
- Proof point
- Why it matters

3. Workstream slide 1
Use this for the first relevant workstream / epic from Jira: ${coreWorkstreams[0]?.epic || 'unknown epic'}${coreWorkstreams[0]?.epicName ? ` — ${coreWorkstreams[0].epicName}` : ''}.
If not relevant this sprint, write "Not featured this sprint".
If relevant, provide:
- Slide title: use the existing title if still accurate
- Epic reference
- One-line delivery statement
- Delivered count if known
- 4 to 6 short delivered item labels
- Stakeholder summary paragraph
- Current status
- Safe timeline / status guidance
- Keep existing static business context: yes / no
- If no, state exactly what static business context needs updating

4. Workstream slide 2
Use this for the second relevant workstream / epic from Jira: ${coreWorkstreams[1]?.epic || 'Only add a second workstream if Jira shows one'}${coreWorkstreams[1]?.epicName ? ` — ${coreWorkstreams[1].epicName}` : ''}.
If there is no second relevant workstream, write "No second workstream slide needed".
If relevant, provide:
- Slide title: use the existing title if still accurate
- Epic reference
- One-line delivery statement
- Delivered count if known
- 4 to 6 short delivered item labels
- Stakeholder summary paragraph
- Current status
- Safe timeline / status guidance
- Keep existing static business context: yes / no
- If no, state exactly what static business context needs updating

5. Additional slide check
Additional workstream slide needed: yes / no
Reason:
Recommended slide title:
If yes, provide the same fields used above for any additional current workstream / epic beyond the first two. Known extra workstreams: ${additionalWorkstreams.length ? additionalWorkstreams.map((item) => `${item.epic || 'unknown epic'} — ${item.epicName || 'untitled workstream'}`).join(' | ') : 'none recorded'}.
If no, write "No additional slide needed".

6. Validation notes
List only the unconfirmed metrics, date cautions, wording risks, or claims that need careful handling.`,

    `RULES
- Use the latest Jira information for the current active sprint in Jira.
- Use "Not confirmed" if a metric, date, or claim is not reliably available.
- Do not invent dates, metrics, delivery counts, or stakeholder claims.
- Do not invent or refresh ROI numbers, hours saved, FTE figures, error rates, SLA percentages, process owner names, sponsor names, or target dates.
- Keep delivered item labels short and presentation-friendly.
- Keep the output concise enough to feed a locked stakeholder deck.
- If a workstream is thin this sprint, summarise it honestly rather than padding it.
- Recommend an extra workstream slide only when there is genuine evidence that it needs dedicated coverage.
- If you are unsure whether static deck content has changed, say "Keep existing static business context: yes".`,
  ]);
}

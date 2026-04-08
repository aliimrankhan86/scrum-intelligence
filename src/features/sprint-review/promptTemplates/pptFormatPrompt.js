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
  return [{ epic: '', epicName: 'Primary workstream from the evidence pack', focus: '' }];
}

export function buildPptFormatPrompt({
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
  const datesLabel = textValue(sprintDates) || 'Use the sprint dates returned by Rovo.';
  const epicLabel = [textValue(epicKey), textValue(epicName)].filter(Boolean).join(' — ') || 'Use the primary epic from the evidence pack';
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
    `You are updating a locked-format stakeholder Sprint Review deck for project ${projectName || projectKey}. Use UK English throughout.`,

    `USE THESE INPUTS
1. The Rovo output as the current sprint evidence base
2. The sample / previous PPT file ${reviewDeckReference} as the locked formatting and structure reference
3. Any additional PO, stakeholder, or presenter notes supplied with this prompt`,

    `CURRENT SPRINT CONTEXT
Project key: ${projectKey}
Sprint source of truth: use the sprint name and sprint dates from the Rovo output
Dashboard sprint hint: ${sprintLabel}
Dashboard date hint: ${datesLabel}
Primary epic: ${epicLabel}
Current workstreams / epics in play: ${workstreamSummary}`,

    additionalContext.length
      ? ['ADDITIONAL CONTEXT', ...additionalContext].join('\n')
      : '',

    `LOCKED FORMAT RULES
- Update the deck for the current sprint without changing the established slide logic.
- Preserve the locked structure, layout, colours, font hierarchy, and overall style.
- Preserve the established stakeholder-friendly Sprint Review tone.
- Keep the blue-panel contrast rule: dark blue backgrounds must keep light / turquoise text treatment. Never use dark text on dark blue backgrounds.
- Avoid major wording drift, slide drift, or visual drift from the existing deck.
- Reuse valid existing business context where it is still accurate.
- Replace only what genuinely needs updating for the current sprint.`,

`SLIDE LOGIC
- Slide 1 = title / cover
- Slide 2 = How We Work Together and is normally kept unchanged
- Slide 3 = sprint overview
- Slide 4 = first relevant current workstream / epic (${coreWorkstreams[0]?.epic || 'workstream 1'}${coreWorkstreams[0]?.epicName ? ` — ${coreWorkstreams[0].epicName}` : ''})
- Slide 5 = second relevant current workstream / epic (${coreWorkstreams[1]?.epic || 'only if a second workstream is genuinely active'}${coreWorkstreams[1]?.epicName ? ` — ${coreWorkstreams[1].epicName}` : ''})
- Add one extra epic / workstream slide only if the evidence genuinely supports it`,

    `CONTENT RULES
- Use the Rovo output as the evidence base for current sprint content.
- Use ${reviewDeckReference} as the structure and formatting reference.
- Keep light Agile framing only.
- Avoid Jira-heavy language and internal shorthand where stakeholder wording would be clearer.
- Avoid repetition across slides.
- Sharpen anything too generic.
- Handle unconfirmed dates, claims, or metrics carefully.
- Preserve static business-case content from the locked deck unless the Rovo output explicitly says it needs updating.
- Static business-case content includes problem statements, bot step descriptions, systems / apps, outcomes / ROI figures, Vision 2028 alignment text, sponsor names, process owner names, and long-term business-case wording.
- Never invent or refresh ROI numbers, hours saved, FTE figures, error rates, SLA percentages, process owner names, sponsor names, or target dates.`,

    `RETURN THIS EXACT REVIEW FORMAT

1. What to keep
- List the slide content or wording that should remain unchanged because it is still accurate and useful.

2. What to replace
- List the content that should be updated for the current sprint.

3. Exact revised wording by slide
For each slide provide:
- Slide number and title
- Keep
- Replace
- Exact revised wording

Required slides:
- Slide 1 / Cover
- Slide 2 / How We Work Together (usually keep as-is)
- Slide 3 / Sprint overview
- Slide 4 / ${coreWorkstreams[0]?.epicName || 'First current workstream'}${coreWorkstreams[0]?.epic ? ` (${coreWorkstreams[0].epic})` : ''}
- Slide 5 / ${coreWorkstreams[1]?.epicName || 'Second current workstream if genuinely active'}${coreWorkstreams[1]?.epic ? ` (${coreWorkstreams[1].epic})` : ''}
- Extra workstream slide only if genuinely needed for ${additionalWorkstreams.length ? additionalWorkstreams.map((item) => item.epicName || item.epic || 'additional workstream').join(' / ') : 'another active workstream'}

4. Wording to avoid
- List any Jira-heavy, over-technical, repetitive, or weak wording that should not be used.

5. Cautions about unconfirmed claims
- List any dates, metrics, claims, or roadmap wording that should be softened or marked as not confirmed.`,

    `FINAL RULES
- Preserve the stakeholder-friendly Sprint Review style.
- Do not redesign the deck.
- Do not turn the response into implementation notes or a Jira dump.
- If evidence is weak or not confirmed, write safe wording rather than inventing certainty.
- Keep the output practical so it can be pasted into a locked deck workflow in ChatGPT or Claude.
- Update only the content that genuinely changes sprint to sprint.
- If Slide 2 does not need changing, say so clearly rather than rewriting it.
- If the locked deck already contains valid static business context, keep it.`,
  ]);
}

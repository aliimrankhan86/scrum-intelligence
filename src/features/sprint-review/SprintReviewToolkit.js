import React from 'react';
import PromptCard from './PromptCard';
import SprintReviewForm from './SprintReviewForm';
import { buildRovoMasterPrompt } from './promptTemplates/rovoMasterPrompt';
import { buildPptFormatPrompt } from './promptTemplates/pptFormatPrompt';
import { copyToClipboard } from './utils/copyToClipboard';

const LOCKED_DECK_NAME = 'RPA Sprint 2 Review - Recording Link included.pptx';

function textValue(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text && text !== 'null' ? text : '';
}

function formatSprintDates(sprint) {
  if (!sprint?.start || !sprint?.end) return '';
  return `${sprint.start} to ${sprint.end}`;
}

function workstreamLabel(item) {
  const epic = textValue(item?.epic);
  const epicName = textValue(item?.epicName);
  return [epic, epicName].filter(Boolean).join(' — ');
}

export default function SprintReviewToolkit({
  colors,
  sprint,
  projectProfile,
  projectContext,
  value,
  onChange,
  onToast,
}) {
  const deckReference = projectProfile?.reviewDeckReference || LOCKED_DECK_NAME;
  const baseState = {
    projectKey: projectContext?.projectKey || 'PROJECT',
    projectName: projectProfile?.projectName || projectContext?.epicName || '',
    epicKey: projectContext?.epic || '',
    epicName: projectContext?.epicName || '',
    workstreams: projectProfile?.workstreams || [],
    sprintNumber: sprint?.num,
    sprintName: sprint?.name || '',
    sprintDates: formatSprintDates(sprint),
    reviewDeckReference: deckReference,
  };

  const promptState = {
    ...baseState,
    reviewNote:
      textValue(value?.reviewNote) ||
      [textValue(value?.knownNote), textValue(value?.stakeholderInstruction)].filter(Boolean).join(' '),
    wordingNote:
      textValue(value?.wordingNote) ||
      textValue(value?.sensitiveWordingNote),
  };

  const rovoPrompt = buildRovoMasterPrompt(promptState);
  const pptPrompt = buildPptFormatPrompt(promptState);
  const workstreams = Array.isArray(projectProfile?.workstreams) && projectProfile.workstreams.length
    ? projectProfile.workstreams
    : [{ epic: projectContext?.epic, epicName: projectContext?.epicName }];
  const primaryWorkstream = workstreamLabel(workstreams[0]) || 'Primary workstream from Jira';
  const secondaryWorkstream = workstreamLabel(workstreams[1]) || 'Second workstream if genuinely active';

  const handleCopy = async (text, label) => {
    const ok = await copyToClipboard(text);
    onToast(
      ok ? `${label} copied.` : `${label} could not be copied.`,
      !ok,
    );
    return ok;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          border: `1px solid ${colors.bd2}`,
          borderRadius: '14px',
          background: colors.bg1,
          padding: '18px',
        }}
      >
        <div
          style={{
            fontSize: '18px',
            fontWeight: '700',
            color: colors.text0,
            marginBottom: '8px',
          }}
        >
          Sprint Review Prompt Toolkit
        </div>
        <div style={{ fontSize: '13px', lineHeight: 1.65, color: colors.text1 }}>
          Purpose: use Rovo to pull the current sprint review content, then use ChatGPT or Claude to update the new deck in the locked format from {deckReference}. The prompts are now designed to update only the dynamic sprint content and to preserve the static business-case content unless it is explicitly confirmed as changed. Hedy below is still for your own review intelligence, not for slide writing.
        </div>
      </div>

      <SprintReviewForm
        colors={colors}
        sprint={sprint}
        projectProfile={projectProfile}
        projectContext={projectContext}
        value={value}
        onChange={onChange}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '14px',
        }}
      >
        <PromptCard
          colors={colors}
          title="Rovo prompt"
          description="Use this first. It pulls the current sprint review content from Jira / Rovo in the structure needed for the deck."
          checklist={[
            'Current active sprint name and dates from Jira',
            'Sprint goal and points if confirmed',
            '3 to 5 focus areas for the sprint overview slide',
            `${primaryWorkstream} update if featured this sprint`,
            `${secondaryWorkstream} update if featured this sprint`,
            'Validation notes for anything unconfirmed',
          ]}
          previewText={rovoPrompt}
          accentColor="#0052cc"
          onCopy={() => handleCopy(rovoPrompt, 'Rovo prompt')}
        />
        <PromptCard
          colors={colors}
          title="PPT update prompt"
          description={`Use this second. Paste it into ChatGPT or Claude with the Rovo result and attach ${deckReference} so the slide format stays locked.`}
          checklist={[
            'What to keep from the locked deck',
            'What to replace for the current sprint',
            'Exact revised wording by slide',
            `Dynamic workstream slides for ${primaryWorkstream}${secondaryWorkstream ? ` and ${secondaryWorkstream}` : ''}`,
            'Protection for static business-case content',
            'Wording to avoid',
            'Cautions for unconfirmed claims',
          ]}
          previewText={pptPrompt}
          accentColor="#7c3aed"
          onCopy={() => handleCopy(pptPrompt, 'PPT update prompt')}
        />
      </div>

      <div
        style={{
          border: `1px solid ${colors.bd2}`,
          borderRadius: '12px',
          background: colors.bg1,
          padding: '16px',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: '700',
            color: colors.text0,
            marginBottom: '8px',
          }}
        >
          Best result
        </div>
        <ol
          style={{
            margin: 0,
            paddingLeft: '18px',
            color: colors.text1,
            fontSize: '12px',
            lineHeight: 1.75,
          }}
        >
          <li>Leave the optional notes blank unless there is something important Rovo will not know.</li>
          <li>Copy the Rovo prompt and run it in Rovo. It is written to pick the active sprint name and dates from Jira.</li>
          <li>Copy the Rovo result.</li>
          <li>Attach {deckReference} in ChatGPT or Claude.</li>
          <li>Copy the PPT update prompt and paste it with the Rovo result.</li>
          <li>Use the returned wording to update the new PPTX in the same format.</li>
        </ol>
      </div>
    </div>
  );
}

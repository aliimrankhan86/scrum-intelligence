import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { meetingMergePolicy } from './App';
import { MEETINGS } from './config';
import { buildRovoMasterPrompt } from './features/sprint-review/promptTemplates/rovoMasterPrompt';
import { buildPptFormatPrompt } from './features/sprint-review/promptTemplates/pptFormatPrompt';
import { buildProjectSetupPrompt } from './projectProfile';
import { applyProjectSetupState, defaultState } from './store';

beforeEach(() => {
  window.localStorage.clear();
  Object.assign(navigator, {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(),
    },
  });
});

test('renders the scrum-intelligence dashboard shell', () => {
  render(<App />);
  expect(screen.getByText(/Scrum Intelligence/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /API keys/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Project setup/i })).toBeInTheDocument();
  expect(screen.getByText(/Sprint reference/i)).toBeInTheDocument();
  expect(screen.getByText(/^Refinement$/i)).toBeInTheDocument();
  expect(screen.queryByText(/Start Here/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Copy setup prompt/i)).not.toBeInTheDocument();
  expect(screen.getByText(/^Groq 70B$/i)).toBeInTheDocument();
  expect(screen.getByText(/^Cerebras Llama 3.1 8B$/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Dark$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Light$/i })).toBeInTheDocument();
});

test('migrates legacy rpab local storage into the scrum-intelligence store key', () => {
  window.localStorage.setItem(
    'rpab_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {},
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: '',
      cerebrasKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  expect(screen.getByText(/Scrum Intelligence/i)).toBeInTheDocument();
  expect(window.localStorage.getItem('scrum_intelligence_v8')).toBeTruthy();
  expect(window.localStorage.getItem('rpab_v8')).toBeNull();
});

test('copy prompt uses current sprint and epic context automatically', async () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 5, name: 'RPAB Sprint 5', start: '2026-04-16', end: '2026-04-29' }],
      activeSprint: 5,
      meetingData: {},
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-88',
        epicName: 'Student Intake Automation',
      },
      groqKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name: /Copy prompt/i }));
  });
  expect(await screen.findByText(/Copied/i)).toBeInTheDocument();

  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('PROJECT: RPAB | PROJECT NAME: UK Prospect Data Cleansing Automation | SPRINT: 5'),
  );
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('RPAB-88 | Student Intake Automation | RPAB Sprint 5'),
  );
});

test('uses Jira Rovo only for standup and insights, and Hedy-only elsewhere', async () => {
  render(<App />);

  expect(screen.getByText(/Jira Rovo Chat/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Sprint reference/i));
  expect(screen.queryByText(/Jira Rovo Chat/i)).not.toBeInTheDocument();
  expect(screen.getByText(/single source reference/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/^Refinement$/i));
  expect(screen.queryByText(/Jira Rovo Chat/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Refinement workspace \/ meeting notes/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Upcoming sprint — RPAB Sprint 5/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Paste the refinement discussion for RPAB Sprint 5/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Refinement area/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Refinement dashboard/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Velocity & insights/i));
  expect(screen.getByText(/Jira Rovo Chat/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Sprint planning/i));
  expect(screen.queryByText(/Jira Rovo Chat/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Sprint planning \/ meeting notes/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Upcoming sprint — RPAB Sprint 5/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Paste the sprint planning discussion for RPAB Sprint 5/i)).toBeInTheDocument();
  expect(screen.getByText(/Sprint planning dashboard/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Sprint review/i));
  expect(screen.queryByText(/Jira Rovo Chat/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Paste transcript or sprint review notes/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/RPA discovery call/i));
  expect(screen.queryByText(/Jira Rovo Chat/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Paste transcript or discovery call notes/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Stakeholder update/i));
  expect(screen.queryByText(/Jira Rovo Chat/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Paste transcript or stakeholder update notes/i)).toBeInTheDocument();
});

test('planning Hedy updates replace the current planning snapshot instead of stacking duplicates', () => {
  const policy = meetingMergePolicy('planning', 'Meeting notes');
  const refinementPolicy = meetingMergePolicy('refinement', 'Meeting notes');

  expect(policy.overwriteFields).toEqual(
    expect.arrayContaining([
      'carryForward',
      'backlog',
      'dependencies',
      'teamLoad',
      'sprintRecommendation',
      'actions',
      'decisions',
      'risks',
      'questions',
      'notes',
    ]),
  );
  expect(policy.appendFields).not.toEqual(expect.arrayContaining(['carryForward', 'actions', 'decisions', 'notes']));
  expect(refinementPolicy.overwriteFields).toEqual(expect.arrayContaining(['carryForward', 'actions', 'decisions', 'notes']));
});

test('refinement dashboard surfaces upcoming-sprint context, detail, and notes', async () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [
        { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' },
        { num: 5, name: 'RPAB Sprint 5', start: '2026-04-15', end: '2026-04-28' },
      ],
      activeSprint: 4,
      meetingData: {
        '4_refinement': {
          carryForward: [{
            ticketId: 'RPAB-98',
            summary: 'Understand how to interact with Jira',
            reason: 'CAB submission depends on final integration path',
            assignee: 'Nick Baumer',
            recommendation: 'carry to Sprint 5',
          }],
          backlog: [{
            ticketId: 'RPAB-140',
            summary: 'International deferrals discovery',
            priority: 'high',
            ready: false,
            notes: 'Priority candidate, but requires clearer business definition',
          }],
          dependencies: [{
            dependency: 'Confirm CAB slot and UAT sign-off path',
            owner: 'Ahmed Sheikh',
            status: '15 Apr happy path, 22 Apr fallback',
            risk: 'Partial go-live would create rework and stakeholder confusion',
            detail: '15 Apr depends on UAT sign-off by 13 Apr. 22 Apr is the fallback if dependencies slip.',
          }],
          sprintRecommendation: [{
            ticketId: 'RPAB-140',
            summary: 'International deferrals discovery',
            rationale: 'Fastest high-priority candidate if access and requirements are clarified early',
          }],
          actions: [{
            focus: 'Coordinate CAB readiness with Callum',
            owner: 'Ahmed Sheikh',
            why: 'CAB timing needs active alignment before the upcoming sprint',
            urgency: 'this sprint',
            ticketId: 'null',
            detail: 'Prepare for 15 Apr as the happy path, with 22 Apr ready as the fallback option.',
          }],
          decisions: [{
            decision: 'Do not split CAB into a partial release and later Jira integration release',
            madeBy: 'Team / Ahmed Sheikh',
            impact: 'Avoids extra stakeholder burden, rework, and a second CAB submission',
            detail: 'The team agreed not to go live without Jira integration because it would create a two-stage process.',
          }],
          risks: [{
            risk: 'EPAD discovery will stall without test user accounts',
            level: 'medium',
            mitigation: 'Ahmed to chase Sheree and Marion to share screen recordings in parallel',
          }],
          questions: [{
            target: 'Jane / LG Enhancement Edition',
            question: 'Will tomorrow’s clarification call confirm the missing requirements?',
            why: 'Solution design and next-sprint planning depend on it',
            needed: 'A clear yes/no on scope and readiness',
          }],
          notes: [
            'Next sprint should trial task-based estimation instead of estimating user stories.',
            'Next sprint should trial task-based estimation instead of estimating user stories.',
            'International deferrals is the strongest next discovery candidate once definition is clearer.',
          ],
          summary: 'Refinement readout: Sprint 5 needs CAB path clarity, discovery access, and selective carry-forward before commitment.',
          log: [],
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: '',
      cerebrasKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  await userEvent.click(screen.getByText(/^Refinement$/i));

  expect(screen.getAllByText(/Refinement area/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Questions to settle before RPAB Sprint 5/i)).toBeInTheDocument();
  expect(screen.getByText(/Candidate items for RPAB Sprint 5/i)).toBeInTheDocument();
  expect(screen.getByText(/Backlog candidates/i)).toBeInTheDocument();
  expect(screen.getByText(/^Actions for Ali$/i)).toBeInTheDocument();
  expect(screen.getByText(/Coordinate CAB readiness with Callum/i)).toBeInTheDocument();
  expect(screen.getByText(/Prepare for 15 Apr as the happy path, with 22 Apr ready as the fallback option\./i)).toBeInTheDocument();
  expect(screen.getByText(/Do not split CAB into a partial release and later Jira integration release/i)).toBeInTheDocument();
  expect(screen.getByText(/The team agreed not to go live without Jira integration because it would create a two-stage process\./i)).toBeInTheDocument();
  expect(screen.getByText(/15 Apr depends on UAT sign-off by 13 Apr\. 22 Apr is the fallback if dependencies slip\./i)).toBeInTheDocument();
  expect(screen.getByText(/Refinement notes for RPAB Sprint 5/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Next sprint should trial task-based estimation instead of estimating user stories\./i)).toHaveLength(1);
  expect(screen.getByText(/International deferrals is the strongest next discovery candidate once definition is clearer\./i)).toBeInTheDocument();
});

test('sprint reference rolls up summaries and key insight from other tabs', async () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          actions: [{ focus: 'Confirm Jira API delivery status', owner: 'Nick Baumer', why: 'Main sprint dependency', urgency: 'today' }],
          decisions: [{ decision: 'Team to support UAT directly this week', madeBy: 'Team', impact: 'Keeps stakeholder testing moving' }],
          risks: [{ risk: 'Jira API delay could block completion', level: 'high', mitigation: 'Confirm delivery path today' }],
          notes: ['UAT test data has now been shared.'],
          summary: 'Standup: sprint is still sensitive to Jira integration timing.',
          log: [{ date: '08/04/2026 09:10', summary: 'Standup: sprint is still sensitive to Jira integration timing.' }],
        },
        '4_refinement': {
          actions: [{ focus: 'Coordinate CAB readiness with Callum', owner: 'Ahmed Sheikh', why: 'Upcoming sprint gate', urgency: 'this sprint' }],
          decisions: [{ decision: 'Do not split CAB into a partial release', madeBy: 'Team', impact: 'Avoids rework' }],
          risks: [{ risk: 'EPAD discovery will stall without test accounts', level: 'medium', mitigation: 'Ahmed to chase access' }],
          notes: ['Next sprint should trial task-based estimation.'],
          summary: 'Refinement: Sprint 5 needs CAB path clarity before commitment.',
          log: [{ date: '08/04/2026 11:30', summary: 'Refinement: Sprint 5 needs CAB path clarity before commitment.' }],
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: '',
      cerebrasKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: '08/04/2026 11:30',
    }),
  );

  render(<App />);

  await userEvent.click(screen.getByText(/Sprint reference/i));

  expect(screen.getByText(/single source reference/i)).toBeInTheDocument();
  expect(screen.getByText(/Meeting readouts/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Standup: sprint is still sensitive to Jira integration timing\./i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Refinement: Sprint 5 needs CAB path clarity before commitment\./i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Actions for Ali across the sprint/i)).toBeInTheDocument();
  expect(screen.getByText(/Confirm Jira API delivery status/i)).toBeInTheDocument();
  expect(screen.getByText(/Coordinate CAB readiness with Callum/i)).toBeInTheDocument();
  expect(screen.getByText(/Cross-sprint notes and context/i)).toBeInTheDocument();
  expect(screen.getByText(/Refinement: Next sprint should trial task-based estimation\./i)).toBeInTheDocument();
});

test('sprint review prompt toolkit keeps the workflow simple and copies dynamic prompts cleanly', async () => {
  render(<App />);

  await userEvent.click(screen.getByText(/Sprint review/i));

  expect(screen.getByText(/Sprint Review Prompt Toolkit/i)).toBeInTheDocument();
  expect(screen.getByText(/Purpose: use Rovo to pull the current sprint review content/i)).toBeInTheDocument();
  expect(screen.getByText(/Usually leave these blank\. Use them only when you need to add context Rovo will not know/i)).toBeInTheDocument();
  expect(screen.getByText(/Locked format: RPA Sprint 2 Review - Recording Link included\.pptx/i)).toBeInTheDocument();
  expect(screen.getAllByText(/This prompt will give you/i).length).toBeGreaterThan(1);

  await userEvent.type(
    screen.getByLabelText(/Optional review note/i),
    'Keep the tone business-friendly and suitable for CAB attendees.',
  );
  await userEvent.type(
    screen.getByLabelText(/Optional wording note/i),
    'Avoid sounding too technical.',
  );

  const copyButtons = screen.getAllByRole('button', { name: /^Copy prompt$/i });

  await act(async () => {
    await userEvent.click(copyButtons[0]);
  });
  expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
    expect.stringContaining('Active sprint in Jira: identify and use the current active sprint'),
  );
  expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
    expect.stringContaining('Optional review note: Keep the tone business-friendly and suitable for CAB attendees.'),
  );
  expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
    expect.stringContaining('Optional wording note: Avoid sounding too technical.'),
  );

  await act(async () => {
    await userEvent.click(copyButtons[1]);
  });
  expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
    expect.stringContaining('RPA Sprint 2 Review - Recording Link included.pptx'),
  );
});

test('supports multi-select status filters and keeps blocked wording consistent', async () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          metrics: { done: 1, inprog: 2, inreview: 1, blocked: 1, todo: 1, backlog: 0, health: 'at risk' },
          questions: ['Ask Nick about RPAB-98'],
          blockers: [
            {
              title: 'Resolve Jira API access',
              detail: 'Waiting on a confirmed auth route',
              ticketId: 'RPAB-98',
              assignee: 'Nick',
              epic: 'RPAB-27',
              epicName: 'UK Prospect Data Cleansing Automation',
            },
            {
              title: 'Old blocker that should not stay visible',
              detail: 'Historical note',
              ticketId: 'RPAB-77',
              assignee: 'Marion',
              epic: 'RPAB-26',
              epicName: 'Older Epic',
            },
          ],
          stale: [],
          staleInProgress: [{
            ticket: 'RPAB-57',
            summary: 'Collect UAT data',
            assignee: 'Marion',
            days: 6,
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          notPickedUp: [{
            ticket: 'RPAB-59',
            summary: 'Start QA environment',
            assignee: 'Unassigned',
            days: 4,
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsDone: [{
            ticket: 'RPAB-25',
            summary: 'Archive originals',
            assignee: 'Todd',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsInProgress: [{
            ticket: 'RPAB-57',
            summary: 'Collect UAT data',
            assignee: 'Marion',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsInReview: [{
            ticket: 'RPAB-58',
            summary: 'Review workbook mapping',
            assignee: 'Jahangir',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsBlocked: [{
            ticket: 'RPAB-98',
            summary: 'Resolve Jira API access',
            assignee: 'Nick',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsTodo: [{
            ticket: 'RPAB-59',
            summary: 'Start QA environment',
            assignee: 'Unassigned',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          actions: [{
            owner: 'Nick',
            action: 'Confirm whether Jira API or GUI will be used',
            urgency: 'today',
            ticketId: 'RPAB-98',
          }],
          decisions: [],
          risks: [],
          notes: ['Need a decision on Jira auth today'],
          slides: [],
          completed: [],
          incomplete: [],
          log: [],
        },
      },
      sprintSummaries: {},
      groqKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  expect(screen.getByText(/^Blocked tickets$/i)).toBeInTheDocument();
  expect(screen.getByText(/Questions to ask/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Epic: RPAB-27/i).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Old blocker that should not stay visible/i)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Blocked/i }));
  await userEvent.click(screen.getByRole('button', { name: /In Progress/i }));

  expect(screen.getByText(/Blocked tickets/i)).toBeInTheDocument();
  expect(screen.getByText(/Tickets in progress/i)).toBeInTheDocument();
  expect(screen.getAllByText(/UK Prospect Data Cleansing Automation/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/^blocked$/i).length).toBeGreaterThan(1);
  expect(screen.getAllByText(/^Assignee$/i).length).toBeGreaterThan(1);
  expect(screen.getAllByText(/^Nick$/i).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Questions to ask/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Blocked/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /In Progress/i })).toHaveAttribute('aria-pressed', 'true');
});

test('renders contextual questions and follow-ups clearly', () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          metrics: { done: 0, inprog: 1, inreview: 0, blocked: 0, todo: 0, backlog: 0, health: 'at risk' },
          questions: [{
            target: 'RPAB-57 / Marion Raji',
            question: 'Do we now have complete UAT data from the business?',
            why: 'Ticket is still in progress and UAT readiness depends on it',
            needed: 'A clear yes/no update and next step',
          }],
          blockers: [],
          stale: [],
          staleInProgress: [],
          notPickedUp: [],
          ticketsDone: [],
          ticketsInProgress: [{
            ticket: 'RPAB-57',
            summary: 'UAT test data provided by the business',
            assignee: 'Marion Raji',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsInReview: [],
          ticketsBlocked: [],
          ticketsTodo: [],
          actions: [{
            focus: 'Confirm UAT data readiness',
            owner: 'Marion Raji',
            why: 'UAT validation cannot start without confirmed business data',
            urgency: 'today',
            ticketId: 'RPAB-57',
          }, {
            focus: 'Confirm UAT data readiness',
            owner: 'Marion Raji',
            why: 'UAT validation cannot start without confirmed business data',
            urgency: 'today',
            ticketId: 'RPAB-57',
          }],
          decisions: [],
          risks: [],
          notes: [],
          slides: [],
          completed: [],
          incomplete: [],
          log: [],
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  expect(screen.getByText(/Questions to ask/i)).toBeInTheDocument();
  expect(screen.getByText(/Do we now have complete UAT data from the business\?/i)).toBeInTheDocument();
  expect(screen.getByText(/^Ask$/i)).toBeInTheDocument();
  expect(screen.getByText(/^RPAB-57 \/ Marion Raji$/i)).toBeInTheDocument();
  expect(screen.getByText((_, node) => node?.textContent === 'Why: Ticket is still in progress and UAT readiness depends on it')).toBeInTheDocument();
  expect(screen.getByText((_, node) => node?.textContent === 'Need: A clear yes/no update and next step')).toBeInTheDocument();
  expect(screen.getByText(/^Actions for Ali$/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Confirm UAT data readiness/i)).toHaveLength(1);
  expect(screen.getByText((_, node) => node?.textContent === 'Lead: Marion Raji')).toBeInTheDocument();
  expect(screen.getByText((_, node) => node?.textContent === 'Why: UAT validation cannot start without confirmed business data')).toBeInTheDocument();
});

test('standup dashboard surfaces transcript actions, next steps, decisions, and risks clearly', () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          metrics: { done: 1, inprog: 3, inreview: 0, blocked: 1, todo: 1, backlog: 0, health: 'at risk' },
          questions: [{
            target: 'Nick Baumer / Jira API integration',
            question: 'Has IT delivery landed and can blocked API work start today?',
            why: 'Jira integration is still the main dependency on sprint flow',
            needed: 'A clear unblock / still blocked update',
          }],
          blockers: [{
            title: 'Jira API integration still blocked',
            detail: 'Waiting on delivery from the IT project board',
            ticketId: 'RPAB-98',
            assignee: 'Nick Baumer',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          stale: [],
          staleInProgress: [],
          notPickedUp: [],
          ticketsDone: [{
            ticket: 'RPAB-25',
            summary: 'Archive originals',
            assignee: 'Todd Slaughter',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsInProgress: [{
            ticket: 'RPAB-57',
            summary: 'UAT test data provided by the business',
            assignee: 'Marion Raji',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsInReview: [],
          ticketsBlocked: [{
            ticket: 'RPAB-98',
            summary: 'Understand how to interact with Jira',
            assignee: 'Nick Baumer',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsTodo: [{
            ticket: 'RPAB-102',
            summary: 'Component libraries QA',
            assignee: 'Jahangir Ali',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          actions: [{
            focus: 'Confirm Jira API delivery status',
            owner: 'Nick Baumer',
            why: 'Blocked integration work may unblock today and affects team planning',
            urgency: 'today',
            ticketId: 'RPAB-98',
          }, {
            focus: 'Update Sprint Refinement meeting time in Jira and calendars',
            owner: 'Ali Khan',
            why: 'The agreed time change needs reflecting before the next session',
            urgency: 'today',
            ticketId: 'null',
            detail: 'Update Jira board and calendar from 11:30–12:30 to 11:00–12:00 every other Wednesday.',
          }],
          nextSteps: [{
            step: 'Finalize prospect data sets and related outputs by end of day',
            owner: 'Todd Slaughter',
            timing: 'today',
            why: 'This keeps the UAT-ready path moving',
          }, {
            step: 'Ensure guided UAT support is in place during Catherine’s leave',
            owner: 'Marion Raji and Bimmy',
            timing: 'this week',
            why: 'Stakeholder confidence during UAT depends on active support',
          }, {
            step: 'Conduct Sprint Refinement at the new time',
            owner: 'Ali Khan',
            timing: 'next session',
            why: 'Avoids the clash with the sponsor PM meeting',
            detail: 'Changed from 11:30–12:30 to 11:00–12:00 every other Wednesday.',
          }],
          decisions: [{
            decision: 'Sprint Refinement moves to 11:00–12:00 every other Wednesday',
            madeBy: 'Team / Ali Khan',
            impact: 'Avoids clash with the sponsor PM meeting',
            detail: 'Previous slot was 11:30–12:30.',
          }, {
            decision: 'Sprint Refinement moves to 11:00–12:00 every other Wednesday',
            madeBy: 'Team / Ali Khan',
            impact: 'Avoids clash with the sponsor PM meeting',
            detail: 'Previous slot was 11:30–12:30.',
          }],
          risks: [{
            risk: 'UAT could lose momentum without visible business support during Catherine’s absence',
            level: 'high',
            mitigation: 'Marion and Bimmy to guide stakeholders through testing this week',
          }],
          notes: ['UAT test data has now been shared, so readiness discussion can move from access to execution.'],
          slides: [],
          completed: [],
          incomplete: [],
          log: [],
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: '',
      cerebrasKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  expect(screen.getByText(/Actions for Ali/i)).toBeInTheDocument();
  expect(screen.getByText(/Confirm Jira API delivery status/i)).toBeInTheDocument();
  expect(screen.getByText(/Update Sprint Refinement meeting time in Jira and calendars/i)).toBeInTheDocument();
  expect(screen.getByText(/Update Jira board and calendar from 11:30–12:30 to 11:00–12:00 every other Wednesday\./i)).toBeInTheDocument();
  expect(screen.getByText(/Team next steps to watch/i)).toBeInTheDocument();
  expect(screen.getByText(/Finalize prospect data sets and related outputs by end of day/i)).toBeInTheDocument();
  expect(screen.queryByText(/Conduct Sprint Refinement at the new time/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Decisions made/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Sprint Refinement moves to 11:00–12:00 every other Wednesday/i)).toHaveLength(1);
  expect(screen.getAllByText(/Previous slot was 11:30–12:30\./i)).toHaveLength(1);
  expect(screen.getByText(/^Risks$/i)).toBeInTheDocument();
  expect(screen.getByText(/UAT could lose momentum without visible business support during Catherine’s absence/i)).toBeInTheDocument();
});

test('renders standup notes as a deduped briefing instead of repeated raw bullets', () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          metrics: { done: 1, inprog: 2, inreview: 0, blocked: 1, todo: 1, backlog: 0, health: 'at risk' },
          summary: 'Sprint is at risk because Jira integration and UAT readiness still need resolution.',
          questions: [],
          blockers: [{
            title: 'Resolve Jira API access',
            detail: 'Architectural decision still pending',
            ticketId: 'RPAB-98',
            assignee: 'Nick Baumer',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          stale: [],
          staleInProgress: [{
            ticket: 'RPAB-102',
            summary: 'Build UCAS data parser',
            assignee: 'Todd Slaughter',
            days: 8,
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }, {
            ticket: 'RPAB-103',
            summary: 'CRM field mapping',
            assignee: 'Jahangir Ali',
            days: 9,
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          notPickedUp: [{
            ticket: 'RPAB-57',
            summary: 'UAT test data provided by the business',
            assignee: 'Marion Raji',
            days: 6,
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsDone: [],
          ticketsInProgress: [],
          ticketsInReview: [],
          ticketsBlocked: [{
            ticket: 'RPAB-98',
            summary: 'Resolve Jira API access',
            assignee: 'Nick Baumer',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsTodo: [{
            ticket: 'RPAB-57',
            summary: 'UAT test data provided by the business',
            assignee: 'Marion Raji',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          actions: [],
          decisions: [],
          risks: [],
          notes: [
            'UAT test data not provided',
            'UAT test data not provided',
            'Two in-progress tickets are stale',
            'Multiple in-progress tickets are stale',
          ],
          slides: [],
          completed: [],
          incomplete: [],
          log: [],
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  expect(screen.getByText(/Sprint is at risk because Jira integration and UAT readiness still need resolution\./i)).toBeInTheDocument();
  expect(screen.getByText(/1 blocked ticket needs attention: RPAB-98\./i)).toBeInTheDocument();
  expect(screen.getByText(/2 in-progress tickets have had no movement for 5\+ days: RPAB-102, RPAB-103\./i)).toBeInTheDocument();
  expect(screen.getByText(/1 ticket is still not started: RPAB-57\./i)).toBeInTheDocument();
  expect(screen.getAllByText(/UAT test data not provided/i)).toHaveLength(1);
  expect(screen.queryByText(/^Two in-progress tickets are stale$/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Multiple in-progress tickets are stale$/i)).not.toBeInTheDocument();
});

test('uses current status arrays as source of truth when blocked text is inaccurate', () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          metrics: { done: 0, inprog: 1, inreview: 0, blocked: 1, todo: 0, backlog: 0, health: 'at risk' },
          questions: [],
          blockers: [{
            title: 'Business has not provided test data',
            detail: 'This sounds risky but is not blocked in Jira',
            ticketId: 'RPAB-57',
            assignee: 'Marion Raji',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          stale: [],
          staleInProgress: [],
          notPickedUp: [],
          ticketsDone: [],
          ticketsInProgress: [{
            ticket: 'RPAB-57',
            summary: 'UAT test data provided by the business',
            assignee: 'Marion Raji',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          ticketsInReview: [],
          ticketsBlocked: [],
          ticketsTodo: [],
          actions: [],
          decisions: [],
          risks: [],
          notes: [],
          slides: [],
          completed: [],
          incomplete: [],
          log: [],
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  expect(screen.getByRole('button', { name: /Blocked/i })).toHaveTextContent('0');
  expect(screen.getByRole('button', { name: /In Progress/i })).toHaveTextContent('1');
  expect(screen.getByText(/^Blocked tickets$/i)).toBeInTheDocument();
  expect(screen.getByText(/No blocked tickets/i)).toBeInTheDocument();
});

test('sprint review keeps Hedy intelligence separate from deck-prep slides', async () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_review': {
          sprintGoal: { achieved: true, evidence: 'Stakeholders saw the end-to-end flow and accepted the sprint outcome.' },
          completed: [{ ticketId: 'RPAB-57', summary: 'Completed UAT data preparation for the review demo.' }],
          incomplete: [],
          stakeholderFeedback: ['Stakeholders want the next review to show CAB readiness more clearly.'],
          actions: [],
          decisions: [],
          notes: ['Demo landed well and the business wording should stay outcome-led.'],
          slides: ['Old slide bullet that should no longer appear in the review dashboard'],
          log: [],
        },
      },
      reviewPromptContext: {
        4: {
          stakeholderInstruction: 'Keep wording audience-friendly',
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: '',
      cerebrasKey: '',
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);
  await userEvent.click(screen.getByText(/Sprint review/i));

  expect(screen.getByText(/Sprint Review Prompt Toolkit/i)).toBeInTheDocument();
  expect(screen.getByText(/Stakeholders saw the end-to-end flow and accepted the sprint outcome\./i)).toBeInTheDocument();
  expect(screen.queryByText(/Sprint review slide points/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Old slide bullet that should no longer appear/i)).not.toBeInTheDocument();
});

test('clear data preserves saved api key and jira base', async () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          metrics: { done: 1 },
          questions: ['Question'],
          blockers: [],
          stale: [],
          staleInProgress: [],
          notPickedUp: [],
          ticketsDone: [],
          ticketsInProgress: [],
          ticketsInReview: [],
          ticketsBlocked: [],
          ticketsTodo: [],
          actions: [],
          decisions: [],
          risks: [],
          notes: [],
          slides: [],
          completed: [],
          incomplete: [],
          log: [],
        },
      },
      sprintSummaries: { 4: { label: 'Sprint 4' } },
      theme: 'light',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: 'gsk_test_key',
      cerebrasKey: 'csk_test_key',
      jiraBase: 'https://example.atlassian.net/browse',
      apiProvider: 'groq',
      connectionTipDismissed: true,
      lastUpdated: '07/04/2026 10:00',
      velocityData: { summary: 'Old summary' },
    }),
  );

  render(<App />);

  await userEvent.click(screen.getByRole('button', { name: /Clear data/i }));

  const saved = JSON.parse(window.localStorage.getItem('scrum_intelligence_v8'));
  expect(saved.groqKey).toBe('gsk_test_key');
  expect(saved.cerebrasKey).toBe('csk_test_key');
  expect(saved.jiraBase).toBe('https://example.atlassian.net/browse');
  expect(saved.meetingData).toEqual({});
  expect(saved.sprintSummaries).toEqual({});
  expect(saved.velocityData).toBeUndefined();

  confirmSpy.mockRestore();
});

test('clear this tab removes only the current meeting data for the active sprint', async () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          metrics: { done: 1, inprog: 0, inreview: 0, blocked: 0, todo: 0, backlog: 0, health: 'on track' },
          questions: [],
          blockers: [],
          stale: [],
          staleInProgress: [],
          notPickedUp: [],
          ticketsDone: [],
          ticketsInProgress: [],
          ticketsInReview: [],
          ticketsBlocked: [],
          ticketsTodo: [],
          actions: [],
          nextSteps: [],
          decisions: [],
          risks: [],
          notes: ['Keep this standup note'],
          slides: [],
          completed: [],
          incomplete: [],
          log: [],
          summary: 'Standup summary',
        },
        '4_retro': {
          metrics: { todo: null, inprog: null, inreview: null, blocked: null, done: null, total: null, health: null },
          questions: [],
          blockers: [],
          stale: [],
          staleInProgress: [],
          notPickedUp: [],
          ticketsDone: [],
          ticketsInProgress: [],
          ticketsInReview: [],
          ticketsBlocked: [],
          ticketsTodo: [],
          actions: [{ focus: 'Review estimation approach', owner: 'Ali Khan', why: 'Improve planning', urgency: 'next sprint' }],
          nextSteps: [],
          decisions: [],
          risks: [],
          notes: ['Wrong meeting note pasted here'],
          slides: [],
          completed: [],
          incomplete: [],
          log: [],
          summary: 'Retro summary',
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: 'gsk_test_key',
      cerebrasKey: 'csk_test_key',
      jiraBase: '',
      apiProvider: 'groq',
      connectionTipDismissed: true,
      lastUpdated: '07/04/2026 10:00',
    }),
  );

  render(<App />);

  await userEvent.click(screen.getByText(/Retrospective/i));
  expect(screen.getByText(/Wrong meeting note pasted here/i)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Clear this tab/i }));

  const saved = JSON.parse(window.localStorage.getItem('scrum_intelligence_v8'));
  expect(saved.meetingData['4_retro']).toBeUndefined();
  expect(saved.meetingData['4_standup']).toBeDefined();
  expect(screen.queryByText(/Wrong meeting note pasted here/i)).not.toBeInTheDocument();

  confirmSpy.mockRestore();
});

test('regular settings changes do not wipe meeting data', async () => {
  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [{ num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          metrics: { done: 1, inprog: 2, inreview: 0, blocked: 1, todo: 0, backlog: 0, health: 'at risk' },
          questions: ['Ask Nick about RPAB-98'],
          blockers: [],
          stale: [],
          staleInProgress: [],
          notPickedUp: [],
          ticketsDone: [],
          ticketsInProgress: [],
          ticketsInReview: [],
          ticketsBlocked: [],
          ticketsTodo: [],
          actions: [],
          decisions: [],
          risks: [],
          notes: ['Keep this after theme change'],
          slides: [],
          completed: [],
          incomplete: [],
          log: [],
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: 'gsk_test_key',
      cerebrasKey: 'csk_test_key',
      jiraBase: 'https://example.atlassian.net/browse',
      apiProvider: 'groq',
      connectionTipDismissed: false,
      lastUpdated: '07/04/2026 10:00',
    }),
  );

  render(<App />);

  await userEvent.click(screen.getByRole('button', { name: /^Light$/i }));

  const saved = JSON.parse(window.localStorage.getItem('scrum_intelligence_v8'));
  expect(saved.theme).toBe('light');
  expect(saved.meetingData['4_standup'].questions).toEqual(['Ask Nick about RPAB-98']);
  expect(saved.meetingData['4_standup'].notes).toEqual(['Keep this after theme change']);
});

test('prompt builders omit empty optional sections and preserve locked review rules', () => {
  const rovoPrompt = buildRovoMasterPrompt({
    projectKey: 'RPAB',
    epicKey: 'RPAB-27',
    epicName: 'UK Prospect Data Cleansing Automation',
    sprintNumber: 4,
    sprintName: 'RPAB Sprint 4',
  });
  const pptPrompt = buildPptFormatPrompt({
    projectKey: 'RPAB',
    sprintNumber: 4,
    sprintName: 'RPAB Sprint 4',
  });

  expect(rovoPrompt).toContain('3 to 5 focus areas');
  expect(rovoPrompt).toContain('Additional workstream slide needed: yes / no');
  expect(rovoPrompt).toContain('RPA Sprint 2 Review - Recording Link included.pptx');
  expect(rovoPrompt).toContain('Sprint name from Jira:');
  expect(rovoPrompt).toContain('If the sprint hint from the dashboard differs from Jira, trust Jira.');
  expect(rovoPrompt).toContain('Do not invent or refresh ROI numbers, hours saved, FTE figures, error rates, SLA percentages, process owner names, sponsor names, or target dates.');
  expect(rovoPrompt).not.toContain('Optional review note:');
  expect(rovoPrompt).not.toMatch(/\n{3,}/);

  expect(pptPrompt).toContain('The Rovo output as the current sprint evidence base');
  expect(pptPrompt).toContain('Sprint source of truth: use the sprint name and sprint dates from the Rovo output');
  expect(pptPrompt).toContain('Slide 2 = How We Work Together and is normally kept unchanged');
  expect(pptPrompt).toContain('Preserve the locked structure, layout, colours, font hierarchy, and overall style.');
  expect(pptPrompt).toContain('Preserve static business-case content from the locked deck unless the Rovo output explicitly says it needs updating.');
  expect(pptPrompt).not.toContain('Optional wording note:');
  expect(pptPrompt).not.toMatch(/\n{3,}/);
});

test('project setup prompt is copyable and asks for a full adaptive project profile', () => {
  const prompt = buildProjectSetupPrompt(
    {
      projectKey: 'RPAB',
      projectName: 'UK Prospect Data Cleansing Automation',
      primaryEpic: 'RPAB-27',
      primaryEpicName: 'UK Prospect Data Cleansing Automation',
      sprintNameTemplate: '{projectKey} Sprint {num}',
      workstreams: [
        { epic: 'RPAB-27', epicName: 'Prospect Data Cleansing', focus: 'UAT readiness' },
      ],
    },
    [{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true }],
  );

  expect(prompt).toContain('"projectProfile"');
  expect(prompt).toContain('"workstreams"');
  expect(prompt).toContain('"reviewDeckReference"');
  expect(prompt).toContain('"sprints"');
  expect(prompt).toContain('"activeSprintBoard"');
  expect(prompt).toContain('"epicsInPlay"');
  expect(prompt).toContain('"ticketsInProgress"');
  expect(prompt).toContain('Include every epic / workstream currently being worked on');
  expect(prompt).toContain('Include all current sprint user stories, tasks, bugs, spikes, and sub-tasks');
  expect(prompt).toContain('Use current Jira / Confluence / project documentation / delivery notes');
  expect(prompt).toContain('Include the current active sprint team');
  expect(prompt).toContain('If team membership has changed, return the latest team only');
  expect(prompt).toContain('Sprint cadence hint');
  expect(prompt).toContain('Current dashboard seed context');
  expect(prompt).toContain('Known workstreams in the dashboard');
  expect(prompt).toContain('Current sprint list in the dashboard');
  expect(prompt).toContain('RPAB Sprint 4');
});

test('applying project setup can switch the dashboard to a new project profile', () => {
  const prev = {
    ...defaultState([{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' }]),
    meetingData: {
      '4_standup': {
        metrics: { done: 1 },
        questions: [],
        blockers: [],
        stale: [],
        staleInProgress: [],
        notPickedUp: [],
        ticketsDone: [],
        ticketsInProgress: [],
        ticketsInReview: [],
        ticketsBlocked: [],
        ticketsTodo: [],
        actions: [],
        nextSteps: [],
        decisions: [],
        risks: [],
        notes: [],
        slides: [],
        completed: [],
        incomplete: [],
        sprintGoal: null,
        ragStatus: null,
        log: [],
      },
    },
    sprintSummaries: { 4: { label: 'Old sprint' } },
    groqKey: 'gsk_test',
    cerebrasKey: 'csk_test',
    theme: 'light',
  };

  const next = applyProjectSetupState(
    prev,
    {
      projectProfile: {
        dashboardTitle: 'ABC Delivery Hub',
        projectLabel: 'ABC Programme',
        projectKey: 'ABC',
        projectName: 'Admissions Workflow Automation',
        primaryEpic: 'ABC-12',
        primaryEpicName: 'Admissions Workflow Automation',
        goal: 'Prepare sprint execution for ABC delivery',
        sprintNameTemplate: '{projectKey} Sprint {num}',
      },
      projectContext: {
        projectKey: 'ABC',
        epic: 'ABC-12',
        epicName: 'Admissions Workflow Automation',
      },
      sprints: [
        { num: 7, name: 'ABC Sprint 7', start: '2026-05-01', end: '2026-05-14', active: true },
        { num: 8, name: 'ABC Sprint 8', start: '2026-05-16', end: '2026-05-29', active: false },
      ],
      activeSprint: 7,
      activeSprintBoard: {
        summary: 'Sprint 7 is now seeded for first-time dashboard setup.',
        sprintGoal: 'Land the first admissions workflow sprint safely.',
        ragStatus: 'at risk',
        ragReason: 'One core integration is still blocked.',
        metrics: { done: 1, inprog: 2, inreview: 1, blocked: 1, todo: 2, backlog: 3, total: 7, health: 'at risk' },
        epicsInPlay: [
          { epic: 'ABC-12', epicName: 'Admissions Workflow Automation', focus: 'Core workflow', deliveryNote: 'Active' },
          { epic: 'ABC-18', epicName: 'Offer Letter Automation', focus: 'Template work', deliveryNote: 'In play' },
        ],
        ticketsDone: [
          { ticket: 'ABC-100', summary: 'Baseline process mapping', assignee: 'Sam', epic: 'ABC-12', epicName: 'Admissions Workflow Automation' },
        ],
        ticketsInProgress: [
          { ticket: 'ABC-101', summary: 'Build admissions integration', assignee: 'Nina', epic: 'ABC-12', epicName: 'Admissions Workflow Automation' },
          { ticket: 'ABC-102', summary: 'Draft offer template', assignee: 'Omar', epic: 'ABC-18', epicName: 'Offer Letter Automation' },
        ],
        ticketsInReview: [
          { ticket: 'ABC-103', summary: 'Review validation rules', assignee: 'Jules', epic: 'ABC-12', epicName: 'Admissions Workflow Automation' },
        ],
        ticketsBlocked: [
          { ticket: 'ABC-101', summary: 'Build admissions integration', assignee: 'Nina', epic: 'ABC-12', epicName: 'Admissions Workflow Automation', reason: 'Waiting for API token' },
        ],
        ticketsTodo: [
          { ticket: 'ABC-104', summary: 'Prepare UAT checklist', assignee: 'Unassigned', epic: 'ABC-12', epicName: 'Admissions Workflow Automation' },
          { ticket: 'ABC-105', summary: 'Create offer email copy', assignee: 'Lee', epic: 'ABC-18', epicName: 'Offer Letter Automation' },
        ],
        blockers: [
          { title: 'Admissions API token missing', detail: 'IT has not issued the production token yet.', ticketId: 'ABC-101', assignee: 'Nina', epic: 'ABC-12', epicName: 'Admissions Workflow Automation' },
        ],
        actions: [
          { focus: 'Chase the admissions API token', owner: 'Ali Khan', why: 'Unblock the integration build', urgency: 'today', ticketId: 'ABC-101' },
        ],
        nextSteps: [
          { step: 'Confirm token ETA with IT', owner: 'Team', why: 'Clear the main blocker', timing: 'today' },
        ],
        decisions: [
          { decision: 'Use the API route instead of manual export', owner: 'Team', why: 'Keeps the design scalable' },
        ],
        risks: [
          { risk: 'Token delay could move UAT', severity: 'high', owner: 'Ali Khan' },
        ],
        notes: ['Two epics are in active sprint scope.'],
      },
    },
    [{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
  );

  expect(next.projectProfile.projectKey).toBe('ABC');
  expect(next.projectProfile.projectName).toBe('Admissions Workflow Automation');
  expect(next.projectProfile.workstreams.map((item) => item.epic)).toEqual(['ABC-12', 'ABC-18']);
  expect(next.projectContext.epic).toBe('ABC-12');
  expect(next.sprints.map((sprint) => sprint.name)).toEqual(['ABC Sprint 7', 'ABC Sprint 8']);
  expect(next.activeSprint).toBe(7);
  expect(next.meetingData['7_standup'].summary).toBe('Sprint 7 is now seeded for first-time dashboard setup.');
  expect(next.meetingData['7_standup'].ticketsInProgress.map((item) => item.ticket)).toEqual(['ABC-101', 'ABC-102']);
  expect(next.meetingData['7_standup'].ticketsBlocked.map((item) => item.ticket)).toEqual(['ABC-101']);
  expect(next.meetingData['7_standup'].actions[0].focus).toBe('Chase the admissions API token');
  expect(next.sprintSummaries).toEqual({});
  expect(next.groqKey).toBe('gsk_test');
  expect(next.cerebrasKey).toBe('csk_test');
  expect(next.theme).toBe('light');
  expect(next.projectSetupAppliedAt).toBeTruthy();
});



test('reapplying project setup for the same project updates team membership without wiping saved sprint data', () => {
  const prev = {
    ...defaultState([{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true }]),
    activeSprint: 4,
    meetingData: {
      '4_standup': {
        summary: 'Existing standup summary',
        notes: ['Keep this'],
      },
    },
    sprintSummaries: { 4: { label: 'Sprint 4 archive' } },
  };

  const next = applyProjectSetupState(
    prev,
    {
      projectProfile: {
        projectKey: 'RPAB',
        projectName: 'UK Prospect Data Cleansing Automation',
        primaryEpic: 'RPAB-27',
        primaryEpicName: 'UK Prospect Data Cleansing Automation',
        team: [
          { name: 'Ali Khan', role: 'Senior Scrum Master' },
          { name: 'New Joiner', role: 'Automation Developer' },
        ],
      },
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      activeSprint: 4,
      setupNotes: ['Team refreshed'],
    },
    [{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true }],
  );

  expect(next.projectProfile.team.map((person) => person.name)).toEqual(['Ali Khan', 'New Joiner']);
  expect(next.meetingData['4_standup'].summary).toBe('Existing standup summary');
  expect(next.sprintSummaries['4']).toEqual({ label: 'Sprint 4 archive' });
  expect(next.projectSetupNotes).toEqual(['Team refreshed']);
});

test('project setup cadence auto-generates the next sprint when only the active sprint is provided', () => {
  const next = applyProjectSetupState(
    defaultState([{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' }]),
    {
      projectProfile: {
        dashboardTitle: 'ABC Delivery Hub',
        projectLabel: 'ABC Programme',
        projectKey: 'ABC',
        projectName: 'Admissions Workflow Automation',
        primaryEpic: 'ABC-12',
        primaryEpicName: 'Admissions Workflow Automation',
        sprintNameTemplate: '{projectKey} Sprint {num}',
        sprintDurationDays: 10,
        sprintGapDays: 4,
      },
      projectContext: {
        projectKey: 'ABC',
        epic: 'ABC-12',
        epicName: 'Admissions Workflow Automation',
      },
      sprints: [
        { num: 7, name: 'ABC Sprint 7', start: '2026-05-01', end: '2026-05-10', active: true },
      ],
      activeSprint: 7,
    },
    [{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' }],
  );

  expect(next.projectProfile.sprintDurationDays).toBe(10);
  expect(next.projectProfile.sprintGapDays).toBe(4);
  expect(next.sprints.map((sprint) => sprint.num)).toEqual([7, 8]);
  expect(next.sprints.find((sprint) => sprint.num === 8)).toMatchObject({
    name: 'ABC Sprint 8',
    start: '2026-05-15',
    end: '2026-05-24',
  });
});
test('standup Hedy merge policy protects Jira board-state fields', () => {
  const policy = meetingMergePolicy('standup', 'Meeting notes');
  expect(policy.allowMetrics).toBe(false);
  expect(policy.allowProjectContext).toBe(false);
  expect(policy.allowSummaryOverwrite).toBe(false);
  expect(policy.overwriteFields).toEqual(['actions', 'nextSteps', 'decisions', 'risks', 'notes']);
});

test('standup Hedy prompt explicitly asks for decisions, next steps, and ignores social chat', () => {
  expect(MEETINGS.standup.notesSystemPrompt).toContain('"nextSteps"');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('"decisions"');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('"risks"');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('"detail"');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('Changed from 11:30–12:30 to 11:00–12:00 every other Wednesday.');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('actions = only the specific follow-ups Ali should personally do');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('Update Jira board and calendar from 11:30–12:30 to 11:00–12:00 every other Wednesday.');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('do not also add a generic next step like "Conduct Sprint Refinement at the new time"');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('Do not repeat the same meeting point across actions, nextSteps, decisions, risks, and notes');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('Ignore social chat, humour, personal anecdotes, and informal bonding');
});

test('archived sprint history stores meeting and velocity insights for later reference', async () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

  window.localStorage.setItem(
    'scrum_intelligence_v8',
    JSON.stringify({
      sprints: [
        { num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' },
        { num: 5, name: 'Sprint 5', start: '2026-04-16', end: '2026-04-29' },
      ],
      activeSprint: 4,
      meetingData: {
        '4_standup': {
          metrics: { done: 1, inprog: 2, inreview: 0, blocked: 1, todo: 0, backlog: 0, health: 'at risk' },
          questions: [],
          blockers: [],
          stale: [],
          staleInProgress: [],
          notPickedUp: [],
          ticketsDone: [],
          ticketsInProgress: [],
          ticketsInReview: [],
          ticketsBlocked: [],
          ticketsTodo: [],
          actions: [],
          decisions: [],
          risks: [],
          notes: [],
          slides: [],
          completed: [],
          incomplete: [],
          summary: 'Standup: sprint is at risk because Jira integration is still blocked.',
          log: [{ date: '07/04/2026 09:10', summary: 'Standup: sprint is at risk because Jira integration is still blocked.' }],
        },
        '4_planning': {
          carryForward: [{
            ticketId: 'RPAB-98',
            summary: 'Understand how to interact with Jira',
            reason: 'API route still pending',
            assignee: 'Nick Baumer',
            recommendation: 'carry to sprint 5',
          }],
          sprintRecommendation: [{
            ticketId: 'RPAB-110',
            summary: 'UAT support planning',
            rationale: 'Needed to keep stakeholder testing moving',
          }],
          dependencies: [{
            dependency: 'Confirm Jira API path with IT project board',
            owner: 'Nick Baumer',
            status: 'Pending',
            risk: 'Carry-forward work may stay blocked',
          }],
          actions: [{
            focus: 'Confirm carry-forward priorities before Sprint 5 starts',
            owner: 'Ahmed Sheikh',
            why: 'Avoid unclear entry scope for Sprint 5',
            urgency: 'today',
            ticketId: 'null',
          }],
          decisions: [{
            decision: 'RPAB-98 should carry into Sprint 5',
            madeBy: 'Team / Ali Khan',
            impact: 'Keeps Jira integration design visible in next sprint planning',
          }],
          summary: 'Refinement: Sprint 5 needs clear carry-forward and dependency confirmation.',
          log: [{ date: '07/04/2026 11:45', summary: 'Refinement: Sprint 5 needs clear carry-forward and dependency confirmation.' }],
        },
      },
      sprintSummaries: {},
      theme: 'dark',
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
      groqKey: 'gsk_test_key',
      cerebrasKey: 'csk_test_key',
      jiraBase: '',
      apiProvider: 'groq',
      connectionTipDismissed: false,
      lastUpdated: '07/04/2026 10:00',
      velocityData: {
        summary: 'Velocity is stable but completion is still below commitment.',
        recommendation: 'Protect focus on blocked work before adding more scope.',
      },
    }),
  );

  render(<App />);

  await userEvent.click(screen.getByRole('button', { name: /End sprint/i }));
  await userEvent.click(screen.getByRole('button', { name: /History/i }));

  const saved = JSON.parse(window.localStorage.getItem('scrum_intelligence_v8'));
  expect(saved.activeSprint).toBe(5);
  expect(saved.sprintSummaries['4'].meetings[0].summary).toMatch(/Standup: sprint is at risk/i);
  const planningArchive = saved.sprintSummaries['4'].meetings.find((meeting) => meeting.id === 'planning');
  expect(planningArchive.label).toMatch(/Sprint planning \(for Sprint 5\)/i);
  expect(planningArchive.summary).toMatch(/Refinement: Sprint 5 needs clear carry-forward/i);
  expect(planningArchive.highlights).toContain('Carry forward: RPAB-98 — Understand how to interact with Jira');
  expect(planningArchive.highlights).toContain('Decision: RPAB-98 should carry into Sprint 5');
  expect(screen.getByText(/Sprint planning \(for Sprint 5\)/i)).toBeInTheDocument();
  expect(saved.sprintSummaries['4'].velocity.summary).toMatch(/Velocity is stable/i);
  expect(screen.getByText(/Carry forward: RPAB-98 — Understand how to interact with Jira/i)).toBeInTheDocument();
  expect(screen.getByText(/Decision: RPAB-98 should carry into Sprint 5/i)).toBeInTheDocument();

  expect(screen.getAllByText(/Standup: sprint is at risk because Jira integration is still blocked\./i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Velocity is stable but completion is still below commitment\./i)).toBeInTheDocument();
  expect(screen.getByText(/Recommendation: Protect focus on blocked work before adding more scope\./i)).toBeInTheDocument();

  confirmSpy.mockRestore();
});

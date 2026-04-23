import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { meetingMergePolicy } from './App';
import { DEFAULT_SPRINTS, MEETINGS } from './config';
import { buildRovoMasterPrompt } from './features/sprint-review/promptTemplates/rovoMasterPrompt';
import { buildPptFormatPrompt } from './features/sprint-review/promptTemplates/pptFormatPrompt';
import { buildProjectSetupPrompt, PROJECT_SETUP_COMPACT_SYSTEM_PROMPT, PROJECT_SETUP_SYSTEM_PROMPT } from './projectProfile';
import { applyProjectSetupState, defaultState, STORE_KEY } from './store';

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
  expect(screen.getByText(/^Scrum Intelligence$/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /API keys/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Project setup$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Sprint detail$/i })).toBeInTheDocument();
  expect(screen.getByText(/^Refinement$/i)).toBeInTheDocument();
  expect(screen.queryByText(/Start here/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/What this product does and how to use it/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Copy setup prompt/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Gemini 2\.5 Flash$/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Groq Llama 3\.3 70B$/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^OpenRouter Free Router$/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/AI ready/i)).not.toBeInTheDocument();
  expect(screen.getByText(/^Shared sync$/i)).toBeInTheDocument();
  expect(screen.getByText(/^Local only$/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Dark$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Light$/i })).toBeInTheDocument();
});

test('project setup is a dedicated page with instructions and the setup prompt', async () => {
  render(<App />);

  await userEvent.click(screen.getByRole('button', { name: /^Project setup$/i }));

  expect(screen.getByText(/Setup page/i)).toBeInTheDocument();
  expect(screen.getByText(/What this product does and how to use it/i)).toBeInTheDocument();
  expect(screen.getByText(/Project setup prompt/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Copy setup prompt$/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Paste the project setup response here/i)).toBeInTheDocument();
});

test('project setup applies valid setup JSON directly without requiring an API key', async () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(<App />);

  await userEvent.click(screen.getByRole('button', { name: /^Project setup$/i }));

  const payload = {
    projectProfile: {
      dashboardTitle: 'Scrum Intelligence',
      projectLabel: 'RPAB',
      projectKey: 'RPAB',
      projectName: 'RPA Build',
      primaryEpic: 'RPAB-27',
      primaryEpicName: 'UK Prospect Data Cleansing Automation',
      goal: 'Get Prospect Dataset UAT completed and ready for CAB.',
      sprintNameTemplate: '{projectKey} Sprint {num}',
      sprintDurationDays: 14,
      sprintGapDays: 1,
      workstreams: [
        { epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation', focus: 'Complete UAT and CAB readiness.' },
      ],
      team: [
        { name: 'Nick Baumer', role: null },
      ],
      stakeholders: [],
      watchTickets: ['RPAB-98'],
      knownRisks: ['Jira interaction approach not yet confirmed.'],
      knownDecisions: ['No dispatcher is required for this process.'],
    },
    projectContext: {
      projectKey: 'RPAB',
      epic: 'RPAB-27',
      epicName: 'UK Prospect Data Cleansing Automation',
    },
    sprints: [
      { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true },
      { num: 5, name: 'RPAB Sprint 5', start: '2026-04-15', end: '2026-04-28', active: false },
    ],
    activeSprint: 4,
    recentSprintHistory: [],
    activeSprintBoard: {
      summary: 'Sprint 4 is focused on UAT completion.',
      sprintGoal: 'Get Prospect Dataset UAT completed and ready for CAB.',
      ragStatus: 'at risk',
      ragReason: 'One impediment remains open.',
      metrics: { done: 1, inprog: 1, inreview: 0, blocked: 1, todo: 0, backlog: 0, total: 3, health: 'at risk' },
      epicsInPlay: [
        { epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation', status: 'active', focus: 'UAT completion', deliveryNote: null },
      ],
      ticketsDone: [
        { ticket: 'RPAB-96', summary: 'Performer State Machine', type: 'story', status: 'Done', assignee: 'Todd Slaughter', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
      ],
      ticketsInProgress: [
        { ticket: 'RPAB-57', summary: 'UAT test data provided by the business', type: 'story', status: 'In Progress', assignee: 'Marion Raji', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
      ],
      ticketsInReview: [],
      ticketsBlocked: [
        { ticket: 'RPAB-98', summary: 'Understand how to interact with Jira', type: 'story', status: 'Blocked', assignee: 'Nick Baumer', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation', reason: 'Need API vs GUI decision.' },
      ],
      ticketsTodo: [],
      blockers: [
        { title: 'Jira interaction approach unresolved', detail: 'Need API vs GUI decision.', ticketId: 'RPAB-98', assignee: 'Nick Baumer', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
      ],
      staleInProgress: [],
      notPickedUp: [],
      questions: [],
      actions: [],
      nextSteps: [],
      decisions: [],
      risks: [],
      notes: [],
    },
    setupNotes: ['Applied from direct JSON.'],
  };

  fireEvent.change(screen.getByPlaceholderText(/Paste the project setup response here/i), {
    target: { value: JSON.stringify(payload) },
  });
  await userEvent.click(screen.getByRole('button', { name: /^Apply setup$/i }));

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem('scrum_intelligence_v8'));
    expect(saved.projectProfile.projectKey).toBe('RPAB');
    expect(saved.projectProfile.projectName).toBe('RPA Build');
    expect(saved.activeSprint).toBe(4);
  });
  confirmSpy.mockRestore();
});

test('reflects the latest saved dashboard data from another browser instance', async () => {
  const initial = {
    ...defaultState([{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' }]),
    lastUpdated: '09/04/2026 09:00',
    savedAt: 100,
  };
  window.localStorage.setItem(STORE_KEY, JSON.stringify(initial));

  render(<App />);

  expect(screen.getByText('09/04/2026 09:00')).toBeInTheDocument();

  const newer = {
    ...initial,
    lastUpdated: '10/04/2026 15:45',
    savedAt: 200,
  };
  window.localStorage.setItem(STORE_KEY, JSON.stringify(newer));

  await act(async () => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: STORE_KEY,
      newValue: JSON.stringify(newer),
    }));
  });

  expect(screen.getByText('10/04/2026 15:45')).toBeInTheDocument();
  expect(screen.getByText(/Loaded the latest saved dashboard data/i)).toBeInTheDocument();
});

test('uses page-level scrolling instead of a locked viewport shell', () => {
  const { container } = render(<App />);
  const fs = require('fs');
  const path = require('path');
  const appCss = fs.readFileSync(path.join(__dirname, 'App.css'), 'utf8');
  const indexCss = fs.readFileSync(path.join(__dirname, 'index.css'), 'utf8');

  const appFrame = container.querySelector('.app-frame');
  const appMain = container.querySelector('.app-main');
  const appMainScroll = container.querySelector('.app-main-scroll');

  expect(appFrame).toBeTruthy();
  expect(appMain).toBeTruthy();
  expect(appMainScroll).toBeTruthy();
  expect(appCss).not.toContain('max-height: calc(100vh - 36px);');
  expect(appCss).toContain('overflow: visible;');
  expect(appCss).not.toContain('overflow-y: auto;');
  expect(indexCss).not.toContain('overflow: hidden;');
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
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  expect(screen.getByText(/^Scrum Intelligence$/i)).toBeInTheDocument();
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
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name: /Copy Rovo Prompt/i }));
  });
  expect(await screen.findByText(/Copied/i)).toBeInTheDocument();

  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('- Project key: RPAB'),
  );
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('- Project name: Student Intake Automation'),
  );
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('- Primary epic: RPAB-88 | Student Intake Automation'),
  );
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('Dashboard sprint hint: RPAB Sprint 5 | Sprint 5 | 2026-04-16 to 2026-04-29'),
  );
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('Sprint cadence: 14 day sprint | 0 gap days'),
  );
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('Return JSON in exactly this shape'),
  );
});

test('uses Jira Rovo for standup, planning ceremonies, review, retro, and insights while keeping notes capture available', async () => {
  window.localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      ...defaultState([
        { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true },
        { num: 5, name: 'RPAB Sprint 5', start: '2026-04-16', end: '2026-04-29', active: false },
      ]),
      activeSprint: 4,
      projectProfile: {
        projectKey: 'RPAB',
        projectName: 'Student Intake Automation',
        primaryEpic: 'RPAB-88',
        primaryEpicName: 'Student Intake Automation',
        sprintNameTemplate: '{projectKey} Sprint {num}',
      },
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-88',
        epicName: 'Student Intake Automation',
      },
    }),
  );

  render(<App />);

  expect(screen.getByText(/Jira Rovo Chat/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Copy Rovo Prompt/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Paste the Rovo JSON response here/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Paste meeting notes, transcript, or summary here/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Open input/i })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /^Sprint detail$/i }));
  expect(screen.queryByText(/Jira Rovo Chat/i)).not.toBeInTheDocument();
  expect(screen.getByText(/single source reference/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/^Refinement$/i));
  expect(screen.getByText(/Jira Rovo Chat/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Copy Rovo Prompt/i })).toBeInTheDocument();
  expect(screen.getByText(/Refinement workspace \/ meeting notes/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Upcoming sprint — RPAB Sprint 5/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Paste the refinement discussion for RPAB Sprint 5/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Refinement area/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Refinement dashboard/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Velocity & insights/i));
  expect(screen.getByText(/Jira Rovo Chat/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Sprint planning/i));
  expect(screen.getByText(/Jira Rovo Chat/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Copy Rovo Prompt/i })).toBeInTheDocument();
  expect(screen.getByText(/Sprint planning \/ meeting notes/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Upcoming sprint — RPAB Sprint 5/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Paste the sprint planning discussion for RPAB Sprint 5/i)).toBeInTheDocument();
  expect(screen.getByText(/Sprint planning dashboard/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Sprint review/i));
  expect(screen.getByText(/Jira Rovo Chat/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Copy Rovo Prompt/i })).toBeInTheDocument();
  expect(screen.getByText(/Paste transcript or sprint review notes/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Retrospective/i));
  expect(screen.getByText(/Jira Rovo Chat/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Copy Rovo Prompt/i })).toBeInTheDocument();
  expect(screen.getByText(/Paste transcript or retro notes/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/RPA discovery call/i));
  expect(screen.queryByText(/Jira Rovo Chat/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Paste transcript or discovery call notes/i)).toBeInTheDocument();

  await userEvent.click(screen.getByText(/Stakeholder update/i));
  expect(screen.queryByText(/Jira Rovo Chat/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Paste transcript or stakeholder update notes/i)).toBeInTheDocument();
});

test('daily standup applies valid Rovo JSON directly without requiring an API key', async () => {
  window.localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      ...defaultState([
        { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true },
      ]),
      activeSprint: 4,
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
    }),
  );

  render(<App />);

  const payload = {
    context: {
      projectKey: 'RPAB',
      epic: 'RPAB-27',
      epicName: 'UK Prospect Data Cleansing Automation',
      sprintName: 'RPAB Sprint 4',
    },
    metrics: { done: 1, inprog: 1, inreview: 0, blocked: 1, todo: 0, backlog: 0, health: 'at risk' },
    ticketsDone: [
      { ticket: 'RPAB-96', summary: 'Performer State Machine', assignee: 'Todd Slaughter', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
    ],
    ticketsInProgress: [
      { ticket: 'RPAB-57', summary: 'UAT test data provided by the business', assignee: 'Marion Raji', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
    ],
    ticketsInReview: [],
    ticketsBlocked: [
      { ticket: 'RPAB-98', summary: 'Understand how to interact with Jira', assignee: 'Nick Baumer', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
    ],
    ticketsTodo: [],
    ticketsBacklog: [
      { ticket: 'RPAB-120', summary: 'Prepare CAB follow-up pack', assignee: 'Ali Khan', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
    ],
    staleInProgress: [],
    notPickedUp: [],
    blockers: [
      { title: 'Jira interaction approach unresolved', detail: 'Need API vs GUI decision.', ticketId: 'RPAB-98', assignee: 'Nick Baumer', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
    ],
    actions: [
      { focus: 'Confirm Jira interaction approach', owner: 'Nick Baumer', why: 'Main sprint blocker', urgency: 'today', ticketId: 'RPAB-98', detail: 'Confirm API vs GUI approach.' },
    ],
    nextSteps: [
      { step: 'Get the Jira approach agreed', owner: 'Team', timing: 'today', why: 'Unblock delivery', detail: 'Decision needed before more implementation.' },
    ],
    decisions: [],
    risks: [
      { risk: 'UAT may slip if Jira approach stays unresolved', level: 'medium', mitigation: 'Agree the approach this week' },
    ],
    questions: [
      { target: 'Nick Baumer', question: 'Can we confirm API vs GUI now?', why: 'RPAB-98 is blocking the sprint', needed: 'Decision and next implementation step' },
    ],
    notes: ['Sprint is still sensitive to the Jira integration decision.'],
    summary: 'Standup: Jira interaction remains the main sprint risk.',
  };

  fireEvent.change(screen.getByPlaceholderText(/Paste the Rovo JSON response here/i), {
    target: { value: JSON.stringify(payload) },
  });
  await userEvent.click(screen.getAllByRole('button', { name: /Update dashboard/i })[0]);

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY));
    expect(saved.meetingData['4_standup'].summary).toBe('Standup: Jira interaction remains the main sprint risk.');
    expect(saved.meetingData['4_standup'].ticketsBlocked[0].ticket).toBe('RPAB-98');
    expect(saved.meetingData['4_standup'].ticketsBacklog[0].ticket).toBe('RPAB-120');
    expect(saved.meetingData['4_standup'].actions[0].focus).toBe('Confirm Jira interaction approach');
  });
});

test('daily standup rejects epic-filtered Rovo JSON that is not a full active sprint view', async () => {
  window.localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      ...defaultState([
        { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true },
      ]),
      activeSprint: 4,
      projectProfile: {
        dashboardTitle: 'Scrum Intelligence',
        projectLabel: 'RPAB',
        projectKey: 'RPAB',
        projectName: 'RPA Build',
        primaryEpic: 'RPAB-27',
        primaryEpicName: 'UK Prospect Data Cleansing Automation',
        sprintNameTemplate: '{projectKey} Sprint {num}',
        workstreams: [
          { epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation', focus: 'Prospect data automation' },
          { epic: 'RPAB-36', epicName: 'Letter Generation', focus: 'Letter generation stabilisation' },
        ],
      },
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
    }),
  );

  render(<App />);

  const payload = {
    context: {
      projectKey: 'RPAB',
      epic: 'RPAB-36',
      epicName: 'Letter Generation',
      sprintName: 'RPAB Sprint 4',
    },
    metrics: { done: 2, inprog: 1, inreview: 0, blocked: 0, todo: 0, backlog: 0, health: 'unknown' },
    ticketsDone: [
      { ticket: 'RPAB-105', summary: 'LG - Repeat system exceptions on Edge Print Dialog', assignee: 'Todd Slaughter', epic: 'RPAB-36', epicName: 'Letter Generation' },
      { ticket: 'RPAB-106', summary: 'LG - Dispatcher failing at 365 Sign in Again pop-up', assignee: 'Todd Slaughter', epic: 'RPAB-36', epicName: 'Letter Generation' },
    ],
    ticketsInProgress: [
      { ticket: 'RPAB-25', summary: 'Update Process Design documentation', assignee: 'Nick Baumer', epic: 'RPAB-36', epicName: 'Letter Generation' },
    ],
    ticketsInReview: [],
    ticketsBlocked: [],
    ticketsTodo: [],
    staleInProgress: [],
    notPickedUp: [],
    blockers: [],
    actions: [],
    nextSteps: [],
    decisions: [],
    risks: [],
    questions: [],
    notes: [
      'Board: https://universityofeastlondon.atlassian.net/jira/software/c/projects/RPAB/boards/2842?quickFilter=3880&quickFilter=3988',
      'JQL used for RPAB-36 in open sprint(s): https://universityofeastlondon.atlassian.net/issues/?jql=project%20%3D%20RPAB%20AND%20parent%20%3D%20RPAB-36%20AND%20sprint%20IN%20%28openSprints%28%29%29',
    ],
    summary: 'RPAB-36 in the active sprint has 2 Done and 1 In Progress.',
  };

  fireEvent.change(screen.getByPlaceholderText(/Paste the Rovo JSON response here/i), {
    target: { value: JSON.stringify(payload) },
  });
  await userEvent.click(screen.getAllByRole('button', { name: /Update dashboard/i })[0]);

  await waitFor(() => {
    expect(screen.getAllByText(/Rovo response appears filtered to RPAB-36/i).length).toBeGreaterThan(0);
  });

  const saved = JSON.parse(window.localStorage.getItem(STORE_KEY));
  expect(saved.meetingData['4_standup']).toBeUndefined();
  expect(saved.projectContext.epic).toBe('RPAB-27');
});

test('daily standup rejects Rovo JSON for the wrong sprint number', async () => {
  window.localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      ...defaultState([
        { num: 5, name: 'RPAB Sprint 5', start: '2026-04-15', end: '2026-04-28', active: true },
      ]),
      activeSprint: 5,
      projectProfile: {
        projectKey: 'RPAB',
        projectName: 'RPA Build',
        primaryEpic: 'RPAB-27',
        primaryEpicName: 'UK Prospect Data Cleansing Automation',
        sprintNameTemplate: '{projectKey} Sprint {num}',
        workstreams: [
          { epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation', focus: 'Prospect data automation' },
          { epic: 'RPAB-36', epicName: 'Letter Generation', focus: 'Letter generation stabilisation' },
        ],
      },
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
    }),
  );

  render(<App />);

  const payload = {
    context: {
      projectKey: 'RPAB',
      epic: null,
      epicName: null,
      sprintName: 'RPAB Sprint 2',
    },
    metrics: { done: 1, inprog: 0, inreview: 0, blocked: 0, todo: 0, backlog: 0, health: 'unknown' },
    ticketsDone: [
      { ticket: 'RPAB-105', summary: 'Done work from the wrong sprint', assignee: 'Todd Slaughter', epic: 'RPAB-36', epicName: 'Letter Generation' },
    ],
    ticketsInProgress: [],
    ticketsInReview: [],
    ticketsBlocked: [],
    ticketsTodo: [],
    ticketsBacklog: [],
    staleInProgress: [],
    notPickedUp: [],
    blockers: [],
    actions: [],
    nextSteps: [],
    decisions: [],
    risks: [],
    questions: [],
    notes: [],
    summary: 'Wrong sprint payload.',
  };

  fireEvent.change(screen.getByPlaceholderText(/Paste the Rovo JSON response here/i), {
    target: { value: JSON.stringify(payload) },
  });
  await userEvent.click(screen.getAllByRole('button', { name: /Update dashboard/i })[0]);

  await waitFor(() => {
    expect(screen.getAllByText(/Rovo response is for Sprint 2, but the dashboard is currently on Sprint 5\. This looks like an older sprint snapshot/i).length).toBeGreaterThan(0);
  });

  const saved = JSON.parse(window.localStorage.getItem(STORE_KEY));
  expect(saved.meetingData['5_standup']).toBeUndefined();
});

test('daily standup promotes the dashboard to a newer sprint from verified Rovo JSON', async () => {
  window.localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      ...defaultState([
        { num: 2, name: 'Sprint 2', start: '2026-01-19', end: '2026-02-01', active: true },
      ]),
      activeSprint: 2,
      projectProfile: {
        projectKey: 'RPAB',
        projectName: 'RPA Build',
        primaryEpic: 'RPAB-27',
        primaryEpicName: 'UK Prospect Data Cleansing Automation',
        sprintNameTemplate: '{projectKey} Sprint {num}',
        sprintDurationDays: 14,
        sprintGapDays: 0,
      },
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
    }),
  );

  render(<App />);

  const payload = {
    context: {
      projectKey: 'RPAB',
      epic: null,
      epicName: null,
      sprintName: 'RPAB Sprint 5',
    },
    metrics: { done: 5, inprog: 2, inreview: 5, blocked: 0, todo: 0, backlog: 7, health: 'at risk' },
    ticketsDone: [
      { ticket: 'RPAB-25', summary: 'Update Process Design documentation', assignee: 'Nick Baumer', epic: 'RPAB-36', epicName: 'Letter Generation' },
    ],
    ticketsInProgress: [
      { ticket: 'RPAB-98', summary: 'Understand how to interact with Jira', assignee: 'Nick Baumer', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
    ],
    ticketsInReview: [],
    ticketsBlocked: [],
    ticketsTodo: [],
    ticketsBacklog: [
      { ticket: 'RPAB-61', summary: 'Assets transferred to Orchestrator Production tenant', assignee: 'unassigned', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
    ],
    staleInProgress: [],
    notPickedUp: [],
    blockers: [],
    actions: [],
    nextSteps: [],
    decisions: [],
    risks: [],
    questions: [],
    notes: [
      'Sprint 5 is active from 2026-04-15 to 2026-04-28 with goal: Achieve go-live for UK Prospect Datasets.',
    ],
    summary: 'RPAB Sprint 5 is at risk.',
  };

  fireEvent.change(screen.getByPlaceholderText(/Paste the Rovo JSON response here/i), {
    target: { value: JSON.stringify(payload) },
  });
  await userEvent.click(screen.getAllByRole('button', { name: /Update dashboard/i })[0]);

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY));
    expect(saved.activeSprint).toBe(5);
    expect(saved.sprints.find((sprint) => sprint.num === 5)).toMatchObject({
      name: 'RPAB Sprint 5',
      start: '2026-04-15',
      end: '2026-04-28',
      active: true,
    });
    expect(saved.meetingData['5_standup'].summary).toBe('RPAB Sprint 5 is at risk.');
  });
});

test('velocity and insights applies valid Rovo JSON directly without requiring an API key', async () => {
  window.localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      ...defaultState([
        { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true },
        { num: 5, name: 'RPAB Sprint 5', start: '2026-04-15', end: '2026-04-28', active: false },
      ]),
      activeSprint: 4,
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-27',
        epicName: 'UK Prospect Data Cleansing Automation',
      },
    }),
  );

  render(<App />);
  await userEvent.click(screen.getByText(/Velocity & insights/i));

  const payload = {
    context: {
      projectKey: 'RPAB',
      epic: 'RPAB-27',
      epicName: 'UK Prospect Data Cleansing Automation',
      sprintName: 'RPAB Sprint 4',
    },
    sprints: [
      { num: 2, name: 'RPAB Sprint 2', committedPoints: 43, completedPoints: 35, committedTickets: 10, completedTickets: 8 },
      { num: 3, name: 'RPAB Sprint 3', committedPoints: 40, completedPoints: 31, committedTickets: 9, completedTickets: 7 },
    ],
    current: { num: 4, name: 'RPAB Sprint 4', committedPoints: 38, completedPoints: 10, committedTickets: 8, completedTickets: 3 },
    insights: ['Carry-over remains visible across consecutive sprints.'],
    recommendation: 'Protect focus on the Jira integration blocker before adding more scope.',
    summary: 'Velocity is viable but still sensitive to blocked carry-over.',
  };

  fireEvent.change(screen.getByPlaceholderText(/Paste the Rovo JSON response here/i), {
    target: { value: JSON.stringify(payload) },
  });
  await userEvent.click(screen.getByRole('button', { name: /^Update$/i }));

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY));
    expect(saved.velocityData.summary).toBe('Velocity is viable but still sensitive to blocked carry-over.');
    expect(saved.velocityData.current.num).toBe(4);
    expect(saved.velocityData.insights[0]).toMatch(/Carry-over remains visible/i);
  });
});

test('planning Hedy updates replace the current planning snapshot instead of stacking duplicates', () => {
  const policy = meetingMergePolicy('planning', 'Meeting notes');
  const refinementPolicy = meetingMergePolicy('refinement', 'Meeting notes');
  const planningRovoPolicy = meetingMergePolicy('planning', 'Rovo/Jira');
  const reviewRovoPolicy = meetingMergePolicy('review', 'Rovo/Jira');
  const retroRovoPolicy = meetingMergePolicy('retro', 'Rovo/Jira');

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
  expect(planningRovoPolicy.overwriteFields).toEqual(expect.arrayContaining(['carryForward', 'backlog', 'dependencies', 'actions', 'decisions', 'notes']));
  expect(planningRovoPolicy.appendFields).not.toEqual(expect.arrayContaining(['carryForward', 'backlog', 'dependencies']));
  expect(reviewRovoPolicy.overwriteFields).toEqual(expect.arrayContaining(['completed', 'incomplete', 'stakeholderFeedback', 'actions', 'decisions', 'notes']));
  expect(retroRovoPolicy.overwriteFields).toEqual(expect.arrayContaining(['wentWell', 'didntGoWell', 'actions', 'notes']));
});

test('planning applies valid Rovo JSON directly without requiring an API key', async () => {
  window.localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      ...defaultState([
        { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true },
        { num: 5, name: 'RPAB Sprint 5', start: '2026-04-16', end: '2026-04-29', active: false },
      ]),
      activeSprint: 4,
      openrouterKey: '',
      projectProfile: {
        projectKey: 'RPAB',
        projectName: 'Student Intake Automation',
        primaryEpic: 'RPAB-88',
        primaryEpicName: 'Student Intake Automation',
        sprintNameTemplate: '{projectKey} Sprint {num}',
        sprintDurationDays: 14,
        sprintGapDays: 1,
      },
      projectContext: {
        projectKey: 'RPAB',
        epic: 'RPAB-88',
        epicName: 'Student Intake Automation',
      },
    }),
  );

  render(<App />);
  await userEvent.click(screen.getByText(/Sprint planning/i));

  const payload = {
    context: {
      projectKey: 'RPAB',
      epic: 'RPAB-88',
      epicName: 'Student Intake Automation',
      sprintName: 'RPAB Sprint 5',
    },
    carryForward: [
      {
        ticketId: 'RPAB-98',
        summary: 'Understand how to interact with Jira',
        reason: 'Needs final API-vs-GUI decision',
        assignee: 'Nick Baumer',
        recommendation: 'carry to next sprint',
      },
    ],
    backlog: [
      {
        ticketId: 'RPAB-107',
        summary: 'UCAS input validation follow-up',
        priority: 'high',
        ready: true,
        notes: 'Selected for Sprint 5 with UAT focus',
      },
    ],
    dependencies: [
      {
        dependency: 'Business to confirm final UAT file set',
        owner: 'Marion Raji',
        status: 'open',
        risk: 'Sprint 5 start could slip',
        detail: 'Need confirmation before day 2',
      },
    ],
    teamLoad: [
      {
        name: 'Todd Slaughter',
        tickets: 'RPAB-107 and Jira follow-up',
        capacity: 'limited',
      },
    ],
    sprintRecommendation: [
      {
        ticketId: 'RPAB-107',
        summary: 'UCAS input validation follow-up',
        rationale: 'Protects UAT-readiness scope',
      },
    ],
    actions: [
      {
        focus: 'Confirm Sprint 5 UAT dependency owners',
        owner: 'Ali Khan',
        why: 'Protects the Sprint 5 start',
        urgency: 'today',
        ticketId: 'RPAB-98',
        detail: 'Lock owners and due dates after planning',
      },
    ],
    decisions: [
      {
        decision: 'RPAB-98 carries into Sprint 5',
        madeBy: 'RPA team',
        impact: 'Keeps Jira integration visible in planned scope',
        detail: 'Do not close until interaction approach is confirmed',
      },
    ],
    risks: [
      {
        risk: 'UAT dependency may slow Sprint 5 start',
        level: 'medium',
        mitigation: 'Confirm file-set timing in the first two days',
      },
    ],
    questions: [
      {
        target: 'Marion Raji',
        question: 'When will the final UAT file set be available?',
        why: 'Planning assumed early Sprint 5 readiness',
        needed: 'Confirmed date and file location',
      },
    ],
    notes: ['Sprint 5 plan stays viable if the UAT dependency lands early.'],
    summary: 'Sprint 5 plan is broadly ready but depends on early UAT confirmation.',
  };

  fireEvent.change(screen.getByPlaceholderText(/Paste the Rovo JSON response here/i), {
    target: { value: JSON.stringify(payload) },
  });
  await userEvent.click(screen.getAllByRole('button', { name: /^Update dashboard$/i })[0]);

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY));
    expect(saved.meetingData['4_planning'].summary).toBe('Sprint 5 plan is broadly ready but depends on early UAT confirmation.');
    expect(saved.meetingData['4_planning'].carryForward[0].ticketId).toBe('RPAB-98');
    expect(saved.meetingData['4_planning'].backlog[0].ticketId).toBe('RPAB-107');
    expect(saved.meetingData['4_planning'].decisions[0].decision).toMatch(/carries into Sprint 5/i);
  });
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
  expect(screen.getByText(/^Actions for the Scrum lead$/i)).toBeInTheDocument();
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
          ticketsBlocked: [{
            ticket: 'RPAB-98',
            summary: 'Jira integration path unresolved',
            assignee: 'Nick Baumer',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          blockers: [{
            title: 'Jira integration path unresolved',
            detail: 'CAB completion depends on the integration decision.',
            ticketId: 'RPAB-98',
            assignee: 'Nick Baumer',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          actions: [{ focus: 'Confirm Jira API delivery status', owner: 'Nick Baumer', why: 'Main sprint dependency', urgency: 'today' }],
          nextSteps: [{ step: 'Confirm whether CAB can still hold the current date', owner: 'Ahmed Sheikh', timing: 'this week', why: 'Decision affects sprint commitment' }],
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
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: '08/04/2026 11:30',
    }),
  );

  render(<App />);

  await userEvent.click(screen.getByRole('button', { name: /^Sprint detail$/i }));

  expect(screen.getByText(/single source reference/i)).toBeInTheDocument();
  expect(screen.getByText(/Meeting readouts/i)).toBeInTheDocument();
  expect(screen.getByText(/Blocked tickets/i)).toBeInTheDocument();
  expect(screen.getByText(/Jira integration path unresolved/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Standup: sprint is still sensitive to Jira integration timing\./i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Refinement: Sprint 5 needs CAB path clarity before commitment\./i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Actions for the Scrum lead across the sprint/i)).toBeInTheDocument();
  expect(screen.getByText(/Confirm Jira API delivery status/i)).toBeInTheDocument();
  expect(screen.getByText(/Coordinate CAB readiness with Callum/i)).toBeInTheDocument();
  expect(screen.getByText(/Team next steps to watch/i)).toBeInTheDocument();
  expect(screen.getByText(/Confirm whether CAB can still hold the current date/i)).toBeInTheDocument();
  expect(screen.getByText(/Cross-sprint notes and context/i)).toBeInTheDocument();
  expect(screen.getByText(/Next sprint should trial task-based estimation\./i)).toBeInTheDocument();
});

test('sprint review prompt toolkit keeps the workflow simple and copies dynamic prompts cleanly', async () => {
  render(<App />);

  await userEvent.click(screen.getByText(/Sprint review/i));

  expect(screen.getByText(/Sprint Review Prompt Toolkit/i)).toBeInTheDocument();
  expect(screen.getByText(/Purpose: use Rovo to pull the current sprint review content/i)).toBeInTheDocument();
  expect(screen.getByText(/Usually leave these blank\. Use them only when you need to add context Rovo will not know/i)).toBeInTheDocument();
  expect(screen.getByText(/Locked format: Review deck reference/i)).toBeInTheDocument();
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
  expect(screen.getByText(/^Actions for the Scrum lead$/i)).toBeInTheDocument();
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
      jiraBase: '',
      apiProvider: 'none',
      connectionTipDismissed: false,
      lastUpdated: null,
    }),
  );

  render(<App />);

  expect(screen.getByText(/Actions for the Scrum lead/i)).toBeInTheDocument();
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

test('clear data preserves saved AI keys and jira base', async () => {
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
      geminiKey: 'gemini_test_key',
      groqKey: 'gsk_test_key',
      openrouterKey: 'sk-or_test_key',
      jiraBase: 'https://example.atlassian.net/browse',
      apiProvider: 'gemini',
      connectionTipDismissed: true,
      lastUpdated: '07/04/2026 10:00',
      velocityData: { summary: 'Old summary' },
    }),
  );

  render(<App />);

  await userEvent.click(screen.getByRole('button', { name: /Clear data/i }));

  const saved = JSON.parse(window.localStorage.getItem('scrum_intelligence_v8'));
  expect(saved.geminiKey).toBe('gemini_test_key');
  expect(saved.groqKey).toBe('gsk_test_key');
  expect(saved.openrouterKey).toBe('sk-or_test_key');
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
      openrouterKey: 'sk-or_test_key',
      jiraBase: '',
      apiProvider: 'openrouter',
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
      openrouterKey: 'sk-or_test_key',
      jiraBase: 'https://example.atlassian.net/browse',
      apiProvider: 'openrouter',
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
    {
      3: {
        label: 'RPAB Sprint 3',
        meetings: [{ id: 'setup-history', summary: 'Carry-over from integration access delay.' }],
      },
    },
  );

  expect(prompt).toContain('"projectProfile"');
  expect(prompt).toContain('"workstreams"');
  expect(prompt).toContain('"reviewDeckReference"');
  expect(prompt).toContain('"sprints"');
  expect(prompt).toContain('"recentSprintHistory"');
  expect(prompt).toContain('"epics": [{ "epic": "EPIC-1", "epicName": "epic title" }]');
  expect(prompt).toContain('"completedTickets"');
  expect(prompt).toContain('"carryOverTickets"');
  expect(prompt).toContain('"activeSprintBoard"');
  expect(prompt).toContain('"epicsInPlay"');
  expect(prompt).toContain('"ticketsInProgress"');
  expect(prompt).toContain('"ticketsBacklog"');
  expect(prompt).toContain('Goal: produce one authoritative project setup response');
  expect(prompt).toContain('Include recent sprint history as quantity data');
  expect(prompt).toContain('infer the next sprint dates from that cadence');
  expect(prompt).toContain('include the key epics in scope plus a concise delivered ticket list and carry-over ticket list');
  expect(prompt).toContain('Use recentSprintHistory.metrics to capture achieved story points and completed item counts');
  expect(prompt).toContain('Include every epic / workstream currently being worked on');
  expect(prompt).toContain('Include all current sprint user stories, tasks, bugs, spikes, and sub-tasks');
  expect(prompt).toContain('Include active sprint board tickets for Done, In Progress, In Review, Blocked, To Do, and Backlog');
  expect(prompt).toContain('Use current Jira / Confluence / project documentation / delivery notes');
  expect(prompt).toContain('Include the current active sprint team');
  expect(prompt).toContain('If team membership has changed, return the latest team only');
  expect(prompt).toContain('Determine the actual live current sprint from Jira / Rovo / project delivery evidence');
  expect(prompt).toContain('If the dashboard seed still shows the ending sprint but Jira now shows a newer sprint as current/open');
  expect(prompt).toContain('Every sprint number, sprint name, and sprint date must match the live Jira sprint timeline');
  expect(prompt).toContain('Cross-check "activeSprint", the sprint marked with "active": true, and the sprint name/date in Jira');
  expect(prompt).toContain('If Jira shows Sprint 5 as current/open while the dashboard seed still says Sprint 2');
  expect(prompt).toContain('recentSprintHistory must preserve the real sprint numbering from Jira');
  expect(prompt).toContain('Sprint cadence hint');
  expect(prompt).toContain('Current dashboard seed context');
  expect(prompt).toContain('Known workstreams in the dashboard');
  expect(prompt).toContain('Current sprint list in the dashboard');
  expect(prompt).toContain('Recent archived sprint context already in the dashboard');
  expect(prompt).toContain('RPAB Sprint 4');
  expect(prompt).not.toContain('Ali Khan');
});

test('default setup prompt stays generic before any project is configured', () => {
  const prompt = buildProjectSetupPrompt({}, DEFAULT_SPRINTS);

  expect(prompt).toContain('Project key: not configured');
  expect(prompt).toContain('Project name: not configured');
  expect(prompt).toContain('Primary epic: not configured');
  expect(prompt).toContain('This setup must let the dashboard adapt to any project');
  expect(prompt).toContain('Dashboard seed status: generic placeholder context only');
  expect(prompt).toContain('determine the real current sprint directly from Jira / Rovo');
  expect(prompt).not.toContain('Current sprint list in the dashboard');
  expect(prompt).not.toContain('- 1 | Sprint 1 | 2026-01-05 | 2026-01-18 | active');
  expect(prompt).not.toContain('RPAB');
  expect(prompt).not.toContain('UK Prospect Data Cleansing Automation');
});

test('project setup fallback parser stays more compact for OpenRouter retries', () => {
  expect(PROJECT_SETUP_COMPACT_SYSTEM_PROMPT.length).toBeLessThan(PROJECT_SETUP_SYSTEM_PROMPT.length);
  expect(PROJECT_SETUP_COMPACT_SYSTEM_PROMPT).toContain('Max counts');
  expect(PROJECT_SETUP_COMPACT_SYSTEM_PROMPT).toContain('Return ONLY compact JSON');
  expect(PROJECT_SETUP_COMPACT_SYSTEM_PROMPT).toContain('ticketsBacklog');
  expect(PROJECT_SETUP_COMPACT_SYSTEM_PROMPT).toContain('If the input evidence shows the next sprint is already open/current');
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
    openrouterKey: 'sk-or_test',
    apiProvider: 'openrouter',
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
  expect(next.openrouterKey).toBe('sk-or_test');
  expect(next.apiProvider).toBe('openrouter');
  expect(next.theme).toBe('light');
  expect(next.projectSetupAppliedAt).toBeTruthy();
});



test('reapplying project setup for the same project updates team membership without wiping saved sprint data', () => {
  const prev = {
    ...defaultState([{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true }]),
    activeSprint: 4,
    projectProfile: {
      projectKey: 'RPAB',
      projectName: 'UK Prospect Data Cleansing Automation',
      primaryEpic: 'RPAB-27',
      primaryEpicName: 'UK Prospect Data Cleansing Automation',
      team: [{ name: 'Ali Khan', role: 'Senior Scrum Master' }],
    },
    projectContext: {
      projectKey: 'RPAB',
      epic: 'RPAB-27',
      epicName: 'UK Prospect Data Cleansing Automation',
    },
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

test('project setup prefers the sprint row flagged active over a stale activeSprint number', () => {
  const next = applyProjectSetupState(
    defaultState([{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true }]),
    {
      projectProfile: {
        projectKey: 'RPAB',
        projectName: 'RPA Build',
        primaryEpic: 'RPAB-27',
        primaryEpicName: 'UK Prospect Data Cleansing Automation',
        sprintNameTemplate: '{projectKey} Sprint {num}',
        sprintDurationDays: 14,
        sprintGapDays: 0,
      },
      sprints: [
        { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: false },
        { num: 5, name: 'RPAB Sprint 5', start: '2026-04-15', end: '2026-04-28', active: true },
      ],
      activeSprint: 2,
    },
    [{ num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: true }],
  );

  expect(next.activeSprint).toBe(5);
  expect(next.sprints.find((sprint) => sprint.num === 5)).toMatchObject({
    active: true,
    start: '2026-04-15',
    end: '2026-04-28',
  });
});

test('project setup imports recent sprint history and derives team and workstreams from the active board when needed', () => {
  const next = applyProjectSetupState(
    defaultState([{ num: 1, name: 'Sprint 1', start: '2026-01-05', end: '2026-01-18', active: true }]),
    {
      projectProfile: {
        projectKey: 'OPS',
        projectName: 'Operations Automation',
        primaryEpic: 'OPS-10',
        primaryEpicName: 'Operations Automation',
        sprintNameTemplate: '{projectKey} Sprint {num}',
        sprintDurationDays: 14,
        sprintGapDays: 0,
      },
      projectContext: {
        projectKey: 'OPS',
        epic: 'OPS-10',
        epicName: 'Operations Automation',
      },
      sprints: [
        { num: 7, name: 'OPS Sprint 7', start: '2026-06-02', end: '2026-06-15', active: true },
      ],
      activeSprint: 7,
      recentSprintHistory: [
        {
          num: 5,
          name: 'OPS Sprint 5',
          start: '2026-05-05',
          end: '2026-05-18',
          summary: 'Validation work slipped due to access delays.',
          status: 'slipped',
          epics: [
            { epic: 'OPS-10', epicName: 'Operations Automation' },
            { epic: 'OPS-12', epicName: 'Support Readiness' },
          ],
          completedTickets: [
            { ticket: 'OPS-72', summary: 'Baseline workflow', epic: 'OPS-10', epicName: 'Operations Automation', storyPoints: 8 },
          ],
          carryOverTickets: [
            { ticket: 'OPS-81', summary: 'Validation rules', epic: 'OPS-10', epicName: 'Operations Automation', storyPoints: 5 },
          ],
          carryOver: ['OPS-81 validation rules'],
          completedHighlights: ['OPS-72 baseline workflow'],
          risks: ['API access delay'],
          metrics: { committedPoints: 24, completedPoints: 18, committedTickets: 12, completedTickets: 9 },
        },
        {
          num: 6,
          name: 'OPS Sprint 6',
          start: '2026-05-19',
          end: '2026-06-01',
          summary: 'Recovered delivery pace after access was restored.',
          status: 'completed',
          carryOver: ['OPS-93 notification cleanup'],
          completedHighlights: ['OPS-81 validation rules'],
          risks: ['UAT sign-off pending'],
          metrics: { committedPoints: 26, completedPoints: 24, committedTickets: 13, completedTickets: 12 },
        },
      ],
      activeSprintBoard: {
        summary: 'Sprint 7 focuses on rollout hardening.',
        epicsInPlay: [
          { epic: 'OPS-10', epicName: 'Operations Automation', focus: 'Rollout hardening' },
        ],
        ticketsInProgress: [
          { ticket: 'OPS-101', summary: 'Harden retry logic', assignee: 'Rina', epic: 'OPS-10', epicName: 'Operations Automation' },
        ],
        ticketsTodo: [
          { ticket: 'OPS-102', summary: 'Prepare support guide', assignee: 'Sam', epic: 'OPS-12', epicName: 'Support Readiness' },
        ],
        blockers: [
          { title: 'Waiting for support mailbox', ticketId: 'OPS-102', assignee: 'Sam', epic: 'OPS-12', epicName: 'Support Readiness' },
        ],
      },
    },
    [{ num: 1, name: 'Sprint 1', start: '2026-01-05', end: '2026-01-18', active: true }],
  );

  expect(next.projectProfile.team.map((person) => person.name)).toEqual(['Rina', 'Sam']);
  expect(next.projectProfile.workstreams.map((item) => item.epic)).toEqual(['OPS-10', 'OPS-12']);
  expect(next.sprints.map((sprint) => sprint.num)).toEqual([5, 6, 7, 8]);
  expect(next.sprintSummaries[5].setupHistory.summary).toBe('Validation work slipped due to access delays.');
  expect(next.sprintSummaries[5].setupHistory.epics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ epic: 'OPS-10', epicName: 'Operations Automation' }),
      expect.objectContaining({ epic: 'OPS-12', epicName: 'Support Readiness' }),
    ]),
  );
  expect(next.sprintSummaries[5].setupHistory.completedTickets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ticket: 'OPS-72', summary: 'Baseline workflow', storyPoints: 8 }),
    ]),
  );
  expect(next.sprintSummaries[5].setupHistory.carryOverTickets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ticket: 'OPS-81', summary: 'Validation rules', storyPoints: 5 }),
    ]),
  );
  expect(next.sprintSummaries[6].setupHistory.metrics).toEqual(
    expect.objectContaining({
      committedPoints: 26,
      completedPoints: 24,
      committedTickets: 13,
      completedTickets: 12,
    }),
  );
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
  expect(MEETINGS.standup.notesSystemPrompt).toContain('actions = only the specific follow-ups the Scrum lead should personally do');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('Update Jira board and calendar from 11:30–12:30 to 11:00–12:00 every other Wednesday.');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('do not also add a generic next step like "Conduct Sprint Refinement at the new time"');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('Do not repeat the same meeting point across actions, nextSteps, decisions, risks, and notes');
  expect(MEETINGS.standup.notesSystemPrompt).toContain('Ignore social chat, humour, personal anecdotes, and informal bonding');
});

test('standup Rovo prompt includes watch-ticket priority context', () => {
  const prompt = MEETINGS.standup.rovoPrompt({
    projectContext: {
      projectKey: 'RPAB',
      epic: 'RPAB-27',
      epicName: 'Automation Rollout',
    },
    projectProfile: {
      projectKey: 'RPAB',
      projectName: 'Automation Rollout',
      primaryEpic: 'RPAB-27',
      primaryEpicName: 'Automation Rollout',
      watchTickets: ['RPAB-101', 'RPAB-205'],
      workstreams: [{ epic: 'RPAB-27', epicName: 'Automation Rollout', focus: 'UAT readiness' }],
    },
    sprint: { num: 4, name: 'RPAB Sprint 4' },
    nextSprint: { num: 5, name: 'RPAB Sprint 5' },
  });

  expect(prompt).toContain('- Watch tickets: RPAB-101 | RPAB-205');
  expect(prompt).toContain('RPAB-101 | RPAB-205');
  expect(prompt).toContain('make sure their current Jira status is reflected accurately');
  expect(prompt).toContain('Produce one authoritative active-sprint dashboard snapshot for the Scrum lead');
  expect(prompt).toContain('"ticketsBacklog"');
  expect(prompt).toContain('"epic": null');
  expect(prompt).toContain('"sprintNum": 4');
  expect(prompt).toContain('"sprintStart": "YYYY-MM-DD"');
  expect(prompt).toContain('"sprintEnd": "YYYY-MM-DD"');
  expect(prompt).toContain('metrics.backlog must match ticketsBacklog');
  expect(prompt).toContain('Retrieval checklist before answering');
  expect(prompt).toContain('First verify the live open/current sprint number, name, and dates in Jira');
  expect(prompt).toContain('Recommended Jira scope: project = RPAB AND sprint IN openSprints()');
  expect(prompt).toContain('Treat the dashboard sprint hint above as a hint, not the source of truth');
  expect(prompt).toContain('If Jira shows Sprint 5 current/open and the hint says Sprint 2 or Sprint 4, answer for Sprint 5');
  expect(prompt).toContain('Do not scope the response to a single epic');
  expect(prompt).toContain('Do not use quick-filtered board URLs or epic-only JQL such as parent = EPIC');
  expect(prompt).toContain('Cross-check the response against all workstreams listed above');
  expect(prompt).toContain('context.sprintName must be the verified live sprint name from Jira');
  expect(prompt).toContain('context.sprintNum, context.sprintStart, and context.sprintEnd must describe that same verified live sprint');
  expect(prompt).toContain('cross-check that context.sprintName, the open sprint number in Jira, and the board dates all describe the same live sprint');
  expect(prompt).toContain('If multiple workstreams are listed above and the result only contains one epic, treat the result as incomplete');
  expect(prompt).toContain('Do not answer from a partial epic slice');
  expect(prompt).toContain('If the full sprint view spans multiple epics, set context.epic = null and context.epicName = null');
  expect(prompt).toContain('ticketsTodo = not-started tickets already committed to the active sprint');
  expect(prompt).toContain('ticketsBacklog = backlog-status or backlog-column items visible in the same project board context');
});

test('refinement and planning Rovo prompts include inferred target sprint dates and strict JSON contracts', () => {
  const args = {
    projectContext: {
      projectKey: 'RPAB',
      epic: 'RPAB-27',
      epicName: 'Automation Rollout',
    },
    projectProfile: {
      projectKey: 'RPAB',
      projectName: 'Automation Rollout',
      primaryEpic: 'RPAB-27',
      primaryEpicName: 'Automation Rollout',
      sprintDurationDays: 14,
      sprintGapDays: 1,
      watchTickets: ['RPAB-101'],
      workstreams: [{ epic: 'RPAB-27', epicName: 'Automation Rollout', focus: 'UAT readiness' }],
    },
    sprint: { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' },
    nextSprint: { num: 5, name: 'RPAB Sprint 5' },
  };

  const refinementPrompt = MEETINGS.refinement.rovoPrompt(args);
  const planningPrompt = MEETINGS.planning.rovoPrompt(args);

  expect(refinementPrompt).toContain('Target sprint for refinement: RPAB Sprint 5 | 2026-04-16 to 2026-04-29');
  expect(refinementPrompt).toContain('"carryForward"');
  expect(refinementPrompt).toContain('"teamLoad"');
  expect(refinementPrompt).toContain('"sprintRecommendation"');
  expect(planningPrompt).toContain('Planned sprint: RPAB Sprint 5 | 2026-04-16 to 2026-04-29');
  expect(planningPrompt).toContain('"backlog"');
  expect(planningPrompt).toContain('"decisions"');
  expect(planningPrompt).toContain('Focus on selected scope, carry-over, dependencies, and delivery confidence');
});

test('review and retro Rovo prompts return direct-dashboard JSON shapes', () => {
  const args = {
    projectContext: {
      projectKey: 'RPAB',
      epic: 'RPAB-27',
      epicName: 'Automation Rollout',
    },
    projectProfile: {
      projectKey: 'RPAB',
      projectName: 'Automation Rollout',
      primaryEpic: 'RPAB-27',
      primaryEpicName: 'Automation Rollout',
      sprintDurationDays: 14,
      sprintGapDays: 1,
      watchTickets: ['RPAB-98'],
      workstreams: [{ epic: 'RPAB-27', epicName: 'Automation Rollout', focus: 'UAT readiness' }],
    },
    sprint: { num: 4, name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14' },
    nextSprint: { num: 5, name: 'RPAB Sprint 5' },
  };

  const reviewPrompt = MEETINGS.review.rovoPrompt(args);
  const retroPrompt = MEETINGS.retro.rovoPrompt(args);

  expect(reviewPrompt).toContain('Sprint under review: RPAB Sprint 4 | Sprint 4 | 2026-04-01 to 2026-04-14');
  expect(reviewPrompt).toContain('"sprintGoal"');
  expect(reviewPrompt).toContain('"stakeholderFeedback"');
  expect(reviewPrompt).toContain('Do not produce deck bullets, presentation wording, or invented business benefits');
  expect(retroPrompt).toContain('Sprint in retro: RPAB Sprint 4 | Sprint 4 | 2026-04-01 to 2026-04-14');
  expect(retroPrompt).toContain('"wentWell"');
  expect(retroPrompt).toContain('"didntGoWell"');
  expect(retroPrompt).toContain('Do not guess or invent team sentiment');
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
          blockers: [{
            ticketId: 'RPAB-98',
            title: 'Jira interaction blocked',
            detail: 'Need API route confirmation before close-out.',
            assignee: 'Nick Baumer',
            epic: 'RPAB-27',
            epicName: 'UK Prospect Data Cleansing Automation',
          }],
          stale: [],
          staleInProgress: [],
          notPickedUp: [],
          ticketsDone: [
            { ticket: 'RPAB-96', summary: 'Performer State Machine', assignee: 'Todd Slaughter', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
            { ticket: 'RPAB-105', summary: 'LG - Repeat system exceptions on Edge Print Dialog', assignee: 'Todd Slaughter', epic: 'RPAB-36', epicName: 'Letter Generation' },
          ],
          ticketsInProgress: [
            { ticket: 'RPAB-25', summary: 'Update Process Design documentation', assignee: 'Nick Baumer', epic: 'RPAB-36', epicName: 'Letter Generation' },
          ],
          ticketsInReview: [],
          ticketsBlocked: [
            { ticket: 'RPAB-98', summary: 'Understand how to interact with Jira', assignee: 'Nick Baumer', epic: 'RPAB-27', epicName: 'UK Prospect Data Cleansing Automation' },
          ],
          ticketsTodo: [],
          ticketsBacklog: [],
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
      openrouterKey: 'sk-or_test_key',
      jiraBase: '',
      apiProvider: 'openrouter',
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
  expect(saved.sprintSummaries['4'].sprint).toMatchObject({
    num: 4,
    name: 'Sprint 4',
    start: '2026-04-01',
    end: '2026-04-14',
  });
  expect(saved.sprintSummaries['4'].overview.sprintNum).toBe(4);
  expect(saved.sprintSummaries['4'].overview.sprintName).toBe('Sprint 4');
  expect(saved.sprintSummaries['4'].overview.summary).toMatch(/Sprint 4 closed with 2 done and 2 still open across 2 epics/i);
  expect(saved.sprintSummaries['4'].overview.deliveredTickets.map((item) => item.ticket)).toEqual(
    expect.arrayContaining(['RPAB-96', 'RPAB-105']),
  );
  expect(saved.sprintSummaries['4'].overview.openTickets.map((item) => item.ticket)).toEqual(
    expect.arrayContaining(['RPAB-98', 'RPAB-25']),
  );
  expect(saved.sprintSummaries['4'].meetings[0].summary).toMatch(/Standup: sprint is at risk/i);
  const planningArchive = saved.sprintSummaries['4'].meetings.find((meeting) => meeting.id === 'planning');
  expect(planningArchive.label).toMatch(/Sprint planning \(for Sprint 5\)/i);
  expect(planningArchive.summary).toMatch(/Refinement: Sprint 5 needs clear carry-forward/i);
  expect(planningArchive.highlights).toContain('Carry forward: RPAB-98 — Understand how to interact with Jira');
  expect(planningArchive.highlights).toContain('Decision: RPAB-98 should carry into Sprint 5');
  expect(screen.getAllByText(/Sprint planning \(for Sprint 5\)/i).length).toBeGreaterThan(0);
  expect(saved.sprintSummaries['4'].velocity.summary).toMatch(/Velocity is stable/i);
  expect(screen.getByText(/Sprint close summary/i)).toBeInTheDocument();
  expect(screen.getAllByText(/^Sprint 4$/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/2026-04-01 to 2026-04-14/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/RPAB-96 — Performer State Machine/i)).toBeInTheDocument();
  expect(screen.getAllByText(/RPAB-98 — Understand how to interact with Jira/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Carry forward: RPAB-98 — Understand how to interact with Jira/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Decision: RPAB-98 should carry into Sprint 5/i).length).toBeGreaterThan(0);

  expect(screen.getAllByText(/Standup: sprint is at risk because Jira integration is still blocked\./i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Velocity is stable but completion is still below commitment\./i)).toBeInTheDocument();
  expect(screen.getByText(/Recommendation: Protect focus on blocked work before adding more scope\./i)).toBeInTheDocument();

  confirmSpy.mockRestore();
});

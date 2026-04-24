import {
  composeStateFromSharedState,
  createEmptyMeetingData,
  defaultState,
  extractLocalSettings,
  extractSharedDashboardState,
  hasMeaningfulSharedDashboardState,
  hydrateState,
} from './store';

const DEFAULT_SPRINTS = [
  { num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' },
];

test('splits shared dashboard data from local settings and recomposes them safely', () => {
  const fullState = {
    ...defaultState(DEFAULT_SPRINTS),
    theme: 'dark',
    cohereKey: 'cohere-secret',
    geminiKey: 'gemini-secret',
    groqKey: 'groq-secret',
    openrouterKey: 'sk-or-secret',
    jiraBase: 'https://jira.example.com/browse',
    apiProvider: 'groq',
    connectionTipDismissed: true,
    lastUpdated: '10/04/2026 15:38',
    lastAIResolutionLabel: 'Groq Llama 3.3 70B',
    lastAIResolutionAt: '24/04/2026 09:30',
    savedAt: 1234,
    remoteRevision: 9,
    remoteSavedAt: 1234,
    meetingData: {
      '4_standup': {
        ...createEmptyMeetingData(),
        summary: 'Shared standup snapshot',
      },
    },
  };

  const localSettings = extractLocalSettings(fullState, DEFAULT_SPRINTS);
  const sharedState = extractSharedDashboardState(fullState, DEFAULT_SPRINTS);
  const recomposed = composeStateFromSharedState(sharedState, localSettings, DEFAULT_SPRINTS);

  expect(localSettings).toEqual({
    theme: 'dark',
    cohereKey: 'cohere-secret',
    geminiKey: 'gemini-secret',
    groqKey: 'groq-secret',
    openrouterKey: 'sk-or-secret',
    jiraBase: 'https://jira.example.com/browse',
    apiProvider: 'groq',
    connectionTipDismissed: true,
    lastAIResolutionLabel: 'Groq Llama 3.3 70B',
    lastAIResolutionAt: '24/04/2026 09:30',
  });
  expect(sharedState.theme).toBeUndefined();
  expect(sharedState.cohereKey).toBeUndefined();
  expect(sharedState.geminiKey).toBeUndefined();
  expect(sharedState.groqKey).toBeUndefined();
  expect(sharedState.openrouterKey).toBeUndefined();
  expect(sharedState.remoteRevision).toBeUndefined();
  expect(recomposed.theme).toBe('dark');
  expect(recomposed.cohereKey).toBe('cohere-secret');
  expect(recomposed.geminiKey).toBe('gemini-secret');
  expect(recomposed.groqKey).toBe('groq-secret');
  expect(recomposed.openrouterKey).toBe('sk-or-secret');
  expect(recomposed.lastAIResolutionLabel).toBe('Groq Llama 3.3 70B');
  expect(recomposed.lastAIResolutionAt).toBe('24/04/2026 09:30');
  expect(recomposed.lastUpdated).toBe('10/04/2026 15:38');
  expect(recomposed.meetingData['4_standup'].summary).toBe('Shared standup snapshot');
});

test('detects whether there is meaningful shared dashboard content to bootstrap', () => {
  expect(hasMeaningfulSharedDashboardState(defaultState(DEFAULT_SPRINTS), DEFAULT_SPRINTS)).toBe(false);

  expect(
    hasMeaningfulSharedDashboardState(
      {
        ...defaultState(DEFAULT_SPRINTS),
        lastUpdated: '10/04/2026 15:38',
      },
      DEFAULT_SPRINTS,
    ),
  ).toBe(true);
});

test('hydrateState normalises sprint numbers and active flags from shared snapshots', () => {
  const next = hydrateState(
    {
      ...defaultState(DEFAULT_SPRINTS),
      sprints: [
        { num: '4', name: 'RPAB Sprint 4', start: '2026-04-01', end: '2026-04-14', active: false },
        { num: '5', name: 'RPAB Sprint 5', start: '2026-04-15', end: '2026-04-28', active: false },
      ],
      activeSprint: '5',
      projectProfile: {
        projectKey: 'RPAB',
        projectName: 'RPA Build',
        primaryEpic: 'RPAB-27',
        primaryEpicName: 'UK Prospect Data Cleansing Automation',
        sprintNameTemplate: '{projectKey} Sprint {num}',
        sprintDurationDays: 14,
        sprintGapDays: 0,
      },
    },
    DEFAULT_SPRINTS,
  );

  expect(next.activeSprint).toBe(5);
  expect(next.sprints.find((sprint) => sprint.num === 5)).toMatchObject({
    name: 'RPAB Sprint 5',
    start: '2026-04-15',
    end: '2026-04-28',
    active: true,
  });
});

test('hydrateState promotes the active sprint after an archived sprint close and regenerates the next sprint from archive dates', () => {
  const next = hydrateState(
    {
      ...defaultState(DEFAULT_SPRINTS),
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
        { num: 1, name: 'Sprint 1', start: '2026-01-05', end: '2026-01-18', active: false },
        { num: 2, name: 'Sprint 2', start: '2026-01-19', end: '2026-02-01', active: true },
      ],
      activeSprint: 2,
      sprintSummaries: {
        4: {
          label: 'RPAB Sprint 4 (1 Apr–14 Apr)',
          overview: {
            window: '2026-04-01 to 2026-04-14',
          },
        },
      },
    },
    DEFAULT_SPRINTS,
  );

  expect(next.activeSprint).toBe(5);
  expect(next.sprints.find((sprint) => sprint.num === 5)).toMatchObject({
    name: 'RPAB Sprint 5',
    start: '2026-04-15',
    end: '2026-04-28',
    active: true,
  });
});

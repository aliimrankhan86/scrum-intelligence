import {
  composeStateFromSharedState,
  createEmptyMeetingData,
  defaultState,
  extractLocalSettings,
  extractSharedDashboardState,
  hasMeaningfulSharedDashboardState,
} from './store';

const DEFAULT_SPRINTS = [
  { num: 4, name: 'Sprint 4', start: '2026-04-01', end: '2026-04-14' },
];

test('splits shared dashboard data from local settings and recomposes them safely', () => {
  const fullState = {
    ...defaultState(DEFAULT_SPRINTS),
    theme: 'dark',
    groqKey: 'groq-secret',
    cerebrasKey: 'cerebras-secret',
    jiraBase: 'https://jira.example.com/browse',
    apiProvider: 'groq',
    connectionTipDismissed: true,
    lastUpdated: '10/04/2026 15:38',
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
    groqKey: 'groq-secret',
    cerebrasKey: 'cerebras-secret',
    jiraBase: 'https://jira.example.com/browse',
    apiProvider: 'groq',
    connectionTipDismissed: true,
  });
  expect(sharedState.theme).toBeUndefined();
  expect(sharedState.groqKey).toBeUndefined();
  expect(sharedState.remoteRevision).toBeUndefined();
  expect(recomposed.theme).toBe('dark');
  expect(recomposed.groqKey).toBe('groq-secret');
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

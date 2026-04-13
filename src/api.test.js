import { buildContext } from './api';
import { MEETINGS } from './config';

test('buildContext carries watch tickets, recent sprint history, and dashboard freshness into AI prompts', () => {
  const context = buildContext(
    MEETINGS.standup,
    { num: 4, name: 'Project Sprint 4', start: '2026-04-01', end: '2026-04-14' },
    {
      projectName: 'Current Project',
      primaryEpic: 'ABC-12',
      primaryEpicName: 'Automation Rollout',
      goal: 'Stabilise rollout',
      phase: 'Delivery',
      nextSprint: { num: 5, name: 'Project Sprint 5' },
      workstreams: [{ epic: 'ABC-12', epicName: 'Automation Rollout', focus: 'UAT' }],
      team: [{ name: 'Rina', role: 'Engineer' }],
      stakeholders: [{ name: 'Sam', role: 'Sponsor' }],
      watchTickets: ['ABC-101', 'ABC-205'],
      recentSprintHistory: [
        { label: 'Project Sprint 3', outcome: 'Carry-over from access delay', metrics: 'Points 18/24' },
      ],
      lastUpdated: '12/04/2026 10:30',
    },
  );

  expect(context).toContain('Priority watch tickets: ABC-101 | ABC-205');
  expect(context).toContain('Recent sprint history: Project Sprint 3: Carry-over from access delay (Points 18/24)');
  expect(context).toContain('Last dashboard update: 12/04/2026 10:30');
});

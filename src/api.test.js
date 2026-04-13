import { buildContext, callAI } from './api';
import { MEETINGS } from './config';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

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

test('callAI falls back to OpenRouter when Groq is rate limited', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ error: { message: 'Rate limit' } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '{"ok":true,"summary":"OpenRouter fallback used"}',
            },
          },
        ],
      }),
    });

  const statusEvents = [];
  const parsed = await callAI(
    'Return only JSON.',
    '{"ok":true}',
    {
      groqKey: 'gsk_test',
      openrouterKey: 'sk-or_test',
      openrouterModel: 'google/gemma-4-31b-it:free',
      cerebrasKey: '',
    },
    (provider, msg, providers) => statusEvents.push({ provider, msg, providers }),
  );

  expect(parsed).toEqual({ ok: true, summary: 'OpenRouter fallback used' });
  expect(global.fetch).toHaveBeenNthCalledWith(
    1,
    'https://api.groq.com/openai/v1/chat/completions',
    expect.any(Object),
  );
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    'https://openrouter.ai/api/v1/chat/completions',
    expect.any(Object),
  );
  expect(statusEvents.some((event) => event.provider === 'openrouter')).toBe(true);
});

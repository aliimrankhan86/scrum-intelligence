import { buildContext, callAI, OPENROUTER_PROXY_ENDPOINT, testProviders } from './api';
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

test('callAI rotates to the next OpenRouter model when the primary route is rate limited', async () => {
  const sleep = jest.fn().mockResolvedValue();
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
      openrouterKey: 'sk-or_test',
    },
    (provider, msg, providers) => statusEvents.push({ provider, msg, providers }),
    { sleep },
  );

  expect(parsed).toEqual({ ok: true, summary: 'OpenRouter fallback used' });
  expect(global.fetch).toHaveBeenNthCalledWith(
    1,
    OPENROUTER_PROXY_ENDPOINT,
    expect.any(Object),
  );
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    OPENROUTER_PROXY_ENDPOINT,
    expect.any(Object),
  );
  const firstRequest = JSON.parse(global.fetch.mock.calls[0][1].body);
  const secondRequest = JSON.parse(global.fetch.mock.calls[1][1].body);
  expect(firstRequest.openrouterKey).toBe('sk-or_test');
  expect(firstRequest.model).toBe('google/gemma-4-31b-it:free');
  expect(secondRequest.model).toBe('meta-llama/llama-3.3-70b-instruct:free');
  expect(sleep).toHaveBeenCalledWith(10000);
  expect(statusEvents.some((event) => event.provider === 'fallback')).toBe(true);
  expect(statusEvents.some((event) => event.provider === 'fallback' && /waiting 10s before trying Llama 3.3 70B/i.test(event.msg))).toBe(true);
});

test('callAI rotates immediately on 404 to the next OpenRouter route', async () => {
  const sleep = jest.fn().mockResolvedValue();
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: { message: 'Model route expired' } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '{"ok":true,"summary":"Fallback route used"}',
            },
          },
        ],
      }),
    });

  const parsed = await callAI(
    'Return only JSON.',
    '{"ok":true}',
    {
      openrouterKey: 'sk-or_test',
    },
    undefined,
    { sleep },
  );

  expect(parsed).toEqual({ ok: true, summary: 'Fallback route used' });
  const firstRequest = JSON.parse(global.fetch.mock.calls[0][1].body);
  const secondRequest = JSON.parse(global.fetch.mock.calls[1][1].body);
  expect(global.fetch).toHaveBeenNthCalledWith(
    1,
    OPENROUTER_PROXY_ENDPOINT,
    expect.any(Object),
  );
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    OPENROUTER_PROXY_ENDPOINT,
    expect.any(Object),
  );
  expect(firstRequest.model).toBe('google/gemma-4-31b-it:free');
  expect(secondRequest.model).toBe('meta-llama/llama-3.3-70b-instruct:free');
  expect(sleep).not.toHaveBeenCalled();
});

test('testProviders treats a primary-route success as operational and skips fallback probes', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '{"ok":true}',
            },
          },
        ],
      }),
    });

  const results = await testProviders({ openrouterKey: 'sk-or_test' });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(results.primary.ok).toBe(true);
  expect(results.fallback.skipped).toBe(true);
  expect(results.emergency.skipped).toBe(true);
  expect(results.safety.skipped).toBe(true);
});

test('testProviders checks the safety route when the primary route is rate limited', async () => {
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
              content: '{"ok":true}',
            },
          },
        ],
      }),
    });

  const results = await testProviders({ openrouterKey: 'sk-or_test' });

  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(results.primary.ok).toBe(false);
  expect(results.primary.error).toContain('429');
  expect(results.fallback.skipped).toBe(true);
  expect(results.emergency.skipped).toBe(true);
  expect(results.safety.ok).toBe(true);
});

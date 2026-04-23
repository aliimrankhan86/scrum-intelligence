import { buildContext, callAI, GEMINI_PROXY_ENDPOINT, GROQ_PROXY_ENDPOINT, testProviders } from './api';
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

test('callAI rotates from Gemini to Groq when the primary route is rate limited', async () => {
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
              content: '{"ok":true,"summary":"Groq fallback used"}',
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
      geminiKey: 'gemini_test',
      groqKey: 'gsk_test',
    },
    (provider, msg, providers) => statusEvents.push({ provider, msg, providers }),
    { sleep },
  );

  expect(parsed).toEqual({ ok: true, summary: 'Groq fallback used' });
  expect(global.fetch).toHaveBeenNthCalledWith(
    1,
    GEMINI_PROXY_ENDPOINT,
    expect.any(Object),
  );
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    GROQ_PROXY_ENDPOINT,
    expect.any(Object),
  );
  const firstRequest = JSON.parse(global.fetch.mock.calls[0][1].body);
  const secondRequest = JSON.parse(global.fetch.mock.calls[1][1].body);
  expect(firstRequest.geminiKey).toBe('gemini_test');
  expect(firstRequest.model).toBe('gemini-2.5-flash');
  expect(secondRequest.groqKey).toBe('gsk_test');
  expect(secondRequest.model).toBe('llama-3.3-70b-versatile');
  expect(sleep).toHaveBeenCalledWith(10000);
  expect(statusEvents.some((event) => event.provider === 'fallback')).toBe(true);
  expect(statusEvents.some((event) => event.provider === 'fallback' && /waiting 10s before trying Groq Llama 3\.3 70B/i.test(event.msg))).toBe(true);
});

test('callAI rotates immediately on 404 to the next AI route', async () => {
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
      geminiKey: 'gemini_test',
      groqKey: 'gsk_test',
    },
    undefined,
    { sleep },
  );

  expect(parsed).toEqual({ ok: true, summary: 'Fallback route used' });
  const firstRequest = JSON.parse(global.fetch.mock.calls[0][1].body);
  const secondRequest = JSON.parse(global.fetch.mock.calls[1][1].body);
  expect(global.fetch).toHaveBeenNthCalledWith(
    1,
    GEMINI_PROXY_ENDPOINT,
    expect.any(Object),
  );
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    GROQ_PROXY_ENDPOINT,
    expect.any(Object),
  );
  expect(firstRequest.model).toBe('gemini-2.5-flash');
  expect(secondRequest.model).toBe('llama-3.3-70b-versatile');
  expect(sleep).not.toHaveBeenCalled();
});

test('testProviders checks configured Gemini and Groq routes', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: '{"ok":true}' }],
            },
          }
        ],
      }),
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

  const results = await testProviders({ geminiKey: 'gemini_test', groqKey: 'gsk_test' });

  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(results.gemini.ok).toBe(true);
  expect(results.groq.ok).toBe(true);
  expect(results.openrouter.configured).toBe(false);
});

test('testProviders still checks Groq when Gemini is rate limited', async () => {
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

  const results = await testProviders({ geminiKey: 'gemini_test', groqKey: 'gsk_test' });

  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(results.gemini.ok).toBe(false);
  expect(results.gemini.error).toContain('429');
  expect(results.groq.ok).toBe(true);
  expect(results.openrouter.configured).toBe(false);
});

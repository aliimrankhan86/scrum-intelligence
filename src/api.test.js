import { buildContext, callAI, COHERE_PROXY_ENDPOINT, GEMINI_PROXY_ENDPOINT, GROQ_PROXY_ENDPOINT, testProviders } from './api';
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

test('callAI rotates from Groq to Cohere when the primary route is rate limited', async () => {
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
        finish_reason: 'COMPLETE',
        message: {
          content: [{ text: '{"ok":true,"summary":"Cohere fallback used"}' }],
        },
      }),
    });

  const statusEvents = [];
  const parsed = await callAI(
    'Return only JSON.',
    '{"ok":true}',
    {
      groqKey: 'gsk_test',
      cohereKey: 'cohere_test',
    },
    (provider, msg, providers) => statusEvents.push({ provider, msg, providers }),
    { sleep },
  );

  expect(parsed).toEqual({ ok: true, summary: 'Cohere fallback used' });
  expect(global.fetch).toHaveBeenNthCalledWith(
    1,
    GROQ_PROXY_ENDPOINT,
    expect.any(Object),
  );
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    COHERE_PROXY_ENDPOINT,
    expect.any(Object),
  );
  const firstRequest = JSON.parse(global.fetch.mock.calls[0][1].body);
  const secondRequest = JSON.parse(global.fetch.mock.calls[1][1].body);
  expect(firstRequest.groqKey).toBe('gsk_test');
  expect(firstRequest.model).toBe('llama-3.3-70b-versatile');
  expect(secondRequest.cohereKey).toBe('cohere_test');
  expect(secondRequest.model).toBe('command-r7b-12-2024');
  expect(sleep).toHaveBeenCalledWith(10000);
  expect(statusEvents.some((event) => event.provider === 'fallback')).toBe(true);
  expect(statusEvents.some((event) => event.provider === 'fallback' && /waiting 10s before trying Cohere Command R7B/i.test(event.msg))).toBe(true);
});

test('callAI rotates immediately from Groq to Cohere on 404', async () => {
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
        finish_reason: 'COMPLETE',
        message: {
          content: [{ text: '{"ok":true,"summary":"Fallback route used"}' }],
        },
      }),
    });

  const parsed = await callAI(
    'Return only JSON.',
    '{"ok":true}',
    {
      groqKey: 'gsk_test',
      cohereKey: 'cohere_test',
    },
    undefined,
    { sleep },
  );

  expect(parsed).toEqual({ ok: true, summary: 'Fallback route used' });
  const firstRequest = JSON.parse(global.fetch.mock.calls[0][1].body);
  const secondRequest = JSON.parse(global.fetch.mock.calls[1][1].body);
  expect(global.fetch).toHaveBeenNthCalledWith(
    1,
    GROQ_PROXY_ENDPOINT,
    expect.any(Object),
  );
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    COHERE_PROXY_ENDPOINT,
    expect.any(Object),
  );
  expect(firstRequest.model).toBe('llama-3.3-70b-versatile');
  expect(secondRequest.model).toBe('command-r7b-12-2024');
  expect(sleep).not.toHaveBeenCalled();
});

test('callAI reaches Gemini after Groq and Cohere both fail', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ error: { message: 'Groq unavailable' } }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ error: { message: 'Cohere unavailable' } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: '{"ok":true,"summary":"Gemini tertiary used"}' }],
            },
          },
        ],
      }),
    });

  const parsed = await callAI(
    'Return only JSON.',
    '{"ok":true}',
    {
      groqKey: 'gsk_test',
      cohereKey: 'cohere_test',
      geminiKey: 'gemini_test',
    },
  );

  expect(parsed).toEqual({ ok: true, summary: 'Gemini tertiary used' });
  expect(global.fetch).toHaveBeenNthCalledWith(1, GROQ_PROXY_ENDPOINT, expect.any(Object));
  expect(global.fetch).toHaveBeenNthCalledWith(2, COHERE_PROXY_ENDPOINT, expect.any(Object));
  expect(global.fetch).toHaveBeenNthCalledWith(3, GEMINI_PROXY_ENDPOINT, expect.any(Object));
});

test('testProviders checks configured Groq, Cohere, and Gemini routes', async () => {
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
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        finish_reason: 'COMPLETE',
        message: {
          content: [{ text: '{"ok":true}' }],
        },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: '{"ok":true}' }],
            },
          },
        ],
      }),
    });

  const results = await testProviders({ groqKey: 'gsk_test', cohereKey: 'cohere_test', geminiKey: 'gemini_test' });

  expect(global.fetch).toHaveBeenCalledTimes(3);
  expect(results.groq.ok).toBe(true);
  expect(results.cohere.ok).toBe(true);
  expect(results.gemini.ok).toBe(true);
  expect(results.openrouter.configured).toBe(false);
});

test('testProviders reports a clear error when a proxy route returns the app HTML shell', async () => {
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
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'text/html; charset=utf-8',
      },
      text: async () => '<!doctype html><html><body>shell</body></html>',
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: '{"ok":true}' }],
            },
          },
        ],
      }),
    });

  const results = await testProviders({ groqKey: 'gsk_test', cohereKey: 'cohere_test', geminiKey: 'gemini_test' });

  expect(results.groq.ok).toBe(true);
  expect(results.cohere.ok).toBe(false);
  expect(results.cohere.error).toContain('returned HTML instead of JSON');
  expect(results.gemini.ok).toBe(true);
});

test('testProviders still checks Cohere and Gemini when Groq is rate limited', async () => {
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
        finish_reason: 'COMPLETE',
        message: {
          content: [{ text: '{"ok":true}' }],
        },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: '{"ok":true}' }],
            },
          },
        ],
      }),
    });

  const results = await testProviders({ groqKey: 'gsk_test', cohereKey: 'cohere_test', geminiKey: 'gemini_test' });

  expect(global.fetch).toHaveBeenCalledTimes(3);
  expect(results.groq.ok).toBe(false);
  expect(results.groq.error).toContain('429');
  expect(results.cohere.ok).toBe(true);
  expect(results.gemini.ok).toBe(true);
  expect(results.openrouter.configured).toBe(false);
});

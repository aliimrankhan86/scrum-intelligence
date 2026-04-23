// ─── AI Routing: Gemini primary, Groq fallback, optional OpenRouter fallback ──

import {
  AI_MODEL_CHAIN,
  getConfiguredAIModels,
  hasAIModelKey,
} from './aiProviders';

const AI_MAX_COMPLETION_TOKENS = 2200;
const AI_RATE_LIMIT_BACKOFF_MS = 10000;
const configuredOrigin = (process.env.REACT_APP_SYNC_SERVER_ORIGIN || '').trim().replace(/\/+$/, '');
export const GEMINI_PROXY_ENDPOINT = configuredOrigin
  ? `${configuredOrigin}/api/gemini/generate`
  : '/api/gemini/generate';
export const GROQ_PROXY_ENDPOINT = configuredOrigin
  ? `${configuredOrigin}/api/groq/chat`
  : '/api/groq/chat';
export const OPENROUTER_PROXY_ENDPOINT = configuredOrigin
  ? `${configuredOrigin}/api/openrouter/chat`
  : '/api/openrouter/chat';

function noKeyStatus(model) {
  return { state: 'no_key', detail: `No ${model.label} key saved` };
}

function buildModelStates(keys) {
  return Object.fromEntries(
    AI_MODEL_CHAIN.map((model) => [
      model.key,
      hasAIModelKey(model, keys)
        ? { state: 'ready', detail: `${model.label} key saved and ready` }
        : noKeyStatus(model),
    ]),
  );
}

function emitModelStates(onStatusChange, currentStates, provider, msg, patch = {}) {
  const nextStates = { ...currentStates, ...patch };
  onStatusChange?.(provider, msg, nextStates);
  return nextStates;
}

function modelStatePatch(activeKey, activeState, otherStateBuilder) {
  return Object.fromEntries(
    AI_MODEL_CHAIN.map((model) => [
      model.key,
      model.key === activeKey
        ? activeState
        : otherStateBuilder(model),
    ]),
  );
}

function isRetryableAIModelFailure(error) {
  const status = Number(error?.status);
  return status === 429 || status === 404 || status >= 500;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function callAI(systemPrompt, userContent, keys, onStatusChange, options = {}) {
  const maxCompletionTokens = Number.isFinite(Number(options?.openrouterMaxTokens))
    ? Number(options.openrouterMaxTokens)
    : Number.isFinite(Number(options?.maxCompletionTokens))
      ? Number(options.maxCompletionTokens)
      : AI_MAX_COMPLETION_TOKENS;
  const rateLimitBackoffMs = Number.isFinite(Number(options?.rateLimitBackoffMs))
    ? Number(options.rateLimitBackoffMs)
    : AI_RATE_LIMIT_BACKOFF_MS;
  const sleep = typeof options?.sleep === 'function' ? options.sleep : wait;
  const configuredModels = getConfiguredAIModels(keys);

  if (!configuredModels.length) {
    throw new Error('No Gemini or Groq API key configured — click ⚙ API keys');
  }

  const errors = [];
  let modelStates = buildModelStates(keys);

  for (let index = 0; index < configuredModels.length; index += 1) {
    const model = configuredModels[index];
    const nextModel = configuredModels[index + 1] || null;

    modelStates = emitModelStates(
      onStatusChange,
      modelStates,
      index === 0 ? 'processing' : 'fallback',
      index === 0
        ? `Contacting ${model.label}...`
        : `Retrying with ${model.label}...`,
      modelStatePatch(
        model.key,
        { state: 'working', detail: `Sending request to ${model.id}` },
        () => nextModel
          ? { state: 'standby', detail: `Waiting in case ${model.label} fails` }
          : { state: 'standby', detail: 'Waiting for the active AI route' },
      ),
    );

    try {
      const raw = await requestAIModel({
        keys,
        model,
        systemPrompt,
        userContent,
        maxCompletionTokens,
      });
      if (!raw) throw new Error(`${model.id} returned empty response`);
      const parsed = parseJSON(raw);
      modelStates = emitModelStates(
        onStatusChange,
        modelStates,
        model.key,
        `Powered by ${model.label}`,
        modelStatePatch(
          model.key,
          { state: 'active', detail: `Response received from ${model.id}` },
          () => ({ state: 'standby', detail: 'Route available if needed' }),
        ),
      );
      return parsed;
    } catch (error) {
      errors.push(`${model.label} unavailable: ${error.message}`);
      const retryable = isRetryableAIModelFailure(error) && nextModel;
      const state = error.status === 429 ? 'rate_limited' : error.status === 404 ? 'expired' : 'failed';

      if (retryable) {
        if (error.status === 429) {
          modelStates = emitModelStates(
            onStatusChange,
            modelStates,
            'fallback',
            `${model.label} rate limited — waiting 10s before trying ${nextModel.label}...`,
            {
              [model.key]: { state, detail: error.message },
            },
          );
          await sleep(rateLimitBackoffMs);
          continue;
        }

        modelStates = emitModelStates(
          onStatusChange,
          modelStates,
          'fallback',
          error.status === 404
            ? `${model.label} expired or unavailable — trying ${nextModel.label}...`
            : `${model.label} failed — trying ${nextModel.label}...`,
          {
            [model.key]: { state, detail: error.message },
          },
        );
        continue;
      }

      modelStates = emitModelStates(
        onStatusChange,
        modelStates,
        'error',
        'AI model chain exhausted',
        {
          [model.key]: { state, detail: error.message },
        },
      );
      break;
    }
  }

  throw new Error(errors.join(' | '));
}

export async function testProviders(keys, onStatusChange) {
  const results = Object.fromEntries(
    AI_MODEL_CHAIN.map((model) => [
      model.key,
      { ok: false, configured: hasAIModelKey(model, keys), skipped: false, error: '' },
    ]),
  );

  const configuredModels = getConfiguredAIModels(keys);
  if (!configuredModels.length) {
    return results;
  }

  let modelStates = buildModelStates(keys);
  const testSystem = 'Return only compact JSON.';
  const testUser = '{"ok":true}';

  const runSingleRouteTest = async (model) => {
    modelStates = emitModelStates(
      onStatusChange,
      modelStates,
      'processing',
      `Testing ${model.label}...`,
      {
        [model.key]: { state: 'working', detail: `Testing ${model.id}` },
      },
    );

    const raw = await requestAIModel({
      keys,
      model,
      systemPrompt: testSystem,
      userContent: testUser,
      maxCompletionTokens: 80,
    });
    if (!raw) throw new Error(`${model.id} returned empty response`);
    results[model.key] = { ok: true, configured: true, skipped: false };
    modelStates = emitModelStates(
      onStatusChange,
      modelStates,
      model.key,
      `${model.label} test passed`,
      {
        [model.key]: { state: 'active', detail: `${model.label} test request succeeded` },
      },
    );
  };

  for (const model of configuredModels) {
    try {
      await runSingleRouteTest(model);
    } catch (error) {
      results[model.key] = { ok: false, configured: true, skipped: false, error: error.message };
      modelStates = emitModelStates(
        onStatusChange,
        modelStates,
        model.key,
        `${model.label} test failed`,
        {
          [model.key]: {
            state: error.status === 429 ? 'rate_limited' : error.status === 404 ? 'expired' : 'failed',
            detail: error.message,
          },
        },
      );
    }
  }

  return results;
}

async function requestAIModel({ keys, model, systemPrompt, userContent, maxCompletionTokens }) {
  if (model.provider === 'gemini') {
    return requestGeminiGenerate({
      geminiKey: keys.geminiKey,
      modelId: model.id,
      systemPrompt,
      userContent,
      maxCompletionTokens,
    });
  }

  if (model.provider === 'groq') {
    return requestGroqChat({
      groqKey: keys.groqKey,
      modelId: model.id,
      systemPrompt,
      userContent,
      maxCompletionTokens,
    });
  }

  return requestOpenRouterChat({
    openrouterKey: keys.openrouterKey,
    modelId: model.id,
    systemPrompt,
    userContent,
    maxCompletionTokens,
  });
}

async function requestGeminiGenerate({ geminiKey, modelId, systemPrompt, userContent, maxCompletionTokens }) {
  let res;
  try {
    res = await fetch(GEMINI_PROXY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        geminiKey,
        model: modelId,
        systemPrompt,
        userContent,
        temperature: 0.1,
        maxOutputTokens: maxCompletionTokens,
        responseMimeType: 'application/json',
      }),
    });
  } catch (_) {
    const requestError = new Error('The local Gemini proxy did not respond. Ensure the shared server is running and reachable.');
    requestError.status = 0;
    throw requestError;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err?.error?.message || err?.message || res.statusText;
    const requestError = new Error(`Gemini ${res.status}: ${detail}`);
    requestError.status = res.status;
    throw requestError;
  }

  const data = await res.json();
  const candidate = data.candidates?.[0] || {};
  const finishReason = candidate.finishReason || data.finishReason || '';
  const content = (candidate.content?.parts || [])
    .map((part) => part?.text || '')
    .join('')
    .trim();
  if (finishReason === 'MAX_TOKENS') {
    const requestError = new Error(`Gemini responded, but the JSON was truncated for ${modelId} (finishReason=MAX_TOKENS).`);
    requestError.status = 200;
    throw requestError;
  }
  return content;
}

async function requestGroqChat({ groqKey, modelId, systemPrompt, userContent, maxCompletionTokens }) {
  return requestOpenAICompatibleChat({
    endpoint: GROQ_PROXY_ENDPOINT,
    providerLabel: 'Groq',
    apiKeyField: 'groqKey',
    apiKey: groqKey,
    modelId,
    systemPrompt,
    userContent,
    maxCompletionTokens,
    includeResponseFormat: false,
  });
}

async function requestOpenRouterChat({ openrouterKey, modelId, systemPrompt, userContent, maxCompletionTokens }) {
  return requestOpenAICompatibleChat({
    endpoint: OPENROUTER_PROXY_ENDPOINT,
    providerLabel: 'OpenRouter',
    apiKeyField: 'openrouterKey',
    apiKey: openrouterKey,
    modelId,
    systemPrompt,
    userContent,
    maxCompletionTokens,
    includeResponseFormat: true,
  });
}

async function requestOpenAICompatibleChat({
  endpoint,
  providerLabel,
  apiKeyField,
  apiKey,
  modelId,
  systemPrompt,
  userContent,
  maxCompletionTokens,
  includeResponseFormat,
}) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        [apiKeyField]: apiKey,
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_completion_tokens: maxCompletionTokens,
        ...(includeResponseFormat ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (_) {
    const requestError = new Error(`The local ${providerLabel} proxy did not respond. Ensure the shared server is running and reachable.`);
    requestError.status = 0;
    throw requestError;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail =
      err?.error?.message ||
      err?.message ||
      (Array.isArray(err?.errors) ? err.errors.join(', ') : '') ||
      res.statusText;
    const requestError = new Error(`${providerLabel} ${res.status}: ${detail}`);
    requestError.status = res.status;
    throw requestError;
  }

  const data = await res.json();
  const finishReason = data.choices?.[0]?.finish_reason || data.finish_reason || '';
  const content = data.choices?.[0]?.message?.content || '';
  if (finishReason === 'length') {
    const requestError = new Error(`${providerLabel} responded, but the JSON was truncated for ${modelId} (finish_reason=length).`);
    requestError.status = 200;
    throw requestError;
  }
  return content;
}

// Robust JSON parser — handles markdown fences, extra text before/after
function parseJSON(raw) {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try { return JSON.parse(cleaned); } catch (_) {}

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
  }

  throw new Error('Could not parse AI response as JSON. Raw: ' + cleaned.substring(0, 200));
}

// ─── Build context for AI calls ───────────────────────────────────────────────
export function buildContext(meeting, sprint, project) {
  const today = new Date();
  const sprintLength = sprint
    ? Math.max(1, Math.round((new Date(sprint.end + 'T00:00:00') - new Date(sprint.start + 'T00:00:00')) / 86400000) + 1)
    : 10;
  const sprintDay = sprint
    ? Math.max(1, Math.ceil((today - new Date(sprint.start + 'T00:00:00')) / 86400000))
    : 1;
  const daysLeft = sprint
    ? Math.ceil((new Date(sprint.end + 'T00:00:00') - today) / 86400000)
    : 0;

  const projectName = project.projectName || project.name || 'Current project';
  const primaryEpic = project.primaryEpic || project.epic || 'Unknown epic';
  const primaryEpicName = project.primaryEpicName || project.epicName || 'Unknown epic';
  const goal = project.goal || 'Not provided';
  const phase = project.phase || 'Not provided';
  const nextSprint = project.nextSprint;
  const workstreams = Array.isArray(project.workstreams) && project.workstreams.length
    ? project.workstreams
      .map((item) => `${item.epic || 'unknown epic'} (${item.epicName || 'untitled workstream'})${item.focus ? ` — ${item.focus}` : ''}`)
      .join(' | ')
    : `${primaryEpic} (${primaryEpicName})`;
  const team = Array.isArray(project.team) && project.team.length
    ? project.team.map(t => `${t.name} (${t.role || 'role not recorded'})`).join(', ')
    : 'Not provided';
  const stakeholders = Array.isArray(project.stakeholders) && project.stakeholders.length
    ? project.stakeholders.map(s => `${s.name} (${s.role || 'role not recorded'})`).join(', ')
    : 'Not provided';
  const knownRisks = Array.isArray(project.knownRisks) && project.knownRisks.length
    ? project.knownRisks.join(' | ')
    : 'None recorded';
  const knownDecisions = Array.isArray(project.knownDecisions) && project.knownDecisions.length
    ? project.knownDecisions.join(' | ')
    : 'None recorded';
  const watchTickets = Array.isArray(project.watchTickets) && project.watchTickets.length
    ? project.watchTickets.join(' | ')
    : 'None recorded';
  const recentSprintHistory = Array.isArray(project.recentSprintHistory) && project.recentSprintHistory.length
    ? project.recentSprintHistory
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        const label = entry.label || entry.name || (entry.num != null ? `Sprint ${entry.num}` : 'Recent sprint');
        const outcome = entry.outcome || entry.summary || entry.status || 'Outcome not recorded';
        const metrics = entry.metrics || '';
        return `${label}: ${outcome}${metrics ? ` (${metrics})` : ''}`;
      })
      .join(' | ')
    : 'None recorded';
  const lastDashboardUpdate = project.lastUpdated || 'Not recorded';

  return `CONTEXT FOR AI:
Project: ${projectName} (Primary epic ${primaryEpic} — ${primaryEpicName})
Sprint: ${sprint ? `${sprint.name} — Day ${sprintDay} of ${sprintLength}, ${daysLeft} days remaining` : 'Unknown'}
Next sprint: ${nextSprint ? `${nextSprint.name} (#${nextSprint.num})` : 'Not provided'}
Sprint goal: "${goal}"
Phase: ${phase}
Meeting type: ${meeting.label}
Workstreams / epics in play: ${workstreams}
Team: ${team}
Stakeholders: ${stakeholders}
Priority watch tickets: ${watchTickets}
Recent sprint history: ${recentSprintHistory}
Known risks: ${knownRisks}
Confirmed decisions: ${knownDecisions}
Last dashboard update: ${lastDashboardUpdate}

${meeting.systemPrompt}`;
}

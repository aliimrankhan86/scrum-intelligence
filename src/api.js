// ─── AI Providers: Groq primary + OpenRouter + Cerebras fallback ─────────────

import {
  CEREBRAS_PROVIDER,
  GROQ_PROVIDER,
  OPENROUTER_PROVIDER,
  resolveOpenRouterModelId,
} from './aiProviders';

const OPENROUTER_MAX_TOKENS = 2200;
const CEREBRAS_MAX_TOKENS = 2200;

function noKeyStatus(label) {
  return { state: 'no_key', detail: `No ${label} key saved` };
}

function buildProviderStates(keys) {
  const openrouterModel = resolveOpenRouterModelId(keys?.openrouterModel);
  return {
    groq: keys?.groqKey
      ? { state: 'ready', detail: 'Primary Groq model ready to use' }
      : noKeyStatus(GROQ_PROVIDER.label),
    openrouter: keys?.openrouterKey
      ? { state: 'ready', detail: `OpenRouter ready with ${openrouterModel}` }
      : noKeyStatus(OPENROUTER_PROVIDER.label),
    cerebras: keys?.cerebrasKey
      ? { state: 'ready', detail: 'Cerebras fallback model ready to use' }
      : noKeyStatus(CEREBRAS_PROVIDER.label),
  };
}

function nextAvailableProviderLabel(keys, currentProvider) {
  const checks = [
    currentProvider === 'groq' && keys?.openrouterKey ? OPENROUTER_PROVIDER.label : '',
    currentProvider !== 'cerebras' && keys?.cerebrasKey ? CEREBRAS_PROVIDER.label : '',
  ].filter(Boolean);
  return checks[0] || '';
}

export async function callAI(systemPrompt, userContent, keys, onStatusChange, options = {}) {
  const { groqKey, openrouterKey, openrouterModel, cerebrasKey } = keys;
  const resolvedOpenRouterModel = resolveOpenRouterModelId(openrouterModel);
  const groqMaxTokens = Number.isFinite(Number(options?.groqMaxTokens))
    ? Number(options.groqMaxTokens)
    : 1500;
  const openrouterMaxTokens = Number.isFinite(Number(options?.openrouterMaxTokens))
    ? Number(options.openrouterMaxTokens)
    : OPENROUTER_MAX_TOKENS;
  const cerebrasMaxTokens = Number.isFinite(Number(options?.cerebrasMaxTokens))
    ? Number(options.cerebrasMaxTokens)
    : CEREBRAS_MAX_TOKENS;
  const emit = (provider, msg, providers) => onStatusChange?.(provider, msg, providers);
  const errors = [];
  let providerStates = buildProviderStates(keys);

  const emitWithStates = (provider, msg, patch = {}) => {
    providerStates = { ...providerStates, ...patch };
    emit(provider, msg, providerStates);
  };

  if (!groqKey && !openrouterKey && !cerebrasKey) {
    throw new Error('No API keys configured — click ⚙ API keys');
  }

  if (groqKey) {
    try {
      emitWithStates('processing', `Contacting ${GROQ_PROVIDER.chipLabel}...`, {
        groq: { state: 'working', detail: `Sending request to ${GROQ_PROVIDER.modelId}` },
        openrouter: openrouterKey
          ? { state: 'standby', detail: `Waiting in case ${GROQ_PROVIDER.chipLabel} fails` }
          : noKeyStatus(OPENROUTER_PROVIDER.label),
        cerebras: cerebrasKey
          ? { state: 'standby', detail: 'Waiting for earlier providers in the fallback chain' }
          : noKeyStatus(CEREBRAS_PROVIDER.label),
      });

      const raw = await requestGroqChat({
        groqKey,
        model: GROQ_PROVIDER.modelId,
        systemPrompt,
        userContent,
        maxTokens: groqMaxTokens,
      });
      if (!raw) throw new Error(`${GROQ_PROVIDER.modelId} returned empty response`);
      const parsed = parseJSON(raw);
      emitWithStates('groq', `Powered by ${GROQ_PROVIDER.label}`, {
        groq: { state: 'active', detail: `Response received from ${GROQ_PROVIDER.chipLabel}` },
        openrouter: openrouterKey
          ? { state: 'standby', detail: 'Fallback provider was not needed' }
          : noKeyStatus(OPENROUTER_PROVIDER.label),
        cerebras: cerebrasKey
          ? { state: 'standby', detail: 'Fallback provider was not needed' }
          : noKeyStatus(CEREBRAS_PROVIDER.label),
      });
      return parsed;
    } catch (e) {
      const nextLabel = nextAvailableProviderLabel(keys, 'groq');
      errors.push(`${GROQ_PROVIDER.chipLabel} unavailable: ${e.message}`);
      if (nextLabel) {
        emitWithStates(
          'fallback',
          e.status === 429
            ? `${GROQ_PROVIDER.chipLabel} rate limited — trying ${nextLabel}...`
            : `${GROQ_PROVIDER.chipLabel} failed — trying ${nextLabel}...`,
          {
            groq: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
            openrouter: openrouterKey
              ? {
                  state: 'working',
                  detail: `Sending request to ${resolvedOpenRouterModel}`,
                }
              : providerStates.openrouter,
            cerebras: !openrouterKey && cerebrasKey
              ? { state: 'working', detail: `Sending request to ${CEREBRAS_PROVIDER.modelId}` }
              : providerStates.cerebras,
          },
        );
      } else {
        providerStates = {
          ...providerStates,
          groq: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
        };
      }
    }
  }

  if (openrouterKey) {
    try {
      if (!groqKey) {
        emitWithStates('processing', `Contacting ${OPENROUTER_PROVIDER.label}...`, {
          groq: noKeyStatus(GROQ_PROVIDER.label),
          openrouter: { state: 'working', detail: `Sending request to ${resolvedOpenRouterModel}` },
          cerebras: cerebrasKey
            ? { state: 'standby', detail: 'Waiting in case OpenRouter fails' }
            : noKeyStatus(CEREBRAS_PROVIDER.label),
        });
      }

      const raw = await requestOpenRouterChat({
        openrouterKey,
        model: resolvedOpenRouterModel,
        systemPrompt,
        userContent,
        maxTokens: openrouterMaxTokens,
      });
      if (!raw) throw new Error(`${resolvedOpenRouterModel} returned empty response`);
      const parsed = parseJSON(raw);
      emitWithStates(
        'openrouter',
        groqKey
          ? `${GROQ_PROVIDER.label} unavailable — using ${OPENROUTER_PROVIDER.label}`
          : `Powered by ${OPENROUTER_PROVIDER.label}`,
        {
          openrouter: { state: 'active', detail: `Response received from ${resolvedOpenRouterModel}` },
          cerebras: cerebrasKey
            ? { state: 'standby', detail: 'Fallback provider was not needed' }
            : noKeyStatus(CEREBRAS_PROVIDER.label),
        },
      );
      return parsed;
    } catch (e) {
      errors.push(`${OPENROUTER_PROVIDER.label} unavailable: ${e.message}`);
      if (cerebrasKey) {
        emitWithStates(
          'fallback',
          e.status === 429
            ? `${OPENROUTER_PROVIDER.label} rate limited — trying ${CEREBRAS_PROVIDER.label}...`
            : `${OPENROUTER_PROVIDER.label} failed — trying ${CEREBRAS_PROVIDER.label}...`,
          {
            openrouter: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
            cerebras: { state: 'working', detail: `Sending request to ${CEREBRAS_PROVIDER.modelId}` },
          },
        );
      } else {
        providerStates = {
          ...providerStates,
          openrouter: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
        };
      }
    }
  }

  if (!cerebrasKey) {
    emitWithStates('error', `${CEREBRAS_PROVIDER.label} not configured`, {
      cerebras: noKeyStatus(CEREBRAS_PROVIDER.label),
    });
    throw new Error(errors.join(' | ') || 'No Cerebras key saved');
  }

  try {
    if (!groqKey && !openrouterKey) {
      emitWithStates('processing', `Contacting ${CEREBRAS_PROVIDER.chipLabel}...`, {
        groq: noKeyStatus(GROQ_PROVIDER.label),
        openrouter: noKeyStatus(OPENROUTER_PROVIDER.label),
        cerebras: { state: 'working', detail: `Sending request to ${CEREBRAS_PROVIDER.modelId}` },
      });
    }

    const raw = await requestCerebrasChat({
      cerebrasKey,
      model: CEREBRAS_PROVIDER.modelId,
      systemPrompt,
      userContent,
      maxTokens: cerebrasMaxTokens,
    });
    if (!raw) throw new Error(`${CEREBRAS_PROVIDER.modelId} returned empty response`);
    const parsed = parseJSON(raw);
    emitWithStates(
      'cerebras',
      groqKey || openrouterKey
        ? 'Earlier providers unavailable — using Cerebras'
        : `Powered by ${CEREBRAS_PROVIDER.label}`,
      {
        cerebras: { state: 'active', detail: `Response received from ${CEREBRAS_PROVIDER.chipLabel}` },
      },
    );
    return parsed;
  } catch (e) {
    errors.push(`${CEREBRAS_PROVIDER.chipLabel} unavailable: ${e.message}`);
    emitWithStates('error', 'No provider responded', {
      cerebras: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
    });
  }

  throw new Error(errors.join(' | '));
}

export async function testProviders(keys, onStatusChange) {
  const { groqKey, openrouterKey, openrouterModel, cerebrasKey } = keys;
  const resolvedOpenRouterModel = resolveOpenRouterModelId(openrouterModel);
  const emit = (provider, msg, providers) => onStatusChange?.(provider, msg, providers);
  let providerStates = buildProviderStates(keys);
  const emitWithStates = (provider, msg, patch = {}) => {
    providerStates = { ...providerStates, ...patch };
    emit(provider, msg, providerStates);
  };
  const results = {};
  const testSystem = 'Return only compact JSON.';
  const testUser = '{"ok":true}';

  if (!groqKey && !openrouterKey && !cerebrasKey) {
    return {
      groq: { ok: false, configured: false, error: 'No Groq key saved' },
      openrouter: { ok: false, configured: false, error: 'No OpenRouter key saved' },
      cerebras: { ok: false, configured: false, error: 'No Cerebras key saved' },
    };
  }

  if (!groqKey) {
    results.groq = { ok: false, configured: false, error: 'No Groq key saved' };
    emitWithStates('groq', `${GROQ_PROVIDER.chipLabel} not configured`);
  } else {
    try {
      emitWithStates('processing', `Testing ${GROQ_PROVIDER.chipLabel}...`, {
        groq: { state: 'working', detail: `Testing ${GROQ_PROVIDER.modelId}` },
        openrouter: openrouterKey
          ? { state: 'standby', detail: `Waiting to test ${OPENROUTER_PROVIDER.label}` }
          : noKeyStatus(OPENROUTER_PROVIDER.label),
        cerebras: cerebrasKey
          ? { state: 'standby', detail: `Waiting to test ${CEREBRAS_PROVIDER.chipLabel}` }
          : noKeyStatus(CEREBRAS_PROVIDER.label),
      });
      const raw = await requestGroqChat({
        groqKey,
        model: GROQ_PROVIDER.modelId,
        systemPrompt: testSystem,
        userContent: testUser,
        maxTokens: 80,
      });
      if (!raw) throw new Error(`${GROQ_PROVIDER.modelId} returned empty response`);
      results.groq = { ok: true, configured: true };
      emitWithStates('groq', `${GROQ_PROVIDER.chipLabel} test passed`, {
        groq: { state: 'active', detail: `${GROQ_PROVIDER.chipLabel} test request succeeded` },
      });
    } catch (e) {
      results.groq = { ok: false, configured: true, error: e.message };
      emitWithStates('groq', `${GROQ_PROVIDER.chipLabel} test failed`, {
        groq: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
      });
    }
  }

  if (!openrouterKey) {
    results.openrouter = { ok: false, configured: false, error: 'No OpenRouter key saved' };
    emitWithStates('openrouter', `${OPENROUTER_PROVIDER.label} not configured`);
  } else {
    try {
      emitWithStates('processing', `Testing ${OPENROUTER_PROVIDER.label}...`, {
        openrouter: { state: 'working', detail: `Testing ${resolvedOpenRouterModel}` },
        cerebras: cerebrasKey
          ? { state: 'standby', detail: `Waiting to test ${CEREBRAS_PROVIDER.chipLabel}` }
          : noKeyStatus(CEREBRAS_PROVIDER.label),
      });
      const raw = await requestOpenRouterChat({
        openrouterKey,
        model: resolvedOpenRouterModel,
        systemPrompt: testSystem,
        userContent: testUser,
        maxTokens: 80,
      });
      if (!raw) throw new Error(`${resolvedOpenRouterModel} returned empty response`);
      results.openrouter = { ok: true, configured: true };
      emitWithStates('openrouter', `${OPENROUTER_PROVIDER.label} test passed`, {
        openrouter: { state: 'active', detail: `${OPENROUTER_PROVIDER.label} test request succeeded` },
      });
    } catch (e) {
      results.openrouter = { ok: false, configured: true, error: e.message };
      emitWithStates('openrouter', `${OPENROUTER_PROVIDER.label} test failed`, {
        openrouter: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
      });
    }
  }

  if (!cerebrasKey) {
    results.cerebras = { ok: false, configured: false, error: 'No Cerebras key saved' };
    emitWithStates('cerebras', `${CEREBRAS_PROVIDER.chipLabel} not configured`);
  } else {
    try {
      emitWithStates('processing', `Testing ${CEREBRAS_PROVIDER.chipLabel}...`, {
        cerebras: { state: 'working', detail: `Testing ${CEREBRAS_PROVIDER.modelId}` },
      });
      const raw = await requestCerebrasChat({
        cerebrasKey,
        model: CEREBRAS_PROVIDER.modelId,
        systemPrompt: testSystem,
        userContent: testUser,
        maxTokens: 80,
      });
      if (!raw) throw new Error(`${CEREBRAS_PROVIDER.modelId} returned empty response`);
      results.cerebras = { ok: true, configured: true };
      emitWithStates('cerebras', `${CEREBRAS_PROVIDER.chipLabel} test passed`, {
        cerebras: { state: 'active', detail: `${CEREBRAS_PROVIDER.chipLabel} test request succeeded` },
      });
    } catch (e) {
      results.cerebras = { ok: false, configured: true, error: e.message };
      emitWithStates('cerebras', `${CEREBRAS_PROVIDER.chipLabel} test failed`, {
        cerebras: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
      });
    }
  }

  return results;
}

async function requestGroqChat({ groqKey, model, systemPrompt, userContent, maxTokens }) {
  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
      }),
    });
  } catch (e) {
    const requestError = new Error('Groq request did not reach the API. Check browser CORS, network access, or extension settings.');
    requestError.status = 0;
    throw requestError;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const requestError = new Error(`Groq ${res.status}: ${err?.error?.message || res.statusText}`);
    requestError.status = res.status;
    throw requestError;
  }

  const data = await res.json();
  const finishReason = data.choices?.[0]?.finish_reason || data.finish_reason || '';
  const content = data.choices?.[0]?.message?.content || '';
  if (finishReason === 'length') {
    const requestError = new Error('OpenRouter responded, but the JSON was truncated (finish_reason=length).');
    requestError.status = 200;
    throw requestError;
  }
  return content;
}

async function requestOpenRouterChat({ openrouterKey, model, systemPrompt, userContent, maxTokens }) {
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
        'X-Title': 'Scrum Intelligence',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
      }),
    });
  } catch (e) {
    const requestError = new Error('OpenRouter request did not reach the API. Check browser CORS, network access, or the saved key.');
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
    const requestError = new Error(`OpenRouter ${res.status}: ${detail}`);
    requestError.status = res.status;
    throw requestError;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function requestCerebrasChat({ cerebrasKey, model, systemPrompt, userContent, maxTokens }) {
  let res;
  try {
    res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cerebrasKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_completion_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (e) {
    const requestError = new Error('Cerebras request did not reach the API. Check browser CORS, network access, or the saved key.');
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
    const requestError = new Error(`Cerebras ${res.status}: ${detail}`);
    requestError.status = res.status;
    throw requestError;
  }

  const data = await res.json();
  const finishReason = data.choices?.[0]?.finish_reason || data.finish_reason || '';
  const content = data.choices?.[0]?.message?.content || '';
  if (finishReason === 'length') {
    const requestError = new Error('Cerebras responded, but the JSON was truncated (finish_reason=length).');
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

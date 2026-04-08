// ─── AI Providers: Groq primary + Cerebras free fallback ─────────────────────

const PRIMARY_GROQ_MODEL = {
  id: 'llama-3.3-70b-versatile',
  label: 'Groq 70B',
};

const CEREBRAS_FALLBACK_MODEL = {
  id: 'llama3.1-8b',
  label: 'Cerebras Llama 3.1 8B',
};

const CEREBRAS_MAX_TOKENS = 2200;

export async function callAI(systemPrompt, userContent, keys, onStatusChange, options = {}) {
  const { groqKey, cerebrasKey } = keys;
  const groqMaxTokens = Number.isFinite(Number(options?.groqMaxTokens))
    ? Number(options.groqMaxTokens)
    : 1500;
  const cerebrasMaxTokens = Number.isFinite(Number(options?.cerebrasMaxTokens))
    ? Number(options.cerebrasMaxTokens)
    : CEREBRAS_MAX_TOKENS;
  const emit = (provider, msg, providers) => onStatusChange?.(provider, msg, providers);
  const errors = [];

  if (!groqKey && !cerebrasKey) {
    throw new Error('No API keys configured — click ⚙ API keys');
  }

  let primaryState = groqKey ? 'ready' : 'no_key';
  let primaryDetail = groqKey ? 'Primary Groq model ready to use' : 'No Groq key saved';

  if (groqKey) {
    try {
      emit('processing', `Contacting ${PRIMARY_GROQ_MODEL.label}...`, {
        primary: { state: 'working', detail: `Sending request to ${PRIMARY_GROQ_MODEL.id}` },
        fallback: cerebrasKey
          ? { state: 'standby', detail: `Waiting in case ${PRIMARY_GROQ_MODEL.label} fails` }
          : { state: 'no_key', detail: 'No Cerebras key saved' },
      });

      const raw = await requestGroqChat({
        groqKey,
        model: PRIMARY_GROQ_MODEL.id,
        systemPrompt,
        userContent,
        maxTokens: groqMaxTokens,
      });
      if (!raw) throw new Error(`${PRIMARY_GROQ_MODEL.id} returned empty response`);
      const parsed = parseJSON(raw);
      emit('groq', `Powered by ${PRIMARY_GROQ_MODEL.label}`, {
        primary: { state: 'active', detail: `Response received from ${PRIMARY_GROQ_MODEL.label}` },
        fallback: cerebrasKey
          ? { state: 'standby', detail: 'Fallback provider was not needed' }
          : { state: 'no_key', detail: 'No Cerebras key saved' },
      });
      return parsed;
    } catch (e) {
      primaryState = e.status === 429 ? 'rate_limited' : 'failed';
      primaryDetail = e.message;
      errors.push(`${PRIMARY_GROQ_MODEL.label} unavailable: ${e.message}`);
      if (cerebrasKey) {
        emit(
          'fallback',
          primaryState === 'rate_limited'
            ? `${PRIMARY_GROQ_MODEL.label} rate limited — trying ${CEREBRAS_FALLBACK_MODEL.label}...`
            : `${PRIMARY_GROQ_MODEL.label} failed — trying ${CEREBRAS_FALLBACK_MODEL.label}...`,
          {
            primary: { state: primaryState, detail: primaryDetail },
            fallback: { state: 'working', detail: `Sending request to ${CEREBRAS_FALLBACK_MODEL.id}` },
          },
        );
      }
    }
  }

  try {
    if (!cerebrasKey) {
      emit('error', `${CEREBRAS_FALLBACK_MODEL.label} not configured`, {
        primary: { state: primaryState, detail: primaryDetail },
        fallback: { state: 'no_key', detail: 'No Cerebras key saved' },
      });
      throw new Error(errors.join(' | ') || 'No Cerebras key saved');
    }

    if (!groqKey) {
      emit('processing', `Contacting ${CEREBRAS_FALLBACK_MODEL.label}...`, {
        primary: { state: 'no_key', detail: 'No Groq key saved' },
        fallback: { state: 'working', detail: `Sending request to ${CEREBRAS_FALLBACK_MODEL.id}` },
      });
    }

    const raw = await requestCerebrasChat({
      cerebrasKey,
      model: CEREBRAS_FALLBACK_MODEL.id,
      systemPrompt,
      userContent,
      maxTokens: cerebrasMaxTokens,
    });
    if (!raw) throw new Error(`${CEREBRAS_FALLBACK_MODEL.id} returned empty response`);
    const parsed = parseJSON(raw);
    emit(
      'cerebras',
      groqKey
        ? `${PRIMARY_GROQ_MODEL.label} unavailable — using ${CEREBRAS_FALLBACK_MODEL.label}`
        : `Powered by ${CEREBRAS_FALLBACK_MODEL.label}`,
      {
        primary: { state: primaryState, detail: primaryDetail },
        fallback: { state: 'active', detail: `Response received from ${CEREBRAS_FALLBACK_MODEL.label}` },
      },
    );
    return parsed;
  } catch (e) {
    errors.push(`${CEREBRAS_FALLBACK_MODEL.label} unavailable: ${e.message}`);
    emit('error', 'No provider responded', {
      primary: { state: primaryState, detail: primaryDetail },
      fallback: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
    });
  }

  throw new Error(errors.join(' | '));
}

export async function testProviders(keys, onStatusChange) {
  const { groqKey, cerebrasKey } = keys;
  const emit = (provider, msg, providers) => onStatusChange?.(provider, msg, providers);
  const results = {};
  const testSystem = 'Return only compact JSON.';
  const testUser = '{"ok":true}';

  if (!groqKey && !cerebrasKey) {
    return {
      primary: { ok: false, error: 'No Groq key saved' },
      fallback: { ok: false, error: 'No Cerebras key saved' },
    };
  }

  if (!groqKey) {
    results.primary = { ok: false, error: 'No Groq key saved' };
    emit('groq', `${PRIMARY_GROQ_MODEL.label} not configured`, {
      primary: { state: 'no_key', detail: 'No Groq key saved' },
      fallback: cerebrasKey
        ? { state: 'standby', detail: `Waiting to test ${CEREBRAS_FALLBACK_MODEL.label}` }
        : { state: 'no_key', detail: 'No Cerebras key saved' },
    });
  } else {
    try {
      emit('processing', `Testing ${PRIMARY_GROQ_MODEL.label}...`, {
        primary: { state: 'working', detail: `Testing ${PRIMARY_GROQ_MODEL.id}` },
        fallback: cerebrasKey
          ? { state: 'standby', detail: `Waiting to test ${CEREBRAS_FALLBACK_MODEL.label}` }
          : { state: 'no_key', detail: 'No Cerebras key saved' },
      });
      const raw = await requestGroqChat({
        groqKey,
        model: PRIMARY_GROQ_MODEL.id,
        systemPrompt: testSystem,
        userContent: testUser,
        maxTokens: 80,
      });
      if (!raw) throw new Error(`${PRIMARY_GROQ_MODEL.id} returned empty response`);
      results.primary = { ok: true };
      emit('groq', `${PRIMARY_GROQ_MODEL.label} test passed`, {
        primary: { state: 'active', detail: `${PRIMARY_GROQ_MODEL.label} test request succeeded` },
        fallback: cerebrasKey
          ? { state: 'standby', detail: `Waiting to test ${CEREBRAS_FALLBACK_MODEL.label}` }
          : { state: 'no_key', detail: 'No Cerebras key saved' },
      });
    } catch (e) {
      results.primary = { ok: false, error: e.message };
      emit('groq', `${PRIMARY_GROQ_MODEL.label} test failed`, {
        primary: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
        fallback: cerebrasKey
          ? { state: 'standby', detail: `Waiting to test ${CEREBRAS_FALLBACK_MODEL.label}` }
          : { state: 'no_key', detail: 'No Cerebras key saved' },
      });
    }
  }

  if (!cerebrasKey) {
    results.fallback = { ok: false, error: 'No Cerebras key saved' };
    emit('cerebras', `${CEREBRAS_FALLBACK_MODEL.label} not configured`, {
      primary: results.primary?.ok
        ? { state: 'active', detail: `${PRIMARY_GROQ_MODEL.label} test request succeeded` }
        : groqKey
          ? {
              state: results.primary?.error?.includes('429') ? 'rate_limited' : 'failed',
              detail: results.primary?.error || `${PRIMARY_GROQ_MODEL.label} test failed`,
            }
          : { state: 'no_key', detail: 'No Groq key saved' },
      fallback: { state: 'no_key', detail: 'No Cerebras key saved' },
    });
  } else {
    try {
      emit('processing', `Testing ${CEREBRAS_FALLBACK_MODEL.label}...`, {
        primary: results.primary?.ok
          ? { state: 'active', detail: `${PRIMARY_GROQ_MODEL.label} test request succeeded` }
          : groqKey
            ? {
                state: results.primary?.error?.includes('429') ? 'rate_limited' : 'failed',
                detail: results.primary?.error || `${PRIMARY_GROQ_MODEL.label} test failed`,
              }
            : { state: 'no_key', detail: 'No Groq key saved' },
        fallback: { state: 'working', detail: `Testing ${CEREBRAS_FALLBACK_MODEL.id}` },
      });
      const raw = await requestCerebrasChat({
        cerebrasKey,
        model: CEREBRAS_FALLBACK_MODEL.id,
        systemPrompt: testSystem,
        userContent: testUser,
        maxTokens: 80,
      });
      if (!raw) throw new Error(`${CEREBRAS_FALLBACK_MODEL.id} returned empty response`);
      results.fallback = { ok: true };
      emit('cerebras', `${CEREBRAS_FALLBACK_MODEL.label} test passed`, {
        primary: results.primary?.ok
          ? { state: 'active', detail: `${PRIMARY_GROQ_MODEL.label} test request succeeded` }
          : groqKey
            ? {
                state: results.primary?.error?.includes('429') ? 'rate_limited' : 'failed',
                detail: results.primary?.error || `${PRIMARY_GROQ_MODEL.label} test failed`,
              }
            : { state: 'no_key', detail: 'No Groq key saved' },
        fallback: { state: 'active', detail: `${CEREBRAS_FALLBACK_MODEL.label} test request succeeded` },
      });
    } catch (e) {
      results.fallback = { ok: false, error: e.message };
      emit('cerebras', `${CEREBRAS_FALLBACK_MODEL.label} test failed`, {
        primary: results.primary?.ok
          ? { state: 'active', detail: `${PRIMARY_GROQ_MODEL.label} test request succeeded` }
          : groqKey
            ? {
                state: results.primary?.error?.includes('429') ? 'rate_limited' : 'failed',
                detail: results.primary?.error || `${PRIMARY_GROQ_MODEL.label} test failed`,
              }
            : { state: 'no_key', detail: 'No Groq key saved' },
        fallback: { state: e.status === 429 ? 'rate_limited' : 'failed', detail: e.message },
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
Known risks: ${knownRisks}
Confirmed decisions: ${knownDecisions}

${meeting.systemPrompt}`;
}

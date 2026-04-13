const configuredOrigin = (process.env.REACT_APP_SYNC_SERVER_ORIGIN || '').trim().replace(/\/+$/, '');

export const SHARED_STATE_ENDPOINT = configuredOrigin
  ? `${configuredOrigin}/api/dashboard-state`
  : '/api/dashboard-state';

export const SHARED_STATE_STREAM_ENDPOINT = configuredOrigin
  ? `${configuredOrigin}/api/dashboard-state/stream`
  : '/api/dashboard-state/stream';

function normaliseNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function buildSharedStateSnapshot(payload) {
  if (!payload?.state || typeof payload.state !== 'object') return null;

  return {
    ...payload.state,
    remoteRevision: normaliseNumber(payload.revision, 0),
    remoteUpdatedAt: normaliseNumber(payload.updatedAt, null),
    remoteSavedAt: normaliseNumber(payload.clientSavedAt ?? payload.state.savedAt, null),
  };
}

export function hasPendingRemoteSync(state) {
  const localSavedAt = normaliseNumber(state?.savedAt, 0);
  const remoteSavedAt = normaliseNumber(state?.remoteSavedAt, 0);
  return localSavedAt > remoteSavedAt;
}

export function shouldBootstrapSharedState(bootstrapState, remoteSnapshot) {
  if (!bootstrapState || typeof bootstrapState !== 'object') return false;

  const bootstrapSavedAt = normaliseNumber(
    bootstrapState.savedAt ?? bootstrapState.remoteSavedAt,
    0,
  );
  const remoteSavedAt = normaliseNumber(
    remoteSnapshot?.savedAt ?? remoteSnapshot?.remoteSavedAt,
    0,
  );

  if (!remoteSnapshot) {
    return bootstrapSavedAt > 0;
  }

  return bootstrapSavedAt > remoteSavedAt;
}

export function shouldApplySharedStateSnapshot(snapshot, currentState) {
  if (!snapshot || typeof snapshot !== 'object') return false;

  const incomingRevision = normaliseNumber(snapshot.remoteRevision, 0);
  const currentRevision = normaliseNumber(currentState?.remoteRevision, 0);
  const incomingSavedAt = normaliseNumber(snapshot.savedAt, 0);
  const currentSavedAt = normaliseNumber(currentState?.savedAt, 0);

  if (incomingRevision !== currentRevision) {
    if (
      incomingRevision > currentRevision &&
      currentRevision > 0 &&
      hasPendingRemoteSync(currentState) &&
      incomingSavedAt < currentSavedAt
    ) {
      return false;
    }
    return incomingRevision > currentRevision;
  }

  if (hasPendingRemoteSync(currentState) && incomingSavedAt < currentSavedAt) {
    return false;
  }

  return incomingSavedAt > currentSavedAt;
}

export function mergeSharedStateAcknowledgement(currentState, payload) {
  if (!currentState || !payload) return currentState;

  const currentSavedAt = normaliseNumber(currentState.savedAt, 0);
  const ackedSavedAt = normaliseNumber(payload.clientSavedAt ?? payload.state?.savedAt, 0);

  if (!currentSavedAt || ackedSavedAt !== currentSavedAt) {
    return currentState;
  }

  return {
    ...currentState,
    remoteRevision: normaliseNumber(payload.revision, currentState.remoteRevision || 0),
    remoteUpdatedAt: normaliseNumber(payload.updatedAt, currentState.remoteUpdatedAt || null),
    remoteSavedAt: currentSavedAt,
  };
}

async function parseSharedStateResponse(response) {
  if (!response.ok) {
    throw new Error(`Shared state request failed (${response.status})`);
  }

  const payload = await response.json();
  return payload;
}

export async function fetchSharedDashboardState(fetchImpl = fetch) {
  const response = await fetchImpl(SHARED_STATE_ENDPOINT, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await parseSharedStateResponse(response);
  const snapshot = buildSharedStateSnapshot(payload);

  return { payload, snapshot };
}

export async function pushSharedDashboardState(state, fetchImpl = fetch) {
  const response = await fetchImpl(SHARED_STATE_ENDPOINT, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ state }),
  });

  return parseSharedStateResponse(response);
}

export function openSharedDashboardStream(onUpdate) {
  if (
    typeof window === 'undefined' ||
    typeof window.EventSource === 'undefined' ||
    process.env.NODE_ENV === 'test'
  ) {
    return () => {};
  }

  const source = new window.EventSource(SHARED_STATE_STREAM_ENDPOINT);
  const handleEvent = (event) => {
    if (!event?.data) return;
    try {
      onUpdate?.(JSON.parse(event.data));
    } catch {
      // noop
    }
  };

  source.onmessage = handleEvent;
  source.addEventListener('state-updated', handleEvent);
  source.onerror = () => {
    // Browser EventSource will reconnect automatically.
  };

  return () => {
    source.close();
  };
}

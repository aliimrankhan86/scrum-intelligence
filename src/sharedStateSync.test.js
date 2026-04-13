import {
  buildSharedStateSnapshot,
  hasPendingRemoteSync,
  mergeSharedStateAcknowledgement,
  shouldBootstrapSharedState,
  shouldApplySharedStateSnapshot,
} from './sharedStateSync';

test('buildSharedStateSnapshot attaches remote metadata to shared payload state', () => {
  const snapshot = buildSharedStateSnapshot({
    state: { lastUpdated: '10/04/2026 15:38', savedAt: 120 },
    revision: 7,
    updatedAt: 5000,
    clientSavedAt: 120,
  });

  expect(snapshot).toEqual(
    expect.objectContaining({
      lastUpdated: '10/04/2026 15:38',
      savedAt: 120,
      remoteRevision: 7,
      remoteUpdatedAt: 5000,
      remoteSavedAt: 120,
    }),
  );
});

test('shared snapshot wins when it has a newer remote revision and there is no pending local change', () => {
  const current = {
    savedAt: 100,
    remoteSavedAt: 100,
    remoteRevision: 2,
  };
  const incoming = {
    savedAt: 120,
    remoteSavedAt: 120,
    remoteRevision: 3,
  };

  expect(shouldApplySharedStateSnapshot(incoming, current)).toBe(true);
});

test('pending unsynced local changes are not overwritten by an older shared snapshot', () => {
  const current = {
    savedAt: 300,
    remoteSavedAt: 200,
    remoteRevision: 4,
  };
  const incoming = {
    savedAt: 250,
    remoteSavedAt: 250,
    remoteRevision: 5,
  };

  expect(hasPendingRemoteSync(current)).toBe(true);
  expect(shouldApplySharedStateSnapshot(incoming, current)).toBe(false);
});

test('shared acknowledgement only applies when it matches the currently saved state', () => {
  const current = {
    savedAt: 450,
    remoteSavedAt: 300,
    remoteRevision: 3,
  };

  const staleAck = mergeSharedStateAcknowledgement(current, {
    revision: 4,
    updatedAt: 5000,
    clientSavedAt: 400,
  });
  const currentAck = mergeSharedStateAcknowledgement(current, {
    revision: 4,
    updatedAt: 5000,
    clientSavedAt: 450,
  });

  expect(staleAck).toBe(current);
  expect(currentAck).toEqual(
    expect.objectContaining({
      savedAt: 450,
      remoteSavedAt: 450,
      remoteRevision: 4,
      remoteUpdatedAt: 5000,
    }),
  );
});

test('bootstrap shared state wins when the surviving local backup is newer than the remote snapshot', () => {
  expect(
    shouldBootstrapSharedState(
      { savedAt: 500 },
      { savedAt: 400, remoteSavedAt: 400, remoteRevision: 3 },
    ),
  ).toBe(true);

  expect(
    shouldBootstrapSharedState(
      { savedAt: 300 },
      { savedAt: 400, remoteSavedAt: 400, remoteRevision: 3 },
    ),
  ).toBe(false);

  expect(shouldBootstrapSharedState({ savedAt: 500 }, null)).toBe(true);
});

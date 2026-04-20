import {
  DEFAULT_PROJECT_PROFILE,
  buildSprintName,
  deriveProjectContextFromProfile,
  ensureUpcomingSprint,
  generateFutureSprints,
  normaliseProjectProfile,
  normaliseSprints,
} from './projectProfile';

// ─── Local storage state management ──────────────────────────────────────────
export const STORE_KEY = 'scrum_intelligence_v8';
const LEGACY_STORE_KEYS = ['rpab_v8'];

function textValue(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text && text !== 'null' ? text : '';
}

function cleanUniqueStrings(items) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => textValue(item)).filter(Boolean))];
}

function cleanTicketItem(item) {
  const ticket = textValue(item?.ticket || item?.ticketId);
  const summary = textValue(item?.summary || item?.title);
  if (!ticket && !summary) return null;
  return {
    ticket,
    summary,
    type: textValue(item?.type),
    status: textValue(item?.status),
    assignee: textValue(item?.assignee) || 'Unassigned',
    epic: textValue(item?.epic),
    epicName: textValue(item?.epicName),
  };
}

function cleanTicketList(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map(cleanTicketItem)
    .filter(Boolean)
    .filter((item) => {
      const key = `${item.ticket}|${item.summary}|${item.epic}|${item.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanBlockers(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const ticketId = textValue(item?.ticketId || item?.ticket);
      const title = textValue(item?.title || item?.summary);
      const detail = textValue(item?.detail || item?.reason);
      if (!ticketId && !title && !detail) return null;
      return {
        title,
        detail,
        ticketId,
        assignee: textValue(item?.assignee) || 'Unassigned',
        epic: textValue(item?.epic),
        epicName: textValue(item?.epicName),
      };
    })
    .filter(Boolean)
    .filter((item) => {
      const key = `${item.ticketId}|${item.title}|${item.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanAgedItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const ticket = textValue(item?.ticket || item?.ticketId);
      const summary = textValue(item?.summary || item?.title);
      if (!ticket && !summary) return null;
      const days = Number(item?.days);
      return {
        ticket,
        summary,
        assignee: textValue(item?.assignee) || 'Unassigned',
        days: Number.isFinite(days) ? days : null,
        epic: textValue(item?.epic),
        epicName: textValue(item?.epicName),
      };
    })
    .filter(Boolean)
    .filter((item) => {
      const key = `${item.ticket}|${item.summary}|${item.days}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanQuestionItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === 'string') {
        const question = textValue(item);
        return question ? { question, target: '', why: '', needed: '' } : null;
      }
      const question = textValue(item?.question);
      if (!question) return null;
      return {
        question,
        target: textValue(item?.target),
        why: textValue(item?.why),
        needed: textValue(item?.needed),
      };
    })
    .filter(Boolean)
    .filter((item) => {
      const key = `${item.question}|${item.target}|${item.why}|${item.needed}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanObjectItems(items, keys) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === 'string') {
        const text = textValue(item);
        return text ? { [keys[0]]: text } : null;
      }
      const cleaned = keys.reduce((acc, key) => {
        const value = textValue(item?.[key]);
        if (value) acc[key] = value;
        return acc;
      }, {});
      return Object.keys(cleaned).length ? cleaned : null;
    })
    .filter(Boolean)
    .filter((item) => {
      const key = keys.map((field) => item[field] || '').join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function deriveBoardMetrics(board) {
  const metrics = board?.metrics || {};
  const done = cleanTicketList(board?.ticketsDone).length;
  const inprog = cleanTicketList(board?.ticketsInProgress).length;
  const inreview = cleanTicketList(board?.ticketsInReview).length;
  const blocked = cleanTicketList(board?.ticketsBlocked).length;
  const todo = cleanTicketList(board?.ticketsTodo).length;
  const backlogCount = cleanTicketList(board?.ticketsBacklog).length;
  const backlog = Number(metrics.backlog);
  const total = Number(metrics.total);
  return {
    done: Number.isFinite(Number(metrics.done)) ? Number(metrics.done) : done,
    inprog: Number.isFinite(Number(metrics.inprog)) ? Number(metrics.inprog) : inprog,
    inreview: Number.isFinite(Number(metrics.inreview)) ? Number(metrics.inreview) : inreview,
    blocked: Number.isFinite(Number(metrics.blocked)) ? Number(metrics.blocked) : blocked,
    todo: Number.isFinite(Number(metrics.todo)) ? Number(metrics.todo) : todo,
    backlog: Number.isFinite(backlog) ? backlog : backlogCount,
    total: Number.isFinite(total) ? total : done + inprog + inreview + blocked + todo + backlogCount,
    health: textValue(metrics.health),
  };
}

function cleanMetricValue(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function deriveBoardWorkstreams(board) {
  const seen = new Set();
  return [
    ...(Array.isArray(board?.epicsInPlay) ? board.epicsInPlay : []),
    ...(Array.isArray(board?.ticketsDone) ? board.ticketsDone : []),
    ...(Array.isArray(board?.ticketsInProgress) ? board.ticketsInProgress : []),
    ...(Array.isArray(board?.ticketsInReview) ? board.ticketsInReview : []),
    ...(Array.isArray(board?.ticketsBlocked) ? board.ticketsBlocked : []),
    ...(Array.isArray(board?.ticketsTodo) ? board.ticketsTodo : []),
    ...(Array.isArray(board?.ticketsBacklog) ? board.ticketsBacklog : []),
    ...(Array.isArray(board?.blockers) ? board.blockers : []),
  ]
    .map((item) => ({
      epic: textValue(item?.epic),
      epicName: textValue(item?.epicName),
      focus: textValue(item?.focus || item?.deliveryNote),
    }))
    .filter((item) => item.epic || item.epicName)
    .filter((item) => {
      const key = `${item.epic}|${item.epicName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function deriveBoardTeam(board) {
  const seen = new Set();
  return [
    ...(Array.isArray(board?.ticketsDone) ? board.ticketsDone : []),
    ...(Array.isArray(board?.ticketsInProgress) ? board.ticketsInProgress : []),
    ...(Array.isArray(board?.ticketsInReview) ? board.ticketsInReview : []),
    ...(Array.isArray(board?.ticketsBlocked) ? board.ticketsBlocked : []),
    ...(Array.isArray(board?.ticketsTodo) ? board.ticketsTodo : []),
    ...(Array.isArray(board?.ticketsBacklog) ? board.ticketsBacklog : []),
    ...(Array.isArray(board?.blockers) ? board.blockers : []),
  ]
    .map((item) => textValue(item?.assignee))
    .filter((name) => name && name.toLowerCase() !== 'unassigned')
    .filter((name) => {
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map((name) => ({
      name,
      role: 'Current sprint contributor',
    }));
}

function cleanSetupHistoryMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') return null;
  const cleaned = {
    committedPoints: cleanMetricValue(metrics.committedPoints),
    completedPoints: cleanMetricValue(metrics.completedPoints),
    committedTickets: cleanMetricValue(metrics.committedTickets),
    completedTickets: cleanMetricValue(metrics.completedTickets),
  };
  const hasAnyValue = Object.values(cleaned).some((value) => value != null);
  return hasAnyValue ? cleaned : null;
}

function cleanHistoryEpics(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      epic: textValue(item?.epic),
      epicName: textValue(item?.epicName),
    }))
    .filter((item) => item.epic || item.epicName)
    .filter((item) => {
      const key = `${item.epic}|${item.epicName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanHistoryTicketList(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const ticket = textValue(item?.ticket || item?.ticketId);
      const summary = textValue(item?.summary || item?.title);
      if (!ticket && !summary) return null;
      return {
        ticket,
        summary,
        epic: textValue(item?.epic),
        epicName: textValue(item?.epicName),
        storyPoints: cleanMetricValue(item?.storyPoints),
      };
    })
    .filter(Boolean)
    .filter((item) => {
      const key = `${item.ticket}|${item.summary}|${item.epic}|${item.epicName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function historyTicketText(item) {
  const ticket = textValue(item?.ticket);
  const summary = textValue(item?.summary);
  const points = cleanMetricValue(item?.storyPoints);
  const base = [ticket, summary].filter(Boolean).join(' — ');
  return points != null ? `${base} (${points} pts)` : base;
}

function buildImportedSprintHistorySummary(item, projectContext, importedAt) {
  const num = Number(item?.num);
  if (!Number.isFinite(num)) return null;

  const label = textValue(item?.name) || `Sprint ${num}`;
  const summary = textValue(item?.summary) || textValue(item?.goal) || 'Imported sprint history from project setup';
  const goal = textValue(item?.goal);
  const status = textValue(item?.status);
  const epics = cleanHistoryEpics(item?.epics);
  const completedTickets = cleanHistoryTicketList(item?.completedTickets);
  const carryOverTickets = cleanHistoryTicketList(item?.carryOverTickets);
  const carryOver = cleanUniqueStrings(item?.carryOver);
  const completedHighlights = cleanUniqueStrings(item?.completedHighlights);
  const risks = cleanUniqueStrings(item?.risks);
  const metrics = cleanSetupHistoryMetrics(item?.metrics);
  const highlights = [
    ...epics.map((entry) => `Epic: ${[entry.epic, entry.epicName].filter(Boolean).join(' — ')}`),
    ...completedTickets.map((entry) => `Delivered: ${historyTicketText(entry)}`),
    ...carryOverTickets.map((entry) => `Carry-over: ${historyTicketText(entry)}`),
    ...completedHighlights.map((entry) => `Delivered: ${entry}`),
    ...carryOver.map((entry) => `Carry-over: ${entry}`),
    ...risks.map((entry) => `Risk: ${entry}`),
  ].slice(0, 6);

  const metricSummary = metrics
    ? [
        metrics.committedPoints != null || metrics.completedPoints != null
          ? `Points ${metrics.completedPoints ?? '—'}/${metrics.committedPoints ?? '—'} completed`
          : null,
        metrics.committedTickets != null || metrics.completedTickets != null
          ? `Tickets ${metrics.completedTickets ?? '—'}/${metrics.committedTickets ?? '—'} completed`
          : null,
      ].filter(Boolean).join(' · ')
    : '';

  return {
    num,
    summary: {
      label,
      archivedAt: textValue(item?.end) || importedAt,
      projectContext,
      meetings: [
        {
          id: 'setup-history',
          label: 'Imported sprint history',
          summary,
          highlights,
          updatedAt: textValue(item?.end) || importedAt,
        },
      ],
      velocity: metricSummary || status
        ? {
            summary: metricSummary || summary,
            recommendation: status ? `Outcome: ${status}` : '',
          }
        : null,
      setupHistory: {
        goal,
        status,
        summary,
        epics,
        completedTickets,
        carryOverTickets,
        carryOver,
        completedHighlights,
        risks,
        metrics,
      },
    },
  };
}

function buildImportedSprintHistorySummaries(items, projectContext, activeSprint) {
  const importedAt = new Date().toISOString();
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const next = buildImportedSprintHistorySummary(item, projectContext, importedAt);
    if (!next) return acc;
    if (Number.isFinite(Number(activeSprint)) && next.num >= Number(activeSprint)) {
      return acc;
    }
    acc[next.num] = next.summary;
    return acc;
  }, {});
}

export function createEmptyMeetingData() {
  return {
    metrics: { todo: null, inprog: null, inreview: null, blocked: null, done: null, backlog: null, total: null, health: null },
    questions: [],
    blockers: [],
    stale: [],
    staleInProgress: [],
    notPickedUp: [],
    ticketsDone: [],
    ticketsInProgress: [],
    ticketsInReview: [],
    ticketsBlocked: [],
    ticketsTodo: [],
    ticketsBacklog: [],
    actions: [],
    nextSteps: [],
    decisions: [],
    risks: [],
    notes: [],
    slides: [],
    completed: [],
    incomplete: [],
    sprintGoal: null,
    ragStatus: null,
    log: [],
  };
}

function buildProjectSetupMeetingData(board, appliedAt) {
  if (!board || typeof board !== 'object') return null;
  const seeded = {
    ...createEmptyMeetingData(),
    summary: textValue(board.summary),
    sprintGoal: textValue(board.sprintGoal),
    ragStatus: textValue(board.ragStatus),
    ragReason: textValue(board.ragReason),
    metrics: deriveBoardMetrics(board),
    questions: cleanQuestionItems(board.questions),
    blockers: cleanBlockers(board.blockers),
    staleInProgress: cleanAgedItems(board.staleInProgress),
    notPickedUp: cleanAgedItems(board.notPickedUp),
    ticketsDone: cleanTicketList(board.ticketsDone),
    ticketsInProgress: cleanTicketList(board.ticketsInProgress),
    ticketsInReview: cleanTicketList(board.ticketsInReview),
    ticketsBlocked: cleanTicketList(board.ticketsBlocked),
    ticketsTodo: cleanTicketList(board.ticketsTodo),
    ticketsBacklog: cleanTicketList(board.ticketsBacklog),
    actions: cleanObjectItems(board.actions, ['focus', 'owner', 'why', 'detail', 'urgency', 'ticketId']),
    nextSteps: cleanObjectItems(board.nextSteps, ['step', 'owner', 'why', 'detail', 'timing']),
    decisions: cleanObjectItems(board.decisions, ['decision', 'owner', 'why', 'detail']),
    risks: cleanObjectItems(board.risks, ['risk', 'severity', 'detail', 'owner']),
    notes: cleanUniqueStrings(board.notes),
  };

  const hasContent =
    seeded.summary ||
    seeded.sprintGoal ||
    seeded.ticketsDone.length ||
    seeded.ticketsInProgress.length ||
    seeded.ticketsInReview.length ||
    seeded.ticketsBlocked.length ||
    seeded.ticketsTodo.length ||
    seeded.ticketsBacklog.length ||
    seeded.actions.length ||
    seeded.nextSteps.length ||
    seeded.decisions.length ||
    seeded.risks.length ||
    seeded.notes.length;

  if (!hasContent) return null;

  seeded.log = [
    {
      meeting: 'Daily standup',
      source: 'Project setup',
      date: appliedAt,
      summary: seeded.summary || 'Initial sprint board seeded from project setup',
    },
  ];

  return seeded;
}

function parseSprintWindowText(value) {
  const text = textValue(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  return {
    start: match[1],
    end: match[2],
  };
}

function buildSprintSeedFromArchive(summary, sprintNum, profile) {
  if (!Number.isFinite(Number(sprintNum))) return null;
  const window = parseSprintWindowText(summary?.overview?.window);
  if (!window?.start || !window?.end) return null;
  return {
    num: Number(sprintNum),
    name: buildSprintName(profile, Number(sprintNum)) || textValue(summary?.label) || `Sprint ${sprintNum}`,
    start: window.start,
    end: window.end,
    active: false,
  };
}

function collectReferencedSprintNumbers(rawState) {
  const nums = new Set();
  const push = (value) => {
    const num = Number(value);
    if (Number.isFinite(num)) nums.add(num);
  };

  push(rawState?.activeSprint);
  (Array.isArray(rawState?.sprints) ? rawState.sprints : []).forEach((item) => push(item?.num));
  Object.keys(rawState?.meetingData || {}).forEach((key) => push(String(key).split('_')[0]));
  Object.keys(rawState?.reviewPromptContext || {}).forEach(push);
  Object.keys(rawState?.sprintSummaries || {}).forEach(push);

  return [...nums];
}

function normaliseHydratedSprintTimeline(rawState, base, projectProfile) {
  let sprints = normaliseSprints(rawState?.sprints, projectProfile);
  if (!sprints.length) {
    sprints = normaliseSprints(base.sprints, projectProfile);
  }

  const sprintSummaries = rawState?.sprintSummaries && typeof rawState.sprintSummaries === 'object'
    ? rawState.sprintSummaries
    : {};
  const archivedNums = Object.keys(sprintSummaries)
    .map((key) => Number(key))
    .filter((num) => Number.isFinite(num));
  const highestArchived = archivedNums.length ? Math.max(...archivedNums) : null;
  const archivedSeed =
    highestArchived != null
      ? buildSprintSeedFromArchive(sprintSummaries[highestArchived], highestArchived, projectProfile)
      : null;

  if (archivedSeed && !sprints.some((item) => item.num === archivedSeed.num)) {
    sprints = normaliseSprints([...sprints, archivedSeed], projectProfile);
  }

  let activeSprint = Number(rawState?.activeSprint);
  if (!Number.isFinite(activeSprint)) {
    activeSprint = sprints.find((item) => item.active)?.num || null;
  }

  const maxSprintNum = sprints.length ? Math.max(...sprints.map((item) => item.num)) : 0;
  if (
    highestArchived != null &&
    archivedSeed &&
    (!Number.isFinite(activeSprint) || activeSprint <= highestArchived) &&
    maxSprintNum <= highestArchived
  ) {
    activeSprint = highestArchived + 1;
  }

  const referencedNums = collectReferencedSprintNumbers(rawState);
  const requiredMax = Math.max(
    sprints.length ? Math.max(...sprints.map((item) => item.num)) : 0,
    Number.isFinite(activeSprint) ? activeSprint : 0,
    referencedNums.length ? Math.max(...referencedNums) : 0,
  );
  const currentMax = sprints.length ? Math.max(...sprints.map((item) => item.num)) : 0;
  if (requiredMax > currentMax) {
    sprints = generateFutureSprints(sprints, projectProfile, requiredMax - currentMax);
  }

  if (!Number.isFinite(activeSprint) || !sprints.some((item) => item.num === activeSprint)) {
    activeSprint =
      sprints.find((item) => item.active)?.num ||
      sprints[sprints.length - 1]?.num ||
      base.activeSprint;
  }

  sprints = ensureUpcomingSprint(
    sprints.map((item) => ({
      ...item,
      active: item.num === activeSprint,
    })),
    projectProfile,
    activeSprint,
  ).map((item) => ({
    ...item,
    active: item.num === activeSprint,
  }));

  return { sprints, activeSprint };
}

export function hydrateState(rawState, defaultSprints) {
  const base = defaultState(defaultSprints);
  if (!rawState || typeof rawState !== 'object') return base;
  const projectProfile = rawState.projectProfile && typeof rawState.projectProfile === 'object'
    ? normaliseProjectProfile(rawState.projectProfile)
    : base.projectProfile;
  const defaultProjectContext = deriveProjectContextFromProfile(projectProfile);
  const { sprints, activeSprint } = normaliseHydratedSprintTimeline(rawState, base, projectProfile);
  return {
    ...base,
    sprints,
    activeSprint,
    meetingData: rawState.meetingData && typeof rawState.meetingData === 'object'
      ? rawState.meetingData
      : base.meetingData,
    reviewPromptContext: rawState.reviewPromptContext && typeof rawState.reviewPromptContext === 'object'
      ? rawState.reviewPromptContext
      : base.reviewPromptContext,
    sprintSummaries: rawState.sprintSummaries && typeof rawState.sprintSummaries === 'object'
      ? rawState.sprintSummaries
      : base.sprintSummaries,
    theme: rawState.theme || base.theme,
    projectProfile,
    projectContext: {
      ...defaultProjectContext,
      ...(rawState.projectContext || {}),
    },
    openrouterKey: rawState.openrouterKey || '',
    jiraBase: rawState.jiraBase || '',
    apiProvider: rawState.openrouterKey || rawState.apiProvider === 'openrouter' ? 'openrouter' : 'none',
    connectionTipDismissed: Boolean(rawState.connectionTipDismissed),
    projectSetupAppliedAt: rawState.projectSetupAppliedAt || null,
    projectSetupNotes: Array.isArray(rawState.projectSetupNotes) ? rawState.projectSetupNotes : base.projectSetupNotes,
    lastUpdated: rawState.lastUpdated || null,
    velocityData: rawState.velocityData,
    savedAt: Number.isFinite(Number(rawState.savedAt)) ? Number(rawState.savedAt) : null,
    remoteRevision: Number.isFinite(Number(rawState.remoteRevision)) ? Number(rawState.remoteRevision) : 0,
    remoteUpdatedAt: Number.isFinite(Number(rawState.remoteUpdatedAt)) ? Number(rawState.remoteUpdatedAt) : null,
    remoteSavedAt: Number.isFinite(Number(rawState.remoteSavedAt)) ? Number(rawState.remoteSavedAt) : null,
  };
}

export function extractLocalSettings(rawState, defaultSprints) {
  const state = hydrateState(rawState, defaultSprints);
  return {
    theme: state.theme,
    openrouterKey: state.openrouterKey,
    jiraBase: state.jiraBase,
    apiProvider: state.apiProvider,
    connectionTipDismissed: state.connectionTipDismissed,
  };
}

export function extractSharedDashboardState(rawState, defaultSprints) {
  const state = hydrateState(rawState, defaultSprints);
  const {
    theme,
    openrouterKey,
    jiraBase,
    apiProvider,
    connectionTipDismissed,
    remoteRevision,
    remoteUpdatedAt,
    remoteSavedAt,
    ...sharedState
  } = state;

  return sharedState;
}

export function composeStateFromSharedState(sharedState, localSettings, defaultSprints) {
  return hydrateState(
    {
      ...(sharedState || {}),
      ...(localSettings || {}),
    },
    defaultSprints,
  );
}

export function loadLocalSettings(defaultSprints) {
  const loaded = loadState(defaultSprints);
  return extractLocalSettings(loaded || defaultState(defaultSprints), defaultSprints);
}

export function loadSharedBootstrapState(defaultSprints) {
  const loaded = loadState(defaultSprints);
  if (!loaded) return null;
  return extractSharedDashboardState(loaded, defaultSprints);
}

export function hasMeaningfulSharedDashboardState(rawState, defaultSprints) {
  const state = extractSharedDashboardState(rawState, defaultSprints);
  const base = extractSharedDashboardState(defaultState(defaultSprints), defaultSprints);

  if (state.lastUpdated || state.projectSetupAppliedAt) return true;
  if (Object.keys(state.meetingData || {}).length) return true;
  if (Object.keys(state.reviewPromptContext || {}).length) return true;
  if (Object.keys(state.sprintSummaries || {}).length) return true;
  if (Array.isArray(state.projectSetupNotes) && state.projectSetupNotes.length) return true;
  if (state.activeSprint !== base.activeSprint) return true;
  if (JSON.stringify(state.sprints || []) !== JSON.stringify(base.sprints || [])) return true;
  if (JSON.stringify(state.projectProfile || {}) !== JSON.stringify(base.projectProfile || {})) return true;
  if (JSON.stringify(state.projectContext || {}) !== JSON.stringify(base.projectContext || {})) return true;

  return false;
}

export function mergeState(prevState, patchOrUpdater, defaultSprints) {
  const current = hydrateState(prevState, defaultSprints);
  const patch = typeof patchOrUpdater === 'function'
    ? patchOrUpdater(current)
    : patchOrUpdater;

  if (!patch || typeof patch !== 'object') return current;

  return hydrateState(
    {
      ...current,
      ...patch,
      projectProfile: patch.projectProfile
        ? normaliseProjectProfile({ ...current.projectProfile, ...patch.projectProfile })
        : current.projectProfile,
      projectContext: patch.projectContext
        ? { ...current.projectContext, ...patch.projectContext }
        : current.projectContext,
    },
    defaultSprints,
  );
}

export function loadState(defaultSprints) {
  try {
    const primary = localStorage.getItem(STORE_KEY);
    if (primary) return hydrateState(JSON.parse(primary), defaultSprints);

    for (const legacyKey of LEGACY_STORE_KEYS) {
      const raw = localStorage.getItem(legacyKey);
      if (!raw) continue;
      const hydrated = hydrateState(JSON.parse(raw), defaultSprints);
      saveState(hydrated);
      localStorage.removeItem(legacyKey);
      return hydrated;
    }

    return null;
  } catch {
    return null;
  }
}

export function saveState(state, options = {}) {
  try {
    const next = options.preserveSavedAt
      ? { ...state }
      : {
          ...state,
          savedAt: Date.now(),
        };
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    console.error('Save failed:', e);
    return state;
  }
}

export function clearState() {
  localStorage.removeItem(STORE_KEY);
  LEGACY_STORE_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function defaultState(defaultSprints) {
  const projectProfile = normaliseProjectProfile(DEFAULT_PROJECT_PROFILE);
  const projectContext = deriveProjectContextFromProfile(projectProfile);
  return {
    sprints: defaultSprints,
    activeSprint: defaultSprints?.[0]?.num || 1,
    meetingData: {},      // keyed by sprintNum_meetingId
    reviewPromptContext: {}, // keyed by sprintNum
    sprintSummaries: {},  // archived sprint data
    theme: 'light',
    projectProfile,
    projectContext,
    openrouterKey: '',
    jiraBase: '',         // e.g. https://yourorg.atlassian.net/browse
    apiProvider: 'none',
    connectionTipDismissed: false,
    projectSetupAppliedAt: null,
    projectSetupNotes: [],
    lastUpdated: null,
    savedAt: null,
    remoteRevision: 0,
    remoteUpdatedAt: null,
    remoteSavedAt: null,
  };
}

export function clearDashboardData(state, defaultSprints) {
  const base = defaultState(defaultSprints);
  return {
    ...base,
    sprints: state.sprints || base.sprints,
    activeSprint: state.activeSprint || base.activeSprint,
    theme: state.theme || base.theme,
    projectProfile: state.projectProfile || base.projectProfile,
    projectContext: state.projectContext || deriveProjectContextFromProfile(state.projectProfile || base.projectProfile),
    openrouterKey: state.openrouterKey || '',
    jiraBase: state.jiraBase || '',
    apiProvider: state.openrouterKey ? 'openrouter' : 'none',
    connectionTipDismissed: state.connectionTipDismissed || false,
    projectSetupAppliedAt: state.projectSetupAppliedAt || null,
    projectSetupNotes: Array.isArray(state.projectSetupNotes) ? state.projectSetupNotes : [],
    remoteRevision: Number.isFinite(Number(state.remoteRevision)) ? Number(state.remoteRevision) : 0,
    remoteUpdatedAt: Number.isFinite(Number(state.remoteUpdatedAt)) ? Number(state.remoteUpdatedAt) : null,
    remoteSavedAt: Number.isFinite(Number(state.remoteSavedAt)) ? Number(state.remoteSavedAt) : null,
    velocityData: undefined,
  };
}

export function getMeetingData(state, sprintNum, meetingId) {
  const key = `${sprintNum}_${meetingId}`;
  if (!state.meetingData[key]) {
    state.meetingData[key] = createEmptyMeetingData();
  }
  return state.meetingData[key];
}

export function applyProjectSetupState(prevState, parsed, defaultSprints) {
  const current = hydrateState(prevState, defaultSprints);
  const currentProfile = normaliseProjectProfile(current.projectProfile, { useDefaults: false });
  const parsedProfile = parsed?.projectProfile || {};
  const activeSprintBoard = parsed?.activeSprintBoard || {};
  const cleanText = (value) => (value == null ? '' : String(value).trim());
  const projectKeyHint = cleanText(parsedProfile?.projectKey || parsed?.projectContext?.projectKey);
  const primaryEpicHint = cleanText(parsedProfile?.primaryEpic || parsed?.projectContext?.epic);
  const projectNameHint = cleanText(parsedProfile?.projectName);
  const projectChanged =
    (projectKeyHint && projectKeyHint !== current.projectProfile?.projectKey) ||
    (primaryEpicHint && primaryEpicHint !== current.projectProfile?.primaryEpic) ||
    (projectNameHint && projectNameHint !== current.projectProfile?.projectName);

  const boardWorkstreams = deriveBoardWorkstreams(activeSprintBoard);
  const boardTeam = deriveBoardTeam(activeSprintBoard);
  const setupWorkstreams = (Array.isArray(parsedProfile?.workstreams) && parsedProfile.workstreams.length)
    ? parsedProfile.workstreams
    : boardWorkstreams;

  const baseProfile = projectChanged ? {} : currentProfile;
  const incomingProfile = normaliseProjectProfile({
    ...baseProfile,
    ...parsedProfile,
    workstreams: setupWorkstreams.length
      ? setupWorkstreams
      : (Array.isArray(parsedProfile?.workstreams) && parsedProfile.workstreams.length ? parsedProfile.workstreams : baseProfile.workstreams),
    team: Array.isArray(parsedProfile?.team) && parsedProfile.team.length
      ? parsedProfile.team
      : (boardTeam.length ? boardTeam : baseProfile.team),
    stakeholders: Array.isArray(parsedProfile?.stakeholders) && parsedProfile.stakeholders.length ? parsedProfile.stakeholders : baseProfile.stakeholders,
    watchTickets: Array.isArray(parsedProfile?.watchTickets) && parsedProfile.watchTickets.length ? parsedProfile.watchTickets : baseProfile.watchTickets,
    knownRisks: Array.isArray(parsedProfile?.knownRisks) && parsedProfile.knownRisks.length ? parsedProfile.knownRisks : baseProfile.knownRisks,
    knownDecisions: Array.isArray(parsedProfile?.knownDecisions) && parsedProfile.knownDecisions.length ? parsedProfile.knownDecisions : baseProfile.knownDecisions,
    projectKey: projectKeyHint || baseProfile.projectKey,
    primaryEpic: primaryEpicHint || baseProfile.primaryEpic,
    primaryEpicName: cleanText(parsedProfile?.primaryEpicName || parsed?.projectContext?.epicName) || baseProfile.primaryEpicName,
  }, { useDefaults: false });

  const incomingContext = {
    ...deriveProjectContextFromProfile(incomingProfile),
    ...(parsed?.projectContext || {}),
  };

  const historySprintFrames = (Array.isArray(parsed?.recentSprintHistory) ? parsed.recentSprintHistory : []).map((item) => ({
    num: item?.num,
    name: item?.name,
    start: item?.start,
    end: item?.end,
    active: false,
  }));
  const incomingSprints = normaliseSprints([
    ...historySprintFrames,
    ...(Array.isArray(parsed?.sprints) ? parsed.sprints : []),
  ], incomingProfile);
  const fallbackSprints = projectChanged ? [] : current.sprints;
  let nextSprints = incomingSprints.length ? incomingSprints : fallbackSprints;
  const incomingActiveSprint = Number(parsed?.activeSprint);
  const activeByFlag = nextSprints.find((sprint) => sprint.active)?.num;
  const provisionalActiveSprint =
    activeByFlag ||
    (Number.isFinite(incomingActiveSprint) && nextSprints.find((sprint) => sprint.num === incomingActiveSprint)?.num) ||
    nextSprints?.[0]?.num ||
    current.activeSprint;

  nextSprints = ensureUpcomingSprint(nextSprints, incomingProfile, provisionalActiveSprint);
  const activeSprint =
    nextSprints.find((sprint) => sprint.num === provisionalActiveSprint)?.num ||
    nextSprints.find((sprint) => sprint.active)?.num ||
    nextSprints?.[0]?.num ||
    current.activeSprint;
  nextSprints = nextSprints.map((sprint) => ({
    ...sprint,
    active: sprint.num === activeSprint,
  }));

  const appliedAt = new Date().toISOString();
  const nextMeetingData = projectChanged ? {} : { ...(current.meetingData || {}) };
  const seededStandup = buildProjectSetupMeetingData(activeSprintBoard, appliedAt);
  if (seededStandup && activeSprint) {
    nextMeetingData[`${activeSprint}_standup`] = seededStandup;
  }
  const importedSprintSummaries = buildImportedSprintHistorySummaries(parsed?.recentSprintHistory, incomingContext, activeSprint);

  return {
    ...current,
    projectProfile: incomingProfile,
    projectContext: {
      ...current.projectContext,
      ...incomingContext,
    },
    sprints: nextSprints,
    activeSprint,
    reviewPromptContext: projectChanged ? {} : current.reviewPromptContext,
    meetingData: nextMeetingData,
    sprintSummaries: {
      ...(projectChanged ? {} : current.sprintSummaries),
      ...importedSprintSummaries,
    },
    velocityData: projectChanged ? undefined : current.velocityData,
    projectSetupAppliedAt: appliedAt,
    projectSetupNotes: cleanUniqueStrings(parsed?.setupNotes),
    lastUpdated: appliedAt,
  };
}

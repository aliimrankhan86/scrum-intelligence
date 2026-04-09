import {
  DEFAULT_PROJECT_PROFILE,
  deriveProjectContextFromProfile,
  ensureUpcomingSprint,
  normaliseProjectProfile,
  normaliseSprints,
} from './projectProfile';

// ─── Local storage state management ──────────────────────────────────────────
const STORE_KEY = 'scrum_intelligence_v8';
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
  const backlog = Number(metrics.backlog);
  const total = Number(metrics.total);
  return {
    done: Number.isFinite(Number(metrics.done)) ? Number(metrics.done) : done,
    inprog: Number.isFinite(Number(metrics.inprog)) ? Number(metrics.inprog) : inprog,
    inreview: Number.isFinite(Number(metrics.inreview)) ? Number(metrics.inreview) : inreview,
    blocked: Number.isFinite(Number(metrics.blocked)) ? Number(metrics.blocked) : blocked,
    todo: Number.isFinite(Number(metrics.todo)) ? Number(metrics.todo) : todo,
    backlog: Number.isFinite(backlog) ? backlog : 0,
    total: Number.isFinite(total) ? total : done + inprog + inreview + blocked + todo,
    health: textValue(metrics.health),
  };
}

export function createEmptyMeetingData() {
  return {
    metrics: { todo: null, inprog: null, inreview: null, blocked: null, done: null, total: null, health: null },
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

export function hydrateState(rawState, defaultSprints) {
  const base = defaultState(defaultSprints);
  if (!rawState || typeof rawState !== 'object') return base;
  const projectProfile = rawState.projectProfile && typeof rawState.projectProfile === 'object'
    ? normaliseProjectProfile(rawState.projectProfile)
    : base.projectProfile;
  const defaultProjectContext = deriveProjectContextFromProfile(projectProfile);
  return {
    ...base,
    ...rawState,
    sprints: Array.isArray(rawState.sprints) && rawState.sprints.length
      ? rawState.sprints
      : base.sprints,
    activeSprint: rawState.activeSprint || base.activeSprint,
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
    groqKey: rawState.groqKey || '',
    cerebrasKey: rawState.cerebrasKey || '',
    jiraBase: rawState.jiraBase || '',
    apiProvider: rawState.apiProvider || 'none',
    connectionTipDismissed: Boolean(rawState.connectionTipDismissed),
    projectSetupAppliedAt: rawState.projectSetupAppliedAt || null,
    projectSetupNotes: Array.isArray(rawState.projectSetupNotes) ? rawState.projectSetupNotes : base.projectSetupNotes,
    lastUpdated: rawState.lastUpdated || null,
  };
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
      localStorage.setItem(STORE_KEY, JSON.stringify(hydrated));
      localStorage.removeItem(legacyKey);
      return hydrated;
    }

    return null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Save failed:', e);
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
    groqKey: '',
    cerebrasKey: '',
    jiraBase: '',         // e.g. https://yourorg.atlassian.net/browse
    apiProvider: 'none',
    connectionTipDismissed: false,
    projectSetupAppliedAt: null,
    projectSetupNotes: [],
    lastUpdated: null,
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
    groqKey: state.groqKey || '',
    cerebrasKey: state.cerebrasKey || '',
    jiraBase: state.jiraBase || '',
    connectionTipDismissed: state.connectionTipDismissed || false,
    projectSetupAppliedAt: state.projectSetupAppliedAt || null,
    projectSetupNotes: Array.isArray(state.projectSetupNotes) ? state.projectSetupNotes : [],
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
  const cleanText = (value) => (value == null ? '' : String(value).trim());
  const projectKeyHint = cleanText(parsedProfile?.projectKey || parsed?.projectContext?.projectKey);
  const primaryEpicHint = cleanText(parsedProfile?.primaryEpic || parsed?.projectContext?.epic);
  const projectNameHint = cleanText(parsedProfile?.projectName);
  const projectChanged =
    (projectKeyHint && projectKeyHint !== current.projectProfile?.projectKey) ||
    (primaryEpicHint && primaryEpicHint !== current.projectProfile?.primaryEpic) ||
    (projectNameHint && projectNameHint !== current.projectProfile?.projectName);

  const setupWorkstreams = (Array.isArray(parsedProfile?.workstreams) && parsedProfile.workstreams.length)
    ? parsedProfile.workstreams
    : (Array.isArray(parsed?.activeSprintBoard?.epicsInPlay)
      ? parsed.activeSprintBoard.epicsInPlay.map((item) => ({
          epic: item?.epic,
          epicName: item?.epicName,
          focus: item?.focus || item?.deliveryNote,
        }))
      : []);

  const baseProfile = projectChanged ? {} : currentProfile;
  const incomingProfile = normaliseProjectProfile({
    ...baseProfile,
    ...parsedProfile,
    workstreams: setupWorkstreams.length
      ? setupWorkstreams
      : (Array.isArray(parsedProfile?.workstreams) && parsedProfile.workstreams.length ? parsedProfile.workstreams : baseProfile.workstreams),
    team: Array.isArray(parsedProfile?.team) && parsedProfile.team.length ? parsedProfile.team : baseProfile.team,
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

  const incomingSprints = normaliseSprints(parsed?.sprints, incomingProfile);
  const fallbackSprints = projectChanged ? [] : current.sprints;
  let nextSprints = incomingSprints.length ? incomingSprints : fallbackSprints;
  const incomingActiveSprint = Number(parsed?.activeSprint);
  const activeByFlag = nextSprints.find((sprint) => sprint.active)?.num;
  const provisionalActiveSprint =
    (Number.isFinite(incomingActiveSprint) && nextSprints.find((sprint) => sprint.num === incomingActiveSprint)?.num) ||
    activeByFlag ||
    nextSprints?.[0]?.num ||
    current.activeSprint;

  nextSprints = ensureUpcomingSprint(nextSprints, incomingProfile, provisionalActiveSprint);
  const activeSprint =
    nextSprints.find((sprint) => sprint.num === provisionalActiveSprint)?.num ||
    nextSprints.find((sprint) => sprint.active)?.num ||
    nextSprints?.[0]?.num ||
    current.activeSprint;

  const appliedAt = new Date().toISOString();
  const nextMeetingData = projectChanged ? {} : { ...(current.meetingData || {}) };
  const seededStandup = buildProjectSetupMeetingData(parsed?.activeSprintBoard, appliedAt);
  if (seededStandup && activeSprint) {
    nextMeetingData[`${activeSprint}_standup`] = seededStandup;
  }

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
    sprintSummaries: projectChanged ? {} : current.sprintSummaries,
    velocityData: projectChanged ? undefined : current.velocityData,
    projectSetupAppliedAt: appliedAt,
    projectSetupNotes: cleanUniqueStrings(parsed?.setupNotes),
    lastUpdated: appliedAt,
  };
}

import React, { useState, useCallback, useEffect, useRef } from "react";
import "./App.css";
import { MEETINGS, DEFAULT_SPRINTS } from "./config";
import { callAI, buildContext, testProviders } from "./api";
import {
  applyProjectSetupState,
  composeStateFromSharedState,
  loadState,
  loadLocalSettings,
  loadSharedBootstrapState,
  saveState,
  STORE_KEY,
  clearDashboardData,
  defaultState,
  extractLocalSettings,
  extractSharedDashboardState,
  getMeetingData,
  hasMeaningfulSharedDashboardState,
  mergeState,
} from "./store";
import Insights from "./Insights";
import SprintReviewToolkit from "./features/sprint-review/SprintReviewToolkit";
import {
  buildProjectSetupPrompt,
  buildSprintName,
  DEFAULT_PROJECT_PROFILE,
  deriveProjectContextFromProfile,
  generateFutureSprints,
  normaliseProjectProfile,
  PROJECT_SETUP_COMPACT_SYSTEM_PROMPT,
  PROJECT_SETUP_SYSTEM_PROMPT,
} from "./projectProfile";
import {
  buildSharedStateSnapshot,
  fetchSharedDashboardState,
  hasPendingRemoteSync,
  mergeSharedStateAcknowledgement,
  openSharedDashboardStream,
  pushSharedDashboardState,
  SHARED_STATE_ENDPOINT,
  shouldBootstrapSharedState,
  shouldApplySharedStateSnapshot,
} from "./sharedStateSync";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg0: "var(--app-bg0)",
  bg1: "var(--app-bg1)",
  bg2: "var(--app-bg2)",
  bg3: "var(--app-bg3)",
  panel2: "var(--app-panel2)",
  text0: "var(--app-text0)",
  text1: "var(--app-text1)",
  text2: "var(--app-text2)",
  bd: "var(--app-bd)",
  bd2: "var(--app-bd2)",
  blue: "var(--app-blue)",
  blueBg: "var(--app-blue-bg)",
  green: "var(--app-green)",
  greenBg: "var(--app-green-bg)",
  amber: "var(--app-amber)",
  amberBg: "var(--app-amber-bg)",
  red: "var(--app-red)",
  redBg: "var(--app-red-bg)",
  teal: "var(--app-teal)",
  tealBg: "var(--app-teal-bg)",
};

const THEME_VARS = {
  dark: {
    "--app-bg0": "#090d12",
    "--app-bg1": "#121821",
    "--app-bg2": "#171e29",
    "--app-bg3": "#202938",
    "--app-panel2": "rgba(23,30,41,0.88)",
    "--app-text0": "#f5f7fb",
    "--app-text1": "#c4ccd8",
    "--app-text2": "#8d98aa",
    "--app-bd": "rgba(148,163,184,0.14)",
    "--app-bd2": "rgba(148,163,184,0.24)",
    "--app-blue": "#5d86ff",
    "--app-blue-bg": "rgba(93,134,255,0.14)",
    "--app-green": "#35b87a",
    "--app-green-bg": "rgba(53,184,122,0.14)",
    "--app-amber": "#e4a142",
    "--app-amber-bg": "rgba(228,161,66,0.14)",
    "--app-red": "#f06f76",
    "--app-red-bg": "rgba(240,111,118,0.14)",
    "--app-teal": "#2eb7bb",
    "--app-teal-bg": "rgba(46,183,187,0.14)",
  },
  light: {
    "--app-bg0": "#eff2f8",
    "--app-bg1": "#f8f9fc",
    "--app-bg2": "#ffffff",
    "--app-bg3": "#eef2f8",
    "--app-panel2": "rgba(255,255,255,0.78)",
    "--app-text0": "#111827",
    "--app-text1": "#5f6c84",
    "--app-text2": "#96a1b2",
    "--app-bd": "rgba(15,23,42,0.07)",
    "--app-bd2": "rgba(15,23,42,0.12)",
    "--app-blue": "#3f6df6",
    "--app-blue-bg": "rgba(63,109,246,0.12)",
    "--app-green": "#2fbf7b",
    "--app-green-bg": "rgba(47,191,123,0.12)",
    "--app-amber": "#e49a3a",
    "--app-amber-bg": "rgba(228,154,58,0.12)",
    "--app-red": "#ef6b73",
    "--app-red-bg": "rgba(239,107,115,0.12)",
    "--app-teal": "#2eb7bb",
    "--app-teal-bg": "rgba(46,183,187,0.12)",
  },
};

const SYNC_CHANNEL_NAME = "scrum-intelligence-sync-v1";

const RAG_STYLE = {
  GREEN: {
    bg: "rgba(22,163,74,0.12)",
    color: "#4ade80",
    label: "Green — On track",
  },
  AMBER: {
    bg: "rgba(217,119,6,0.12)",
    color: "#fb923c",
    label: "Amber — At risk",
  },
  RED: { bg: "rgba(220,38,38,0.12)", color: "#f87171", label: "Red — Behind" },
};

const AI_STATUS_STYLE = {
  ready: { label: "Ready", color: "#93c5fd", bg: "rgba(37,99,235,0.12)", border: "#2563eb" },
  working: { label: "Checking", color: "#fdba74", bg: "rgba(217,119,6,0.12)", border: "#d97706" },
  active: { label: "Verified", color: "#4ade80", bg: "rgba(22,163,74,0.12)", border: "#16a34a" },
  standby: { label: "Standby", color: "var(--app-text1)", bg: "var(--app-bg3)", border: "var(--app-bd2)" },
  rate_limited: { label: "Rate limited", color: "#fb923c", bg: "rgba(217,119,6,0.12)", border: "#d97706" },
  failed: { label: "Didn't respond", color: "#f87171", bg: "rgba(220,38,38,0.12)", border: "#dc2626" },
  no_key: { label: "No key", color: "var(--app-text2)", bg: "var(--app-bg3)", border: "var(--app-bd)" },
};

const DEFAULT_PROJECT_CONTEXT = deriveProjectContextFromProfile(DEFAULT_PROJECT_PROFILE);
const SPECIAL_VIEWS = {
  setup: {
    id: "setup",
    label: "Project setup",
    color: "#3f6df6",
    useRovo: false,
    useNotes: false,
  },
  reference: {
    id: "reference",
    label: "Sprint detail",
    color: "#0f766e",
    useRovo: false,
    useNotes: false,
  },
};

function isPlanningLikeView(id) {
  return id === "planning" || id === "refinement";
}

function alphaColor(color, alpha) {
  if (!color) return `rgba(15,23,42,${alpha})`;
  if (typeof color === "string" && color.startsWith("var(")) {
    return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  }
  if (typeof color === "string" && color.startsWith("#")) {
    const hex = color.replace("#", "");
    const expanded = hex.length === 3
      ? hex.split("").map((char) => char + char).join("")
      : hex;
    const int = Number.parseInt(expanded, 16);
    if (Number.isNaN(int)) return color;
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (typeof color === "string" && color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `,${alpha})`);
  }
  if (typeof color === "string" && color.startsWith("rgba(")) {
    return color.replace(/rgba\(([^)]+),[^,]+\)$/, `rgba($1,${alpha})`);
  }
  return color;
}

function subtleSectionSurface(accent, strength = 0.05) {
  if (!accent) return "transparent";
  return alphaColor(accent, strength);
}

function textValue(value) {
  if (value == null) return "";
  const text = String(value).trim();
  return text && text !== "null" ? text : "";
}

function firstValue(...values) {
  return values.map(textValue).find(Boolean) || "";
}

function dedupeItems(items, getSignature) {
  const seen = new Set();
  return items.filter((item) => {
    const signature = String(getSignature(item) || "").trim();
    if (!signature || seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function questionText(question) {
  if (typeof question === "string") return textValue(question);
  return firstValue(question?.question, question?.text, question?.prompt);
}

function questionSignature(question) {
  if (typeof question === "string") return textValue(question);
  return [
    questionText(question),
    textValue(question?.target),
    textValue(question?.why),
    textValue(question?.needed),
  ].join("|");
}

function noteText(note) {
  if (typeof note === "string") return textValue(note);
  return firstValue(note?.text, note?.note, note?.summary, note?.detail);
}

function noteSignature(note) {
  return noteText(note)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noteCategory(note) {
  const text = noteSignature(note);
  if (!text) return "";
  if (/(uat|test data)/.test(text)) return "uat-data";
  if (/(stale|no movement).*(in progress|inprogress)|(in progress|inprogress).*(stale|no movement)/.test(text)) {
    return "stale-in-progress";
  }
  if (/(not started|untouched|waiting|backlog|to do|todo)/.test(text)) return "not-started";
  if (/(blocked|impediment)/.test(text)) return "blocked";
  if (/(at risk|behind|sprint health|risk)/.test(text)) return "health";
  return text;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summariseTicketList(items, limit = 2) {
  const list = (items || [])
    .map((item) => firstValue(item?.ticketId, item?.ticket, item?.summary))
    .filter(Boolean);
  if (!list.length) return "";
  if (list.length <= limit) return list.join(", ");
  return `${list.slice(0, limit).join(", ")} +${list.length - limit} more`;
}

function buildStandupBriefing(data) {
  const notes = [];
  const usedCategories = new Set();

  const pushBriefing = (text, category) => {
    const clean = textValue(text);
    if (!clean) return;
    const key = category || noteCategory(clean);
    if (key && usedCategories.has(key)) return;
    if (key) usedCategories.add(key);
    notes.push(clean);
  };

  const summary = textValue(data.summary);
  if (summary) pushBriefing(summary, "summary");

  const blocked = buildBlockedItems(data);
  if (blocked.length) {
    pushBriefing(
      blocked.length === 1
        ? `1 blocked ticket needs attention: ${summariseTicketList(blocked)}.`
        : `${pluralize(blocked.length, "blocked ticket")} need attention: ${summariseTicketList(blocked)}.`,
      "blocked",
    );
  }

  const staleItems = Array.isArray(data.staleInProgress) && data.staleInProgress.length
    ? data.staleInProgress
    : data.stale || [];
  if (staleItems.length) {
    pushBriefing(
      `${pluralize(staleItems.length, "in-progress ticket")} have had no movement for 5+ days: ${summariseTicketList(staleItems)}.`,
      "stale-in-progress",
    );
  }

  const waitingItems = data.notPickedUp || [];
  if (waitingItems.length) {
    pushBriefing(
      waitingItems.length === 1
        ? `1 ticket is still not started: ${summariseTicketList(waitingItems)}.`
        : `${pluralize(waitingItems.length, "ticket")} are still not started: ${summariseTicketList(waitingItems)}.`,
      "not-started",
    );
  }

  if (!summary && textValue(data.metrics?.health) && data.metrics.health !== "unknown") {
    pushBriefing(`Sprint health is currently ${data.metrics.health}.`, "health");
  }

  const rawNotes = dedupeItems((data.notes || []).map(noteText).filter(Boolean), noteSignature);
  rawNotes.forEach((note) => pushBriefing(note));

  return notes.slice(0, 5);
}

function actionUrgency(action) {
  return textValue(action?.urgency).toLowerCase();
}

function actionHeadline(action) {
  return firstValue(action?.focus, action?.action, action?.outcome, action?.nextStep);
}

function actionLead(action) {
  return firstValue(action?.owner, action?.contact, action?.lead);
}

function actionWhy(action) {
  return firstValue(action?.why, action?.reason, action?.needed);
}

function actionDetail(action) {
  return firstValue(action?.detail, action?.context, action?.specifics);
}

function actionSignature(action) {
  return [
    actionHeadline(action),
    actionLead(action),
    actionWhy(action),
    textValue(action?.ticketId),
    actionUrgency(action),
  ].join("|");
}

function nextStepHeadline(step) {
  return firstValue(step?.step, step?.focus, step?.action);
}

function nextStepSignature(step) {
  return [
    nextStepHeadline(step),
    textValue(step?.owner),
    textValue(step?.timing),
    textValue(step?.why),
    textValue(step?.detail),
  ].join("|");
}

function decisionSignature(decision) {
  return [
    textValue(decision?.decision),
    textValue(decision?.madeBy),
    textValue(decision?.impact),
    textValue(decision?.detail),
  ].join("|");
}

function riskSignature(risk) {
  return [
    textValue(risk?.risk),
    textValue(risk?.level),
    textValue(risk?.mitigation),
  ].join("|");
}

const TOPIC_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "that", "this", "will", "have",
  "has", "had", "are", "was", "were", "been", "being", "than", "then", "over",
  "under", "into", "onto", "about", "after", "before", "during", "every", "other",
  "more", "less", "just", "only", "your", "their", "team", "owner",
]);

function topicTokens(text) {
  return textValue(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((token) => token && token.length > 2 && !TOPIC_STOPWORDS.has(token));
}

function isSameTopic(a, b) {
  const aTokens = new Set(topicTokens(a));
  const bTokens = new Set(topicTokens(b));
  if (!aTokens.size || !bTokens.size) return false;
  let overlap = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) overlap += 1;
  });
  return overlap >= 2 && overlap / Math.min(aTokens.size, bTokens.size) >= 0.5;
}

function relatedDetail(headline, items, getHeadline, getDetail) {
  for (const item of items || []) {
    const itemHeadline = getHeadline(item);
    if (isSameTopic(headline, itemHeadline)) {
      const detail = getDetail(item);
      if (detail) return detail;
    }
  }
  return "";
}

function deriveProjectContext(parsed, fallbackContext = DEFAULT_PROJECT_CONTEXT, sprint) {
  const context = parsed?.context || {};
  const sources = [
    ...(parsed?.ticketsDone || []),
    ...(parsed?.ticketsInProgress || []),
    ...(parsed?.ticketsInReview || []),
    ...(parsed?.ticketsBlocked || []),
    ...(parsed?.ticketsTodo || []),
    ...(parsed?.staleInProgress || []),
    ...(parsed?.notPickedUp || []),
    ...(parsed?.blockers || []),
  ];

  const epicSource = sources.find((item) => textValue(item?.epic) || textValue(item?.epicName)) || {};

  return {
    projectKey: firstValue(context.projectKey, fallbackContext.projectKey, DEFAULT_PROJECT_CONTEXT.projectKey),
    epic: firstValue(context.epic, epicSource.epic, fallbackContext.epic, DEFAULT_PROJECT_CONTEXT.epic),
    epicName: firstValue(context.epicName, epicSource.epicName, fallbackContext.epicName, DEFAULT_PROJECT_CONTEXT.epicName),
    sprintName: firstValue(context.sprintName, sprint?.name),
  };
}

function meetingSummaryText(data) {
  return firstValue(
    data?.summary,
    data?.ragReason,
    data?.sprintGoal?.evidence,
    data?.log?.[data.log.length - 1]?.summary,
  );
}

function hasMeetingContent(data) {
  if (!data || typeof data !== "object") return false;
  if (
    textValue(data.summary) ||
    textValue(data.sprintGoal?.evidence) ||
    textValue(data.ragStatus) ||
    textValue(data.ragReason)
  ) {
    return true;
  }

  const listFields = [
    "questions",
    "blockers",
    "stale",
    "staleInProgress",
    "notPickedUp",
    "ticketsDone",
    "ticketsInProgress",
    "ticketsInReview",
    "ticketsBlocked",
    "ticketsTodo",
    "actions",
    "nextSteps",
    "decisions",
    "risks",
    "notes",
    "slides",
    "completed",
    "incomplete",
    "stakeholderFeedback",
    "stakeholderActions",
    "openQuestions",
    "unresolvedDecisions",
    "achievements",
    "inProgress",
    "wentWell",
    "didntGoWell",
    "carryForward",
    "backlog",
    "dependencies",
    "teamLoad",
    "sprintRecommendation",
    "log",
  ];

  return listFields.some((field) => Array.isArray(data[field]) && data[field].length > 0);
}

function getNextSprint(sprints, activeSprintNum) {
  return [...(sprints || [])]
    .sort((a, b) => a.num - b.num)
    .find((item) => item.num > activeSprintNum) || null;
}

function archiveTicketLabel(item) {
  const ticketId = textValue(item?.ticketId || item?.ticket);
  const summary = textValue(item?.summary || item?.title);
  return [ticketId, summary].filter(Boolean).join(" — ");
}

function archiveTextWithDetail(primary, detail) {
  const headline = textValue(primary);
  const extra = textValue(detail);
  return [headline, extra].filter(Boolean).join(" — ");
}

function archiveMeetingHighlights(meetingId, data) {
  const push = (items, label, getText, limit = 2) => {
    const clean = dedupeItems((items || []).map(getText).filter(Boolean), (item) => item);
    return clean.slice(0, limit).map((item) => `${label}: ${item}`);
  };

  if (meetingId === "standup") {
    return [
      ...push(data.actions, "Action", (item) => firstValue(item?.focus, item?.action, item?.outcome)),
      ...push(data.nextSteps, "Next", (item) => firstValue(item?.step, item?.focus, item?.action)),
      ...push(data.decisions, "Decision", (item) => textValue(item?.decision)),
      ...push(data.risks, "Risk", (item) => textValue(item?.risk), 1),
    ].slice(0, 4);
  }

  if (meetingId === "planning" || meetingId === "refinement") {
    return [
      ...push(data.carryForward, "Carry forward", (item) => archiveTicketLabel(item)),
      ...push(data.sprintRecommendation, "Recommend", (item) => archiveTicketLabel(item)),
      ...push(data.dependencies, "Dependency", (item) => textValue(item?.dependency), 1),
      ...push(
        data.decisions,
        "Decision",
        (item) => archiveTextWithDetail(item?.decision, item?.detail),
        1,
      ),
      ...push(
        data.actions,
        "Action",
        (item) => archiveTextWithDetail(firstValue(item?.focus, item?.action, item?.outcome), item?.detail),
        1,
      ),
    ].slice(0, 4);
  }

  if (meetingId === "review") {
    return [
      ...push(data.completed, "Delivered", (item) => archiveTicketLabel(item)),
      ...push(data.incomplete, "Not completed", (item) => archiveTicketLabel(item)),
      ...push(data.stakeholderFeedback, "Feedback", (item) => textValue(item), 1),
      ...push(data.actions, "Action", (item) => firstValue(item?.focus, item?.action, item?.outcome), 1),
    ].slice(0, 4);
  }

  if (meetingId === "retro") {
    return [
      ...push(data.wentWell, "Went well", (item) => textValue(item), 1),
      ...push(data.didntGoWell, "Needs work", (item) => textValue(item), 1),
      ...push(data.actions, "Improve", (item) => firstValue(item?.focus, item?.action, item?.outcome), 2),
    ].slice(0, 4);
  }

  if (meetingId === "discovery") {
    return [
      ...push(data.openQuestions, "Open question", (item) => textValue(item?.question), 2),
      ...push(data.unresolvedDecisions, "Unresolved", (item) => textValue(item?.decision), 1),
      ...push(data.actions, "Action", (item) => firstValue(item?.focus, item?.action, item?.outcome), 1),
    ].slice(0, 4);
  }

  if (meetingId === "stakeholder") {
    return [
      ...push(data.achievements, "Achievement", (item) => textValue(item), 1),
      ...push(data.stakeholderActions, "Stakeholder action", (item) => textValue(item?.action), 2),
      ...push(data.decisions, "Decision", (item) => textValue(item?.decision), 1),
      ...push(data.risks, "Risk", (item) => textValue(item?.risk), 1),
    ].slice(0, 4);
  }

  return [];
}

function buildSprintArchiveSnapshot(state, sprint, label, archivedAt) {
  const prefix = `${sprint.num}_`;
  const nextSprint = getNextSprint(state.sprints, sprint.num);
  const meetings = Object.entries(state.meetingData || {})
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, data]) => {
      const meetingId = key.slice(prefix.length);
      const summary = meetingSummaryText(data);
      if (!summary) return null;
      return {
        id: meetingId,
        label:
          (meetingId === "planning" || meetingId === "refinement") && nextSprint
            ? `${MEETINGS[meetingId]?.label || meetingId} (for ${nextSprint.name})`
            : MEETINGS[meetingId]?.label || meetingId,
        summary,
        highlights: archiveMeetingHighlights(meetingId, data),
        updatedAt: textValue(data?.log?.[data.log.length - 1]?.date),
      };
    })
    .filter(Boolean);

  const velocitySummary = textValue(state.velocityData?.summary);
  const velocityRecommendation = textValue(state.velocityData?.recommendation);

  return {
    label,
    archivedAt,
    projectContext: state.projectContext || DEFAULT_PROJECT_CONTEXT,
    meetings,
    velocity: velocitySummary || velocityRecommendation
      ? {
          summary: velocitySummary,
          recommendation: velocityRecommendation,
        }
      : null,
  };
}

function countSetupTickets(parsed) {
  const board = parsed?.activeSprintBoard || {};
  const seen = new Set();
  [
    ...(board.ticketsDone || []),
    ...(board.ticketsInProgress || []),
    ...(board.ticketsInReview || []),
    ...(board.ticketsBlocked || []),
    ...(board.ticketsTodo || []),
  ].forEach((item) => {
    const key = firstValue(item?.ticket, item?.ticketId, item?.summary, item?.title);
    if (key) seen.add(key);
  });
  return seen.size;
}

function countSetupEpics(parsed) {
  const board = parsed?.activeSprintBoard || {};
  const workstreams = [
    ...(parsed?.projectProfile?.workstreams || []),
    ...(parsed?.activeSprintBoard?.epicsInPlay || []),
    ...(board.ticketsDone || []),
    ...(board.ticketsInProgress || []),
    ...(board.ticketsInReview || []),
    ...(board.ticketsBlocked || []),
    ...(board.ticketsTodo || []),
  ];
  const keys = new Set();
  workstreams.forEach((item) => {
    const key = firstValue(item?.epic, item?.epicName);
    if (key) keys.add(key);
  });
  return keys.size;
}

function formatShortDate(dateText) {
  return new Date(dateText + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatSyncTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function initialSharedSyncStatus() {
  if (process.env.NODE_ENV === "test") {
    return {
      mode: "local",
      detail: "Shared sync disabled in test mode.",
      pulledAt: null,
    };
  }

  return {
    mode: "checking",
    detail: "Checking the shared dashboard connection...",
    pulledAt: null,
  };
}

function sprintLabel(sprint) {
  return `${sprint.name} (${formatShortDate(sprint.start)}–${formatShortDate(sprint.end)})`;
}

export function meetingMergePolicy(meetingId, source) {
  const isMeetingNotes = source === "Meeting notes" || source === "Notes/Hedy";
  const isStandupHedy = meetingId === "standup" && isMeetingNotes;
  const isPlanningHedy = isPlanningLikeView(meetingId) && isMeetingNotes;
  return {
    allowMetrics: !isStandupHedy,
    allowProjectContext: !isStandupHedy,
    allowSprintRename: !isStandupHedy,
    allowSummaryOverwrite: !isStandupHedy,
    overwriteFields: isStandupHedy
      ? ["actions", "nextSteps", "decisions", "risks", "notes"]
      : isPlanningHedy
        ? [
            "carryForward",
            "backlog",
            "dependencies",
            "teamLoad",
            "sprintRecommendation",
            "actions",
            "decisions",
            "risks",
            "questions",
            "notes",
          ]
        : [
          "ticketsDone",
          "ticketsInProgress",
          "ticketsInReview",
          "ticketsBlocked",
          "ticketsTodo",
          "blockers",
          "stale",
          "staleInProgress",
          "notPickedUp",
          "actions",
          "nextSteps",
          "notes",
        ],
    appendFields: isPlanningHedy
      ? [
          "completed",
          "incomplete",
          "stakeholderFeedback",
          "stakeholderActions",
          "openQuestions",
          "unresolvedDecisions",
          "achievements",
          "inProgress",
          "wentWell",
          "didntGoWell",
        ]
      : [
          "decisions",
          "risks",
          "completed",
          "incomplete",
          "stakeholderFeedback",
          "stakeholderActions",
          "openQuestions",
          "unresolvedDecisions",
          "achievements",
          "inProgress",
          "wentWell",
          "didntGoWell",
          "carryForward",
          "backlog",
          "dependencies",
          "teamLoad",
          "sprintRecommendation",
        ],
  };
}

function sprintMeetingEntries(state, sprintNum) {
  const prefix = `${sprintNum}_`;
  const nextSprint = getNextSprint(state.sprints, sprintNum);
  const order = ["standup", "refinement", "planning", "review", "retro", "discovery", "stakeholder"];
  return Object.entries(state.meetingData || {})
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, data]) => {
      const id = key.slice(prefix.length);
      const summary = meetingSummaryText(data);
      if (!summary && !hasMeetingContent(data)) return null;
      return {
        id,
        label:
          (id === "planning" || id === "refinement") && nextSprint
            ? `${MEETINGS[id]?.label || id} (for ${nextSprint.name})`
            : MEETINGS[id]?.label || id,
        summary: summary || "Updated",
        updatedAt: textValue(data?.log?.[data.log.length - 1]?.date),
        data,
      };
    })
    .filter(Boolean)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

function buildSprintReferenceData(state, sprintNum) {
  const meetings = sprintMeetingEntries(state, sprintNum);
  const addSourceDetail = (detail, sourceLabel) =>
    firstValue(detail, `Captured in ${sourceLabel}.`);
  const blockers = dedupeItems(
    meetings.flatMap(({ label, data }) =>
      buildBlockedItems(data).map((item) => ({
        ...item,
        reason: addSourceDetail(item.reason, label),
      })),
    ),
    (item) => [
      textValue(item.ticketId),
      textValue(item.summary || item.blockerTitle),
      textValue(item.reason),
    ].join("|"),
  );
  const questions = dedupeItems(
    meetings.flatMap(({ label, data }) =>
      (data.questions || []).map((item) => ({
        ...item,
        needed: firstValue(item.needed, `Reference: ${label}`),
      })),
    ),
    questionSignature,
  );
  const actions = dedupeItems(
    meetings.flatMap(({ label, data }) =>
      (data.actions || []).map((item) => ({
        ...item,
        detail: addSourceDetail(item.detail, label),
      })),
    ),
    actionSignature,
  );
  const nextSteps = dedupeItems(
    meetings.flatMap(({ label, data }) =>
      (data.nextSteps || []).map((item) => ({
        ...item,
        detail: addSourceDetail(item.detail, label),
      })),
    ),
    nextStepSignature,
  );
  const decisions = dedupeItems(
    meetings.flatMap(({ label, data }) =>
      (data.decisions || []).map((item) => ({
        ...item,
        detail: addSourceDetail(item.detail, label),
      })),
    ),
    decisionSignature,
  );
  const risks = dedupeItems(
    meetings.flatMap(({ label, data }) =>
      (data.risks || []).map((item) => ({
        ...item,
        mitigation: firstValue(item.mitigation, `Captured in ${label}.`),
      })),
    ),
    riskSignature,
  );
  const notes = dedupeItems(
    [
      ...meetings.map(({ label, summary }) => `${label}: ${summary}`),
      ...meetings.flatMap(({ label, data }) =>
        (data.notes || []).map((item) => `${label}: ${noteText(item)}`),
      ),
    ].filter(Boolean),
    noteSignature,
  );

  return {
    meetings,
    ticketsBlocked: blockers.map((item) => ({
      ticket: item.ticketId,
      summary: item.summary || item.blockerTitle,
      assignee: item.assignee,
      epic: item.epic,
      epicName: item.epicName,
    })),
    blockers: blockers.map((item) => ({
      ticketId: item.ticketId,
      title: item.blockerTitle || item.summary,
      detail: item.reason,
      assignee: item.assignee,
      epic: item.epic,
      epicName: item.epicName,
    })),
    questions,
    actions,
    nextSteps,
    decisions,
    risks,
    notes,
  };
}

function syncProviderStatus(prev, hasKey) {
  if (!hasKey) return { state: "no_key", detail: "No API key saved" };
  if (!prev || prev.state === "no_key") {
    return { state: "ready", detail: "Key saved and ready to use" };
  }
  return prev;
}

function providerStatusHint(info) {
  const detail = textValue(info?.detail);
  if (!detail) return "";
  if (/truncated|finish_reason=length|response was cut off/i.test(detail)) return "Truncated";
  if (info?.state === "rate_limited" || /(?:^| )429(?:\b|:)/.test(detail)) return "Rate limit";
  if (/did not reach|failed to fetch|networkerror|load failed|network request failed|cors/i.test(detail)) {
    return "Network/CORS";
  }
  if (/401|unauthorized|invalid api key|authentication|incorrect api key|forbidden|403/i.test(detail)) {
    return "Auth";
  }
  if (/402|payment required|credit|billing/i.test(detail)) return "Billing";
  if (/no api key saved/i.test(detail)) return "No key";
  return "";
}

function ProviderStatusChip({ name, info }) {
  const style = AI_STATUS_STYLE[info?.state] || AI_STATUS_STYLE.no_key;
  const hint = providerStatusHint(info);
  return (
    <div
      title={info?.detail || ""}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "12px",
        padding: "9px 14px",
        borderRadius: "999px",
        border: `1px solid ${style.border}`,
        background: style.bg,
        color: style.color,
        whiteSpace: "nowrap",
        boxShadow: `0 8px 18px ${alphaColor("#0f172a", 0.04)}`,
      }}
      >
        <span
          style={{
            width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: style.color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontWeight: "700", color: C.text0 }}>{name}</span>
      <span style={{ fontWeight: "600", color: style.color }}>{style.label}</span>
      {hint && (
        <span style={{ color: C.text1, fontSize: "11px" }}>
          · {hint}
        </span>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pill(bg, color, text) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "11px",
        fontWeight: "700",
        padding: "4px 10px",
        borderRadius: "999px",
        background: bg,
        color,
        border: `1px solid ${alphaColor(color, 0.18)}`,
        whiteSpace: "nowrap",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {text}
    </span>
  );
}

const URGENCY_PILL = {
  today: () => pill(C.redBg, "#f87171", "today"),
  "this sprint": () => pill(C.amberBg, "#fb923c", "this sprint"),
  "next sprint": () => pill(C.greenBg, "#4ade80", "next sprint"),
  urgent: () => pill(C.redBg, "#f87171", "urgent"),
  "this week": () => pill(C.amberBg, "#fb923c", "this week"),
};

function Spinner() {
  return (
    <span
      style={{
        display: "inline-flex",
        gap: "3px",
        verticalAlign: "middle",
        marginLeft: "5px",
      }}
    >
      {[0, 200, 400].map((d) => (
        <span
          key={d}
          style={{
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            background: "currentColor",
            animation: `sp 1.2s ${d}ms infinite`,
            opacity: 0.3,
          }}
        />
      ))}
      <style>{`@keyframes sp{0%,80%,100%{opacity:.2;transform:scale(.7)}40%{opacity:1;transform:scale(1)}}`}</style>
    </span>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Sec({ title, count, children, action, accent, emptyLabel, warnBg }) {
  const hasItems = (count ?? 0) > 0;
  const isEmpty =
    !children ||
    (Array.isArray(children) && children.filter(Boolean).length === 0);
  return (
    <div
      style={{
        background: C.bg2,
        border: `1px solid ${accent && hasItems ? alphaColor(accent, 0.26) : C.bd}`,
        borderRadius: "22px",
        overflow: "hidden",
        boxShadow: `0 14px 30px ${alphaColor("#0f172a", 0.05)}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "15px 18px",
          background: C.bg2,
          borderBottom: `1px solid ${C.bd}`,
        }}
      >
        <span style={{ fontSize: "15px", fontWeight: "700", color: C.text0 }}>
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {action}
          <span
            style={{
              minWidth: "28px",
              textAlign: "center",
              fontSize: "12px",
              padding: "4px 10px",
              borderRadius: "999px",
              background: accent && hasItems ? alphaColor(accent, 0.14) : C.bg0,
              color: accent && hasItems ? accent : C.text2,
              fontWeight: "700",
              border: `1px solid ${accent && hasItems ? alphaColor(accent, 0.24) : C.bd}`,
            }}
          >
            {count ?? 0}
          </span>
        </div>
      </div>
      <div style={warnBg && hasItems ? { background: subtleSectionSurface(accent || C.red) } : {}}>
        {isEmpty ? (
          <div
            style={{
              fontSize: "14px",
              color: emptyLabel ? "#4ade80" : C.text2,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {emptyLabel || "Nothing recorded yet"}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Row({ isNew, left, main, sub, accentColor }) {
  return (
    <div
      style={{
        padding: "16px 18px",
        borderBottom: `1px solid ${C.bd}`,
        display: "flex",
        gap: "14px",
        alignItems: "flex-start",
        background: isNew ? alphaColor(accentColor || C.blue, 0.06) : "transparent",
        borderLeft: `4px solid ${accentColor || (isNew ? C.blue : "transparent")}`,
      }}
    >
      {left}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "15px",
            color: C.text0,
            lineHeight: "1.45",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {main}
          {isNew && (
            <span
              style={{
                fontSize: "10px",
                padding: "3px 8px",
                borderRadius: "999px",
                background: C.blue,
                color: "#fff",
                fontWeight: "700",
                flexShrink: 0,
                border: `1px solid ${alphaColor("#ffffff", 0.1)}`,
              }}
            >
              NEW
            </span>
          )}
        </div>
        {sub && (
          <div style={{ fontSize: "13px", color: C.text1, marginTop: "7px", lineHeight: "1.55" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared sections ──────────────────────────────────────────────────────────
function QSec({ data, fresh, label }) {
  const items = dedupeItems(
    (data.questions || []).filter((q) => {
      if (!q || q === "undefined") return false;
      if (typeof q === "string") return Boolean(textValue(q));
      return Boolean(questionText(q));
    }),
    questionSignature,
  );
  return (
    <Sec title={label || "Questions to ask"} count={items.length} accent={C.blue} emptyLabel="✓ No open questions to raise">
      {items.map((q, i) => (
        <Row
          key={i}
          isNew={(fresh.questions || []).includes(q)}
          left={pill(C.blueBg, "#93c5fd", "Q")}
          main={typeof q === "string" ? q : questionText(q)}
          sub={
            typeof q === "string"
              ? undefined
              : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {q.target && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "4px 10px",
                            borderRadius: "999px",
                            background: C.blueBg,
                            color: C.blue,
                            border: `1px solid ${alphaColor("#3b82f6", 0.2)}`,
                            letterSpacing: ".03em",
                            textTransform: "uppercase",
                          }}
                        >
                          Ask
                        </span>
                        <span style={{ fontSize: "16px", fontWeight: "700", color: C.text0 }}>
                          {q.target}
                        </span>
                      </div>
                    )}
                    {(q.why || q.needed) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 16px", color: C.text1, fontSize: "13px" }}>
                        {q.why && (
                          <span>
                            <strong style={{ color: C.text0 }}>Why:</strong> {q.why}
                          </span>
                        )}
                        {q.needed && (
                          <span>
                            <strong style={{ color: C.text0 }}>Need:</strong> {q.needed}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
          }
        />
      ))}
    </Sec>
  );
}

function epicPill(epic, epicName) {
  const parts = [epic, epicName]
    .filter((part) => part && part !== "null")
    .map((part) => `${part}`);
  if (!parts.length) return null;
  const label = `Epic: ${parts.join(" · ")}`;
  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "11px",
        fontWeight: "600",
        padding: "4px 10px",
        borderRadius: "999px",
        background: C.bg3,
        border: `1px solid ${C.bd}`,
        color: C.text1,
        whiteSpace: "normal",
        lineHeight: "1.3",
        maxWidth: "100%",
        marginLeft: "8px",
        verticalAlign: "middle",
      }}
    >
      {label}
    </span>
  );
}

function staleDayPill(days) {
  const d = days ?? 0;
  if (d >= 7) return pill(C.redBg, "#f87171", `${d}d stale`);
  if (d >= 5) return pill("rgba(249,115,22,0.15)", "#f97316", `${d}d stale`);
  return pill(C.amberBg, "#fb923c", `${d}d stale`);
}

function notPickedPill(days) {
  const d = days ?? 0;
  if (d >= 7) return pill(C.redBg, "#f87171", `${d}d waiting`);
  if (d >= 4) return pill(C.amberBg, "#fb923c", `${d}d waiting`);
  return pill(C.bg3, C.text2, "to do");
}

function TicketLink({ id, color, jiraBase }) {
  if (!id || id === "null") return null;
  const style = {
    fontFamily: "monospace",
    fontSize: "12px",
    fontWeight: "700",
    color: color || C.text1,
    flexShrink: 0,
    textDecoration: "none",
    borderBottom: jiraBase ? `1px dotted ${color || C.text1}` : "none",
    cursor: jiraBase ? "pointer" : "default",
  };
  if (jiraBase) {
    return (
      <a
        href={`${jiraBase}/${id}`}
        target="_blank"
        rel="noreferrer"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {id}
      </a>
    );
  }
  return <span style={style}>{id}</span>;
}

function ticketStatusPill(status) {
  if (status === "blocked") return pill(C.redBg, "#f87171", "blocked");
  if (status === "in progress") return pill(C.blueBg, "#93c5fd", "in progress");
  return null;
}

function ticketSub(assignee, detailParts = []) {
  const assigneeName = textValue(assignee) || "Unassigned";
  const details = detailParts.filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: "700",
            padding: "4px 10px",
            borderRadius: "999px",
            background: C.bg3,
            border: `1px solid ${C.bd}`,
            color: C.text1,
            letterSpacing: ".03em",
            textTransform: "uppercase",
          }}
        >
          Assignee
        </span>
        <span style={{ fontSize: "16px", fontWeight: "800", color: C.text0 }}>
          {assigneeName}
        </span>
      </div>
      {details.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 16px", color: C.text1, fontSize: "13px" }}>
          {details.map((detail) =>
            typeof detail === "string" ? <span key={detail}>{detail}</span> : detail,
          )}
        </div>
      )}
    </div>
  );
}

function ticketMain(ticketId, summary, epic, epicName, color, jiraBase, statusFlags = []) {
  return (
    <>
      <TicketLink id={ticketId} color={color} jiraBase={jiraBase} />
      <span>{summary ? `— ${summary}` : ""}</span>
      {statusFlags.map((status) => (
        <React.Fragment key={status}>
          {ticketStatusPill(status)}
        </React.Fragment>
      ))}
      {epicPill(epic, epicName)}
    </>
  );
}

function buildBlockedItems(data) {
  const blockedTickets = Array.isArray(data.ticketsBlocked) ? data.ticketsBlocked : [];
  const blockerDetails = Array.isArray(data.blockers) ? data.blockers : [];

  const blockerByTicket = new Map();
  blockerDetails.forEach((item) => {
    if (item?.ticketId && !blockerByTicket.has(item.ticketId)) {
      blockerByTicket.set(item.ticketId, item);
    }
  });

  return blockedTickets.map((ticket) => {
    const detail = blockerByTicket.get(ticket.ticket) || {};
    return {
      ...ticket,
      ticketId: ticket.ticket,
      reason: detail.detail || detail.reason || "",
      blockerTitle: detail.title || "",
    };
  });
}

function deriveStandupMetrics(data) {
  const metrics = data.metrics || {};
  const useTicketCounts =
    Array.isArray(data.ticketsDone) ||
    Array.isArray(data.ticketsInProgress) ||
    Array.isArray(data.ticketsInReview) ||
    Array.isArray(data.ticketsBlocked) ||
    Array.isArray(data.ticketsTodo);

  if (!useTicketCounts) return metrics;

  return {
    ...metrics,
    done: Array.isArray(data.ticketsDone) ? data.ticketsDone.length : metrics.done,
    inprog: Array.isArray(data.ticketsInProgress) ? data.ticketsInProgress.length : metrics.inprog,
    inreview: Array.isArray(data.ticketsInReview) ? data.ticketsInReview.length : metrics.inreview,
    blocked: Array.isArray(data.ticketsBlocked) ? data.ticketsBlocked.length : metrics.blocked,
    todo: Array.isArray(data.ticketsTodo) ? data.ticketsTodo.length : metrics.todo,
  };
}

function BlockersSec({ data, fresh, jiraBase }) {
  const items = buildBlockedItems(data);
  const inProgressTicketIds = new Set((data.ticketsInProgress || []).map((item) => item.ticket));
  return (
    <Sec
      title="Blocked tickets"
      count={items.length}
      accent={C.red}
      emptyLabel="✓ No blocked tickets"
      warnBg={items.length > 0}
    >
      {items.map((b, i) => (
        <Row
          key={i}
          isNew={
            (fresh.ticketsBlocked || []).some((item) => item.ticket === b.ticketId) ||
            (fresh.blockers || []).some((item) => item.ticketId === b.ticketId)
          }
          accentColor={C.red}
          left={pill(C.redBg, "#f87171", "blocked")}
          main={ticketMain(
            b.ticketId,
            b.summary || b.blockerTitle,
            b.epic,
            b.epicName,
            "#f87171",
            jiraBase,
            inProgressTicketIds.has(b.ticketId) ? ["in progress"] : [],
          )}
          sub={ticketSub(
            b.assignee,
            [b.reason ? `Reason: ${b.reason}` : null].filter(Boolean),
          )}
        />
      ))}
    </Sec>
  );
}

function StaleInProgressSec({ data, fresh, jiraBase }) {
  const items = data.staleInProgress || [];
  const worstDays = items.length ? Math.max(...items.map((s) => s.days ?? 0)) : 0;
  const secAccent = worstDays >= 10 ? C.red : worstDays >= 7 ? "#f97316" : C.amber;
  return (
    <Sec
      title="Stuck in progress — no movement 5+ days"
      count={items.length}
      accent={secAccent}
      emptyLabel="✓ All in-progress tickets moving"
    >
      {items.map((s, i) => {
        const rowColor = (s.days ?? 0) >= 10 ? C.red : (s.days ?? 0) >= 7 ? "#f97316" : C.amber;
        return (
          <Row
            key={i}
            isNew={(fresh.staleInProgress || []).includes(s)}
            accentColor={rowColor}
            left={staleDayPill(s.days)}
            main={ticketMain(s.ticket, s.summary, s.epic, s.epicName, rowColor, jiraBase)}
            sub={ticketSub(s.assignee)}
          />
        );
      })}
    </Sec>
  );
}

function NotPickedUpSec({ data, fresh, jiraBase }) {
  const items = data.notPickedUp || [];
  const hasUrgent = items.some((s) => (s.days ?? 0) >= 4);
  return (
    <Sec
      title="Not started — sitting in To Do"
      count={items.length}
      accent={hasUrgent ? C.amber : undefined}
      emptyLabel="✓ All To Do items assigned"
    >
      {items.map((s, i) => {
        const d = s.days ?? 0;
        const rowColor = d >= 7 ? C.red : d >= 4 ? C.amber : undefined;
        return (
          <Row
            key={i}
            isNew={(fresh.notPickedUp || []).includes(s)}
            accentColor={rowColor}
            left={notPickedPill(s.days)}
            main={ticketMain(s.ticket, s.summary, s.epic, s.epicName, rowColor || C.text1, jiraBase)}
            sub={ticketSub(s.assignee)}
          />
        );
      })}
    </Sec>
  );
}

function StaleSec({ data, fresh, jiraBase }) {
  const items = data.stale || [];
  return (
    <Sec
      title="Stale tickets — no movement 5+ days"
      count={items.length}
      accent={C.amber}
      emptyLabel="✓ No stale tickets"
    >
      {items.map((s, i) => (
        <Row
          key={i}
          isNew={(fresh.stale || []).includes(s)}
          accentColor={C.amber}
          left={staleDayPill(s.days)}
          main={ticketMain(s.ticket, s.summary, s.epic, s.epicName, "#fb923c", jiraBase)}
          sub={ticketSub(s.assignee, [s.status || null].filter(Boolean))}
        />
      ))}
    </Sec>
  );
}

const URGENCY_ORDER = { today: 0, urgent: 0, "this week": 1, "this sprint": 2, "next sprint": 3 };
const ACTION_ACCENT = { today: C.red, urgent: C.red, "this week": C.amber, "this sprint": C.amber };

function ActionsSec({ data, fresh, label }) {
  const raw = dedupeItems(data.actions || [], actionSignature);
  const items = [...raw].sort(
    (a, b) => (URGENCY_ORDER[actionUrgency(a)] ?? 9) - (URGENCY_ORDER[actionUrgency(b)] ?? 9),
  );
  const hasTodayAction = items.some((a) => {
    const urgency = actionUrgency(a);
    return urgency === "today" || urgency === "urgent";
  });
  return (
    <Sec
      title={label || "Actions for the Scrum lead"}
      count={items.length}
      accent={hasTodayAction ? C.red : C.amber}
      emptyLabel="✓ No immediate action needed"
    >
      {items.map((a, i) => {
        const headline = actionHeadline(a) || "Follow-up needed";
        const detail = actionDetail(a);
        return (
          <Row
            key={i}
            isNew={(fresh.actions || []).includes(a)}
            accentColor={ACTION_ACCENT[actionUrgency(a)]}
            left={
              URGENCY_PILL[actionUrgency(a)]
                ? URGENCY_PILL[actionUrgency(a)]()
                : pill(C.amberBg, "#fb923c", a.urgency || "open")
            }
            main={headline}
            sub={(
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 16px" }}>
                  {actionLead(a) && (
                    <span>
                      <strong style={{ color: C.text0 }}>Lead:</strong> {actionLead(a)}
                    </span>
                  )}
                  {actionWhy(a) && (
                    <span>
                      <strong style={{ color: C.text0 }}>Why:</strong> {actionWhy(a)}
                    </span>
                  )}
                  {a.ticketId && a.ticketId !== "null" && <span>{a.ticketId}</span>}
                </div>
                {detail && (
                  <div>
                    <strong style={{ color: C.text0 }}>Detail:</strong> {detail}
                  </div>
                )}
              </div>
            )}
          />
        );
      })}
    </Sec>
  );
}

function NextStepsSec({ data, fresh }) {
  const raw = dedupeItems(
    (data.nextSteps || []).filter((step) => step && (textValue(step.step) || textValue(step.focus) || textValue(step.action))),
    (step) => [
      textValue(step.step || step.focus || step.action),
      textValue(step.owner),
      textValue(step.timing),
      textValue(step.why),
      textValue(step.detail),
    ].join("|"),
  );
  const actions = dedupeItems(data.actions || [], actionSignature);
  const decisions = dedupeItems(data.decisions || [], decisionSignature);
  const items = [...raw].sort(
    (a, b) => (URGENCY_ORDER[textValue(a.timing).toLowerCase()] ?? 9) - (URGENCY_ORDER[textValue(b.timing).toLowerCase()] ?? 9),
  ).filter((item) => {
    const headline = nextStepHeadline(item);
    const overlapsAction = actions.some((action) => isSameTopic(headline, actionHeadline(action)));
    const overlapsDecision = decisions.some((decision) => isSameTopic(headline, decision.decision));
    return !(overlapsAction || overlapsDecision);
  });
  return (
    <Sec
      title="Team next steps to watch"
      count={items.length}
      accent={items.length ? C.blue : undefined}
      emptyLabel="✓ No immediate delivery watch items"
    >
      {items.map((item, i) => {
        const headline = nextStepHeadline(item) || "Next step";
        const detail = firstValue(
          textValue(item.detail),
          relatedDetail(headline, decisions, (decision) => decision.decision, (decision) => textValue(decision.detail)),
        );
        return (
          <Row
            key={i}
            isNew={(fresh.nextSteps || []).includes(item)}
            accentColor={C.blue}
            left={pill(C.blueBg, "#93c5fd", textValue(item.timing) || "next")}
            main={headline}
            sub={(
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 16px" }}>
                  {textValue(item.owner) && (
                    <span>
                      <strong style={{ color: C.text0 }}>Owner:</strong> {textValue(item.owner)}
                    </span>
                  )}
                  {textValue(item.why) && (
                    <span>
                      <strong style={{ color: C.text0 }}>Why:</strong> {textValue(item.why)}
                    </span>
                  )}
                </div>
                {detail && (
                  <div>
                    <strong style={{ color: C.text0 }}>Detail:</strong> {detail}
                  </div>
                )}
              </div>
            )}
          />
        );
      })}
    </Sec>
  );
}

function DecisionsSec({ data, fresh }) {
  const items = dedupeItems(data.decisions || [], decisionSignature);
  return (
    <Sec title="Decisions made" count={items.length} accent={C.teal}>
      {items.map((d, i) => (
        <Row
          key={i}
          isNew={(fresh.decisions || []).includes(d)}
          left={pill(C.tealBg, "#67e8f9", "decided")}
          main={d.decision}
          sub={(
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 16px" }}>
                {textValue(d.madeBy) && <span>{textValue(d.madeBy)}</span>}
                {textValue(d.impact) && <span>{textValue(d.impact)}</span>}
              </div>
              {textValue(d.detail) && (
                <div>
                  <strong style={{ color: C.text0 }}>Detail:</strong> {textValue(d.detail)}
                </div>
              )}
            </div>
          )}
        />
      ))}
    </Sec>
  );
}

function RisksSec({ data, fresh }) {
  const items = dedupeItems(data.risks || [], riskSignature);
  const hasHigh = items.some((r) => r.level === "high");
  const hasMedium = items.some((r) => r.level === "medium");
  const accent = hasHigh ? C.red : hasMedium ? C.amber : items.length ? C.green : undefined;
  return (
    <Sec title="Risks" count={items.length} accent={accent} warnBg={hasHigh || hasMedium}>
      {items.map((r, i) => (
        <Row
          key={i}
          isNew={(fresh.risks || []).includes(r)}
          left={pill(
            r.level === "high"
              ? C.redBg
              : r.level === "medium"
                ? C.amberBg
                : C.greenBg,
            r.level === "high"
              ? "#f87171"
              : r.level === "medium"
                ? "#fb923c"
                : "#4ade80",
            r.level || "risk",
          )}
          main={r.risk}
          sub={r.mitigation}
        />
      ))}
    </Sec>
  );
}

function NotesSec({ data, fresh, label, variant }) {
  const items = variant === "standup"
    ? buildStandupBriefing(data)
    : dedupeItems((data.notes || []).map(noteText).filter(Boolean), noteSignature);
  const freshSignatures = new Set((fresh.notes || []).map(noteSignature).filter(Boolean));
  return (
    <Sec title={label || "Notes"} count={items.length}>
      {items.map((n, i) => (
        <Row key={i} isNew={freshSignatures.has(noteSignature(n))} main={n} />
      ))}
    </Sec>
  );
}

function RefinementWorkspaceCard({ targetSprintLabel, compact = false }) {
  return (
    <div
      style={{
        padding: compact ? "14px 16px" : "16px 18px",
        borderRadius: "16px",
        border: `1px solid ${alphaColor(C.green, 0.26)}`,
        background: `linear-gradient(180deg, ${alphaColor(C.green, 0.1)}, ${alphaColor(C.blue, 0.07)})`,
        boxShadow: "0 12px 28px rgba(2,6,23,0.12)",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: "800",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#86efac",
          marginBottom: "8px",
        }}
      >
        Refinement area
      </div>
      <div style={{ fontSize: compact ? "18px" : "20px", fontWeight: "800", color: C.text0 }}>
        {targetSprintLabel}
      </div>
      <div
        style={{
          fontSize: compact ? "13px" : "14px",
          lineHeight: 1.6,
          color: C.text1,
          marginTop: "6px",
        }}
      >
        Paste refinement transcript or meeting notes here to shape the upcoming sprint: scope candidates, carry-forward work, decision gates, dependencies, and what the Scrum lead needs to chase before commitment.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: "10px",
          marginTop: "14px",
        }}
      >
        {[
          ["Capture", "Candidate work, carry-forward, blockers, and discovery readiness"],
          ["Decide", "Key planning calls such as dates, priorities, approach, and what stays out"],
          ["Revisit", "Saved into history later so you can quickly revisit why the next sprint took shape"],
        ].map(([title, body]) => (
          <div
            key={title}
            style={{
              padding: "12px 12px",
              borderRadius: "12px",
              background: alphaColor(C.bg3, 0.72),
              border: `1px solid ${C.bd}`,
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: "800", color: C.text0, marginBottom: "5px" }}>
              {title}
            </div>
            <div style={{ fontSize: "12px", lineHeight: 1.5, color: C.text1 }}>
              {body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sprint summary card ──────────────────────────────────────────────────────
function SprintSummaryCard({ metrics, sprint }) {
  const m = metrics || {};
  const today = new Date();
  const startDate = sprint ? new Date(sprint.start + "T00:00:00") : null;
  const endDate = sprint ? new Date(sprint.end + "T00:00:00") : null;
  const totalDays = startDate && endDate
    ? Math.max(1, Math.round((endDate - startDate) / 86400000) + 1)
    : 10;
  const sprintDay = startDate
    ? Math.min(totalDays, Math.max(1, Math.round((today - startDate) / 86400000) + 1))
    : null;
  const daysLeft = endDate
    ? Math.max(0, Math.round((endDate - today) / 86400000))
    : null;
  const sprintPct = sprintDay != null ? Math.round((sprintDay / totalDays) * 100) : 0;

  const done = m.done ?? 0;
  const activeTotal = done + (m.inprog ?? 0) + (m.inreview ?? 0) + (m.blocked ?? 0) + (m.todo ?? 0);
  const ticketPct = activeTotal > 0 ? Math.round((done / activeTotal) * 100) : 0;

  const h = m.health;
  const hColor = h === "on track" ? "#4ade80" : h === "at risk" ? "#fb923c" : h === "behind" ? "#f87171" : C.text2;
  const hBg = h === "on track" ? C.greenBg : h === "at risk" ? C.amberBg : h === "behind" ? C.redBg : "transparent";
  const hBorder = h === "on track" ? C.green : h === "at risk" ? C.amber : h === "behind" ? C.red : C.bd;
  const hIcon = h === "on track" ? "✓" : h === "at risk" ? "⚠" : h === "behind" ? "✕" : "";
  const hLabel = h === "on track" ? "On track" : h === "at risk" ? "At risk" : h === "behind" ? "Behind" : h || "";

  const timelineColor = daysLeft != null && daysLeft <= 2 ? "#f87171" : daysLeft != null && daysLeft <= 4 ? "#fb923c" : "#3b82f6";
  const ticketColor = ticketPct >= 70 ? "#4ade80" : ticketPct >= 40 ? "#fb923c" : activeTotal > 0 ? "#f87171" : C.text2;

  if (!h && activeTotal === 0 && sprintDay == null) return null;

  return (
    <div
      style={{
        background: C.bg2,
        border: `1px solid ${h ? alphaColor(hBorder, 0.42) : C.bd}`,
        borderLeft: `4px solid ${h ? hBorder : C.bd}`,
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          background: C.bg3,
          gap: "12px",
        }}
      >
        <div>
          <div style={{ fontSize: "16px", fontWeight: "700", color: C.text0 }}>
            {sprint?.name || "Current sprint"}
          </div>
          {sprintDay != null && (
            <div style={{ fontSize: "14px", color: C.text1, marginTop: "4px" }}>
              Day {sprintDay} of {totalDays}
              {daysLeft != null && (
                <span
                  style={{
                    marginLeft: "10px",
                    fontWeight: "600",
                    color: daysLeft <= 2 ? "#f87171" : daysLeft <= 4 ? "#fb923c" : C.text1,
                  }}
                >
                  {daysLeft === 0 ? "Ends today" : `${daysLeft}d left`}
                </span>
              )}
            </div>
          )}
        </div>
        {h && (
          <div
            style={{
              padding: "7px 15px",
              borderRadius: "999px",
              background: hBg,
              border: `1px solid ${hBorder}`,
              fontSize: "13px",
              fontWeight: "700",
              color: hColor,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {hIcon} {hLabel}
          </div>
        )}
      </div>

      {/* Progress bars */}
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {sprintDay != null && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "7px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: C.text2,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                Sprint timeline
              </span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: C.text1 }}>
                {sprintPct}%
              </span>
            </div>
            <div
              style={{
                height: "8px",
                background: C.bg0,
                borderRadius: "999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${sprintPct}%`,
                  height: "100%",
                  borderRadius: "999px",
                  background: timelineColor,
                  transition: "width .4s ease",
                }}
              />
            </div>
          </div>
        )}

        {activeTotal > 0 && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "7px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: C.text2,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                Tickets done
              </span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: ticketColor }}>
                {done} / {activeTotal} ({ticketPct}%)
              </span>
            </div>
            <div
              style={{
                height: "8px",
                background: C.bg0,
                borderRadius: "999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${ticketPct}%`,
                  height: "100%",
                  borderRadius: "999px",
                  background: ticketColor,
                  transition: "width .4s ease",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Filter metric card ───────────────────────────────────────────────────────
function FilterMetricCard({
  label,
  value,
  color,
  filterKey,
  activeFilters,
  onFilter,
  warnBorder,
  interactive = true,
}) {
  const isActive = activeFilters.includes(filterKey);
  const activate = () => interactive && onFilter(filterKey);
  const solidActiveBg = isActive
    ? `linear-gradient(180deg, ${alphaColor(color, 0.94)}, ${alphaColor(color, 0.78)})`
    : C.bg2;
  const baseBorder = warnBorder && (value ?? 0) > 0 ? alphaColor(C.red, 0.45) : C.bd;
  const activeText = "#ffffff";
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? isActive : undefined}
      style={{
        background: solidActiveBg,
        border: `1px solid ${isActive ? alphaColor(color, 0.95) : baseBorder}`,
        borderRadius: "16px",
        padding: "18px 18px 16px",
        cursor: interactive ? "pointer" : "default",
        boxShadow: isActive
          ? `0 12px 24px ${alphaColor(color, 0.24)}, inset 0 -4px 0 ${alphaColor("#000000", 0.16)}`
          : `inset 0 -1px 0 ${alphaColor("#ffffff", 0.02)}`,
        transition: "border-color .2s, background .2s, box-shadow .2s, transform .2s",
        userSelect: "none",
        minHeight: "124px",
        transform: isActive ? "translateY(-1px)" : "none",
      }}
      onClick={activate}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
    >
      <div
        style={{
          fontSize: "15px",
          color: isActive ? alphaColor(activeText, 0.94) : C.text2,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          marginBottom: "12px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "44px",
          lineHeight: 1,
          fontWeight: 900,
          color: isActive ? activeText : color,
          letterSpacing: "-0.03em",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

// ─── Filtered ticket list section (used when a status card filter is active) ──
function FilteredTicketsSec({ title, tickets, color, pillLabel, jiraBase, crossStatusTickets, crossStatusLabel }) {
  const items = tickets || [];
  const crossStatusTicketIds = new Set((crossStatusTickets || []).map((item) => item.ticket));
  return (
    <Sec title={title} count={items.length} accent={color} emptyLabel="No tickets to display">
      {items.map((t, i) => (
        <Row
          key={i}
          left={pill(color + "22", color, pillLabel)}
          main={ticketMain(
            t.ticket,
            t.summary,
            t.epic,
            t.epicName,
            color,
            jiraBase,
            crossStatusTicketIds.has(t.ticket) && crossStatusLabel ? [crossStatusLabel] : [],
          )}
          sub={ticketSub(
            t.assignee && t.assignee !== "unassigned" ? t.assignee : "Unassigned",
            [
              crossStatusTicketIds.has(t.ticket) && crossStatusLabel
                ? `Also ${crossStatusLabel}`
                : null,
            ].filter(Boolean),
          )}
        />
      ))}
    </Sec>
  );
}

// ─── Meeting dashboards ───────────────────────────────────────────────────────
function StandupDash({ data, fresh, sprint, jiraBase }) {
  const [activeFilters, setActiveFilters] = useState([]);
  const m = deriveStandupMetrics(data);
  const TODO_COLOR = "#64748b";
  const BACKLOG_COLOR = "#94a3b8";
  const activeTotal =
    (m.done ?? 0) + (m.inprog ?? 0) + (m.inreview ?? 0) + (m.blocked ?? 0) + (m.todo ?? 0);

  const handleFilter = (key) =>
    setActiveFilters((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  const usesNewStaleModel = data.staleInProgress !== undefined || data.notPickedUp !== undefined;
  const filteredSections = {
    done: {
      title: "Completed tickets",
      tickets: data.ticketsDone,
      color: "#4ade80",
      pillLabel: "done",
      crossStatusTickets: data.ticketsBlocked,
      crossStatusLabel: "blocked",
    },
    inprog: {
      title: "Tickets in progress",
      tickets: data.ticketsInProgress,
      color: "#3b82f6",
      pillLabel: "in progress",
      crossStatusTickets: data.ticketsBlocked,
      crossStatusLabel: "blocked",
    },
    inreview: {
      title: "Tickets in review",
      tickets: data.ticketsInReview,
      color: "#a78bfa",
      pillLabel: "review",
      crossStatusTickets: data.ticketsBlocked,
      crossStatusLabel: "blocked",
    },
    blocked: {
      title: "Blocked tickets",
      tickets: data.ticketsBlocked,
      color: "#f87171",
      pillLabel: "blocked",
      crossStatusTickets: data.ticketsInProgress,
      crossStatusLabel: "in progress",
    },
    todo: {
      title: "To do tickets",
      tickets: data.ticketsTodo,
      color: TODO_COLOR,
      pillLabel: "to do",
      crossStatusTickets: data.ticketsBlocked,
      crossStatusLabel: "blocked",
    },
  };
  const activeSections = activeFilters
    .map((key) => filteredSections[key])
    .filter(Boolean);
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <>
      <SprintSummaryCard metrics={m} sprint={sprint} />

      {m.done != null && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
              gap: "10px",
            }}
          >
            <FilterMetricCard label="Done"        value={m.done}     color="#4ade80" filterKey="done"     activeFilters={activeFilters} onFilter={handleFilter} />
            <FilterMetricCard label="In Progress" value={m.inprog}   color="#3b82f6" filterKey="inprog"   activeFilters={activeFilters} onFilter={handleFilter} />
            <FilterMetricCard label="In Review"   value={m.inreview} color="#a78bfa" filterKey="inreview" activeFilters={activeFilters} onFilter={handleFilter} />
            <FilterMetricCard label="Blocked"     value={m.blocked}  color="#f87171" filterKey="blocked"  activeFilters={activeFilters} onFilter={handleFilter} warnBorder />
            <FilterMetricCard label="To Do"       value={m.todo}     color={TODO_COLOR} filterKey="todo"  activeFilters={activeFilters} onFilter={handleFilter} />
            <FilterMetricCard label="Backlog"     value={m.backlog}  color={BACKLOG_COLOR} filterKey="backlog" activeFilters={activeFilters} onFilter={handleFilter} interactive={false} />
          </div>

          <div style={{ fontSize: "13px", color: C.text1 }}>
            Select one or more status cards to focus on those tickets.
          </div>

          {/* Status distribution bar */}
          {activeTotal > 0 && (
            <div>
              <div
                style={{
                  display: "flex",
                  height: "8px",
                  borderRadius: "999px",
                  overflow: "hidden",
                  gap: "2px",
                }}
              >
                {[
                  [m.done, "#4ade80"],
                  [m.inreview, "#a78bfa"],
                  [m.inprog, "#3b82f6"],
                  [m.blocked, "#f87171"],
                  [m.todo, TODO_COLOR],
                ].map(([v, color], i) =>
                  v > 0 ? (
                    <div
                      key={i}
                      style={{
                        width: `${((v ?? 0) / activeTotal) * 100}%`,
                        height: "100%",
                        background: color,
                        transition: "width .4s ease",
                      }}
                    />
                  ) : null,
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "14px",
                  marginTop: "8px",
                  flexWrap: "wrap",
                }}
              >
                {[
                  [m.done, "#4ade80", "Done"],
                  [m.inreview, "#a78bfa", "Review"],
                  [m.inprog, "#3b82f6", "In prog"],
                  [m.blocked, "#f87171", "Blocked"],
                  [m.todo, TODO_COLOR, "To do"],
                ].map(([v, color, label]) =>
                  v > 0 ? (
                    <span
                      key={label}
                      style={{ fontSize: "12px", color, fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "3px",
                          background: color,
                          display: "inline-block",
                        }}
                      />
                      {label} {v}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail sections — react to active filter */}
      <div style={{ display: "flex", flexDirection: "column", gap: "inherit" }}>
        {hasActiveFilters && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => setActiveFilters([])}
              style={{
                fontSize: "13px",
                fontWeight: "700",
                padding: "8px 16px",
                borderRadius: "999px",
                border: `1px solid ${C.bd2}`,
                background: C.bg3,
                color: C.text0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              ✕ Clear filter
            </button>
          </div>
        )}

        {activeSections.map((section) => (
          <FilteredTicketsSec
            key={section.title}
            title={section.title}
            tickets={section.tickets}
            color={section.color}
            pillLabel={section.pillLabel}
            jiraBase={jiraBase}
            crossStatusTickets={section.crossStatusTickets}
            crossStatusLabel={section.crossStatusLabel}
          />
        ))}

        {!hasActiveFilters && (
          <>
            <BlockersSec data={data} fresh={fresh} jiraBase={jiraBase} />

            {usesNewStaleModel
              ? <StaleInProgressSec data={data} fresh={fresh} jiraBase={jiraBase} />
              : <StaleSec data={data} fresh={fresh} jiraBase={jiraBase} />}

            {usesNewStaleModel && (
              <NotPickedUpSec data={data} fresh={fresh} jiraBase={jiraBase} />
            )}
          </>
        )}
      </div>

      {!hasActiveFilters && (
        <>
          <QSec data={data} fresh={fresh} />
          <ActionsSec data={data} fresh={fresh} />
          <NextStepsSec data={data} fresh={fresh} />
          <DecisionsSec data={data} fresh={fresh} />
          <RisksSec data={data} fresh={fresh} />
          <NotesSec data={data} fresh={fresh} label="Notes from standup" variant="standup" />
        </>
      )}
    </>
  );
}

function PlanningDash({ data, fresh, nextSprint }) {
  const cf = data.carryForward || [];
  const bl = data.backlog || [];
  const dep = data.dependencies || [];
  const tl = data.teamLoad || [];
  const rec = data.sprintRecommendation || [];
  const summary = textValue(data.summary);
  const targetSprintLabel = nextSprint?.name || 'next sprint';
  return (
    <>
      <RefinementWorkspaceCard targetSprintLabel={targetSprintLabel} compact />
      {summary && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "16px",
            border: `1px solid ${C.blue}22`,
            background: C.panel2,
            boxShadow: "0 10px 28px rgba(2,6,23,0.14)",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: "800",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: C.text2,
              marginBottom: "8px",
            }}
          >
            {`Planning readout for ${targetSprintLabel}`}
          </div>
          <div
            style={{
              fontSize: "18px",
              lineHeight: 1.45,
              fontWeight: "700",
              color: C.text0,
            }}
          >
            {summary}
          </div>
        </div>
      )}
      <QSec data={data} fresh={fresh} label={`Questions to settle before ${targetSprintLabel}`} />
      <Sec title={`Carry forward to ${targetSprintLabel}`} count={cf.length}>
        {cf.map((t, i) => (
          <Row
            key={i}
            isNew={(fresh.carryForward || []).includes(t)}
            left={pill(C.amberBg, "#fb923c", t.recommendation || "carry")}
            main={
              <>
                <strong>{t.ticketId}</strong> — {t.summary}
              </>
            }
            sub={`${t.assignee || ""} · ${t.reason || ""}`}
          />
        ))}
      </Sec>
      <Sec title={`Candidate items for ${targetSprintLabel}`} count={rec.length}>
        {rec.map((t, i) => (
          <Row
            key={i}
            isNew={(fresh.sprintRecommendation || []).includes(t)}
            left={
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  color: C.text2,
                  minWidth: "18px",
                }}
              >
                {i + 1}.
              </span>
            }
            main={
              <>
                <strong>{t.ticketId}</strong> — {t.summary}
              </>
            }
            sub={t.rationale}
          />
        ))}
      </Sec>
      <Sec title={`Backlog candidates (${bl.length})`} count={bl.length}>
        {bl.map((t, i) => (
          <Row
            key={i}
            isNew={(fresh.backlog || []).includes(t)}
            left={pill(
              t.ready ? C.greenBg : C.redBg,
              t.ready ? "#4ade80" : "#f87171",
              t.ready ? "ready" : "not ready",
            )}
            main={
              <>
                <strong>{t.ticketId}</strong> — {t.summary}
              </>
            }
            sub={`${t.priority || ""} priority${t.notes ? " · " + t.notes : ""}`}
          />
        ))}
      </Sec>
      {dep.length > 0 && (
        <Sec title="Dependencies" count={dep.length}>
          {dep.map((d, i) => (
            <Row
              key={i}
              isNew={(fresh.dependencies || []).includes(d)}
              left={pill(C.redBg, "#f87171", "dep")}
              main={d.dependency}
              sub={(
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 16px" }}>
                    <span>
                      <strong style={{ color: C.text0 }}>Owner:</strong> {d.owner || "?"}
                    </span>
                    {textValue(d.status) && (
                      <span>
                        <strong style={{ color: C.text0 }}>Status:</strong> {textValue(d.status)}
                      </span>
                    )}
                    {textValue(d.risk) && (
                      <span>
                        <strong style={{ color: C.text0 }}>Risk:</strong> {textValue(d.risk)}
                      </span>
                    )}
                  </div>
                  {textValue(d.detail) && (
                    <div>
                      <strong style={{ color: C.text0 }}>Detail:</strong> {textValue(d.detail)}
                    </div>
                  )}
                </div>
              )}
            />
          ))}
        </Sec>
      )}
      {tl.length > 0 && (
        <Sec title="Team capacity" count={tl.length}>
          {tl.map((t, i) => (
            <Row
              key={i}
              isNew={(fresh.teamLoad || []).includes(t)}
              left={pill(
                t.capacity === "available"
                  ? C.greenBg
                  : t.capacity === "limited"
                    ? C.amberBg
                    : C.redBg,
                t.capacity === "available"
                  ? "#4ade80"
                  : t.capacity === "limited"
                    ? "#fb923c"
                    : "#f87171",
                t.capacity || "?",
              )}
              main={t.name}
              sub={t.tickets}
          />
        ))}
      </Sec>
      )}
      <ActionsSec data={data} fresh={fresh} label="Actions for the Scrum lead" />
      <DecisionsSec data={data} fresh={fresh} />
      <RisksSec data={data} fresh={fresh} />
      <NotesSec data={data} fresh={fresh} label={`Refinement notes for ${targetSprintLabel}`} />
    </>
  );
}

function SprintReferenceDash({ state, sprint }) {
  const reference = buildSprintReferenceData(state, sprint?.num);
  const meetings = reference.meetings || [];
  const updatedCount = meetings.length;

  return (
    <>
      <div
        style={{
          padding: "18px 20px",
          borderRadius: "16px",
          border: `1px solid ${alphaColor(C.teal, 0.24)}`,
          background: `linear-gradient(180deg, ${alphaColor(C.teal, 0.12)}, ${alphaColor(C.blue, 0.08)})`,
          boxShadow: "0 12px 28px rgba(2,6,23,0.12)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: "800",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#67e8f9",
            marginBottom: "8px",
          }}
        >
          Single source reference
        </div>
        <div style={{ fontSize: "22px", fontWeight: "800", color: C.text0 }}>
          {sprint?.name || "Current sprint"}
        </div>
        <div style={{ fontSize: "14px", color: C.text1, lineHeight: 1.6, marginTop: "6px" }}>
          This is the full sprint-detail view: blockers, follow-ups, next steps, decisions, risks, and useful notes rolled up from the other tabs.
        </div>
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "14px",
          }}
        >
          <span style={{
            fontSize: "12px",
            fontWeight: "700",
            color: C.text0,
            background: C.bg3,
            border: `1px solid ${C.bd}`,
            borderRadius: "999px",
            padding: "6px 12px",
          }}>
            {updatedCount} area{updatedCount === 1 ? "" : "s"} captured
          </span>
          {state.lastUpdated && (
            <span style={{
              fontSize: "12px",
              color: C.text1,
              background: C.bg3,
              border: `1px solid ${C.bd}`,
              borderRadius: "999px",
              padding: "6px 12px",
            }}>
              Updated {state.lastUpdated}
            </span>
          )}
        </div>
      </div>

      <Sec title="Meeting readouts" count={meetings.length} emptyLabel="No sprint updates captured yet">
        {meetings.map((meeting) => (
          <Row
            key={meeting.id}
            main={
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: "800", color: C.text2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {meeting.label}
                </span>
                <span>{meeting.summary}</span>
              </div>
            }
            sub={meeting.updatedAt ? `Updated ${meeting.updatedAt}` : ""}
          />
        ))}
      </Sec>

      <BlockersSec data={reference} fresh={{}} />
      <QSec data={reference} fresh={{}} label="Questions to resolve across the sprint" />
      <ActionsSec data={reference} fresh={{}} label="Actions for the Scrum lead across the sprint" />
      <NextStepsSec data={reference} fresh={{}} />
      <DecisionsSec data={reference} fresh={{}} />
      <RisksSec data={reference} fresh={{}} />
      <NotesSec data={reference} fresh={{}} label="Cross-sprint notes and context" />
    </>
  );
}

function ReviewDash({ data, fresh }) {
  const goal = data.sprintGoal;
  const fb = data.stakeholderFeedback || [];
  return (
    <>
      {goal && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            border: `1px solid ${goal.achieved ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
            background: goal.achieved
              ? "rgba(74,222,128,0.06)"
              : "rgba(248,113,113,0.06)",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "600",
              marginBottom: "4px",
              color: goal.achieved ? "#4ade80" : "#f87171",
            }}
          >
            {goal.achieved
              ? "✓ Sprint goal achieved"
              : "✗ Sprint goal not achieved"}
          </div>
          <div style={{ fontSize: "12px", color: C.text1 }}>
            {goal.evidence}
          </div>
        </div>
      )}
      <Sec title="Completed this sprint" count={(data.completed || []).length}>
        {(data.completed || []).map((t, i) => (
          <Row
            key={i}
            isNew={(fresh.completed || []).includes(t)}
            left={pill(C.greenBg, "#4ade80", "done")}
            main={
              <>
                {t.ticketId && t.ticketId !== "null" ? (
                  <strong>{t.ticketId} — </strong>
                ) : null}
                {t.summary}
              </>
            }
          />
        ))}
      </Sec>
      <Sec title="Not completed" count={(data.incomplete || []).length}>
        {(data.incomplete || []).map((t, i) => (
          <Row
            key={i}
            isNew={(fresh.incomplete || []).includes(t)}
            left={pill(C.redBg, "#f87171", "missed")}
            main={
              <>
                {t.ticketId && t.ticketId !== "null" ? (
                  <strong>{t.ticketId} — </strong>
                ) : null}
                {t.summary}
              </>
            }
            sub={t.reason}
          />
        ))}
      </Sec>
      {fb.length > 0 && (
        <Sec title="Stakeholder feedback" count={fb.length}>
          {fb.map((f, i) => (
            <Row
              key={i}
              isNew={(fresh.stakeholderFeedback || []).includes(f)}
              main={f}
            />
          ))}
        </Sec>
      )}
      <ActionsSec data={data} fresh={fresh} label="Follow-ups" />
      <DecisionsSec data={data} fresh={fresh} />
      <NotesSec data={data} fresh={fresh} label="Review notes" />
    </>
  );
}

function RetroDash({ data, fresh }) {
  const ww = data.wentWell || [];
  const dw = data.didntGoWell || [];
  return (
    <>
      <Sec title="Went well" count={ww.length}>
        {ww.map((w, i) => (
          <Row
            key={i}
            isNew={(fresh.wentWell || []).includes(w)}
            left={pill(C.greenBg, "#4ade80", "+")}
            main={w}
          />
        ))}
      </Sec>
      <Sec title="Didn't go well" count={dw.length}>
        {dw.map((d, i) => (
          <Row
            key={i}
            isNew={(fresh.didntGoWell || []).includes(d)}
            left={pill(C.redBg, "#f87171", "−")}
            main={d}
          />
        ))}
      </Sec>
      <ActionsSec data={data} fresh={fresh} label="Improvement actions" />
      <NotesSec data={data} fresh={fresh} label="Other points" />
    </>
  );
}

function DiscoveryDash({ data, fresh }) {
  const oq = data.openQuestions || [];
  const ud = data.unresolvedDecisions || [];
  const sc = data.scopeBoundaries || {};
  return (
    <>
      <QSec data={data} fresh={fresh} label="Questions to raise in the call" />
      {oq.length > 0 && (
        <Sec title="Open questions" count={oq.length}>
          {oq.map((q, i) => (
            <Row
              key={i}
              isNew={(fresh.openQuestions || []).includes(q)}
              left={pill(
                q.status === "open" ? C.redBg : C.amberBg,
                q.status === "open" ? "#f87171" : "#fb923c",
                q.status || "open",
              )}
              main={q.question}
              sub={`Source: ${q.source || "?"}`}
            />
          ))}
        </Sec>
      )}
      {ud.length > 0 && (
        <Sec title="Unresolved decisions" count={ud.length}>
          {ud.map((d, i) => (
            <Row
              key={i}
              isNew={(fresh.unresolvedDecisions || []).includes(d)}
              left={pill(C.amberBg, "#fb923c", "unresolved")}
              main={d.decision}
              sub={`Owner: ${d.owner || "?"} · ${d.detail || ""}`}
            />
          ))}
        </Sec>
      )}
      {(sc.inScope?.length > 0 ||
        sc.outOfScope?.length > 0 ||
        sc.unclear?.length > 0) && (
        <Sec
          title="Scope"
          count={
            (sc.inScope || []).length +
            (sc.outOfScope || []).length +
            (sc.unclear || []).length
          }
        >
          {(sc.inScope || []).map((s, i) => (
            <Row
              key={`in${i}`}
              left={pill(C.greenBg, "#4ade80", "in scope")}
              main={s}
            />
          ))}
          {(sc.outOfScope || []).map((s, i) => (
            <Row
              key={`out${i}`}
              left={pill(C.bg0, C.text2, "out of scope")}
              main={s}
            />
          ))}
          {(sc.unclear || []).map((s, i) => (
            <Row
              key={`unc${i}`}
              left={pill(C.amberBg, "#fb923c", "unclear")}
              main={s}
            />
          ))}
        </Sec>
      )}
      <ActionsSec data={data} fresh={fresh} label="Follow-ups" />
      <DecisionsSec data={data} fresh={fresh} />
      <RisksSec data={data} fresh={fresh} />
      <NotesSec data={data} fresh={fresh} label="Call notes" />
    </>
  );
}

function StakeholderDash({ data, fresh }) {
  const rag = data.ragStatus;
  const ragS = rag ? RAG_STYLE[rag] : null;
  const sa = data.stakeholderActions || [];
  const ach = data.achievements || [];
  const ip = data.inProgress || [];
  return (
    <>
      {ragS && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 16px",
            background: ragS.bg,
            borderRadius: "10px",
            border: `1px solid ${ragS.color}33`,
          }}
        >
          <span
            style={{ fontSize: "20px", fontWeight: "800", color: ragS.color }}
          >
            {rag}
          </span>
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: ragS.color,
                marginBottom: "2px",
              }}
            >
              {ragS.label}
            </div>
            {data.ragReason && (
              <div style={{ fontSize: "12px", color: C.text1 }}>
                {data.ragReason}
              </div>
            )}
          </div>
        </div>
      )}
      {ach.length > 0 && (
        <Sec title="Achievements" count={ach.length}>
          {ach.map((a, i) => (
            <Row
              key={i}
              isNew={(fresh.achievements || []).includes(a)}
              left={pill(C.greenBg, "#4ade80", "done")}
              main={a}
            />
          ))}
        </Sec>
      )}
      {ip.length > 0 && (
        <Sec title="In progress this week" count={ip.length}>
          {ip.map((a, i) => (
            <Row
              key={i}
              isNew={(fresh.inProgress || []).includes(a)}
              left={pill(C.blueBg, "#93c5fd", "now")}
              main={a}
            />
          ))}
        </Sec>
      )}
      <QSec data={data} fresh={fresh} label="Questions to ask stakeholders" />
      {sa.length > 0 && (
        <Sec title="Actions needed from stakeholders" count={sa.length}>
          {sa.map((a, i) => (
            <Row
              key={i}
              isNew={(fresh.stakeholderActions || []).includes(a)}
              left={
                URGENCY_PILL[a.urgency]
                  ? URGENCY_PILL[a.urgency]()
                  : pill(C.amberBg, "#fb923c", a.urgency || "pending")
              }
              main={a.action}
              sub={`Owner: ${a.owner || "?"}`}
            />
          ))}
        </Sec>
      )}
      <ActionsSec data={data} fresh={fresh} label="Follow-ups from this meeting" />
      <DecisionsSec data={data} fresh={fresh} />
      <RisksSec data={data} fresh={fresh} />
      <NotesSec data={data} fresh={fresh} label="Meeting notes" />
    </>
  );
}

function MeetingDashboard({ id, data, fresh, sprint, jiraBase, nextSprint, state }) {
  if (id === "reference") return <SprintReferenceDash state={state} sprint={sprint} />;
  if (id === "standup") return <StandupDash data={data} fresh={fresh} sprint={sprint} jiraBase={jiraBase} />;
  if (id === "planning" || id === "refinement") return <PlanningDash data={data} fresh={fresh} nextSprint={nextSprint} />;
  if (id === "review") return <ReviewDash data={data} fresh={fresh} />;
  if (id === "retro") return <RetroDash data={data} fresh={fresh} />;
  if (id === "discovery") return <DiscoveryDash data={data} fresh={fresh} />;
  if (id === "stakeholder")
    return <StakeholderDash data={data} fresh={fresh} />;
  return null;
}

// ─── Input block ──────────────────────────────────────────────────────────────
function InputBlock({
  iconBg,
  iconLabel,
  title,
  sub,
  copyText,
  copyLabel,
  paste,
  onPaste,
  pastePlaceholder,
  status,
  loading,
  onProcess,
  btnBg,
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!copyText) return;
    navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };
  return (
    <div
      style={{
        border: `1px solid ${C.bd}`,
        borderRadius: "22px",
        overflow: "hidden",
        background: C.bg2,
        boxShadow: `0 14px 30px ${alphaColor("#0f172a", 0.05)}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          background: C.bg2,
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "6px",
              background: iconBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              fontWeight: "700",
              color: "#fff",
            }}
          >
            {iconLabel}
          </div>
          <div>
            <div
              style={{ fontSize: "12px", fontWeight: "600", color: C.text0 }}
            >
              {title}
            </div>
            <div style={{ fontSize: "11px", color: C.text2 }}>{sub}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto", flexWrap: "wrap" }}>
          {copyText && (
            <button
              onClick={handleCopy}
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 14px",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "700",
                background: copied ? C.greenBg : iconBg,
                color: copied ? "#4ade80" : "#fff",
              }}
            >
              {copied ? "✓ Copied" : copyLabel || "Copy prompt"}
            </button>
          )}
        </div>
      </div>
      <div style={{ height: "1px", background: C.bd }} />
      <textarea
        style={{
          width: "100%",
          fontSize: "12px",
          padding: "14px 16px",
          border: "none",
          background: C.bg2,
          color: C.text0,
          resize: "vertical",
          fontFamily: "inherit",
          lineHeight: "1.6",
          minHeight: "110px",
          outline: "none",
        }}
        value={paste}
        onChange={(e) => onPaste(e.target.value)}
        placeholder={
          pastePlaceholder || (copyText
            ? "Paste the Rovo response here..."
            : "Paste meeting notes, transcript, or summary here...")
        }
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: C.bg2,
          borderTop: `1px solid ${C.bd}`,
          gap: "8px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            color: C.text2,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? (
            <span>
              Processing
              <Spinner />
            </span>
          ) : (
            status || "Ready"
          )}
        </span>
        <button
          onClick={onProcess}
          disabled={loading}
          type="button"
          style={{
            padding: "6px 16px",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "700",
            background: btnBg,
            color: "#fff",
            opacity: loading ? 0.5 : 1,
          }}
        >
          Update dashboard
        </button>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ onClose, children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: C.bg2,
          borderRadius: "12px",
          padding: "22px",
          width: "480px",
          maxWidth: "92vw",
          border: `1px solid ${C.bd2}`,
          maxHeight: "82vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ShellButton({
  children,
  onClick,
  tone = "neutral",
  active = false,
  disabled = false,
  style = {},
}) {
  const tones = {
    neutral: {
      background: active ? C.bg3 : C.bg2,
      color: C.text0,
      border: C.bd,
    },
    primary: {
      background: C.blue,
      color: "#ffffff",
      border: alphaColor(C.blue, 0.26),
    },
    subtle: {
      background: C.bg3,
      color: C.text1,
      border: C.bd,
    },
    warning: {
      background: C.amberBg,
      color: C.amber,
      border: alphaColor(C.amber, 0.24),
    },
    danger: {
      background: alphaColor(C.red, 0.1),
      color: C.red,
      border: alphaColor(C.red, 0.24),
    },
  };
  const palette = tones[tone] || tones.neutral;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: "12px",
        fontWeight: "700",
        padding: "10px 14px",
        borderRadius: "14px",
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.58 : 1,
        transition: "background .2s ease, border-color .2s ease, transform .2s ease",
        boxShadow: `0 12px 24px ${alphaColor("#0f172a", 0.05)}`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SummaryFilterCard({ label, value, hint, accent, onClick }) {
  const body = (
    <>
      <span
        style={{
          fontSize: "11px",
          fontWeight: "800",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: C.text2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          marginTop: "12px",
          fontSize: "18px",
          fontWeight: "800",
          color: C.text0,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
      {hint && (
        <span
          style={{
            marginTop: "8px",
            fontSize: "12px",
            color: C.text1,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </span>
      )}
    </>
  );

  const sharedStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    minHeight: "116px",
    padding: "18px 18px 16px",
    borderRadius: "22px",
    border: `1px solid ${alphaColor(accent || C.bd2, accent ? 0.18 : 0.12)}`,
    background: C.bg2,
    boxShadow: `0 18px 34px ${alphaColor("#0f172a", 0.06)}`,
    textAlign: "left",
    position: "relative",
    overflow: "hidden",
  };

  if (!onClick) return <div style={sharedStyle}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...sharedStyle,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          position: "absolute",
          right: "16px",
          top: "16px",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: accent || C.blue,
          boxShadow: `0 0 0 8px ${alphaColor(accent || C.blue, 0.1)}`,
        }}
      />
      {body}
    </button>
  );
}

function QuickStartGuide({
  isReference,
  isInsights,
  workspaceAvailable,
  meetingLabel,
  captureSourceLabel,
  onProjectSetup,
  onOpenReference,
}) {
  const guideCard = (accent, title, text, actionLabel, onAction) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: "100%",
        padding: "18px",
        borderRadius: "22px",
        border: `1px solid ${alphaColor(accent, 0.18)}`,
        background: C.bg2,
        boxShadow: `0 18px 34px ${alphaColor("#0f172a", 0.06)}`,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "11px",
          fontWeight: "800",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: accent,
        }}
      >
        <span
          style={{
            width: "9px",
            height: "9px",
            borderRadius: "999px",
            background: accent,
            boxShadow: `0 0 0 8px ${alphaColor(accent, 0.1)}`,
            flexShrink: 0,
          }}
        />
        {title}
      </div>
      <div style={{ fontSize: "13px", color: C.text1, lineHeight: 1.7 }}>
        {text}
      </div>
      {actionLabel && onAction && (
        <div style={{ marginTop: "auto" }}>
          <ShellButton onClick={onAction} tone="subtle">
            {actionLabel}
          </ShellButton>
        </div>
      )}
    </div>
  );

  const captureInstruction = isReference
    ? "Use the ceremony tabs to capture fresh updates first, then come back here for the rolled-up sprint picture."
    : workspaceAvailable
      ? `Use Capture updates to paste ${captureSourceLabel.toLowerCase()}, then press Update to refresh the sections below.`
      : "This view is mainly for review. Capture new updates from the ceremony tabs, then return here if you need the rolled-up sprint picture.";

  const currentViewInstruction = isReference
    ? "Sprint detail is the complete sprint view. It combines blockers, follow-ups, decisions, risks, warnings, and notes from the other tabs into one readable page."
    : isInsights
      ? "Velocity & insights shows sprint performance, coaching signals, and delivery trends. Use Sprint detail when you need blockers and follow-ups in one place."
      : `${meetingLabel} focuses on the current ceremony. Capture the latest update here, then use Sprint detail if you want the whole sprint story in one place.`;

  return (
    <div
      style={{
        marginBottom: "18px",
        padding: "20px",
        borderRadius: "26px",
        border: `1px solid ${C.bd}`,
        background: C.panel2,
        boxShadow: `0 24px 46px ${alphaColor("#0f172a", 0.07)}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "14px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div style={{ maxWidth: "820px" }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: "800",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: C.text2,
              marginBottom: "8px",
            }}
          >
            Start here
          </div>
          <div style={{ fontSize: "22px", fontWeight: "800", color: C.text0, lineHeight: 1.2 }}>
            What this product does and how to use it
          </div>
          <div style={{ fontSize: "14px", color: C.text1, lineHeight: 1.7, marginTop: "8px" }}>
            Scrum Intelligence turns Jira Rovo output and meeting notes into a simple sprint dashboard with clear sections for blockers, follow-ups, decisions, warnings, and notes.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        {guideCard(
          C.blue,
          "1. Set up the project",
          "Run Project setup first so the dashboard knows the project, active sprint, upcoming sprints, epic, and team context.",
          "Open project setup",
          onProjectSetup,
        )}
        {guideCard(
          C.amber,
          "2. Capture updates",
          captureInstruction,
          null,
          null,
        )}
        {guideCard(
          C.teal,
          "3. Review the right view",
          currentViewInstruction,
          isReference ? null : "Open Sprint detail",
          isReference ? null : onOpenReference,
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            padding: "18px",
            borderRadius: "22px",
            border: `1px solid ${C.bd}`,
            background: C.bg2,
            boxShadow: `0 18px 34px ${alphaColor("#0f172a", 0.06)}`,
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: "800",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: C.text2,
            }}
          >
            Colour guide
          </div>
          {[
            [C.red, "Red", "Blockers and critical issues"],
            [C.amber, "Amber", "Warnings, risks, and watch-outs"],
            [C.blue, "Blue", "Questions and follow-ups"],
            [C.green, "Green", "Resolved items and positive status"],
          ].map(([color, label, text]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: C.text1 }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "999px",
                  background: color,
                  flexShrink: 0,
                }}
              />
              <strong style={{ color: C.text0, fontWeight: "700" }}>{label}</strong>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectSetupPage({
  projectProfile,
  projectContext,
  projectSetupPrompt,
  setupPaste,
  setSetupPaste,
  setupStatus,
  setupLoading,
  state,
  copyProjectSetupPrompt,
  applyProjectSetup,
  onOpenReference,
}) {
  const displayProjectKey = projectProfile.projectKey || "Project";
  const displayProjectName = projectProfile.projectName || "Run Project setup to load project context";
  const displayEpicKey = projectContext.epic || projectProfile.projectKey || "Project context";

  return (
    <div className="app-dashboard-stack">
      <QuickStartGuide
        isReference={false}
        isInsights={false}
        workspaceAvailable={true}
        meetingLabel="Project setup"
        captureSourceLabel="Rovo + meeting notes"
        onProjectSetup={null}
        onOpenReference={onOpenReference}
      />

      <div
        style={{
          background: C.panel2,
          border: `1px solid ${C.bd}`,
          borderRadius: "26px",
          padding: "18px",
          boxShadow: `0 24px 46px ${alphaColor("#0f172a", 0.07)}`,
        }}
      >
        <div style={{ fontSize: "16px", fontWeight: "700", color: C.text0, marginBottom: "8px" }}>
          Project setup prompt
        </div>
        <div style={{ fontSize: "13px", color: C.text1, lineHeight: 1.7, marginBottom: "14px" }}>
          Use this page first when starting a new dashboard or refreshing the same project. Copy the setup prompt, run it in Rovo, then paste the response below so the dashboard can load the right project, sprint timeline, previous sprint context, epic, and team data.
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "14px",
          }}
        >
          {[
            `Current project: ${displayProjectKey} — ${displayProjectName}`,
            `Primary epic: ${displayEpicKey}${projectContext.epicName ? ` — ${projectContext.epicName}` : ""}`,
            `Sprint naming: ${projectProfile.sprintNameTemplate || "Not configured"}`,
            projectProfile.sprintDurationDays
              ? `Sprint cadence: ${projectProfile.sprintDurationDays}-day sprint${projectProfile.sprintGapDays >= 0 ? ` · ${projectProfile.sprintGapDays} gap day${projectProfile.sprintGapDays === 1 ? "" : "s"}` : ""}`
              : null,
            projectProfile.team?.length ? `Team members known: ${projectProfile.team.length}` : null,
            projectProfile.workstreams?.length ? `Known workstreams: ${projectProfile.workstreams.length}` : null,
            Object.keys(state.sprintSummaries || {}).length ? `Archived sprint snapshots: ${Object.keys(state.sprintSummaries || {}).length}` : null,
            state.lastUpdated
              ? `Last data update: ${state.lastUpdated}`
              : "Last data update: No saved updates yet",
            state.projectSetupAppliedAt
              ? `Last setup: ${new Date(state.projectSetupAppliedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}`
              : "No setup applied yet",
          ].filter(Boolean).map((chip) => (
            <span
              key={chip}
              style={{
                padding: "6px 10px",
                borderRadius: "999px",
                background: C.bg3,
                border: `1px solid ${C.bd}`,
                fontSize: "11px",
                color: C.text1,
              }}
            >
              {chip}
            </span>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
            marginBottom: "16px",
          }}
        >
          {[
            {
              accent: C.blue,
              title: "What the setup should return",
              items: [
                "Project profile, delivery context, and sprint cadence",
                "Previous, current, and next sprint timeline",
                "Primary epic and workstreams in play",
                "Current team, active sprint board, and recent sprint history",
              ],
            },
            {
              accent: C.amber,
              title: "Use setup when",
              items: [
                "Starting a new project dashboard",
                "Refreshing the same project with newer Jira context",
                "The team, sprint cadence, or board context has changed",
                "You want the whole dashboard to adapt cleanly",
              ],
            },
          ].map((card) => (
            <div
              key={card.title}
              style={{
                padding: "18px",
                borderRadius: "22px",
                border: `1px solid ${alphaColor(card.accent, 0.18)}`,
                background: C.bg2,
                boxShadow: `0 18px 34px ${alphaColor("#0f172a", 0.06)}`,
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "800",
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: card.accent,
                  marginBottom: "10px",
                }}
              >
                {card.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {card.items.map((item) => (
                  <div key={item} style={{ display: "flex", gap: "10px", fontSize: "12px", color: C.text1, lineHeight: 1.6 }}>
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "999px",
                        background: card.accent,
                        marginTop: "6px",
                        flexShrink: 0,
                      }}
                    />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            border: `1px solid ${C.bd2}`,
            borderRadius: "16px",
            overflow: "hidden",
            background: C.bg0,
            marginBottom: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              padding: "12px 14px",
              background: C.bg3,
              borderBottom: `1px solid ${C.bd}`,
            }}
          >
            <div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: C.text0 }}>
                Copy setup prompt
              </div>
              <div style={{ fontSize: "11px", color: C.text2 }}>
                One prompt to gather the project profile, sprint cadence, sprint history, team, workstreams, and active sprint board in one response.
              </div>
            </div>
            <ShellButton onClick={copyProjectSetupPrompt} tone="primary">
              Copy setup prompt
            </ShellButton>
          </div>
          <div
            style={{
              maxHeight: "220px",
              overflowY: "auto",
              padding: "12px 14px",
              fontSize: "12px",
              lineHeight: "1.6",
              color: C.text0,
              whiteSpace: "pre-wrap",
            }}
          >
            {projectSetupPrompt}
          </div>
        </div>

        <label
          style={{
            fontSize: "11px",
            fontWeight: "600",
            color: C.text1,
            display: "block",
            marginBottom: "6px",
          }}
        >
          Paste the Rovo setup response
        </label>
        <textarea
          value={setupPaste}
          onChange={(e) => setSetupPaste(e.target.value)}
          placeholder="Paste the project setup response here..."
          style={{
            width: "100%",
            minHeight: "220px",
            fontSize: "12px",
            padding: "12px 14px",
            border: `1px solid ${C.bd2}`,
            borderRadius: "14px",
            background: C.bg0,
            color: C.text0,
            resize: "vertical",
            fontFamily: "inherit",
            lineHeight: "1.6",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div style={{ fontSize: "11px", color: C.text2, marginTop: "8px", lineHeight: "1.6" }}>
          Applying setup updates the project profile, sprint cadence, sprint list, previous sprint history, current team, and active sprint board. Rerunning setup for the same project refreshes that context without wiping saved sprint data. Switching to a different project clears old meeting data, history, and insights while keeping API keys, theme, and Jira base URL.
        </div>

        {setupStatus && (
          <div
            style={{
              marginTop: "12px",
              padding: "10px 12px",
              borderRadius: "12px",
              fontSize: "11px",
              lineHeight: "1.5",
              background: /error/i.test(setupStatus) ? C.redBg : C.blueBg,
              color: /error|cancelled/i.test(setupStatus) ? "#f87171" : "#93c5fd",
              border: `1px solid ${/error|cancelled/i.test(setupStatus) ? C.red : C.blue}`,
            }}
          >
            {setupStatus}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
          <ShellButton onClick={applyProjectSetup} tone="primary" disabled={setupLoading}>
            {setupLoading ? "Applying..." : "Apply setup"}
          </ShellButton>
          <ShellButton onClick={onOpenReference} tone="subtle">
            Open Sprint detail
          </ShellButton>
        </div>
      </div>
    </div>
  );
}

function RailNavItem({ label, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 14px",
        borderRadius: "16px",
        border: `1px solid ${active ? alphaColor(color, 0.18) : "transparent"}`,
        background: active ? alphaColor(color, 0.12) : "transparent",
        color: active ? C.text0 : C.text1,
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: active ? "700" : "600",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          boxShadow: active ? `0 0 0 8px ${alphaColor(color, 0.1)}` : "none",
        }}
      />
      <span>{label}</span>
    </button>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const sharedSyncEnabledRef = useRef(process.env.NODE_ENV !== "test");
  const initialLocalSettingsRef = useRef(null);
  if (initialLocalSettingsRef.current == null) {
    initialLocalSettingsRef.current = loadLocalSettings(DEFAULT_SPRINTS);
  }
  const bootstrapSharedStateRef = useRef(null);
  if (bootstrapSharedStateRef.current == null) {
    bootstrapSharedStateRef.current = loadSharedBootstrapState(DEFAULT_SPRINTS);
  }
  const [state, setState] = useState(
    () => (
      sharedSyncEnabledRef.current
        ? composeStateFromSharedState(
            hasMeaningfulSharedDashboardState(bootstrapSharedStateRef.current, DEFAULT_SPRINTS)
              ? bootstrapSharedStateRef.current
              : defaultState(DEFAULT_SPRINTS),
            initialLocalSettingsRef.current,
            DEFAULT_SPRINTS,
          )
        : loadState(DEFAULT_SPRINTS) || defaultState(DEFAULT_SPRINTS)
    ),
  );
  const latestStateRef = useRef(state);
  const syncChannelRef = useRef(null);
  const sharedSyncPrimedRef = useRef(!sharedSyncEnabledRef.current);
  const themeMode = state.theme || "light";
  const themeVars = THEME_VARS[themeMode] || THEME_VARS.light;
  const [aiStatus, setAIStatus] = useState({
    primary: { state: "no_key", detail: "No Groq key saved" },
    fallback: { state: "no_key", detail: "No Cerebras key saved" },
  });
  const [curMeeting, setCur] = useState("standup");
  const [rovoPaste, setRovoPaste] = useState("");
  const [notesPaste, setNotes] = useState("");
  const [rovoStatus, setRovoSt] = useState("");
  const [notesStatus, setNotesSt] = useState("");
  const [rovoLoading, setRovoL] = useState(false);
  const [notesLoading, setNotesL] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: "", err: false });
  const [modal, setModal] = useState(null);
  const [fresh, setFresh] = useState({});
  const [providerTestState, setProviderTestState] = useState({
    loading: false,
    msg: "",
    err: false,
  });
  const [sharedSyncStatus, setSharedSyncStatus] = useState(initialSharedSyncStatus);
  const [setupPaste, setSetupPaste] = useState("");
  const [setupStatus, setSetupStatus] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  const showToast = useCallback((msg, err = false) => {
    setToast({ show: true, msg, err });
    setTimeout(() => setToast({ show: false, msg: "", err: false }), 6000);
  }, []);

  const updateSharedSyncStatus = useCallback((next) => {
    setSharedSyncStatus((prev) => ({
      ...prev,
      ...next,
    }));
  }, []);

  const applySharedSnapshot = useCallback((snapshot, notify = false) => {
    if (!snapshot || typeof snapshot !== "object") return false;

    const currentState = latestStateRef.current;
    if (!shouldApplySharedStateSnapshot(snapshot, currentState)) {
      return false;
    }

    const localSettings = extractLocalSettings(currentState, DEFAULT_SPRINTS);
    const combined = composeStateFromSharedState(snapshot, localSettings, DEFAULT_SPRINTS);
    const saved = saveState(combined, { preserveSavedAt: true });
    latestStateRef.current = saved;
    setState(saved);

    if (notify) {
      showToast("Loaded the latest shared dashboard data.");
    }

    return true;
  }, [showToast]);

  const acknowledgeSharedState = useCallback((payload) => {
    const snapshot = buildSharedStateSnapshot(payload);
    if (snapshot && applySharedSnapshot(snapshot, false)) {
      return;
    }

    setState((prev) => {
      const merged = mergeSharedStateAcknowledgement(prev, payload);
      if (merged === prev) return prev;
      const saved = saveState(merged, { preserveSavedAt: true });
      latestStateRef.current = saved;
      return saved;
    });
  }, [applySharedSnapshot]);

  const pushLatestSharedState = useCallback(async (savedState) => {
    if (!sharedSyncEnabledRef.current || !savedState) return;

    updateSharedSyncStatus({
      mode: "syncing",
      detail: "Pushing the latest dashboard changes...",
    });

    try {
      const payload = await pushSharedDashboardState(
        extractSharedDashboardState(savedState, DEFAULT_SPRINTS),
      );
      sharedSyncPrimedRef.current = true;
      acknowledgeSharedState(payload);
      updateSharedSyncStatus({
        mode: "connected",
        detail: "Connected to the shared dashboard store.",
        pulledAt: Date.now(),
      });
    } catch {
      updateSharedSyncStatus({
        mode: "offline",
        detail: "Could not reach the shared sync server.",
      });
    }
  }, [acknowledgeSharedState, updateSharedSyncStatus]);

  const persistLocal = useCallback((patchOrUpdater) => {
    setState((prev) => {
      const next = mergeState(prev, patchOrUpdater, DEFAULT_SPRINTS);
      const saved = saveState(next, { preserveSavedAt: true });
      latestStateRef.current = saved;
      try {
        syncChannelRef.current?.postMessage({
          type: "state-saved",
          savedAt: saved?.savedAt || 0,
        });
      } catch {
        // noop
      }
      return saved;
    });
  }, []);

  const persist = useCallback((patchOrUpdater) => {
    if (sharedSyncEnabledRef.current && sharedSyncStatus.mode === "offline") {
      showToast("Shared sync is offline. Dashboard changes are blocked until the shared store reconnects.", true);
      return false;
    }

    if (sharedSyncEnabledRef.current && !sharedSyncPrimedRef.current) {
      showToast("Waiting for the shared dashboard to connect before applying changes.", true);
      return false;
    }

    setState((prev) => {
      const next = mergeState(prev, patchOrUpdater, DEFAULT_SPRINTS);
      const sharedState = extractSharedDashboardState(next, DEFAULT_SPRINTS);
      const localSettings = extractLocalSettings(prev, DEFAULT_SPRINTS);
      const combined = composeStateFromSharedState(sharedState, localSettings, DEFAULT_SPRINTS);
      const saved = saveState(combined);
      latestStateRef.current = saved;
      Promise.resolve().then(() => pushLatestSharedState(saved));
      try {
        syncChannelRef.current?.postMessage({
          type: "state-saved",
          savedAt: saved?.savedAt || Date.now(),
        });
      } catch {
        // noop
      }
      return saved;
    });

    return true;
  }, [pushLatestSharedState, sharedSyncStatus.mode, showToast]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const syncLatestSavedState = useCallback((notify = false) => {
    if (sharedSyncEnabledRef.current && !sharedSyncPrimedRef.current) return;

    const loaded = loadState(DEFAULT_SPRINTS);
    if (!loaded) return;

    const currentSavedAt = Number(latestStateRef.current?.savedAt) || 0;
    const loadedSavedAt = Number(loaded.savedAt) || 0;

    if (loadedSavedAt <= currentSavedAt) return;

    latestStateRef.current = loaded;
    setState(loaded);
    if (notify) {
      showToast("Loaded the latest saved dashboard data.");
    }
  }, [showToast]);

  const syncLatestSharedState = useCallback(async (notify = false) => {
    if (!sharedSyncEnabledRef.current) return;

    try {
      const remote = await fetchSharedDashboardState();
      sharedSyncPrimedRef.current = true;
      const bootstrapState = bootstrapSharedStateRef.current;
      const hasBootstrapState = hasMeaningfulSharedDashboardState(bootstrapState, DEFAULT_SPRINTS);

      if (!remote?.snapshot) {
        if (hasBootstrapState) {
          const payload = await pushSharedDashboardState(bootstrapState);
          acknowledgeSharedState(payload);
          updateSharedSyncStatus({
            mode: "connected",
            detail: "Connected to the shared dashboard store.",
            pulledAt: Date.now(),
          });
          if (notify) {
            showToast("Loaded the latest shared dashboard data.");
          }
          return;
        }

        updateSharedSyncStatus({
          mode: "connected",
          detail: "Connected to the shared dashboard store. No remote data yet.",
          pulledAt: Date.now(),
        });
        return;
      }

      if (hasBootstrapState && shouldBootstrapSharedState(bootstrapState, remote.snapshot)) {
        const payload = await pushSharedDashboardState(bootstrapState);
        acknowledgeSharedState(payload);
        updateSharedSyncStatus({
          mode: "connected",
          detail: "Connected to the shared dashboard store.",
          pulledAt: Date.now(),
        });
        if (notify) {
          showToast("Recovered the latest saved dashboard state into the shared store.");
        }
        return;
      }

      updateSharedSyncStatus({
        mode: "connected",
        detail: "Connected to the shared dashboard store.",
        pulledAt: Date.now(),
      });

      applySharedSnapshot(remote.snapshot, notify);
    } catch {
      updateSharedSyncStatus({
        mode: "offline",
        detail: "Could not reach the shared sync server.",
      });
    }
  }, [acknowledgeSharedState, applySharedSnapshot, showToast, updateSharedSyncStatus]);

  useEffect(() => {
    setAIStatus((prev) => ({
      primary: syncProviderStatus(prev.primary, !!state.groqKey),
      fallback: syncProviderStatus(prev.fallback, !!state.cerebrasKey),
    }));
  }, [state.groqKey, state.cerebrasKey]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (!event || event.key == null || event.key === STORE_KEY) {
        syncLatestSavedState(true);
      }
    };

    const handleFocus = () => syncLatestSavedState(false);
    const handlePageShow = () => syncLatestSavedState(false);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncLatestSavedState(false);
      }
    };
    const poll = window.setInterval(() => {
      syncLatestSavedState(false);
    }, 3000);

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncLatestSavedState]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") {
      return undefined;
    }

    const channel = new window.BroadcastChannel(SYNC_CHANNEL_NAME);
    syncChannelRef.current = channel;
    channel.onmessage = (event) => {
      if (event?.data?.type === "state-saved") {
        syncLatestSavedState(true);
      }
    };

    return () => {
      syncChannelRef.current = null;
      channel.close();
    };
  }, [syncLatestSavedState]);

  useEffect(() => {
    if (!sharedSyncEnabledRef.current) {
      return undefined;
    }

    void syncLatestSharedState(false);
    const closeStream = openSharedDashboardStream(() => {
      void syncLatestSharedState(true);
    });
    const poll = window.setInterval(() => {
      void syncLatestSharedState(false);
    }, 5000);
    const handleFocus = () => {
      void syncLatestSharedState(false);
    };
    const handlePageShow = () => {
      void syncLatestSharedState(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncLatestSharedState(false);
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      closeStream?.();
      window.clearInterval(poll);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncLatestSharedState]);

  const activeSprint =
    state.sprints.find((s) => s.num === state.activeSprint) || state.sprints[0];
  const projectProfile = normaliseProjectProfile(state.projectProfile || DEFAULT_PROJECT_PROFILE);
  const nextSprint = getNextSprint(state.sprints, state.activeSprint);
  const projectContext = {
    ...DEFAULT_PROJECT_CONTEXT,
    ...(state.projectContext || {}),
  };
  const displayProjectKey = projectProfile.projectKey || "Project";
  const displayProjectName = projectProfile.projectName || "Run Project setup to load project context";
  const displayEpicKey = projectContext.epic || projectProfile.projectKey || "Project context";
  const displayEpicName = projectContext.epicName || projectProfile.projectName || "Open Project setup to seed epic and sprint context";
  const projectSetupPrompt = buildProjectSetupPrompt(projectProfile, state.sprints, state.sprintSummaries);
  const remoteSyncPending = sharedSyncEnabledRef.current && hasPendingRemoteSync(state);
  const sharedSyncCard = (() => {
    if (!sharedSyncEnabledRef.current) {
      return {
        value: "Local only",
        hint: "Shared sync is disabled in this environment.",
        accent: C.text2,
      };
    }

    if (sharedSyncStatus.mode === "offline") {
      return {
        value: "Offline",
        hint: sharedSyncStatus.pulledAt
          ? `Last successful pull ${formatSyncTimestamp(sharedSyncStatus.pulledAt)}`
          : sharedSyncStatus.detail,
        accent: C.red,
      };
    }

    if (sharedSyncStatus.mode === "syncing" || remoteSyncPending) {
      return {
        value: "Syncing",
        hint: sharedSyncStatus.pulledAt
          ? `Last pull ${formatSyncTimestamp(sharedSyncStatus.pulledAt)}`
          : "Pushing the latest dashboard changes...",
        accent: C.amber,
      };
    }

    if (sharedSyncStatus.mode === "connected") {
      return {
        value: "Connected",
        hint: sharedSyncStatus.pulledAt
          ? `Last pull ${formatSyncTimestamp(sharedSyncStatus.pulledAt)}${state.remoteRevision ? ` · Rev ${state.remoteRevision}` : ""}`
          : "Connected to the shared dashboard store.",
        accent: C.green,
      };
    }

    return {
      value: "Checking",
      hint: sharedSyncStatus.detail || "Checking the shared dashboard connection...",
      accent: C.blue,
    };
  })();
  const sharedSyncLocked =
    sharedSyncEnabledRef.current &&
    (sharedSyncStatus.mode === "offline" || !sharedSyncPrimedRef.current);
  const sharedSyncLockMessage = sharedSyncStatus.mode === "offline"
    ? "Shared dashboard unavailable. This instance is read-only until it reconnects."
    : "Connecting to the shared dashboard. Editing stays locked until the latest shared state is loaded.";
  const sharedSyncLockHint = `Sync endpoint: ${SHARED_STATE_ENDPOINT}`;
  const reviewPromptContext =
    (state.reviewPromptContext || {})[state.activeSprint] || {};
  const recentSprintHistoryForAI = Object.entries(state.sprintSummaries || {})
    .map(([num, summary]) => {
      const setupHistory = summary?.setupHistory || {};
      const metrics = setupHistory?.metrics
        ? [
            setupHistory.metrics.completedPoints != null || setupHistory.metrics.committedPoints != null
              ? `Points ${setupHistory.metrics.completedPoints ?? "—"}/${setupHistory.metrics.committedPoints ?? "—"}`
              : null,
            setupHistory.metrics.completedTickets != null || setupHistory.metrics.committedTickets != null
              ? `Tickets ${setupHistory.metrics.completedTickets ?? "—"}/${setupHistory.metrics.committedTickets ?? "—"}`
              : null,
          ].filter(Boolean).join(" · ")
        : "";

      return {
        num: Number(num),
        label: summary?.label || `Sprint ${num}`,
        outcome:
          setupHistory?.summary ||
          summary?.velocity?.summary ||
          summary?.meetings?.[0]?.summary ||
          summary?.summary ||
          "Outcome not recorded",
        metrics,
      };
    })
    .filter((entry) => Number.isFinite(entry.num))
    .sort((a, b) => b.num - a.num)
    .slice(0, 3);
  const isReference = curMeeting === "reference";
  const isSetup = curMeeting === "setup";
  const meeting = SPECIAL_VIEWS[curMeeting] || MEETINGS[curMeeting] || MEETINGS["standup"];
  const meetingRovoPrompt =
    typeof meeting.rovoPrompt === "function"
      ? meeting.rovoPrompt({
          projectContext,
          projectProfile,
          sprint: activeSprint,
          nextSprint,
        })
      : meeting.rovoPrompt;
  const planningTargetLabel = nextSprint
    ? `Upcoming sprint — ${nextSprint.name}`
    : "Upcoming sprint — not yet set";
  const notesInputTitle =
    curMeeting === "refinement"
      ? "Refinement workspace / meeting notes"
      : isPlanningLikeView(curMeeting)
        ? "Sprint planning / meeting notes"
        : "Meeting notes / transcript";
  const notesInputSub =
    curMeeting === "refinement"
      ? `Paste the refinement discussion for ${nextSprint?.name || "the upcoming sprint"}`
      : curMeeting === "planning"
        ? `Paste the sprint planning discussion for ${nextSprint?.name || "the upcoming sprint"}`
      : meeting.notesLabel;
  const mData = isReference || isSetup ? {} : getMeetingData(state, state.activeSprint, curMeeting);
  const canClearCurrentMeeting =
    !isReference && !isSetup && (!!rovoPaste.trim() || !!notesPaste.trim() || hasMeetingContent(mData));
  const showConnectionTip =
    typeof window !== "undefined" &&
    window.location.protocol === "file:" &&
    !state.connectionTipDismissed;

  const setThemeMode = (mode) => {
    if (mode === themeMode) return;
    persistLocal({ theme: mode });
  };

  const clearCurrentMeeting = useCallback(() => {
    const sprintLabel = activeSprint?.name || `Sprint ${state.activeSprint}`;
    if (!window.confirm(`Clear ${meeting.label} input and saved output for ${sprintLabel}?`)) return;

    const applied = persist((prev) => {
      const key = `${prev.activeSprint}_${curMeeting}`;
      const nextMeetingData = { ...(prev.meetingData || {}) };
      delete nextMeetingData[key];
      return {
        meetingData: nextMeetingData,
      };
    });
    if (!applied) return;

    setFresh({});
    setRovoPaste("");
    setNotes("");
    setRovoSt("");
    setNotesSt("");
    showToast(`${meeting.label} cleared for ${sprintLabel}.`);
  }, [activeSprint, curMeeting, meeting.label, persist, showToast, state.activeSprint]);

  const copyProjectSetupPrompt = useCallback(() => {
    navigator.clipboard.writeText(projectSetupPrompt).then(() => {
      showToast("Project setup prompt copied.");
    }, () => {
      showToast("Project setup prompt could not be copied.", true);
    });
  }, [projectSetupPrompt, showToast]);

  const updateReviewPromptContext = useCallback(
    (patchOrUpdater) => {
      persist((prev) => {
        const sprintKey = prev.activeSprint;
        const current = (prev.reviewPromptContext || {})[sprintKey] || {};
        const patch =
          typeof patchOrUpdater === "function"
            ? patchOrUpdater(current)
            : patchOrUpdater;

        if (!patch || typeof patch !== "object") return {};

        return {
          reviewPromptContext: {
            ...(prev.reviewPromptContext || {}),
            [sprintKey]: {
              ...current,
              ...patch,
            },
          },
        };
      });
    },
    [persist],
  );

  const archiveSprint = useCallback((sprint) => {
    if (!sprint) return;
    if (!window.confirm(`Archive Sprint ${sprint.num}?`)) return;
    const applied = persist((prev) => ({
      sprintSummaries: {
        ...prev.sprintSummaries,
        [sprint.num]: buildSprintArchiveSnapshot(
          prev,
          sprint,
          sprintLabel(sprint),
          new Date().toLocaleDateString("en-GB"),
        ),
      },
    }));
    if (!applied) return;
    showToast(`Sprint ${sprint.num} snapshot archived.`);
  }, [persist, showToast]);

  const endSprint = useCallback((sprint) => {
    if (!sprint) return;
    if (!window.confirm(`End Sprint ${sprint.num}? This will archive the sprint summary and move to the next sprint.`)) return;
    let movedTo = null;
    let movedToLabel = null;
    const applied = persist((prev) => {
      let sorted = [...(prev.sprints || [])].sort((a, b) => a.num - b.num);
      let nextSprint = sorted.find((item) => item.num > sprint.num) || null;
      if (!nextSprint) {
        sorted = generateFutureSprints(sorted, prev.projectProfile, 1);
        nextSprint = sorted.find((item) => item.num > sprint.num) || null;
      }
      movedTo = nextSprint?.num || null;
      movedToLabel = nextSprint?.name || null;
      return {
        sprintSummaries: {
          ...prev.sprintSummaries,
          [sprint.num]: buildSprintArchiveSnapshot(
            prev,
            sprint,
            sprintLabel(sprint),
            new Date().toLocaleDateString("en-GB"),
          ),
        },
        sprints: sorted,
        activeSprint: nextSprint?.num || prev.activeSprint,
      };
    });
    if (!applied) return;
    showToast(
      movedTo
        ? `Sprint ${sprint.num} archived. Switched to ${movedToLabel || `Sprint ${movedTo}`}.`
        : `Sprint ${sprint.num} archived.`,
    );
  }, [persist, showToast]);

  const runProviderTest = useCallback(async () => {
    const groq = document.getElementById("groq-key")?.value.trim() || "";
    const cerebras = document.getElementById("cerebras-key")?.value.trim() || "";
    if (!groq && !cerebras) {
      setProviderTestState({
        loading: false,
        msg: "Add a Groq or Cerebras API key before testing.",
        err: true,
      });
      return;
    }

    setProviderTestState({
      loading: true,
      msg: "Testing providers...",
      err: false,
    });

    try {
      const results = await testProviders(
        { groqKey: groq, cerebrasKey: cerebras },
        (_, __, providers) => {
          if (providers) setAIStatus((prev) => ({ ...prev, ...providers }));
        },
      );

      const parts = [
        results.primary?.ok
          ? "Groq 70B OK"
          : `Groq 70B failed: ${results.primary?.error || "Unknown error"}`,
        results.fallback?.ok
          ? "Cerebras Llama 3.1 8B OK"
          : `Cerebras Llama 3.1 8B failed: ${results.fallback?.error || "Unknown error"}`,
      ];
      const hasError = [results.primary, results.fallback].some((r) => r && !r.ok);
      const msg = parts.join(" · ");
      setProviderTestState({ loading: false, msg, err: hasError });
      showToast(msg, hasError);
    } catch (e) {
      setProviderTestState({
        loading: false,
        msg: e.message,
        err: true,
      });
      showToast(e.message, true);
    }
  }, [showToast]);

  const applyProjectSetup = useCallback(async () => {
    if (!setupPaste.trim()) {
      setSetupStatus("Paste the project setup response first");
      return;
    }
    if (!state.groqKey && !state.cerebrasKey) {
      setModal("api");
      return;
    }

    setSetupLoading(true);
    setSetupStatus("Processing project setup...");
    try {
      let resolvedProvider = "none";
      const onSetupStatus = (provider, msg, providers) => {
        if (providers) setAIStatus((prev) => ({ ...prev, ...providers }));
        if (provider === "groq" || provider === "cerebras") {
          resolvedProvider = provider;
        }
        setSetupStatus(msg);
      };

      let parsed;
      try {
        parsed = await callAI(
          PROJECT_SETUP_SYSTEM_PROMPT,
          setupPaste,
          { groqKey: state.groqKey, cerebrasKey: state.cerebrasKey },
          onSetupStatus,
          {
            groqMaxTokens: 2600,
            cerebrasMaxTokens: 3200,
          },
        );
      } catch (e) {
        if (
          state.cerebrasKey &&
          /truncated|finish_reason=length|response was cut off/i.test(e.message || "")
        ) {
          setSetupStatus("Setup response was too large for the fallback model. Retrying with a compact parser...");
          parsed = await callAI(
            PROJECT_SETUP_COMPACT_SYSTEM_PROMPT,
            setupPaste,
            { groqKey: "", cerebrasKey: state.cerebrasKey },
            onSetupStatus,
            {
              cerebrasMaxTokens: 2600,
            },
          );
          resolvedProvider = "cerebras";
        } else {
          throw e;
        }
      }

      const incomingProfile = normaliseProjectProfile({
        ...(parsed?.projectProfile || {}),
        projectKey: parsed?.projectProfile?.projectKey || parsed?.projectContext?.projectKey || projectProfile.projectKey,
        primaryEpic: parsed?.projectProfile?.primaryEpic || parsed?.projectContext?.epic || projectProfile.primaryEpic,
        primaryEpicName: parsed?.projectProfile?.primaryEpicName || parsed?.projectContext?.epicName || projectProfile.primaryEpicName,
      });
      const projectChanged =
        incomingProfile.projectKey !== projectProfile.projectKey ||
        incomingProfile.primaryEpic !== projectProfile.primaryEpic ||
        incomingProfile.projectName !== projectProfile.projectName;

      if (
        projectChanged &&
        (Object.keys(state.meetingData || {}).length ||
          Object.keys(state.sprintSummaries || {}).length ||
          state.velocityData) &&
        !window.confirm(
          `Switch the dashboard to ${incomingProfile.projectKey || incomingProfile.projectName}? This will clear current meeting data, history, and insights for the existing project.`,
        )
      ) {
        setSetupStatus("Project switch cancelled");
        setSetupLoading(false);
        return;
      }

      const applied = persist((prev) => applyProjectSetupState(prev, parsed, DEFAULT_SPRINTS));
      if (!applied) {
        setSetupStatus("Shared dashboard unavailable. Reconnect before applying setup.");
        setSetupLoading(false);
        return;
      }
      setCur("standup");
      setFresh({});
      setRovoPaste("");
      setNotes("");
      setRovoSt("");
      setNotesSt("");
      setSetupPaste("");
      const setupTicketCount = countSetupTickets(parsed);
      const setupEpicCount = countSetupEpics(parsed);
      const seededSummary =
        setupTicketCount > 0
          ? `Seeded ${setupTicketCount} sprint item${setupTicketCount === 1 ? "" : "s"}${setupEpicCount ? ` across ${setupEpicCount} epic${setupEpicCount === 1 ? "" : "s"}` : ""}`
          : "Project profile and sprint structure updated";
      const providerLabel =
        resolvedProvider === "groq"
          ? "Setup applied with Groq"
          : resolvedProvider === "cerebras"
            ? "Setup applied with Cerebras"
            : "Project setup applied";
      const success = projectChanged
        ? `${providerLabel} · Switched to ${incomingProfile.projectKey || incomingProfile.projectName} · ${seededSummary}`
        : `${providerLabel} · ${seededSummary}`;
      setSetupStatus(success);
      showToast(success);
    } catch (e) {
      setSetupStatus(`Error: ${e.message}`);
      showToast(e.message, true);
    }
    setSetupLoading(false);
  }, [persist, projectProfile, setupPaste, showToast, state]);

  const applyParsed = useCallback(
    (parsed, source) => {
      const ts =
        new Date().toLocaleDateString("en-GB") +
        " " +
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });
      const newFresh = {};
      const mergePolicy = meetingMergePolicy(curMeeting, source);

      const applied = persist((prev) => {
        const next = { ...prev, lastUpdated: ts };
        const key = `${next.activeSprint}_${curMeeting}`;
        const d = getMeetingData(next, next.activeSprint, curMeeting);

        if (mergePolicy.allowMetrics && parsed.metrics) {
          d.metrics = d.metrics || {};
          Object.entries(parsed.metrics).forEach(([k, v]) => {
            if (v != null) d.metrics[k] = v;
          });
        }

        if (Array.isArray(parsed.questions)) {
          const clean = dedupeItems(
            parsed.questions
              .map((q) => {
                if (!q || q === "undefined") return null;
                if (typeof q === "string") return textValue(q);
                const question = questionText(q);
                if (!question) return null;
                return {
                  ...q,
                  question,
                  target: textValue(q.target),
                  why: textValue(q.why),
                  needed: textValue(q.needed),
                  ts,
                  source,
                };
              })
              .filter(Boolean),
            questionSignature,
          );
          d.questions = clean;
          newFresh.questions = clean;
        }

        const formatFieldItems = (field) =>
          (parsed[field] || []).map((x) =>
            typeof x === "string" ? x : { ...x, ts, source },
          );

        const normaliseFieldItems = (field, items) => {
          if (!Array.isArray(items)) return items;
          if (field === "actions") return dedupeItems(items, actionSignature);
          if (field === "nextSteps") return dedupeItems(items, nextStepSignature);
          if (field === "decisions") return dedupeItems(items, decisionSignature);
          if (field === "risks") return dedupeItems(items, riskSignature);
          if (field === "notes") return dedupeItems(items, noteSignature);
          return items;
        };

        const appendField = (field) => {
          if (!parsed[field]?.length) return;
          const items = formatFieldItems(field);
          d[field] = normaliseFieldItems(field, [...(d[field] || []), ...items]);
          newFresh[field] = items;
        };

        const overwriteField = (field) => {
          if (!Array.isArray(parsed[field])) return;
          const items = normaliseFieldItems(field, formatFieldItems(field));
          d[field] = items;
          newFresh[field] = items;
        };

        mergePolicy.overwriteFields.forEach(overwriteField);
        mergePolicy.appendFields.forEach(appendField);

        if (mergePolicy.allowProjectContext) {
          const nextProjectContext = deriveProjectContext(
            parsed,
            next.projectContext || DEFAULT_PROJECT_CONTEXT,
            next.sprints.find((s) => s.num === next.activeSprint),
          );
          next.projectContext = {
            projectKey: nextProjectContext.projectKey,
            epic: nextProjectContext.epic,
            epicName: nextProjectContext.epicName,
          };

          if (mergePolicy.allowSprintRename && nextProjectContext.sprintName) {
            next.sprints = (next.sprints || []).map((s) =>
              s.num === next.activeSprint
                ? { ...s, name: nextProjectContext.sprintName }
                : s,
            );
          }
        }

        if (parsed.slides?.length) {
          const ns = parsed.slides.filter((s) => !(d.slides || []).includes(s));
          d.slides = [...(d.slides || []), ...ns];
          newFresh.slides = ns;
        }
        if (parsed.sprintGoal) d.sprintGoal = parsed.sprintGoal;
        if (parsed.ragStatus) d.ragStatus = parsed.ragStatus;
        if (parsed.ragReason) d.ragReason = parsed.ragReason;
        if (parsed.scopeBoundaries) d.scopeBoundaries = parsed.scopeBoundaries;
        if (parsed.summary && (mergePolicy.allowSummaryOverwrite || !d.summary)) {
          d.summary = parsed.summary;
        }

        d.log = [
          ...(d.log || []),
          {
            meeting: meeting.label,
            source,
            date: ts,
            summary: parsed.summary || "Updated",
          },
        ];
        next.meetingData = { ...next.meetingData, [key]: d };
        return next;
      });
      if (!applied) return null;

      setFresh(newFresh);
      return parsed.summary;
    },
    [curMeeting, meeting, persist],
  );

  const runCapture = useCallback(
    async (tool) => {
      const text = tool === "rovo" ? rovoPaste : notesPaste;
      const setStatus = tool === "rovo" ? setRovoSt : setNotesSt;
      const setLoad = tool === "rovo" ? setRovoL : setNotesL;

      if (!text.trim()) {
        setStatus("Paste content above first");
        return;
      }
      if (!state.groqKey && !state.cerebrasKey) {
        setModal("api");
        return;
      }

      setLoad(true);
      setStatus("Processing...");
      try {
        let resolvedProvider = "none";
        const promptTemplate =
          tool === "notes" && meeting.notesSystemPrompt
            ? { ...meeting, systemPrompt: meeting.notesSystemPrompt }
            : meeting;
        const ctx = buildContext(promptTemplate, activeSprint, {
          ...projectProfile,
          epic: projectContext.epic,
          name: projectContext.epicName || projectProfile.projectName,
          nextSprint,
          recentSprintHistory: recentSprintHistoryForAI,
          lastUpdated: state.lastUpdated,
        });
        const parsed = await callAI(
          ctx,
          text,
          { groqKey: state.groqKey, cerebrasKey: state.cerebrasKey },
          (provider, msg, providers) => {
            if (providers) setAIStatus((prev) => ({ ...prev, ...providers }));
            if (provider === "groq" || provider === "cerebras") {
              resolvedProvider = provider;
              persistLocal({ apiProvider: provider });
            }
            setStatus(msg);
          },
        );
        const summary = applyParsed(
          parsed,
          tool === "rovo" ? "Rovo/Jira" : "Meeting notes",
        );
        tool === "rovo" ? setRovoPaste("") : setNotes("");
        const providerLabel =
          resolvedProvider === "groq"
            ? "Updated with Groq"
            : resolvedProvider === "cerebras"
              ? "Updated with Cerebras"
              : "Dashboard updated";
        const successMessage = summary
          ? `${providerLabel} · ${summary}`
          : providerLabel;
        setStatus(successMessage);
        showToast(successMessage);
      } catch (e) {
        persistLocal({ apiProvider: "none" });
        setStatus("Error: " + e.message);
        showToast(e.message, true);
      }
      setLoad(false);
    },
    [rovoPaste, notesPaste, state, meeting, activeSprint, nextSprint, persistLocal, applyParsed, projectContext.epic, projectContext.epicName, projectProfile, recentSprintHistoryForAI, showToast],
  );

  const switchMeeting = (id) => {
    setCur(id);
    setFresh({});
    setRovoPaste("");
    setNotes("");
    setRovoSt("");
    setNotesSt("");
    if (id !== "setup") {
      setSetupStatus("");
    }
  };

  const apiLabel = () => {
    if (aiStatus.primary?.state === "active") return "Powered by Groq";
    if (aiStatus.fallback?.state === "active") return "Powered by Cerebras";
    if (aiStatus.primary?.state === "working" || aiStatus.fallback?.state === "working") {
      return "Checking providers";
    }
    if (
      ["failed", "rate_limited", "no_key"].includes(aiStatus.primary?.state) &&
      ["failed", "rate_limited", "no_key"].includes(aiStatus.fallback?.state)
    ) {
      return "No provider responded";
    }
    if (state.apiProvider === "groq") return "Powered by Groq";
    if (state.apiProvider === "cerebras") return "Powered by Cerebras";
    return state.groqKey || state.cerebrasKey ? "Keys saved" : "No API key";
  };
  const apiDot = () => {
    if (aiStatus.primary?.state === "active") return "#f59e0b";
    if (aiStatus.fallback?.state === "active") return "#4ade80";
    if (aiStatus.primary?.state === "working" || aiStatus.fallback?.state === "working") {
      return "#fdba74";
    }
    if (
      ["failed", "rate_limited", "no_key"].includes(aiStatus.primary?.state) &&
      ["failed", "rate_limited", "no_key"].includes(aiStatus.fallback?.state)
    ) {
      return "#f87171";
    }
    if (state.apiProvider === "groq") return "#f59e0b";
    if (state.apiProvider === "cerebras") return "#4ade80";
    return C.text2;
  };

  const NAV = [
    {
      section: "Ceremonies",
      items: [
        ["reference", "Sprint detail", "#0f766e"],
        ["standup", "Daily standup", "#2563eb"],
        ["refinement", "Refinement", "#22c55e"],
        ["planning", "Sprint planning", "#16a34a"],
        ["review", "Sprint review", "#d97706"],
        ["retro", "Retrospective", "#dc2626"],
      ],
    },
    {
      section: "Stakeholder",
      items: [
        ["discovery", "RPA discovery call", "#0891b2"],
        ["stakeholder", "Stakeholder update", "#7c3aed"],
      ],
    },
    {
      section: "Planning",
      items: [["insights", "Velocity & insights", "#8b5cf6"]],
    },
  ];

  const isInsights = curMeeting === "insights";
  const workspaceAvailable = !isReference && !isSetup && (meeting.useRovo || meeting.useNotes);
  const currentPageTitle = isSetup
    ? "Project setup"
    : isInsights
      ? "Velocity & insights"
      : curMeeting === "reference"
        ? "Sprint detail dashboard"
        : curMeeting === "refinement"
          ? "Refinement dashboard"
          : curMeeting === "planning"
            ? "Sprint planning dashboard"
            : `${meeting.label} dashboard`;
  const currentPageSubtitle = isSetup
    ? "Set up the dashboard once here, then use the ceremony pages for focused working updates. This page keeps the setup prompt, instructions, and response box together."
    : isInsights
      ? "Review recent sprint performance, current commitment, and coaching signals in one place."
      : isReference
        ? "A simplified sprint snapshot that rolls the key current-sprint context into a single view."
        : workspaceAvailable
          ? "Capture the latest ceremony context and review the dashboard without splitting the page into separate editor and output columns."
          : "Review the latest sprint context and supporting notes in a calmer, content-first layout.";
  const captureSourceLabel = isSetup
    ? "Setup prompt"
    : isReference
      ? "Reference only"
      : meeting.useRovo && meeting.useNotes
        ? "Rovo + meeting notes"
        : meeting.useRovo
          ? "Rovo only"
          : meeting.useNotes
            ? "Meeting notes"
            : "Dashboard only";
  const shellBackground = themeMode === "light"
    ? "#f6f8fc"
    : "radial-gradient(circle at top left, rgba(20,25,34,0.98), rgba(11,15,22,0.94) 42%, rgba(7,10,15,0.98) 100%)";
  const frameBackground = themeMode === "light"
    ? "#f6f8fc"
    : "rgba(10,14,20,0.72)";
  const pageEyebrow = isSetup ? "Setup page" : isInsights ? "Performance view" : "Sprint workspace";
  const statusCardHint = state.lastUpdated
    ? `Updated ${state.lastUpdated}`
    : "No updates captured yet";

  return (
    <div
      className="app-shell"
      style={{
        ...themeVars,
        background: shellBackground,
        color: C.text0,
        fontSize: "13px",
        fontFamily: '"Avenir Next", "Segoe UI Variable Text", "Segoe UI", sans-serif',
        colorScheme: themeMode,
      }}
      data-theme={themeMode}
    >
      <div
        className="app-frame"
        style={{
          background: frameBackground,
          border: `1px solid ${C.bd}`,
          boxShadow: themeMode === "light"
            ? "0 32px 80px rgba(15,23,42,0.12)"
            : "0 30px 80px rgba(0,0,0,0.44)",
          backdropFilter: "blur(18px)",
        }}
      >
        <aside
          className="app-rail"
          style={{
            background: themeMode === "light"
              ? alphaColor("#ffffff", 0.82)
              : alphaColor(C.bg1, 0.96),
            borderRight: `1px solid ${C.bd}`,
          }}
        >
          <div
            style={{
              padding: "18px 18px 20px",
              borderRadius: "24px",
              background: themeMode === "light"
                ? "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(245,247,252,0.92))"
                : "linear-gradient(180deg, rgba(22,28,39,0.98), rgba(14,19,28,0.94))",
              border: `1px solid ${C.bd}`,
              boxShadow: `0 20px 34px ${alphaColor("#0f172a", 0.08)}`,
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: "800",
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: C.text2,
                marginBottom: "10px",
              }}
            >
              Scrum Intelligence
            </div>
            <div style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.04em", marginBottom: "8px" }}>
              {displayProjectKey}
            </div>
            <div style={{ fontSize: "13px", color: C.text1, lineHeight: 1.6 }}>
              {displayProjectName}
            </div>
          </div>

          <div style={{ marginTop: "18px" }}>
            <ShellButton
              onClick={() => switchMeeting("setup")}
              tone={isSetup ? "primary" : "neutral"}
              style={{ width: "100%", textAlign: "left", padding: "13px 14px" }}
            >
              Project setup
            </ShellButton>
          </div>

          <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {NAV.map(({ section, items }) => (
              <div key={section} className="app-rail-section">
                <div
                  style={{
                    padding: "0 8px",
                    fontSize: "11px",
                    fontWeight: "800",
                    color: C.text2,
                    textTransform: "uppercase",
                    letterSpacing: ".08em",
                  }}
                >
                  {section}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {items.map(([id, label, color]) => (
                    <RailNavItem
                      key={id}
                      label={label}
                      color={color}
                      active={curMeeting === id}
                      onClick={() => switchMeeting(id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "auto",
              paddingTop: "22px",
              borderTop: `1px solid ${C.bd}`,
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: "800",
                color: C.text2,
                textTransform: "uppercase",
                letterSpacing: ".08em",
              }}
            >
              Controls
            </div>
            <ShellButton onClick={() => setModal("api")} style={{ width: "100%", textAlign: "left" }}>
              API keys
            </ShellButton>
            <ShellButton
              onClick={() => {
                if (window.confirm("Clear dashboard data? Saved API keys and settings will be kept.")) {
                  const applied = persist((prev) => clearDashboardData(prev, DEFAULT_SPRINTS));
                  if (!applied) return;
                  setFresh({});
                  setRovoPaste("");
                  setNotes("");
                  setRovoSt("");
                  setNotesSt("");
                  showToast("Dashboard data cleared. API keys kept.");
                }
              }}
              tone="danger"
              style={{ width: "100%", textAlign: "left" }}
            >
              Clear data
            </ShellButton>
            <div
              style={{
                marginTop: "8px",
                padding: "14px 2px 0",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: "700", color: C.text0 }}>
                {projectProfile.projectLabel || "Project"}
              </div>
              <div style={{ fontSize: "12px", color: C.text1, lineHeight: 1.6 }}>
                {displayEpicKey}
                {projectContext.epicName ? ` · ${projectContext.epicName}` : projectProfile.projectName ? ` · ${projectProfile.projectName}` : ""}
              </div>
            </div>
          </div>
        </aside>

        <section className="app-main" style={{ background: "transparent" }}>
          <div className="app-main-scroll">
            {showConnectionTip && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "12px 16px",
                  marginBottom: "18px",
                  border: `1px solid ${alphaColor(C.amber, 0.24)}`,
                  borderRadius: "18px",
                  background: C.amberBg,
                  color: "#fdba74",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: "800",
                      padding: "4px 8px",
                      borderRadius: "999px",
                      background: alphaColor("#fb923c", 0.16),
                      color: "#fdba74",
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Connection Tip
                  </span>
                  <span style={{ fontSize: "12px", lineHeight: 1.5 }}>
                    If data fails to load, ensure your CORS Unblock browser extension is enabled.
                  </span>
                </div>
                <ShellButton
                  onClick={() => persistLocal({ connectionTipDismissed: true })}
                  tone="subtle"
                  style={{ padding: "7px 12px", borderRadius: "10px" }}
                >
                  Dismiss
                </ShellButton>
              </div>
            )}

            <div className="app-page-header">
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: "800",
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    color: C.text2,
                    marginBottom: "10px",
                  }}
                >
                  {pageEyebrow}
                </div>
                <div style={{ fontSize: "40px", lineHeight: 1, fontWeight: "800", letterSpacing: "-0.05em" }}>
                  {currentPageTitle}
                </div>
                <div style={{ fontSize: "14px", color: C.text1, lineHeight: 1.65, marginTop: "10px", maxWidth: "820px" }}>
                  {currentPageSubtitle}
                </div>
                {isPlanningLikeView(curMeeting) && (
                  <div
                    style={{
                      marginTop: "12px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "11px",
                      fontWeight: "700",
                      color: "#86efac",
                      background: C.greenBg,
                      border: `1px solid ${alphaColor("#22c55e", 0.22)}`,
                      borderRadius: "999px",
                      padding: "6px 11px",
                    }}
                  >
                    {planningTargetLabel}
                  </div>
                )}
              </div>

              <div className="app-page-actions">
                {isSetup ? (
                  <ShellButton onClick={() => setModal("api")}>
                    API keys
                  </ShellButton>
                ) : (
                  <>
                    <ShellButton onClick={() => setModal("history")}>
                      History
                    </ShellButton>
                    <ShellButton onClick={() => endSprint(activeSprint)} tone="warning">
                      End sprint
                    </ShellButton>
                  </>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: `1px solid ${C.bd}`,
                    borderRadius: "14px",
                    overflow: "hidden",
                    background: C.bg2,
                    boxShadow: `0 12px 24px ${alphaColor("#0f172a", 0.04)}`,
                  }}
                >
                  {[
                    ["dark", "Dark"],
                    ["light", "Light"],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={themeMode === mode}
                      onClick={() => setThemeMode(mode)}
                      style={{
                        fontSize: "12px",
                        padding: "10px 14px",
                        border: "none",
                        borderRight: mode === "dark" ? `1px solid ${C.bd}` : "none",
                        background: themeMode === mode ? C.bg3 : "transparent",
                        color: themeMode === mode ? C.text0 : C.text1,
                        cursor: "pointer",
                        fontWeight: themeMode === mode ? "700" : "600",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {toast.show && (
              <div
                style={{
                  marginBottom: "18px",
                  padding: "10px 14px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: "600",
                  background: toast.err ? C.redBg : C.blueBg,
                  color: toast.err ? "#f87171" : "#93c5fd",
                  border: `1px solid ${toast.err ? C.red : C.blue}`,
                }}
              >
                {toast.msg}
              </div>
            )}

            {sharedSyncLocked && (
              <div
                style={{
                  marginBottom: "18px",
                  padding: "14px 16px",
                  borderRadius: "18px",
                  background: sharedSyncStatus.mode === "offline" ? C.redBg : C.blueBg,
                  border: `1px solid ${sharedSyncStatus.mode === "offline" ? C.red : C.blue}`,
                  color: sharedSyncStatus.mode === "offline" ? "#fda4af" : "#93c5fd",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: "800", letterSpacing: ".08em", textTransform: "uppercase" }}>
                  Shared dashboard required
                </div>
                <div style={{ fontSize: "13px", fontWeight: "700", marginTop: "6px" }}>
                  {sharedSyncLockMessage}
                </div>
                <div style={{ fontSize: "12px", lineHeight: 1.6, marginTop: "6px", color: C.text1 }}>
                  {sharedSyncLockHint}
                </div>
              </div>
            )}

            {!isSetup && (
              <>
                <div className="app-filter-grid">
                  <SummaryFilterCard
                    label="Sprint"
                    value={activeSprint ? activeSprint.name : "No sprint"}
                    hint={activeSprint ? `${activeSprint.start} to ${activeSprint.end}` : "Open project setup to seed sprint context"}
                    accent={C.amber}
                    onClick={() => setModal("sprints")}
                  />
                  <SummaryFilterCard
                    label="Epic"
                    value={displayEpicKey}
                    hint={displayEpicName}
                    accent={C.blue}
                    onClick={() => switchMeeting("setup")}
                  />
                  <SummaryFilterCard
                    label="Capture"
                    value={captureSourceLabel}
                    hint={statusCardHint}
                    accent={apiDot()}
                  />
                  <SummaryFilterCard
                    label="Last updated"
                    value={state.lastUpdated || "No saved updates yet"}
                    hint="Latest shared dashboard data across connected instances"
                    accent={state.lastUpdated ? C.green : C.text2}
                  />
                  <SummaryFilterCard
                    label="Shared sync"
                    value={sharedSyncCard.value}
                    hint={sharedSyncCard.hint}
                    accent={sharedSyncCard.accent}
                  />
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "18px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "12px",
                      padding: "10px 14px",
                      borderRadius: "999px",
                      border: `1px solid ${C.bd}`,
                      color: C.text0,
                      background: C.bg2,
                      boxShadow: `0 12px 24px ${alphaColor("#0f172a", 0.04)}`,
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: apiDot(),
                        flexShrink: 0,
                      }}
                    />
                    {apiLabel()}
                  </div>
                  <ProviderStatusChip name="Groq 70B" info={aiStatus.primary} />
                  <ProviderStatusChip name="Cerebras Llama 3.1 8B" info={aiStatus.fallback} />
                </div>
              </>
            )}

            {isSetup ? (
              <ProjectSetupPage
                projectProfile={projectProfile}
                projectContext={projectContext}
                projectSetupPrompt={projectSetupPrompt}
                setupPaste={setupPaste}
                setSetupPaste={setSetupPaste}
                setupStatus={setupStatus}
                setupLoading={setupLoading}
                state={state}
                copyProjectSetupPrompt={copyProjectSetupPrompt}
                applyProjectSetup={applyProjectSetup}
                onOpenReference={() => switchMeeting("reference")}
              />
            ) : isInsights ? (
              <Insights
                state={state}
                persist={persist}
                onAIStatusChange={(providers) => {
                  if (providers) setAIStatus((prev) => ({ ...prev, ...providers }));
                }}
              />
            ) : (
              <div className="app-dashboard-stack">
                {workspaceAvailable && (
                  <div
                    style={{
                      background: C.panel2,
                      border: `1px solid ${C.bd}`,
                      borderRadius: "26px",
                      padding: "18px",
                      boxShadow: `0 24px 46px ${alphaColor("#0f172a", 0.07)}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginBottom: "14px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "17px", fontWeight: "700", color: C.text0 }}>
                          Capture updates
                        </div>
                        <div style={{ fontSize: "12px", color: C.text1, lineHeight: 1.6, marginTop: "4px" }}>
                          Copy the prompt if needed, then paste the response or meeting notes directly below. No extra open-input step.
                        </div>
                      </div>
                    </div>
                    <div className="app-workspace-grid">
                      {meeting.useRovo && (
                        <InputBlock
                          iconBg="#0052cc"
                          iconLabel="J"
                          title="Jira Rovo Chat"
                          sub={meeting.rovoLabel}
                          copyText={meetingRovoPrompt}
                          copyLabel="Copy Rovo Prompt"
                          paste={rovoPaste}
                          onPaste={setRovoPaste}
                          pastePlaceholder="Paste the Rovo response here..."
                          status={rovoStatus}
                          loading={rovoLoading}
                          onProcess={() => runCapture("rovo")}
                          btnBg="#0052cc"
                        />
                      )}
                      {meeting.useNotes && (
                        <InputBlock
                          iconBg="#0e9488"
                          iconLabel="H"
                          title={notesInputTitle}
                          sub={notesInputSub}
                          copyText={null}
                          paste={notesPaste}
                          onPaste={setNotes}
                          pastePlaceholder="Paste meeting notes, transcript, or summary here..."
                          status={notesStatus}
                          loading={notesLoading}
                          onProcess={() => runCapture("notes")}
                          btnBg="#0e9488"
                        />
                      )}
                    </div>
                  </div>
                )}

                {curMeeting === "review" && (
                  <div
                    style={{
                      background: C.panel2,
                      border: `1px solid ${C.bd}`,
                      borderRadius: "26px",
                      padding: "18px",
                      boxShadow: `0 24px 46px ${alphaColor("#0f172a", 0.07)}`,
                    }}
                  >
                    <SprintReviewToolkit
                      colors={C}
                      sprint={activeSprint}
                      projectProfile={projectProfile}
                      projectContext={projectContext}
                      value={reviewPromptContext}
                      onChange={updateReviewPromptContext}
                      onToast={showToast}
                    />
                  </div>
                )}

                <div
                  style={{
                    background: C.panel2,
                    border: `1px solid ${C.bd}`,
                    borderRadius: "28px",
                    padding: "20px",
                    boxShadow: `0 28px 56px ${alphaColor("#0f172a", 0.08)}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "16px",
                      flexWrap: "wrap",
                      marginBottom: "18px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "800", color: C.text2, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "8px" }}>
                        Dashboard
                      </div>
                      <div style={{ fontSize: "22px", fontWeight: "800", color: C.text0, lineHeight: 1.1 }}>
                        {isReference ? "Current sprint snapshot" : meeting.label}
                      </div>
                      <div style={{ fontSize: "12px", color: C.text1, marginTop: "8px" }}>
                        {state.lastUpdated ? `Updated ${state.lastUpdated}` : "No updates yet"}
                      </div>
                    </div>
                    {!isReference && (
                      <ShellButton
                        onClick={clearCurrentMeeting}
                        tone="danger"
                        disabled={!canClearCurrentMeeting}
                      >
                        Clear this tab
                      </ShellButton>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <MeetingDashboard id={curMeeting} data={mData} fresh={fresh} sprint={activeSprint} jiraBase={state.jiraBase} nextSprint={nextSprint} state={state} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* API Modal */}
      {modal === "api" && (
        <Modal onClose={() => setModal(null)}>
          <div
            style={{
              fontSize: "15px",
              fontWeight: "600",
              marginBottom: "16px",
            }}
          >
            API keys
          </div>
          {[
            [
              "groq-key",
              "Groq (free-tier friendly)",
              "gsk_...",
              "Primary provider. Uses Groq 70B first. Get a free key at console.groq.com.",
              state.groqKey,
              "password",
            ],
            [
              "cerebras-key",
              "Cerebras (free hobbyist fallback)",
              "csk_...",
              "Fallback provider. Uses llama3.1-8b on Cerebras free tier. Get a free key from cloud.cerebras.ai.",
              state.cerebrasKey || "",
              "password",
            ],
            [
              "jira-base",
              "Jira base URL (optional — enables ticket links)",
              "https://yourorg.atlassian.net/browse",
              "Ticket IDs become clickable links — leave blank to disable",
              state.jiraBase || "",
              "text",
            ],
          ].map(([id, label, ph, hint, val, type]) => (
            <div key={id} style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  color: C.text1,
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                {label}
              </label>
              <input
                id={id}
                type={type}
                defaultValue={val}
                placeholder={ph}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  padding: "8px 10px",
                  border: `1px solid ${C.bd2}`,
                  borderRadius: "6px",
                  background: C.bg0,
                  color: C.text0,
                  outline: "none",
                  fontFamily: "monospace",
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{ fontSize: "11px", color: C.text2, marginTop: "4px" }}
              >
                {hint}
              </div>
            </div>
          ))}
          {providerTestState.msg && (
            <div
              style={{
                marginTop: "4px",
                padding: "10px 12px",
                borderRadius: "8px",
                fontSize: "11px",
                lineHeight: "1.5",
                background: providerTestState.err ? C.redBg : C.greenBg,
                color: providerTestState.err ? "#f87171" : "#4ade80",
                border: `1px solid ${providerTestState.err ? C.red : C.green}`,
              }}
            >
              {providerTestState.msg}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            <button
              style={{
                fontSize: "12px",
                padding: "8px 16px",
                border: "none",
                borderRadius: "6px",
                background: C.blue,
                color: "#fff",
                cursor: "pointer",
                fontWeight: "600",
              }}
              onClick={() => {
                const gr = document.getElementById("groq-key").value.trim();
                const ce = document.getElementById("cerebras-key").value.trim();
                const jira = document.getElementById("jira-base").value.trim().replace(/\/$/, "");
                setProviderTestState({ loading: false, msg: "", err: false });
                setAIStatus({
                  primary: syncProviderStatus(null, !!gr),
                  fallback: syncProviderStatus(null, !!ce),
                });
                persistLocal({
                  groqKey: gr,
                  cerebrasKey: ce,
                  jiraBase: jira,
                  apiProvider: gr ? "groq" : ce ? "cerebras" : "none",
                });
                setModal(null);
                setRovoSt("Keys saved — ready");
              }}
            >
              Save keys
            </button>
            <button
              style={{
                fontSize: "12px",
                padding: "8px 16px",
                border: `1px solid ${C.bd}`,
                borderRadius: "6px",
                background: "transparent",
                color: C.text0,
                cursor: providerTestState.loading ? "default" : "pointer",
                opacity: providerTestState.loading ? 0.6 : 1,
              }}
              disabled={providerTestState.loading}
              onClick={runProviderTest}
            >
              {providerTestState.loading ? "Testing..." : "Test providers"}
            </button>
            <button
              style={{
                fontSize: "12px",
                padding: "8px 16px",
                border: `1px solid ${C.bd}`,
                borderRadius: "6px",
                background: "transparent",
                color: C.text1,
                cursor: "pointer",
              }}
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Sprints Modal */}
      {modal === "sprints" && (
        <Modal onClose={() => setModal(null)}>
          <div
            style={{
              fontSize: "15px",
              fontWeight: "600",
              marginBottom: "16px",
            }}
          >
            Sprint management
          </div>
          {state.sprints.map((s) => (
            <div
              key={s.num}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 0",
                borderBottom: `1px solid ${C.bd}`,
                fontSize: "12px",
                gap: "8px",
              }}
            >
              <span>{sprintLabel(s)}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                {s.num !== state.activeSprint ? (
                  <button
                    style={{
                      fontSize: "11px",
                      padding: "3px 10px",
                      border: `1px solid ${C.bd}`,
                      borderRadius: "4px",
                      background: "transparent",
                    color: C.text1,
                    cursor: "pointer",
                  }}
                    onClick={() => persist({ activeSprint: s.num })}
                  >
                    Set active
                  </button>
                ) : (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#4ade80",
                      fontWeight: "600",
                    }}
                  >
                    Active
                  </span>
                )}
                <button
                  style={{
                    fontSize: "11px",
                    padding: "3px 10px",
                    border: `1px solid ${C.bd}`,
                    borderRadius: "4px",
                    background: "transparent",
                    color: C.text1,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    archiveSprint(s);
                  }}
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
          <div
            style={{
              marginTop: "14px",
              paddingTop: "12px",
              borderTop: `1px solid ${C.bd}`,
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: C.text1,
                marginBottom: "8px",
              }}
            >
              Add sprint
            </div>
            {[
              ["s-num", "Sprint number", "number", "6"],
              ["s-start", "Start date", "date", ""],
              ["s-end", "End date", "date", ""],
            ].map(([id, label, type, ph]) => (
              <div key={id} style={{ marginBottom: "8px" }}>
                <label
                  style={{
                    fontSize: "11px",
                    color: C.text2,
                    display: "block",
                    marginBottom: "3px",
                  }}
                >
                  {label}
                </label>
                <input
                  id={id}
                  type={type}
                  placeholder={ph}
                  style={{
                    width: "100%",
                    fontSize: "12px",
                    padding: "6px 9px",
                    border: `1px solid ${C.bd}`,
                    borderRadius: "6px",
                    background: C.bg0,
                    color: C.text0,
                    outline: "none",
                  }}
                />
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "12px",
              flexWrap: "wrap",
            }}
          >
            <button
              style={{
                fontSize: "12px",
                padding: "7px 14px",
                border: "none",
                borderRadius: "6px",
                background: C.blue,
                color: "#fff",
                cursor: "pointer",
                fontWeight: "600",
              }}
              onClick={() => {
                const num = parseInt(document.getElementById("s-num").value);
                const start = document.getElementById("s-start").value;
                const end = document.getElementById("s-end").value;
                if (!num || !start || !end) return;
                if (state.sprints.find((s) => s.num === num)) {
                  alert("Already exists");
                  return;
                }
                persist((prev) => ({
                  sprints: [
                    ...prev.sprints,
                    { num, name: buildSprintName(projectProfile, num), start, end },
                  ].sort((a, b) => a.num - b.num),
                }));
              }}
            >
              Add
            </button>
            <button
              style={{
                fontSize: "12px",
                padding: "7px 14px",
                border: `1px solid ${C.bd}`,
                borderRadius: "6px",
                background: C.amberBg,
                color: "#fb923c",
                cursor: "pointer",
                fontWeight: "600",
              }}
              onClick={() => {
                persist((prev) => ({
                  sprints: generateFutureSprints(prev.sprints, prev.projectProfile, 6),
                }));
              }}
            >
              Auto-generate next 6
            </button>
            <button
              style={{
                fontSize: "12px",
                padding: "7px 14px",
                border: `1px solid ${C.bd}`,
                borderRadius: "6px",
                background: "transparent",
                color: C.text1,
                cursor: "pointer",
              }}
              onClick={() => setModal(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* History Modal */}
      {modal === "history" && (
        <Modal onClose={() => setModal(null)}>
          <div
            style={{
              fontSize: "15px",
              fontWeight: "600",
              marginBottom: "16px",
            }}
          >
            Sprint history
          </div>
          {Object.keys(state.sprintSummaries || {}).length === 0 ? (
            <div style={{ fontSize: "12px", color: C.text2 }}>
              No archived sprints yet.
            </div>
          ) : (
            Object.entries(state.sprintSummaries)
              .reverse()
              .map(([k, s]) => (
                <div
                  key={k}
                  style={{
                    border: `1px solid ${C.bd}`,
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "2px",
                    }}
                  >
                    {s.label}
                  </div>
                  <div style={{ fontSize: "11px", color: C.text2 }}>
                    Archived {s.archivedAt}
                  </div>
                  {s.projectContext?.epic && (
                    <div style={{ fontSize: "11px", color: C.text1, marginTop: "6px" }}>
                      {s.projectContext.epic}
                      {s.projectContext.epicName ? ` · ${s.projectContext.epicName}` : ""}
                    </div>
                  )}
                  {s.setupHistory && (
                    <div style={{ marginTop: "10px", fontSize: "12px", lineHeight: "1.5" }}>
                      <div style={{ fontWeight: "600", color: C.text0 }}>
                        Imported sprint context
                      </div>
                      {s.setupHistory.goal && (
                        <div style={{ color: C.text1 }}>
                          Goal: {s.setupHistory.goal}
                        </div>
                      )}
                      {s.setupHistory.status && (
                        <div style={{ color: C.text2, marginTop: "3px" }}>
                          Outcome: {s.setupHistory.status}
                        </div>
                      )}
                      {s.setupHistory.metrics && (
                        <div style={{ color: C.text2, marginTop: "3px" }}>
                          Points {s.setupHistory.metrics.completedPoints ?? "—"}/{s.setupHistory.metrics.committedPoints ?? "—"} · Tickets {s.setupHistory.metrics.completedTickets ?? "—"}/{s.setupHistory.metrics.committedTickets ?? "—"}
                        </div>
                      )}
                    </div>
                  )}
                  {(s.meetings || []).length > 0 && (
                    <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(s.meetings || []).map((meeting) => (
                        <div key={meeting.id} style={{ fontSize: "12px", lineHeight: "1.5" }}>
                          <div style={{ fontWeight: "600", color: C.text0 }}>
                            {meeting.label}
                          </div>
                          <div style={{ color: C.text1 }}>
                            {meeting.summary}
                          </div>
                          {meeting.updatedAt && (
                            <div style={{ fontSize: "11px", color: C.text2, marginTop: "2px" }}>
                              Updated {meeting.updatedAt}
                            </div>
                          )}
                          {(meeting.highlights || []).length > 0 && (
                            <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                              {(meeting.highlights || []).map((item) => (
                                <div key={item} style={{ color: C.text1 }}>
                                  • {item}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {s.velocity && (
                    <div style={{ marginTop: "10px", fontSize: "12px", lineHeight: "1.5" }}>
                      <div style={{ fontWeight: "600", color: C.text0 }}>
                        Velocity & insights
                      </div>
                      {s.velocity.summary && (
                        <div style={{ color: C.text1 }}>
                          {s.velocity.summary}
                        </div>
                      )}
                      {s.velocity.recommendation && (
                        <div style={{ color: C.text2, marginTop: "3px" }}>
                          Recommendation: {s.velocity.recommendation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
          )}
          <div style={{ marginTop: "14px" }}>
            <button
              style={{
                fontSize: "12px",
                padding: "7px 14px",
                border: `1px solid ${C.bd}`,
                borderRadius: "6px",
                background: "transparent",
                color: C.text1,
                cursor: "pointer",
              }}
              onClick={() => setModal(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

import { buildContext, callAI } from "./api";
import { hasAnyAIKey } from "./aiProviders";

export const AI_CAPTURE_SOURCE_ROVO = "Rovo/Jira";
export const AI_CAPTURE_SOURCE_NOTES = "Notes/Hedy";

export function getDashboardCaptureSource(tool) {
  return tool === "rovo" ? AI_CAPTURE_SOURCE_ROVO : AI_CAPTURE_SOURCE_NOTES;
}

export function getDashboardAIUnavailableMessage(tool) {
  if (tool === "rovo") {
    return "Paste a valid Rovo JSON response or add a Groq, Cohere, or Gemini API key for AI parsing.";
  }
  return "Paste dashboard-ready Hedy JSON, or add a Groq, Cohere, or Gemini API key for free-form Hedy/meeting-note parsing.";
}

export function getDirectDashboardJsonStatus(tool) {
  return tool === "rovo"
    ? "Valid Rovo JSON detected. Applying directly..."
    : "Valid Hedy/meeting-note JSON detected. Applying directly...";
}

export function getDirectDashboardJsonSuccessLabel(tool) {
  return tool === "rovo"
    ? "Dashboard updated from Rovo JSON"
    : "Dashboard updated from Hedy/meeting-note JSON";
}

export function getDashboardPromptTemplate(tool, meeting) {
  if (tool === "notes" && meeting?.notesSystemPrompt) {
    return { ...meeting, systemPrompt: meeting.notesSystemPrompt };
  }
  return meeting;
}

export function buildDashboardCaptureContext({
  tool,
  meeting,
  activeSprint,
  projectProfile,
  projectContext,
  nextSprint,
  recentSprintHistory,
  lastUpdated,
}) {
  const promptTemplate = getDashboardPromptTemplate(tool, meeting);
  return buildContext(promptTemplate, activeSprint, {
    ...projectProfile,
    epic: projectProfile?.primaryEpic || projectContext?.epic,
    name: projectProfile?.primaryEpicName || projectContext?.epicName || projectProfile?.projectName,
    nextSprint,
    recentSprintHistory,
    lastUpdated,
  });
}

export async function parseDashboardCaptureWithAI({
  tool,
  meeting,
  activeSprint,
  projectProfile,
  projectContext,
  nextSprint,
  recentSprintHistory,
  lastUpdated,
  text,
  keys,
  openrouterKey,
  onStatusChange,
}) {
  const context = buildDashboardCaptureContext({
    tool,
    meeting,
    activeSprint,
    projectProfile,
    projectContext,
    nextSprint,
    recentSprintHistory,
    lastUpdated,
  });

  return callAI(
    context,
    text,
    keys || { openrouterKey },
    onStatusChange,
  );
}

export function getDashboardAIKeys(source = {}) {
  return {
    cohereKey: source.cohereKey || "",
    geminiKey: source.geminiKey || "",
    groqKey: source.groqKey || "",
    openrouterKey: source.openrouterKey || "",
  };
}

export function hasDashboardAIKey(source = {}) {
  return hasAnyAIKey(getDashboardAIKeys(source));
}

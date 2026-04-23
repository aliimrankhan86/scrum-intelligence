import {
  buildDashboardCaptureContext,
  getDashboardAIUnavailableMessage,
  getDashboardCaptureSource,
  getDirectDashboardJsonStatus,
  getDirectDashboardJsonSuccessLabel,
} from "./aiDashboardAdapter";

test("uses removable source labels for Rovo and Hedy capture paths", () => {
  expect(getDashboardCaptureSource("rovo")).toBe("Rovo/Jira");
  expect(getDashboardCaptureSource("notes")).toBe("Notes/Hedy");
});

test("keeps no-key messaging clear for direct JSON and Hedy note capture", () => {
  expect(getDashboardAIUnavailableMessage("rovo")).toContain("valid Rovo JSON");
  expect(getDashboardAIUnavailableMessage("notes")).toContain("dashboard-ready Hedy JSON");
  expect(getDashboardAIUnavailableMessage("notes")).toContain("free-form Hedy/meeting-note parsing");
});

test("explains direct JSON application for both capture panels", () => {
  expect(getDirectDashboardJsonStatus("rovo")).toContain("Valid Rovo JSON");
  expect(getDirectDashboardJsonStatus("notes")).toContain("Valid Hedy/meeting-note JSON");
  expect(getDirectDashboardJsonSuccessLabel("rovo")).toContain("Rovo JSON");
  expect(getDirectDashboardJsonSuccessLabel("notes")).toContain("Hedy/meeting-note JSON");
});

test("builds Hedy note AI context from the meeting notes prompt and runtime project data", () => {
  const context = buildDashboardCaptureContext({
    tool: "notes",
    meeting: {
      label: "Daily standup",
      systemPrompt: "ROVO BOARD PROMPT",
      notesSystemPrompt: "HEDY NOTES PROMPT",
    },
    activeSprint: {
      num: 5,
      name: "RPAB Sprint 5",
      start: "2026-04-15",
      end: "2026-04-28",
    },
    projectProfile: {
      projectName: "RPA Build",
      primaryEpic: "RPAB-27",
      primaryEpicName: "UK Prospect Data Cleansing Automation",
      goal: "Achieve go-live for UK Prospect Datasets.",
      workstreams: [
        {
          epic: "RPAB-27",
          epicName: "UK Prospect Data Cleansing Automation",
          focus: "Production readiness",
        },
      ],
    },
    projectContext: {
      epic: "RPAB-36",
      epicName: "Letter Generation",
    },
    nextSprint: {
      num: 6,
      name: "RPAB Sprint 6",
    },
    recentSprintHistory: [
      {
        num: 4,
        name: "RPAB Sprint 4",
        summary: "Completed UAT readiness.",
      },
    ],
    lastUpdated: "23/04/2026 09:30",
  });

  expect(context).toContain("Project: RPA Build");
  expect(context).toContain("Primary epic RPAB-27");
  expect(context).toContain("Sprint: RPAB Sprint 5");
  expect(context).toContain("Next sprint: RPAB Sprint 6 (#6)");
  expect(context).toContain("HEDY NOTES PROMPT");
  expect(context).not.toContain("ROVO BOARD PROMPT");
});

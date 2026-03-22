import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STEP_REGEX = /^- \[( |x|-)\] ([A-Z0-9-]+): (.+)$/;
const PHASE_REGEX = /^#{2,3} Phase ([A-Z0-9-]+) - (.+)$/;

export function getRepoRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../..");
}

export function readConfig() {
  const repoRoot = getRepoRoot();
  const configPath = path.join(repoRoot, ".ai/orchestrator.config.json");
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

export function resolvePath(relativePath) {
  return path.join(getRepoRoot(), relativePath);
}

export function readText(relativePath) {
  return fs.readFileSync(resolvePath(relativePath), "utf8");
}

export function writeText(relativePath, contents) {
  fs.writeFileSync(resolvePath(relativePath), contents, "utf8");
}

export function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

export function writeJson(relativePath, value) {
  writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function parsePlan(planText) {
  const lines = planText.split(/\r?\n/);
  const steps = [];
  let currentPhase = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const phaseMatch = line.match(PHASE_REGEX);

    if (phaseMatch) {
      currentPhase = {
        id: phaseMatch[1],
        title: phaseMatch[2]
      };
      continue;
    }

    const stepMatch = line.match(STEP_REGEX);
    if (!stepMatch) {
      continue;
    }

    steps.push({
      marker: stepMatch[1],
      id: stepMatch[2],
      title: stepMatch[3],
      phaseId: currentPhase?.id ?? null,
      phaseTitle: currentPhase?.title ?? null,
      lineNumber: index + 1
    });
  }

  return { steps };
}

export function markerToStatus(marker) {
  if (marker === "x") {
    return "done";
  }

  if (marker === "-") {
    return "in-progress";
  }

  return "planned";
}

export function statusToMarker(status) {
  if (status === "done") {
    return "x";
  }

  if (status === "in-progress") {
    return "-";
  }

  return " ";
}

export function getNextIncompleteStep(parsedPlan) {
  return parsedPlan.steps.find((step) => step.marker !== "x") ?? null;
}

export function getLastCompletedStep(parsedPlan) {
  const completedSteps = parsedPlan.steps.filter((step) => step.marker === "x");
  return completedSteps.at(-1) ?? null;
}

export function updateLastRun(relativePath, entry) {
  const content = [
    "# Last Orchestration Run",
    "",
    `- Timestamp: ${entry.timestamp ?? "unknown"}`,
    `- Agent: ${entry.agent ?? "unknown"}`,
    `- Action: ${entry.action ?? "unknown"}`,
    `- Status: ${entry.status ?? "unknown"}`,
    `- Current step: ${entry.currentStep ?? "none"}`,
    `- Result summary: ${entry.resultSummary ?? "none"}`,
    `- Follow-up: ${entry.followUp ?? "none"}`,
    ""
  ].join("\n");

  writeText(relativePath, content);
}
import { getLastCompletedStep, getNextIncompleteStep, parsePlan, readConfig, readJson, readText, statusToMarker, updateLastRun, writeJson, writeText } from "./lib/plan-utils.mjs";

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const stepId = readArg("--step");
const status = readArg("--status") ?? "planned";
const review = readArg("--review");
const note = readArg("--note");
const agent = readArg("--agent") ?? "orchestrator";

if (!stepId) {
  console.error("Missing required argument: --step <STEP_ID>");
  process.exit(1);
}

const config = readConfig();
const originalPlan = readText(config.planPath);
const lines = originalPlan.split(/\r?\n/);
const marker = statusToMarker(status);
let stepFound = false;

for (let index = 0; index < lines.length; index += 1) {
  const stepPrefixPattern = new RegExp(`^- \\[( {1}|x|-)\\] ${stepId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}: `);

  if (stepPrefixPattern.test(lines[index])) {
    lines[index] = lines[index].replace(/^- \[( |x|-)\]/, `- [${marker}]`);
    stepFound = true;
    continue;
  }

  if (stepFound && /^ {2}- Review: /.test(lines[index]) && review) {
    lines[index] = `  - Review: ${review}`;
    break;
  }

  if (stepFound && /^- \[( |x|-)\] /.test(lines[index])) {
    break;
  }
}

if (!stepFound) {
  console.error(`Step not found in plan: ${stepId}`);
  process.exit(1);
}

writeText(config.planPath, `${lines.join("\n")}\n`);

const updatedPlan = parsePlan(readText(config.planPath));
const state = readJson(config.statePath);
const now = new Date().toISOString();
const lastCompleted = getLastCompletedStep(updatedPlan);
const nextStep = getNextIncompleteStep(updatedPlan);

state.currentStepId = status === "done" ? nextStep?.id ?? null : stepId;
state.lastCompletedItemId = lastCompleted?.id ?? state.lastCompletedItemId;
state.lastRun = {
  timestamp: now,
  agent,
  action: `update-progress:${stepId}`,
  status
};

if (review) {
  state.lastReviewedItemId = stepId;
  state.lastReviewOutcome = review;
}

if (note) {
  state.recentNotes = [
    {
      timestamp: now,
      stepId,
      note
    },
    ...state.recentNotes
  ].slice(0, 10);
}

if (updatedPlan.steps.every((step) => step.marker === "x")) {
  state.planningStatus = "completed";
} else if (updatedPlan.steps.some((step) => step.marker === "x" || step.marker === "-")) {
  state.planningStatus = "in-progress";
} else {
  state.planningStatus = "planned";
}

writeJson(config.statePath, state);
updateLastRun(config.lastRunPath, {
  timestamp: now,
  agent,
  action: `progress update for ${stepId}`,
  status,
  currentStep: state.currentStepId,
  resultSummary: note ?? `Updated ${stepId} to ${status}`,
  followUp: nextStep ? `Next step: ${nextStep.id}` : "No remaining steps"
});

console.log(
  JSON.stringify(
    {
      stepId,
      status,
      review,
      lastCompletedItemId: state.lastCompletedItemId,
      nextStepId: nextStep?.id ?? null
    },
    null,
    2
  )
);
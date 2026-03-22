import { execFileSync } from "node:child_process";
import { getLastCompletedStep, parsePlan, readConfig, readJson, readText } from "./lib/plan-utils.mjs";

function safeGit(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

const config = readConfig();
const state = readJson(config.statePath);
const parsedPlan = parsePlan(readText(config.planPath));
const lastCompletedStep = getLastCompletedStep(parsedPlan);
const branch = safeGit(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown-branch";
const changedFiles = safeGit(["diff", "--name-only", "HEAD"]).split(/\r?\n/).filter(Boolean);

const subject = lastCompletedStep
  ? `${lastCompletedStep.id}: ${lastCompletedStep.title}`
  : "chore: update project state";

const bodyLines = [
  `Branch: ${branch}`,
  `Last completed item: ${lastCompletedStep?.id ?? "none"}`,
  `Last review outcome: ${state.lastReviewOutcome ?? "not-recorded"}`,
  changedFiles.length > 0 ? `Changed files: ${changedFiles.join(", ")}` : "Changed files: none detected"
];

const commitMessage = `${subject}\n\n${bodyLines.join("\n")}`;
console.log(commitMessage);
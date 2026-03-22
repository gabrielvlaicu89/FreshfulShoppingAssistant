import { getLastCompletedStep, getNextIncompleteStep, parsePlan, readConfig, readText } from "./lib/plan-utils.mjs";

const mode = process.argv[2] ?? "summary";
const config = readConfig();
const planText = readText(config.planPath);
const parsedPlan = parsePlan(planText);
const nextStep = getNextIncompleteStep(parsedPlan);
const lastCompletedStep = getLastCompletedStep(parsedPlan);

const planningExists = parsedPlan.steps.length > 0;

if (mode === "next") {
  console.log(JSON.stringify({ planningExists, nextStep }, null, 2));
  process.exit(0);
}

if (mode === "last") {
  console.log(JSON.stringify({ planningExists, lastCompletedStep }, null, 2));
  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      planningExists,
      totalSteps: parsedPlan.steps.length,
      completedSteps: parsedPlan.steps.filter((step) => step.marker === "x").length,
      nextStep,
      lastCompletedStep
    },
    null,
    2
  )
);
import fs from "node:fs";
import { readConfig, readText, resolvePath } from "./lib/plan-utils.mjs";

const mode = process.argv.includes("--mode")
  ? process.argv[process.argv.indexOf("--mode") + 1]
  : "default";

const config = readConfig();
const checks = [
  { label: "DESCRIPTION.md", path: config.descriptionPath },
  { label: "PLAN.md", path: config.planPath },
  { label: "state.json", path: config.statePath },
  { label: "last-run.md", path: config.lastRunPath }
];

const missing = checks.filter((item) => !fs.existsSync(resolvePath(item.path)));
if (missing.length > 0) {
  console.error(`Missing required files: ${missing.map((item) => item.path).join(", ")}`);
  process.exit(1);
}

const descriptionText = readText(config.descriptionPath);
const looksUnedited = descriptionText.includes("Application Description Template") || descriptionText.includes("Product name:");

if (mode === "strict-description" && looksUnedited) {
  console.error("DESCRIPTION.md still appears to contain placeholder content.");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      mode,
      valid: true,
      placeholderDescriptionDetected: looksUnedited
    },
    null,
    2
  )
);
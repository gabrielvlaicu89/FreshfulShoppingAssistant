import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const envTargets = [
  {
    label: "API",
    examplePath: path.join(rootDirectory, "apps/api/.env.example"),
    targetPath: path.join(rootDirectory, "apps/api/.env")
  },
  {
    label: "Mobile",
    examplePath: path.join(rootDirectory, "apps/mobile/.env.example"),
    targetPath: path.join(rootDirectory, "apps/mobile/.env")
  }
];

let hasMissingTargets = false;

for (const envTarget of envTargets) {
  const exampleExists = fs.existsSync(envTarget.examplePath);
  if (!exampleExists) {
    console.error(`Missing example env file for ${envTarget.label}: ${path.relative(rootDirectory, envTarget.examplePath)}`);
    hasMissingTargets = true;
    continue;
  }

  if (fs.existsSync(envTarget.targetPath)) {
    console.log(`${envTarget.label} env ready: ${path.relative(rootDirectory, envTarget.targetPath)}`);
    continue;
  }

  if (checkOnly) {
    console.error(`Missing env file: ${path.relative(rootDirectory, envTarget.targetPath)}`);
    hasMissingTargets = true;
    continue;
  }

  fs.copyFileSync(envTarget.examplePath, envTarget.targetPath);
  console.log(`Created ${path.relative(rootDirectory, envTarget.targetPath)} from example template.`);
}

if (hasMissingTargets) {
  process.exit(1);
}
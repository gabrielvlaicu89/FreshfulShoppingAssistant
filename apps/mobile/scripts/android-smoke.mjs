import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = path.resolve(scriptsDirectory, "..");
const androidProjectDirectory = path.join(workspaceDirectory, "android");
const envExamplePath = path.join(workspaceDirectory, ".env.example");
const envPath = path.join(workspaceDirectory, ".env");
const outputDirectory = path.join(workspaceDirectory, ".artifacts", "android");
const bundleOutputPath = path.join(outputDirectory, "index.android.bundle");
const assetsOutputPath = path.join(outputDirectory, "assets");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const gradleCommand = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

async function prepareOutputDirectory() {
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(assetsOutputPath, { recursive: true });
}

function parseEnvEntries(contents) {
  return contents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");

      if (separatorIndex === -1) {
        return null;
      }

      return {
        key: line.slice(0, separatorIndex),
        value: line.slice(separatorIndex + 1)
      };
    })
    .filter(Boolean);
}

async function prepareRuntimeEnv() {
  const exampleContents = await fs.readFile(envExamplePath, "utf8");
  const exampleEntries = parseEnvEntries(exampleContents);
  let existingContents = null;

  try {
    existingContents = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
      throw error;
    }
  }

  const existingEntries = existingContents ? parseEnvEntries(existingContents) : [];
  const existingEntryMap = new Map(existingEntries.map((entry) => [entry.key, entry.value]));
  const missingExampleKey = exampleEntries.some((entry) => !existingEntryMap.has(entry.key));

  if (existingContents && !missingExampleKey) {
    return async () => {};
  }

  const mergedLines = exampleEntries.map((entry) => `${entry.key}=${existingEntryMap.get(entry.key) ?? entry.value}`);
  const exampleKeys = new Set(exampleEntries.map((entry) => entry.key));

  for (const entry of existingEntries) {
    if (!exampleKeys.has(entry.key)) {
      mergedLines.push(`${entry.key}=${entry.value}`);
    }
  }

  await fs.writeFile(envPath, `${mergedLines.join("\n")}\n`, "utf8");

  return async () => {
    if (existingContents === null) {
      await fs.rm(envPath, { force: true });
      return;
    }

    await fs.writeFile(envPath, existingContents, "utf8");
  };
}

function runCommand(command, args, cwd, failureLabel) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`${failureLabel} failed with exit code ${code ?? "unknown"}.`));
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

function runBundleCommand() {
  return runCommand(
    npmCommand,
    [
      "exec",
      "--",
      "react-native",
      "bundle",
      "--platform",
      "android",
      "--dev",
      "true",
      "--entry-file",
      "index.js",
      "--bundle-output",
      bundleOutputPath,
      "--assets-dest",
      assetsOutputPath,
      "--reset-cache"
    ],
    workspaceDirectory,
    "Android smoke bundle"
  );
}

function runAndroidBuildCommand() {
  return runCommand(
    gradleCommand,
    ["--no-daemon", "app:assembleDebug"],
    androidProjectDirectory,
    "Android debug build"
  );
}

const restoreRuntimeEnv = await prepareRuntimeEnv();

try {
  await prepareOutputDirectory();
  await runBundleCommand();
  await runAndroidBuildCommand();
} finally {
  await restoreRuntimeEnv();
}
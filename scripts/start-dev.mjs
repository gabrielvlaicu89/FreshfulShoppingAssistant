import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const shutdownSignals = ["SIGINT", "SIGTERM"];

const workspaces = [
  {
    label: "API",
    name: "@freshful/api"
  },
  {
    label: "Mobile",
    name: "@freshful/mobile"
  }
];

const children = [];
let shuttingDown = false;

function runWorkspaceStart(workspace) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ["run", "start", "--workspace", workspace.name], {
      stdio: "inherit"
    });

    children.push(child);

    child.on("exit", (code) => {
      if (shuttingDown) {
        resolve();
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${workspace.label} startup exited with code ${code ?? "unknown"}.`));
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

function stopChildren(signal) {
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const signal of shutdownSignals) {
  process.once(signal, () => {
    stopChildren(signal);
  });
}

console.log("Starting workspace development processes for the Freshful Shopping Assistant.");

await Promise.all(workspaces.map((workspace) => runWorkspaceStart(workspace)));

console.log("Workspace startup flow finished.");
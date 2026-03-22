import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

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

function runWorkspaceStart(workspace) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ["run", "start", "--workspace", workspace.name], {
      stdio: "inherit"
    });

    child.on("exit", (code) => {
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

console.log("Starting placeholder workspaces for the Freshful Shopping Assistant scaffold.");

for (const workspace of workspaces) {
  await runWorkspaceStart(workspace);
}

console.log("Workspace startup flow finished. The real Fastify API and React Native shell are scheduled for later plan steps.");
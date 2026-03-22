import { execFileSync } from "node:child_process";

function getChangedFiles(args) {
  try {
    const output = execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const stagedOnly = process.argv.includes("--staged");
const unstagedOnly = process.argv.includes("--unstaged");

const staged = unstagedOnly ? [] : getChangedFiles(["diff", "--name-only", "--cached"]);
const unstaged = stagedOnly ? [] : getChangedFiles(["diff", "--name-only"]);

console.log(
  JSON.stringify(
    {
      staged,
      unstaged,
      combined: [...new Set([...staged, ...unstaged])]
    },
    null,
    2
  )
);
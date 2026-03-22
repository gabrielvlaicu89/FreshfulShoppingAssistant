import { execFileSync } from "node:child_process";

function gitFiles(args) {
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

const combined = [...new Set([...gitFiles(["diff", "--name-only"]), ...gitFiles(["diff", "--name-only", "--cached"])])];

if (combined.length === 0) {
  console.error("No changed files detected.");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      changedFileCount: combined.length,
      files: combined
    },
    null,
    2
  )
);
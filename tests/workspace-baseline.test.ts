import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describeApiWorkspace } from "../apps/api/src/index.ts";
import { describeMobileWorkspace } from "../apps/mobile/src/index.ts";
import { workspaceCatalog } from "../packages/contracts/src/index.ts";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testDirectory, "..");

test("workspace catalog stays aligned with scaffolded workspaces", () => {
  assert.deepEqual(workspaceCatalog, [
    {
      name: "@freshful/api",
      path: "apps/api"
    },
    {
      name: "@freshful/mobile",
      path: "apps/mobile"
    },
    {
      name: "@freshful/contracts",
      path: "packages/contracts"
    }
  ]);
});

test("workspace entrypoints describe their placeholder locations", () => {
  assert.equal(describeApiWorkspace(), "@freshful/api:apps/api");
  assert.equal(describeMobileWorkspace(), "@freshful/mobile:apps/mobile");
});

test("environment example files exist for backend and mobile workspaces", () => {
  const envExamples = [
    path.join(rootDirectory, "apps/api/.env.example"),
    path.join(rootDirectory, "apps/mobile/.env.example")
  ];

  for (const envExample of envExamples) {
    assert.equal(fs.existsSync(envExample), true, `${path.relative(rootDirectory, envExample)} should exist.`);
  }
});
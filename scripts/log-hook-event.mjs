import fs from "node:fs";
import path from "node:path";
import { readConfig, resolvePath } from "./lib/plan-utils.mjs";

const config = readConfig();
const eventName = process.argv[2] ?? "unspecified-event";
const extra = process.argv.slice(3).join(" ");
const timestamp = new Date().toISOString();
const logLine = `${timestamp} | ${eventName}${extra ? ` | ${extra}` : ""}\n`;

fs.mkdirSync(resolvePath(config.logsDirectory), { recursive: true });
const targetPath = path.join(resolvePath(config.logsDirectory), "hook-events.log");
fs.appendFileSync(targetPath, logLine, "utf8");
process.stdout.write(logLine);
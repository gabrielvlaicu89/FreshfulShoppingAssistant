---
name: git-commit-and-progress-update
description: "Use when: a step has passed implementation, testing, and review, and the workflow needs PLAN.md and state updates plus a safe commit or push decision."
---

# Git Commit And Progress Update

## Purpose

Finish an accepted step cleanly and safely.

## Inputs

- Accepted step ID
- PLAN.md
- .ai/state.json
- .ai/orchestrator.config.json
- Current git status

## Procedure

1. Update the step status in PLAN.md.
2. Synchronize .ai/state.json and .ai/last-run.md.
3. Inspect changed files.
4. Draft a commit message using the accepted step.
5. Only create a commit if configuration allows it.
6. Only push if configuration allows it and the environment clearly supports it.

## File References

- scripts/update-progress.mjs
- scripts/collect-changed-files.mjs
- scripts/generate-commit-message.mjs
- .ai/orchestrator.config.json

## Safety Rules

- Never auto-push unless explicitly enabled.
- If commit or push is blocked, report the blocker and the next safe manual command.
- Keep progress artifacts readable by humans after every update.
---
description: "Use when: editing .ai state or configuration files so automation remains explicit, safe, and synchronized with PLAN.md."
applyTo: ".ai/**"
---

# .ai State Guidance

- Treat .ai/orchestrator.config.json as the workflow configuration source of truth.
- Keep .ai/state.json machine-readable and concise.
- Keep .ai/last-run.md human-readable.
- Do not record secrets or credentials in .ai files.
- When progress changes, keep PLAN.md and .ai/state.json aligned.
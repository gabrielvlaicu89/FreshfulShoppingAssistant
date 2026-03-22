---
description: "Create or refresh PLAN.md from DESCRIPTION.md using the orchestrator workflow."
agent: orchestrator
---

Read DESCRIPTION.md, inspect the current repository state, and make sure PLAN.md exists as a concrete phased execution plan rather than placeholder content.

If PLAN.md is missing, stale, or still template-grade, delegate to the planning agent to generate or refresh it.

Return:

- whether planning was created or refreshed
- the phase index
- the first actionable step ID
- any assumptions or blockers that require user attention
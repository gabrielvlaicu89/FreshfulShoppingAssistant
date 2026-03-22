---
description: "Start the next incomplete feature or step in PLAN.md using the full orchestrator loop."
agent: orchestrator
---

Determine the next incomplete actionable item in PLAN.md. If planning does not exist yet, create it first.

Then run the normal orchestration loop:

1. delegate implementation to the coder agent
2. delegate validation to the tester agent
3. send failures back to coder if needed
4. delegate post-validation review to the reviewer agent
5. send review findings back to coder if needed
6. update PLAN.md and .ai/state.json when the item is accepted
7. draft commit output and only push if configuration and environment both allow it

Return a concise execution report with the targeted step, result, blockers, and next suggested action.
# Workspace Agent Operating Rules

This repository is optimized for a DESCRIPTION.md-first workflow.

## Global Priorities

1. Read DESCRIPTION.md before proposing implementation direction.
2. Use PLAN.md as the execution contract once planning exists.
3. Treat .ai/orchestrator.config.json as the authoritative automation configuration.
4. Keep .ai/state.json synchronized with PLAN.md whenever progress is updated.
5. Prefer the orchestrator agent for end-to-end execution and use role-specific agents through delegation.

## Workflow Rules

- Planning comes before coding unless the user explicitly requests a targeted deviation.
- Implement one plan step or one feature slice at a time.
- Keep edits minimal and local to the current step.
- Write or update tests alongside implementation whenever the stack supports it.
- Run lint, tests, and other configured validation before review.
- Route tester failures and reviewer change requests back into implementation rather than ignoring them.
- Do not mark plan items complete until implementation, validation, and review are finished or explicitly waived.

## Progress Tracking

- PLAN.md is the primary human-readable workflow artifact.
- .ai/state.json is the machine-readable cache for last run and step status.
- .ai/last-run.md is the operational log for the most recent orchestration pass.
- Use scripts/find-plan-item.mjs and scripts/update-progress.mjs instead of ad hoc parsing when practical.

## Git Safety

- Auto-commit and auto-push are opt-in through .ai/orchestrator.config.json.
- Never assume push is allowed or possible.
- Draft commit messages should reflect the completed step or phase and the validation status.
- If the environment or auth blocks push, report the blocker clearly and stop safely.

## Documentation Rules

- Keep DESCRIPTION.md as the product contract, not a scratchpad.
- Keep PLAN.md structured with stable IDs and status markers.
- Update README.md or other docs when workflow or setup expectations change.

## Least-Privilege Intent

- The orchestrator can coordinate the full loop.
- The planning agent should remain read-heavy.
- The coder agent should focus on implementation.
- The tester agent should focus on validation and failure reporting.
- The reviewer agent should focus on review findings and approval state.
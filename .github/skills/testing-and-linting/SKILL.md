---
name: testing-and-linting
description: "Use when: validating a completed implementation slice, updating tests, running configured commands, and summarizing pass or fail results for the orchestrator."
---

# Testing And Linting

## Purpose

Provide a deterministic validation pass after coding changes.

## Inputs

- Assigned step ID
- DESCRIPTION.md
- PLAN.md
- .ai/orchestrator.config.json
- Changed files and relevant test files

## Procedure

1. Determine the required tests from PLAN.md and DESCRIPTION.md.
2. Add or update tests if coverage is missing.
3. Run the configured lint command when present.
4. Run the configured test command when present.
5. Run typecheck or build commands when configuration enables them and the commands exist.
6. Report explicit pass or fail.

## Failure Reporting Rules

- Include the exact command that failed.
- Include the shortest actionable explanation of the failure.
- Separate blockers from warnings.
- Recommend the next coder action clearly.

## File References

- .ai/orchestrator.config.json
- PLAN.md
- scripts/check-changed-files.mjs

## Result Format

- Validation status:
- Commands run:
- Test updates:
- Failures:
- Next action:
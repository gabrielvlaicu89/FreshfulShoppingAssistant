---
name: implementation-step-execution
description: "Use when: implementing a single PLAN.md step, keeping edits minimal, and responding to tester or reviewer feedback without drifting outside the assigned slice."
---

# Implementation Step Execution

## Purpose

Execute one plan step cleanly and with bounded scope.

## Inputs

- DESCRIPTION.md
- PLAN.md
- Assigned step ID and title
- Relevant source files
- Tester failures or reviewer findings when present

## Procedure

1. Confirm the assigned step, dependencies, acceptance criteria, and tests in PLAN.md.
2. Read only the files relevant to that step before editing.
3. Make the smallest coherent code change that satisfies the acceptance criteria.
4. Update tests and docs that are directly affected.
5. Return a concise summary the tester can act on.

## Constraints

- Do not bundle unrelated refactors.
- Do not modify plan status unless explicitly instructed.
- Prefer root-cause fixes over superficial patches.

## File References

- PLAN.md
- DESCRIPTION.md
- .ai/orchestrator.config.json
- .ai/state.json

## Handoff Guidance

Tell the tester exactly what changed, what files were touched, and what behavior must be verified.
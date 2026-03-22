---
name: planning-from-description
description: "Use when: translating DESCRIPTION.md into a structured PLAN.md with phases, step IDs, dependencies, acceptance criteria, testing expectations, and review-ready status markers."
---

# Planning From Description

## Purpose

Create or refresh PLAN.md so the orchestrator can execute work deterministically.

## Inputs

- DESCRIPTION.md
- Current repository files
- PLAN.md if it already exists
- .ai/orchestrator.config.json

## Outputs

- A complete PLAN.md with stable phase IDs and step IDs
- Clear assumptions and dependencies
- Explicit acceptance criteria and test expectations per phase or step

## Procedure

1. Read DESCRIPTION.md completely before drafting anything.
2. Inspect repository state so the plan reflects what already exists.
3. Define phases that match the actual delivery sequence.
4. Break each phase into concrete steps using IDs like P1-S1, P1-S2, P2-S1.
5. For every step, include owner, dependencies, acceptance, tests, and review state.
6. Keep items small enough for one focused coder pass.
7. Avoid code edits unless explicitly requested by the orchestrator as part of refreshing PLAN.md.

## File References

- PLAN.md
- DESCRIPTION.md
- .ai/state.json
- scripts/find-plan-item.mjs

## Quality Check

- Can the orchestrator find the first incomplete step reliably?
- Can the tester infer what validation is expected for each implementation step?
- Can the reviewer decide whether a step is complete from the acceptance criteria alone?
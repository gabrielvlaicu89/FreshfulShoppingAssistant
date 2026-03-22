---
name: review-checklist
description: "Use when: reviewing validated code against PLAN.md and DESCRIPTION.md with a structured checklist covering correctness, maintainability, architecture fit, risk, and cleanup opportunities."
---

# Review Checklist

## Purpose

Provide a consistent review gate after tester success.

## Inputs

- DESCRIPTION.md
- PLAN.md
- Tester outcome
- Recent code changes
- Relevant tests and docs

## Checklist

1. Requirement coverage: does the change satisfy the targeted step and acceptance criteria?
2. Architecture fit: does the solution match the intended stack and boundaries?
3. Correctness: are there obvious logic gaps, broken edge cases, or missing failure handling?
4. Maintainability: is the change clear, scoped, and free of avoidable complexity?
5. Validation fit: do tests and lint coverage match the risk of the change?
6. Cleanup: is there any follow-up that should be recorded now rather than forgotten later?

## Result Contract

Return one of:

- approved
- changes-requested

If changes are requested, include concrete findings that map cleanly to code or behavior.

## File References

- DESCRIPTION.md
- PLAN.md
- .ai/state.json
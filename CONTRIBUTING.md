# Contributing

## Purpose

This repository is a boilerplate for Copilot-driven app delivery. Contributions should improve clarity, maintainability, safety, and practical automation.

## Contribution Rules

1. Keep the DESCRIPTION.md-first workflow intact.
2. Preserve the orchestrator as the primary entry point.
3. Avoid duplicating instructions across agents, skills, prompts, and docs.
4. Prefer small deterministic helper scripts over opaque automation.
5. Keep defaults safe, especially around git commit and push behavior.

## When Editing The Boilerplate

- Update README.md if the operator workflow changes.
- Update AGENTS.md if the global operating model changes.
- Update .ai/orchestrator.config.json and related docs together.
- Keep PLAN.md automation-friendly with stable IDs and consistent checkbox markers.
- Document preview-only features and fallbacks instead of implying full support.

## Validation Expectations

- Run the relevant commands from package.json after editing helper scripts.
- If you change progress parsing or plan formatting, test scripts/find-plan-item.mjs and scripts/update-progress.mjs against PLAN.md.
- If you change git automation, verify failure modes as well as success paths.

## Review Criteria

Changes should be easy to inspect, easy to explain, and safe by default.
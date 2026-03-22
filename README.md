# Copilot Orchestrator Boilerplate

This repository is a reusable starter for building apps in VS Code with GitHub Copilot agent workflows. It is designed around a DESCRIPTION.md-first process: you describe the app in the repository root, then use a dedicated orchestrator agent to plan, implement, test, review, and prepare commits in repeatable phases.

The boilerplate is intentionally lightweight. It uses markdown artifacts, workspace-local Copilot customizations, JSON configuration, and small Node.js helper scripts instead of a heavier framework. The result is easy to inspect, easy to copy into other repositories, and practical for real app development.

## Quick Start

1. Replace the template content in DESCRIPTION.md with the app specification.
2. Open the repository in VS Code with GitHub Copilot Chat enabled.
3. Run `npm run env:bootstrap` to create local `.env` files for the API and mobile workspaces from the checked-in examples.
4. Run `npm run lint`, `npm run typecheck`, and `npm test` from the root before asking the tester or reviewer agents to validate a step.
5. Run `npm start` when you want the placeholder workspace startup flow to verify the current scaffold wiring.
6. Run the reusable prompt .github/prompts/create-initial-plan.prompt.md.
7. Run the reusable prompt .github/prompts/start-next-feature.prompt.md.
8. Repeat the start-next-feature prompt until all plan items are complete.

## What This Boilerplate Includes

- Root workflow documents: DESCRIPTION.md, PLAN.md, AGENTS.md, CONTRIBUTING.md.
- Workspace-local Copilot customizations under .github/.
- Five custom agents: orchestrator, planning, coder, tester, reviewer.
- Five reusable skills aligned to the workflow.
- Reusable prompt files that target the orchestrator.
- Preview-oriented hook definitions with documented fallbacks.
- Helper scripts in scripts/ for plan parsing, progress updates, changed-file inspection, commit drafting, and audit logging.
- State and configuration files in .ai/.

## Repository Structure

```text
.
├── .ai/
│   ├── last-run.md
│   ├── orchestrator.config.json
│   ├── state.json
│   └── logs/
├── .github/
│   ├── agents/
│   ├── hooks/
│   ├── instructions/
│   ├── prompts/
│   └── skills/
├── scripts/
├── AGENTS.md
├── CONTRIBUTING.md
├── DESCRIPTION.md
├── PLAN.md
├── README.md
└── package.json
```

## Core Workflow

The normal operating flow is:

1. The user writes the product specification in DESCRIPTION.md.
2. The orchestrator reads DESCRIPTION.md and delegates planning to the planning agent.
3. The planning agent produces or refreshes PLAN.md.
4. The orchestrator determines the next incomplete step from PLAN.md and .ai/state.json.
5. The orchestrator delegates implementation to the coder agent.
6. The orchestrator delegates tests, lint, and validation to the tester agent.
7. Failures are routed back to the coder agent with a bounded, explicit fix loop.
8. After validation passes, the orchestrator delegates review to the reviewer agent.
9. Reviewer findings are routed back to the coder agent if changes are required.
10. When the step or phase is accepted, the orchestrator updates PLAN.md and .ai/state.json, drafts a commit, and optionally performs commit and push actions based on configuration.

The orchestrator is the main user-facing entry point. The other agents are designed as role-focused subagents with narrower responsibilities and lower privilege.

## Agent Architecture

### Orchestrator

- Reads DESCRIPTION.md, PLAN.md, and .ai/orchestrator.config.json.
- Delegates planning, coding, testing, and review to subagents.
- Decides the next actionable step and last completed step.
- Updates progress artifacts and prepares commit output.
- Stops safely when a blocker requires user input or environment access.

### Planning

- Reads DESCRIPTION.md and repository state.
- Produces a structured PLAN.md with phases, steps, dependencies, acceptance criteria, and test expectations.
- Operates primarily in read-only mode.

### Coder

- Implements one step or one small slice at a time.
- Uses minimal focused edits.
- Responds to tester failures and reviewer change requests.

### Tester

- Adds or updates tests where appropriate.
- Runs the configured test, lint, typecheck, and build commands when available.
- Produces a strict pass or fail result with actionable failure detail.

### Reviewer

- Performs a review only after implementation and validation.
- Checks correctness, maintainability, architecture fit, requirement coverage, and risks.
- Returns either approved or changes-requested with structured findings.

## Skills

The boilerplate includes reusable skills rather than burying every procedure inside agent prompts:

- planning-from-description: create a robust automation-friendly PLAN.md from DESCRIPTION.md.
- implementation-step-execution: implement a single plan step with bounded scope.
- testing-and-linting: run validation and summarize failures clearly.
- review-checklist: apply a structured post-validation review.
- git-commit-and-progress-update: update state, draft a commit, and enforce safe git behavior.

Each skill is self-contained in .github/skills/<skill-name>/SKILL.md and references repository files and helper scripts directly.

## Hooks

The hook files in .github/hooks/ are practical defaults, not magic. They cover:

- session-start logging
- repository prerequisite validation
- post-edit changed-file inspection and audit logging
- push safeguards

Hook support is still evolving across Copilot environments. This boilerplate treats hooks as a preview feature and includes script-level fallbacks so the same checks can be run manually or by agents even if a specific client does not load every hook file automatically.

## State And Progress Tracking

The automation uses two main artifacts:

- PLAN.md is the human-readable source of truth for phases, steps, checkboxes, acceptance criteria, tests, and review status.
- .ai/state.json is the machine-friendly cache for current step, last completed step, last reviewed step, commit history, and last run metadata.

The helper script scripts/find-plan-item.mjs can determine:

- whether planning exists
- the next incomplete step
- the last completed step
- a summary of actionable plan state

The helper script scripts/update-progress.mjs updates both PLAN.md and .ai/state.json together.

## Configuration

The file .ai/orchestrator.config.json controls automation defaults:

- test, lint, typecheck, and build commands
- commit and push behavior
- branch strategy
- retry limits
- hook enablement
- state file locations
- feature flags

The defaults are conservative. Auto-commit and auto-push are off by default.

## Developer Commands

- `npm run env:bootstrap` creates `apps/api/.env` and `apps/mobile/.env` from the example templates when those files do not exist yet.
- `npm run env:check` fails fast when required local env files have not been bootstrapped.
- `npm run lint` runs ESLint across the TypeScript and Node helper files in the repository.
- `npm run typecheck` runs TypeScript typechecking across every npm workspace that exposes a `typecheck` script.
- `npm test` runs the baseline workspace smoke tests with Node's built-in test runner through `tsx`.
- `npm run format:check` enforces the repository Prettier policy, and `npm run format` applies it.
- `npm start` boots the current placeholder API and mobile workspace startup flow without pretending the product app is fully implemented yet.

## Prompt Usage

Three reusable prompt files are included:

- .github/prompts/create-initial-plan.prompt.md
- .github/prompts/start-next-feature.prompt.md
- .github/prompts/re-review-last-feature.prompt.md

They are designed as lightweight slash-command style entry points that always target the orchestrator agent.

## Safety Model

- Least privilege: the orchestrator can delegate, but specialized subagents stay focused on their role.
- No silent failure: tester and reviewer are instructed to report structured outcomes.
- No automatic push by default: pushes require configuration and environment support.
- No hidden state: automation state is stored in tracked markdown and JSON files.
- Deterministic helpers: simple Node scripts are used where parsing or state updates need to be consistent.

## Customization Guide

You can adapt this boilerplate in several ways:

1. Change the commands in .ai/orchestrator.config.json to match the actual stack.
2. Tighten or loosen tool access in the agent frontmatter under .github/agents/.
3. Add domain-specific skills under .github/skills/.
4. Add more prompts for common workflows such as release prep or bug-fix triage.
5. Update AGENTS.md and .github/instructions/ to reflect team conventions.

## Assumptions

- VS Code with GitHub Copilot Chat and workspace-local customizations is available.
- Node.js 18 or newer is available for helper scripts.
- Git is available when using changed-file, commit-draft, or push-related helpers.
- The repository owner will replace the DESCRIPTION.md template before asking the agents to plan real work.

## Limitations And Caveats

- Hook support varies by client version and may require adjustment as the preview format evolves.
- Custom agent frontmatter and tool restriction support also evolve; treat these files as a strong starting point, not a guaranteed universal schema.
- The boilerplate does not generate app code by itself. It creates the agent operating system that builds the app from DESCRIPTION.md.
- Push automation is intentionally gated and may still require explicit confirmation, authentication, or environment approval.

## Recommended Adoption Path

1. Fill DESCRIPTION.md with a real product specification.
2. Update .ai/orchestrator.config.json with stack-specific commands.
3. Run the initial plan prompt and inspect PLAN.md.
4. Let the orchestrator execute one feature at a time.
5. Refine the agents and skills after the first project cycle based on what worked and what created friction.
# Freshful Shopping Assistant

Freshful Shopping Assistant is an Android-first meal-planning and grocery-assistant product for Romanian users. The current v1 stack captures a household profile through AI-assisted onboarding, generates and refines meal plans, maps ingredients to Freshful catalogue products, and returns a grouped shopping list with estimated pricing and a Freshful handoff.

This repository is a real product monorepo, not a starter template. It contains the mobile client, backend API, shared contracts, database migrations, orchestration workflow files, and automated validation used to ship the current implementation.

## Product Scope

The implemented system currently includes:

- Google Sign-In on mobile with backend token verification and app-session issuance.
- Authenticated onboarding and profile flows backed by shared household-profile contracts.
- AI-driven meal-plan generation and plan refinement with saved revisions.
- Freshful catalogue search, product normalization, cache recency tracking, and refresh utilities.
- Shopping-list draft generation with ingredient aggregation, product matching, grouped mobile display, and Freshful open-link handoff.
- Backend observability, request correlation, Anthropic usage metering, budget controls, and Freshful request safeguards.

## Stack

- Monorepo: npm workspaces
- Mobile app: React Native 0.76, TypeScript, React Navigation, Zustand, TanStack Query
- Backend API: Node.js, TypeScript, Fastify, Zod, Google auth verification, Anthropic integration
- Shared contracts: `packages/contracts` with runtime schemas and shared types
- Persistence: PostgreSQL, Drizzle ORM, generated SQL migrations, local Docker Compose for development
- Test utilities: `tsx --test` for backend and contract suites, Jest for mobile, PGlite for migration-backed persistence tests

## Workspace Layout

```text
.
├── apps/
│   ├── api/            # Fastify API, Drizzle schema, Freshful adapter, AI services
│   └── mobile/         # React Native Android app
├── packages/
│   └── contracts/      # Shared contracts, schemas, and runtime types
├── docs/               # Architecture and workflow notes
├── scripts/            # Repo automation, env bootstrap, validation, progress helpers
├── tests/              # Root backend and contract test suites
├── DESCRIPTION.md      # Product contract
├── PLAN.md             # Execution plan
└── .ai/                # Orchestrator state and last-run metadata
```

## Prerequisites

- Node.js 18 or newer
- npm with workspace support
- Docker Desktop or Docker Engine for local PostgreSQL
- Android development tooling if you want to run the mobile app on an emulator or device
- Google OAuth client IDs for backend verification and Android sign-in
- An Anthropic API key for AI-backed onboarding, planning, and shopping selection flows

## Setup

1. Install dependencies.

```bash
npm install
```

2. Bootstrap local environment files from the checked-in templates.

```bash
npm run env:bootstrap
```

3. Fill in the generated `apps/api/.env` and `apps/mobile/.env` files with real local values.

4. Start the local PostgreSQL instance for the API workspace.

```bash
npm run db:dev:up --workspace @freshful/api
```

5. Apply the checked-in database migrations.

```bash
npm run db:migrate
```

6. Start the API and Metro together, or run them separately if you prefer.

```bash
npm start
```

7. To install and launch the Android app, run:

```bash
npm run android --workspace @freshful/mobile
```

For Android emulators, the default checked-in mobile API base URL assumes `http://10.0.2.2:3000`.

## Environment Model

Environment handling is intentionally split by runtime:

- `apps/api/.env` contains server-only values such as `DATABASE_URL`, `APP_SESSION_SECRET`, `GOOGLE_WEB_CLIENT_ID`, `ANTHROPIC_API_KEY`, and Freshful integration controls.
- `apps/mobile/.env` contains only client-safe values such as `API_BASE_URL`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID`, and request timeouts.

Checked-in examples define the required keys without live credentials.

API environment variables cover:

- app environment and port
- PostgreSQL connection details
- app-session signing configuration
- Google token verification
- Anthropic model, timeout, routing, and budget limits
- Freshful base URL, timeout, retry, and rate-control settings

Mobile environment variables cover:

- app environment
- backend base URL
- Google Android and web client IDs
- request timeout budget

## Development Commands

Root-level commands:

- `npm run env:bootstrap`: create missing workspace `.env` files from `.env.example`.
- `npm run env:check`: fail if required workspace `.env` files are missing.
- `npm run hooks:validate`: validate the repo automation contract files exist and DESCRIPTION.md is no longer boilerplate.
- `npm run lint`: run ESLint across the repository.
- `npm run typecheck`: run TypeScript checks across all workspaces.
- `npm test`: run the default validation suite: root backend and contract tests plus the critical mobile integration tests.
- `npm run test:backend`: run the root `tests/*.test.ts` suite only.
- `npm run test:persistence`: run the migration-backed persistence suite.
- `npm run test:mobile:critical`: run the mobile app-shell, planner-preview, and shopping-list tests used by the default root suite.
- `npm run test:mobile`: run the full mobile Jest suite.
- `npm run typecheck:mobile`: run only the mobile workspace TypeScript check.
- `npm run android:smoke:mobile`: build the Android bundle and native debug shell without requiring an emulator.
- `npm run db:generate`: generate Drizzle migrations from the API schema.
- `npm run db:migrate`: apply generated migrations using `DATABASE_URL`.
- `npm start`: bootstrap env files and start the API workspace plus Metro.

Useful workspace commands:

- `npm run start --workspace @freshful/api`
- `npm run freshful:refresh --workspace @freshful/api`
- `npm run start --workspace @freshful/mobile`
- `npm run android --workspace @freshful/mobile`

## Validation Defaults

The default repository validation flow is:

```bash
npm run hooks:validate
npm run lint
npm run typecheck
npm test
```

Important scope notes:

- `npm test` is intentionally narrower than every available suite. It covers the root backend and contracts tests plus the critical mobile flows.
- Use `npm run test:mobile` when you need the complete mobile Jest suite.
- Use `npm run android:smoke:mobile` for a native packaging sanity check.
- Use `npm run test:persistence` when touching migrations or database ownership rules.

## Workflow Expectations

This repository follows a DESCRIPTION.md-first, plan-first workflow.

1. `DESCRIPTION.md` is the product contract and should stay implementation-oriented rather than status-oriented.
2. `PLAN.md` is the execution contract. Work should be scoped to one plan step or one narrow fix at a time.
3. `.ai/state.json` and `.ai/last-run.md` are the machine-readable workflow state used by the orchestrator.
4. Use the helper scripts in `scripts/` when updating progress instead of ad hoc edits where practical.
5. Validation and review happen before a plan step is considered complete.

For this step, do not treat README text as a substitute for the product contract in `DESCRIPTION.md` or the execution history in `PLAN.md`.

## Current v1 Limitations

- Android-first only. There is no iOS or web client in scope.
- Google Sign-In is the only implemented auth path.
- Freshful is the only supported retailer.
- Freshful integration is read-only catalogue access plus shopping-list handoff. Cart autofill, checkout, login-bound sessions, and address-specific cart management are not implemented.
- Shopping prices are estimates based on cached or refreshed catalogue data and can become stale.
- The product relies on developer-supplied Google and Anthropic credentials for local development.
- The root default test command does not replace the full mobile suite or platform-level device testing.

## Supporting Docs

- `apps/api/README.md` documents the backend modules, env requirements, and operational commands.
- `apps/mobile/README.md` documents the mobile flows, env requirements, and validation strategy.
- `apps/api/src/freshful/README.md` documents the Freshful catalogue contract and cache recency model.
- `docs/architecture/p1-s1-workspace-stack.md` captures the initial workspace architecture decisions.
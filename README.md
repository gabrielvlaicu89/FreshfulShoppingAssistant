# Freshful Shopping Assistant

Freshful Shopping Assistant is an Android-first AI grocery planning product for Romanian users. The goal is to capture a household profile through chat, generate meal plans, map those plans to Freshful products, and return a practical shopping list backed by a TypeScript mobile app, a Node backend, and shared contracts.

The repository is no longer just a Copilot starter. It already contains the project specification in [DESCRIPTION.md](/home/gabriel-vlaicu/Projects/FreshfulShoppingAssistant/DESCRIPTION.md), an execution plan in [PLAN.md](/home/gabriel-vlaicu/Projects/FreshfulShoppingAssistant/PLAN.md), a scaffolded monorepo, shared runtime contracts, and the first backend persistence slice.

## Current Status

- `P1-S1`, `P1-S2`, `P1-S3`, `P2-S1`, `P2-S2`, `P2-S3`, `P3-S1`, `P3-S2`, and `P3-S3` are complete.
- The repo now includes `apps/api`, `apps/mobile`, and `packages/contracts` npm workspaces.
- Shared domain contracts and runtime schemas live in `@freshful/contracts`.
- The backend now has PostgreSQL persistence, Drizzle schema definitions, generated migrations, local Docker Compose config, and ownership-safe persistence tests.
- Repository-level env examples, validated config loaders, and workspace runtime configuration docs are now in place for the API and mobile workspaces.
- The API workspace now includes the HTTP foundation, Google token verification, app session issuance, and authenticated profile read and update endpoints with explicit sensitive-field handling.

## Implemented Architecture

- Mobile target: Android-first React Native client in `apps/mobile`, with a bare Android scaffold, native-stack navigation, Zustand shell state, and TanStack Query wiring.
- Backend target: Node.js and TypeScript API in `apps/api`.
- Shared package: `packages/contracts` for cross-runtime types and `zod` schemas.
- Database: PostgreSQL with Drizzle ORM and generated SQL migrations.
- Local database workflow: Docker Compose in `apps/api/compose.yaml`.
- Test persistence workflow: `@electric-sql/pglite` applies generated migrations in tests without needing a live Postgres instance.

## Repository Structure

```text
.
├── apps/
│   ├── api/
│   │   ├── compose.yaml
│   │   ├── drizzle/
│   │   ├── drizzle.config.ts
│   │   └── src/
│   │       └── db/
│   └── mobile/
├── docs/
│   └── architecture/
├── packages/
│   └── contracts/
├── tests/
├── scripts/
├── DESCRIPTION.md
├── PLAN.md
└── package.json
```

## Getting Started

1. Install dependencies with `npm install`.
2. Bootstrap local env files with `npm run env:bootstrap`.
3. Review the product specification in [DESCRIPTION.md](/home/gabriel-vlaicu/Projects/FreshfulShoppingAssistant/DESCRIPTION.md).
4. Review the current implementation plan in [PLAN.md](/home/gabriel-vlaicu/Projects/FreshfulShoppingAssistant/PLAN.md).
5. Run `npm run lint`, `npm run typecheck`, and `npm test` to validate the current workspace.

## Development Commands

- `npm run env:bootstrap`: create `apps/api/.env` and `apps/mobile/.env` from checked-in examples.
- `npm run env:check`: fail fast if local env files are missing.
- `npm run lint`: run ESLint across the repository.
- `npm run typecheck`: run TypeScript checks across all workspaces.
- `npm test`: run the full current test suite.
- `npm run typecheck:mobile`: run the React Native mobile workspace typecheck only.
- `npm run test:mobile`: run the mobile Jest screen test suite.
- `npm run android:smoke:mobile`: build the Android JS bundle for the mobile app without requiring an emulator.
- `npm run test:persistence`: run the database-focused persistence tests only.
- `npm run db:generate`: generate Drizzle SQL migrations from the API schema.
- `npm run db:migrate`: apply generated migrations to the database configured by `DATABASE_URL`.
- `npm start`: run the current placeholder workspace startup flow.

## Environment And Secrets

This repo keeps runtime configuration separated by workspace:

- `apps/api/.env` is for backend-only settings, including `DATABASE_URL`, `APP_SESSION_SECRET`, `GOOGLE_WEB_CLIENT_ID`, `ANTHROPIC_API_KEY`, and Freshful integration values.
- `apps/mobile/.env` is limited to safe client-visible values such as `API_BASE_URL`, `GOOGLE_ANDROID_CLIENT_ID`, and request timeout settings used to inject mobile runtime config.

The checked-in `.env.example` files define the required keys without containing live credentials. `npm run env:bootstrap` copies those templates locally if the real `.env` files do not exist yet. Keep actual secrets in untracked local env files for development and in your deployment secret manager for shared environments.

Current validated runtime loaders:

- `apps/api/src/config.ts` validates the full backend runtime settings for environment selection, HTTP port, database access, app-session signing, Google auth, Anthropic access, and Freshful integration, while `apps/api/src/db/config.ts` keeps DB-only tooling limited to `DATABASE_URL`.
- `apps/mobile/src/config.ts` validates injected mobile runtime settings that are safe to keep on-device and explicitly excludes server-side secrets and local file reads at app runtime.

## API Persistence Workflow

The backend persistence foundation is implemented in `apps/api`.

- Schema definitions live in `apps/api/src/db/schema.ts`.
- Database config loading lives in `apps/api/src/db/config.ts`.
- Runtime connection setup lives in `apps/api/src/db/client.ts`.
- Migration application lives in `apps/api/src/db/migrate.ts`.
- Generated SQL migrations live in `apps/api/drizzle/`.
- Local Postgres is defined in `apps/api/compose.yaml`.

Typical local database flow:

1. Run `npm run db:dev:up --workspace @freshful/api`.
2. Run `npm run db:generate --workspace @freshful/api` if the schema changed.
3. Run `npm run db:migrate --workspace @freshful/api`.
4. Run `npm run test:persistence` to validate schema and migration behavior.

## Shared Contracts

`packages/contracts` now contains shared domain types and runtime validation for:

- household profiles
- onboarding transcripts and chat messages
- recipes and ingredient structures
- meal plan templates, instances, and overrides
- Freshful product and search metadata
- shopping lists and shopping list items
- API error payloads

These contracts are used to keep the mobile app, backend, and persistence model aligned.

## Project Workflow

The repo still uses the plan-first orchestration flow, but it now operates on a real product codebase rather than a blank template.

1. Product intent is defined in [DESCRIPTION.md](/home/gabriel-vlaicu/Projects/FreshfulShoppingAssistant/DESCRIPTION.md).
2. Execution steps are tracked in [PLAN.md](/home/gabriel-vlaicu/Projects/FreshfulShoppingAssistant/PLAN.md).
3. Automation state is stored in `.ai/state.json` and `.ai/last-run.md`.
4. The normal implementation loop is: implement one plan step, validate it, review it, then update plan and state.

## What Is Still Placeholder

- The mobile workspace now contains the real React Native shell, but authenticated Google Sign-In and secure session restoration are still pending for `P4-S2`.
- The API workspace now has the HTTP foundation, Google token verification, app session issuance, and protected profile endpoints, but it does not yet include AI orchestration or the Freshful adapter.

## Validation Baseline

The current repo is expected to pass these commands from the root:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run db:generate`
- `npm run test:persistence`

## References

- Product contract: [DESCRIPTION.md](/home/gabriel-vlaicu/Projects/FreshfulShoppingAssistant/DESCRIPTION.md)
- Execution plan: [PLAN.md](/home/gabriel-vlaicu/Projects/FreshfulShoppingAssistant/PLAN.md)
- API persistence notes: [apps/api/README.md](/home/gabriel-vlaicu/Projects/FreshfulShoppingAssistant/apps/api/README.md)
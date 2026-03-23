# API Workspace

This workspace contains the Fastify backend for the Freshful Shopping Assistant. It owns authentication, validated runtime configuration, AI orchestration, household profile persistence, meal-planner generation and refinement, Freshful catalogue access, shopping-list generation, and the operational safeguards around those flows.

## Backend Responsibilities

The API currently provides:

- health and readiness reporting
- Google ID-token verification and app-session issuance
- authenticated household profile reads and writes
- AI onboarding chat with transcript persistence and structured profile extraction
- meal-plan creation, retrieval, and refinement with revision tracking
- Freshful catalogue search, product detail normalization, cache recency metadata, and refresh tooling
- shopping-list draft creation, priced item selection, and persisted list retrieval
- request logging, correlation context, AI usage metering, budget controls, and Freshful request throttling

## Stack

- Runtime: Node.js and TypeScript
- HTTP layer: Fastify
- Validation and contracts: Zod plus `@freshful/contracts`
- Database: PostgreSQL via `postgres` and `drizzle-orm`
- Migrations: `drizzle-kit` plus checked-in SQL under `drizzle/`
- Test persistence: `@electric-sql/pglite` applying the real migrations in memory

## Main Modules

- `src/app.ts`: application factory, route registration, auth middleware, and service wiring
- `src/index.ts`: production entrypoint that starts the bound server
- `src/config.ts`: validated backend runtime configuration
- `src/db/`: database config, client creation, schema, and migration runner
- `src/auth/`: Google verification, user repository, JWT session issue and verify flow
- `src/onboarding/`: chat transcript persistence and structured profile extraction
- `src/planner/`: plan creation, retrieval, refinement, and revision history
- `src/freshful/`: catalogue client, normalization, cache policy, and refresh runner
- `src/shopping/`: ingredient aggregation, priced list generation, and persistence
- `src/ai/`: Anthropic client, prompt assembly, routing, parsing, and budget controls

## Key Routes

The current HTTP surface includes:

- `GET /health`
- `POST /auth/google`
- `GET /profile`
- `PUT /profile`
- `POST /ai/onboarding-chat`
- `POST /plans`
- `GET /plans/:id`
- `POST /plans/:id/refine`
- `POST /plans/:id/shopping-list`
- `GET /shopping-lists/:id`

All user-specific routes are scoped from the backend-issued bearer token rather than client-supplied user IDs.

## Local Setup

1. Create `apps/api/.env` if it does not already exist.

```bash
npm run env:bootstrap
```

2. Fill in the required local values.

3. Start PostgreSQL.

```bash
npm run db:dev:up --workspace @freshful/api
```

4. Apply migrations.

```bash
npm run db:migrate --workspace @freshful/api
```

5. Start the API.

```bash
npm run start --workspace @freshful/api
```

The default local port is `3000` unless overridden in `apps/api/.env`.

## Environment Variables

The checked-in `apps/api/.env.example` lists the full runtime contract.

Required groups are:

- runtime mode and port: `APP_ENV`, `PORT`
- database access: `DATABASE_URL`
- app-session signing: `APP_SESSION_SECRET`, `APP_SESSION_TTL_SECONDS`
- Google auth verification: `GOOGLE_WEB_CLIENT_ID`
- Anthropic access and routing: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_VERSION`, model names, prompt and output limits, routing thresholds, and budget settings
- Freshful integration controls: `FRESHFUL_BASE_URL`, `FRESHFUL_SEARCH_PATH`, timeout, retry, and minimum request interval values

Keep all live secrets in untracked local env files or deployment secret managers. Nothing from this file should be copied into `apps/mobile/.env` unless it is explicitly client-safe.

## Commands

- `npm run start --workspace @freshful/api`: start the Fastify server
- `npm run typecheck --workspace @freshful/api`: run the backend TypeScript check
- `npm run db:dev:up --workspace @freshful/api`: start the local PostgreSQL container
- `npm run db:dev:down --workspace @freshful/api`: stop and remove the local PostgreSQL container
- `npm run db:generate --workspace @freshful/api`: generate Drizzle SQL migrations from schema changes
- `npm run db:migrate --workspace @freshful/api`: apply migrations using `DATABASE_URL`
- `npm run freshful:refresh --workspace @freshful/api`: refresh stale Freshful cache entries
- `npm run freshful:refresh --workspace @freshful/api -- --mode=all --search-limit=25 --product-limit=25`: refresh the oldest cached entries regardless of freshness
- `npm run freshful:refresh --workspace @freshful/api -- --query=lapte --product=100003632:100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l`: refresh explicit catalogue targets

## Database And Cache Operations

Persistence and catalogue behavior are intentionally explicit:

- Generated SQL lives in `drizzle/` and should stay in sync with `src/db/schema.ts`.
- Local development uses Docker Compose PostgreSQL.
- Tests use PGlite and the real SQL migrations rather than a parallel schema stub.
- Every normalized Freshful product stores `lastSeenAt`.
- Search results use a 15-minute freshness target.
- Product detail records use a 6-hour freshness target.
- Stale fallback reads are allowed for up to 24 hours when Freshful is temporarily unavailable.

See `src/freshful/README.md` for the adapter contract and anti-fragility notes.

## Validation Strategy

For backend-focused changes, the usual command set is:

```bash
npm run hooks:validate
npm run lint
npm run typecheck --workspace @freshful/api
npm run test:backend
```

Add these when relevant:

- `npm run test:persistence` when touching schema, migrations, or ownership rules
- `npm test` when a change can affect default root validation coverage

The root backend tests cover auth, onboarding, planner, shopping, Freshful integration, persistence, and runtime-config behavior.

## Operational Notes

- `src/app.ts` exports the app factory so tests can use `app.inject()` without binding a real port.
- Structured error payloads follow the shared contracts package.
- Request logging includes correlation-friendly metadata such as request ID, method, URL, status code, and duration.
- Anthropic usage is budgeted and metered before upstream calls are allowed.
- Freshful access is intentionally conservative because the integration depends on public storefront behavior rather than a public partner API.

## Current Limitations

- Freshful support is read-only catalogue integration. User login, cart mutation, checkout, and address-bound sessions are not implemented.
- Pricing is estimate-oriented and depends on Freshful cache recency.
- The API assumes valid local Google and Anthropic credentials for non-mocked development flows.
- Application-level field encryption is not introduced yet; the current boundary is authenticated access control plus database or infrastructure encryption at rest.
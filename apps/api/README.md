# API Workspace

This workspace now includes the persistence foundation for P2-S2 using PostgreSQL, Drizzle ORM, and generated SQL migrations.

## Persistence Stack

- Runtime driver: `postgres`
- ORM and schema management: `drizzle-orm`
- Migration generation: `drizzle-kit`
- Local development database: `docker compose` with PostgreSQL 16 in `compose.yaml`
- Test database: in-memory `@electric-sql/pglite` with the generated SQL migrations applied during tests

## Commands

- `npm run db:dev:up --workspace @freshful/api` starts a local PostgreSQL instance
- `npm run db:generate --workspace @freshful/api` generates SQL migrations from the TypeScript schema without requiring a live database
- `npm run db:migrate --workspace @freshful/api` applies the generated migrations to the database identified by `DATABASE_URL`

## Local Setup

1. Ensure `apps/api/.env` exists. `npm run env:bootstrap` will create it from the example file if needed.
2. Start PostgreSQL with `npm run db:dev:up --workspace @freshful/api`.
3. Generate or refresh migrations with `npm run db:generate --workspace @freshful/api`.
4. Apply them with `npm run db:migrate --workspace @freshful/api`.

Sensitive profile and transcript fields are explicitly marked in the schema metadata so later service layers can enforce stricter handling around health-related profile data and raw chat content.

## Runtime Configuration

The backend now uses a validated runtime config loader in `src/config.ts`. It reads `apps/api/.env`, applies safe defaults for local development where appropriate, and refuses to start when required values are missing or malformed.

Database-only tooling uses `src/db/config.ts`, which validates only `DATABASE_URL` so migrations and other persistence flows do not require unrelated backend secrets.

Required backend environment variables:

- `APP_ENV`: `development`, `test`, or `production`
- `PORT`: local API port for the backend runtime
- `DATABASE_URL`: PostgreSQL connection string for Drizzle and runtime access
- `GOOGLE_WEB_CLIENT_ID`: Google OAuth client ID used for backend token verification in later auth steps
- `ANTHROPIC_API_KEY`: server-side Claude access key; never expose this to the mobile app
- `FRESHFUL_BASE_URL`: Freshful origin used by the backend integration layer
- `FRESHFUL_SEARCH_PATH`: relative catalogue search path used by the Freshful adapter baseline
- `FRESHFUL_REQUEST_TIMEOUT_MS`: request timeout budget for Freshful catalogue calls

Secret handling rules for this workspace:

- Keep live `DATABASE_URL` and `ANTHROPIC_API_KEY` values in local `.env` files or deployment secret stores only.
- Commit only `.env.example` templates with placeholder values.
- Do not mirror third-party secrets into `apps/mobile/.env`; the mobile runtime should only receive safe client-visible values.

## HTTP Foundation

P3-S1 adds a Fastify-based HTTP shell that keeps startup and tests separate:

- `src/app.ts` exports `createApiApp()` so tests can instantiate the server without binding a real port.
- `src/index.ts` starts the real HTTP server only when the workspace entrypoint is executed directly.
- `GET /health` provides a smoke-testable readiness endpoint with environment metadata and placeholder service wiring for auth, AI, planner, and Freshful modules.
- Request and response logging hooks emit structured fields for request ID, method, URL, status code, and duration.
- Structured error payloads follow the shared contracts package so later modules can fail consistently.

To start the backend foundation locally after bootstrapping env files:

- `npm run start --workspace @freshful/api`

To smoke-test the foundation without a bound port, use the root test suite, which exercises Fastify through `app.inject()`.
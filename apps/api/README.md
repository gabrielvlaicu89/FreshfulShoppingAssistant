# API Workspace

This workspace now includes the persistence foundation from P2-S2 plus the backend auth slice from P3-S2.

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
- `APP_SESSION_SECRET`: symmetric signing secret for app-issued JWT sessions; use at least 32 characters
- `APP_SESSION_TTL_SECONDS`: app session lifetime used for issued JWT access tokens
- `GOOGLE_WEB_CLIENT_ID`: Google OAuth client ID used for backend token verification in later auth steps
- `ANTHROPIC_API_KEY`: server-side Claude access key; never expose this to the mobile app
- `FRESHFUL_BASE_URL`: Freshful origin used by the backend integration layer
- `FRESHFUL_SEARCH_PATH`: relative Freshful shop search prefix used by the adapter runtime, currently `/api/v2/shop/search`
- `FRESHFUL_REQUEST_TIMEOUT_MS`: request timeout budget for Freshful catalogue calls

## Freshful Cache Refresh

P7-S3 adds explicit recency evaluation for cached search results and product detail records:

- Search cache TTL: 15 minutes
- Product detail TTL: 6 hours
- Stale fallback window for degraded reads: 24 hours from the last successful Freshful observation

Every normalized Freshful product persists `lastSeenAt`, and search cache envelopes now expose computed recency metadata so upstream shopping-list pricing logic can distinguish fresh versus stale estimates.

To refresh cached catalogue data on demand or from a scheduler:

- `npm run freshful:refresh --workspace @freshful/api` refreshes stale cached searches and product details.
- `npm run freshful:refresh --workspace @freshful/api -- --mode=all --search-limit=25 --product-limit=25` refreshes the oldest cached records regardless of freshness.
- `npm run freshful:refresh --workspace @freshful/api -- --query=lapte --product=100003632:100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l` forces an on-demand refresh for explicit targets.

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

## Auth Endpoint

P3-S2 adds server-side Google token verification and local app session issuance:

- `POST /auth/google` accepts `{ "idToken": "..." }`.
- The backend verifies the Google ID token against `GOOGLE_WEB_CLIENT_ID`.
- The local `users` row is created or updated using the verified Google subject and profile fields.
- The response returns app-scoped session material for the mobile client: a signed bearer JWT plus the local user snapshot.

The issued JWT is intentionally app-scoped rather than a pass-through Google token. It uses the backend-managed `APP_SESSION_SECRET`, includes issuer and expiry claims, and is suitable for later protected-route middleware in P3-S3.

## Profile Endpoints

P3-S3 adds authenticated profile reads and writes:

- `GET /profile` returns the authenticated user's structured household profile or `null` when no profile has been saved yet.
- `PUT /profile` accepts the shared household profile shape except for server-owned `userId` and `rawChatHistoryId`, which are derived and managed by the backend.

Sensitive-data handling for this step is explicit:

- Dietary restrictions, allergy data, medical flags, and related profile fields stay server-side in the `household_profiles` table.
- Access is scoped only from the backend-issued app JWT subject; clients do not provide a user ID.
- When a profile is first created through `PUT /profile`, the backend creates a placeholder transcript record that does not duplicate the sensitive field values. This preserves the current schema contract without copying health-related content into transcript history.
- Application-level field encryption is not introduced in this step. The current boundary relies on authenticated access control plus database or infrastructure encryption at rest.

To start the backend foundation locally after bootstrapping env files:

- `npm run start --workspace @freshful/api`

To smoke-test the foundation without a bound port, use the root test suite, which exercises Fastify through `app.inject()`.
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
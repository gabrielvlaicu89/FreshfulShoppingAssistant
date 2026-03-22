# P1-S1 Architecture Note: Workspace Layout and Stack

This note locks the initial product workspace and stack choices for the Freshful Shopping Assistant before any app scaffolding begins.

## Inputs That Drive These Decisions

- DESCRIPTION.md requires an Android-first React Native client, a Node/TypeScript backend, Google Sign-In, Anthropic Claude integration, Freshful reverse-engineered backend integration, shared schemas, and both local and backend persistence.
- The repository currently contains only orchestration markdown, JSON config, and Node helper scripts driven from the root package.json.
- PLAN.md step P1-S1 requires a minimal architecture note and explicitly avoids scaffolding product code in this step.

## Locked Decisions

| Area | Decision | Why it fits DESCRIPTION.md and current repo constraints |
| --- | --- | --- |
| Monorepo layout | Use an npm-workspaces monorepo rooted in this repository with `apps/mobile`, `apps/api`, and `packages/*`. | DESCRIPTION.md needs a mobile client, backend API, and shared contracts. Keeping everything in the existing repository preserves the orchestration assets already wired to the root Node workspace. |
| Package manager | Standardize on `npm` and npm workspaces. | The current repository already uses npm scripts for planning and validation. Sticking with npm avoids an unnecessary package-manager migration before any product code exists. |
| Backend framework | Build the backend in TypeScript on Fastify. | DESCRIPTION.md recommends Node/TypeScript and describes a JSON-heavy API with auth, AI orchestration, and adapter services. Fastify gives a lean HTTP layer, strong schema-driven request handling, and a clean plugin structure without fighting the existing Node-first repo. |
| Mobile bootstrap strategy | Bootstrap the Android-first client with the React Native Community CLI TypeScript template in `apps/mobile`, not Expo-managed as the primary runtime. | DESCRIPTION.md calls for Google Sign-In, secure local storage, and Android-first delivery. A bare React Native app keeps native-module and Android build control straightforward from day one, which is safer than starting with a more restrictive managed runtime. |
| Shared package layout | Start with `packages/contracts` for shared schemas, API payloads, and domain types; add other shared packages only when a later step proves the need. | DESCRIPTION.md explicitly requires shared schemas across mobile and backend. The repo is still boilerplate-only, so one focused shared package keeps the first scaffold minimal and avoids premature abstractions. |
| Environment file strategy | Keep environment loading package-local: `apps/api/.env` for backend secrets, `apps/mobile/.env` for mobile runtime config that contains no third-party secrets, and root-level `.env.example` files to document required variables. | DESCRIPTION.md keeps Anthropic and Freshful access server-side, so those secrets belong only in the backend. The mobile app still needs non-secret config such as API base URL and Google client identifiers. Documenting variables with examples fits the current lightweight repo setup. |
| Initial persistence choice | Use PostgreSQL as the backend system of record, while the mobile app stores only session and cache data locally using secure storage for sensitive values and a lightweight local cache for non-sensitive data. | DESCRIPTION.md requires backend persistence for profiles, plans, shopping lists, and cached integration data, plus local device reuse. PostgreSQL is a solid default for relational user and planning data, and the local/mobile split keeps secrets out of plain device storage while matching the Android-first app flow. |

## Target Initial Repository Shape

```text
.
├── apps/
│   ├── api/
│   └── mobile/
├── packages/
│   └── contracts/
├── docs/
│   └── architecture/
├── .ai/
├── .github/
├── scripts/
├── DESCRIPTION.md
├── PLAN.md
├── README.md
└── package.json
```

## Boundaries Established By This Note

- Freshful integration stays backend-only; the mobile app does not call Freshful directly.
- Anthropic access stays backend-only; the mobile app never receives Claude API credentials.
- Shared code must remain cross-runtime safe inside `packages/contracts`; no Node-only or React Native-only dependencies belong there.
- The next scaffolding step should create only the workspaces implied above and wire them into the existing root npm workflow.
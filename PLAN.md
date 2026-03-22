# Freshful Shopping Assistant Execution Plan

## Project Overview

This repository currently contains the Copilot orchestration boilerplate, helper scripts, and workflow metadata, but none of the mobile app, backend API, shared contracts, Freshful integration, or Anthropic integration described in DESCRIPTION.md. The plan below converts that specification into a phased implementation sequence that starts by choosing and scaffolding the actual application stack, then builds core product flows in small execution slices.

## Assumptions

- The implementation will stay in this repository and evolve the existing Node-based boilerplate into a product monorepo rather than moving to a new repository.
- TypeScript will be used across backend, shared packages, and the React Native Android client unless a later approved step explicitly changes that decision.
- The mobile client targets Android first, with iOS support deferred unless later requested.
- Freshful integration will begin with anonymous or generic-location catalogue access and shopping-list generation only; cart autofill remains a later enhancement.
- Google Sign-In and Anthropic access will require developer-owned credentials that are not yet present in the repository.
- Root validation commands in .ai/orchestrator.config.json will need to be made real as the product scaffold is added.

## Phase Index

- P1: Foundation and stack decisions
- P2: Shared contracts and data persistence foundation
- P3: Backend platform and authentication
- P4: Mobile application shell and authenticated session flow
- P5: AI onboarding and household profile capture
- P6: Meal plan generation and refinement
- P7: Freshful catalogue integration
- P8: Shopping list generation and product mapping
- P9: Operational hardening, testing, and documentation

## Phase P1 - Foundation and Stack Decisions

- [x] P1-S1: Decide the production workspace layout and implementation stack
	Owner: Coder
	Depends on: None
	Acceptance: A short architecture note is added that locks the monorepo layout, package manager, backend framework, mobile app bootstrap strategy, shared package layout, environment file strategy, and the initial persistence choice, with every decision traceable back to DESCRIPTION.md and current repo constraints.
	Tests: Run npm run plan:summary and npm run hooks:validate; confirm the documented choices do not break the existing orchestration scripts.
	Review: Approved; reviewer confirmed the chosen stack is consistent with DESCRIPTION.md, the current boilerplate, and Android-first delivery.

- [x] P1-S2: Scaffold product workspaces for backend, mobile, and shared packages
	Owner: Coder
	Depends on: P1-S1
	Acceptance: The repository gains the agreed application directories and package manifests for the backend, mobile app, and shared contracts without removing the existing orchestration assets, and root package management is updated so all workspaces install and resolve together.
	Tests: Install dependencies successfully, then run npm run hooks:validate plus any newly introduced root lint and typecheck commands.
	Review: Approved; reviewer confirmed the scaffold is minimal, reproducible, and does not damage the existing planning automation.

- [x] P1-S3: Establish baseline developer workflows and validation commands
	Owner: Coder
	Depends on: P1-S2
	Acceptance: Root scripts and configuration exist for linting, typechecking, testing, formatting policy, environment bootstrapping, and local startup so the orchestrator config can point to real product validation commands.
	Tests: Run the new root lint, typecheck, and test commands successfully along with npm run hooks:validate.
	Review: Approved; reviewer confirmed the commands are deterministic and suitable for tester-agent use.

## Phase P2 - Shared Contracts and Data Persistence Foundation

- [x] P2-S1: Define shared domain schemas for profiles, plans, products, and shopping lists
	Owner: Coder
	Depends on: P1-S3
	Acceptance: Shared TypeScript contracts and validation schemas exist for household profiles, onboarding transcripts, recipes, meal plans, Freshful products, shopping lists, and error payloads, and both mobile and backend packages can import them.
	Tests: Add schema-focused unit tests and run root typecheck and test commands.
	Review: Approved; reviewer confirmed the shared contracts now cover the onboarding profile, planning, product, shopping list, and error entities required by DESCRIPTION.md without broadening the scope unnecessarily.

- [x] P2-S2: Bootstrap backend persistence and migration tooling
	Owner: Coder
	Depends on: P2-S1
	Acceptance: The backend includes a configured database layer, migration workflow, local development configuration, and initial tables or collections for users, household profiles, meal plans, shopping lists, Freshful products, and cached search results.
	Tests: Run migration generation or apply commands in the local environment and execute backend persistence tests plus root typecheck.
	Review: Approved; reviewer confirmed the PostgreSQL schema, migration flow, and ownership constraints support the current scope and keep sensitive profile and transcript handling explicit.

- [x] P2-S3: Add repository-level configuration for secrets and environment separation
	Owner: Coder
	Depends on: P2-S2
	Acceptance: Example environment files, config loaders, and secret-handling documentation exist for mobile and backend runtimes, covering Google auth, Anthropic access, database connectivity, and Freshful integration settings without committing live secrets.
	Tests: Run config loading tests or startup smoke checks and confirm npm run hooks:validate still passes.
	Review: Approved; reviewer confirmed the repo-level env templates, backend and mobile config loaders, and documentation now enforce the intended client/server secret boundary without committing live credentials.

## Phase P3 - Backend Platform and Authentication

- [ ] P3-S1: Build the backend HTTP foundation and service composition shell
	Owner: Coder
	Depends on: P2-S3
	Acceptance: The backend exposes a health route, structured error handling, request validation, configuration bootstrapping, logging hooks, and a service wiring pattern that can host auth, AI, planner, and Freshful modules.
	Tests: Add backend smoke tests for startup and health responses, then run root lint, typecheck, and test commands.
	Review: Required; reviewer verifies the HTTP foundation is production-oriented and easy to extend.

- [ ] P3-S2: Implement Google token verification and app session issuance
	Owner: Coder
	Depends on: P3-S1
	Acceptance: POST /auth/google verifies Google identity tokens server-side, creates or updates the local user record, and returns the app session material required by the mobile client.
	Tests: Add unit and integration tests for valid, invalid, and expired token cases; run backend auth tests and root validation commands.
	Review: Required; reviewer verifies token handling, session boundaries, and failure cases.

- [ ] P3-S3: Implement secure profile read and update endpoints
	Owner: Coder
	Depends on: P3-S2
	Acceptance: Authenticated profile fetch and update endpoints persist the structured household profile, protect user isolation, and support encrypted or otherwise explicit handling of sensitive dietary and health-related fields.
	Tests: Add integration tests for authorized, unauthorized, and validation-failure flows; run root typecheck and test commands.
	Review: Required; reviewer verifies profile storage matches the shared schemas and privacy requirements.

## Phase P4 - Mobile Application Shell and Authenticated Session Flow

- [ ] P4-S1: Scaffold the React Native Android app shell with navigation and shared state
	Owner: Coder
	Depends on: P1-S3
	Acceptance: The mobile workspace boots on Android, includes navigation, state management, server-state fetching, environment configuration, and a small design system shell aligned with the Freshful assistant product.
	Tests: Run the mobile typecheck and test suite, plus any Android startup smoke check introduced by the scaffold.
	Review: Required; reviewer verifies the shell is lean, Android-first, and ready for authenticated flows.

- [ ] P4-S2: Implement Google Sign-In and authenticated app bootstrap
	Owner: Coder
	Depends on: P3-S2, P4-S1
	Acceptance: Users can sign in with Google from the mobile app, exchange the token with the backend, persist the app session securely, and restore the session on relaunch.
	Tests: Add mobile auth tests or mocked integration tests, then run root lint, typecheck, and test commands.
	Review: Required; reviewer verifies secure token storage, logout handling, and backend integration behavior.

- [ ] P4-S3: Build the initial dashboard and local profile cache flow
	Owner: Coder
	Depends on: P3-S3, P4-S2
	Acceptance: The authenticated app shows a home dashboard with profile summary and placeholder actions for planning and shopping lists, and it can cache the latest profile locally using the chosen secure or local storage split.
	Tests: Add screen and state tests for dashboard rendering, empty states, and session restoration; run mobile and root validation commands.
	Review: Required; reviewer verifies the dashboard reflects current backend data and offline-friendly cache behavior.

## Phase P5 - AI Onboarding and Household Profile Capture

- [ ] P5-S1: Implement the Anthropic client wrapper, prompt templates, and model routing baseline
	Owner: Coder
	Depends on: P3-S1, P2-S3
	Acceptance: The backend includes a single Claude service abstraction with prompt templates, structured response parsing, model-selection rules for Haiku and Sonnet, and clear configuration for usage limits and error handling.
	Tests: Add unit tests for prompt assembly, model routing, and parser fallback behavior; run backend and root validation commands.
	Review: Required; reviewer verifies the AI layer is reusable, cost-aware, and does not expose secrets to the mobile app.

- [ ] P5-S2: Add the onboarding chat endpoint that produces transcript and structured profile output
	Owner: Coder
	Depends on: P5-S1, P3-S3, P2-S1
	Acceptance: The backend onboarding chat endpoint accepts user messages, persists transcript history, returns assistant replies, and emits validated structured profile updates that can be saved to the user record.
	Tests: Add integration tests with mocked Anthropic responses for happy-path, partial-profile, and invalid-LLM-output cases; run root typecheck and test commands.
	Review: Required; reviewer verifies chat state, schema validation, and profile persistence behavior.

- [ ] P5-S3: Build the mobile onboarding chat and profile confirmation flow
	Owner: Coder
	Depends on: P5-S2, P4-S3
	Acceptance: The mobile app presents the onboarding chat, streams or polls assistant responses appropriately, shows the evolving structured profile, and lets the user confirm or revise the captured household data.
	Tests: Add mobile UI tests for message rendering, loading states, error recovery, and profile confirmation; run root lint, typecheck, and test commands.
	Review: Required; reviewer verifies the onboarding experience covers all required profile fields from DESCRIPTION.md.

## Phase P6 - Meal Plan Generation and Refinement

- [ ] P6-S1: Implement meal plan generation service and persistence
	Owner: Coder
	Depends on: P5-S1, P2-S2, P2-S1
	Acceptance: The backend can create a structured 1-to-7-day meal plan from a saved profile and request options, validate the generated JSON, and persist plan templates or dated instances in the database.
	Tests: Add unit and integration tests for schema validation, plan creation, and persistence; run root typecheck and test commands.
	Review: Required; reviewer verifies the generated plan structure matches the contract and handles invalid AI output safely.

- [ ] P6-S2: Add plan retrieval and refinement endpoints with revision tracking
	Owner: Coder
	Depends on: P6-S1
	Acceptance: Authenticated endpoints exist to fetch a saved plan and request AI-driven refinements such as recipe swaps, ingredient exclusions, and macro changes while preserving revision history.
	Tests: Add integration tests for fetch, refine, and revision-history flows; run backend and root validation commands.
	Review: Required; reviewer verifies refinements are traceable and user-scoped.

- [ ] P6-S3: Build the mobile plan creation, detail, and refine experience
	Owner: Coder
	Depends on: P6-S2, P4-S3
	Acceptance: Users can request a plan horizon and meal types, view a generated plan by day and meal slot, and submit refinement prompts from the app with visible loading, failure, and revision states.
	Tests: Add mobile screen tests for create, view, and refine flows; run root lint, typecheck, and test commands.
	Review: Required; reviewer verifies the plan UX supports the described core flow without leaking backend internals.

## Phase P7 - Freshful Catalogue Integration

- [ ] P7-S1: Capture the Freshful integration contract and reverse-engineering findings
	Owner: Coder
	Depends on: P1-S1
	Acceptance: A backend-facing integration note or module README documents the discovered Freshful search and product-detail request patterns, anti-fragility constraints, caching expectations, and the normalized adapter interface used by the product code.
	Tests: Verify the documented request samples and adapter contract are covered by unit tests or fixtures where possible, then run npm run hooks:validate.
	Review: Required; reviewer verifies the findings are sufficient to implement catalog reads without overcommitting to unsupported cart flows.

- [ ] P7-S2: Implement the cached Freshful adapter for product search and product details
	Owner: Coder
	Depends on: P7-S1, P2-S2, P3-S1
	Acceptance: The backend exposes a Freshful adapter that can search products, fetch product details, normalize the results, cache responses, and surface freshness metadata or fallback errors to upstream services.
	Tests: Add adapter unit tests plus HTTP-integration tests against recorded fixtures or mocks; run root typecheck and test commands.
	Review: Required; reviewer verifies caching, normalization, and low-volume access expectations.

- [ ] P7-S3: Add catalog refresh utilities and cache recency policy enforcement
	Owner: Coder
	Depends on: P7-S2
	Acceptance: The backend includes a repeatable mechanism for on-demand or scheduled catalog refreshes, and product records clearly track last-seen timestamps so shopping-list estimates can declare stale prices.
	Tests: Add tests for recency evaluation and refresh workflows; run backend and root validation commands.
	Review: Required; reviewer verifies the cache policy matches the fragility described in DESCRIPTION.md.

## Phase P8 - Shopping List Generation and Product Mapping

- [ ] P8-S1: Implement ingredient aggregation and shopping-list draft generation
	Owner: Coder
	Depends on: P6-S1, P2-S1
	Acceptance: The backend can aggregate ingredient quantities across a meal plan, normalize measurement units enough for v1 list generation, and create a persisted shopping-list draft tied to the originating plan.
	Tests: Add unit tests for ingredient merging and integration tests for shopping-list draft creation; run root typecheck and test commands.
	Review: Required; reviewer verifies quantity aggregation is deterministic and handles repeated ingredients safely.

- [ ] P8-S2: Implement AI-assisted Freshful product selection and priced shopping lists
	Owner: Coder
	Depends on: P8-S1, P7-S2, P5-S1
	Acceptance: The backend can search Freshful for ingredient candidates, choose recommended SKUs using deterministic rules plus Claude assistance where needed, and return a shopping list with price estimates, product metadata, and unresolved-item handling.
	Tests: Add integration tests with mocked Freshful and Anthropic responses covering matched, ambiguous, and unresolved ingredients; run backend and root validation commands.
	Review: Required; reviewer verifies the selection logic is explainable, resilient, and within the v1 scope.

- [ ] P8-S3: Build the mobile shopping-list screen and Freshful handoff CTA
	Owner: Coder
	Depends on: P8-S2, P4-S3
	Acceptance: The mobile app displays the generated shopping list grouped by category, shows quantity and estimated cost information, and offers a clear action to open Freshful web or app without attempting unsupported cart autofill.
	Tests: Add mobile screen tests for grouped list rendering, unresolved items, and handoff actions; run root lint, typecheck, and test commands.
	Review: Required; reviewer verifies the list UI matches the current backend capability and clearly labels estimate-only pricing.

## Phase P9 - Operational Hardening, Testing, and Documentation

- [ ] P9-S1: Add observability, AI budget controls, and request-rate safeguards
	Owner: Coder
	Depends on: P5-S1, P7-S2, P8-S2
	Acceptance: The backend includes structured logging, request correlation, Anthropic usage metering, per-user or global budget controls, and rate limiting or backoff protections around Freshful access.
	Tests: Add unit and integration coverage for limits and fallback behavior; run root lint, typecheck, and test commands.
	Review: Required; reviewer verifies the safeguards align with cost and fragility constraints in DESCRIPTION.md.

- [ ] P9-S2: Expand automated test coverage across backend, mobile, and shared packages
	Owner: Coder
	Depends on: P6-S3, P8-S3, P9-S1
	Acceptance: The repository has a coherent automated test strategy covering shared schemas, backend services, integration boundaries, and the most important mobile screens, with root commands exercising the intended default suite.
	Tests: Run the full root lint, typecheck, and test commands; include any package-level integration suites required by the new harness.
	Review: Required; reviewer verifies coverage is targeted at the highest-risk product flows rather than broad but shallow checks.

- [ ] P9-S3: Refresh repository documentation and operational guidance for the real product
	Owner: Coder
	Depends on: P9-S2
	Acceptance: README.md and supporting docs describe the actual Freshful Shopping Assistant stack, setup, environment requirements, validation commands, workflow expectations, and known v1 limitations instead of the current boilerplate-only positioning.
	Tests: Run npm run hooks:validate and confirm setup instructions match the working workspace commands.
	Review: Required; reviewer verifies the documentation reflects the implemented system rather than the original starter template.

## Review Summary

- Overall status: In progress.
- Last reviewed item: P2-S2.
- Last review outcome: approved.
- Review before completion: Required for every step, per .ai/orchestrator.config.json.
- Maximum coder retries from tester: 2.
- Maximum coder retries from reviewer: 2.

## Completion Notes

- PLAN.md has been refreshed from an empty file into an execution-ready phased plan.
- P1-S1 is complete and approved; the architecture stack note was added in docs/architecture/p1-s1-workspace-stack.md.
- P1-S2 is complete and approved; the workspace scaffold now covers apps/api, apps/mobile, and packages/contracts with npm workspace wiring.
- P1-S3 is complete and approved; root lint, test, format policy, env bootstrap, and startup commands are now defined for the scaffolded monorepo.
- P2-S1 is complete and approved; @freshful/contracts now exports shared zod schemas and types for onboarding profiles, meal plans, Freshful products, shopping lists, and API error payloads.
- P2-S2 is complete and approved; apps/api now has PostgreSQL schema, Drizzle migrations, local compose config, and tested ownership-safe persistence tables for users, profiles, plans, shopping lists, products, and cached search results.
- The next actionable step is P2-S3.







# AI Grocery Shopping Assistant – Architecture Overview

## 1. Vision and Scope

This project is an AI‑powered Android app (React Native) that helps Romanian users plan meals and generate optimized grocery shopping lists, initially integrated **only with Freshful by eMAG**. [gadget](https://gadget.ro/freshful-by-emag-platforma-online-de-livrare-produse-alimentare-la-domiciliu/)

Goals:

- Collect a rich household and dietary profile via an AI chat experience.
- Generate 1–7 day meal plans tailored to that profile.
- Refine plans interactively with the user.
- Map plans to **Freshful** products and produce a ready‑to‑shop list (and later, an auto‑filled cart).
- Minimize LLM costs via model routing (Claude Haiku/Sonnet/Opus) while keeping UX smooth. [intuitionlabs](https://intuitionlabs.ai/articles/claude-pricing-plans-api-costs)

Initial constraints:

- Platform: **Android** (React Native).
- Auth: **Google Sign‑In only**.
- Store coverage: **Freshful.ro** (București/Ilfov delivery coverage). [freshful](https://www.freshful.ro/info/despre)
- No official public API from Freshful → use a **backend scraper / reverse‑engineered front‑end API**. [scrapewise](https://scrapewise.ai/blogs/web-scraping-vs-api-retail-data-2026-guide)
- AI provider: **Anthropic Claude API** (user may optionally bring their own key, but app will typically use your backend’s key). [obot](https://obot.ai/resources/learning-center/claude-api/)

***

## 2. Core User Flows

### 2.1 Onboarding and Profile Creation

1. User opens app and signs in with **Google**.
2. App sets the **preferred store** to Freshful (only option for v1).
3. User is guided through an **AI chatbot** onboarding:
   - Household: single / couple / family, number of kids.
   - Dietary restrictions: vegetarian, vegan, gluten‑free, allergies.
   - Medical flags: diabetes, hypertension, etc. (high‑level, non‑diagnostic).
   - Health goals: weight loss, maintenance, muscle gain.
   - Food preferences: cuisines, favorite ingredients, disliked items.
   - Budget and time constraints (e.g., “simple meals under 30 minutes”).

4. Chatbot produces both:
   - A **structured profile object** (JSON with typed fields).
   - A saved **chat transcript** for future context.

5. Profile is stored:
   - Locally on device (encrypted storage) for fast reuse.
   - In the backend DB (encrypted at rest) for server‑side planning and analytics.

### 2.2 Meal Plan Generation and Refinement

1. User selects:
   - Planning horizon: **1 day to 7 days**.
   - Meal types: breakfast / lunch / dinner / snacks.
2. App sends a **plan request** (profile + user options) to backend.
3. Backend calls **Claude** to generate a draft **structured meal plan**:
   - Days → meals → recipes with ingredients, approximate amounts, and nutritional estimates.
4. Plan is shown in the app:
   - User can chat with the AI to:
     - Swap recipes.
     - Exclude ingredients.
     - Adjust calories/macros.
5. Each revision is saved as:
   - A **MealPlanTemplate** linked to the user profile.
   - Optionally as a **dated instance** if user wants to bind to specific calendar days.

### 2.3 Shopping List Generation (Freshful)

1. When user confirms a plan, client sends the plan ID to backend for **shopping list generation**.
2. Backend:
   - Extracts all ingredients and aggregates quantities across the plan.
   - Calls **Freshful integration** to find the best matching products:
     - Search API (reverse‑engineered) → list of candidate SKUs per ingredient.
     - Claude (cheap model) helps pick optimal SKUs given constraints (dietary, brand, price).
3. Backend returns a **shopping list**:
   - Each line includes: product name, quantity, price estimate, section/category.
   - Shows estimated total cost.
4. v1 behavior:
   - The app **displays the list**, possibly grouped by categories (fruits, dairy, etc.).
   - User manually copies/uses the list in Freshful app or web.
5. Future behavior:
   - Backend uses Freshful’s **internal cart endpoints** (via user session) to pre‑fill the user’s cart, then deep‑links them to Freshful for payment and delivery slot selection.

***

## 3. High‑Level Architecture

### 3.1 Components

- **React Native App (Android)**  
  - UI, chat interface, meal/recipe viewing, shopping list display.
  - Google Sign‑In and token handling.
  - Local encrypted storage for profile and recent plans/lists.

- **Backend API** (Node.js/TypeScript recommended)
  - Auth: verify Google ID tokens.
  - **AI Service**: unified interface to Anthropic Claude models, handling prompts and model selection.
  - **FreshfulAdapter**: encapsulates all interactions with Freshful’s web/“hidden APIs”.
  - **Planner Service**: orchestrates plan creation, refinement, and ingredient mapping.
  - **Caching Layer**: product and search result cache (DB + in‑memory).

- **External Services**
  - **Anthropic Claude API** for LLM calls (Haiku/Sonnet/Opus). [intuitionlabs](https://intuitionlabs.ai/articles/claude-pricing-plans-api-costs)
  - **Freshful.ro** consumer site / apps, accessed via reverse‑engineered JSON endpoints rather than formal public APIs. [brightdata](https://brightdata.com/blog/web-data/web-scraping-vs-api)
  - Optional: Redis or similar for short‑term in‑memory caching.

***

## 4. Mobile App (React Native) Architecture

### 4.1 Tech Choices

- React Native (TypeScript).
- Navigation: React Navigation.
- State management: Zustand or Redux Toolkit, plus React Query for server state.
- Storage:
  - Secure storage (e.g., `react-native-encrypted-storage`) for tokens and sensitive fields.
  - AsyncStorage / MMKV for less sensitive cached data.

### 4.2 Major Screens

- **Auth & Onboarding**
  - Google Sign‑In screen.
  - “Welcome to Freshful assistant” introduction.
  - Profile chat screen (chat UI backed by backend AI endpoint).

- **Home Dashboard**
  - Summary of current profile.
  - Quick actions: “Create 3‑day plan”, “View last plan”, “Generate shopping list”.

- **Plan Management**
  - Plan list (history).
  - Plan detail view (per day, per meal).
  - “Refine with AI” chat overlay for that plan.

- **Shopping List**
  - Active list with groupings (category/aisle).
  - Quantity and substitution suggestions.
  - CTA to open Freshful app/site.

### 4.3 Networking

- App calls backend via REST (or GraphQL if preferred).
- All Freshful and Claude communication is **server‑side** only; the app never sees third‑party API keys or scraping logic.

***

## 5. Backend Services

### 5.1 API Gateway / HTTP Layer

Endpoints (example):

- `POST /auth/google` – verify Google ID token; issue your own JWT or store session.
- `GET /profile` / `PUT /profile` – fetch/update structured user profile.
- `POST /ai/onboarding-chat` – send/receive onboarding chat messages.
- `POST /plans` – create plan for given horizon and options.
- `GET /plans/:id` – retrieve plan (with recipes, ingredients).
- `POST /plans/:id/refine` – refine an existing plan via AI.
- `POST /plans/:id/shopping-list` – generate/update shopping list for a plan.
- `GET /shopping-lists/:id` – fetch saved shopping list.

All endpoints authenticate via the Google‑based session (e.g., your own signed JWT after verifying Google tokens).

### 5.2 AI Service (Claude)

Responsibilities:

- Centralize all calls to Anthropic API.
- Maintain **prompt templates** for:
  - Onboarding questions → structured profile fields.
  - Meal plan generation (with JSON schema).
  - Plan refinement.
  - Ingredient → product mapping choice explanations.

- Implement **model routing**:
  - **Haiku**: lightweight chat and smaller tasks (follow‑up questions, small changes). [obot](https://obot.ai/resources/learning-center/claude-api/)
  - **Sonnet**: default for 3–7 day plans and full shopping list mapping.
  - **Opus**: rarely, for very complex reasoning or power‑user features.

- Enforce usage limits per user and global budgets.

Cost context: Claude API is **metered per token**, with different $/million rates for Haiku, Sonnet, and Opus; new accounts often have a free allowance / credits but production use is paid. [intuitionlabs](https://intuitionlabs.ai/articles/claude-pricing-plans-api-costs)

### 5.3 Planner Service

Responsibilities:

- Convert profile + user options into a **plan prompt** for Claude.
- Validate / post‑process Claude’s JSON output against internal schemas.
- Store:
  - `MealPlanTemplate` (generic 3‑day Mediterranean dinner plan).
  - `MealPlanInstance` (specific dates bound to calendar, optional).
- Provide utilities for:
  - Merging duplicate ingredients across days.
  - Calculating approximate macros and totals.

***

## 6. Freshful Integration (Scraper / Hidden API)

### 6.1 Rationale

Freshful provides a consumer web and mobile app experience but **no documented public grocery API** for third‑party planners. [economedia](https://economedia.ro/emag-a-lansat-freshful-platforma-de-livrari-de-produse-alimentare-la-domiciliu.html)
Therefore, integration is built on:

- Reverse‑engineering JSON endpoints used by the Freshful front‑end.
- Carefully and lightly automating them in a backend service.
- Adding caching and rate‑limiting to avoid heavy load and frequent breakage. [scrapewise](https://scrapewise.ai/blogs/web-scraping-vs-api-retail-data-2026-guide)

### 6.2 FreshfulAdapter Interface

Example TypeScript interface:

```ts
interface FreshfulAdapter {
  // (Optional) Establish or refresh a session for a user
  ensureSession(userId: string): Promise<SessionInfo>;

  // Product search and details
  searchProducts(
    query: string,
    filters?: FreshfulSearchFilters
  ): Promise<Product[]>;

  getProductDetails(productId: string): Promise<Product>;

  // Cart operations (future enhancement)
  getCart(session: SessionInfo): Promise<Cart>;
  addItemsToCart(
    session: SessionInfo,
    items: CartItemInput[]
  ): Promise<Cart>;
}
```

Where:

- `Product` is your normalized product entity (name, price, unit, image, tags).
- `SessionInfo` contains Freshful cookies/tokens bound to that user’s account and address.
- `FreshfulSearchFilters` captures category, brand, price range if needed.

### 6.3 Session Handling

Two stages:

1. **No account manipulation (v1)**  
   - You only **read** catalogue data to propose products and prices.
   - No login or user account manipulation; requests are anonymous or based on a generic location (e.g., a sample București address), as long as Freshful allows product listing without login. [freshful](https://www.freshful.ro/info/livrarea)
   - Cart auto‑fill is deferred.

2. **Per‑user sessions (later)**  
   - User authenticates to Freshful via your app (webview or secure embedded login).
   - Backend securely stores per‑user session cookies.
   - Adapter uses those to:
     - Respect their zone/coverage.
     - Manipulate their actual cart.

### 6.4 Scraping / Reverse‑Engineering Strategy

- Use desktop DevTools to:
  - Capture network traffic during search, category browsing, and cart actions.
  - Identify JSON endpoints and query parameters (e.g., search term, pagination).
- Reproduce those requests in the backend using an HTTP client.
- Fall back to headless browser automation (Playwright) only when:
  - There is heavy bot protection.
  - Important flows cannot be triggered with plain HTTP.

### 6.5 Caching Layer

Because scraping and undoc APIs are fragile, caching is critical. [brightdata](https://brightdata.com/blog/web-data/web-scraping-vs-api)

- **Product DB**:
  - `freshful_products(id, name, price, unit, category, tags, image_url, last_seen_at)`
  - Populate via:
    - Nightly/weekly category crawls.
    - On‑demand when new queries appear.

- **Short‑term in‑memory cache**:
  - Cache search results (query + filters + zone) for a few minutes.
  - Cache frequently used categories.

- Ensure a **price recency** policy (e.g., treat any price older than N minutes/hours as “estimate only”; re‑fetch for finalization).

***

## 7. Data Model (Conceptual)

### 7.1 User & Profile

- `User`
  - `id` (internal)
  - `google_sub` (Google account subject)
  - `email`
  - `created_at`, `last_login_at`

- `HouseholdProfile`
  - `user_id`
  - `household_type` (single/couple/family)
  - `num_children`
  - `dietary_restrictions` (enum list)
  - `allergies` (free‑text + normalized enums)
  - `medical_flags` (high‑level booleans)
  - `goals` (weight_loss, maintenance, muscle_gain)
  - `cuisine_preferences` (array)
  - `budget_band`
  - `cooking_skill`
  - `raw_chat_history_id` (link to transcript)

### 7.2 Planning

- `MealPlanTemplate`
  - `id`, `user_id`
  - `title`
  - `duration_days`
  - `meals` (JSON: day → meal slots → recipe refs)
  - `metadata` (macros, tags)

- `MealPlanInstance`
  - `id`, `template_id`
  - `start_date`, `end_date`
  - `overrides` (swapped meals, customizations)

- `Recipe`
  - `id`
  - `title`
  - `ingredients` (JSON: name, quantity, unit)
  - `instructions`
  - `tags` (e.g., vegan, quick, kids‑friendly)
  - `estimated_macros`

### 7.3 Products and Lists

- `FreshfulProduct`
  - `id` (internal)
  - `freshful_id`
  - `name`
  - `price`
  - `unit`
  - `category`
  - `tags` (vegan, GF, etc.)
  - `image_url`
  - `last_seen_at`

- `ShoppingList`
  - `id`
  - `user_id`
  - `plan_id`
  - `created_at`
  - `total_estimated_cost`
  - `status` (draft/final)

- `ShoppingListItem`
  - `id`, `list_id`
  - `ingredient_name`
  - `required_quantity`, `required_unit`
  - `freshful_product_id` (nullable if unresolved)
  - `chosen_quantity`, `chosen_unit`
  - `estimated_price`
  - `category`
  - `status` (pending, bought, replaced)

***

## 8. Security, Privacy, and Compliance

- **Auth & tokens**
  - Use Google Sign‑In; verify ID tokens server‑side.
  - Issue short‑lived access tokens for app ↔ backend communication.

- **Sensitive data**
  - Dietary and health‑related profile data stored encrypted at rest (DB‑level or app‑level encryption).
  - Use strict role‑based access so only the owning user’s session can access their profile.

- **LLM data handling**
  - Avoid sending personally identifiable info (PII) unnecessarily to Claude.
  - Use IDs instead of raw emails/names in prompts where possible.

- **Scraping/legal**
  - Keep Freshful integration low‑volume and cache‑heavy to minimize requests and potential ToS friction. [scrapewise](https://scrapewise.ai/blogs/web-scraping-vs-api-retail-data-2026-guide)
  - Consider later formal contact with Freshful/eMAG to convert this into a supported partner integration.

- **User communication**
  - Explicitly state that:
    - The app is **not a medical device**; suggestions are informational only.
    - Some prices are estimates and may differ at checkout.

***

## 9. Future Extensions

Even though v1 is Freshful‑only, the architecture is extensible:

- New store adapters (`SezamoAdapter`, `CarrefourAdapter`) implementing the same interface.
- Proper **cart auto‑fill** and delivery slot suggestions.
- Multi‑profile support (e.g., separate profiles for different households or diet phases).
- Calendar integration for scheduled plans.
- Payment‑linked premium tiers (more plans/month, higher Claude usage, more complex optimization).
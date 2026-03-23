# Mobile Workspace

This workspace contains the Android-first React Native client for the Freshful Shopping Assistant. It is no longer just a shell: the app now supports sign-in, onboarding and profile confirmation, meal-plan creation and refinement, shopping-list viewing, and Freshful handoff against the real backend contract.

## Implemented User Flows

The current mobile app includes:

- signed-out welcome flow and Google Sign-In
- backend app-session exchange, secure session persistence, and session restoration on relaunch
- authenticated dashboard entry point
- AI onboarding chat and structured household-profile confirmation
- meal-plan creation, viewing, and refinement
- shopping-list rendering grouped for grocery use, including estimate-aware item display
- Freshful handoff from the shopping-list screen
- cached profile and planner state support for smoother authenticated restarts

## Stack

- React Native 0.76 with TypeScript
- React Navigation native stack
- Zustand for app-level session and planner state
- TanStack Query for backend state and mutations
- Google Sign-In for ID-token acquisition
- React Native Keychain for secure app-session persistence
- AsyncStorage-backed cache for profile and planner convenience state

## Main App Areas

- `App.tsx`: top-level providers and shell entrypoint
- `src/app/AppShell.tsx`: runtime setup, auth bootstrap, and cache restoration
- `src/app/navigation/RootNavigator.tsx`: signed-out and signed-in route graph
- `src/app/screens/`: welcome, bootstrap, dashboard, onboarding, planner-preview, and shopping-list screens
- `src/app/api/client.ts`: backend API client and response validation
- `src/config.ts`: runtime-safe mobile config validation

## Local Setup

1. Create the workspace env file if needed.

```bash
npm run env:bootstrap
```

2. Fill in `apps/mobile/.env` with client-safe values.

3. Start the backend API and local database first, because the mobile flows depend on the live backend contract.

4. Start Metro.

```bash
npm run start --workspace @freshful/mobile
```

5. Launch the Android app on an emulator or connected device.

```bash
npm run android --workspace @freshful/mobile
```

The default local `API_BASE_URL` in the checked-in template uses `http://10.0.2.2:3000`, which matches the Android emulator bridge to a host machine API running on port 3000.

## Environment Variables

`apps/mobile/.env` must remain client-safe. The current required values are:

- `APP_ENV`
- `API_BASE_URL`
- `GOOGLE_ANDROID_CLIENT_ID`
- `GOOGLE_WEB_CLIENT_ID`
- `API_REQUEST_TIMEOUT_MS`

`GOOGLE_WEB_CLIENT_ID` is public client metadata used to obtain an ID token for backend verification. It is not a server secret.

Server-only values such as `DATABASE_URL`, `APP_SESSION_SECRET`, and `ANTHROPIC_API_KEY` belong in `apps/api/.env` only.

## Commands

- `npm run start --workspace @freshful/mobile`: start Metro
- `npm run android --workspace @freshful/mobile`: install and launch the Android app
- `npm run typecheck --workspace @freshful/mobile`: run the mobile TypeScript check
- `npm run test --workspace @freshful/mobile`: run the full mobile Jest suite
- `npm run test:critical --workspace @freshful/mobile`: run the app-shell, planner-preview, and shopping-list suites used by root default validation
- `npm run android:smoke --workspace @freshful/mobile`: build the Android bundle and native debug shell without requiring an emulator

## Validation Strategy

The root repository defaults use only the critical mobile suites. For mobile-specific work, prefer:

```bash
npm run typecheck --workspace @freshful/mobile
npm run test --workspace @freshful/mobile
```

Use `npm run android:smoke --workspace @freshful/mobile` when you need a native packaging sanity check without opening an emulator.

The current critical mobile coverage focuses on:

- app bootstrap and authenticated shell behavior
- planner preview and refinement interactions
- shopping-list rendering and Freshful handoff behavior

## Operational Notes

- The app never receives server secrets. All Anthropic and Freshful interactions stay server-side.
- The backend-issued app session is stored securely and restored before signed-in navigation is shown.
- Profile and planner cache records are user-scoped so one signed-in account does not leak cached state into another.
- API responses are validated in the client to keep mobile state aligned with the shared contracts.

## Current Limitations

- Android-first only. There is no iOS target or web client.
- Google Sign-In is the only supported sign-in path.
- The app depends on a reachable backend API for live onboarding, planner, and shopping flows.
- Freshful handoff opens the retailer experience, but the app does not autofill a Freshful cart.
- Mobile tests do not replace on-device QA for Google auth and external handoff behavior.
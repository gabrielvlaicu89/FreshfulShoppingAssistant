# Mobile Workspace

This workspace now contains the Android-first React Native shell for the Freshful Shopping Assistant.

The current scope of the mobile app is intentionally narrow:

- native Android project files for a bare React Native runtime
- React Navigation stack wiring for the signed-out welcome flow plus authenticated dashboard and planner-preview shell screens
- Zustand for cross-screen shell state
- TanStack Query for live backend health fetching
- Google Sign-In exchange against the backend `POST /auth/google` route
- secure backend-session persistence and restore on relaunch via device keychain storage
- runtime-safe client config parsing that still keeps server secrets out of the app

Available commands:

- `npm run start --workspace @freshful/mobile`: start Metro for the mobile app
- `npm run android --workspace @freshful/mobile`: launch the Android app on an emulator or attached device
- `npm run typecheck --workspace @freshful/mobile`: run the mobile TypeScript check
- `npm run test --workspace @freshful/mobile`: run the mobile Jest suite
- `npm run android:smoke --workspace @freshful/mobile`: bundle the Android JS entry and run `app:assembleDebug` so the native Android shell compiles without requiring an emulator

`src/config.ts` remains the runtime-safe parser for injected mobile settings. The React Native runtime consumes those values through a bundler-level env bridge so the app stays aligned with the safe client-only `.env` contract introduced in P2-S3.

Required mobile runtime values now include:

- `API_BASE_URL`
- `GOOGLE_ANDROID_CLIENT_ID`
- `GOOGLE_WEB_CLIENT_ID`
- `API_REQUEST_TIMEOUT_MS`

`GOOGLE_WEB_CLIENT_ID` is the public Google web client identifier used only to request an ID token that the backend already knows how to verify. It is not a server secret.
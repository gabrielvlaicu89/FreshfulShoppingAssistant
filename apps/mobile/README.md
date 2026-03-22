# Mobile Workspace

This workspace is the minimal Android-client scaffold for P1-S2.

It stays intentionally lightweight so the React Native application shell can be bootstrapped in P4-S1 without backing out a premature toolchain from this step.

For P2-S3, `src/config.ts` is a runtime-safe parser for injected mobile settings. It validates only safe client-visible values such as `API_BASE_URL`, `GOOGLE_ANDROID_CLIENT_ID`, and request timeout settings, and it does not read local `.env` files at app runtime.
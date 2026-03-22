import { API_BASE_URL, APP_ENV, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "@env";
import { API_REQUEST_TIMEOUT_MS } from "@env";

import { getMobileConfig, type MobileConfig } from "../../config";

export function getBundledMobileConfig(): MobileConfig {
  return getMobileConfig({
    APP_ENV,
    API_BASE_URL,
    GOOGLE_ANDROID_CLIENT_ID,
    GOOGLE_WEB_CLIENT_ID,
    API_REQUEST_TIMEOUT_MS
  });
}
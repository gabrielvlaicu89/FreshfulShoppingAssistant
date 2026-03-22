import { GoogleSignin } from "@react-native-google-signin/google-signin";

import type { MobileConfig } from "../../config";

export class GoogleSignInCancelledError extends Error {
  constructor() {
    super("Google Sign-In was cancelled.");
    this.name = "GoogleSignInCancelledError";
  }
}

export interface GoogleSignInResult {
  idToken: string;
}

export interface GoogleSignInClient {
  signIn(): Promise<GoogleSignInResult>;
  signOut(): Promise<void>;
}

export function createGoogleSignInClient(config: MobileConfig): GoogleSignInClient {
  GoogleSignin.configure({
    webClientId: config.google.webClientId
  });

  return {
    async signIn() {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();

      if (response.type === "cancelled") {
        throw new GoogleSignInCancelledError();
      }

      if (!response.data.idToken) {
        throw new Error("Google Sign-In completed without an ID token.");
      }

      return {
        idToken: response.data.idToken
      };
    },
    async signOut() {
      await GoogleSignin.signOut();
    }
  };
}
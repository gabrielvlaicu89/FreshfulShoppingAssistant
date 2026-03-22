import * as Keychain from "react-native-keychain";

import { authSessionRecordSchema, type AuthSessionRecord } from "./contracts";

const sessionStorageService = "ro.freshfulassistant.app-session";
const sessionStorageUsername = "backend-session";

export interface AuthSessionStorage {
  read(): Promise<AuthSessionRecord | null>;
  write(record: AuthSessionRecord): Promise<void>;
  clear(): Promise<void>;
}

export function createAuthSessionStorage(): AuthSessionStorage {
  return {
    async read() {
      const credentials = await Keychain.getGenericPassword({
        service: sessionStorageService
      });

      if (!credentials) {
        return null;
      }

      return authSessionRecordSchema.parse(JSON.parse(credentials.password));
    },
    async write(record) {
      const value = JSON.stringify(authSessionRecordSchema.parse(record));

      await Keychain.setGenericPassword(sessionStorageUsername, value, {
        service: sessionStorageService
      });
    },
    async clear() {
      await Keychain.resetGenericPassword({
        service: sessionStorageService
      });
    }
  };
}
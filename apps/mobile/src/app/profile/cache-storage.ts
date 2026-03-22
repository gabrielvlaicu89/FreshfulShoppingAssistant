import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  budgetBandValues,
  householdTypeValues,
  type HouseholdProfile
} from "@freshful/contracts";
import { z } from "zod";

const profileCacheKeyPrefix = "ro.freshfulassistant.profile-cache:";

export const dashboardProfileSummarySchema = z
  .object({
    userId: z.string().trim().min(1),
    householdType: z.enum(householdTypeValues),
    numChildren: z.number().int().min(0),
    cuisinePreferences: z.array(z.string().trim().min(1)),
    budgetBand: z.enum(budgetBandValues),
    maxPrepTimeMinutes: z.number().int().positive()
  })
  .strict();

export type DashboardProfileSummary = z.infer<typeof dashboardProfileSummarySchema>;

const cachedProfileRecordSchema = z
  .object({
    summary: dashboardProfileSummarySchema,
    cachedAt: z.string().datetime()
  })
  .strict();

export type CachedProfileRecord = z.infer<typeof cachedProfileRecordSchema>;

export interface ProfileCacheStorage {
  read(userId: string): Promise<CachedProfileRecord | null>;
  write(summary: DashboardProfileSummary): Promise<void>;
  clear(userId: string): Promise<void>;
}

export function toDashboardProfileSummary(profile: HouseholdProfile): DashboardProfileSummary {
  return dashboardProfileSummarySchema.parse({
    userId: profile.userId,
    householdType: profile.householdType,
    numChildren: profile.numChildren,
    cuisinePreferences: profile.cuisinePreferences,
    budgetBand: profile.budgetBand,
    maxPrepTimeMinutes: profile.maxPrepTimeMinutes
  });
}

function createCacheKey(userId: string): string {
  return `${profileCacheKeyPrefix}${userId}`;
}

export function createProfileCacheStorage(): ProfileCacheStorage {
  return {
    async read(userId) {
      const storedValue = await AsyncStorage.getItem(createCacheKey(userId));

      if (!storedValue) {
        return null;
      }

      try {
        return cachedProfileRecordSchema.parse(JSON.parse(storedValue));
      } catch {
        await AsyncStorage.removeItem(createCacheKey(userId));
        return null;
      }
    },
    async write(summary) {
      const record = cachedProfileRecordSchema.parse({
        summary,
        cachedAt: new Date().toISOString()
      });

      await AsyncStorage.setItem(createCacheKey(summary.userId), JSON.stringify(record));
    },
    async clear(userId) {
      await AsyncStorage.removeItem(createCacheKey(userId));
    }
  };
}
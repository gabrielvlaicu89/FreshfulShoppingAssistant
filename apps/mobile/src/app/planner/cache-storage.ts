import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

const plannerCacheKeyPrefix = "ro.freshfulassistant.planner-cache:";

export const cachedPlannerStateSchema = z
  .object({
    userId: z.string().trim().min(1),
    lastSavedPlanId: z.string().trim().min(1),
    cachedAt: z.string().datetime()
  })
  .strict();

export type CachedPlannerState = z.infer<typeof cachedPlannerStateSchema>;

export interface PlannerCacheStorage {
  read(userId: string): Promise<CachedPlannerState | null>;
  write(userId: string, lastSavedPlanId: string): Promise<void>;
  clear(userId: string): Promise<void>;
}

function createCacheKey(userId: string): string {
  return `${plannerCacheKeyPrefix}${userId}`;
}

export function createPlannerCacheStorage(): PlannerCacheStorage {
  return {
    async read(userId) {
      const storedValue = await AsyncStorage.getItem(createCacheKey(userId));

      if (!storedValue) {
        return null;
      }

      try {
        return cachedPlannerStateSchema.parse(JSON.parse(storedValue));
      } catch {
        await AsyncStorage.removeItem(createCacheKey(userId));
        return null;
      }
    },
    async write(userId, lastSavedPlanId) {
      const record = cachedPlannerStateSchema.parse({
        userId,
        lastSavedPlanId,
        cachedAt: new Date().toISOString()
      });

      await AsyncStorage.setItem(createCacheKey(userId), JSON.stringify(record));
    },
    async clear(userId) {
      await AsyncStorage.removeItem(createCacheKey(userId));
    }
  };
}
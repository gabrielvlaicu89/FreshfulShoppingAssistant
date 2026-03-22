import type { HouseholdProfile } from "@freshful/contracts";

import type { ProfileWriteInput } from "./contracts.js";
import type { HouseholdProfileRepository } from "./repository.js";

export interface ProfileService {
  getProfile(userId: string): Promise<HouseholdProfile | null>;
  upsertProfile(userId: string, input: ProfileWriteInput): Promise<HouseholdProfile>;
}

export interface CreateProfileServiceOptions {
  repository: HouseholdProfileRepository;
}

export function createProfileService(options: CreateProfileServiceOptions): ProfileService {
  return {
    getProfile(userId: string): Promise<HouseholdProfile | null> {
      return options.repository.getByUserId(userId);
    },

    upsertProfile(userId: string, input: ProfileWriteInput): Promise<HouseholdProfile> {
      return options.repository.upsertForUser(userId, input);
    }
  };
}
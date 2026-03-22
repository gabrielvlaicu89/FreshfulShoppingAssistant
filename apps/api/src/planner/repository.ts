import { randomUUID } from "node:crypto";

import type { MealPlanInstance, MealPlanTemplate } from "@freshful/contracts";
import { mealPlanInstanceSchema, mealPlanTemplateSchema } from "@freshful/contracts";

import { createApiDatabase } from "../db/client.js";
import { databaseTables } from "../db/schema.js";
import type { GeneratedMealPlan } from "./contracts.js";

export type PlannerDatabase = ReturnType<typeof createApiDatabase>["db"];

export interface PersistedPlanResult {
  template: MealPlanTemplate;
  instance: MealPlanInstance | null;
}

export interface CreatePlannerRepositoryOptions {
  now?: () => Date;
  createId?: () => string;
}

export interface PlannerRepository {
  createForUser(userId: string, plan: GeneratedMealPlan, startDate?: string): Promise<PersistedPlanResult>;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateValue: string, daysToAdd: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));

  date.setUTCDate(date.getUTCDate() + daysToAdd);

  return toIsoDate(date);
}

export function createPlannerRepository(
  database: PlannerDatabase,
  options: CreatePlannerRepositoryOptions = {}
): PlannerRepository {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;

  return {
    async createForUser(userId, plan, startDate) {
      return database.transaction(async (transaction) => {
        const timestamp = now().toISOString();
        const templateId = createId();
        const [templateRecord] = await transaction
          .insert(databaseTables.mealPlanTemplates)
          .values({
            id: templateId,
            userId,
            title: plan.title,
            durationDays: plan.durationDays,
            recipes: plan.recipes,
            days: plan.days,
            metadata: plan.metadata,
            createdAt: timestamp,
            updatedAt: timestamp
          })
          .returning({
            id: databaseTables.mealPlanTemplates.id,
            userId: databaseTables.mealPlanTemplates.userId,
            title: databaseTables.mealPlanTemplates.title,
            durationDays: databaseTables.mealPlanTemplates.durationDays,
            recipes: databaseTables.mealPlanTemplates.recipes,
            days: databaseTables.mealPlanTemplates.days,
            metadata: databaseTables.mealPlanTemplates.metadata
          });

        const template = mealPlanTemplateSchema.parse(templateRecord);

        if (!startDate) {
          return {
            template,
            instance: null
          };
        }

        const [instanceRecord] = await transaction
          .insert(databaseTables.mealPlanInstances)
          .values({
            id: createId(),
            templateId,
            userId,
            startDate,
            endDate: addDays(startDate, plan.durationDays - 1),
            overrides: [],
            createdAt: timestamp,
            updatedAt: timestamp
          })
          .returning({
            id: databaseTables.mealPlanInstances.id,
            templateId: databaseTables.mealPlanInstances.templateId,
            startDate: databaseTables.mealPlanInstances.startDate,
            endDate: databaseTables.mealPlanInstances.endDate,
            overrides: databaseTables.mealPlanInstances.overrides
          });

        return {
          template,
          instance: mealPlanInstanceSchema.parse(instanceRecord)
        };
      });
    }
  };
}

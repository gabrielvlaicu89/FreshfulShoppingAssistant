import { randomUUID } from "node:crypto";

import type { MealPlanInstance, MealPlanTemplate } from "@freshful/contracts";
import { mealPlanInstanceSchema, mealPlanTemplateSchema } from "@freshful/contracts";
import { and, desc, eq, inArray } from "drizzle-orm";

import { createApiDatabase } from "../db/client.js";
import { databaseTables } from "../db/schema.js";
import type { GeneratedMealPlan, PlanDetailResponse, PlanRevision } from "./contracts.js";

export type PlannerDatabase = ReturnType<typeof createApiDatabase>["db"];

type PlannerDatabaseExecutor = Pick<PlannerDatabase, "insert" | "select">;

interface PlannerTemplateRecord {
  id: string;
  userId: string;
  parentTemplateId: string | null;
  title: string;
  durationDays: number;
  recipes: MealPlanTemplate["recipes"];
  days: MealPlanTemplate["days"];
  metadata: MealPlanTemplate["metadata"];
  createdAt: string;
}

interface PlannerInstanceRecord {
  id: string;
  templateId: string;
  startDate: string;
  endDate: string;
  overrides: MealPlanInstance["overrides"];
  createdAt: string;
}

export interface PersistedPlanResult {
  template: MealPlanTemplate;
  instance: MealPlanInstance | null;
}

export type PersistedPlanDetail = PlanDetailResponse;

export interface CreatePlannerRepositoryOptions {
  now?: () => Date;
  createId?: () => string;
}

export interface PlannerRepository {
  createForUser(userId: string, plan: GeneratedMealPlan, startDate?: string): Promise<PersistedPlanResult>;
  getForUser(userId: string, templateId: string): Promise<PersistedPlanDetail | null>;
  createRevisionForUser(
    userId: string,
    sourcePlan: PersistedPlanDetail,
    plan: GeneratedMealPlan
  ): Promise<PersistedPlanDetail>;
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

function sanitizeOverridesForTemplate(
  overrides: MealPlanInstance["overrides"],
  recipeIds: Set<string>
): MealPlanInstance["overrides"] {
  return overrides.flatMap((override) => {
    if (!override.recipeId || recipeIds.has(override.recipeId)) {
      return [override];
    }

    if (!override.notes) {
      return [];
    }

    return [
      {
        dayNumber: override.dayNumber,
        slot: override.slot,
        notes: override.notes
      }
    ];
  });
}

function parseTemplateRecord(record: PlannerTemplateRecord): MealPlanTemplate {
  return mealPlanTemplateSchema.parse({
    id: record.id,
    userId: record.userId,
    title: record.title,
    durationDays: record.durationDays,
    recipes: record.recipes,
    days: record.days,
    metadata: record.metadata
  });
}

function parseInstanceRecord(record: PlannerInstanceRecord | null): MealPlanInstance | null {
  if (!record) {
    return null;
  }

  return mealPlanInstanceSchema.parse({
    id: record.id,
    templateId: record.templateId,
    startDate: record.startDate,
    endDate: record.endDate,
    overrides: record.overrides
  });
}

async function selectTemplateForUser(
  executor: PlannerDatabaseExecutor,
  userId: string,
  templateId: string
): Promise<PlannerTemplateRecord | null> {
  const [record] = await executor
    .select({
      id: databaseTables.mealPlanTemplates.id,
      userId: databaseTables.mealPlanTemplates.userId,
      parentTemplateId: databaseTables.mealPlanTemplates.parentTemplateId,
      title: databaseTables.mealPlanTemplates.title,
      durationDays: databaseTables.mealPlanTemplates.durationDays,
      recipes: databaseTables.mealPlanTemplates.recipes,
      days: databaseTables.mealPlanTemplates.days,
      metadata: databaseTables.mealPlanTemplates.metadata,
      createdAt: databaseTables.mealPlanTemplates.createdAt
    })
    .from(databaseTables.mealPlanTemplates)
    .where(
      and(
        eq(databaseTables.mealPlanTemplates.userId, userId),
        eq(databaseTables.mealPlanTemplates.id, templateId)
      )
    )
    .limit(1);

  return record ?? null;
}

async function loadRevisionChain(
  executor: PlannerDatabaseExecutor,
  userId: string,
  currentTemplate: PlannerTemplateRecord
): Promise<PlannerTemplateRecord[]> {
  const chain: PlannerTemplateRecord[] = [];
  let cursor: PlannerTemplateRecord | null = currentTemplate;

  while (cursor) {
    chain.push(cursor);

    if (!cursor.parentTemplateId) {
      break;
    }

    cursor = await selectTemplateForUser(executor, userId, cursor.parentTemplateId);
  }

  return chain.reverse();
}

async function loadLatestInstancesByTemplateId(
  executor: PlannerDatabaseExecutor,
  userId: string,
  templateIds: string[]
): Promise<Map<string, PlannerInstanceRecord>> {
  if (templateIds.length === 0) {
    return new Map();
  }

  const records = await executor
    .select({
      id: databaseTables.mealPlanInstances.id,
      templateId: databaseTables.mealPlanInstances.templateId,
      startDate: databaseTables.mealPlanInstances.startDate,
      endDate: databaseTables.mealPlanInstances.endDate,
      overrides: databaseTables.mealPlanInstances.overrides,
      createdAt: databaseTables.mealPlanInstances.createdAt
    })
    .from(databaseTables.mealPlanInstances)
    .where(
      and(
        eq(databaseTables.mealPlanInstances.userId, userId),
        inArray(databaseTables.mealPlanInstances.templateId, templateIds)
      )
    )
    .orderBy(desc(databaseTables.mealPlanInstances.createdAt), desc(databaseTables.mealPlanInstances.id));

  const instancesByTemplateId = new Map<string, PlannerInstanceRecord>();

  for (const record of records) {
    if (!instancesByTemplateId.has(record.templateId)) {
      instancesByTemplateId.set(record.templateId, record);
    }
  }

  return instancesByTemplateId;
}

function toRevisionHistory(
  chain: PlannerTemplateRecord[],
  instancesByTemplateId: Map<string, PlannerInstanceRecord>
): PlanRevision[] {
  return chain.map((templateRecord) => {
    const instanceRecord = instancesByTemplateId.get(templateRecord.id) ?? null;

    return {
      templateId: templateRecord.id,
      parentTemplateId: templateRecord.parentTemplateId,
      title: templateRecord.title,
      createdAt: templateRecord.createdAt,
      instanceId: instanceRecord?.id ?? null,
      startDate: instanceRecord?.startDate ?? null,
      endDate: instanceRecord?.endDate ?? null
    };
  });
}

async function loadPlanDetail(
  executor: PlannerDatabaseExecutor,
  userId: string,
  templateId: string
): Promise<PersistedPlanDetail | null> {
  const currentTemplate = await selectTemplateForUser(executor, userId, templateId);

  if (!currentTemplate) {
    return null;
  }

  const revisionChain = await loadRevisionChain(executor, userId, currentTemplate);
  const instancesByTemplateId = await loadLatestInstancesByTemplateId(
    executor,
    userId,
    revisionChain.map((record) => record.id)
  );

  return {
    template: parseTemplateRecord(currentTemplate),
    instance: parseInstanceRecord(instancesByTemplateId.get(currentTemplate.id) ?? null),
    revisionHistory: toRevisionHistory(revisionChain, instancesByTemplateId)
  };
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
            parentTemplateId: null,
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
            parentTemplateId: databaseTables.mealPlanTemplates.parentTemplateId,
            title: databaseTables.mealPlanTemplates.title,
            durationDays: databaseTables.mealPlanTemplates.durationDays,
            recipes: databaseTables.mealPlanTemplates.recipes,
            days: databaseTables.mealPlanTemplates.days,
            metadata: databaseTables.mealPlanTemplates.metadata,
            createdAt: databaseTables.mealPlanTemplates.createdAt
          });

        const template = parseTemplateRecord(templateRecord);

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
    },

    async getForUser(userId, templateId) {
      return loadPlanDetail(database, userId, templateId);
    },

    async createRevisionForUser(userId, sourcePlan, plan) {
      return database.transaction(async (transaction) => {
        const timestamp = now().toISOString();
        const templateId = createId();
        const recipeIds = new Set(plan.recipes.map((recipe) => recipe.id));

        await transaction.insert(databaseTables.mealPlanTemplates).values({
          id: templateId,
          userId,
          parentTemplateId: sourcePlan.template.id,
          title: plan.title,
          durationDays: plan.durationDays,
          recipes: plan.recipes,
          days: plan.days,
          metadata: plan.metadata,
          createdAt: timestamp,
          updatedAt: timestamp
        });

        if (sourcePlan.instance) {
          await transaction.insert(databaseTables.mealPlanInstances).values({
            id: createId(),
            templateId,
            userId,
            startDate: sourcePlan.instance.startDate,
            endDate: sourcePlan.instance.endDate,
            overrides: sanitizeOverridesForTemplate(sourcePlan.instance.overrides, recipeIds),
            createdAt: timestamp,
            updatedAt: timestamp
          });
        }

        const detail = await loadPlanDetail(transaction, userId, templateId);

        if (!detail) {
          throw new Error("Failed to load the newly persisted refined meal plan revision.");
        }

        return detail;
      });
    }
  };
}

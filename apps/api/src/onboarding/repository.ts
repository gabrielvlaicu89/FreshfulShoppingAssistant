import { randomUUID } from "node:crypto";

import type { OnboardingChatMessage, OnboardingTranscript } from "@freshful/contracts";
import { onboardingTranscriptSchema } from "@freshful/contracts";
import { and, eq } from "drizzle-orm";

import { createApiDatabase } from "../db/client.js";
import { databaseTables } from "../db/schema.js";

export type OnboardingDatabase = ReturnType<typeof createApiDatabase>["db"];

export interface OnboardingTranscriptRepository {
  getActiveForUser(userId: string): Promise<OnboardingTranscript | null>;
  getByIdForUser(userId: string, transcriptId: string): Promise<OnboardingTranscript | null>;
  appendMessagesForUser(
    userId: string,
    messages: OnboardingChatMessage[],
    options?: AppendMessagesForUserOptions
  ): Promise<OnboardingTranscript>;
}

export interface CreateOnboardingTranscriptRepositoryOptions {
  now?: () => Date;
  createId?: () => string;
  onActiveTranscriptLoadedForAppend?: (transcript: OnboardingTranscript | null) => Promise<void> | void;
}

export interface AppendMessagesForUserOptions {
  forceNewTranscript?: boolean;
}

function toOnboardingTranscript(record: {
  id: string;
  householdProfileId: string | null;
  messages: OnboardingTranscript["messages"];
}): OnboardingTranscript {
  return onboardingTranscriptSchema.parse({
    id: record.id,
    householdProfileId: record.householdProfileId ?? undefined,
    messages: record.messages
  });
}

function compareTranscriptsByRecency(
  transcripts: Array<{
    id: string;
    householdProfileId: string | null;
    messages: OnboardingTranscript["messages"];
    createdAt: string;
    updatedAt: string;
  }>
) {
  return [...transcripts].sort((left, right) => {
    const updatedOrder = right.updatedAt.localeCompare(left.updatedAt);

    if (updatedOrder !== 0) {
      return updatedOrder;
    }

    const createdOrder = right.createdAt.localeCompare(left.createdAt);

    if (createdOrder !== 0) {
      return createdOrder;
    }

    return right.messages.length - left.messages.length;
  });
}

function selectActiveTranscript(
  transcripts: Array<{
    id: string;
    householdProfileId: string | null;
    messages: OnboardingTranscript["messages"];
    createdAt: string;
    updatedAt: string;
  }>
) {
  const draftTranscripts = transcripts.filter((transcript) => transcript.householdProfileId === null);

  if (draftTranscripts.length > 0) {
    const [activeDraft] = compareTranscriptsByRecency(draftTranscripts);

    return activeDraft ?? null;
  }

  const [latestCommittedTranscript] = compareTranscriptsByRecency(transcripts);

  return latestCommittedTranscript ?? null;
}

function isActiveDraftUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & { code?: string; cause?: { code?: string } };

  return (
    errorWithCode.code === "23505" ||
    errorWithCode.cause?.code === "23505" ||
    error.message.includes("onboarding_transcripts_active_draft_user_idx")
  );
}

export function createOnboardingTranscriptRepository(
  database: OnboardingDatabase,
  options: CreateOnboardingTranscriptRepositoryOptions = {}
): OnboardingTranscriptRepository {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const onActiveTranscriptLoadedForAppend = options.onActiveTranscriptLoadedForAppend;

  return {
    async getActiveForUser(userId: string): Promise<OnboardingTranscript | null> {
      const transcripts = await database
        .select({
          id: databaseTables.onboardingTranscripts.id,
          householdProfileId: databaseTables.onboardingTranscripts.householdProfileId,
          messages: databaseTables.onboardingTranscripts.messages,
          createdAt: databaseTables.onboardingTranscripts.createdAt,
          updatedAt: databaseTables.onboardingTranscripts.updatedAt
        })
        .from(databaseTables.onboardingTranscripts)
        .where(eq(databaseTables.onboardingTranscripts.userId, userId));

      const latestTranscript = selectActiveTranscript(transcripts);

      return latestTranscript ? toOnboardingTranscript(latestTranscript) : null;
    },

    async getByIdForUser(userId: string, transcriptId: string): Promise<OnboardingTranscript | null> {
      const [transcript] = await database
        .select({
          id: databaseTables.onboardingTranscripts.id,
          householdProfileId: databaseTables.onboardingTranscripts.householdProfileId,
          messages: databaseTables.onboardingTranscripts.messages
        })
        .from(databaseTables.onboardingTranscripts)
        .where(
          and(
            eq(databaseTables.onboardingTranscripts.userId, userId),
            eq(databaseTables.onboardingTranscripts.id, transcriptId)
          )
        )
        .limit(1);

      return transcript ? toOnboardingTranscript(transcript) : null;
    },

    async appendMessagesForUser(
      userId: string,
      messages: OnboardingChatMessage[],
      appendOptions: AppendMessagesForUserOptions = {}
    ): Promise<OnboardingTranscript> {
      const parsedMessages = messages.map((message) => message);

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const transcripts = await database
          .select({
            id: databaseTables.onboardingTranscripts.id,
            householdProfileId: databaseTables.onboardingTranscripts.householdProfileId,
            messages: databaseTables.onboardingTranscripts.messages,
            createdAt: databaseTables.onboardingTranscripts.createdAt,
            updatedAt: databaseTables.onboardingTranscripts.updatedAt
          })
          .from(databaseTables.onboardingTranscripts)
          .where(eq(databaseTables.onboardingTranscripts.userId, userId));

        const activeTranscript = selectActiveTranscript(transcripts);

        await onActiveTranscriptLoadedForAppend?.(activeTranscript ? toOnboardingTranscript(activeTranscript) : null);

        if (!activeTranscript) {
          const createdAt = now().toISOString();
          try {
            const [createdTranscript] = await database
              .insert(databaseTables.onboardingTranscripts)
              .values({
                id: createId(),
                userId,
                householdProfileId: null,
                messages: parsedMessages,
                containsSensitiveProfileSignals: true,
                createdAt,
                updatedAt: createdAt
              })
              .returning({
                id: databaseTables.onboardingTranscripts.id,
                householdProfileId: databaseTables.onboardingTranscripts.householdProfileId,
                messages: databaseTables.onboardingTranscripts.messages
              });

            return toOnboardingTranscript(createdTranscript);
          } catch (error) {
            if (isActiveDraftUniqueViolation(error)) {
              continue;
            }

            throw error;
          }
        }

        if (appendOptions.forceNewTranscript && activeTranscript.householdProfileId !== null) {
          const createdAt = now().toISOString();
          try {
            const [createdTranscript] = await database
              .insert(databaseTables.onboardingTranscripts)
              .values({
                id: createId(),
                userId,
                householdProfileId: null,
                messages: [...activeTranscript.messages, ...parsedMessages],
                containsSensitiveProfileSignals: true,
                createdAt,
                updatedAt: createdAt
              })
              .returning({
                id: databaseTables.onboardingTranscripts.id,
                householdProfileId: databaseTables.onboardingTranscripts.householdProfileId,
                messages: databaseTables.onboardingTranscripts.messages
              });

            return toOnboardingTranscript(createdTranscript);
          } catch (error) {
            if (isActiveDraftUniqueViolation(error)) {
              continue;
            }

            throw error;
          }
        }

        const updatedAt = now().toISOString();
        const [updatedTranscript] = await database
          .update(databaseTables.onboardingTranscripts)
          .set({
            messages: [...activeTranscript.messages, ...parsedMessages],
            containsSensitiveProfileSignals: true,
            updatedAt
          })
          .where(
            and(
              eq(databaseTables.onboardingTranscripts.userId, userId),
              eq(databaseTables.onboardingTranscripts.id, activeTranscript.id),
              eq(databaseTables.onboardingTranscripts.messages, activeTranscript.messages)
            )
          )
          .returning({
            id: databaseTables.onboardingTranscripts.id,
            householdProfileId: databaseTables.onboardingTranscripts.householdProfileId,
            messages: databaseTables.onboardingTranscripts.messages
          });

        if (updatedTranscript) {
          return toOnboardingTranscript(updatedTranscript);
        }
      }

      throw new Error(`Failed to append onboarding messages for user '${userId}' after repeated concurrent updates.`);
    }
  };
}
import { ClaudeBudgetLimitError } from "./errors.js";
import type { ClaudeModelTier } from "./routing.js";

export interface AiBudgetConfig {
  windowMs: number;
  perUserUsdLimit: number | null;
  globalUsdLimit: number | null;
}

export interface AiBudgetSnapshot {
  windowStartedAt: string;
  globalSpentUsd: number;
  globalUsdLimit: number | null;
  perUserSpentUsd: number;
  perUserUsdLimit: number | null;
}

export interface AiUsageRecord {
  userId: string | null;
  operation: string;
  model: string;
  modelTier: ClaudeModelTier;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  recordedAt: string;
}

export interface AiUsageRecordInput {
  userId: string | null;
  operation: string;
  model: string;
  modelTier: ClaudeModelTier;
  inputTokens: number;
  outputTokens: number;
}

export interface AiBudgetExecutionResult<T> {
  budgetSnapshot: AiBudgetSnapshot;
  result: T;
  recordedUsage: AiUsageRecord | null;
}

export interface AiUsageMeter {
  assertWithinBudget(input: { userId: string | null; operation: string }): AiBudgetSnapshot;
  recordUsage(input: AiUsageRecordInput): AiUsageRecord;
  executeWithinBudget<T>(
    input: { userId: string | null; operation: string },
    execute: (snapshot: AiBudgetSnapshot) => Promise<{ result: T; usageToRecord?: AiUsageRecordInput }>
  ): Promise<AiBudgetExecutionResult<T>>;
}

export interface CreateAiUsageMeterOptions {
  budget?: Partial<AiBudgetConfig>;
  now?: () => Date;
}

interface StoredUsageEntry extends AiUsageRecord {
  recordedAtMs: number;
}

const DEFAULT_AI_BUDGET: AiBudgetConfig = {
  windowMs: 60 * 60 * 1000,
  perUserUsdLimit: null,
  globalUsdLimit: null
};

const MODEL_TIER_PRICING_USD_PER_MILLION_TOKENS: Record<ClaudeModelTier, { input: number; output: number }> = {
  haiku: {
    input: 0.8,
    output: 4
  },
  sonnet: {
    input: 3,
    output: 15
  }
};

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function estimateUsageCostUsd(modelTier: ClaudeModelTier, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_TIER_PRICING_USD_PER_MILLION_TOKENS[modelTier];

  return roundUsd((inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output);
}

function normalizeBudgetConfig(config?: Partial<AiBudgetConfig>): AiBudgetConfig {
  return {
    windowMs: config?.windowMs ?? DEFAULT_AI_BUDGET.windowMs,
    perUserUsdLimit: config?.perUserUsdLimit ?? DEFAULT_AI_BUDGET.perUserUsdLimit,
    globalUsdLimit: config?.globalUsdLimit ?? DEFAULT_AI_BUDGET.globalUsdLimit
  };
}

export function createAiUsageMeter(options: CreateAiUsageMeterOptions = {}): AiUsageMeter {
  const now = options.now ?? (() => new Date());
  const budget = normalizeBudgetConfig(options.budget);
  const usageEntries: StoredUsageEntry[] = [];
  let executionQueue = Promise.resolve();

  function pruneExpiredEntries(currentMs: number) {
    const windowStartMs = currentMs - budget.windowMs;

    while (usageEntries[0] && usageEntries[0].recordedAtMs < windowStartMs) {
      usageEntries.shift();
    }
  }

  function createSnapshot(currentMs: number, userId: string | null): AiBudgetSnapshot {
    pruneExpiredEntries(currentMs);

    const globalSpentUsd = roundUsd(
      usageEntries.reduce((total, entry) => total + entry.estimatedCostUsd, 0)
    );
    const perUserSpentUsd = roundUsd(
      usageEntries
        .filter((entry) => entry.userId === userId)
        .reduce((total, entry) => total + entry.estimatedCostUsd, 0)
    );

    return {
      windowStartedAt: new Date(currentMs - budget.windowMs).toISOString(),
      globalSpentUsd,
      globalUsdLimit: budget.globalUsdLimit,
      perUserSpentUsd,
      perUserUsdLimit: budget.perUserUsdLimit
    };
  }

  function assertWithinBudget(input: { userId: string | null; operation: string }): AiBudgetSnapshot {
    const currentMs = now().getTime();
    const snapshot = createSnapshot(currentMs, input.userId);

    if (
      snapshot.perUserUsdLimit !== null &&
      snapshot.perUserSpentUsd >= snapshot.perUserUsdLimit
    ) {
      throw new ClaudeBudgetLimitError(
        "The Anthropic per-user budget has been exhausted for the current window.",
        "user",
        snapshot.perUserSpentUsd,
        snapshot.perUserUsdLimit,
        budget.windowMs
      );
    }

    if (snapshot.globalUsdLimit !== null && snapshot.globalSpentUsd >= snapshot.globalUsdLimit) {
      throw new ClaudeBudgetLimitError(
        "The Anthropic global budget has been exhausted for the current window.",
        "global",
        snapshot.globalSpentUsd,
        snapshot.globalUsdLimit,
        budget.windowMs
      );
    }

    return snapshot;
  }

  function recordUsage(input: AiUsageRecordInput): AiUsageRecord {
    const currentDate = now();
    const currentMs = currentDate.getTime();
    const estimatedCostUsd = estimateUsageCostUsd(input.modelTier, input.inputTokens, input.outputTokens);
    const record: StoredUsageEntry = {
      ...input,
      estimatedCostUsd,
      recordedAt: currentDate.toISOString(),
      recordedAtMs: currentMs
    };

    pruneExpiredEntries(currentMs);
    usageEntries.push(record);

    return record;
  }

  function executeWithinBudget<T>(
    input: { userId: string | null; operation: string },
    execute: (snapshot: AiBudgetSnapshot) => Promise<{ result: T; usageToRecord?: AiUsageRecordInput }>
  ): Promise<AiBudgetExecutionResult<T>> {
    const runExecution = async () => {
      const budgetSnapshot = assertWithinBudget(input);
      const executionResult = await execute(budgetSnapshot);
      const recordedUsage = executionResult.usageToRecord ? recordUsage(executionResult.usageToRecord) : null;

      return {
        budgetSnapshot,
        result: executionResult.result,
        recordedUsage
      };
    };

    const queuedExecution = executionQueue.then(runExecution, runExecution);
    executionQueue = queuedExecution.then(
      () => undefined,
      () => undefined
    );

    return queuedExecution;
  }

  return {
    assertWithinBudget,
    recordUsage,
    executeWithinBudget
  };
}
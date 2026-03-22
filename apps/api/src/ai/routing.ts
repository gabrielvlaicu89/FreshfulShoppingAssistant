export const claudeTaskValues = [
  "onboarding-turn",
  "profile-structuring",
  "meal-plan-generation",
  "meal-plan-refinement"
] as const;

export type ClaudeTask = (typeof claudeTaskValues)[number];

export const claudeModelTierValues = ["haiku", "sonnet"] as const;

export type ClaudeModelTier = (typeof claudeModelTierValues)[number];

export interface ClaudeRoutingConfig {
  sonnetTranscriptMessageThreshold: number;
  sonnetPromptCharThreshold: number;
}

export interface ClaudeRouteInput {
  task: ClaudeTask;
  transcriptMessageCount: number;
  promptChars: number;
}

export interface ClaudeRouteDecision {
  tier: ClaudeModelTier;
  reason: string;
}

export function selectClaudeModel(config: ClaudeRoutingConfig, input: ClaudeRouteInput): ClaudeRouteDecision {
  if (input.task === "meal-plan-generation" || input.task === "meal-plan-refinement") {
    return {
      tier: "sonnet",
      reason:
        input.task === "meal-plan-generation"
          ? "Structured meal plan generation defaults to Sonnet for higher JSON reliability."
          : "Structured meal plan refinement defaults to Sonnet for higher JSON reliability."
    };
  }

  if (input.task === "profile-structuring") {
    return {
      tier: "sonnet",
      reason: "Structured profile extraction defaults to Sonnet for higher JSON reliability."
    };
  }

  if (input.transcriptMessageCount >= config.sonnetTranscriptMessageThreshold) {
    return {
      tier: "sonnet",
      reason: "Long onboarding transcripts escalate to Sonnet to preserve context quality."
    };
  }

  if (input.promptChars >= config.sonnetPromptCharThreshold) {
    return {
      tier: "sonnet",
      reason: "Larger onboarding prompts escalate to Sonnet for higher reasoning capacity."
    };
  }

  return {
    tier: "haiku",
    reason: "Short interactive onboarding turns stay on Haiku to minimize cost."
  };
}
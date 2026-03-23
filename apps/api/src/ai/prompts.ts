import type { OnboardingChatMessage } from "@freshful/contracts";

import type { CreatePlanRequest, GeneratedMealPlan } from "../planner/contracts.js";

export interface ClaudePromptLimits {
  maxTranscriptMessages: number;
  maxPromptChars: number;
}

export interface PromptEnvelope {
  system: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  promptChars: number;
  transcriptMessageCount: number;
}

export interface OnboardingReplyPromptInput {
  transcript: OnboardingChatMessage[];
}

export interface ProfileExtractionPromptInput {
  transcript: OnboardingChatMessage[];
}

export interface MealPlanPromptInput {
  profile: {
    householdType: string;
    numChildren: number;
    dietaryRestrictions: string[];
    allergies: {
      normalized: string[];
      freeText: string[];
    };
    medicalFlags: {
      diabetes: boolean;
      hypertension: boolean;
    };
    goals: string[];
    cuisinePreferences: string[];
    favoriteIngredients: string[];
    dislikedIngredients: string[];
    budgetBand: string;
    maxPrepTimeMinutes: number;
    cookingSkill: string;
  };
  options: CreatePlanRequest;
}

export interface MealPlanRefinementPromptInput {
  profile: MealPlanPromptInput["profile"];
  currentPlan: GeneratedMealPlan;
  refinementPrompt: string;
}

export interface ShoppingProductSelectionPromptInput {
  ingredientName: string;
  requiredQuantity: number;
  requiredUnit: string;
  profile: {
    dietaryRestrictions: string[];
    allergies: {
      normalized: string[];
      freeText: string[];
    };
    favoriteIngredients: string[];
    dislikedIngredients: string[];
    cuisinePreferences: string[];
    budgetBand: string;
  } | null;
  candidates: Array<{
    id: string;
    name: string;
    price: number;
    currency: string;
    unit: string;
    category: string;
    tags: string[];
    availability: string;
    searchRank: number | null;
  }>;
}

const onboardingFieldChecklist = [
  "household type and number of children",
  "dietary restrictions and allergies",
  "high-level medical flags like diabetes or hypertension",
  "health goals",
  "cuisine preferences plus favorite or disliked ingredients",
  "budget band, prep-time tolerance, and cooking skill"
] as const;

function trimTranscript(messages: OnboardingChatMessage[], maxTranscriptMessages: number): OnboardingChatMessage[] {
  return messages.slice(-maxTranscriptMessages);
}

function formatTranscript(messages: OnboardingChatMessage[]): string {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
}

function measurePrompt(system: string, messages: Array<{ role: "user" | "assistant"; content: string }>): number {
  return system.length + messages.reduce((total, message) => total + message.content.length, 0);
}

export function assembleOnboardingReplyPrompt(
  input: OnboardingReplyPromptInput,
  limits: ClaudePromptLimits
): PromptEnvelope {
  const transcript = trimTranscript(input.transcript, limits.maxTranscriptMessages);
  const system = [
    "You are the Freshful Shopping Assistant onboarding guide.",
    "Help Romanian households build a usable grocery-planning profile.",
    "Ask exactly one concise next question unless the user already provided everything needed.",
    "Keep answers practical, warm, and specific to meal planning and grocery shopping.",
    "Prefer the user's language when possible and avoid exposing internal implementation details."
  ].join(" ");
  const userPrompt = [
    "Continue the onboarding conversation.",
    `Focus on collecting the remaining profile fields: ${onboardingFieldChecklist.join(", ")}.`,
    "Conversation transcript:",
    formatTranscript(transcript)
  ].join("\n\n");
  const messages = [
    {
      role: "user" as const,
      content: userPrompt
    }
  ];

  return {
    system,
    messages,
    promptChars: measurePrompt(system, messages),
    transcriptMessageCount: transcript.length
  };
}

export function assembleProfileExtractionPrompt(
  input: ProfileExtractionPromptInput,
  limits: ClaudePromptLimits
): PromptEnvelope {
  const transcript = trimTranscript(input.transcript, limits.maxTranscriptMessages);
  const system = [
    "You convert onboarding chat transcripts into structured household profile JSON.",
    "Return valid JSON only with no markdown fences or explanatory prose.",
    "Never invent, infer, or default unknown profile values.",
    "Only include values that are directly supported by the transcript.",
    "If allergies or medical flags are not explicitly confirmed, leave them unknown instead of outputting empty arrays or false values."
  ].join(" ");
  const userPrompt = [
    "Generate one of these JSON payloads.",
    "If the transcript contains every required field, return:",
    '{"status":"complete","profile":{"householdType":"single|couple|family","numChildren":0,"dietaryRestrictions":["vegetarian|vegan|gluten-free"],"allergies":{"normalized":["gluten|dairy|eggs|peanuts|tree-nuts|soy|fish|shellfish|sesame"],"freeText":["..."]},"medicalFlags":{"diabetes":false,"hypertension":false},"goals":["weight_loss|maintenance|muscle_gain"],"cuisinePreferences":["..."],"favoriteIngredients":["..."],"dislikedIngredients":["..."],"budgetBand":"low|medium|high","maxPrepTimeMinutes":30,"cookingSkill":"beginner|intermediate|advanced"}}',
    "If any required field remains unknown, return:",
    '{"status":"incomplete","knownProfile":{"householdType":"single|couple|family","dietaryRestrictions":["vegetarian|vegan|gluten-free"],"allergies":{"normalized":["gluten|dairy|eggs|peanuts|tree-nuts|soy|fish|shellfish|sesame"],"freeText":["..."]},"medicalFlags":{"diabetes":true},"goals":["weight_loss|maintenance|muscle_gain"],"cuisinePreferences":["..."],"favoriteIngredients":["..."],"dislikedIngredients":["..."],"budgetBand":"low|medium|high","maxPrepTimeMinutes":30,"cookingSkill":"beginner|intermediate|advanced"},"missingFields":["numChildren","medicalFlags.hypertension"]}',
    "For incomplete payloads, omit unknown fields from knownProfile instead of guessing them.",
    "Do not claim there are no allergies or no medical flags unless the transcript states that explicitly.",
    "Transcript:",
    formatTranscript(transcript)
  ].join("\n\n");
  const messages = [
    {
      role: "user" as const,
      content: userPrompt
    }
  ];

  return {
    system,
    messages,
    promptChars: measurePrompt(system, messages),
    transcriptMessageCount: transcript.length
  };
}

export function assembleMealPlanPrompt(input: MealPlanPromptInput): PromptEnvelope {
  const system = [
    "You create structured meal plans for the Freshful Shopping Assistant.",
    "Return valid JSON only with no markdown fences or explanatory prose.",
    "The JSON must match this shape exactly: {\"title\":string,\"durationDays\":1..7,\"recipes\":[{\"id\":string,\"title\":string,\"ingredients\":[{\"name\":string,\"quantity\":number,\"unit\":string}],\"instructions\":[string],\"tags\":[string],\"estimatedMacros\":{\"calories\":number,\"proteinGrams\":number,\"carbsGrams\":number,\"fatGrams\":number}}],\"days\":[{\"dayNumber\":1..7,\"meals\":[{\"slot\":\"breakfast|lunch|dinner|snack\",\"recipeId\":string}]}],\"metadata\":{\"tags\":[string],\"estimatedMacros\":{\"calories\":number,\"proteinGrams\":number,\"carbsGrams\":number,\"fatGrams\":number}}}.",
    "Use exactly the requested durationDays.",
    "For every day, include each requested meal slot exactly once and no unrequested slots.",
    "Use concise recipe titles, realistic ingredient quantities, and clear preparation steps.",
    "Respect dietary restrictions, allergies, health flags, prep-time limits, cooking skill, and stated preferences.",
    "Do not include userId, templateId, dates, overrides, or any fields outside the required JSON shape."
  ].join(" ");
  const userPrompt = [
    "Generate a meal plan for this saved household profile and planning request.",
    `Request options: ${JSON.stringify(input.options)}`,
    `Profile context: ${JSON.stringify(input.profile)}`,
    "Return only the JSON object."
  ].join("\n\n");
  const messages = [
    {
      role: "user" as const,
      content: userPrompt
    }
  ];

  return {
    system,
    messages,
    promptChars: measurePrompt(system, messages),
    transcriptMessageCount: 0
  };
}

export function assembleMealPlanRefinementPrompt(input: MealPlanRefinementPromptInput): PromptEnvelope {
  const system = [
    "You refine structured meal plans for the Freshful Shopping Assistant.",
    "Return valid JSON only with no markdown fences or explanatory prose.",
    "The JSON must match this exact shape: {\"title\":string,\"durationDays\":1..7,\"recipes\":[{\"id\":string,\"title\":string,\"ingredients\":[{\"name\":string,\"quantity\":number,\"unit\":string}],\"instructions\":[string],\"tags\":[string],\"estimatedMacros\":{\"calories\":number,\"proteinGrams\":number,\"carbsGrams\":number,\"fatGrams\":number}}],\"days\":[{\"dayNumber\":1..7,\"meals\":[{\"slot\":\"breakfast|lunch|dinner|snack\",\"recipeId\":string}]}],\"metadata\":{\"tags\":[string],\"estimatedMacros\":{\"calories\":number,\"proteinGrams\":number,\"carbsGrams\":number,\"fatGrams\":number}}}.",
    "Preserve the planning horizon, day numbers, and meal slots from the current plan exactly.",
    "Apply the user's refinement request while respecting dietary restrictions, allergies, health flags, prep-time limits, cooking skill, and stated preferences.",
    "Update recipes, ingredient quantities, and macro estimates coherently when the refinement changes them.",
    "Do not include ids or fields outside the required JSON shape except recipe ids already needed by the schema."
  ].join(" ");
  const userPrompt = [
    "Refine the existing meal plan according to the user's request.",
    `User refinement request: ${input.refinementPrompt}`,
    `Profile context: ${JSON.stringify(input.profile)}`,
    `Current meal plan: ${JSON.stringify(input.currentPlan)}`,
    "Return only the refined JSON object."
  ].join("\n\n");
  const messages = [
    {
      role: "user" as const,
      content: userPrompt
    }
  ];

  return {
    system,
    messages,
    promptChars: measurePrompt(system, messages),
    transcriptMessageCount: 0
  };
}

export function assembleShoppingProductSelectionPrompt(
  input: ShoppingProductSelectionPromptInput
): PromptEnvelope {
  const system = [
    "You choose the best Freshful catalog candidate for a shopping-list ingredient.",
    "Return valid JSON only with no markdown fences or explanatory prose.",
    '{"selectedProductId":string|null,"reason":string} is the only allowed response shape.',
    "Only choose from the provided candidate ids.",
    "Prefer the most direct ingredient match with compatible package size, availability, and user constraints.",
    "If no candidate is a safe or clear match, return selectedProductId as null and explain why briefly."
  ].join(" ");
  const userPrompt = [
    "Select the best Freshful product candidate for this ingredient.",
    `Ingredient requirement: ${JSON.stringify({
      ingredientName: input.ingredientName,
      requiredQuantity: input.requiredQuantity,
      requiredUnit: input.requiredUnit
    })}`,
    `Household profile context: ${JSON.stringify(input.profile)}`,
    `Candidates: ${JSON.stringify(input.candidates)}`,
    "Return only the JSON object."
  ].join("\n\n");
  const messages = [
    {
      role: "user" as const,
      content: userPrompt
    }
  ];

  return {
    system,
    messages,
    promptChars: measurePrompt(system, messages),
    transcriptMessageCount: 0
  };
}
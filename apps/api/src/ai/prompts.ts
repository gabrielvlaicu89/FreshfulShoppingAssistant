import type { OnboardingChatMessage } from "@freshful/contracts";

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
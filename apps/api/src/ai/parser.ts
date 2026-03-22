import { z } from "zod";

export interface StructuredParseResult<T> {
  data: T | null;
  fallbackText: string;
  failureReason: "missing_json" | "invalid_json" | "schema_mismatch" | null;
}

function extractJsonCandidate(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/iu) ?? trimmed.match(/```\s*([\s\S]*?)```/iu);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = trimmed.indexOf("{");
  const lastBraceIndex = trimmed.lastIndexOf("}");

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return trimmed.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  return null;
}

export function parseStructuredResponse<T>(rawText: string, schema: z.ZodType<T>): StructuredParseResult<T> {
  const jsonCandidate = extractJsonCandidate(rawText);

  if (!jsonCandidate) {
    return {
      data: null,
      fallbackText: rawText.trim(),
      failureReason: "missing_json"
    };
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(jsonCandidate);
  } catch {
    return {
      data: null,
      fallbackText: rawText.trim(),
      failureReason: "invalid_json"
    };
  }

  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
    return {
      data: null,
      fallbackText: rawText.trim(),
      failureReason: "schema_mismatch"
    };
  }

  return {
    data: parsed.data,
    fallbackText: rawText.trim(),
    failureReason: null
  };
}
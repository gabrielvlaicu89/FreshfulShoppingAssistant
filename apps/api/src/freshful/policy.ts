import { z } from "zod";

const freshfulCatalogRecencyPolicyValues = ["search", "product-detail"] as const;
const freshfulCatalogRecencyStatusValues = ["fresh", "stale", "expired"] as const;

export const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
export const DETAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const STALE_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;

export const freshfulCatalogRecencyPolicySchema = z.enum(freshfulCatalogRecencyPolicyValues);
export const freshfulCatalogRecencyStatusSchema = z.enum(freshfulCatalogRecencyStatusValues);

export type FreshfulCatalogRecencyPolicy = z.infer<typeof freshfulCatalogRecencyPolicySchema>;
export type FreshfulCatalogRecencyStatus = z.infer<typeof freshfulCatalogRecencyStatusSchema>;

export const freshfulCatalogRecencySchema = z
  .object({
    policy: freshfulCatalogRecencyPolicySchema,
    status: freshfulCatalogRecencyStatusSchema,
    checkedAt: z.string().datetime({ offset: true }),
    observedAt: z.string().datetime({ offset: true }),
    freshUntil: z.string().datetime({ offset: true }),
    staleUntil: z.string().datetime({ offset: true }),
    ageMs: z.number().int().min(0),
    isFresh: z.boolean(),
    isStale: z.boolean(),
    canUseStaleFallback: z.boolean()
  })
  .strict();

export type FreshfulCatalogRecency = z.infer<typeof freshfulCatalogRecencySchema>;

function getPolicyTtlMs(policy: FreshfulCatalogRecencyPolicy): number {
  return policy === "search" ? SEARCH_CACHE_TTL_MS : DETAIL_CACHE_TTL_MS;
}

export function evaluateFreshfulCatalogRecency(args: {
  policy: FreshfulCatalogRecencyPolicy;
  observedAt: string;
  now: Date;
}): FreshfulCatalogRecency {
  const observedAtMs = new Date(args.observedAt).getTime();
  const checkedAtMs = args.now.getTime();
  const ttlMs = getPolicyTtlMs(args.policy);
  const freshUntilMs = observedAtMs + ttlMs;
  const staleUntilMs = observedAtMs + STALE_FALLBACK_TTL_MS;
  let status: FreshfulCatalogRecencyStatus = "expired";

  if (freshUntilMs > checkedAtMs) {
    status = "fresh";
  } else if (staleUntilMs > checkedAtMs) {
    status = "stale";
  }

  return freshfulCatalogRecencySchema.parse({
    policy: args.policy,
    status,
    checkedAt: args.now.toISOString(),
    observedAt: new Date(observedAtMs).toISOString(),
    freshUntil: new Date(freshUntilMs).toISOString(),
    staleUntil: new Date(staleUntilMs).toISOString(),
    ageMs: Math.max(0, checkedAtMs - observedAtMs),
    isFresh: status === "fresh",
    isStale: status !== "fresh",
    canUseStaleFallback: status === "stale"
  });
}
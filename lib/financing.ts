import { z } from "zod";

export const FINANCE_TERMS = [36, 48, 60, 72] as const;
export const QUOTED_CREDIT_TIERS = ["excellent", "very_good", "good"] as const;
export const CREDIT_TIERS = [...QUOTED_CREDIT_TIERS, "consultation"] as const;
export type FinanceTerm = (typeof FINANCE_TERMS)[number];
export type QuotedCreditTier = (typeof QUOTED_CREDIT_TIERS)[number];
export type CreditTier = (typeof CREDIT_TIERS)[number];
export const CREDIT_SCORE_LABELS: Record<CreditTier, string> = {
  excellent: "740+",
  very_good: "680–739",
  good: "620–679",
  consultation: "619 or below",
};

const apr = z.number().finite().min(0).max(100).nullable();
const termRates = z.object({ 36: apr, 48: apr, 60: apr, 72: apr }).strict();
export const financingConfigSchema = z
  .object({
    version: z.literal(1),
    illustrative: z.boolean(),
    rates: z
      .object({
        excellent: termRates,
        very_good: termRates,
        good: termRates,
      })
      .strict(),
  })
  .strict();
export type FinancingConfig = z.infer<typeof financingConfigSchema>;

export function emptyFinancingConfig(): FinancingConfig {
  const blank = () => ({ 36: null, 48: null, 60: null, 72: null });
  return {
    version: 1,
    illustrative: true,
    rates: {
      excellent: blank(),
      very_good: blank(),
      good: blank(),
    },
  };
}

/** Missing or corrupt settings disable estimates, never imply a 0% APR. */
export function parseFinancingConfig(value: unknown): FinancingConfig | null {
  try {
    const parsed = financingConfigSchema.safeParse(
      typeof value === "string" ? JSON.parse(value) : value,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const money = z.number().int().min(0).max(100_000_000);
export const financingSelectionSchema = z
  .object({
    creditTier: z.enum(CREDIT_TIERS),
    termMonths: z.union([
      z.literal(36),
      z.literal(48),
      z.literal(60),
      z.literal(72),
    ]),
    downPaymentCents: money,
  })
  .strict();
export type FinancingSelection = z.infer<typeof financingSelectionSchema>;

export function calculateLoan(input: {
  priceCents: number;
  downPaymentCents: number;
  termMonths: FinanceTerm;
  aprPercent: number;
}) {
  const { priceCents, downPaymentCents, termMonths, aprPercent } = input;
  if (
    !money.safeParse(priceCents).success ||
    !money.safeParse(downPaymentCents).success ||
    downPaymentCents > priceCents ||
    !FINANCE_TERMS.includes(termMonths) ||
    !Number.isFinite(aprPercent) ||
    aprPercent < 0 ||
    aprPercent > 100
  )
    throw new RangeError("Invalid financing inputs");
  const principalCents = priceCents - downPaymentCents;
  const monthlyRate = aprPercent / 100 / 12;
  // Equivalent to the supplied Excel formula, stable for very small rates.
  const payment =
    monthlyRate === 0
      ? principalCents / termMonths
      : (principalCents * monthlyRate) /
        -Math.expm1(-termMonths * Math.log1p(monthlyRate));
  return {
    principalCents,
    monthlyPaymentCents: Math.round(payment),
    totalInterestCents: Math.max(
      0,
      Math.round(payment * termMonths - principalCents),
    ),
  };
}

export type FinancingEstimate = {
  status: "estimated" | "manual_review" | "rates_unavailable";
  principalCents: number;
  aprPercent: number | null;
  monthlyPaymentCents: number | null;
  totalInterestCents: number | null;
  illustrative: boolean;
};

export function estimateFinancing(
  priceCents: number,
  selection: FinancingSelection,
  config: FinancingConfig | null,
): FinancingEstimate {
  const validated = financingSelectionSchema.parse(selection);
  if (
    !money.safeParse(priceCents).success ||
    validated.downPaymentCents > priceCents
  )
    throw new RangeError("Down payment must not exceed the vehicle price");
  const base = {
    principalCents: priceCents - selection.downPaymentCents,
    aprPercent: null,
    monthlyPaymentCents: null,
    totalInterestCents: null,
    illustrative: config?.illustrative ?? false,
  };
  if (selection.creditTier === "consultation")
    return { ...base, status: "manual_review" };
  if (!config) return { ...base, status: "rates_unavailable" };
  const rate = config.rates[selection.creditTier][selection.termMonths];
  if (rate === null || rate === undefined)
    return { ...base, status: "rates_unavailable" };
  return {
    status: "estimated",
    illustrative: config.illustrative,
    aprPercent: rate,
    ...calculateLoan({ priceCents, ...selection, aprPercent: rate }),
  };
}

export const financingSnapshotSchema = financingSelectionSchema.extend({
  version: z.literal(1),
  priceCents: money,
  principalCents: money,
  status: z.enum(["estimated", "manual_review", "rates_unavailable"]),
  aprPercent: apr,
  monthlyPaymentCents: z.number().int().nonnegative().nullable(),
  totalInterestCents: z.number().int().nonnegative().nullable(),
  illustrative: z.boolean(),
  calculatedAt: z.string().datetime(),
});
export type FinancingSnapshot = z.infer<typeof financingSnapshotSchema>;

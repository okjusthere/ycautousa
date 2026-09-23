import { describe, expect, it } from "vitest";
import {
  calculateLoan,
  emptyFinancingConfig,
  estimateFinancing,
  parseFinancingConfig,
  type FinanceTerm,
} from "../../lib/financing";

const example = {
  priceCents: 3_628_500,
  downPaymentCents: 600_000,
  aprPercent: 7.99,
};

describe("vehicle financing estimates", () => {
  it.each([
    [36, 94888],
    [48, 73920],
    [60, 61393],
    [72, 53085],
  ] as const)(
    "matches the Excel amortization method for %i months without taxes or fees",
    (termMonths, expected) => {
      const quote = calculateLoan({ ...example, termMonths });
      expect(quote.principalCents).toBe(3_028_500);
      expect(quote.monthlyPaymentCents).toBe(expected);
    },
  );

  it("amortizes the entire balance with zero APR and rounds only the displayed result", () => {
    expect(
      calculateLoan({
        priceCents: 1_000_000,
        downPaymentCents: 0,
        aprPercent: 0,
        termMonths: 36,
      }),
    ).toEqual({
      principalCents: 1_000_000,
      monthlyPaymentCents: 27778,
      totalInterestCents: 0,
    });
    expect(
      calculateLoan({
        ...example,
        downPaymentCents: example.priceCents,
        termMonths: 72,
      }),
    ).toEqual({
      principalCents: 0,
      monthlyPaymentCents: 0,
      totalInterestCents: 0,
    });
  });

  it("does not lose precision for a near-zero positive rate", () => {
    const zero = calculateLoan({ ...example, aprPercent: 0, termMonths: 60 });
    const small = calculateLoan({
      ...example,
      aprPercent: 1e-10,
      termMonths: 60,
    });
    expect(small.monthlyPaymentCents).toBe(zero.monthlyPaymentCents);
  });

  it.each([
    { downPaymentCents: -1 },
    { downPaymentCents: 3_628_501 },
    { downPaymentCents: 1.5 },
    { priceCents: Number.NaN },
    { aprPercent: -1 },
    { aprPercent: Infinity },
    { aprPercent: 101 },
    { termMonths: 12 as FinanceTerm },
  ])("rejects invalid financial inputs %j", (override) => {
    expect(() =>
      calculateLoan({ ...example, termMonths: 60, ...override }),
    ).toThrow(RangeError);
  });

  it("never quotes the manual-consultation tier even when rates are populated", () => {
    const config = emptyFinancingConfig();
    config.rates.excellent[72] = 5.99;
    expect(
      estimateFinancing(
        example.priceCents,
        {
          creditTier: "consultation",
          downPaymentCents: 500_000,
          termMonths: 72,
        },
        config,
      ),
    ).toMatchObject({
      status: "manual_review",
      aprPercent: null,
      monthlyPaymentCents: null,
    });
  });

  it("uses the exact selected tier and term, distinguishing missing from zero APR", () => {
    const config = emptyFinancingConfig();
    config.rates.good[48] = 7.99;
    config.rates.excellent[48] = 0;
    const selection = {
      creditTier: "good" as const,
      downPaymentCents: 600_000,
      termMonths: 48 as const,
    };
    expect(
      estimateFinancing(example.priceCents, selection, config),
    ).toMatchObject({
      status: "estimated",
      aprPercent: 7.99,
      monthlyPaymentCents: 73920,
    });
    expect(
      estimateFinancing(
        example.priceCents,
        { ...selection, creditTier: "excellent" },
        config,
      ),
    ).toMatchObject({
      status: "estimated",
      aprPercent: 0,
      monthlyPaymentCents: 63094,
    });
    expect(
      estimateFinancing(
        example.priceCents,
        { ...selection, termMonths: 72 },
        config,
      ),
    ).toMatchObject({
      status: "rates_unavailable",
      aprPercent: null,
      monthlyPaymentCents: null,
    });
    expect(estimateFinancing(example.priceCents, selection, null).status).toBe(
      "rates_unavailable",
    );
  });

  it("does not turn corrupt, obsolete or incomplete configuration into a quote", () => {
    for (const value of [
      undefined,
      null,
      "{",
      {},
      { version: 2 },
      { ...emptyFinancingConfig(), rates: {} },
    ])
      expect(parseFinancingConfig(value)).toBeNull();
    const empty = emptyFinancingConfig();
    expect(parseFinancingConfig(JSON.stringify(empty))).toEqual(empty);
    expect(
      parseFinancingConfig({
        ...empty,
        rates: { ...empty.rates, good: { 36: "", 48: 0, 60: 0, 72: 0 } },
      }),
    ).toBeNull();
  });
});

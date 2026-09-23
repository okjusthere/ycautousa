import { useId, useState, type KeyboardEvent } from "react";
import type { Vehicle } from "../lib/types";
import {
  CREDIT_SCORE_LABELS,
  CREDIT_TIERS,
  FINANCE_TERMS,
  estimateFinancing,
  type CreditTier,
  type FinanceTerm,
  type FinancingConfig,
  type FinancingSelection,
} from "../lib/financing";
import { formatLocalizedMileage, useLocale } from "../src/i18n";
import { financingCopy, financingMoney } from "../src/financing-copy";
import { LeadForm } from "./LeadForm";

// Keep the editable text separate from the numeric amount: blank and malformed
// input must never silently become a zero-dollar down payment.
function downPaymentCents(value: string, priceCents: number): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= priceCents
    ? cents
    : null;
}

export function VehiclePaymentCalculator({
  vehicle,
  config,
  configLoading,
}: {
  vehicle: Vehicle;
  config: FinancingConfig | null;
  configLoading: boolean;
}) {
  const { locale } = useLocale();
  const copy = financingCopy[locale];
  const id = useId();
  const priceCents = vehicle.priceCents ?? 0;
  const [mode, setMode] = useState<"finance" | "cash">("finance");
  const [downPayment, setDownPayment] = useState(() =>
    String(Math.min(500_000, priceCents) / 100),
  );
  const [termMonths, setTermMonths] = useState<FinanceTerm>(72);
  const [creditTier, setCreditTier] = useState<CreditTier | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const downCents = downPaymentCents(downPayment, priceCents);
  const selection: FinancingSelection | null =
    creditTier && downCents !== null
      ? { creditTier, termMonths, downPaymentCents: downCents }
      : null;
  const estimate =
    selection && !configLoading
      ? estimateFinancing(priceCents, selection, config)
      : null;
  const sliderSteps = Math.ceil(priceCents / 25_000);
  const sliderValue =
    downCents === priceCents
      ? sliderSteps
      : Math.min(sliderSteps, Math.round((downCents ?? 0) / 25_000));
  const money = (cents: number, decimals = true) =>
    financingMoney(cents, locale, decimals);

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "finance"
        : event.key === "End"
          ? "cash"
          : mode === "finance"
            ? "cash"
            : "finance";
    setMode(next);
    document.getElementById(`${id}-${next}-tab`)?.focus();
  }

  return (
    <section className="payment-calculator" aria-label={copy.calculator}>
      <div className="payment-tabs" role="tablist" aria-label={copy.calculator}>
        {(["finance", "cash"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`${id}-${tab}-tab`}
            aria-controls={`${id}-${tab}-panel`}
            aria-selected={mode === tab}
            tabIndex={mode === tab ? 0 : -1}
            onKeyDown={navigateTabs}
            onClick={() => setMode(tab)}
          >
            {copy[tab]}
          </button>
        ))}
      </div>
      <header className="payment-vehicle-price">
        <div>
          <span>{mode === "cash" ? copy.cashPrice : copy.vehiclePrice}</span>
          <strong>{money(priceCents, false)}</strong>
        </div>
        <span className="payment-mileage">
          {formatLocalizedMileage(vehicle.mileage, locale)}
        </span>
        <p className="payment-fees">{copy.excludedFees}</p>
      </header>
      <div
        id={`${id}-finance-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-finance-tab`}
        hidden={mode !== "finance"}
        className="payment-panel"
      >
        <div className="payment-down-payment">
          <label htmlFor={`${id}-down`}>{copy.downPayment}</label>
          <div className="payment-amount-input">
            <span aria-hidden="true">$</span>
            <input
              id={`${id}-down`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={downPayment}
              maxLength={12}
              aria-invalid={downCents === null}
              aria-describedby={`${id}-down-help${downCents === null ? ` ${id}-down-error` : ""}`}
              onChange={(event) => setDownPayment(event.target.value)}
            />
          </div>
          <input
            className="payment-slider"
            type="range"
            min={0}
            max={sliderSteps}
            step={1}
            value={sliderValue}
            aria-label={copy.downPaymentSlider}
            aria-valuetext={
              downCents === null ? copy.downPaymentError : money(downCents)
            }
            onChange={(event) =>
              setDownPayment(
                String(
                  Math.min(Number(event.target.value) * 25_000, priceCents) /
                    100,
                ),
              )
            }
          />
          <div className="payment-range-labels">
            <span>{money(0, false)}</span>
            <span>{money(priceCents, false)}</span>
          </div>
          <p className="payment-help" id={`${id}-down-help`}>
            {copy.downPaymentHelp}
          </p>
          {downCents === null && (
            <p className="payment-error" id={`${id}-down-error`} role="alert">
              {copy.downPaymentError}
            </p>
          )}
        </div>
        <fieldset className="payment-options">
          <legend>{copy.loanTerm}</legend>
          <div className="payment-term-options">
            {FINANCE_TERMS.map((term) => (
              <label key={term} className="payment-option">
                <input
                  type="radio"
                  name={`${id}-term`}
                  value={term}
                  checked={termMonths === term}
                  onChange={() => setTermMonths(term)}
                />
                <span>
                  <strong>{term}</strong> {copy.months}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset
          className="payment-options"
          aria-describedby={`${id}-credit-help`}
        >
          <legend>{copy.creditTier}</legend>
          <p className="payment-help" id={`${id}-credit-help`}>
            {copy.creditHelp}
          </p>
          <div className="payment-credit-options">
            {CREDIT_TIERS.map((tier) => (
              <label key={tier} className="payment-option">
                <input
                  type="radio"
                  name={`${id}-credit`}
                  value={tier}
                  checked={creditTier === tier}
                  onChange={() => {
                    setCreditTier(tier);
                    if (tier === "consultation") setContactOpen(true);
                  }}
                />
                <span>
                  <strong>
                    {tier === "consultation"
                      ? copy.lowScore
                      : CREDIT_SCORE_LABELS[tier]}
                  </strong>
                  <small>{copy.credit[tier]}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="payment-result" aria-live="polite" aria-atomic="true">
          {downCents === null ? (
            <p>{copy.downPaymentError}</p>
          ) : creditTier === "consultation" ? (
            <>
              <strong>{copy.manualReview}</strong>
              <p>{copy.manualReviewHelp}</p>
            </>
          ) : configLoading ? (
            <p>{copy.loading}</p>
          ) : !creditTier ? (
            <p>{copy.chooseCredit}</p>
          ) : estimate?.status === "estimated" ? (
            <>
              <span className="payment-result-label">
                {copy.monthlyPayment}
              </span>
              <p className="payment-monthly">
                <strong data-testid="financing-monthly-payment">
                  {money(estimate.monthlyPaymentCents!)}
                </strong>
                <span>{copy.perMonth}</span>
              </p>
              <p className="payment-rate">
                {estimate.aprPercent}% {copy.apr} <span>·</span> {termMonths}{" "}
                {copy.months}
              </p>
              <p className="payment-fees">{copy.excludedFees}</p>
              <p className="payment-estimate-note">
                {estimate.illustrative
                  ? copy.illustrativeNotice
                  : copy.estimateNotice}
              </p>
            </>
          ) : (
            <>
              <strong>{copy.ratesUnavailable}</strong>
              <p>{copy.ratesUnavailableHelp}</p>
            </>
          )}
        </div>
        {estimate?.status === "estimated" && (
          <details className="payment-details">
            <summary>{copy.details}</summary>
            <dl>
              <div>
                <dt>{copy.vehiclePrice}</dt>
                <dd>{money(priceCents)}</dd>
              </div>
              <div>
                <dt>{copy.downPayment}</dt>
                <dd>{money(selection!.downPaymentCents)}</dd>
              </div>
              <div>
                <dt>{copy.principal}</dt>
                <dd>{money(estimate.principalCents)}</dd>
              </div>
              <div>
                <dt>{copy.apr}</dt>
                <dd>{estimate.aprPercent}%</dd>
              </div>
              <div>
                <dt>{copy.loanTerm}</dt>
                <dd>
                  {termMonths} {copy.months}
                </dd>
              </div>
              <div>
                <dt>{copy.totalInterest}</dt>
                <dd>{money(estimate.totalInterestCents!)}</dd>
              </div>
            </dl>
          </details>
        )}
        {!contactOpen && (
          <button
            className="button button--red payment-inquiry-button"
            type="button"
            disabled={!selection}
            onClick={() => setContactOpen(true)}
          >
            {copy.inquiry}
          </button>
        )}
        {contactOpen && (
          <div className="payment-inquiry">
            <h3>{copy.inquiryTitle}</h3>
            <p className="payment-help">{copy.inquiryHelp}</p>
            <LeadForm
              vehicle={vehicle}
              type="financing"
              financing={selection ?? undefined}
              compact
            />
          </div>
        )}
      </div>
      <div
        id={`${id}-cash-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-cash-tab`}
        hidden={mode !== "cash"}
        className="payment-panel payment-cash"
      >
        <p className="payment-help">{copy.cashHelp}</p>
      </div>
    </section>
  );
}

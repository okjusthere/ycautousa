import { useEffect, useId, useRef, useState } from "react";
import {
  CREDIT_SCORE_LABELS,
  FINANCE_TERMS,
  QUOTED_CREDIT_TIERS,
  emptyFinancingConfig,
  type FinanceTerm,
  type FinancingConfig,
  type QuotedCreditTier,
} from "../lib/financing";

const labels: Record<QuotedCreditTier, string> = {
  excellent: "Excellent",
  very_good: "Very good",
  good: "Good",
};

function RateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // A server refresh updates this field, while edits to another rate do not
  // erase an unfinished or invalid value in this field.
  useEffect(() => {
    setDraft(null);
    setInvalid(false);
    inputRef.current?.setCustomValidity("");
  }, [value]);
  return (
    <label className="financing-rate-field">
      <span>{label}</span>
      <div className="financing-rate-input">
        <input
          ref={inputRef}
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="decimal"
          aria-label={label}
          value={draft ?? value ?? ""}
          aria-invalid={invalid}
          aria-describedby={invalid ? id : undefined}
          placeholder="Not offered"
          onChange={(event) => {
            const input = event.currentTarget;
            const raw = input.value;
            input.setCustomValidity("");
            const valid = input.validity.valid;
            setDraft(raw);
            setInvalid(!valid);
            if (valid) onChange(raw === "" ? null : Number(raw));
            else
              input.setCustomValidity(
                "Enter an APR from 0 to 100 with at most two decimal places.",
              );
          }}
        />
        <span aria-hidden="true">%</span>
      </div>
      {invalid && (
        <small className="payment-error" id={id}>
          Use 0–100, with up to two decimal places.
        </small>
      )}
    </label>
  );
}

export function FinancingSettings({
  value,
  onChange,
}: {
  value: FinancingConfig | null;
  onChange: (config: FinancingConfig | null) => void;
}) {
  const config = value ?? emptyFinancingConfig();
  function updateRate(
    tier: QuotedCreditTier,
    term: FinanceTerm,
    rate: number | null,
  ) {
    onChange({
      ...config,
      rates: {
        ...config.rates,
        [tier]: { ...config.rates[tier], [term]: rate },
      },
    });
  }
  return (
    <section
      className="form-section financing-settings"
      aria-label="Financing estimates"
    >
      <div className="form-section-heading">
        <span>APR</span>
        <div>
          <h2>Financing estimates</h2>
          <p>
            Set the annual percentage rate for each credit range and loan term.
          </p>
        </div>
      </div>
      <p className="financing-settings-help">
        Leave a rate blank to offer personal assistance instead of a payment
        estimate. A blank rate is not 0%. Scores of 619 or below always require
        a conversation. Estimates exclude taxes, registration and document fees.
      </p>
      <label className="financing-illustrative">
        <input
          type="checkbox"
          checked={config.illustrative}
          onChange={(event) =>
            onChange({ ...config, illustrative: event.target.checked })
          }
        />
        <span>Preset illustrative rates</span>
      </label>
      <p className="financing-settings-help">
        Keep this checked while using example rates. Visitors will see that the
        estimate is not a loan offer.
      </p>
      {QUOTED_CREDIT_TIERS.map((tier) => (
        <fieldset key={tier} className="financing-rate-tier">
          <legend>
            {labels[tier]} <span>{CREDIT_SCORE_LABELS[tier]}</span>
          </legend>
          <div className="financing-rate-grid">
            {FINANCE_TERMS.map((term) => (
              <RateInput
                key={term}
                label={`${labels[tier]} ${term} months APR`}
                value={config.rates[tier][term]}
                onChange={(rate) => updateRate(tier, term, rate)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </section>
  );
}

import { useId } from "react";
import { US_STATES } from "../lib/preapproval";
import { useLocale } from "../src/i18n";
import { preapprovalCopy } from "../src/financing-copy";

export type PreapprovalFieldErrors = Partial<
  Record<
    | "ssn"
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "state"
    | "postalCode"
    | "residenceYears"
    | "residenceMonths"
    | "consent",
    string
  >
>;

/** Uncontrolled inputs keep private application values out of shared state. */
export function PreapprovalFields({
  disabled,
  errors,
}: {
  disabled: boolean;
  errors: PreapprovalFieldErrors;
}) {
  const { locale, path } = useLocale();
  const copy = preapprovalCopy[locale];
  const id = useId();
  const errorProps = (field: keyof PreapprovalFieldErrors) => ({
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field] ? `${id}-${field}-error` : undefined,
  });
  const fieldError = (field: keyof PreapprovalFieldErrors) =>
    errors[field] ? (
      <small className="payment-error" id={`${id}-${field}-error`}>
        {errors[field]}
      </small>
    ) : null;
  return (
    <fieldset className="preapproval-fields" disabled={disabled}>
      <legend>{copy.fields}</legend>
      <p className="payment-help preapproval-notice">{copy.notice}</p>
      <label>
        <span>{copy.ssn}</span>
        <input
          name="ssn"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label={copy.ssn}
          required
          maxLength={11}
          spellCheck={false}
          data-private="true"
          {...errorProps("ssn")}
          aria-describedby={`${id}-ssn-help${errors.ssn ? ` ${id}-ssn-error` : ""}`}
        />
        <small className="payment-help" id={`${id}-ssn-help`}>
          {copy.ssnHelp}
        </small>
        {fieldError("ssn")}
      </label>
      <label>
        <span>{copy.addressLine1}</span>
        <input
          name="addressLine1"
          required
          minLength={2}
          maxLength={200}
          aria-label={copy.addressLine1}
          autoComplete="off"
          data-private="true"
          {...errorProps("addressLine1")}
        />
        {fieldError("addressLine1")}
      </label>
      <label>
        <span>{copy.addressLine2}</span>
        <input
          name="addressLine2"
          maxLength={100}
          aria-label={copy.addressLine2}
          autoComplete="off"
          data-private="true"
          {...errorProps("addressLine2")}
        />
        {fieldError("addressLine2")}
      </label>
      <div className="form-grid">
        <label>
          <span>{copy.city}</span>
          <input
            name="city"
            required
            minLength={2}
            maxLength={100}
            aria-label={copy.city}
            autoComplete="off"
            data-private="true"
            {...errorProps("city")}
          />
          {fieldError("city")}
        </label>
        <label>
          <span>{copy.state}</span>
          <select
            name="state"
            required
            defaultValue=""
            autoComplete="off"
            aria-label={copy.state}
            data-private="true"
            {...errorProps("state")}
          >
            <option value="">{copy.chooseState}</option>
            {Object.entries(US_STATES).map(([code, name]) => (
              <option key={code} value={code}>
                {code} — {name}
              </option>
            ))}
          </select>
          {fieldError("state")}
        </label>
        <label>
          <span>{copy.postalCode}</span>
          <input
            name="postalCode"
            required
            maxLength={10}
            inputMode="numeric"
            aria-label={copy.postalCode}
            autoComplete="off"
            data-private="true"
            {...errorProps("postalCode")}
          />
          {fieldError("postalCode")}
        </label>
      </div>
      <fieldset className="preapproval-residence">
        <legend>{copy.residence}</legend>
        <div className="form-grid">
          <label>
            <span>{copy.residenceYears}</span>
            <input
              name="residenceYears"
              type="number"
              min={0}
              max={100}
              aria-label={copy.residenceYears}
              step={1}
              required
              inputMode="numeric"
              autoComplete="off"
              data-private="true"
              {...errorProps("residenceYears")}
            />
            {fieldError("residenceYears")}
          </label>
          <label>
            <span>{copy.residenceMonths}</span>
            <input
              name="residenceMonths"
              type="number"
              min={0}
              max={11}
              aria-label={copy.residenceMonths}
              step={1}
              required
              inputMode="numeric"
              autoComplete="off"
              data-private="true"
              {...errorProps("residenceMonths")}
            />
            {fieldError("residenceMonths")}
          </label>
        </div>
      </fieldset>
      <label className="preapproval-consent">
        <input
          name="consent"
          type="checkbox"
          required
          aria-label={copy.consent}
          data-private="true"
          {...errorProps("consent")}
        />
        <span>
          {copy.consent}{" "}
          <a href={path("/privacy")} target="_blank" rel="noreferrer">
            {copy.privacy}
          </a>
        </span>
      </label>
      {fieldError("consent")}
    </fieldset>
  );
}

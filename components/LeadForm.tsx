import { FormEvent, useEffect, useRef, useState } from "react";
import type { Vehicle } from "../lib/types";
import { mutate } from "../src/api";
import { Icon } from "./Icon";
import { useLocale } from "../src/i18n";
import { useTurnstile } from "./useTurnstile";
import {
  CREDIT_SCORE_LABELS,
  financingSelectionSchema,
  type FinancingSelection,
} from "../lib/financing";
import {
  financingCopy,
  financingMoney,
  preapprovalCopy,
} from "../src/financing-copy";
import {
  preapprovalInputSchema,
  preapprovalPhoneSchema,
  type PreapprovalInput,
} from "../lib/preapproval";
import {
  PreapprovalFields,
  type PreapprovalFieldErrors,
} from "./PreapprovalFields";

async function submissionFingerprint(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } finally {
    bytes.fill(0);
  }
}

export function LeadForm({
  vehicle,
  type = "availability",
  compact = false,
  financing,
  financingInvalid = false,
}: {
  vehicle?: Vehicle | null;
  type?:
    | "availability"
    | "test_drive"
    | "contact"
    | "trade_sell"
    | "financing"
    | "preapproval";
  compact?: boolean;
  financing?: FinancingSelection;
  financingInvalid?: boolean;
}) {
  const { copy, isZh, path, locale } = useLocale();
  const isTrade = type === "trade_sell";
  const isFinancing = type === "financing";
  const isPreapproval = type === "preapproval";
  const financeCopy = financingCopy[locale];
  const preapprovalText = preapprovalCopy[locale];
  const validFinancing =
    financingSelectionSchema.safeParse(financing).success &&
    vehicle?.priceCents != null &&
    financing!.downPaymentCents <= vehicle.priceCents;
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [applicationErrors, setApplicationErrors] =
    useState<PreapprovalFieldErrors>({});
  const verification = useTurnstile(status !== "success");
  const turnstileToken = verification.token;
  const submitting = useRef(false);
  const mounted = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRequest = useRef<AbortController | null>(null);
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    const formElement = formRef.current;
    return () => {
      mounted.current = false;
      pendingRequest.current?.abort();
      submission.current = null;
      if (isPreapproval) formElement?.reset();
    };
  }, [isPreapproval]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    setApplicationErrors({});
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (isFinancing && !validFinancing) {
      setStatus("error");
      setError(financeCopy.selectionRequired);
      return;
    }
    if (
      isPreapproval &&
      (financingInvalid || (financing !== undefined && !validFinancing))
    ) {
      setStatus("error");
      setError(financeCopy.downPaymentError);
      return;
    }
    if (!turnstileToken) {
      setStatus("error");
      setError(copy.lead.verifyError);
      return;
    }
    const phone = String(form.get("phone") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    let preapproval: PreapprovalInput | undefined;
    if (isPreapproval) {
      const name = String(form.get("name") ?? "").trim();
      const emailInput = formElement.elements.namedItem(
        "email",
      ) as HTMLInputElement;
      if (
        name.length < 2 ||
        !preapprovalPhoneSchema.safeParse(phone).success ||
        !email
      ) {
        setStatus("error");
        setError(preapprovalText.requiredContact);
        return;
      }
      if (!emailInput.validity.valid) {
        setStatus("error");
        setError(financeCopy.emailInvalid);
        return;
      }
      const wholeNumber = (field: string) => {
        const raw = String(form.get(field) ?? "").trim();
        return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
      };
      const result = preapprovalInputSchema.safeParse({
        ssn: String(form.get("ssn") ?? ""),
        addressLine1: String(form.get("addressLine1") ?? ""),
        addressLine2: String(form.get("addressLine2") ?? ""),
        city: String(form.get("city") ?? ""),
        state: String(form.get("state") ?? ""),
        postalCode: String(form.get("postalCode") ?? ""),
        residenceYears: wholeNumber("residenceYears"),
        residenceMonths: wholeNumber("residenceMonths"),
        consent: form.get("consent") === "on",
      });
      form.delete("ssn");
      if (!result.success) {
        const errors: PreapprovalFieldErrors = {};
        for (const issue of result.error.issues) {
          const field = String(issue.path[0]) as keyof PreapprovalFieldErrors;
          errors[field] =
            field === "ssn"
              ? preapprovalText.invalidSsn
              : field === "consent"
                ? preapprovalText.consentRequired
                : field.startsWith("residence")
                  ? preapprovalText.invalidResidence
                  : preapprovalText.invalidAddress;
        }
        setApplicationErrors(errors);
        setStatus("error");
        setError(preapprovalText.invalidFields);
        return;
      }
      preapproval = result.data;
    }
    if (isFinancing) {
      const name = String(form.get("name") ?? "").trim();
      const emailInput = formElement.elements.namedItem(
        "email",
      ) as HTMLInputElement;
      const financeError =
        name.length < 2
          ? financeCopy.nameRequired
          : !phone && !email
            ? financeCopy.contactRequired
            : email && !emailInput.validity.valid
              ? financeCopy.emailInvalid
              : "";
      if (financeError) {
        setStatus("error");
        setError(financeError);
        return;
      }
    }
    const wechat = String(form.get("wechat") ?? "").trim();
    const vin = String(form.get("vin") ?? "")
      .replace(/\s/g, "")
      .toUpperCase();
    const mileage = String(form.get("mileage") ?? "").replace(/[,\s]/g, "");
    if (
      isTrade &&
      (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || /^([A-Z0-9])\1+$/.test(vin))
    ) {
      setStatus("error");
      setError(copy.lead.invalidVin);
      return;
    }
    if (isTrade && (!/^\d+$/.test(mileage) || Number(mileage) > 2_000_000)) {
      setStatus("error");
      setError(copy.lead.invalidMileage);
      return;
    }
    if (isTrade && !phone && !email && !wechat) {
      setStatus("error");
      setError(copy.lead.invalidContact);
      return;
    }
    const payload = {
      vehicleId: vehicle?.id ?? null,
      leadType: type,
      name: form.get("name"),
      phone: phone || null,
      email: email || null,
      preferredContact:
        form.get("preferredContact") ||
        (phone ? "phone" : email ? "email" : "wechat"),
      message: isPreapproval ? null : form.get("message") || null,
      ...(isTrade
        ? { vin, mileage: Number(mileage), wechat: wechat || null }
        : {}),
      ...(isFinancing || (isPreapproval && financing) ? { financing } : {}),
      ...(isPreapproval ? { preapproval } : {}),
      sourceUrl: window.location.href,
      referrer: document.referrer || null,
      utm: Object.fromEntries(
        new URLSearchParams(window.location.search).entries(),
      ),
      honeypot: form.get("website") || "",
    };
    submitting.current = true;
    setStatus("sending");
    const controller = new AbortController();
    pendingRequest.current = controller;
    try {
      const fingerprint = await submissionFingerprint(payload);
      if (!mounted.current || controller.signal.aborted) return;
      if (submission.current?.fingerprint !== fingerprint)
        submission.current = { fingerprint, key: crypto.randomUUID() };
      await mutate(
        "/api/leads",
        "POST",
        { ...payload, turnstileToken },
        {
          headers: { "Idempotency-Key": submission.current.key },
          signal: controller.signal,
          ...(isPreapproval ? { cache: "no-store" as const } : {}),
        },
      );
      if (!mounted.current) return;
      submission.current = null;
      formElement.reset();
      setApplicationErrors({});
      setStatus("success");
    } catch (submissionError) {
      if (!mounted.current) return;
      setStatus("error");
      // A token can be consumed even when the response is lost. Keep the form
      // and idempotency key, but obtain a fresh token before retrying.
      verification.refresh();
      setError(
        isPreapproval
          ? preapprovalText.submitError
          : !isZh && submissionError instanceof Error
            ? submissionError.message
            : copy.lead.tryAgain,
      );
    } finally {
      preapproval = undefined;
      if (isPreapproval) payload.preapproval = undefined;
      if (pendingRequest.current === controller) pendingRequest.current = null;
      submitting.current = false;
    }
  }
  if (status === "success")
    return (
      <div className="form-success">
        <span className="success-mark">
          <Icon name="check" />
        </span>
        <h3>
          {isPreapproval
            ? preapprovalText.received
            : isFinancing
              ? financeCopy.received
              : isTrade
                ? copy.lead.tradeReceived
                : copy.lead.received}
        </h3>
        <p>
          {isPreapproval
            ? preapprovalText.thanks
            : isFinancing
              ? financeCopy.thanks
              : isTrade
                ? copy.lead.tradeThanks
                : copy.lead.thanks}
        </p>
        <button
          className="text-button"
          onClick={() => {
            setError("");
            setStatus("idle");
          }}
        >
          {isPreapproval
            ? preapprovalText.another
            : isFinancing
              ? financeCopy.another
              : isTrade
                ? copy.lead.anotherTrade
                : copy.lead.another}{" "}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    );
  return (
    <form
      ref={formRef}
      className={`lead-form ${compact ? "lead-form--compact" : ""}`}
      autoComplete={isPreapproval ? "off" : undefined}
      onSubmit={submit}
      onChange={(event) => {
        // Turnstile owns hidden fields too; only user edits start a new request.
        if (
          !(event.target instanceof HTMLInputElement) ||
          event.target.type !== "hidden"
        )
          submission.current = null;
      }}
      aria-busy={status === "sending"}
      noValidate
    >
      {vehicle && (
        <div className="form-context">
          <Icon name="car" size={16} />
          <span>
            {copy.lead.asking} <strong>{vehicle.title}</strong>
          </span>
        </div>
      )}
      {(isFinancing || isPreapproval) && financing && validFinancing && (
        <dl
          className="financing-lead-summary"
          aria-label={financeCopy.selectionSummary}
        >
          <div>
            <dt>{financeCopy.downPayment}</dt>
            <dd>{financingMoney(financing.downPaymentCents, locale)}</dd>
          </div>
          <div>
            <dt>{financeCopy.loanTerm}</dt>
            <dd>
              {financing.termMonths} {financeCopy.months}
            </dd>
          </div>
          <div>
            <dt>{financeCopy.creditTier}</dt>
            <dd>
              {financeCopy.credit[financing.creditTier]} ·{" "}
              {financing.creditTier === "consultation"
                ? financeCopy.lowScore
                : CREDIT_SCORE_LABELS[financing.creditTier]}
            </dd>
          </div>
        </dl>
      )}
      {isFinancing && !validFinancing && (
        <p className="form-error" role="status">
          {financeCopy.selectionRequired}
        </p>
      )}
      {isPreapproval && financingInvalid && (
        <p className="form-error" role="status">
          {financeCopy.downPaymentError}
        </p>
      )}
      <div className="form-grid">
        <label>
          <span>{isPreapproval ? preapprovalText.name : copy.lead.name}</span>
          <input
            name="name"
            disabled={status === "sending"}
            aria-label={isPreapproval ? preapprovalText.name : copy.lead.name}
            required
            minLength={2}
            maxLength={100}
            placeholder={copy.lead.namePlaceholder}
          />
        </label>
        <label>
          <span>{isPreapproval ? preapprovalText.phone : copy.lead.phone}</span>
          <input
            name="phone"
            disabled={status === "sending"}
            aria-label={isPreapproval ? preapprovalText.phone : copy.lead.phone}
            required={isPreapproval}
            type="tel"
            maxLength={40}
            placeholder="(718) 555-0123"
          />
        </label>
        <label>
          <span>{isPreapproval ? preapprovalText.email : copy.lead.email}</span>
          <input
            name="email"
            disabled={status === "sending"}
            aria-label={isPreapproval ? preapprovalText.email : copy.lead.email}
            required={isPreapproval}
            type="email"
            maxLength={254}
            placeholder="you@example.com"
          />
        </label>
        {!isTrade && !isFinancing && !isPreapproval && (
          <label>
            <span>{copy.lead.preferred}</span>
            <select
              name="preferredContact"
              disabled={status === "sending"}
              aria-label={copy.lead.preferred}
              defaultValue="phone"
            >
              <option value="phone">{copy.lead.phoneCall}</option>
              <option value="email">{copy.lead.email}</option>
            </select>
          </label>
        )}
        {isTrade && (
          <>
            <label>
              <span>{copy.lead.wechat}</span>
              <input
                name="wechat"
                disabled={status === "sending"}
                aria-label={copy.lead.wechat}
                maxLength={100}
                placeholder={copy.lead.wechatPlaceholder}
              />
            </label>
            <label>
              <span>{copy.lead.vin}</span>
              <input
                name="vin"
                disabled={status === "sending"}
                aria-label={copy.lead.vin}
                required
                minLength={17}
                maxLength={17}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder={copy.lead.vinPlaceholder}
                onInput={(event) => {
                  event.currentTarget.value = event.currentTarget.value
                    .replace(/\s/g, "")
                    .toUpperCase();
                }}
              />
            </label>
            <label>
              <span>{copy.lead.mileage}</span>
              <div className="input-suffix">
                <input
                  name="mileage"
                  disabled={status === "sending"}
                  aria-label={copy.lead.mileage}
                  inputMode="numeric"
                  required
                  maxLength={9}
                  placeholder={copy.lead.mileagePlaceholder}
                />
                <span>mi</span>
              </div>
            </label>
          </>
        )}
      </div>
      {isTrade && <p className="form-hint">{copy.lead.contactHint}</p>}
      {isFinancing && <p className="form-hint">{financeCopy.contactHint}</p>}
      {isPreapproval && (
        <PreapprovalFields
          disabled={status === "sending"}
          errors={applicationErrors}
        />
      )}
      {!isPreapproval && (
        <label>
          <span>{copy.lead.message}</span>
          <textarea
            name="message"
            disabled={status === "sending"}
            aria-label={copy.lead.message}
            rows={compact ? 3 : 4}
            maxLength={3000}
            placeholder={
              isFinancing
                ? financeCopy.messagePlaceholder
                : vehicle
                  ? copy.lead.vehicleMessage
                  : copy.lead.helpMessage
            }
          />
        </label>
      )}
      <label className="honeypot" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <div
        ref={verification.containerRef}
        className="turnstile-widget"
        aria-label={copy.lead.verification}
      />
      <input type="hidden" name="turnstileToken" value={turnstileToken} />
      {verification.status === "error" && (
        <div className="form-error" role="alert">
          <p>
            {isZh
              ? "验证码加载失败。请重试，已填写的内容会保留。"
              : "Verification could not load. Retry without losing your details."}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={verification.refresh}
            disabled={status === "sending"}
          >
            {isZh ? "重试验证码" : "Retry verification"}
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-submit-row">
        <p className="form-privacy">
          {copy.lead.privacyBefore}{" "}
          <a href={path("/privacy")}>{copy.lead.privacy}</a>.
        </p>
        <button
          className="button button--red"
          disabled={
            status === "sending" ||
            (isFinancing && !validFinancing) ||
            (isPreapproval && financingInvalid)
          }
        >
          {status === "sending"
            ? copy.lead.sending
            : isPreapproval
              ? preapprovalText.submit
              : isFinancing
                ? financeCopy.submit
                : type === "test_drive"
                  ? copy.lead.requestDrive
                  : isTrade
                    ? copy.lead.submitTrade
                    : copy.lead.send}{" "}
          <Icon name="arrow" size={17} />
        </button>
      </div>
    </form>
  );
}

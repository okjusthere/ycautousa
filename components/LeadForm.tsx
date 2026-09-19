import { FormEvent, useEffect, useRef, useState } from "react";
import type { Vehicle } from "../lib/types";
import { mutate } from "../src/api";
import { Icon } from "./Icon";
import { useLocale } from "../src/i18n";
import { useTurnstile } from "./useTurnstile";

export function LeadForm({
  vehicle,
  type = "availability",
  compact = false,
}: {
  vehicle?: Vehicle | null;
  type?: "availability" | "test_drive" | "contact" | "trade_sell";
  compact?: boolean;
}) {
  const { copy, isZh, path } = useLocale();
  const isTrade = type === "trade_sell";
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [error, setError] = useState("");
  const verification = useTurnstile(status !== "success");
  const turnstileToken = verification.token;
  const submitting = useRef(false);
  const mounted = useRef(false);
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!turnstileToken) {
      setStatus("error");
      setError(copy.lead.verifyError);
      return;
    }
    const phone = String(form.get("phone") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
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
      message: form.get("message") || null,
      ...(isTrade
        ? { vin, mileage: Number(mileage), wechat: wechat || null }
        : {}),
      sourceUrl: window.location.href,
      referrer: document.referrer || null,
      utm: Object.fromEntries(
        new URLSearchParams(window.location.search).entries(),
      ),
      honeypot: form.get("website") || "",
    };
    const fingerprint = JSON.stringify(payload);
    if (submission.current?.fingerprint !== fingerprint)
      submission.current = { fingerprint, key: crypto.randomUUID() };
    submitting.current = true;
    setStatus("sending");
    try {
      await mutate(
        "/api/leads",
        "POST",
        { ...payload, turnstileToken },
        {
          headers: { "Idempotency-Key": submission.current.key },
        },
      );
      if (!mounted.current) return;
      submission.current = null;
      setStatus("success");
      formElement.reset();
    } catch (submissionError) {
      if (!mounted.current) return;
      setStatus("error");
      // A token can be consumed even when the response is lost. Keep the form
      // and idempotency key, but obtain a fresh token before retrying.
      verification.refresh();
      setError(
        !isZh && submissionError instanceof Error
          ? submissionError.message
          : copy.lead.tryAgain,
      );
    } finally {
      submitting.current = false;
    }
  }
  if (status === "success")
    return (
      <div className="form-success">
        <span className="success-mark">
          <Icon name="check" />
        </span>
        <h3>{isTrade ? copy.lead.tradeReceived : copy.lead.received}</h3>
        <p>{isTrade ? copy.lead.tradeThanks : copy.lead.thanks}</p>
        <button
          className="text-button"
          onClick={() => {
            setError("");
            setStatus("idle");
          }}
        >
          {isTrade ? copy.lead.anotherTrade : copy.lead.another}{" "}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    );
  return (
    <form
      className={`lead-form ${compact ? "lead-form--compact" : ""}`}
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
      <div className="form-grid">
        <label>
          <span>{copy.lead.name}</span>
          <input
            name="name"
            disabled={status === "sending"}
            aria-label={copy.lead.name}
            required
            minLength={2}
            maxLength={100}
            placeholder={copy.lead.namePlaceholder}
          />
        </label>
        <label>
          <span>{copy.lead.phone}</span>
          <input
            name="phone"
            disabled={status === "sending"}
            aria-label={copy.lead.phone}
            type="tel"
            maxLength={40}
            placeholder="(718) 555-0123"
          />
        </label>
        <label>
          <span>{copy.lead.email}</span>
          <input
            name="email"
            disabled={status === "sending"}
            aria-label={copy.lead.email}
            type="email"
            maxLength={254}
            placeholder="you@example.com"
          />
        </label>
        {!isTrade && (
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
      <label>
        <span>{copy.lead.message}</span>
        <textarea
          name="message"
          disabled={status === "sending"}
          aria-label={copy.lead.message}
          rows={compact ? 3 : 4}
          maxLength={3000}
          placeholder={
            vehicle ? copy.lead.vehicleMessage : copy.lead.helpMessage
          }
        />
      </label>
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
        <button className="button button--red" disabled={status === "sending"}>
          {status === "sending"
            ? copy.lead.sending
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

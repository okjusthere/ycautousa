import { FormEvent, useEffect, useRef, useState } from "react";
import type { Vehicle } from "../lib/types";
import { mutate } from "../src/api";
import { Icon } from "./Icon";
import { useLocale } from "../src/i18n";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

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
  const [turnstileToken, setTurnstileToken] = useState(() =>
    typeof window !== "undefined" &&
    /localhost|127\.0\.0\.1/.test(window.location.hostname)
      ? "local-form-token"
      : "",
  );
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const local = /localhost|127\.0\.0\.1/.test(window.location.hostname);
    if (local) {
      setTurnstileToken("local-form-token");
      return;
    }
    let cancelled = false;
    fetch("/api/public/config")
      .then(
        (response) => response.json() as Promise<{ turnstileSiteKey?: string }>,
      )
      .then((config) => {
        if (cancelled || !config.turnstileSiteKey || !turnstileRef.current)
          return;
        const render = () => {
          if (!cancelled && window.turnstile && turnstileRef.current)
            widgetId.current = window.turnstile.render(turnstileRef.current, {
              sitekey: config.turnstileSiteKey as string,
              action: "lead",
              callback: setTurnstileToken,
              "expired-callback": () => setTurnstileToken(""),
              "error-callback": () => setTurnstileToken(""),
            });
        };
        if (window.turnstile) render();
        else {
          const script = document.createElement("script");
          script.src =
            "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
          script.async = true;
          script.defer = true;
          script.onload = render;
          document.head.appendChild(script);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
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
      turnstileToken,
      honeypot: form.get("website") || "",
    };
    try {
      await mutate("/api/leads", "POST", payload);
      setStatus("success");
      formElement.reset();
      setTurnstileToken("");
      if (widgetId.current && window.turnstile)
        window.turnstile.reset(widgetId.current);
    } catch (submissionError) {
      setStatus("error");
      setError(
        !isZh && submissionError instanceof Error
          ? submissionError.message
          : copy.lead.tryAgain,
      );
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
            setStatus("idle");
            if (/localhost|127\.0\.0\.1/.test(window.location.hostname))
              setTurnstileToken("local-form-token");
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
                aria-label={copy.lead.wechat}
                maxLength={100}
                placeholder={copy.lead.wechatPlaceholder}
              />
            </label>
            <label>
              <span>{copy.lead.vin}</span>
              <input
                name="vin"
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
        ref={turnstileRef}
        className="turnstile-widget"
        aria-label={copy.lead.verification}
      />
      <input type="hidden" name="turnstileToken" value={turnstileToken} />
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

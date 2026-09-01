import { FormEvent, useEffect, useRef, useState } from "react";
import type { Vehicle } from "../lib/types";
import { mutate } from "../src/api";
import { Icon } from "./Icon";

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
  type?: "availability" | "test_drive" | "contact";
  compact?: boolean;
}) {
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
      setError("Please complete the verification and try again.");
      return;
    }
    const payload = {
      vehicleId: vehicle?.id ?? null,
      leadType: type,
      name: form.get("name"),
      phone: form.get("phone") || null,
      email: form.get("email") || null,
      preferredContact: form.get("preferredContact") || "phone",
      message: form.get("message") || null,
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
        submissionError instanceof Error
          ? submissionError.message
          : "Please try again.",
      );
    }
  }
  if (status === "success")
    return (
      <div className="form-success">
        <span className="success-mark">
          <Icon name="check" />
        </span>
        <h3>Message received.</h3>
        <p>
          Thanks for reaching out. A member of the YC Auto team will follow up
          shortly.
        </p>
        <button
          className="text-button"
          onClick={() => {
            setStatus("idle");
            if (/localhost|127\.0\.0\.1/.test(window.location.hostname))
              setTurnstileToken("local-form-token");
          }}
        >
          Send another message <Icon name="arrow" size={16} />
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
            Asking about <strong>{vehicle.title}</strong>
          </span>
        </div>
      )}
      <div className="form-grid">
        <label>
          <span>Name *</span>
          <input
            name="name"
            aria-label="Name *"
            required
            minLength={2}
            maxLength={100}
            placeholder="Your name"
          />
        </label>
        <label>
          <span>Phone</span>
          <input
            name="phone"
            aria-label="Phone"
            type="tel"
            maxLength={40}
            placeholder="(718) 555-0123"
          />
        </label>
        <label>
          <span>Email</span>
          <input
            name="email"
            aria-label="Email"
            type="email"
            maxLength={254}
            placeholder="you@example.com"
          />
        </label>
        <label>
          <span>Preferred contact</span>
          <select
            name="preferredContact"
            aria-label="Preferred contact"
            defaultValue="phone"
          >
            <option value="phone">Phone call</option>
            <option value="email">Email</option>
          </select>
        </label>
      </div>
      <label>
        <span>Message</span>
        <textarea
          name="message"
          aria-label="Message"
          rows={compact ? 3 : 4}
          maxLength={3000}
          placeholder={
            vehicle ? "Is this vehicle still available?" : "How can we help?"
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
        aria-label="Security verification"
      />
      <input type="hidden" name="turnstileToken" value={turnstileToken} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-submit-row">
        <p className="form-privacy">
          By submitting, you agree to our <a href="/privacy">privacy policy</a>.
        </p>
        <button className="button button--red" disabled={status === "sending"}>
          {status === "sending"
            ? "Sending…"
            : type === "test_drive"
              ? "Request a test drive"
              : "Send message"}{" "}
          <Icon name="arrow" size={17} />
        </button>
      </div>
    </form>
  );
}

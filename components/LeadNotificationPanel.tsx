import { useEffect, useRef, useState } from "react";
import type { Lead } from "../lib/types";
import { mutate } from "../src/api";

export function notificationLabel(status: string | null): string {
  return (
    (
      {
        pending: "Queued",
        sending: "Sending",
        retrying: "Retry scheduled",
        sent: "Accepted by mail service",
        failed: "Needs retry",
        unknown: "Check delivery",
        skipped: "Not sent",
      } as Record<string, string>
    )[status ?? ""] ?? "Not recorded"
  );
}

export function LeadNotificationPanel({
  lead,
  onUpdate,
}: {
  lead: Lead;
  onUpdate: (lead: Lead) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  const status = lead.notification?.status ?? lead.emailStatus ?? "unavailable";
  const active = ["pending", "sending", "retrying"].includes(status);
  const canRetry = ["failed", "unknown", "skipped"].includes(status);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await mutate(
          `/api/admin/leads/${encodeURIComponent(lead.id)}`,
          "GET",
        );
        if (!cancelled) {
          onUpdateRef.current(result.lead);
          setError("");
        }
      } catch {
        if (!cancelled)
          setError("Unable to refresh email status. Your lead is still saved.");
      }
      if (!cancelled) timer = setTimeout(poll, 5000);
    }
    timer = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lead.id, active]);

  async function update(retry: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const path = `/api/admin/leads/${encodeURIComponent(lead.id)}`;
      const result = await mutate(
        retry ? `${path}/email/retry` : path,
        retry ? "POST" : "GET",
        retry ? { confirmUncertain: confirmed } : undefined,
      );
      onUpdateRef.current(result.lead);
      setConfirmed(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update email status.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="lead-message" aria-label="Email notification">
      <span>Email notification</span>
      <p role="status">
        <strong>{notificationLabel(status)}</strong>
        {lead.notification?.recipient
          ? ` · ${lead.notification.recipient}`
          : ""}
      </p>
      {status === "sent" && (
        <p>
          The mail service accepted this notification. Inbox delivery is not
          confirmed here.
        </p>
      )}
      {status === "retrying" && (
        <p>
          A temporary service error occurred. The next automatic attempt is due{" "}
          {lead.notification?.nextAttemptAt
            ? new Date(lead.notification.nextAttemptAt).toLocaleString()
            : "shortly"}
          .
        </p>
      )}
      {status === "failed" && (
        <p>
          Automatic delivery stopped. Check the mail service configuration
          before retrying.
        </p>
      )}
      {status === "unknown" && (
        <p>
          The send result is uncertain. Check the inbox and spam folder before
          resending to avoid a duplicate.
        </p>
      )}
      {lead.notification && (
        <p>
          Attempts: {lead.notification.attempts}
          {lead.notification.lastErrorCode
            ? ` · ${lead.notification.lastErrorCode}`
            : ""}
        </p>
      )}
      {status === "unknown" && (
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />{" "}
          I checked the mailbox; a resend is needed.
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="button button--dark"
        disabled={busy}
        onClick={() => update(false)}
      >
        Refresh email status
      </button>{" "}
      {canRetry && (
        <button
          type="button"
          className="button button--dark"
          disabled={busy || (status === "unknown" && !confirmed)}
          onClick={() => update(true)}
        >
          {busy ? "Updating…" : "Retry notification"}
        </button>
      )}
    </section>
  );
}

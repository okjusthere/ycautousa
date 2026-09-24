import { useCallback, useEffect, useRef, useState } from "react";
import {
  PREAPPROVAL_VIEW_REASONS,
  preapprovalMetadataSchema,
  preapprovalStoredDataSchema,
  type PreapprovalMetadata,
  type PreapprovalStoredData,
} from "../lib/preapproval";
import { mutate } from "../src/api";
import { useLocale } from "../src/i18n";
import { preapprovalCopy } from "../src/financing-copy";

type ViewReason = (typeof PREAPPROVAL_VIEW_REASONS)[number];

export function PreapprovalApplicationPanel({
  leadId,
  metadata,
  onDeleted,
}: {
  leadId: string;
  metadata: PreapprovalMetadata;
  onDeleted: (metadata: PreapprovalMetadata) => void;
}) {
  const { locale } = useLocale();
  const copy = preapprovalCopy[locale];
  const [reason, setReason] = useState<ViewReason | "">("");
  const [revealed, setRevealed] = useState<{
    leadId: string;
    data: PreapprovalStoredData;
  } | null>(null);
  const [showSsn, setShowSsn] = useState(false);
  const [busy, setBusy] = useState<"view" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [cleared, setCleared] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const privateVisible = useRef(false);
  const pendingView = useRef<AbortController | null>(null);
  const pendingDelete = useRef<AbortController | null>(null);
  const operationLock = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const application =
    metadata.status === "received" && revealed?.leadId === leadId
      ? revealed.data
      : null;

  const clearPrivate = useCallback(() => {
    generation.current += 1;
    if (privateVisible.current || pendingView.current) setCleared(true);
    privateVisible.current = false;
    pendingView.current?.abort();
    pendingView.current = null;
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = null;
    setRevealed(null);
    setShowSsn(false);
    setReason("");
  }, []);

  useEffect(() => {
    mounted.current = true;
    clearPrivate();
    setCleared(false);
    setError("");
    setConfirmingDelete(false);
    const hide = () => {
      if (document.hidden) clearPrivate();
    };
    window.addEventListener("blur", clearPrivate);
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      generation.current += 1;
      pendingView.current?.abort();
      pendingDelete.current?.abort();
      pendingView.current = null;
      pendingDelete.current = null;
      privateVisible.current = false;
      if (clearTimer.current) clearTimeout(clearTimer.current);
      window.removeEventListener("blur", clearPrivate);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [leadId, metadata.status, clearPrivate]);

  async function viewApplication() {
    if (operationLock.current || metadata.status !== "received") return;
    if (!reason) {
      setError(copy.purposeRequired);
      return;
    }
    const chosenReason = reason;
    clearPrivate();
    setError("");
    setCleared(false);
    setBusy("view");
    operationLock.current = true;
    const current = generation.current;
    const controller = new AbortController();
    pendingView.current = controller;
    try {
      const result = await mutate(
        `/api/admin/leads/${encodeURIComponent(leadId)}/preapproval/view`,
        "POST",
        { reason: chosenReason },
        { signal: controller.signal, cache: "no-store" },
      );
      if (
        !mounted.current ||
        controller.signal.aborted ||
        current !== generation.current ||
        document.hidden
      )
        return;
      const parsed = preapprovalStoredDataSchema.safeParse(result.application);
      if (!parsed.success) throw new Error("Invalid application response");
      privateVisible.current = true;
      setRevealed({ leadId, data: parsed.data });
      clearTimer.current = setTimeout(clearPrivate, 60_000);
    } catch {
      if (
        mounted.current &&
        current === generation.current &&
        !controller.signal.aborted
      )
        setError(copy.viewError);
    } finally {
      if (pendingView.current === controller) pendingView.current = null;
      operationLock.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function deleteApplication() {
    if (
      operationLock.current ||
      !confirmingDelete ||
      metadata.status !== "received"
    )
      return;
    clearPrivate();
    setError("");
    setBusy("delete");
    operationLock.current = true;
    const controller = new AbortController();
    pendingDelete.current = controller;
    try {
      const result = await mutate(
        `/api/admin/leads/${encodeURIComponent(leadId)}/preapproval/delete`,
        "POST",
        { confirm: true },
        { signal: controller.signal, cache: "no-store" },
      );
      if (!mounted.current || controller.signal.aborted) return;
      const parsed = preapprovalMetadataSchema.safeParse(
        result.lead?.details?.preapproval,
      );
      if (!parsed.success) throw new Error("Invalid deletion response");
      setConfirmingDelete(false);
      setCleared(false);
      onDeleted(parsed.data);
    } catch {
      if (mounted.current && !controller.signal.aborted)
        setError(copy.deleteError);
    } finally {
      if (pendingDelete.current === controller) pendingDelete.current = null;
      operationLock.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  return (
    <section
      className="lead-message preapproval-admin"
      aria-label={copy.adminTitle}
    >
      <h3>{copy.adminTitle}</h3>
      <p className="payment-help">
        {copy.submitted}:{" "}
        {new Date(metadata.submittedAt).toLocaleString(
          locale === "zh" ? "zh-CN" : "en-US",
        )}
      </p>
      {metadata.status === "deleted" ? (
        <p role="status">{copy.deleted}</p>
      ) : (
        <>
          <p className="payment-help">{copy.adminHelp}</p>
          <label className="field">
            <span>{copy.purpose}</span>
            <select
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as ViewReason | "")
              }
              disabled={busy !== null || confirmingDelete}
            >
              <option value="">{copy.choosePurpose}</option>
              {PREAPPROVAL_VIEW_REASONS.map((item) => (
                <option key={item} value={item}>
                  {copy.purposes[item]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button--dark"
            type="button"
            disabled={!reason || busy !== null || confirmingDelete}
            onClick={() => void viewApplication()}
          >
            {busy === "view" ? copy.viewing : copy.view}
          </button>
          {cleared && (
            <p role="status" className="payment-help">
              {copy.cleared}
            </p>
          )}
          {application && (
            <div className="preapproval-private" data-private="true">
              <p className="payment-help">{copy.temporary}</p>
              <dl>
                <div>
                  <dt>{copy.name.replace(/ \*$/, "")}</dt>
                  <dd>{application.name}</dd>
                </div>
                <div>
                  <dt>{copy.phone.replace(/ \*$/, "")}</dt>
                  <dd>{application.phone}</dd>
                </div>
                <div>
                  <dt>{copy.email.replace(/ \*$/, "")}</dt>
                  <dd>{application.email}</dd>
                </div>
                <div>
                  <dt>SSN</dt>
                  <dd>
                    <span className="preapproval-ssn">
                      {showSsn ? application.ssn : "••• •• ••••"}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setShowSsn((shown) => !shown)}
                    >
                      {showSsn ? copy.hideSsn : copy.revealSsn}
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>{copy.addressLine1.replace(/ \*$/, "")}</dt>
                  <dd>
                    {application.addressLine1}
                    {application.addressLine2 && (
                      <>
                        <br />
                        {application.addressLine2}
                      </>
                    )}
                    <br />
                    {application.city}, {application.state}{" "}
                    {application.postalCode}
                  </dd>
                </div>
                <div>
                  <dt>{copy.residence}</dt>
                  <dd>
                    {application.residenceYears}{" "}
                    {copy.residenceYears.replace(/ \*$/, "")} ·{" "}
                    {application.residenceMonths}{" "}
                    {copy.residenceMonths.replace(/ \*$/, "")}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="text-button"
                onClick={clearPrivate}
              >
                {copy.clear}
              </button>
            </div>
          )}
          <div className="preapproval-delete">
            {confirmingDelete ? (
              <div role="group" aria-label={copy.delete}>
                <p>{copy.deleteWarning}</p>
                <div className="preapproval-admin-actions">
                  <button
                    type="button"
                    className="button button--red"
                    disabled={busy !== null}
                    onClick={() => void deleteApplication()}
                  >
                    {busy === "delete" ? copy.deleting : copy.confirmDelete}
                  </button>
                  <button
                    type="button"
                    className="button button--light"
                    disabled={busy !== null}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    {copy.cancelDelete}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="text-button"
                disabled={busy !== null}
                onClick={() => {
                  clearPrivate();
                  setConfirmingDelete(true);
                }}
              >
                {copy.delete}
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

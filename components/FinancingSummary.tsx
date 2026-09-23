import { CREDIT_SCORE_LABELS, type FinancingSnapshot } from "../lib/financing";
import { financingMoney } from "../src/financing-copy";

export function FinancingSummary({
  snapshot,
}: {
  snapshot: FinancingSnapshot;
}) {
  const status =
    snapshot.status === "estimated"
      ? "Payment estimate"
      : snapshot.status === "manual_review"
        ? "Personal financing consultation"
        : "Rate unavailable — consultation requested";
  return (
    <section
      className="lead-message financing-snapshot"
      aria-label="Financing selections"
    >
      <span>Financing selections</span>
      <p>
        <strong>{status}</strong>
      </p>
      <dl>
        <div>
          <dt>Vehicle price</dt>
          <dd>{financingMoney(snapshot.priceCents)}</dd>
        </div>
        <div>
          <dt>Down payment</dt>
          <dd>{financingMoney(snapshot.downPaymentCents)}</dd>
        </div>
        <div>
          <dt>Amount financed</dt>
          <dd>{financingMoney(snapshot.principalCents)}</dd>
        </div>
        <div>
          <dt>Loan term</dt>
          <dd>{snapshot.termMonths} months</dd>
        </div>
        <div>
          <dt>Credit score</dt>
          <dd>{CREDIT_SCORE_LABELS[snapshot.creditTier]}</dd>
        </div>
        {snapshot.status === "estimated" && (
          <>
            <div>
              <dt>APR</dt>
              <dd>{snapshot.aprPercent}%</dd>
            </div>
            <div>
              <dt>Monthly payment</dt>
              <dd>
                {snapshot.monthlyPaymentCents === null
                  ? "—"
                  : financingMoney(snapshot.monthlyPaymentCents, "en", true)}
              </dd>
            </div>
          </>
        )}
      </dl>
      <p>
        Excludes taxes, registration and document fees.{" "}
        {snapshot.illustrative
          ? "Preset illustrative rates; not a loan offer."
          : "Actual terms depend on lender approval."}
      </p>
      <small>
        Recorded at submission:{" "}
        {new Date(snapshot.calculatedAt).toLocaleString()}
      </small>
    </section>
  );
}

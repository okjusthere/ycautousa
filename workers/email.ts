import type { Env } from "./env";
import type { Lead, SiteSettings } from "../lib/types";
import { escapeHtml } from "../lib/utils";
import { CREDIT_SCORE_LABELS } from "../lib/financing";

const leadTypeLabels: Record<string, string> = {
  availability: "Availability inquiry",
  test_drive: "Test drive request",
  contact: "General inquiry",
  trade_sell: "Trade/Sell request",
  financing: "Financing inquiry",
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

function financingDetails(lead: Lead): Array<[string, string]> {
  if (lead.leadType !== "financing") return [];
  const snapshot = lead.details.financing;
  if (!snapshot)
    return [
      ["Financing", "Contact the customer to discuss financing options."],
    ];
  const rows: Array<[string, string]> = [
    ["Selected credit range", CREDIT_SCORE_LABELS[snapshot.creditTier]],
    ["Vehicle price at submission", money(snapshot.priceCents)],
    ["Down payment", money(snapshot.downPaymentCents)],
    ["Term", `${snapshot.termMonths} months`],
    ["Amount financed", money(snapshot.principalCents)],
  ];
  if (
    snapshot.status === "estimated" &&
    snapshot.aprPercent !== null &&
    snapshot.monthlyPaymentCents !== null &&
    snapshot.totalInterestCents !== null
  ) {
    rows.push(
      ["APR", `${snapshot.aprPercent}%`],
      ["Estimated monthly payment", money(snapshot.monthlyPaymentCents)],
      ["Estimated total interest", money(snapshot.totalInterestCents)],
    );
  } else {
    rows.push([
      "Financing consultation",
      snapshot.status === "manual_review"
        ? "Personalized financing consultation requested. No automatic payment estimate. This is not a credit decision."
        : "Rates are unavailable. Contact the customer to discuss financing options.",
    ]);
  }
  if (snapshot.illustrative)
    rows.push([
      "Rate basis",
      "Illustrative example rates, not a lender offer.",
    ]);
  rows.push(
    [
      "Estimate basis",
      "Vehicle price less down payment. Taxes and fees are not included.",
    ],
    ["Calculated at", snapshot.calculatedAt],
  );
  return rows;
}

export async function sendLeadNotification(
  env: Env,
  lead: Lead,
  to: string,
): Promise<{ messageId: string }> {
  const binding = env.EMAIL;
  const from = env.EMAIL_FROM?.trim();
  if (!binding || !from || !to || to !== env.EMAIL_TO?.trim())
    throw Object.assign(
      new Error("Email binding configuration is incomplete"),
      { code: "CONFIGURATION_ERROR" },
    );
  const vehicleLine = lead.vehicle
    ? `${lead.vehicle.title} (${lead.vehicle.slug})`
    : "General contact";
  const title =
    lead.leadType === "trade_sell"
      ? "New Trade/Sell request"
      : lead.leadType === "financing"
        ? "New financing inquiry"
        : "New YC Auto lead";
  const rows: Array<[string, string]> = [
    ["Type", leadTypeLabels[lead.leadType] ?? lead.leadType],
    ["Vehicle", vehicleLine],
    ["Name", lead.name],
    ["Phone", lead.phone ?? "—"],
    ["Email", lead.email ?? "—"],
    ["Preferred contact", lead.preferredContact ?? "—"],
    ["Message", lead.message ?? "—"],
  ];
  if (lead.leadType === "trade_sell")
    rows.push(
      ["VIN", lead.details.vin ?? "—"],
      ["Mileage", `${lead.details.mileage?.toLocaleString("en-US") ?? "—"} mi`],
      ["WeChat", lead.details.wechat ?? "—"],
    );
  rows.push(...financingDetails(lead), ["Source", lead.sourceUrl ?? "—"]);
  const adminUrl = `${env.APP_ORIGIN ?? ""}/admin/leads/${encodeURIComponent(lead.id)}`;
  const text = [
    title,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    `Admin: ${adminUrl}`,
  ].join("\n");
  const html = [
    `<h2>${escapeHtml(title)}</h2>`,
    ...rows.map(
      ([label, value]) =>
        `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`,
    ),
    `<p><a href="${escapeHtml(adminUrl)}">Open lead in admin</a></p>`,
  ].join("");
  return binding.send({
    from,
    to,
    subject: `${title}${lead.vehicle ? ` — ${lead.vehicle.title}` : ""}`,
    text,
    html,
  });
}

export function customerAckMessage(
  lead: Lead,
  settings: SiteSettings,
): { subject: string; text: string } {
  return {
    subject: `Thanks for reaching out to ${settings.shortName}`,
    text: `Hi ${lead.name},\n\nThanks for contacting ${settings.shortName}. A member of our team will follow up soon.\n\n— ${settings.shortName}`,
  };
}

import type { Env } from "./env";
import type { Lead, SiteSettings } from "../lib/types";
import { escapeHtml } from "../lib/utils";

export async function sendLeadNotification(
  env: Env,
  settings: SiteSettings,
  lead: Lead,
): Promise<"sent" | "skipped" | "failed"> {
  const binding = env.EMAIL;
  const from = env.EMAIL_FROM?.trim();
  const to = settings.leadNotificationRecipient || env.EMAIL_TO?.trim();
  if (!binding || !from || !to) return "skipped";
  const vehicleLine = lead.vehicle
    ? `${lead.vehicle.title} (${lead.vehicle.slug})`
    : "General contact";
  const tradeDetails =
    lead.leadType === "trade_sell"
      ? [
          `VIN: ${lead.details.vin ?? "—"}`,
          `Mileage: ${lead.details.mileage?.toLocaleString("en-US") ?? "—"} mi`,
          `WeChat: ${lead.details.wechat ?? "—"}`,
        ]
      : [];
  const text = [
    "New YC Auto lead",
    `Type: ${lead.leadType}`,
    `Vehicle: ${vehicleLine}`,
    `Name: ${lead.name}`,
    `Phone: ${lead.phone ?? "—"}`,
    `Email: ${lead.email ?? "—"}`,
    `Preferred contact: ${lead.preferredContact ?? "—"}`,
    `Message: ${lead.message ?? "—"}`,
    ...tradeDetails,
    `Source: ${lead.sourceUrl ?? "—"}`,
    `Admin: ${env.APP_ORIGIN ?? ""}/admin/leads/${lead.id}`,
  ].join("\n");
  try {
    await binding.send({
      from,
      to,
      subject: `${lead.leadType === "trade_sell" ? "New Trade/Sell request" : "New YC Auto lead"}${lead.vehicle ? ` — ${lead.vehicle.title}` : ""}`,
      text,
      html: `<h2>${lead.leadType === "trade_sell" ? "New Trade/Sell request" : "New YC Auto lead"}</h2><p><strong>Type:</strong> ${escapeHtml(lead.leadType)}</p><p><strong>Vehicle:</strong> ${escapeHtml(vehicleLine)}</p><p><strong>Name:</strong> ${escapeHtml(lead.name)}</p><p><strong>Phone:</strong> ${escapeHtml(lead.phone ?? "—")}</p><p><strong>Email:</strong> ${escapeHtml(lead.email ?? "—")}</p><p><strong>Preferred contact:</strong> ${escapeHtml(lead.preferredContact ?? "—")}</p>${lead.leadType === "trade_sell" ? `<p><strong>VIN:</strong> ${escapeHtml(lead.details.vin ?? "—")}</p><p><strong>Mileage:</strong> ${escapeHtml(lead.details.mileage?.toLocaleString("en-US") ?? "—")} mi</p><p><strong>WeChat:</strong> ${escapeHtml(lead.details.wechat ?? "—")}</p>` : ""}<p><strong>Message:</strong> ${escapeHtml(lead.message ?? "—")}</p><p><strong>Source:</strong> ${escapeHtml(lead.sourceUrl ?? "—")}</p><p><a href="${escapeHtml(env.APP_ORIGIN ?? "")}/admin/leads/${encodeURIComponent(lead.id)}">Open lead in admin</a></p>`,
    });
    return "sent";
  } catch (error) {
    console.error(
      "lead notification failed",
      error instanceof Error ? error.name : "unknown",
    );
    return "failed";
  }
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

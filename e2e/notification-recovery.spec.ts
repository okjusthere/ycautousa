import { expect, test, type Page } from "@playwright/test";
import type { Lead, LeadNotification } from "../lib/types";
import { demoSettings } from "../src/demo";

const leadId = "notification-browser-test";
const recipient = "sophie@youxuancars.com";

function leadWithNotification(status: LeadNotification["status"]): Lead {
  return {
    id: leadId,
    vehicleId: null,
    leadType: "contact",
    name: "Local Notification Test",
    phone: null,
    email: "test@example.invalid",
    preferredContact: "email",
    message: "Mock browser test; no email is sent.",
    details: {},
    status: "new",
    sourceUrl: null,
    referrer: null,
    utm: {},
    country: null,
    ipHash: null,
    adminNotes: "Previously saved note",
    emailStatus: status,
    notification: {
      status,
      recipient,
      attempts: status === "pending" ? 0 : 1,
      nextAttemptAt: null,
      lastErrorCode: null,
      messageId: status === "sent" ? "mock-message-id" : null,
      updatedAt: "2026-09-19T12:00:00.000Z",
    },
    createdAt: "2026-09-19T11:59:00.000Z",
    updatedAt: "2026-09-19T12:00:00.000Z",
  };
}

async function mockNotifications(
  page: Page,
  initial: LeadNotification["status"],
) {
  const state = {
    lead: leadWithNotification(initial),
    polls: 0,
    retries: [] as Array<{ confirmUncertain: boolean }>,
    saves: [] as Array<{ adminNotes: string; status: string }>,
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/admin/leads") {
      await route.fulfill({ json: { leads: [state.lead] } });
    } else if (url.pathname === `/api/admin/leads/${leadId}/email/retry`) {
      state.retries.push(route.request().postDataJSON());
      state.lead = leadWithNotification("pending");
      await route.fulfill({ json: { lead: state.lead } });
    } else if (url.pathname === `/api/admin/leads/${leadId}`) {
      if (method === "GET") state.polls += 1;
      else if (method === "PATCH") {
        const draft = route.request().postDataJSON();
        state.saves.push(draft);
        state.lead = { ...state.lead, ...draft };
      } else
        throw new Error(`Unexpected test request ${method} ${url.pathname}`);
      await route.fulfill({ json: { lead: state.lead } });
    } else if (url.pathname === "/api/admin/settings") {
      await route.fulfill({
        json: {
          settings: { ...demoSettings, leadNotificationRecipient: recipient },
          notificationRecipient: recipient,
        },
      });
    } else await route.abort();
  });
  return state;
}

test.describe("admin email notification recovery", () => {
  test("polls pending status without overwriting unsaved notes or lead status", async ({
    page,
  }) => {
    const state = await mockNotifications(page, "pending");
    await page.goto(`/admin/leads/${leadId}`);
    const panel = page.getByRole("region", { name: "Email notification" });
    await expect(panel.getByRole("status")).toContainText("Queued");
    await page.getByLabel("Admin notes").fill("Unsaved follow-up instructions");
    await page
      .getByRole("combobox", { name: "Lead status", exact: true })
      .selectOption("contacted");
    state.lead = leadWithNotification("sent");
    await expect(panel.getByRole("status")).toContainText(
      "Accepted by mail service",
      { timeout: 10_000 },
    );
    expect(state.polls).toBeGreaterThanOrEqual(1);
    await expect(panel).toContainText("Inbox delivery is not confirmed here.");
    await expect(page.getByLabel("Admin notes")).toHaveValue(
      "Unsaved follow-up instructions",
    );
    await expect(
      page.getByRole("combobox", { name: "Lead status", exact: true }),
    ).toHaveValue("contacted");
    await page.getByRole("button", { name: /Save lead/i }).click();
    await expect.poll(() => state.saves.length).toBe(1);
    expect(state.saves[0]).toEqual({
      adminNotes: "Unsaved follow-up instructions",
      status: "contacted",
    });
    expect(state.retries).toHaveLength(0);
  });

  test("retries a failed notification and preserves unsaved notes", async ({
    page,
  }) => {
    const state = await mockNotifications(page, "failed");
    await page.goto(`/admin/leads/${leadId}`);
    const panel = page.getByRole("region", { name: "Email notification" });
    await expect(panel.getByRole("status")).toContainText("Needs retry");
    await page.getByLabel("Admin notes").fill("Call after lunch");
    await panel.getByRole("button", { name: "Retry notification" }).click();
    await expect(panel.getByRole("status")).toContainText("Queued");
    expect(state.retries).toEqual([{ confirmUncertain: false }]);
    await expect(page.getByLabel("Admin notes")).toHaveValue(
      "Call after lunch",
    );
    state.lead = leadWithNotification("sent");
    await panel.getByRole("button", { name: "Refresh email status" }).click();
    await expect(panel.getByRole("status")).toContainText(
      "Accepted by mail service",
    );
    await expect(page.getByLabel("Admin notes")).toHaveValue(
      "Call after lunch",
    );
  });

  test("requires an explicit mailbox check before resending an uncertain result", async ({
    page,
  }) => {
    const state = await mockNotifications(page, "unknown");
    await page.goto(`/admin/leads/${leadId}`);
    const panel = page.getByRole("region", { name: "Email notification" });
    await expect(panel.getByRole("status")).toContainText("Check delivery");
    const retry = panel.getByRole("button", { name: "Retry notification" });
    await expect(retry).toBeDisabled();
    expect(state.retries).toHaveLength(0);
    await panel
      .getByRole("checkbox", {
        name: "I checked the mailbox; a resend is needed.",
      })
      .check();
    await retry.click();
    await expect(panel.getByRole("status")).toContainText("Queued");
    expect(state.retries).toEqual([{ confirmUncertain: true }]);
  });

  test("shows the verified recipient as read-only in settings", async ({
    page,
  }) => {
    await mockNotifications(page, "pending");
    await page.goto("/admin/settings");
    const email = page.getByLabel("Lead notification email", { exact: false });
    await expect(email).toHaveValue(recipient);
    await expect(email).toHaveAttribute("readonly", "");
    await expect(
      page.getByText("Verified delivery address.", { exact: false }),
    ).toBeVisible();
  });
});

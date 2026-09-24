import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Lead } from "../lib/types";
import { PREAPPROVAL_CONSENT_VERSION } from "../lib/preapproval";

// Synthetic fixtures and intercepted writes only. No applications or mail leave the test browser.
const application = {
  name: "Synthetic Preapproval Test",
  phone: "2125550187",
  email: "applicant@example.invalid",
  ssn: "123456789",
  addressLine1: "104 Synthetic Avenue",
  addressLine2: "Test Unit 42",
  city: "Flushing",
  state: "NY",
  postalCode: "11358",
  residenceYears: 3,
  residenceMonths: 4,
  consent: true,
  consentVersion: PREAPPROVAL_CONSENT_VERSION,
  submittedAt: "2026-09-24T15:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("yc-auto-locale", "en"));
});

async function publicForm(page: Page) {
  const submissions: { body: Record<string, unknown>; key?: string }[] = [];
  const state = { failNext: false, submissions };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.continue();
    if (new URL(request.url()).pathname === "/api/leads") {
      submissions.push({
        body: request.postDataJSON(),
        key: request.headers()["idempotency-key"],
      });
      if (state.failNext) {
        state.failNext = false;
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic retry" },
        });
      }
      return route.fulfill({
        json: { ok: true, leadId: "mock-private-request" },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/inventory/2022-toyota-rav4-xle-local");
  const calculator = page.getByRole("region", {
    name: "Payment calculator",
    exact: true,
  });
  await calculator
    .getByRole("button", { name: "Request loan pre-approval", exact: true })
    .click();
  return { state, calculator };
}

async function fillPrivate(form: Locator) {
  for (const [name, value] of Object.entries(application)) {
    if (["consent", "consentVersion", "submittedAt"].includes(name)) continue;
    const field = form.locator(`[name="${name}"]`);
    if (name === "state") await field.selectOption(String(value));
    else await field.fill(String(value));
  }
}

test("validates a private application without credit selection, retries safely, and clears it after receipt", async ({
  page,
}) => {
  const { state, calculator } = await publicForm(page);
  const ssn = calculator.getByLabel("Social Security number (SSN) *", {
    exact: true,
  });
  await expect(ssn).toHaveAttribute("type", "password");
  await expect(ssn).toHaveAttribute("autocomplete", "off");
  await expect(calculator.locator('textarea[name="message"]')).toHaveCount(0);
  await fillPrivate(calculator);
  const submit = calculator.getByRole("button", {
    name: "Submit pre-approval request",
    exact: true,
  });
  await submit.click();
  await expect(
    calculator.getByText(
      "Please review and accept the privacy consent before submitting.",
    ),
  ).toBeVisible();
  expect(state.submissions).toHaveLength(0);
  await calculator.locator('[name="consent"]').check();
  await ssn.fill("000000000");
  await submit.click();
  await expect(
    calculator.getByText("Enter a valid 9-digit SSN.", { exact: true }),
  ).toBeVisible();
  expect(state.submissions).toHaveLength(0);
  await ssn.fill(application.ssn);
  await calculator.locator('[name="phone"]').fill("1234567890123456");
  await submit.click();
  await expect(
    calculator.getByText(
      "Enter your full name, phone number and email address.",
    ),
  ).toBeVisible();
  expect(state.submissions).toHaveLength(0);
  await calculator.locator('[name="phone"]').fill(application.phone);
  state.failNext = true;
  await submit.click();
  await expect(
    calculator.getByText(/Your request could not be submitted/),
  ).toBeVisible();
  await expect(ssn).toHaveValue(application.ssn);
  await submit.click();
  await expect(
    calculator.getByRole("heading", { name: "Pre-approval request received." }),
  ).toBeVisible();
  expect(state.submissions).toHaveLength(2);
  expect(state.submissions[0].key).toBeTruthy();
  expect(state.submissions[1].key).toBe(state.submissions[0].key);
  expect(state.submissions[1].body).toMatchObject({
    leadType: "preapproval",
    message: null,
    preapproval: { ssn: application.ssn, consent: true },
  });
  expect(state.submissions[1].body).not.toHaveProperty("financing");
  const storage = await page.evaluate(() =>
    JSON.stringify([localStorage, sessionStorage]),
  );
  expect(storage).not.toContain(application.ssn);
  expect(storage).not.toContain(application.addressLine1);
  await calculator
    .getByRole("button", { name: "Start another request" })
    .click();
  await expect(ssn).toHaveValue("");
  await expect(calculator.locator('[name="addressLine1"]')).toHaveValue("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("blocks pre-approval submission while the down payment is invalid", async ({
  page,
}) => {
  const { state, calculator } = await publicForm(page);
  await calculator.getByLabel("Down payment", { exact: true }).fill("-1");
  await expect(
    calculator.getByRole("button", {
      name: "Submit pre-approval request",
      exact: true,
    }),
  ).toBeDisabled();
  await calculator.getByLabel("Down payment", { exact: true }).fill("5000");
  await expect(
    calculator.getByRole("button", {
      name: "Submit pre-approval request",
      exact: true,
    }),
  ).toBeEnabled();
  expect(state.submissions).toHaveLength(0);
});

async function adminApplication(page: Page) {
  const id = "private-browser-test";
  let lead: Lead = {
    id,
    vehicleId: null,
    leadType: "preapproval",
    name: "Pre-approval applicant",
    phone: null,
    email: null,
    preferredContact: "phone",
    message: null,
    details: {
      preapproval: {
        status: "received",
        submittedAt: application.submittedAt,
        deletedAt: null,
      },
    },
    status: "new",
    sourceUrl: null,
    referrer: null,
    utm: {},
    country: null,
    ipHash: null,
    adminNotes: "",
    emailStatus: "sent",
    notification: null,
    createdAt: application.submittedAt,
    updatedAt: application.submittedAt,
  };
  const state = {
    views: [] as unknown[],
    deletes: 0,
    delayView: null as Promise<void> | null,
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path === "/api/admin/leads")
      return route.fulfill({ json: { leads: [lead] } });
    if (path === `/api/admin/leads/${id}/preapproval/view`) {
      expect(req.method()).toBe("POST");
      state.views.push(req.postDataJSON());
      if (state.delayView) await state.delayView;
      return route.fulfill({ json: { application } }).catch(() => {});
    }
    if (path === `/api/admin/leads/${id}/preapproval/delete`) {
      expect(req.postDataJSON()).toEqual({ confirm: true });
      state.deletes++;
      lead = {
        ...lead,
        details: {
          preapproval: {
            status: "deleted",
            submittedAt: application.submittedAt,
            deletedAt: "2026-09-24T16:00:00.000Z",
          },
        },
      };
      return route.fulfill({ json: { ok: true, lead } });
    }
    if (path === `/api/admin/leads/${id}`)
      return route.fulfill({ json: { lead } });
    return route.abort();
  });
  await page.goto(`/admin/leads/${id}`);
  const panel = page.getByRole("region", {
    name: "Private pre-approval application",
  });
  await expect(panel).toBeVisible();
  return { state, panel };
}

async function reveal(panel: Locator) {
  await panel
    .getByLabel("Purpose for viewing")
    .selectOption("application_review");
  await panel
    .getByRole("button", {
      name: "View full application (including SSN)",
      exact: true,
    })
    .click();
}

test("loads private details only on request, clears on timeout, and reflects confirmed deletion", async ({
  page,
}) => {
  await page.clock.install();
  const { state, panel } = await adminApplication(page);
  expect(state.views).toEqual([]);
  await expect(page.getByText(application.name, { exact: true })).toHaveCount(
    0,
  );
  await reveal(panel);
  await expect(
    panel.getByText(application.name, { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(application.ssn, { exact: true })).toHaveCount(
    0,
  );
  await panel.getByRole("button", { name: "Show SSN", exact: true }).click();
  await expect(panel.getByText(application.ssn, { exact: true })).toBeVisible();
  expect(state.views).toEqual([{ reason: "application_review" }]);
  await page.clock.fastForward(60_001);
  await expect(panel.getByText(application.name, { exact: true })).toHaveCount(
    0,
  );
  await expect(panel.getByText(application.ssn, { exact: true })).toHaveCount(
    0,
  );
  await panel
    .getByRole("button", {
      name: "Delete private application data",
      exact: true,
    })
    .click();
  expect(state.deletes).toBe(0);
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.deletes).toBe(0);
  await panel
    .getByRole("button", {
      name: "Delete private application data",
      exact: true,
    })
    .click();
  await panel
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(
    panel.getByText("Private application data has been deleted.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Private application removed.", { exact: true }),
  ).toBeVisible();
  expect(state.deletes).toBe(1);
});

test("does not reveal a late private response after the window loses focus", async ({
  page,
}) => {
  const { state, panel } = await adminApplication(page);
  let release!: () => void;
  state.delayView = new Promise<void>((resolve) => {
    release = resolve;
  });
  await reveal(panel);
  await expect.poll(() => state.views.length).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  release();
  await expect(
    panel.getByText(/Private details have been cleared/),
  ).toBeVisible();
  await expect(panel.getByText(application.name, { exact: true })).toHaveCount(
    0,
  );
  state.delayView = null;
  await reveal(panel);
  await expect(
    panel.getByText(application.name, { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(panel.getByText(application.name, { exact: true })).toHaveCount(
    0,
  );
});

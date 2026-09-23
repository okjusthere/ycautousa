import { expect, test, type Locator, type Page } from "@playwright/test";
import type { FinancingConfig } from "../lib/financing";
import type { Vehicle } from "../lib/types";
import { demoSettings } from "../src/demo";

function rates(): FinancingConfig {
  return {
    version: 1,
    illustrative: true,
    rates: {
      excellent: { 36: 5.99, 48: 5.99, 60: 5.99, 72: 5.99 },
      very_good: { 36: 6.99, 48: 6.99, 60: 6.99, 72: 6.99 },
      good: { 36: 7.99, 48: 7.99, 60: 7.99, 72: 7.99 },
    },
  };
}

async function chooseOption(calculator: Locator, name: string) {
  const radio = calculator.getByRole("radio", { name, exact: true });
  // The native input is visually hidden; users click its enclosing card label.
  await radio.locator("..").click();
  await expect(radio).toBeChecked();
}

/** All browser writes are intercepted: these tests never create leads or email. */
async function mockPublicCalculator(
  page: Page,
  financing: FinancingConfig | null = rates(),
) {
  const submissions: Array<{
    data: Record<string, unknown>;
    key: string | undefined;
  }> = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      if (path === "/api/leads" && request.method() === "POST") {
        submissions.push({
          data: request.postDataJSON(),
          key: request.headers()["idempotency-key"],
        });
        await route.fulfill({
          json: { ok: true, leadId: "mock-financing-inquiry" },
        });
      } else if (path === "/api/events") {
        await route.fulfill({ json: { ok: true } });
      } else await route.abort();
    } else if (path === "/api/public/home") {
      await route.fulfill({
        json: {
          settings: { ...demoSettings, financing },
          featured: [],
          makes: [],
        },
      });
    } else await route.continue();
  });
  const response = await page.request.get("/api/inventory");
  expect(response.ok()).toBe(true);
  const { vehicles } = (await response.json()) as { vehicles: Vehicle[] };
  const vehicle = vehicles.find(
    (item) =>
      item.slug === "2022-toyota-rav4-xle-local" &&
      item.priceCents === 2_699_000,
  );
  expect(vehicle, "The local seed must include the $26,990 RAV4").toBeDefined();
  return { submissions, vehicle: vehicle! };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("yc-auto-locale", "en"));
});

test.describe("vehicle financing calculator", () => {
  test("starts without a credit selection, calculates exact inputs, and retains them across cash mode", async ({
    page,
  }) => {
    const { submissions, vehicle } = await mockPublicCalculator(page);
    await page.goto(`/inventory/${vehicle.slug}`);
    const calculator = page.getByRole("region", {
      name: "Payment calculator",
      exact: true,
    });
    await expect(
      calculator.getByRole("tab", { name: "Finance", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    const down = calculator.getByLabel("Down payment", { exact: true });
    await expect(down).toHaveValue("5000");
    await expect(
      calculator.getByRole("radio", { name: "72 months", exact: true }),
    ).toBeChecked();
    await expect(
      calculator.locator('input[name$="-credit"]:checked'),
    ).toHaveCount(0);
    await expect(
      calculator.getByTestId("financing-monthly-payment"),
    ).toHaveCount(0);
    await expect(
      calculator.getByRole("button", { name: "Ask about financing" }),
    ).toBeDisabled();

    await chooseOption(calculator, "740+ Excellent");
    await expect(
      calculator.getByTestId("financing-monthly-payment"),
    ).toHaveText("$364.33");
    await expect(calculator).toContainText("Uses preset illustrative rates");
    await calculator.getByText("Calculation details", { exact: true }).click();
    await expect(calculator.locator(".payment-details")).toContainText(
      "$21,990.00",
    );
    await expect(calculator.locator(".payment-details")).toContainText(
      "$4,242.05",
    );
    await calculator
      .getByRole("slider", { name: "Down payment slider" })
      .press("ArrowRight");
    await expect(down).toHaveValue("5250");
    await down.fill("6000.25");
    await chooseOption(calculator, "48 months");
    const payment = await calculator
      .getByTestId("financing-monthly-payment")
      .textContent();
    await expect(calculator.locator(".payment-details")).toContainText(
      "$20,989.75",
    );

    const cash = calculator.getByRole("tab", { name: "Cash", exact: true });
    await cash.click();
    await expect(calculator.locator(".payment-vehicle-price")).toContainText(
      "$26,990",
    );
    await expect(calculator.locator(".payment-vehicle-price")).toContainText(
      "Cash price",
    );
    await expect(
      calculator.getByTestId("financing-monthly-payment"),
    ).not.toBeVisible();
    // Tabs support keyboard navigation as well as pointer input.
    await cash.press("ArrowLeft");
    await expect(
      calculator.getByRole("tab", { name: "Finance", exact: true }),
    ).toBeFocused();
    await expect(down).toHaveValue("6000.25");
    await expect(
      calculator.getByRole("radio", { name: "48 months", exact: true }),
    ).toBeChecked();
    await expect(
      calculator.getByRole("radio", { name: "740+ Excellent", exact: true }),
    ).toBeChecked();
    await expect(
      calculator.getByTestId("financing-monthly-payment"),
    ).toHaveText(payment!);
    expect(submissions).toEqual([]);
  });

  test("does not turn invalid down payments into zero, and supports paying the full vehicle price", async ({
    page,
  }) => {
    const { submissions, vehicle } = await mockPublicCalculator(page);
    await page.goto(`/inventory/${vehicle.slug}`);
    const calculator = page.getByRole("region", {
      name: "Payment calculator",
      exact: true,
    });
    const down = calculator.getByLabel("Down payment", { exact: true });
    await chooseOption(calculator, "620–679 Good");
    for (const invalid of ["", "-1", "5000.001", "26991"]) {
      await down.fill(invalid);
      await expect(down).toHaveAttribute("aria-invalid", "true");
      await expect(calculator.getByRole("alert")).toBeVisible();
      await expect(
        calculator.getByTestId("financing-monthly-payment"),
      ).toHaveCount(0);
      await expect(
        calculator.getByRole("button", { name: "Ask about financing" }),
      ).toBeDisabled();
    }
    await down.fill("26990");
    await expect(down).toHaveAttribute("aria-invalid", "false");
    await expect(
      calculator.getByTestId("financing-monthly-payment"),
    ).toHaveText("$0.00");
    expect(submissions).toEqual([]);
  });

  test("opens low-score assistance without sending a lead, then submits only after valid contact details", async ({
    page,
  }) => {
    const { submissions, vehicle } = await mockPublicCalculator(page);
    await page.goto(`/inventory/${vehicle.slug}`);
    const calculator = page.getByRole("region", {
      name: "Payment calculator",
      exact: true,
    });
    await chooseOption(calculator, "619 or below Let’s talk");
    await expect(
      calculator.getByRole("heading", { name: "Talk with our team" }),
    ).toBeVisible();
    await expect(
      calculator.getByTestId("financing-monthly-payment"),
    ).toHaveCount(0);
    await expect(calculator).not.toContainText("5.99%");
    expect(submissions).toEqual([]);
    await calculator
      .getByLabel("Name *", { exact: true })
      .fill("Local Finance Test");
    const message = calculator.getByRole("textbox", {
      name: "Message",
      exact: true,
    });
    await message.fill("Please contact me after 5pm.");
    await chooseOption(calculator, "740+ Excellent");
    await chooseOption(calculator, "60 months");
    await calculator.getByRole("tab", { name: "Cash", exact: true }).click();
    await calculator.getByRole("tab", { name: "Finance", exact: true }).click();
    await chooseOption(calculator, "619 or below Let’s talk");
    await expect(calculator.getByLabel("Name *", { exact: true })).toHaveValue(
      "Local Finance Test",
    );
    await expect(message).toHaveValue("Please contact me after 5pm.");
    expect(submissions).toEqual([]);
    const submit = calculator.getByRole("button", {
      name: "Submit financing inquiry",
      exact: true,
    });
    await submit.click();
    await expect(calculator).toContainText(
      "Enter a phone number or email address so we can reach you.",
    );
    expect(submissions).toEqual([]);
    await calculator
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("finance@example.invalid");
    await submit.click();
    await expect(
      calculator.getByRole("heading", { name: "Financing inquiry received." }),
    ).toBeVisible();
    expect(submissions).toHaveLength(1);
    expect(submissions[0].key).toMatch(/^[\w-]{16,128}$/);
    expect(submissions[0].data).toMatchObject({
      leadType: "financing",
      vehicleId: vehicle.id,
      name: "Local Finance Test",
      email: "finance@example.invalid",
      financing: {
        creditTier: "consultation",
        termMonths: 60,
        downPaymentCents: 500_000,
      },
    });
    expect(submissions[0].data.financing).toEqual({
      creditTier: "consultation",
      termMonths: 60,
      downPaymentCents: 500_000,
    });
    expect(submissions[0].data).not.toHaveProperty("aprPercent");
    expect(submissions[0].data).not.toHaveProperty("monthlyPaymentCents");
  });

  test("offers assistance when rates are absent, including the Chinese view", async ({
    page,
  }) => {
    const { submissions, vehicle } = await mockPublicCalculator(page, null);
    await page.goto(`/zh/inventory/${vehicle.slug}`);
    const calculator = page.getByRole("region", {
      name: "购车付款计算器",
      exact: true,
    });
    await chooseOption(calculator, "740+ 优秀");
    await expect(calculator).toContainText("此选择暂时没有可用的线上利率。");
    await expect(
      calculator.getByTestId("financing-monthly-payment"),
    ).toHaveCount(0);
    await calculator
      .getByRole("button", { name: "咨询贷款方案", exact: true })
      .click();
    await expect(
      calculator.getByRole("button", { name: "发送贷款咨询", exact: true }),
    ).toBeVisible();
    await expect(calculator).toContainText("此操作不会查询您的信用");
    expect(submissions).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  });

  test("lets staff edit all twelve APR values, preserves blank rates, and omits rates for unrelated saves", async ({
    page,
  }) => {
    let settings = {
      ...demoSettings,
      financing: rates() as FinancingConfig | null,
    };
    const saves: Array<Record<string, unknown>> = [];
    let finishFirstSave!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      finishFirstSave = resolve;
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (new URL(request.url()).pathname !== "/api/admin/settings")
        return route.abort();
      if (request.method() === "PUT") {
        const data = request.postDataJSON();
        saves.push(data);
        if (saves.length === 1) await firstSave;
        settings = { ...settings, ...data };
      } else if (request.method() !== "GET") return route.abort();
      await route.fulfill({
        json: {
          settings,
          notificationRecipient: settings.leadNotificationRecipient,
        },
      });
    });
    await page.goto("/admin/settings");
    const section = page.getByRole("region", {
      name: "Financing estimates",
      exact: true,
    });
    await expect(section.getByRole("spinbutton")).toHaveCount(12);
    await page.getByLabel(/^Short name/).fill("Local settings test");
    const save = page.locator('button[form="settings-form"]');
    await expect(save).toHaveText(/Save changes/);
    await save.click();
    try {
      await expect(save).toBeDisabled();
      await expect(
        section.getByLabel("Excellent 36 months APR", { exact: true }),
      ).toBeDisabled();
      await expect(
        section.getByRole("checkbox", { name: "Preset illustrative rates" }),
      ).toBeDisabled();
    } finally {
      finishFirstSave();
    }
    await expect(
      page.getByText("Website settings saved.", { exact: true }),
    ).toBeVisible();
    expect(saves).toHaveLength(1);
    expect(saves[0]).not.toHaveProperty("financing");

    const first = section.getByLabel("Excellent 36 months APR", {
      exact: true,
    });
    await first.fill("-1");
    await save.click();
    await expect(first).toHaveAttribute("aria-invalid", "true");
    expect(saves).toHaveLength(1);
    for (const [tier, label] of [
      ["excellent", "Excellent"],
      ["very_good", "Very good"],
      ["good", "Good"],
    ] as const) {
      for (const term of [36, 48, 60, 72] as const) {
        const value = tier === "good" && term === 72 ? "" : String(term / 12);
        await section
          .getByLabel(`${label} ${term} months APR`, { exact: true })
          .fill(value);
      }
    }
    await section
      .getByRole("checkbox", { name: "Preset illustrative rates" })
      .uncheck();
    await save.click();
    await expect.poll(() => saves.length).toBe(2);
    expect(saves[1].financing).toEqual({
      version: 1,
      illustrative: false,
      rates: {
        excellent: { 36: 3, 48: 4, 60: 5, 72: 6 },
        very_good: { 36: 3, 48: 4, 60: 5, 72: 6 },
        good: { 36: 3, 48: 4, 60: 5, 72: null },
      },
    });
    await page.reload();
    await expect(
      section.getByLabel("Good 72 months APR", { exact: true }),
    ).toHaveValue("");
    await expect(
      section.getByLabel("Excellent 36 months APR", { exact: true }),
    ).toHaveValue("3");
    await expect(
      section.getByRole("checkbox", { name: "Preset illustrative rates" }),
    ).not.toBeChecked();
  });
});

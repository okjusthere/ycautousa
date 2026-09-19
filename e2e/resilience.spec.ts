import { expect, test, type Page, type Route } from "@playwright/test";
import { demoSettings, demoVehicles } from "../src/demo";

const home = {
  settings: demoSettings,
  featured: demoVehicles.filter((vehicle) => vehicle.featured),
  makes: [{ make: "Toyota", count: 1 }],
};
const inventory = {
  vehicles: demoVehicles,
  total: demoVehicles.length,
  page: 1,
  perPage: 12,
};

async function mockApi(
  page: Page,
  override?: (route: Route, path: string) => Promise<boolean>,
) {
  await page.addInitScript(() => localStorage.setItem("yc-auto-locale", "en"));
  await page.route("**/api/**", async (route) => {
    // These tests never write to a real inbox, inventory, or analytics endpoint.
    if (route.request().method() !== "GET") {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    const path = new URL(route.request().url()).pathname;
    if (await override?.(route, path)) return;
    if (path === "/api/public/home") await route.fulfill({ json: home });
    else if (path === "/api/public/config")
      await route.fulfill({ json: { turnstileSiteKey: "test-key" } });
    else if (path === "/api/inventory")
      await route.fulfill({ json: inventory });
    else if (path === "/api/inventory/facets")
      await route.fulfill({ json: { makes: home.makes, years: [2022] } });
    else if (path.startsWith("/api/vehicles/"))
      await route.fulfill({ json: { vehicle: demoVehicles[0] } });
    else await route.fulfill({ status: 404, json: { error: "Not found" } });
  });
}

test("home stays usable when an API returns HTML 200, then recovers on retry", async ({
  page,
}) => {
  let failing = true;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockApi(page, async (route, path) => {
    if (path !== "/api/public/home" || !failing) return false;
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<html><div id="root"></div></html>',
    });
    return true;
  });
  await page.goto("/");
  const main = page.locator("#main-content");
  await expect(
    main.getByRole("heading", { name: /Find Your Next Car/i }),
  ).toBeVisible();
  await expect(main.getByRole("alert")).toContainText(
    "Live inventory is temporarily unavailable.",
  );
  failing = false;
  await main.getByRole("button", { name: "Try again" }).click();
  await expect(main.getByRole("alert")).toHaveCount(0);
  await expect(main.locator(".vehicle-card").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("inventory reports a network failure and restores the current filters on retry", async ({
  page,
}) => {
  let failing = true;
  await mockApi(page, async (route, path) => {
    if (path !== "/api/inventory" || !failing) return false;
    await route.abort("failed");
    return true;
  });
  await page.goto("/inventory?make=Toyota&sort=price_asc");
  const main = page.locator("#main-content");
  await expect(main.getByRole("alert")).toContainText("Unable to connect");
  failing = false;
  await main.getByRole("button", { name: "Try again" }).click();
  await expect(main.locator(".vehicle-card").first()).toBeVisible();
  await expect(page).toHaveURL(/make=Toyota&sort=price_asc/);
});

test("vehicle detail distinguishes temporary failures from a missing vehicle", async ({
  page,
}) => {
  let responseStatus = 503;
  await mockApi(page, async (route, path) => {
    if (!path.startsWith("/api/vehicles/") || responseStatus === 200)
      return false;
    await route.fulfill({
      status: responseStatus,
      json: { error: "internal-detail-must-not-be-shown" },
    });
    return true;
  });
  await page.goto("/inventory");
  await page.locator(".vehicle-card h3 a").first().click();
  const main = page.locator("#main-content");
  await expect(main.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(main).not.toContainText("internal-detail-must-not-be-shown");
  await expect(
    main.getByRole("heading", { name: "Vehicle not found." }),
  ).toHaveCount(0);
  responseStatus = 200;
  await main.getByRole("button", { name: "Try again" }).click();
  await expect(
    main.getByRole("heading", { name: demoVehicles[0].title }),
  ).toBeVisible();

  responseStatus = 404;
  await page.goto("/inventory");
  await page.locator(".vehicle-card h3 a").first().click();
  await expect(
    main.getByRole("heading", { name: "Vehicle not found." }),
  ).toBeVisible();
  await expect(main.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("contact data failures show a retry without losing the contact form", async ({
  page,
}) => {
  let failing = true;
  await mockApi(page, async (route, path) => {
    if (path !== "/api/public/home" || !failing) return false;
    await route.fulfill({ json: { settings: null, featured: [], makes: [] } });
    return true;
  });
  await page.goto("/contact");
  const main = page.locator("#main-content");
  await expect(main.getByRole("alert")).toBeVisible();
  await expect(main.getByLabel("Name *")).toBeAttached();
  failing = false;
  await main.getByRole("button", { name: "Try again" }).click();
  await expect(main.getByRole("alert")).toHaveCount(0);
  await expect(main.locator(".contact-direct")).toContainText(
    demoSettings.phone,
  );
});

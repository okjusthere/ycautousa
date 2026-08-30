import { expect, test } from "@playwright/test";

test.describe("admin workspace", () => {
  test("shows inventory controls and vehicle editor", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /Good morning/i }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: /Add vehicle/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/vehicles\/new/);
    await expect(
      page.getByRole("heading", { name: /Add a vehicle/i }),
    ).toBeVisible();
    await page.getByLabel(/Listing title/).fill("2024 Test Vehicle");
    await page.getByRole("button", { name: /Save draft/i }).click();
    await expect(
      page.getByText(/Draft saved|Vehicle published/i),
    ).toBeVisible();
  });

  test("mobile navigation remains usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/vehicles");
    await expect(
      page.getByRole("heading", { name: /Vehicles/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Open admin navigation/i }).click();
    await expect(page.getByRole("link", { name: /Leads/i })).toBeVisible();
  });
});

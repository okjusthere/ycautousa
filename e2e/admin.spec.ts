import { expect, test } from "@playwright/test";

const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.describe("admin workspace", () => {
  test("adds, categorizes, and removes a vehicle", async ({ page }) => {
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
    const make = page.getByLabel("Make");
    await expect(make).toHaveAttribute("list", "vehicle-makes");
    await expect(
      page.locator('#vehicle-makes option[value="Toyota"]'),
    ).toHaveCount(1);
    await make.fill("Toyota");
    const model = page.getByLabel("Model");
    await expect(model).toHaveAttribute("list", "vehicle-models");
    await expect(
      page.locator('#vehicle-models option[value="RAV4"]'),
    ).toHaveCount(1);
    await model.fill("RAV4");
    await page.getByRole("button", { name: /Save draft/i }).click();
    await expect(
      page.getByText(/Draft saved|Vehicle published/i),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/vehicles\/(?!new)[^/]+$/);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove vehicle" }).click();
    await expect(page).toHaveURL(/\/admin\/vehicles$/);
    await expect(
      page.getByText("2024 Test Vehicle", { exact: true }),
    ).toHaveCount(0);
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

  test("first photo creates a draft automatically and uploads a realistic file", async ({
    page,
  }) => {
    await page.goto("/admin/vehicles/new");
    await page.getByLabel(/Listing title/).fill("Photo Upload Test Vehicle");
    await expect(
      page.getByText(/first upload will create a private draft automatically/i),
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: /Draft/i })).toBeChecked();
    await expect(
      page.getByRole("button", { name: /Publish listing/i }).last(),
    ).toBeVisible();

    const realisticImage = Buffer.alloc(70 * 1024);
    pngBytes.copy(realisticImage);
    await page.locator('input[type="file"]').setInputFiles({
      name: "front.png",
      mimeType: "image/png",
      buffer: realisticImage,
    });

    await expect(page).toHaveURL(/\/admin\/vehicles\/(?!new)[^/]+$/);
    await expect(
      page.getByText(/1 photo uploaded successfully/i),
    ).toBeVisible();
    await expect(
      page.getByAltText(/Photo Upload Test Vehicle view 1/i),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove vehicle" }).click();
    await expect(page).toHaveURL(/\/admin\/vehicles$/);
  });
});

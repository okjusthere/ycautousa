import { expect, test } from "@playwright/test";

test.describe("public showroom", () => {
  test("official brand logo and team photo load", async ({ page }) => {
    await page.goto("/");
    const logo = page.locator(".site-header .wordmark-logo");
    await expect(logo).toBeVisible();
    await expect
      .poll(() =>
        logo.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);

    await page.goto("/about");
    const team = page.locator(".about-team-photo img");
    await expect(team).toBeVisible();
    await expect
      .poll(() =>
        team.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const teamLayout = await team.evaluate((image: HTMLImageElement) => ({
      fit: getComputedStyle(image).objectFit,
      naturalRatio: image.naturalWidth / image.naturalHeight,
      renderedRatio:
        image.getBoundingClientRect().width /
        image.getBoundingClientRect().height,
    }));
    expect(teamLayout.fit).toBe("contain");
    expect(
      Math.abs(teamLayout.naturalRatio - teamLayout.renderedRatio),
    ).toBeLessThan(0.01);
  });

  test("home, inventory, filters, and vehicle detail are navigable", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Find Your Next Car/i }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: /Inventory/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(
      page.getByRole("heading", { name: /Find your next/i }),
    ).toBeVisible();
    if (
      await page
        .getByRole("button", { name: /Filters/i })
        .isVisible()
        .catch(() => false)
    )
      await page.getByRole("button", { name: /Filters/i }).click();
    await page.getByLabel("Make").selectOption("Toyota");
    await expect(page).toHaveURL(/make=Toyota/);
    await expect(page.getByText(/Toyota RAV4/i).first()).toBeVisible();
    if (
      await page
        .getByRole("button", { name: /Show vehicles/i })
        .isVisible()
        .catch(() => false)
    )
      await page.getByRole("button", { name: /Show vehicles/i }).click();
    await page
      .getByRole("link", { name: /2022 Toyota RAV4 XLE/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/inventory\/2022-toyota-rav4-xle-local/);
    await expect(
      page.getByRole("heading", { name: /2022 Toyota RAV4 XLE/i }),
    ).toBeVisible();
  });

  test("contact form accepts a local Turnstile test token", async ({
    page,
  }) => {
    await page.goto("/contact");
    await page.getByLabel("Name *").fill("Alex Buyer");
    await page.getByRole("textbox", { name: "Email" }).fill("alex@example.com");
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("I would like to learn more.");
    await page.getByRole("button", { name: /Send message/i }).click();
    await expect(
      page.getByRole("heading", { name: /Message received/i }),
    ).toBeVisible();
  });

  test("legacy product paths redirect without losing the new listing", async ({
    request,
  }) => {
    const response = await request.get("/legacy-demo-p.html", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toMatch(
      /\/inventory\/2022-toyota-rav4-xle-local$/,
    );
  });
});

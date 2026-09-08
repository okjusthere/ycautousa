import { expect, test } from "@playwright/test";

test("homepage defaults to Chinese and remembers the explicit language choice", async ({
  page,
}) => {
  await page.goto("/?utm_source=language-check#main-content");
  await expect(page).toHaveURL(/\/zh\?utm_source=language-check#main-content$/);
  await expect(page).toHaveTitle("YC Auto USA");
  await expect(page.locator(".hero-subtitle")).toHaveText(
    "纽约最大的汽车批发商",
  );
  await expect(
    page.getByRole("link", { name: "Switch to English" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Switch to English" }).click();
  await expect(page).toHaveURL(/\/\?utm_source=language-check#main-content$/);
  await expect(page.locator(".hero-subtitle")).toHaveText(
    "The Biggest Wholesale Dealer in NY",
  );
  await page.reload();
  await expect(page).toHaveURL(/\/\?utm_source=language-check#main-content$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "切换到中文" })).toBeVisible();
  await page.getByRole("link", { name: "切换到中文" }).click();
  await page.goto("/");
  await expect(page).toHaveURL(/\/zh$/);
  await expect(page.locator(".hero-actions .button").first()).toHaveCSS(
    "font-size",
    "16px",
  );
});

test("explicit language deep links are preserved", async ({ page }) => {
  await page.goto("/inventory?make=Toyota");
  await expect(page).toHaveURL(/\/inventory\?make=Toyota$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/zh/trade-sell");
  await expect(page).toHaveURL(/\/zh\/trade-sell$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

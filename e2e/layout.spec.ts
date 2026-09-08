import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("yc-auto-locale", "en"));
});

test("about introduction sits below YC beside the story on desktop", async ({
  page,
}) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/about", "/zh/about"]) {
      await page.goto(route);
      const rail = page.locator(".editorial-rail");
      await expect(rail.locator("h1")).toBeVisible();
      const mark = await rail.locator(":scope > span").boundingBox();
      const intro = await rail.locator(".about-intro").boundingBox();
      const body = await page.locator(".editorial-body").boundingBox();
      expect(intro!.y).toBeGreaterThan(mark!.y + mark!.height);
      if (width > 820) {
        expect(intro!.x + intro!.width).toBeLessThan(body!.x);
        expect(Math.abs(mark!.y - body!.y)).toBeLessThan(2);
      } else {
        expect(body!.y).toBeGreaterThan(intro!.y + intro!.height);
      }
      expect(
        await rail
          .locator("h1")
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeLessThanOrEqual(40);
    }
  }
});

test("public pages fit desktop, tablet, and narrow phones in both languages", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const inventory = await page.request.get("/api/inventory");
  const { vehicles } = await inventory.json();
  const routes = [
    "",
    "/inventory",
    "/about",
    "/contact",
    "/trade-sell",
    "/privacy",
    "/terms",
    "/missing-layout-page",
  ];
  if (vehicles[0]) routes.push(`/inventory/${vehicles[0].slug}`);
  const widths =
    testInfo.project.name === "mobile" ? [320, 390, 768] : [1024, 1440, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "zh"]) {
      for (const route of routes) {
        const path = `${locale === "zh" ? "/zh" : ""}${route}` || "/";
        await page.goto(path);
        await expect(page.locator("main h1")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const problems = await page.evaluate(() => {
          const issues: string[] = [];
          if (document.documentElement.scrollWidth > window.innerWidth + 1)
            issues.push(
              `Page width ${document.documentElement.scrollWidth} exceeds viewport ${window.innerWidth}`,
            );
          for (const heading of document.querySelectorAll<HTMLElement>(
            "main h1, main h2, main h3",
          )) {
            const box = heading.getBoundingClientRect();
            if (!box.width || !box.height) continue;
            if (box.left < -1 || box.right > window.innerWidth + 1)
              issues.push(`Heading outside viewport: ${heading.textContent}`);
            if (
              document.documentElement.lang.startsWith("zh") &&
              /[\u4e00-\u9fff]/.test(heading.textContent || "")
            ) {
              const style = getComputedStyle(heading);
              if (
                parseFloat(style.lineHeight) <
                parseFloat(style.fontSize) * 1.15
              )
                issues.push(
                  `Overlapping Chinese line boxes: ${heading.textContent}`,
                );
            }
          }
          return issues;
        });
        expect.soft(problems, `${path} at ${width}px`).toEqual([]);
        if (route === "/inventory") {
          const count = await page
            .locator(".inventory-count")
            .evaluate((element) => {
              const number = element.querySelector(":scope > span")!;
              const label = element.querySelector("small span")!;
              return {
                number: parseFloat(getComputedStyle(number).fontSize),
                label: parseFloat(getComputedStyle(label).fontSize),
              };
            });
          expect(count.label).toBeLessThan(count.number / 2);
        }
        await page.screenshot({
          path: testInfo.outputPath(
            `${locale}-${width}-${route.replaceAll("/", "_") || "home"}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
});

test("home shows every live make and its updated count, including beyond eight makes", async ({
  page,
}) => {
  const response = await page.request.get("/api/public/home");
  const home = await response.json();
  const makes = Array.from({ length: 10 }, (_, index) => ({
    make: `Brand ${index + 1}`,
    count: index + 1,
  }));
  await page.route("**/api/public/home", (route) =>
    route.fulfill({ json: { ...home, makes } }),
  );
  await page.goto("/");
  await expect(page.locator(".make-row")).toHaveCount(10);
  await expect(page.locator(".make-row").last()).toContainText("10 vehicles");
  await expect(
    page.locator(".make-row").last().locator(".make-number"),
  ).toHaveText("10");
  makes[9].count = 12;
  makes.push({ make: "New Brand", count: 1 });
  await page.reload();
  await expect(page.locator(".make-row")).toHaveCount(11);
  await expect(page.locator(".make-row").nth(9)).toContainText("12 vehicles");
  await expect(page.locator(".make-row").last()).toContainText("New Brand");
  await expect(
    page.locator(".make-row").last().locator(".make-count"),
  ).toBeVisible();
});

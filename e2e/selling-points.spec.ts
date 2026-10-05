import { expect, test, type Page } from "@playwright/test";
import type { Vehicle } from "../lib/types";
import { demoSettings, demoVehicles } from "../src/demo";

const sellingPoints = [
  { zh: "低首付", en: "Low down payment" },
  { zh: "低里程", en: "Low mileage" },
];

function requireLocalServer(baseURL: string | undefined): string {
  if (!baseURL) throw new Error("Selling point tests require a local server.");
  const origin = new URL(baseURL).origin;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname))
    throw new Error("These tests must never write to a production inventory.");
  return origin;
}

async function mockInventory(page: Page) {
  const statuses: Vehicle["status"][] = [
    "available",
    "pending",
    "sold",
    "draft",
    "hidden",
  ];
  const vehicles = statuses.map((status) => ({
    ...demoVehicles[0],
    id: `selling-point-${status}`,
    slug: `selling-point-${status}`,
    title: `Selling point ${status}`,
    status,
    sellingPoints:
      status === "available"
        ? [sellingPoints[0], { zh: "单一车主", en: "" }]
        : status === "pending"
          ? [{ zh: "", en: "Low mileage" }, sellingPoints[0]]
          : sellingPoints,
  }));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") {
      if (path === "/api/events") await route.fulfill({ json: { ok: true } });
      else await route.abort();
    } else if (path === "/api/inventory") {
      await route.fulfill({
        json: { vehicles, total: vehicles.length, page: 1, perPage: 12 },
      });
    } else if (path === "/api/inventory/facets") {
      await route.fulfill({ json: { makes: [], years: [] } });
    } else if (path === "/api/public/home") {
      await route.fulfill({
        json: { settings: demoSettings, featured: [], makes: [] },
      });
    } else await route.continue();
  });
}

test.describe("vehicle selling points", () => {
  test("admin presets and custom labels persist, respect the limit, and can be cleared", async ({
    page,
    baseURL,
  }, testInfo) => {
    const origin = requireLocalServer(baseURL);
    let createdId: string | undefined;
    const save = async () => {
      const response = page.waitForResponse(
        (response) =>
          /\/api\/admin\/vehicles(?:\/[^/]+)?$/.test(
            new URL(response.url()).pathname,
          ) && ["POST", "PUT"].includes(response.request().method()),
      );
      await page.getByRole("button", { name: /Save draft/i }).click();
      const saved = await response;
      expect(saved.ok()).toBe(true);
      if (saved.request().method() === "POST") {
        const result = (await saved.json()) as { id: string };
        createdId = result.id;
      }
      await expect(
        page.getByText("Draft saved.", { exact: true }),
      ).toBeVisible();
    };

    try {
      await page.goto("/admin/vehicles/new");
      await page
        .getByLabel(/Listing title/)
        .fill(`Selling points ${testInfo.project.name} ${Date.now()}`);
      await expect(
        page.getByRole("heading", { name: "卖点标签 / Selling points" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "低首付", exact: true }).click();
      await page.getByRole("button", { name: "低里程", exact: true }).click();
      await expect(page.getByLabel("标签 1 中文", { exact: true })).toHaveValue(
        "低首付",
      );
      await expect(
        page.getByLabel("标签 2 English", { exact: true }),
      ).toHaveValue("Low mileage");
      await expect(
        page.getByRole("button", { name: "添加自定义标签", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "低首付", exact: true }),
      ).toBeDisabled();

      await save();
      await expect(page).toHaveURL(/\/admin\/vehicles\/(?!new)[^/]+$/);
      await page.reload();
      await expect(page.getByLabel("标签 1 中文", { exact: true })).toHaveValue(
        "低首付",
      );
      await expect(page.getByLabel("标签 2 中文", { exact: true })).toHaveValue(
        "低里程",
      );

      await page
        .getByRole("button", { name: "删除标签 2", exact: true })
        .click();
      await page
        .getByRole("button", { name: "添加自定义标签", exact: true })
        .click();
      await page.getByLabel("标签 2 中文", { exact: true }).fill("单一车主");
      await page
        .getByLabel("标签 2 English", { exact: true })
        .fill("One owner");
      await save();
      await page.reload();
      await expect(page.getByLabel("标签 2 中文", { exact: true })).toHaveValue(
        "单一车主",
      );
      await expect(
        page.getByLabel("标签 2 English", { exact: true }),
      ).toHaveValue("One owner");

      await page
        .getByRole("button", { name: "删除标签 2", exact: true })
        .click();
      await page
        .getByRole("button", { name: "删除标签 1", exact: true })
        .click();
      await save();
      await page.reload();
      await expect(page.getByLabel(/^标签 \d+ 中文$/)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "添加自定义标签", exact: true }),
      ).toBeEnabled();
    } finally {
      if (createdId) {
        const removed = await page.request.post(
          `/api/admin/vehicles/${encodeURIComponent(createdId)}/delete`,
          { headers: { Origin: origin } },
        );
        expect(removed.ok(), "Remove only the draft created by this test").toBe(
          true,
        );
      }
    }
  });

  test("public cards localize labels with fallback and keep sold status without selling points", async ({
    page,
  }) => {
    await mockInventory(page);
    await page.goto("/zh/inventory");
    const card = (status: Vehicle["status"]) =>
      page.locator(".vehicle-card").filter({
        has: page.getByRole("heading", {
          name: `Selling point ${status}`,
          exact: true,
        }),
      });
    await expect(
      card("available").locator(".vehicle-selling-points"),
    ).toContainText("低首付");
    await expect(
      card("available").locator(".vehicle-selling-points"),
    ).toContainText("单一车主");
    await expect(
      card("pending").locator(".vehicle-selling-points"),
    ).toContainText("Low mileage");
    await expect(card("pending").locator(".status-pill")).toBeVisible();
    await expect(card("sold").locator(".status-pill")).toHaveText("已售");
    for (const status of ["sold", "draft", "hidden"] as const)
      await expect(card(status).locator(".vehicle-selling-points")).toHaveCount(
        0,
      );

    const menu = page.getByRole("button", { name: "打开菜单" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: "Switch to English" }).click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(
      card("available").locator(".vehicle-selling-points"),
    ).toContainText("Low down payment");
    await expect(
      card("available").locator(".vehicle-selling-points"),
    ).toContainText("单一车主");
    await expect(card("sold").locator(".status-pill")).toHaveText("Sold");

    await page.setViewportSize({ width: 320, height: 740 });
    for (const status of ["available", "pending"] as const) {
      const layout = await card(status).evaluate((element) => {
        const media = element.querySelector(".vehicle-card-media")!;
        const labels = element.querySelector(".vehicle-selling-points")!;
        const imageBox = media.getBoundingClientRect();
        const labelBox = labels.getBoundingClientRect();
        return {
          left: labelBox.left - imageBox.left,
          right: imageBox.right - labelBox.right,
          bottom: imageBox.bottom - labelBox.bottom,
          labelOverflow: labels.scrollWidth - labels.clientWidth,
          pageOverflow:
            document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeGreaterThanOrEqual(0);
      expect(layout.bottom).toBeGreaterThanOrEqual(0);
      expect(layout.labelOverflow).toBeLessThanOrEqual(1);
      expect(layout.pageOverflow).toBeLessThanOrEqual(1);
    }
  });
});

import { expect, test } from "@playwright/test";
import { staffMembers } from "../src/staff";

test("merged Contact shows all staff, original photos, titles and honest contact actions", async ({
  page,
}) => {
  for (const locale of ["en", "zh"]) {
    await page.goto(locale === "zh" ? "/zh/contact" : "/contact");
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator("#our-story")).toBeVisible();
    await expect(page.locator(".staff-card")).toHaveCount(9);
    await expect(page.locator(".site-header a[href$='/about']")).toHaveCount(0);
    await expect(page.locator(".site-footer a[href$='/about']")).toHaveCount(0);
    for (const member of staffMembers) {
      const card = page.locator(".staff-card").filter({
        has: page.getByRole("heading", { name: member.name, exact: true }),
      });
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator(".staff-title")).toHaveText(
        locale === "zh" ? member.titleZh : member.title,
      );
      await expect(card.locator(".staff-actions > *")).toHaveCount(3);
      if (member.phone)
        await expect(card.locator("a[href^='tel:']")).toHaveAttribute(
          "href",
          `tel:${member.phone.replace(/[^\d+]/g, "")}`,
        );
      if (member.email)
        await expect(card.locator("a[href^='mailto:']")).toHaveAttribute(
          "href",
          `mailto:${member.email}`,
        );
      await expect(card.locator(".staff-actions button:disabled")).toHaveCount(
        [member.phone, member.email, member.wechat].filter((value) => !value)
          .length,
      );
      const img = card.locator("img");
      await expect
        .poll(() =>
          img.evaluate(
            (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
          ),
        )
        .toBe(true);
      await expect(img).toHaveCSS("object-fit", "contain");
      if (member.wechat) {
        const button = card.locator("button[aria-controls]");
        await button.click();
        await expect(card.locator(".staff-wechat code")).toHaveText(
          member.wechat,
        );
        await expect(button).toHaveAttribute("aria-expanded", "true");
        await button.click();
        await expect(card.locator(".staff-wechat")).toBeHidden();
      }
    }
  }
});

test("WeChat copy succeeds and offers manual copying if clipboard access fails", async ({
  page,
}) => {
  await page.goto("/zh/contact");
  const card = page.locator(".staff-card").filter({
    has: page.getByRole("heading", { name: "Sophie Wang", exact: true }),
  });
  await card.getByRole("button", { name: "微信: Sophie Wang" }).click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copied = text;
        },
      },
    }),
  );
  await card.getByRole("button", { name: "复制微信号", exact: true }).click();
  await expect(card.getByRole("status")).toHaveText("微信号已复制。");
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied",
    "Sophiewang01",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("clipboard denied");
        },
      },
    }),
  );
  await card.getByRole("button", { name: "复制微信号", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("手动复制");
  await expect(card.locator("code")).toHaveText("Sophiewang01");
});

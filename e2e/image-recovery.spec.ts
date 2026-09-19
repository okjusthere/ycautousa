import { expect, test, type Page } from "@playwright/test";
import type { VehicleImage } from "../lib/types";
import { demoVehicles } from "../src/demo";

const vehicleId = "photo-recovery-test";
const imagePath = `/api/admin/vehicles/${vehicleId}/images`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function photo(id: string, position: number): VehicleImage {
  return {
    id,
    vehicleId,
    r2Key: `vehicles/${vehicleId}/${id}/original.png`,
    originalFilename: `${id}.png`,
    contentType: "image/png",
    byteSize: png.length,
    width: 1,
    height: 1,
    position,
    isCover: position === 0,
    createdAt: "2026-09-19T00:00:00.000Z",
    deletedAt: null,
  };
}

async function mockPhotos(page: Page) {
  const server = {
    images: [photo("front", 0), photo("side", 1), photo("rear", 2)],
    failPut: true,
    failGet: false,
    failReadAfterPut: false,
    commitBeforeFailure: false,
    putCalls: 0,
    uploadCalls: 0,
    deleteCalls: 0,
    holdPut: null as Promise<void> | null,
    holdUpload: null as Promise<void> | null,
  };
  await page.route("**/media/**", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  // Intercept every API call: these tests never mutate a real database or R2.
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === `/api/admin/vehicles/${vehicleId}` && method === "GET") {
      await route.fulfill({
        json: {
          vehicle: {
            ...demoVehicles[0],
            id: vehicleId,
            title: "Photo recovery fixture",
            images: server.images,
          },
        },
      });
    } else if (path === imagePath && method === "GET") {
      await route.fulfill(
        server.failGet
          ? { status: 503, json: { error: "Photo service unavailable." } }
          : { json: { images: server.images } },
      );
    } else if (path === imagePath && method === "PUT") {
      server.putCalls += 1;
      if (server.holdPut) await server.holdPut;
      const change = request.postDataJSON() as {
        order: string[];
        coverId: string;
      };
      if (!server.failPut || server.commitBeforeFailure)
        server.images = change.order.map((id, position) => ({
          ...server.images.find((image) => image.id === id)!,
          position,
          isCover: id === change.coverId,
        }));
      if (server.failReadAfterPut) server.failGet = true;
      await route.fulfill(
        server.failPut
          ? {
              status: 503,
              json: { error: "Photo changes were not confirmed." },
            }
          : { json: { ok: true, images: server.images } },
      );
    } else if (path === imagePath && method === "POST") {
      server.uploadCalls += 1;
      if (server.holdUpload) await server.holdUpload;
      const image = photo("uploaded", server.images.length);
      image.isCover = false;
      server.images = [...server.images, image];
      await route.fulfill({ status: 201, json: { ok: true, image } });
    } else if (path.startsWith("/api/admin/images/") && method === "DELETE") {
      server.deleteCalls += 1;
      const id = path.split("/").at(-1);
      server.images = server.images
        .filter((image) => image.id !== id)
        .map((image, position) => ({
          ...image,
          position,
          isCover: position === 0,
        }));
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.fulfill({
        status: 503,
        json: { error: "Unmocked test API" },
      });
    }
  });
  await page.goto(`/admin/vehicles/${vehicleId}`);
  await expect(page.locator(".image-manager-item")).toHaveCount(3);
  return server;
}

async function expectPhotoOrder(page: Page, names: string[]) {
  await expect(page.locator(".image-manager-meta small")).toHaveText(names);
}

test.beforeEach(({ baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
});

test("failed order changes restore saved state and retry the intended order", async ({
  page,
}) => {
  const server = await mockPhotos(page);
  await page.getByRole("button", { name: "Move image down" }).first().click();
  await expect(page.getByRole("alert")).toContainText(
    "Saved photos have been reloaded",
  );
  await expectPhotoOrder(page, ["front.png", "side.png", "rear.png"]);
  await expect(
    page.getByText("Order will sync when the vehicle is saved."),
  ).toHaveCount(0);
  server.failPut = false;
  await page.getByRole("button", { name: "Retry photo change" }).click();
  await expectPhotoOrder(page, ["side.png", "front.png", "rear.png"]);
  await expect(page.locator(".image-manager-item.is-cover small")).toHaveText(
    "front.png",
  );
  await page.reload();
  await expectPhotoOrder(page, ["side.png", "front.png", "rear.png"]);
});

test("failed cover changes keep the saved cover and expose a real retry", async ({
  page,
}) => {
  const server = await mockPhotos(page);
  await page
    .getByRole("button", { name: "Set cover", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Retry photo change" }),
  ).toBeVisible();
  await expect(page.locator(".image-manager-item.is-cover small")).toHaveText(
    "front.png",
  );
  server.failPut = false;
  await page.getByRole("button", { name: "Retry photo change" }).click();
  await expect(page.locator(".image-manager-item.is-cover small")).toHaveText(
    "side.png",
  );
});

test("failed drag order returns to saved order", async ({ page }) => {
  await mockPhotos(page);
  const items = page.locator(".image-manager-item");
  await items.first().dispatchEvent("dragstart");
  await items.last().dispatchEvent("drop");
  await expect(
    page.getByRole("button", { name: "Retry photo change" }),
  ).toBeVisible();
  await expectPhotoOrder(page, ["front.png", "side.png", "rear.png"]);
});

test("stale editor actions reload another editor's saved cover instead of overwriting it", async ({
  page,
}) => {
  const server = await mockPhotos(page);
  server.images = server.images.map((image) => ({
    ...image,
    isCover: image.id === "rear",
  }));
  await page.getByRole("button", { name: "Move image down" }).first().click();
  await expect(page.getByRole("alert")).toContainText("The photo list changed");
  await expectPhotoOrder(page, ["front.png", "side.png", "rear.png"]);
  await expect(page.locator(".image-manager-item.is-cover small")).toHaveText(
    "rear.png",
  );
  expect(server.putCalls).toBe(0);
});

test("ambiguous successful writes are recognized without applying the move twice", async ({
  page,
}) => {
  const server = await mockPhotos(page);
  server.commitBeforeFailure = true;
  await page.getByRole("button", { name: "Move image down" }).first().click();
  await expect(
    page.getByText("Photo changes saved and verified."),
  ).toBeVisible();
  await expectPhotoOrder(page, ["side.png", "front.png", "rear.png"]);
  await expect(
    page.getByRole("button", { name: "Retry photo change" }),
  ).toHaveCount(0);
  expect(server.putCalls).toBe(1);
});

test("network recovery blocks new writes until saved photos can be reloaded", async ({
  page,
}) => {
  const server = await mockPhotos(page);
  server.failReadAfterPut = true;
  await page.getByRole("button", { name: "Move image down" }).first().click();
  const reload = page.getByRole("button", { name: "Reload saved photos" });
  await expect(reload).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Set cover", exact: true }).first(),
  ).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  server.failGet = false;
  server.failReadAfterPut = false;
  await reload.click();
  await expect(reload).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry photo change" }),
  ).toBeEnabled();
});

test("pending changes serialize other photo edits and upload/delete actions", async ({
  page,
}) => {
  const server = await mockPhotos(page);
  let release!: () => void;
  server.holdPut = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.failPut = false;
  await page.getByRole("button", { name: "Move image down" }).first().click();
  await expect.poll(() => server.putCalls).toBe(1);
  await expect(
    page.getByRole("button", { name: "Set cover", exact: true }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove image" }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove vehicle", exact: true }),
  ).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await page
    .getByRole("button", { name: "Move image down" })
    .first()
    .dispatchEvent("click");
  await page.locator(".image-manager-item").first().dispatchEvent("dragstart");
  await page.locator(".image-manager-item").last().dispatchEvent("drop");
  expect(server.putCalls).toBe(1);
  release();
  await expectPhotoOrder(page, ["side.png", "front.png", "rear.png"]);
  await expect(page.locator('input[type="file"]')).toBeEnabled();
});

test("removing the cover reloads the server's replacement cover and positions", async ({
  page,
}) => {
  const server = await mockPhotos(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove image" }).first().click();
  await expectPhotoOrder(page, ["side.png", "rear.png"]);
  await expect(page.locator(".image-manager-item.is-cover small")).toHaveText(
    "side.png",
  );
  expect(server.deleteCalls).toBe(1);
});

test("uploads block competing edits and merge the authoritative saved list", async ({
  page,
}) => {
  const server = await mockPhotos(page);
  let release!: () => void;
  server.holdUpload = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "uploaded.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect.poll(() => server.uploadCalls).toBe(1);
  await expect(
    page.getByRole("button", { name: "Move image down" }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove image" }).first(),
  ).toBeDisabled();
  release();
  await expectPhotoOrder(page, [
    "front.png",
    "side.png",
    "rear.png",
    "uploaded.png",
  ]);
  await expect(page.locator('input[type="file"]')).toBeEnabled();
});

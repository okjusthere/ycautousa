import { describe, expect, it } from "vitest";
import { handleRequest } from "../../workers/app";
import type { Env } from "../../workers/env";
import { SqliteD1 } from "../helpers/sqlite-d1";

const pngBytes = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);

const realisticPngBytes = new Uint8Array(70 * 1024);
realisticPngBytes.set(pngBytes);

describe("R2 media integration", () => {
  it("uploads, serves, reorders, and soft-deletes an image without destroying the object", async () => {
    const objects = new Map<
      string,
      { bytes: ArrayBuffer; contentType: string }
    >();
    const bucket = {
      put: async (
        key: string,
        value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
        options?: Record<string, unknown>,
      ) => {
        if (!(value instanceof ArrayBuffer))
          throw new Error("test expects ArrayBuffer");
        objects.set(key, {
          bytes: value,
          contentType: String(
            (options?.httpMetadata as Record<string, unknown> | undefined)
              ?.contentType ?? "application/octet-stream",
          ),
        });
      },
      get: async (key: string) => {
        const object = objects.get(key);
        if (!object) return null;
        return {
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(object.bytes));
              controller.close();
            },
          }),
          httpMetadata: { contentType: object.contentType },
          httpEtag: "test-etag",
        };
      },
      delete: async (_key: string) => {
        /* normal UI deletion is intentionally soft */
      },
    };
    const env: Env = {
      DB: new SqliteD1(),
      VEHICLE_IMAGES: bucket,
      APP_ORIGIN: "http://localhost:5173",
      CANONICAL_HOST: "www.ycautousa.com",
      ADMIN_EMAILS: "admin@example.com",
      DEV_ADMIN_EMAIL: "admin@example.com",
    };
    const headers = {
      "CF-Access-Authenticated-User-Email": "admin@example.com",
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    };
    const created = await handleRequest(
      new Request("http://localhost:5173/api/admin/vehicles", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Media Test Vehicle",
          status: "draft",
          featured: false,
          features: [],
        }),
      }),
      env,
    );
    const vehicleId = ((await created.json()) as { id: string }).id;
    const form = new FormData();
    form.append(
      "file",
      new File([realisticPngBytes], "front.png", { type: "image/png" }),
    );
    const upload = await handleRequest(
      new Request(
        `http://localhost:5173/api/admin/vehicles/${vehicleId}/images`,
        {
          method: "POST",
          headers: {
            "CF-Access-Authenticated-User-Email": "admin@example.com",
            Origin: "http://localhost:5173",
            "Content-Length": String(realisticPngBytes.byteLength + 512),
          },
          body: form,
        },
      ),
      env,
    );
    expect(upload.status).toBe(201);
    const image = (
      (await upload.json()) as { image: { id: string; r2Key: string } }
    ).image;
    expect(objects.has(image.r2Key)).toBe(true);
    const media = await handleRequest(
      new Request(`http://localhost:5173/media/${image.r2Key}`),
      env,
    );
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/png");
    const deleted = await handleRequest(
      new Request(`http://localhost:5173/api/admin/images/${image.id}`, {
        method: "DELETE",
        headers: {
          "CF-Access-Authenticated-User-Email": "admin@example.com",
          Origin: "http://localhost:5173",
        },
      }),
      env,
    );
    expect(deleted.status).toBe(200);
    expect(objects.has(image.r2Key)).toBe(true);

    env.VEHICLE_IMAGES = {
      ...bucket,
      put: async () => {
        throw new Error("private storage detail");
      },
    };
    const failedForm = new FormData();
    failedForm.append(
      "file",
      new File([pngBytes], "retry.png", { type: "image/png" }),
    );
    const failedUpload = await handleRequest(
      new Request(
        `http://localhost:5173/api/admin/vehicles/${vehicleId}/images`,
        {
          method: "POST",
          headers: {
            "CF-Access-Authenticated-User-Email": "admin@example.com",
            Origin: "http://localhost:5173",
          },
          body: failedForm,
        },
      ),
      env,
    );
    expect(failedUpload.status).toBe(500);
    expect(await failedUpload.json()).toEqual({
      error: "Unable to upload image.",
    });
  });
});

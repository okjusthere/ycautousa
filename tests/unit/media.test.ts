import { describe, expect, it } from "vitest";
import {
  serveMedia,
  validateImageBytes,
  validateMediaKey,
} from "../../workers/media";
import type { Env } from "../../workers/env";

const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
).buffer;

describe("private media handling", () => {
  it("whitelists immutable vehicle keys and validates real image signatures", async () => {
    expect(validateMediaKey("vehicles/veh_1/img_1/original.webp")).toBe(true);
    expect(validateMediaKey("../vehicles/veh_1/img_1/original.webp")).toBe(
      false,
    );
    expect(validateMediaKey("vehicles/veh_1/img_1/original.svg")).toBe(false);
    await expect(validateImageBytes(png, "image/png")).resolves.toMatchObject({
      contentType: "image/png",
    });
    await expect(
      validateImageBytes(
        new TextEncoder().encode("not image").buffer,
        "image/png",
      ),
    ).rejects.toThrow();
  });

  it("rejects unsupported transform widths instead of silently expanding the allowlist", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(png));
        controller.close();
      },
    });
    const env = {
      VEHICLE_IMAGES: {
        get: async () => ({ body, httpMetadata: { contentType: "image/png" } }),
      },
    } as any;
    const response = await serveMedia(
      new Request("https://yc.test/media/vehicles/v/i/original.webp?w=321"),
      env,
      "vehicles/v/i/original.webp",
    );
    expect(response.status).toBe(400);
  });

  it("uses the Cloudflare Images output response for an approved transform", async () => {
    let transformOptions: { width?: number } | undefined;
    let outputOptions: { format: string; quality?: number } | undefined;
    const transformedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("transformed"));
        controller.close();
      },
    });
    const transformer = {
      transform(options: { width?: number }) {
        transformOptions = options;
        return transformer;
      },
      output: async (options: { format: string; quality?: number }) => {
        outputOptions = options;
        return {
          response: () =>
            new Response(transformedBody, {
              headers: { "Content-Type": "image/webp" },
            }),
        };
      },
    };
    const env = {
      VEHICLE_IMAGES: {
        get: async () => ({
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(png));
              controller.close();
            },
          }),
          httpMetadata: { contentType: "image/png" },
        }),
      },
      IMAGES: {
        input: () => transformer,
      },
    } as unknown as Env;

    const response = await serveMedia(
      new Request(
        "https://yc.test/media/vehicles/v/i/original.webp?w=640&q=74",
      ),
      env,
      "vehicles/v/i/original.webp",
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("transformed");
    expect(transformOptions).toEqual({ width: 640 });
    expect(outputOptions).toEqual({ format: "image/webp", quality: 74 });
    expect(response.headers.get("cache-control")).toContain("immutable");
  });
});

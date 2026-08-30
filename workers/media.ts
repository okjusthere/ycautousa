import type { Env, ImageOutputMime } from "./env";
import type { ImagesBinding } from "@cloudflare/workers-types";
import { imageMetaSchema } from "../lib/validation";
import { uid } from "../lib/utils";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const WIDTHS = new Set([320, 640, 960, 1280, 1600, 2048]);
const CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** The Images binding expects full MIME types, not bare format names. */
const OUTPUT_MIME: Record<"webp" | "avif" | "jpeg", ImageOutputMime> = {
  webp: "image/webp",
  avif: "image/avif",
  jpeg: "image/jpeg",
};

function safeFilename(value: string): string {
  return (
    value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "vehicle-image"
  );
}

export function validateMediaKey(key: string): boolean {
  if (
    !key ||
    key.length > 500 ||
    key.includes("..") ||
    key.startsWith("/") ||
    key.includes("\\")
  )
    return false;
  return /^vehicles\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/original\.(?:jpe?g|png|webp)$/i.test(
    key,
  );
}

function detectImage(
  bytes: Uint8Array,
  declared: string,
): { contentType: string; width: number | null; height: number | null } | null {
  if (bytes.length < 12 || !CONTENT_TYPES.has(declared)) return null;
  if (
    declared === "image/png" &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      contentType: "image/png",
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }
  if (
    declared === "image/webp" &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { contentType: "image/webp", width, height };
    }
    return { contentType: "image/webp", width: null, height: null };
  }
  if (declared === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      if (length < 2) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          contentType: "image/jpeg",
          height: (bytes[offset + 5] << 8) + bytes[offset + 6],
          width: (bytes[offset + 7] << 8) + bytes[offset + 8],
        };
      }
      offset += 2 + length;
    }
    return { contentType: "image/jpeg", width: null, height: null };
  }
  return null;
}

export async function validateImageBytes(
  bytes: ArrayBuffer,
  declaredType: string,
): Promise<{
  contentType: string;
  width: number | null;
  height: number | null;
}> {
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_IMAGE_BYTES)
    throw new Error("Image exceeds the 12 MB limit");
  const detected = detectImage(new Uint8Array(bytes), declaredType);
  if (!detected)
    throw new Error("File is not a valid JPEG, PNG, or WebP image");
  if (
    (detected.width && detected.width > 12_000) ||
    (detected.height && detected.height > 12_000)
  )
    throw new Error("Image dimensions are too large");
  return detected;
}

export async function uploadVehicleImage(
  env: Env,
  vehicleId: string,
  form: FormData,
): Promise<{
  id: string;
  key: string;
  meta: ReturnType<typeof imageMetaSchema.parse>;
}> {
  if (!env.VEHICLE_IMAGES)
    throw new Error("Vehicle image storage is not configured");
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Choose an image file");
  const bytes = await file.arrayBuffer();
  const declaredType = file.type || "application/octet-stream";
  const detected = await validateImageBytes(bytes, declaredType);
  const id = uid("img");
  const extension =
    detected.contentType === "image/jpeg"
      ? "jpg"
      : detected.contentType.slice("image/".length);
  const key = `vehicles/${vehicleId}/${id}/original.${extension}`;
  if (!validateMediaKey(key)) throw new Error("Invalid image key");
  await env.VEHICLE_IMAGES.put(key, bytes, {
    httpMetadata: {
      contentType: detected.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: { vehicleId, imageId: id },
  });
  const meta = imageMetaSchema.parse({
    filename: safeFilename(file.name),
    contentType: detected.contentType,
    byteSize: bytes.byteLength,
    width: detected.width ?? 1,
    height: detected.height ?? 1,
  });
  return { id, key, meta };
}

export async function serveMedia(
  request: Request,
  env: Env,
  key: string,
): Promise<Response> {
  if (!env.VEHICLE_IMAGES || !validateMediaKey(key))
    return new Response("Not found", { status: 404 });
  const object = await env.VEHICLE_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const widthValue = url.searchParams.get("w");
  const formatValue = url.searchParams.get("format");
  const qualityValue = url.searchParams.get("q");
  const width = widthValue ? Number(widthValue) : undefined;
  if (widthValue && (!Number.isInteger(width) || !WIDTHS.has(width as number)))
    return new Response("Unsupported image width", { status: 400 });
  const format = formatValue
    ? formatValue === "avif" || formatValue === "jpeg" || formatValue === "webp"
      ? formatValue
      : null
    : "webp";
  if (!format) return new Response("Unsupported image format", { status: 400 });
  const quality = qualityValue ? Number(qualityValue) : 82;
  if (!Number.isInteger(quality) || quality < 40 || quality > 95)
    return new Response("Unsupported image quality", { status: 400 });
  const transformWidth = width ?? (formatValue ? 2048 : undefined);
  if (env.IMAGES && transformWidth && WIDTHS.has(transformWidth)) {
    try {
      const transformed = await env.IMAGES.input(
        object.body as unknown as Parameters<ImagesBinding["input"]>[0],
      )
        .transform({ width: transformWidth })
        .output({ format: OUTPUT_MIME[format], quality });
      const result = transformed.response();
      const headers = new Headers(result.headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Vary", "Accept");
      return new Response(result.body as unknown as BodyInit, {
        status: result.status,
        headers,
      });
    } catch (error) {
      // Serving the original is a safe fallback (local dev, Images outage), but a
      // silent one would hide a misconfigured binding behind multi-megabyte originals.
      console.warn(
        "image transform failed; serving original",
        error instanceof Error ? error.name : "unknown",
      );
    }
  }
  const fallbackObject = env.IMAGES
    ? await env.VEHICLE_IMAGES.get(key)
    : object;
  if (!fallbackObject) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  headers.set(
    "Content-Type",
    fallbackObject.httpMetadata?.contentType ?? "application/octet-stream",
  );
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (fallbackObject.httpEtag) headers.set("ETag", fallbackObject.httpEtag);
  return new Response(fallbackObject.body, { status: 200, headers });
}

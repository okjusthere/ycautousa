import type { D1Like } from "../lib/db";
import type {
  ImageOutputOptions,
  ImagesBinding,
} from "@cloudflare/workers-types";

export type R2ObjectLike = {
  body: ReadableStream<Uint8Array>;
  httpEtag?: string;
  httpMetadata?: { contentType?: string; cacheControl?: string };
  size?: number;
  uploaded?: Date;
};

export type R2BucketLike = {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
  list?(
    options?: Record<string, unknown>,
  ): Promise<{ objects: Array<{ key: string; size?: number }> }>;
};

/** Output MIME types the media route is allowed to request from the Images binding. */
export type ImageOutputMime = Extract<
  ImageOutputOptions["format"],
  "image/webp" | "image/avif" | "image/jpeg"
>;

/**
 * Narrow view of the Cloudflare Images binding used by this app. The transform
 * handle and its output method come directly from the official Workers type so a
 * hand-written signature cannot drift from the runtime API again.
 */
export type ImagesBindingLike = Pick<ImagesBinding, "input">;

export type EmailBindingLike = {
  send(message: {
    from: string;
    to: string | string[];
    subject: string;
    text: string;
    html?: string;
  }): Promise<void>;
};

export type Env = {
  DB: D1Like;
  VEHICLE_IMAGES?: R2BucketLike;
  IMAGES?: ImagesBindingLike;
  EMAIL?: EmailBindingLike;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  APP_ORIGIN?: string;
  CANONICAL_HOST?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ADMIN_EMAILS?: string;
  DEV_ADMIN_EMAIL?: string;
  EMAIL_FROM?: string;
  EMAIL_TO?: string;
  IP_HASH_SALT?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD_TAG?: string;
  ENVIRONMENT?: string;
};

export type ExecutionContextLike =
  | Pick<ExecutionContext, "waitUntil">
  | { waitUntil(promise: Promise<unknown>): void };

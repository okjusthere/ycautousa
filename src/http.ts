export const REQUEST_TIMEOUT_MS = 15_000;
export type RequestOptions = RequestInit & { timeoutMs?: number };

export type ApiErrorCode =
  | "network"
  | "timeout"
  | "aborted"
  | "invalid_response"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "invalid_request"
  | "conflict"
  | "server_error";

const messages: Record<ApiErrorCode, string> = {
  network: "Unable to connect. Check your connection and try again.",
  timeout: "The request took too long. Please try again.",
  aborted: "The request was cancelled.",
  invalid_response:
    "This information is temporarily unavailable. Please try again.",
  unauthorized: "Your session has expired. Please sign in again.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "The requested item could not be found.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  invalid_request: "Please check the form fields and try again.",
  conflict:
    "This change could not be completed. Refresh the page and try again.",
  server_error: "The service is temporarily unavailable. Please try again.",
};

// Only application-owned, actionable validation text is safe to show verbatim.
// Proxy responses, stack traces, and arbitrary server details never reach the UI.
const safeApiMessages = new Set([
  "Please check the form fields and try again.",
  "Please check the vehicle fields.",
  "Please check the settings fields.",
  "Verification failed. Please try again.",
  "Please complete the verification and try again.",
  "That vehicle is no longer available.",
  "That VIN is already in inventory.",
  "That status change is not allowed.",
  "Enter a valid 17-character VIN before decoding.",
  "Image order does not match this vehicle.",
  "This submission key was already used for different form details.",
  "Notification email must match the verified recipient configured for this deployment.",
  "Check the mailbox first, then confirm that a resend is needed.",
  "Retry is unavailable: this email is queued, already sent, or was attempted within the last minute.",
  "Email service is not configured. Please contact the site administrator.",
]);

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status?: number,
    safeMessage?: string,
  ) {
    super(safeMessage ?? messages[code]);
    this.name = "ApiError";
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "not_found";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function statusCode(status: number): ApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  return status >= 500 ? "server_error" : "invalid_request";
}

export async function requestJson<T>(
  path: string,
  options: RequestOptions = {},
  validate?: (value: unknown) => boolean,
): Promise<T> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...init } = options;
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timedOut = false;
  const abort = () => controller.abort();
  if (callerSignal?.aborted) throw new ApiError("aborted");
  callerSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (typeof init.body === "string" && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  try {
    const response = await fetch(path, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = /^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(
      contentType,
    );
    let data: unknown;
    if (isJson) {
      try {
        data = await response.json();
      } catch {
        if (controller.signal.aborted)
          throw new ApiError(timedOut ? "timeout" : "aborted");
        if (response.ok)
          throw new ApiError("invalid_response", response.status);
      }
    }
    if (!response.ok) {
      const validationMessage =
        isRecord(data) &&
        typeof data.error === "string" &&
        safeApiMessages.has(data.error)
          ? data.error
          : undefined;
      throw new ApiError(
        statusCode(response.status),
        response.status,
        validationMessage,
      );
    }
    // Access may redirect an expired admin session to an HTML login page.
    if (path.startsWith("/api/admin/") && response.redirected && !isJson)
      throw new ApiError("unauthorized", 401);
    if (!isJson || !isRecord(data) || (validate && !validate(data)))
      throw new ApiError("invalid_response", response.status);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError("timeout");
    if (callerSignal?.aborted) throw new ApiError("aborted");
    throw new ApiError("network");
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
  }
}

export type TurnstileResult = {
  success: boolean;
  hostname?: string;
  action?: string;
  errorCodes?: string[];
};

export async function verifyTurnstile(
  token: string,
  secret: string | undefined,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  if (!secret) return { success: false, errorCodes: ["missing-secret"] };
  if (!token || token.length > 4096)
    return { success: false, errorCodes: ["invalid-input-response"] };
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const response = await fetchImpl(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body, headers: { accept: "application/json" } },
    );
    if (!response.ok)
      return { success: false, errorCodes: ["siteverify-unavailable"] };
    const result = (await response.json()) as TurnstileResult;
    return {
      success: result.success === true,
      hostname: result.hostname,
      action: result.action,
      errorCodes: result.errorCodes,
    };
  } catch {
    return { success: false, errorCodes: ["siteverify-unavailable"] };
  }
}

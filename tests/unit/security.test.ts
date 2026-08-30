import { describe, expect, it } from "vitest";
import { isAdminRequest, verifyAccessJwt } from "../../workers/security";
import type { Env } from "../../workers/env";

function base64Url(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createAccessToken(
  privateKey: CryptoKey,
  payload: Record<string, unknown>,
  kid = "access-key-1",
): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const input = `${header}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

async function accessKeyFixture() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = (await crypto.subtle.exportKey(
    "jwk",
    keyPair.publicKey,
  )) as JsonWebKey & { kid?: string; alg?: string; use?: string };
  jwk.kid = "access-key-1";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { keyPair, jwk };
}

function productionEnv(teamDomain: string): Env {
  return {
    DB: {} as Env["DB"],
    APP_ORIGIN: "https://www.ycautousa.com",
    CANONICAL_HOST: "www.ycautousa.com",
    ACCESS_TEAM_DOMAIN: teamDomain,
    ACCESS_AUD_TAG: "yc-auto-admin-aud",
    ADMIN_EMAILS: "admin@example.com",
  };
}

describe("Cloudflare Access JWT verification", () => {
  it("accepts a signed token with the pinned issuer and audience", async () => {
    const { keyPair, jwk } = await accessKeyFixture();
    const teamDomain = "https://yc-auto-test.cloudflareaccess.com";
    const env = productionEnv(teamDomain);
    const now = Math.floor(Date.now() / 1000);
    const token = await createAccessToken(keyPair.privateKey, {
      iss: teamDomain,
      aud: ["yc-auto-admin-aud"],
      email: "Admin@Example.com",
      iat: now,
      exp: now + 300,
    });
    let fetchCount = 0;
    const fetchImpl: typeof fetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { "Content-Type": "application/json" },
      });
    };

    await expect(verifyAccessJwt(token, env, fetchImpl)).resolves.toBe(
      "admin@example.com",
    );
    const request = new Request("https://www.ycautousa.com/admin", {
      headers: { "CF-Access-Jwt-Assertion": token },
    });
    await expect(isAdminRequest(request, env, fetchImpl)).resolves.toEqual({
      ok: true,
      email: "admin@example.com",
    });
    expect(fetchCount).toBe(1);
  });

  it("rejects a forged payload even when the direct identity header is present", async () => {
    const { keyPair, jwk } = await accessKeyFixture();
    const teamDomain = "https://yc-auto-forged.cloudflareaccess.com";
    const env = productionEnv(teamDomain);
    const signedToken = await createAccessToken(keyPair.privateKey, {
      iss: teamDomain,
      aud: ["yc-auto-admin-aud"],
      email: "admin@example.com",
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const [header, , signature] = signedToken.split(".");
    const forgedPayload = base64Url(
      JSON.stringify({
        iss: teamDomain,
        aud: ["yc-auto-admin-aud"],
        email: "attacker@example.com",
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    );
    const request = new Request("https://www.ycautousa.com/admin", {
      headers: {
        "CF-Access-Jwt-Assertion": `${header}.${forgedPayload}.${signature}`,
        "CF-Access-Authenticated-User-Email": "admin@example.com",
      },
    });

    await expect(
      isAdminRequest(
        request,
        env,
        async () => new Response(JSON.stringify({ keys: [jwk] })),
      ),
    ).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("rejects a validly signed token for another Access application", async () => {
    const { keyPair, jwk } = await accessKeyFixture();
    const teamDomain = "https://yc-auto-audience.cloudflareaccess.com";
    const env = productionEnv(teamDomain);
    const token = await createAccessToken(keyPair.privateKey, {
      iss: teamDomain,
      aud: ["another-application-aud"],
      email: "admin@example.com",
      exp: Math.floor(Date.now() / 1000) + 300,
    });

    await expect(
      verifyAccessJwt(
        token,
        env,
        async () => new Response(JSON.stringify({ keys: [jwk] })),
      ),
    ).resolves.toBeNull();
  });
});

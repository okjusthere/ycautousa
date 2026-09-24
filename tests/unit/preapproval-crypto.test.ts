import { describe, expect, it } from "vitest";
import {
  PREAPPROVAL_CONSENT_VERSION,
  type PreapprovalStoredData,
} from "../../lib/preapproval";
import {
  decryptPreapproval,
  encryptPreapproval,
  preapprovalFingerprint,
} from "../../workers/preapproval-crypto";

// Fixed test keys and fictitious identity are used only by the local test runner.
const v1 = Buffer.alloc(32, 7).toString("base64");
const v2 = Buffer.alloc(32, 13).toString("base64");
const env = {
  PREAPPROVAL_KEYS: JSON.stringify({ activeKeyId: "v1", keys: { v1 } }),
};
const rotated = {
  PREAPPROVAL_KEYS: JSON.stringify({ activeKeyId: "v2", keys: { v1, v2 } }),
};
const application: PreapprovalStoredData = {
  name: "Synthetic Applicant",
  phone: "2125550187",
  email: "synthetic-identity@example.invalid",
  ssn: "123456789",
  addressLine1: "104 Synthetic Avenue",
  addressLine2: "Test Unit 42",
  city: "Flushing",
  state: "NY",
  postalCode: "11358",
  residenceYears: 3,
  residenceMonths: 4,
  consent: true,
  consentVersion: PREAPPROVAL_CONSENT_VERSION,
  submittedAt: "2026-09-24T12:00:00.000Z",
};
const leadId = "synthetic-lead-a";
const unavailable = "Secure application storage is unavailable";

describe("Preapproval authenticated encryption", () => {
  it("round-trips the complete application with fresh IVs and no readable identity in the envelope", async () => {
    const first = await encryptPreapproval(env, application, leadId);
    const second = await encryptPreapproval(env, application, leadId);
    const a = JSON.parse(first);
    const b = JSON.parse(second);
    expect(a).toMatchObject({
      version: 1,
      keyId: "v1",
      iv: expect.any(String),
      ciphertext: expect.any(String),
    });
    expect(Buffer.from(a.iv, "base64")).toHaveLength(12);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    for (const plaintext of [
      application.ssn,
      application.name,
      application.phone,
      application.email,
      application.addressLine1,
    ])
      expect(first).not.toContain(plaintext);
    expect(await decryptPreapproval(env, first, leadId)).toEqual(application);
    expect(await decryptPreapproval(env, second, leadId)).toEqual(application);
  });

  it("rejects a ciphertext copied to another lead and modified ciphertext, IV, or envelope version", async () => {
    const ciphertext = await encryptPreapproval(env, application, leadId);
    await expect(
      decryptPreapproval(env, ciphertext, "synthetic-lead-b"),
    ).rejects.toThrow(unavailable);
    const original = JSON.parse(ciphertext);
    const alteredBytes = Buffer.from(original.ciphertext, "base64");
    alteredBytes[0] ^= 1;
    for (const altered of [
      { ...original, ciphertext: alteredBytes.toString("base64") },
      { ...original, iv: Buffer.alloc(12).toString("base64") },
      { ...original, iv: Buffer.alloc(11).toString("base64") },
      { ...original, version: 2 },
      { ...original, keyId: "unavailable" },
    ])
      await expect(
        decryptPreapproval(env, JSON.stringify(altered), leadId),
      ).rejects.toThrow(unavailable);
  });

  it("continues decrypting the old key after rotation while new envelopes use the active key", async () => {
    const old = await encryptPreapproval(env, application, leadId);
    expect(await decryptPreapproval(rotated, old, leadId)).toEqual(application);
    const current = await encryptPreapproval(rotated, application, leadId);
    expect(JSON.parse(current).keyId).toBe("v2");
    expect(await decryptPreapproval(rotated, current, leadId)).toEqual(
      application,
    );
    await expect(decryptPreapproval(env, current, leadId)).rejects.toThrow(
      unavailable,
    );
    const removed = {
      PREAPPROVAL_KEYS: JSON.stringify({ activeKeyId: "v2", keys: { v2 } }),
    };
    await expect(decryptPreapproval(removed, old, leadId)).rejects.toThrow(
      unavailable,
    );
  });

  it("fails closed with a generic error for missing, malformed, or incorrectly sized keys", async () => {
    const ciphertext = await encryptPreapproval(env, application, leadId);
    for (const PREAPPROVAL_KEYS of [
      undefined,
      "not-json",
      JSON.stringify({ activeKeyId: "v1", keys: {} }),
      JSON.stringify({ activeKeyId: "v1", keys: { v1: "invalid base64!" } }),
      JSON.stringify({
        activeKeyId: "v1",
        keys: { v1: Buffer.alloc(31).toString("base64") },
      }),
    ]) {
      await expect(
        encryptPreapproval({ PREAPPROVAL_KEYS }, application, leadId),
      ).rejects.toThrow(unavailable);
      await expect(
        decryptPreapproval({ PREAPPROVAL_KEYS }, ciphertext, leadId),
      ).rejects.toThrow(unavailable);
      await expect(
        preapprovalFingerprint(
          { PREAPPROVAL_KEYS },
          JSON.stringify(application),
        ),
      ).rejects.toThrow(unavailable);
    }
  });

  it("uses keyed, payload-sensitive fingerprints and preserves an existing fingerprint during key rotation", async () => {
    const payload = JSON.stringify(application);
    const original = await preapprovalFingerprint(env, payload);
    expect(original).toMatch(/^pa1:v1:[a-f0-9]{64}$/);
    expect(original).not.toContain(application.ssn);
    expect(await preapprovalFingerprint(env, payload)).toBe(original);
    expect(await preapprovalFingerprint(env, `${payload} `)).not.toBe(original);
    expect(await preapprovalFingerprint(rotated, payload)).toMatch(
      /^pa1:v2:[a-f0-9]{64}$/,
    );
    expect(await preapprovalFingerprint(rotated, payload)).not.toBe(original);
    expect(await preapprovalFingerprint(rotated, payload, original)).toBe(
      original,
    );
    const replacedKey = {
      PREAPPROVAL_KEYS: JSON.stringify({ activeKeyId: "v1", keys: { v1: v2 } }),
    };
    expect(await preapprovalFingerprint(replacedKey, payload)).not.toBe(
      original,
    );
    for (const invalid of [
      "unkeyed-sha256",
      "pa1:v1:short",
      `pa1:missing:${"0".repeat(64)}`,
    ])
      await expect(
        preapprovalFingerprint(env, payload, invalid),
      ).rejects.toThrow(unavailable);
  });
});

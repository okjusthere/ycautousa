import { z } from "zod";
import {
  preapprovalStoredDataSchema,
  type PreapprovalStoredData,
} from "../lib/preapproval";
import type { Env } from "./env";

const keyIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const keyringSchema = z
  .object({
    activeKeyId: keyIdSchema,
    keys: z.record(keyIdSchema, z.string().min(1).max(64)),
  })
  .strict();
const envelopeSchema = z
  .object({
    version: z.literal(1),
    keyId: keyIdSchema,
    iv: z.string().max(24),
    ciphertext: z.string().min(1).max(20_000),
  })
  .strict();
const encoder = new TextEncoder();

/** Deliberately generic: neither configuration nor customer data enters logs. */
export class PreapprovalCryptoError extends Error {
  constructor() {
    super("Secure application storage is unavailable");
    this.name = "PreapprovalCryptoError";
  }
}

function decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function encode(value: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}
function keyring(env: Pick<Env, "PREAPPROVAL_KEYS">) {
  const result = keyringSchema.parse(JSON.parse(env.PREAPPROVAL_KEYS ?? ""));
  if (!Object.hasOwn(result.keys, result.activeKeyId))
    throw new PreapprovalCryptoError();
  return result;
}
async function deriveKey(
  env: Pick<Env, "PREAPPROVAL_KEYS">,
  keyId: string,
  purpose: "encryption" | "fingerprint",
) {
  const encoded = keyring(env).keys[keyId];
  if (!encoded) throw new PreapprovalCryptoError();
  const raw = decode(encoded);
  if (raw.byteLength !== 32) throw new PreapprovalCryptoError();
  const master = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("yc-auto-preapproval-v1"),
      info: encoder.encode(purpose),
    },
    master,
    purpose === "encryption"
      ? { name: "AES-GCM", length: 256 }
      : { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    purpose === "encryption" ? ["encrypt", "decrypt"] : ["sign"],
  );
}

export async function encryptPreapproval(
  env: Pick<Env, "PREAPPROVAL_KEYS">,
  payload: PreapprovalStoredData,
  leadId: string,
): Promise<string> {
  try {
    const data = preapprovalStoredDataSchema.parse(payload);
    const { activeKeyId } = keyring(env);
    const key = await deriveKey(env, activeKeyId, "encryption");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encoder.encode(`yc-auto:preapproval:v1:${leadId}`),
      },
      key,
      encoder.encode(JSON.stringify(data)),
    );
    return JSON.stringify({
      version: 1,
      keyId: activeKeyId,
      iv: encode(iv),
      ciphertext: encode(ciphertext),
    });
  } catch {
    throw new PreapprovalCryptoError();
  }
}

export async function decryptPreapproval(
  env: Pick<Env, "PREAPPROVAL_KEYS">,
  ciphertext: string,
  leadId: string,
): Promise<PreapprovalStoredData> {
  try {
    const envelope = envelopeSchema.parse(JSON.parse(ciphertext));
    const iv = decode(envelope.iv);
    if (iv.byteLength !== 12) throw new PreapprovalCryptoError();
    const key = await deriveKey(env, envelope.keyId, "encryption");
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encoder.encode(`yc-auto:preapproval:v1:${leadId}`),
      },
      key,
      decode(envelope.ciphertext),
    );
    return preapprovalStoredDataSchema.parse(
      JSON.parse(new TextDecoder().decode(plain)),
    );
  } catch {
    throw new PreapprovalCryptoError();
  }
}

/** HMAC prevents offline guessing of SSNs from an exposed idempotency digest. */
export async function preapprovalFingerprint(
  env: Pick<Env, "PREAPPROVAL_KEYS">,
  fingerprint: string,
  existingHash?: string,
): Promise<string> {
  try {
    const ring = keyring(env);
    const existing = existingHash?.match(
      /^pa1:([A-Za-z0-9_-]{1,40}):[a-f0-9]{64}$/,
    );
    if (existingHash && !existing) throw new PreapprovalCryptoError();
    const keyId = existing?.[1] ?? ring.activeKeyId;
    const key = await deriveKey(env, keyId, "fingerprint");
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(fingerprint),
    );
    const hash = Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `pa1:${keyId}:${hash}`;
  } catch {
    throw new PreapprovalCryptoError();
  }
}

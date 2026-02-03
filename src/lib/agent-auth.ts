import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_LEN = 16;
const KEY_LEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

/** Generate a new private key (secret) for an agent. Return hex string. */
export function generatePrivateKey(): string {
  return randomBytes(32).toString("hex");
}

/** Hash a private key for storage. Returns "salt:hash" hex strings. */
export function hashPrivateKey(privateKey: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(privateKey, salt, KEY_LEN, SCRYPT_OPTS);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Verify that the given private key matches the stored salt:hash. */
export function verifyPrivateKey(privateKey: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(privateKey, salt, KEY_LEN, SCRYPT_OPTS);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Username: 3–32 chars, alphanumeric and underscore only. Normalize to lowercase for uniqueness. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): { ok: boolean; error?: string } {
  const n = username.trim();
  if (n.length < USERNAME_MIN) return { ok: false, error: `Username must be at least ${USERNAME_MIN} characters.` };
  if (n.length > USERNAME_MAX) return { ok: false, error: `Username must be at most ${USERNAME_MAX} characters.` };
  if (!USERNAME_REGEX.test(n)) return { ok: false, error: "Username can only contain letters, numbers, and underscores." };
  return { ok: true };
}

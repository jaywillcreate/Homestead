import crypto from "crypto";

/**
 * Password hashing (scrypt, Node built-in — no dependency) and one-time
 * link tokens. Tokens are random 256-bit values; only their SHA-256 is stored,
 * so a database leak does not expose usable invite / reset links or sessions.
 */

const KEYLEN = 64;
const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEYLEN) return false;
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), KEYLEN, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

/** A valid hash of a random value — verified against when the account doesn't exist, to keep timing even. */
export const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString("hex"));

export const MIN_PASSWORD = 10;

/** Returns a human-readable problem, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`;
  if (password.length > 200) return "That password is too long";
  if (/^(.)\1+$/.test(password)) return "Pick something less repetitive";
  return null;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** New one-time token: `raw` goes in the link, `hash` goes in the database. */
export function newToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: sha256(raw) };
}

/** How long invite and reset links stay valid. */
export const LINK_TTL_DAYS = 7;

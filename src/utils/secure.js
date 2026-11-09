import { createHash, timingSafeEqual } from "node:crypto";

const sha256 = (value) => createHash("sha256").update(String(value)).digest();

// Compares secrets in constant time, whatever their lengths
export function safeEqual(a, b) {
  return timingSafeEqual(sha256(a), sha256(b));
}

// Short fingerprint: stored in the JWT so changing ADMIN_PASSWORD in .env logs out old sessions
export function fingerprint(value) {
  return sha256(value).toString("hex").slice(0, 16);
}

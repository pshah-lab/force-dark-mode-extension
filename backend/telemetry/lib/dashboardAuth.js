// Token check for the private owner dashboard (token sent in a POST body, never a header). Fails closed: a missing or short configured
// token authorizes nobody. Both sides are hashed first so the comparison is constant-time and
// length-independent.
import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_TOKEN_LENGTH = 32;
const sha = (s) => createHash("sha256").update(String(s)).digest();

export function isAuthorized(candidate, token) {
  if (typeof token !== "string" || token.length < MIN_TOKEN_LENGTH) return false;
  if (typeof candidate !== "string") return false;
  return timingSafeEqual(sha(candidate), sha(token));
}

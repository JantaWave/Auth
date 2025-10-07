import {
  argon2HashWithPepper,
  argon2VerifyWithPepper,
  hmacSHA256,
  safeCompare,
} from "./crypto.js";

/**
 * Hash MPIN using Argon2 + pepper
 */
export async function hashMpin(mpin) {
  return await argon2HashWithPepper(mpin);
}

/**
 * Verify MPIN
 */
export async function verifyMpin(hashedMpin, plainMpin) {
  return await argon2VerifyWithPepper(hashedMpin, plainMpin);
}

/**
 * Hash refresh token using HMAC-SHA256 (fast and simple)
 */
export function hashToken(token) {
  return hmacSHA256(token);
}

/**
 * Verify refresh token using constant-time comparison
 */
export function verifyToken(hashedToken, plainToken) {
  const inputHash = hmacSHA256(plainToken);
  return safeCompare(hashedToken, inputHash);
}

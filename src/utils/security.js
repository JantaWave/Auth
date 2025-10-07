import {
  argon2HashWithPepper,
  argon2VerifyWithPepper,
  hmacSHA256,
  safeCompare,
} from "./crypto.js";

/**
 * Hash MPIN using Argon2 + pepper
 * @param {String} mpin - Plain MPIN
 * @returns {Promise<String>} Hashed MPIN
 */
export async function hashMpin(mpin) {
  return await argon2HashWithPepper(mpin);
}

/**
 * Verify MPIN against hash
 * @param {String} hashedMpin - Hashed MPIN from database
 * @param {String} plainMpin - Plain MPIN from user input
 * @returns {Promise<Boolean>} True if valid
 */
export async function verifyMpin(hashedMpin, plainMpin) {
  return await argon2VerifyWithPepper(hashedMpin, plainMpin);
}

/**
 * Hash refresh token using HMAC-SHA256 (fast and simple)
 * @param {String} token - Plain refresh token
 * @returns {String} Hashed token
 */
export function hashToken(token) {
  return hmacSHA256(token);
}

/**
 * Verify refresh token using constant-time comparison
 * @param {String} hashedToken - Hashed token from database
 * @param {String} plainToken - Plain token from client
 * @returns {Boolean} True if valid
 */
export function verifyToken(hashedToken, plainToken) {
  const inputHash = hmacSHA256(plainToken);
  return safeCompare(hashedToken, inputHash);
}

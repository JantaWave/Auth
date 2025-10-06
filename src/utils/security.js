import argon2 from "argon2";

/**
 * Hash the user's MPIN using Argon2id
 * @param {string} mpin - The user's raw MPIN (4 or 6 digits typically)
 * @returns {Promise<string>} - The hashed MPIN
 */
export async function hashMpin(mpin) {
  try {
    return await argon2.hash(mpin, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3, // number of iterations
      parallelism: 1,
    });
  } catch (error) {
    console.error("Error hashing MPIN:", error);
    throw new Error("Failed to hash MPIN");
  }
}

/**
 * Verify MPIN with the stored hash
 * @param {string} hashedMpin - Stored Argon2 hash
 * @param {string} plainMpin - MPIN entered by user
 * @returns {Promise<boolean>}
 */
export async function verifyMpin(hashedMpin, plainMpin) {
  try {
    return await argon2.verify(hashedMpin, plainMpin);
  } catch (error) {
    console.error("Error verifying MPIN:", error);
    return false;
  }
}

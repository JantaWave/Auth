import argon2 from "argon2";
import dotenv from "dotenv";
dotenv.config();

const pepper = process.env.PEPPER;
/**
 * Hash MPIN (4-digit secure PIN)
 */
export async function hashMpin(mpin) {
  try {
    const pepperedMPIN = `${mpin}${pepper}`;
    return await argon2.hash(pepperedMPIN, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64MB
      timeCost: 3,
      parallelism: 1,
    });
  } catch (err) {
    console.error("❌ Error hashing MPIN:", err);
    throw new Error("Failed to hash MPIN");
  }
}

/**
 * Verify MPIN
 */
export async function verifyMpin(hashedMpin, plainMpin) {
  try {
    const pepperedMPIN = `${plainMpin}${pepper}`;
    return await argon2.verify(hashedMpin, pepperedMPIN);
  } catch (err) {
    console.error("❌ Error verifying MPIN:", err);
    return false;
  }
}

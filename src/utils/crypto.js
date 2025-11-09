import crypto from "crypto";
import argon2 from "argon2";
import dotenv from "dotenv";

dotenv.config();

const PEPPER = process.env.PEPPER || "default_jantawave_secret";

/**
 * Create a secure HMAC-SHA256 hash
 */
export function hmacSHA256(data, secret = PEPPER) {
  console.log("secret", secret);
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Constant-time equality check
 */
export function safeCompare(a, b) {
  try {
    console.log("safeCompare input a:", a);
    console.log("safeCompare input b:", b);
    console.log("a type:", typeof a, "b type:", typeof b);

    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");

    console.log("bufA length:", bufA.length, "bufB length:", bufB.length);

    if (bufA.length !== bufB.length) {
      console.log("Buffer lengths don't match");
      return false;
    }

    const result = crypto.timingSafeEqual(bufA, bufB);
    console.log("timingSafeEqual result:", result);
    return result;
  } catch (err) {
    console.log("safeCompare error:", err);
    return false;
  }
}

/**
 * Generate a secure random number of given length
 */
export function generateNumericCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return crypto.randomInt(min, max).toString();
}

/**
 * Argon2 hash with pepper (for MPIN)
 */
export async function argon2HashWithPepper(value) {
  const peppered = `${value}${PEPPER}`;
  return await argon2.hash(peppered, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * Argon2 verify with pepper
 */
export async function argon2VerifyWithPepper(hashed, plain) {
  const peppered = `${plain}${PEPPER}`;
  return await argon2.verify(hashed, peppered);
}

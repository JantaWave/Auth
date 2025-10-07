import redisClient from "../config/redisClient.js";
import dotenv from "dotenv";
import { hmacSHA256, safeCompare, generateNumericCode } from "./cryptoUtils.js";

dotenv.config();

const OTP_TTL_SECONDS = parseInt(process.env.OTP_EXPIRY_SECONDS || "300", 10);
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || "5", 10);
const OTP_COOLDOWN_SECONDS = parseInt(
  process.env.OTP_COOLDOWN_SECONDS || "60",
  10,
);

/** Rate limiting helpers */
async function isRateLimited(key) {
  const attempts = await redisClient.get(`otp:attempts:${key}`);
  return attempts && parseInt(attempts) >= MAX_ATTEMPTS;
}

async function incrementAttempts(key) {
  const attemptsKey = `otp:attempts:${key}`;
  const current = await redisClient.incr(attemptsKey);
  if (current === 1) await redisClient.expire(attemptsKey, OTP_TTL_SECONDS);
}

/** Store hashed OTP in Redis */
async function storeOtp(key, otp, ttl = OTP_TTL_SECONDS) {
  const hashed = hmacSHA256(otp);
  await redisClient.setEx(`otp:${key}`, ttl, hashed);
  return { otp, expiresIn: ttl };
}

/** Verify OTP correctness */
export async function verifyOtp(key, userInputOtp) {
  try {
    if (await isRateLimited(key))
      return { success: false, reason: "too_many_attempts" };

    const storedHash = await redisClient.get(`otp:${key}`);
    if (!storedHash) return { success: false, reason: "expired_or_not_found" };

    const inputHash = hmacSHA256(userInputOtp);
    const isMatch = safeCompare(storedHash, inputHash);

    if (isMatch) {
      await redisClient.del(`otp:${key}`);
      await redisClient.del(`otp:attempts:${key}`);
      return { success: true };
    }

    await incrementAttempts(key);
    return { success: false, reason: "invalid_otp" };
  } catch (err) {
    console.error("OTP verification error:", err);
    return { success: false, reason: "system_error" };
  }
}

/** Generate + store new OTP with cooldown */
export async function createAndStoreOtp(key) {
  const last = await redisClient.get(`otp:last:${key}`);
  if (last) throw new Error("Please wait before requesting a new OTP");

  const otp = generateNumericCode();
  await storeOtp(key, otp);

  await redisClient.setEx(
    `otp:last:${key}`,
    OTP_COOLDOWN_SECONDS,
    Date.now().toString(),
  );
  return otp;
}

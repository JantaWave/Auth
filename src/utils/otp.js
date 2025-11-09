import redisClient from "../config/redis.js";
import dotenv from "dotenv";
import { hmacSHA256, safeCompare, generateNumericCode } from "./crypto.js";
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
  if (current === 1)
    await redisClient.expire(attemptsKey, OTP_TTL_SECONDS + 30);
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
    if (await isRateLimited(key)) {
      console.log("Rate limited");
      return { success: false, reason: "too_many_attempts" };
    }

    const storedHash = await redisClient.get(`otp:${key}`);
    console.log("storedHash from Redis:", storedHash);

    if (!storedHash) {
      console.log("No stored hash found");
      return { success: false, reason: "expired_or_not_found" };
    }

    console.log("User input OTP:", userInputOtp);
    const inputHash = hmacSHA256(userInputOtp);
    console.log("stored in redis:", storedHash);
    console.log("Input otp hash:", inputHash);

    const isMatch = safeCompare(storedHash, inputHash);
    console.log("isMatch result:", isMatch); // ⭐ ADD THIS

    if (isMatch) {
      console.log("OTP matched - deleting keys");
      await redisClient.del(`otp:${key}`);
      await redisClient.del(`otp:attempts:${key}`);
      return { success: true };
    }

    console.log("OTP did not match - incrementing attempts");
    await incrementAttempts(key);
    return { success: false, reason: "invalid_otp" };
  } catch (err) {
    console.error("OTP verification error:", err);
    return { success: false, reason: "system_error" };
  }
}

/** Generate + store new OTP with cooldown */
export async function createAndStoreOtp(key) {
  const last = await redisClient.get(`otp:last:${key}`); // Fixed
  if (last) {
    return { success: false, reason: "cooldown_active" };
  }

  const otp =
    process.env.NODE_ENV === "production"
      ? generateNumericCode()
      : process.env.OTP;

  await storeOtp(key, otp);
  await redisClient.setEx(
    `otp:last:${key}`,
    OTP_COOLDOWN_SECONDS,
    Date.now().toString(),
  );

  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEBUG] OTP for ${key}: ${otp}`); // Fixed
  }

  return { success: true, otp, expiresIn: OTP_TTL_SECONDS };
}

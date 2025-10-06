import crypto from "crypto";
import redisClient from "../config/redisClient.js";
import dotenv from "dotenv";
dotenv.config();

const OTP_TTL_SECONDS = parseInt(process.env.OTP_EXPIRY_SECONDS || "300", 10); // 5 mins
const OTP_SECRET = process.env.PEPPER || "supersecretkey"; // never expose this
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || "5", 10);
const OTP_COOLDOWN_SECONDS = parseInt(
  process.env.OTP_COOLDOWN_SECONDS || "60",
  10,
);

/**
 * Generate a 6-digit OTP (customizable)
 */
function generateOtp(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return crypto.randomInt(min, max).toString();
}

/**
 * Hash OTP using HMAC SHA256
 */
function hashOtp(otp) {
  return crypto.createHmac("sha256", OTP_SECRET).update(otp).digest("hex");
}

/**
 * Check if OTP attempt limit exceeded
 */
async function isRateLimited(key) {
  const attempts = await redisClient.get(`otp:attempts:${key}`);
  return attempts && parseInt(attempts) >= MAX_ATTEMPTS;
}

/**
 * Increment failed OTP attempts and set TTL
 */
async function incrementAttempts(key) {
  const attemptsKey = `otp:attempts:${key}`;
  const current = await redisClient.incr(attemptsKey);
  if (current === 1) {
    await redisClient.expire(attemptsKey, OTP_TTL_SECONDS);
  }
}

/**
 * Store OTP hash in Redis with TTL
 */
async function storeOtp(key, otp, ttlSeconds = OTP_TTL_SECONDS) {
  try {
    const hashedOtp = hashOtp(otp);
    await redisClient.setEx(`otp:${key}`, ttlSeconds, hashedOtp);
    return { otp, expiresIn: ttlSeconds }; // plain OTP returned for SMS/email
  } catch (err) {
    console.error("Redis store error:", err);
    throw new Error("Failed to store OTP");
  }
}

/**
 * Verify OTP correctness and rate-limit tracking
 */
export async function verifyOtp(key, userInputOtp) {
  try {
    if (await isRateLimited(key)) {
      return { success: false, reason: "too_many_attempts" };
    }

    const storedHashedOtp = await redisClient.get(`otp:${key}`);
    if (!storedHashedOtp) {
      return { success: false, reason: "expired_or_not_found" };
    }

    const inputHash = hashOtp(userInputOtp);
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(storedHashedOtp),
      Buffer.from(inputHash),
    );

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

/**
 * Create + store OTP (with cooldown)
 */
export async function createAndStoreOtp(key, ttlSeconds = OTP_TTL_SECONDS) {
  const lastGenerated = await redisClient.get(`otp:last:${key}`);
  if (lastGenerated) throw new Error("Please wait before requesting a new OTP");

  const otp = generateOtp();
  await storeOtp(key, otp, ttlSeconds);

  await redisClient.setEx(
    `otp:last:${key}`,
    OTP_COOLDOWN_SECONDS,
    Date.now().toString(),
  );
  return otp;
}

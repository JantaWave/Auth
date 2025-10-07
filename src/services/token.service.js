import redisClient from "../config/redis.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import {
  createSession,
  verifySessionRefreshToken,
} from "../services/session.service.js";

/**
 * @desc Blacklist a token (access or refresh) in Redis
 * @param {String} token - JWT token to blacklist
 * @param {String} type - Token type ('access' or 'refresh')
 * @returns {Promise<Boolean>} True if blacklisted successfully
 */
export async function blacklistToken(token, type = "access") {
  const decoded = JSON.parse(
    Buffer.from(token.split(".")[1], "base64").toString(),
  );
  if (!decoded?.exp) return false;

  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redisClient.setEx(`blacklist:${type}:${token}`, ttl, "revoked");
  }
  return true;
}

/**
 * @desc Check if a token is blacklisted
 * @param {String} token - JWT token to check
 * @param {String} type - Token type ('access' or 'refresh')
 * @returns {Promise<Boolean>} True if blacklisted
 */
export async function isTokenBlacklisted(token, type = "access") {
  return (await redisClient.exists(`blacklist:${type}:${token}`)) === 1;
}

/**
 * @desc Rotate refresh token and update session
 * @param {String} oldToken - Old refresh token
 * @param {Object} deviceInfo - Device information from middleware
 * @param {String} ip - IP address
 * @returns {Promise<Object>} New tokens or error
 */
export async function rotateRefreshToken(oldToken, deviceInfo = {}, ip = null) {
  // Check if token was already used (replay attack prevention)
  if (await isTokenBlacklisted(oldToken, "refresh")) {
    return { accessToken: null, refreshToken: null, error: "TOKEN_REUSED" };
  }

  try {
    // Verify JWT signature and expiry
    const payload = verifyRefreshToken(oldToken);

    // Verify token matches a stored session hash
    const session = await verifySessionRefreshToken(payload.id, oldToken);
    if (!session) {
      return {
        accessToken: null,
        refreshToken: null,
        error: "INVALID_SESSION",
      };
    }

    // Blacklist old token
    await blacklistToken(oldToken, "refresh");

    // Generate new token pair
    const accessToken = generateAccessToken({
      id: payload.id,
      contact: payload.contact,
    });
    const refreshToken = generateRefreshToken({ id: payload.id });

    // Update session with new refresh token hash
    await createSession(payload.id, refreshToken, deviceInfo, ip);

    return { accessToken, refreshToken, sessionId: session.id, error: null };
  } catch (err) {
    return {
      accessToken: null,
      refreshToken: null,
      error:
        err.name === "TokenExpiredError"
          ? "TOKEN_EXPIRED"
          : "INVALID_REFRESH_TOKEN",
    };
  }
}

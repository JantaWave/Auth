import redisClient from "../config/redis.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import {
  createSession,
  verifySessionRefreshToken,
  updateSession, // ✅ Import updateSession
} from "../services/session.service.js";

/**
 * @desc Blacklist a token (access or refresh) in Redis
 * @param {String} token - JWT token to blacklist
 * @param {String} type - Token type ('access' or 'refresh')
 * @returns {Promise<Boolean>} True if blacklisted successfully
 */
export async function blacklistToken(token, type = "access") {
  try {
    const decoded = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString(),
    );
    if (!decoded?.exp) return false;

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);

    if (ttl > 0) {
      // ✅ Fixed: Use proper template literal
      await redisClient.setEx(`blacklist:${type}:${token}`, ttl, "revoked");
    }
    return true;
  } catch (e) {
    console.error("❌ Failed to blacklist token:", e);
    return false;
  }
}

/**
 * @desc Check if a token is blacklisted
 * @param {String} token - JWT token to check
 * @param {String} type - Token type ('access' or 'refresh')
 * @returns {Promise<Boolean>} True if blacklisted
 */
export async function isTokenBlacklisted(token, type = "access") {
  // ✅ Fixed: Use proper template literal
  return (await redisClient.exists(`blacklist:${type}:${token}`)) === 1;
}

/**
 * @desc Rotate refresh token and update session
 * @param {String} oldToken - Old refresh token
 * @param {String} sessionId - Session ID from request header (optional for web)
 * @param {Object} deviceInfo - Device information from middleware
 * @param {String} ip - IP address
 * @returns {Promise<Object>} New tokens or error
 */
export async function rotateRefreshToken(
  oldToken,
  sessionId = null, // ✅ Add sessionId parameter
  deviceInfo = {},
  ip = null,
) {
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

    // ✅ IMPORTANT: If sessionId is provided (mobile client), validate it matches
    if (sessionId && String(session.id) !== String(sessionId)) {
      return {
        accessToken: null,
        refreshToken: null,
        error: "SESSION_MISMATCH",
      };
    }

    // ✅ Check if session is expired
    if (new Date(session.expires_at) <= new Date()) {
      return {
        accessToken: null,
        refreshToken: null,
        error: "SESSION_EXPIRED",
      };
    }

    // Blacklist old token to prevent reuse
    await blacklistToken(oldToken, "refresh");

    // Generate new token pair
    const accessToken = generateAccessToken({
      id: payload.id,
      contact: payload.contact,
    });
    const refreshToken = generateRefreshToken({ id: payload.id });

    // ✅ Update existing session instead of creating new one
    await updateSession(session.id, refreshToken, deviceInfo, ip);

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      error: null,
    };
  } catch (err) {
    console.error("❌ Token rotation error:", err);
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

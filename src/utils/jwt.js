import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import redisClient from "../config/redis.js";

dotenv.config();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";
const TOKEN_ISSUER = process.env.TOKEN_ISSUER || "JantaWave";
const TOKEN_AUDIENCE = process.env.TOKEN_AUDIENCE || "JantaWave-users";

// Validate environment variables
if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error(
    "Missing required environment variables: ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET",
  );
}

if (ACCESS_TOKEN_SECRET === REFRESH_TOKEN_SECRET) {
  throw new Error(
    "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be different",
  );
}

if (ACCESS_TOKEN_SECRET.length < 32 || REFRESH_TOKEN_SECRET.length < 32) {
  console.warn(
    "⚠️  WARNING: Token secrets should be at least 32 characters for security",
  );
}

/**
 * Generate unique token ID
 * @returns {string} - Unique identifier
 */
function generateTokenId() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Generate access token (short-lived)
 * @param {Object} payload - must contain { id, email, role, ... }
 * @param {Object} options - additional options (expiresIn, issuer, audience, jti)
 * @returns {string} - JWT access token
 */
export function generateAccessToken(payload, options = {}) {
  const tokenPayload = {
    ...payload,
    type: "access",
    iat: Math.floor(Date.now() / 1000),
    jti: options.jti || generateTokenId(),
  };

  return jwt.sign(tokenPayload, ACCESS_TOKEN_SECRET, {
    expiresIn: options.expiresIn || ACCESS_TOKEN_EXPIRY,
    issuer: options.issuer || TOKEN_ISSUER,
    audience: options.audience || TOKEN_AUDIENCE,
  });
}

/**
 * Generate refresh token (long-lived)
 * @param {Object} payload - usually just { id }
 * @param {Object} options - additional options
 * @returns {string} - JWT refresh token
 */
export function generateRefreshToken(payload, options = {}) {
  const tokenPayload = {
    id: payload.id,
    type: "refresh",
    iat: Math.floor(Date.now() / 1000),
    jti: options.jti || generateTokenId(),
  };

  return jwt.sign(tokenPayload, REFRESH_TOKEN_SECRET, {
    expiresIn: options.expiresIn || REFRESH_TOKEN_EXPIRY,
    issuer: options.issuer || TOKEN_ISSUER,
    audience: options.audience || TOKEN_AUDIENCE,
  });
}

/**
 * Verify token with detailed error response
 * @param {string} token - JWT token
 * @param {string} secret - secret key (access or refresh)
 * @returns {Object} - { valid, payload, error }
 */
export function verifyToken(token, secret) {
  try {
    if (!token) {
      return { valid: false, payload: null, error: "NO_TOKEN" };
    }

    const payload = jwt.verify(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    return { valid: true, payload, error: null };
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return { valid: false, payload: null, error: "EXPIRED" };
    }
    if (err.name === "JsonWebTokenError") {
      return { valid: false, payload: null, error: "INVALID" };
    }
    if (err.name === "NotBeforeError") {
      return { valid: false, payload: null, error: "NOT_ACTIVE_YET" };
    }
    return { valid: false, payload: null, error: "VERIFICATION_FAILED" };
  }
}

/**
 * Decode token without verifying signature (⚠️ use only for debugging/logging)
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded payload or null
 */
export function decodeToken(token) {
  return jwt.decode(token);
}

/**
 * Blacklist a token (for logout/revocation)
 * @param {string} token - JWT to blacklist
 * @param {string} type - 'access' or 'refresh'
 * @returns {Promise<boolean>} - true if successfully blacklisted
 */
export async function blacklistToken(token, type = "access") {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return false;

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redisClient.setEx(`blacklist:${type}:${token}`, ttl, "revoked");
      return true;
    }
    return false;
  } catch (err) {
    console.error("Error blacklisting token:", err);
    return false;
  }
}

/**
 * Check if token is blacklisted
 * @param {string} token - JWT to check
 * @param {string} type - 'access' or 'refresh'
 * @returns {Promise<boolean>} - true if blacklisted
 */
export async function isTokenBlacklisted(token, type = "access") {
  try {
    const exists = await redisClient.exists(`blacklist:${type}:${token}`);
    return exists === 1;
  } catch (err) {
    console.error("Error checking blacklist:", err);
    return false; // Fail open for availability
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Valid refresh token
 * @returns {Promise<Object>} - { accessToken, error }
 */
export async function refreshAccessToken(refreshToken) {
  // Check if token is blacklisted
  if (await isTokenBlacklisted(refreshToken, "refresh")) {
    return { accessToken: null, error: "TOKEN_REVOKED" };
  }

  const result = verifyToken(refreshToken, REFRESH_TOKEN_SECRET);

  if (!result.valid) {
    return { accessToken: null, error: result.error };
  }

  // Verify token type
  if (result.payload.type !== "refresh") {
    return { accessToken: null, error: "INVALID_TOKEN_TYPE" };
  }

  // Extract minimal payload for new access token
  const { id } = result.payload;

  // In production, you'd fetch fresh user data from DB here
  // For now, we'll use what's in the refresh token
  const newAccessToken = generateAccessToken({ id });

  return { accessToken: newAccessToken, error: null };
}

/**
 * Rotate refresh token (issue new one, blacklist old one)
 * Implements refresh token rotation for better security
 * @param {string} oldRefreshToken - Current refresh token
 * @returns {Promise<Object>} - { accessToken, refreshToken, error }
 */
export async function rotateRefreshToken(oldRefreshToken) {
  // Check if already used (prevents replay attacks)
  if (await isTokenBlacklisted(oldRefreshToken, "refresh")) {
    return {
      accessToken: null,
      refreshToken: null,
      error: "TOKEN_REUSE_DETECTED",
    };
  }

  const result = verifyToken(oldRefreshToken, REFRESH_TOKEN_SECRET);

  if (!result.valid) {
    return { accessToken: null, refreshToken: null, error: result.error };
  }

  // Verify token type
  if (result.payload.type !== "refresh") {
    return {
      accessToken: null,
      refreshToken: null,
      error: "INVALID_TOKEN_TYPE",
    };
  }

  // Blacklist old refresh token
  await blacklistToken(oldRefreshToken, "refresh");

  // Issue new tokens
  const { id } = result.payload;

  // In production, fetch fresh user data from DB
  const accessToken = generateAccessToken({ id });
  const refreshToken = generateRefreshToken({ id });

  return { accessToken, refreshToken, error: null };
}

/**
 * Revoke all tokens for a user (useful for password reset, account compromise)
 * @param {string} userId - User identifier
 * @returns {Promise<boolean>} - true if successful
 */
export async function revokeAllUserTokens(userId) {
  try {
    await redisClient.setEx(
      `revoke:user:${userId}`,
      60 * 60 * 24 * 7, // 7 days (match longest token expiry)
      Date.now().toString(),
    );
    return true;
  } catch (err) {
    console.error("Error revoking user tokens:", err);
    return false;
  }
}

/**
 * Check if all user tokens are revoked
 * @param {string} userId - User identifier
 * @param {number} tokenIssuedAt - Token iat claim
 * @returns {Promise<boolean>} - true if tokens are revoked
 */
export async function areUserTokensRevoked(userId, tokenIssuedAt) {
  try {
    const revokedAt = await redisClient.get(`revoke:user:${userId}`);
    if (!revokedAt) return false;

    const revokedTimestamp = parseInt(revokedAt) / 1000; // Convert to seconds
    return tokenIssuedAt < revokedTimestamp;
  } catch (err) {
    console.error("Error checking user token revocation:", err);
    return false;
  }
}

/**
 * Express middleware to verify access token
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    // Check if token is blacklisted
    if (await isTokenBlacklisted(token, "access")) {
      return res.status(401).json({ error: "Token has been revoked" });
    }

    const result = verifyToken(token, ACCESS_TOKEN_SECRET);

    if (!result.valid) {
      return res.status(403).json({ error: result.error });
    }

    // Verify token type
    if (result.payload.type !== "access") {
      return res.status(403).json({ error: "Invalid token type" });
    }

    // Check if all user tokens are revoked
    if (await areUserTokensRevoked(result.payload.id, result.payload.iat)) {
      return res.status(401).json({ error: "Token has been revoked" });
    }

    req.user = result.payload;
    next();
  } catch (err) {
    console.error("Authentication error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Express middleware to verify refresh token
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
export async function authenticateRefreshToken(req, res, next) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: "No refresh token provided" });
  }

  try {
    // Check if token is blacklisted
    if (await isTokenBlacklisted(refreshToken, "refresh")) {
      return res.status(401).json({ error: "Token has been revoked" });
    }

    const result = verifyToken(refreshToken, REFRESH_TOKEN_SECRET);

    if (!result.valid) {
      return res.status(403).json({ error: result.error });
    }

    // Verify token type
    if (result.payload.type !== "refresh") {
      return res.status(403).json({ error: "Invalid token type" });
    }

    // Check if all user tokens are revoked
    if (await areUserTokensRevoked(result.payload.id, result.payload.iat)) {
      return res.status(401).json({ error: "Token has been revoked" });
    }

    req.user = result.payload;
    req.refreshToken = refreshToken;
    next();
  } catch (err) {
    console.error("Refresh token authentication error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

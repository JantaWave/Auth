import UserSessionModel from "../models/authSession.model.js";
import { hashToken, verifyToken } from "../utils/security.js";

/**
 * @desc Create or update a session with hashed refresh token
 * @param {Number} userId - User ID
 * @param {String} rawRefreshToken - Plain refresh token
 * @param {Object} deviceInfo - Device information from middleware
 * @param {String} ip - IP address
 * @returns {Promise<Object>} Created/updated session
 */
export const createSession = async (
  userId,
  rawRefreshToken,
  deviceInfo = {},
  ip = null,
) => {
  const refreshTokenHash = await hashToken(rawRefreshToken);

  // Convert deviceInfo object to JSONB-friendly format
  const deviceData = {
    device: deviceInfo.device || "Unknown",
    browser: deviceInfo.browser || "Unknown",
    browserVersion: deviceInfo.browserVersion || "Unknown",
    os: deviceInfo.os || "Unknown",
    osVersion: deviceInfo.osVersion || "Unknown",
    fingerprint: deviceInfo.fingerprint || null,
  };

  return UserSessionModel.upsert(userId, refreshTokenHash, deviceData, ip);
};

/**
 * @desc Verify refresh token against stored hash
 * @param {Number} userId - User ID
 * @param {String} rawToken - Plain refresh token from client
 * @returns {Promise<Object|false>} Session object if valid, false otherwise
 */
export const verifyRefreshToken = async (userId, rawToken) => {
  // Find all active sessions for the user (not just latest)
  const sessions = await UserSessionModel.findAllActiveForUser(userId);

  if (!sessions || sessions.length === 0) {
    return false;
  }

  // Check against all active sessions to find a match
  for (const session of sessions) {
    const isValid = await verifyToken(session.refresh_token_hash, rawToken);
    if (isValid) {
      // Update last activity timestamp
      await UserSessionModel.updateActivity(session.id);
      return session;
    }
  }

  return false;
};

/**
 * @desc Find session by raw refresh token
 * @param {String} rawToken - Plain refresh token
 * @returns {Promise<Object|null>} Session if found and valid
 */
export const findSessionByToken = async (rawToken) => {
  const sessions = await UserSessionModel.findAllActive();

  for (const session of sessions) {
    const isValid = await verifyToken(session.refresh_token_hash, rawToken);
    if (isValid) {
      return session;
    }
  }

  return null;
};

/**
 * @desc Revoke a specific session
 * @param {Number} sessionId - Session ID
 * @returns {Promise<Object|null>} Revoked session
 */
export const revokeSession = async (sessionId) => {
  return UserSessionModel.revokeSession(sessionId);
};

/**
 * @desc Revoke all sessions for a user (logout from all devices)
 * @param {Number} userId - User ID
 * @returns {Promise<Number>} Number of sessions revoked
 */
export const revokeAllUserSessions = async (userId) => {
  return UserSessionModel.revokeAllForUser(userId);
};

/**
 * @desc Revoke all sessions except the current one
 * @param {Number} userId - User ID
 * @param {Number} currentSessionId - Current session ID to keep
 * @returns {Promise<Number>} Number of sessions revoked
 */
export const revokeOtherSessions = async (userId, currentSessionId) => {
  return UserSessionModel.revokeAllExcept(userId, currentSessionId);
};

/**
 * @desc Get all active sessions for a user
 * @param {Number} userId - User ID
 * @returns {Promise<Array>} Array of active sessions
 */
export const getUserActiveSessions = async (userId) => {
  const sessions = await UserSessionModel.findAllActiveForUser(userId);

  // Return sanitized session data (without token hash)
  return sessions.map((session) => ({
    id: session.id,
    device: session.device_info?.device || "Unknown",
    browser: session.device_info?.browser || "Unknown",
    os: session.device_info?.os || "Unknown",
    ipAddress: session.ip_address,
    createdAt: session.created_at,
    lastActivity: session.last_activity,
    expiresAt: session.expires_at,
    isCurrent: false, // Will be set by controller
  }));
};

/**
 * @desc Clean up expired sessions (run as cron job)
 * @returns {Promise<Number>} Number of sessions cleaned
 */
export const cleanupExpiredSessions = async () => {
  return UserSessionModel.cleanupExpired();
};

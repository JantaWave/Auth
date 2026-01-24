import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import * as SessionService from "../../services/session.service.js";
import UserSessionModel from "../../models/authSession.model.js";
import PushTokenModel from "../../models/push.models.js";
import dotenv from "dotenv";
dotenv.config();

/**
 * Logout from current device/session
 * Works for React Native using header: x-session-id
 */
export const logout = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const sessionIdFromHeader = req.headers["x-session-id"];
  const { expoPushToken } = req.body;

  if (!userId) throw new ApiError(401, "Unauthorized");

  // revoke current session using sessionId
  if (sessionIdFromHeader) {
    const session = await UserSessionModel.findById(sessionIdFromHeader);

    if (session && String(session.user_id) === String(userId)) {
      await SessionService.revokeSession(sessionIdFromHeader);
    }
  }

  // delete this device push token (recommended safe delete)
  if (expoPushToken) {
    await PushTokenModel.deleteByUserAndToken(userId, expoPushToken);
  }

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  return res
    .status(200)
    .clearCookie("refresh_token", options)
    .clearCookie("session_id", options)
    .json(new ApiResponse(200, {}, "User logged out"));
});

/**
 *  Logout from all devices
 */
export const logoutFromAllDevices = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) throw new ApiError(401, "Unauthorized");

  // revoke all sessions
  await SessionService.revokeAllUserSessions(userId);

  // delete all push tokens for that user
  await PushTokenModel.deleteAllByUserId(userId);

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  return res
    .status(200)
    .clearCookie("refresh_token", options)
    .clearCookie("session_id", options)
    .json(new ApiResponse(200, {}, "User logged out from all devices"));
});

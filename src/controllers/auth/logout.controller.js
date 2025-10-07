import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import * as SessionService from "../../services/session.service.js";
import UserSessionModel from "../../models/authSession.model.js";
import dotenv from "dotenv";
dotenv.config();

const logout = asyncHandler(async (req, res) => {
  const { session_id } = req.cookies || {};

  if (session_id && req.user?.id) {
    // Verify session belongs to the authenticated user
    const session = await UserSessionModel.findById(session_id);
    if (session && session.user_id === req.user.id) {
      await SessionService.revokeSession(session_id);
    }
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

const logoutFromAllDevices = asyncHandler(async (req, res) => {
  if (req.user?.id) {
    await SessionService.revokeAllUserSessions(req.user.id);
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
    .json(new ApiResponse(200, {}, "User logged out from all devices"));
});

export { logout, logoutFromAllDevices };

import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { rotateRefreshToken } from "../../services/token.service.js";
import dotenv from "dotenv";
dotenv.config();

const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(
  process.env.REFRESH_TOKEN_EXPIRY_DAYS || "7",
  10,
);

/**
 * @desc Refresh access token using refresh token
 * @route POST /api/v1/auth/refresh-token
 * @access Public (requires valid refresh token in cookie)
 */
export const refreshAccessToken = asyncHandler(async (req, res) => {
  const oldRefreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
  const sessionId = req.headers["x-session-id"]; // ✅ Get session ID

  if (!oldRefreshToken) {
    throw new ApiError(401, "Refresh token not found");
  }

  // ✅ Pass sessionId to service
  const result = await rotateRefreshToken(
    oldRefreshToken,
    sessionId, // ✅ Add this parameter
    req.deviceInfo,
    req.ip,
  );

  if (result.error) {
    const errorMessages = {
      TOKEN_REUSED:
        "This refresh token has already been used. Please login again.",
      INVALID_SESSION: "Session not found. Please login again.",
      SESSION_MISMATCH: "Session validation failed. Please login again.",
      SESSION_EXPIRED: "Session expired. Please login again.",
      TOKEN_EXPIRED: "Refresh token has expired. Please login again.",
      INVALID_REFRESH_TOKEN: "Invalid refresh token. Please login again.",
    };

    res.clearCookie("refresh_token");
    res.clearCookie("session_id");

    throw new ApiError(
      401,
      errorMessages[result.error] || "Authentication failed",
    );
  }

  const { accessToken, refreshToken, sessionId: returnedSessionId } = result;

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    path: "/",
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  };

  return res
    .status(200)
    .cookie("refresh_token", refreshToken, cookieOptions)
    .cookie("session_id", returnedSessionId, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          accessToken,
          refreshToken,
          sessionId: returnedSessionId, // ✅ Return for mobile
        },
        "Access token refreshed successfully",
      ),
    );
});

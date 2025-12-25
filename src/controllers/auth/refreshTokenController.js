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
  // 1. CHANGE: Look in Cookies (Web) OR Body (Mobile)
  const oldRefreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

  if (!oldRefreshToken) {
    throw new ApiError(401, "Refresh token not found");
  }

  const result = await rotateRefreshToken(
    oldRefreshToken,
    req.deviceInfo,
    req.ip,
  );

  if (result.error) {
    // ... (Keep existing error handling) ...
    res.clearCookie("refresh_token");
    res.clearCookie("session_id");
    throw new ApiError(
      401,
      errorMessages[result.error] || "Authentication failed",
    );
  }

  const { accessToken, refreshToken, sessionId } = result;

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    path: "/",
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  };

  return (
    res
      .status(200)
      // Keep setting cookies for Web clients
      .cookie("refresh_token", refreshToken, cookieOptions)
      .cookie("session_id", sessionId, cookieOptions)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            // 2. CHANGE: Send refreshToken in JSON so Mobile can save it
            refreshToken,
          },
          "Access token refreshed successfully",
        ),
      )
  );
});

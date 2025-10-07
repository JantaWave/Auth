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
  const oldRefreshToken = req.cookies?.refresh_token;

  if (!oldRefreshToken) {
    throw new ApiError(401, "Refresh token not found");
  }

  // Rotate the refresh token and get new token pair
  const result = await rotateRefreshToken(
    oldRefreshToken,
    req.deviceInfo,
    req.ip,
  );

  if (result.error) {
    const errorMessages = {
      TOKEN_REUSED: "Refresh token has already been used. Please login again.",
      INVALID_SESSION: "Invalid session. Please login again.",
      TOKEN_EXPIRED: "Refresh token expired. Please login again.",
      INVALID_REFRESH_TOKEN: "Invalid refresh token. Please login again.",
    };

    throw new ApiError(
      401,
      errorMessages[result.error] || "Authentication failed",
    );
  }

  const { accessToken, refreshToken, sessionId } = result;

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  return res
    .status(200)
    .cookie("refresh_token", refreshToken, {
      ...options,
      maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    })
    .cookie("session_id", sessionId, {
      ...options,
      maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    })
    .json(
      new ApiResponse(
        200,
        {
          accessToken,
          refreshToken,
        },
        "Access token refreshed successfully",
      ),
    );
});

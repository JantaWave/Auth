import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { verifyMpin } from "../../utils/security.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";
import {
  createSession,
  getUserActiveSessions,
} from "../../services/session.service.js";
import UserModel from "../../models/auth.models.js";
import dotenv from "dotenv";
dotenv.config();

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5", 10);
const LOCK_MINUTES = parseInt(process.env.LOCK_MINUTES || "30", 10);
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(
  process.env.REFRESH_TOKEN_EXPIRY_DAYS || "7",
  10,
);

export const loginUser = asyncHandler(async (req, res) => {
  const { contact, mpin } = req.body;
  console.log(req);
  const user = await UserModel.findByMobile(contact);

  if (!user) throw new ApiError(401, "User not found, Try register.");

  if (!user.is_contact_verified) {
    throw new ApiError(
      401,
      "Please verify your phone number before logging in.",
    );
  }

  if (user.lock_until && new Date(user.lock_until) > new Date()) {
    throw new ApiError(
      423,
      `Account is temporarily blocked, please try after ${new Date(user.lock_until).toLocaleString()}.`,
    );
  }

  const isValid = await verifyMpin(user.hashed_mpin, mpin);

  if (!isValid) {
    const attempts = (user.login_attempts || 0) + 1;
    const lockUntil =
      attempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
        : null;
    await UserModel.incrementLoginAttempts(user.id, attempts, lockUntil);
    throw new ApiError(401, "Invalid Credentials");
  }

  const accessToken = generateAccessToken({
    id: user.id,
    contact: user.contact,
  });
  const refreshToken = generateRefreshToken({ id: user.id });

  const session = await createSession(
    user.id,
    refreshToken,
    req.deviceInfo,
    req.ip,
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  await UserModel.updateLastLogin(user.id);
  await UserModel.resetLoginAttempts(user.id);
  await UserModel.setOnlineStatus(user.id, true);

  const activeSessions = await getUserActiveSessions(user.id);

  return res
    .status(200)
    .cookie("refresh_token", refreshToken, {
      ...options,
      maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    })
    .cookie("session_id", session.id, {
      ...options,
      maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    })
    .json(
      new ApiResponse(
        200,
        {
          user: {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            contact: user.contact,
            role: user.role,
            avatar_url: user.avatar_url,
            bio: user.bio,
            is_live: user.is_live,
            is_online: user.is_online,
            dob: user.date_of_birth,
            village_id: user.village_id,
            gender: user.gender,
          },
          tokens: { accessToken, refreshToken },
          session: {
            id: session.id,
            activeSessionCount: activeSessions.length,
          },
        },
        "Login successful",
      ),
    );
});

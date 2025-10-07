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

export const loginUser = asyncHandler(async (req, res) => {
  const { contact, mpin } = req.body;
  const user = await UserModel.findByMobile(contact);
  if (!user) throw new ApiError(401, "Invalid credentials");

  if (user.lock_until && new Date(user.lock_until) > new Date()) {
    throw new ApiError(423, "Account locked temporarily");
  }

  const isValid = await verifyMpin(user.hashed_mpin, mpin);
  if (!isValid) {
    const attempts = (user.login_attempts || 0) + 1;
    await UserModel.incrementLoginAttempts(user.id, attempts);
    throw new ApiError(401, "Invalid MPIN");
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
  await UserModel.updateLastLogin(user.id);
  await UserModel.resetLoginAttempts(user.id);

  const activeSessions = await getUserActiveSessions(user.id);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          contact: user.contact,
        },
        tokens: { accessToken, refreshToken },
        session: { id: session.id, activeSessionCount: activeSessions.length },
      },
      "Login successful",
    ),
  );
});

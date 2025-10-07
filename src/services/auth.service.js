import UserModel from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { hashToken, verifyToken } from "../utils/crypto.util.js";
import { signAccessToken, signRefreshToken } from "../utils/jwt.util.js";
import * as SessionService from "./session.service.js";

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5", 10);
const LOCK_MINUTES = parseInt(process.env.ACCOUNT_LOCK_MINUTES || "30", 10);

class AuthService {
  static async register(payload) {
    if (
      await UserModel.existsByEmailUsernameOrContact(
        payload.email,
        payload.username,
        payload.contact,
      )
    ) {
      throw new ApiError(
        "User with given email/username/contact already exists",
      );
    }

    const hashed = await hashToken(payload.password);
    const user = await UserModel.create(payload, hashed);
    return user;
  }

  static async loginByIdentifier(
    identifier,
    password,
    deviceInfo = {},
    ip = null,
  ) {
    const user = await UserModel.findByEmailOrUsername(identifier);
    if (!user) throw new Error("Invalid credentials");

    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      throw new Error("Account locked. Try later.");
    }

    const ok = await verifyToken(user.hashed_password, password);

    if (!ok) {
      const attempts = (user.login_attempts || 0) + 1;
      const lockUntil =
        attempts >= MAX_ATTEMPTS
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null;
      await UserModel.incrementLoginAttempts(user.id, attempts, lockUntil);
      throw new Error("Invalid credentials");
    }

    // success
    await UserModel.resetLoginAttempts(user.id);
    await UserModel.setOnlineStatus(user.id, true);

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // persist hashed refresh token
    await SessionService.createSession(user.id, refreshToken, deviceInfo, ip);

    return {
      accessToken,
      refreshToken,
      user: UserModel._single ? await UserModel.findById(user.id) : user,
    };
  }

  static async logout(sessionId) {
    return SessionService.revokeSession(sessionId);
  }
}

export default AuthService;

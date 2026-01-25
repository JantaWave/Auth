import UserModel from "../models/auth.models.js";
import * as jwtUtil from "../utils/jwt.js";
import { ApiError } from "../utils/ApiError.js";
import UserSessionModel from "../models/authSession.model.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const sessionId = req.headers["x-session-id"];

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json(new ApiError(401, "No token provided"));
    }

    if (!sessionId) {
      return res.status(401).json(new ApiError(401, "No session id provided"));
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwtUtil.verifyAccessToken(token);

    const userId = decoded?.id;

    if (!userId) {
      return res.status(401).json(new ApiError(401, "Invalid token payload"));
    }

    // ✅ Check active session exists
    const session = await UserSessionModel.findById(sessionId);

    if (!session) {
      return res
        .status(401)
        .json(new ApiError(401, "Session revoked. Please login again."));
    }

    if (String(session.user_id) !== String(userId)) {
      return res.status(401).json(new ApiError(401, "Session mismatch"));
    }

    if (new Date(session.expires_at) <= new Date()) {
      return res.status(401).json(new ApiError(401, "Session expired"));
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json(new ApiError(404, "User not found"));
    }

    req.user = UserModel.sanitizeUser(user);
    req.session = session;

    next();
  } catch (err) {
    console.log("❌ Auth middleware error:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json(new ApiError(401, "Access token expired"));
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json(new ApiError(401, "Invalid token"));
    }
    return res.status(500).json(new ApiError(500, "Internal server error"));
  }
};
export const verifyAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json(new ApiError(403, "Access denied. Admin only."));
    }
    next();
  } catch (error) {
    return res.status(403).json(new ApiError(403, "Access denied"));
  }
};

import UserModel from "../models/auth.models.js";
import * as jwtUtil from "../utils/jwt.js";
import { ApiError } from "../utils/ApiError.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader?.startsWith("Bearer ")) {
      // ✅ Use ApiError for consistency
      return res.status(401).json(new ApiError(401, "No token provided"));
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwtUtil.verifyAccessToken(token);

    const userId = decoded?.id;
    if (!userId) {
      return res.status(401).json(new ApiError(401, "Invalid token payload"));
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json(new ApiError(404, "User not found"));
    }

    req.user = UserModel.sanitizeUser(user);
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);

    if (err.name === "TokenExpiredError") {
      // ✅ This 401 triggers the frontend refresh
      return res.status(401).json(new ApiError(401, "Access token expired"));
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json(new ApiError(401, "Invalid token"));
    }

    res.status(500).json(new ApiError(500, "Internal server error"));
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

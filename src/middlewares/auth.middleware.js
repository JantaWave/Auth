import UserModel from "../models/auth.models.js";
import * as jwtUtil from "../utils/jwt.js"; // central JWT util
import { ApiError } from "../utils/ApiError.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwtUtil.verifyAccessToken(token); // your util should throw if expired

    const userId = decoded?.id;
    if (!userId) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    req.user = UserModel.sanitizeUser(user); // attach sanitized user to request
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);

    // handle expired or invalid token errors clearly
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Access token expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }

    res.status(500).json({ error: "Internal server error" });
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

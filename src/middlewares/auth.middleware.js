import UserModel from "../models/auth.models.js";
import * as jwtUtil from "../utils/jwt.js"; // central JWT util

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwtUtil.verifyToken(token, process.env.ACCESS_TOKEN_SECRET);

    if (!decoded) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const userId = decoded.id; // make sure your token has { id: ... } when created
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    req.user = UserModel.sanitizeUser(user); // attach sanitized user to request

    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

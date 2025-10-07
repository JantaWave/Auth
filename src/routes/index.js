import { Router } from "express";
import { db } from "../config/db.js";
import {
  userLoginValidator,
  userRegisterValidator,
} from "../validators/auth.validators.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../validators/validate.js";
import { registerUser } from "../controllers/auth/register.controller.js";
import { errorHandler } from "../middlewares/error.middleware.js";
import { loginUser } from "../controllers/auth/login.controller.js";
import { deviceInfoMiddleware } from "../middlewares/deviceinfo.middleware.js";
import {
  logout,
  logoutFromAllDevices,
} from "../controllers/auth/logout.controller.js";
import {
  sendVerificationOTP,
  verifyContact,
} from "../controllers/auth/verifyContact.controller.js";

const router = Router();

// GET /users
router.get("/users", async (req, res) => {
  try {
    // Always use parameterized queries
    const { rows } = await db.query("SELECT * FROM users");
    res.json(rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.use(errorHandler);

router.post(
  "/register",
  deviceInfoMiddleware,
  userRegisterValidator(),
  validate,
  registerUser,
);
router.post(
  "/login",
  deviceInfoMiddleware,
  userLoginValidator(),
  validate,
  loginUser,
);
router.post("/logout", authMiddleware, logout);
router.post("/logout-from-all-devices", authMiddleware, logoutFromAllDevices);
router.post("/verify-contact", verifyContact);
router.post("/resend-otp", sendVerificationOTP);

export default router;

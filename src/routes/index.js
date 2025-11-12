import { Router } from "express";
import {
  userLoginValidator,
  userRegisterValidator,
} from "../validators/auth.validators.js";
import { authMiddleware, verifyAdmin } from "../middlewares/auth.middleware.js";
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
  getAddressByVillage,
  getAllStates,
  getBlocksByDistrict,
  getDistrictsByState,
  getVillagesByBlock,
  getAllVillages,
  getAllDistricts,
  getAllBlocks,
} from "../controllers/user/address.controller.js";
import {
  sendVerificationOTP,
  verifyContact,
} from "../controllers/auth/verifyContact.controller.js";
import {
  getProfile,
  updateProfile,
} from "../controllers/user/profile.controller.js";
import {
  getAllUsers,
  getAuthStats,
} from "../controllers/admin/user.controller.js";
import { jsonUploadAddress } from "../controllers/admin/address.controller.js";

const router = Router();

// ==================== PUBLIC ROUTES ====================

// Authentication
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

// OTP Verification
router.post("/send-otp", sendVerificationOTP);
router.post("/verify-otp", verifyContact);
router.post("/resend-otp", sendVerificationOTP);

// Address/Location Data (Public)
router.get("/states", getAllStates);
router.get("/districts", getAllDistricts);
router.get("/blocks", getAllBlocks);
router.get("/villages", getAllVillages);
router.get("/address/:villageId", getAddressByVillage);
router.get("/states/:stateId/districts", getDistrictsByState);
router.get("/districts/:districtId/blocks", getBlocksByDistrict);
router.get("/blocks/:blockId/villages", getVillagesByBlock);

// ==================== PROTECTED USER ROUTES ====================

// Session Management
router.post("/logout", authMiddleware, logout);
router.post("/logout-from-all-devices", authMiddleware, logoutFromAllDevices);

// User Profile
router.get("/user/profile", authMiddleware, getProfile);
router.patch("/user/profile", authMiddleware, updateProfile);

// ==================== ADMIN ROUTES ====================

// Admin Login
router.post(
  "/admin/login",
  deviceInfoMiddleware,
  userLoginValidator(),
  validate,
  loginUser,
);

// Admin Dashboard & Stats
router.get("/admin/stats", authMiddleware, verifyAdmin, getAuthStats);

// User Management
router.get("/admin/users-list", authMiddleware, verifyAdmin, getAllUsers);

// Address Management
router.post(
  "/admin/address-uploads",
  authMiddleware,
  verifyAdmin,
  jsonUploadAddress,
);

// Error Handler (should be last)
router.use(errorHandler);

export default router;

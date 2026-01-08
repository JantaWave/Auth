import redisClient from "../../config/redis.js";
import UserModel from "../../models/auth.models.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createAndStoreOtp, verifyOtp } from "../../utils/otp.js";

export const verifyContact = asyncHandler(async (req, res) => {
  const { contact, otp } = req.body;
  if (!contact) {
    throw new ApiError(400, "Contact is required");
  }

  // ✅ 1. If already verified in this session → short-circuit
  const isAlreadyVerifiedSession = await redisClient.get(
    `otp:verified:${contact}`,
  );

  if (isAlreadyVerifiedSession === "true") {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { contact, isVerified: true },
          "Contact already verified in this session",
        ),
      );
  }

  // ⛔ OTP REQUIRED only if NOT verified
  if (!otp) {
    throw new ApiError(400, "OTP is required");
  }

  const verificationResult = await verifyOtp(contact, otp);

  if (!verificationResult.success) {
    const errorMessages = {
      too_many_attempts: "Too many failed attempts. Please try again later.",
      expired_or_not_found:
        "OTP has expired or is invalid. Please request a new one.",
      invalid_otp: "Invalid OTP. Please try again.",
      system_error: "System error. Please try again later.",
    };

    throw new ApiError(
      400,
      errorMessages[verificationResult.reason] || "OTP verification failed",
    );
  }

  // ✅ Mark verified for session
  await redisClient.setEx(`otp:verified:${contact}`, 300, "true");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { contact, isVerified: true },
        "Contact verified successfully",
      ),
    );
});

export const sendVerificationOTP = asyncHandler(async (req, res) => {
  const { contact } = req.body;
  if (!contact) throw new ApiError(400, "Contact is required");
  const isContactExists = await UserModel.existsByMobile(contact);

  if (isContactExists)
    throw new ApiError(
      400,
      "Contact already registered, use a diffirent mobile number.",
    );

  // Reset verification state if they are retrying
  await redisClient.del(`otp:verified:${contact}`);

  // Attempt to create OTP
  const otpResult = await createAndStoreOtp(contact);

  // ✅ FIX: Do not send 200 OK if OTP was not actually created
  if (!otpResult.success) {
    if (otpResult.reason === "cooldown_active") {
      // If you are in development, you might want to bypass this,
      // but in production, this prevents spam.
      throw new ApiError(429, "Please wait 60 seconds before resending OTP.");
    }
    throw new ApiError(500, "Failed to generate OTP.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { user: { contact } }, "OTP sent successfully"));
});

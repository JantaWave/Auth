import redisClient from "../../config/redis.js";
import UserModel from "../../models/auth.models.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createAndStoreOtp, verifyOtp } from "../../utils/otp.js";

export const verifyContact = asyncHandler(async (req, res) => {
  const { contact, otp } = req.body;
  if (!contact || !otp) {
    throw new ApiError(400, "Contact and OTP are required");
  }

  const user = await UserModel.findByMobile(contact);
  if (user && user.is_contact_verified) {
    throw new ApiError(409, "User already exists and verified");
  }

  // ✅ Get the verification result object
  const verificationResult = await verifyOtp(contact, otp);

  console.log("Verification result:", verificationResult); // Add this to confirm

  // ✅ Check the .success property, not the object itself
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

  const OTP_VERIFIED_TTL = 300;
  await redisClient.setEx(`otp:verified:${contact}`, OTP_VERIFIED_TTL, "true");

  if (user) {
    await UserModel.verifyContact(contact);
  }

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

  if (!contact) {
    throw new ApiError(400, "Contact is required");
  }
  const user = await UserModel.findByMobile(contact);
  if (user && user.is_contact_verified) {
    throw new ApiError(404, "User already exists and verified");
  }

  const otp = await createAndStoreOtp(contact);
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: {
          contact: contact,
        },
      },
      "OTP sent successfully",
    ),
  );
});

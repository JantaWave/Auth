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
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.is_contact_verified) {
    throw new ApiError(400, "Contact is already verified");
  }
  const verified = await verifyOtp(user.id, otp);

  if (!verified) {
    throw new ApiError(400, "OTP has expired. Please request a new one.");
  }

  await UserModel.verifyContact(contact);
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: {
          id: user.id,
          contact: user.contact,
          isVerified: true,
        },
      },
      "Contact verified successfully",
    ),
  );
});

export const sendVerificationOTP = asyncHandler(async (req, res) => {
  const { contact } = req.body;

  if (!contact) {
    throw new ApiError(400, "Contact is required");
  }
  const user = UserModel.findByMobile(contact);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.is_contact_verified) {
    throw new ApiError(400, "Contact is already verified");
  }

  const otp = await createAndStoreOtp(user.id);
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: {
          id: user.id,
          contact: user.contact,
        },
      },
      "OTP sent successfully",
    ),
  );
});

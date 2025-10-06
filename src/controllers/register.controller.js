import UserModel from "../models/auth.models";
import { asyncHandler } from "../utils/asyncHandler";
import { hashMpin } from "../utils/security";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";

export const registerUser = asyncHandler(async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      mpin,
      contact,
      date_of_birth,
      state,
      district,
      block,
      village,
    } = req.body;

    // Check for existing user
    const existingUser = await UserModel.existsByMobile(contact);

    if (existingUser)
      throw new ApiError(409, "User with this contact already exists.");

    console.log("register user exit");
    const hashedMpin = await hashMpin(mpin);

    // Create new user
    const createdUser = await UserModel.create({
      first_name,
      last_name,
      hashed_mpin: hashedMpin,
      contact,
      date_of_birth,
      state,
      district,
      block,
      village,
    });

    if (!createdUser) throw new ApiError(500, "User Registration failed.");

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          user: createdUser,
          message:
            "Please verify both your phone number to complete registration.",
        },
        "User registred Successfully.",
      ),
    );
  } catch (err) {
    console.error(err); // Log the actual error for debugging
    if (err instanceof ApiError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    // Generic fallback for unexpected errors
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
});

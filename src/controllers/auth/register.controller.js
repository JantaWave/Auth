import UserModel from "../../models/auth.models.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { hashMpin } from "../../utils/security.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * @desc Register a new user
 * @route POST /api/v1/register
 * @access Public
 */
export const registerUser = asyncHandler(async (req, res) => {
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

  // Check if the contact is already registered
  const existingUser = await UserModel.findByMobile(contact);
  if (existingUser) {
    throw new ApiError(409, "User with this contact already exists.");
  }

  const hashedMpin = await hashMpin(mpin);

  // Create user (UserModel will handle address normalization automatically)
  const newUser = await UserModel.create(
    {
      first_name,
      last_name,
      contact,
      date_of_birth,
      state,
      district,
      block,
      village,
    },
    hashedMpin,
  );

  if (!newUser) {
    throw new ApiError(500, "Failed to register user. Please try again.");
  }

  // Fetch complete user with address details
  const userWithAddress = await UserModel.findById(newUser.id);

  // Prepare response with address details
  const responseData = {
    user: {
      id: userWithAddress.id,
      first_name: userWithAddress.first_name,
      last_name: userWithAddress.last_name,
      contact: userWithAddress.contact,
      date_of_birth: userWithAddress.date_of_birth,
      address: {
        state: userWithAddress.state_normalized,
        district: userWithAddress.district_normalized,
        block: userWithAddress.block_normalized,
        village: userWithAddress.village_normalized,
      },
      created_at: userWithAddress.created_at,
    },
    message: "Please verify your phone number to complete registration.",
  };

  // Respond
  return res
    .status(201)
    .json(new ApiResponse(201, responseData, "User registered successfully."));
});

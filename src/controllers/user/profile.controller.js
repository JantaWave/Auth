import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import UserModel from "../../models/auth.models.js";
import { getUserActiveSessions } from "../../services/session.service.js";

/**
 * @desc Get user profile
 * @route GET /api/v1/user/profile
 * @access Private
 */
export const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Get active sessions
  const activeSessions = await getUserActiveSessions(userId);

  // Mark current session
  const currentSessionId = req.cookies?.session_id;
  const sessionsWithCurrent = activeSessions.map((session) => ({
    ...session,
    isCurrent: session.id === currentSessionId,
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          contact: user.contact,
          email: user.email,
          dateOfBirth: user.date_of_birth,
          gender: user.gender,
          profilePicture: user.profile_picture,
          isContactVerified: user.is_contact_verified,
          isEmailVerified: user.is_email_verified,
          isOnline: user.is_online,
          lastLogin: user.last_login,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
        activeSessions: sessionsWithCurrent,
      },
      "Profile fetched successfully",
    ),
  );
});

/**
 * @desc Update user profile
 * @route PATCH /api/v1/user/profile
 * @access Private
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { firstName, lastName, email, dateOfBirth, gender, profilePicture } =
    req.body;

  // Validate at least one field is provided
  if (
    !firstName &&
    !lastName &&
    !email &&
    !dateOfBirth &&
    !gender &&
    !profilePicture
  ) {
    throw new ApiError(400, "At least one field is required to update");
  }

  // Validate email format if provided
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Invalid email format");
  }

  // Validate gender if provided
  if (gender && !["male", "female", "other"].includes(gender.toLowerCase())) {
    throw new ApiError(400, "Gender must be male, female, or other");
  }

  // Validate date of birth if provided
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();

    if (isNaN(dob.getTime())) {
      throw new ApiError(400, "Invalid date of birth format");
    }

    if (age < 13) {
      throw new ApiError(400, "You must be at least 13 years old");
    }

    if (age > 120) {
      throw new ApiError(400, "Invalid date of birth");
    }
  }

  // Check if email already exists (if being changed)
  if (email) {
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser && existingUser.id !== userId) {
      throw new ApiError(409, "Email is already registered to another account");
    }
  }

  // Prepare update data
  const updateData = {};
  if (firstName) updateData.first_name = firstName.trim();
  if (lastName) updateData.last_name = lastName.trim();
  if (email) {
    updateData.email = email.trim().toLowerCase();
    updateData.is_email_verified = false; // Reset verification if email changed
  }
  if (dateOfBirth) updateData.date_of_birth = dateOfBirth;
  if (gender) updateData.gender = gender.toLowerCase();
  if (profilePicture) updateData.profile_picture = profilePicture;

  // Update user
  const updatedUser = await UserModel.updateProfile(userId, updateData);

  if (!updatedUser) {
    throw new ApiError(500, "Failed to update profile");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: {
          id: updatedUser.id,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          contact: updatedUser.contact,
          email: updatedUser.email,
          dateOfBirth: updatedUser.date_of_birth,
          gender: updatedUser.gender,
          profilePicture: updatedUser.profile_picture,
          isContactVerified: updatedUser.is_contact_verified,
          isEmailVerified: updatedUser.is_email_verified,
        },
      },
      "Profile updated successfully",
    ),
  );
});

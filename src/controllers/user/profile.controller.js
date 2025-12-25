import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import UserModel from "../../models/auth.models.js";
import { getUserActiveSessions } from "../../services/session.service.js";
import CommunityModel from "../../models/community.models.js";

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

  const activeSessions = await getUserActiveSessions(userId);
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
          first_name: user.first_name,
          last_name: user.last_name,
          contact: user.contact,
          date_of_birth: user.date_of_birth,
          avatar_url: user.avatar_url,
          bio: user.bio,
          state: user.state_normalized,
          district: user.district_normalized,
          block: user.block_normalized,
          village: user.village_normalized,
          isContactVerified: user.is_contact_verified,
          isOnline: user.is_online,
          lastSeen: user.last_seen,
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
  console.log("updateProfile called");
  const userId = req.user.id;
  const {
    first_name,
    last_name,
    date_of_birth,
    avatar_url,
    bio,
    // Address fields
    village, // This is the village_id from the frontend
  } = req.body;

  // 1. Validate at least one field is present
  if (
    !first_name &&
    !last_name &&
    !date_of_birth &&
    !avatar_url &&
    !bio &&
    !village
  ) {
    throw new ApiError(400, "At least one field is required to update");
  }

  // 2. Validate Date of Birth
  if (date_of_birth) {
    const dob = new Date(date_of_birth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();

    if (isNaN(dob.getTime())) throw new ApiError(400, "Invalid date format");
    if (age < 13) throw new ApiError(400, "You must be at least 13 years old");
    if (age > 120 || dob > new Date()) {
      throw new ApiError(400, "Invalid date of birth");
    }
  }

  // 3. Prepare Update Object
  const updateData = {};
  if (first_name) updateData.first_name = first_name.trim();
  if (last_name) updateData.last_name = last_name.trim();
  if (date_of_birth) updateData.date_of_birth = date_of_birth;
  if (avatar_url) updateData.avatar_url = avatar_url;
  if (bio) updateData.bio = bio.trim();

  // Map 'village' (ID) to 'village_id' for the database
  if (village) {
    updateData.village_id = village;
  }

  // 4. Perform Update
  if (Object.keys(updateData).length > 0) {
    await UserModel.update(userId, updateData);
  }

  // 5. CRITICAL: Refetch user to get "normalized" fields (state_name, etc.)
  // The 'update' method only returns the raw user table row.
  // 'findById' performs the JOINs to get state, district, block names.
  const updatedUser = await UserModel.findById(userId);

  if (!updatedUser) {
    throw new ApiError(500, "Failed to fetch updated profile");
  }

  // 6. Return Response
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: {
          id: updatedUser.id,
          first_name: updatedUser.first_name,
          last_name: updatedUser.last_name,
          contact: updatedUser.contact,
          date_of_birth: updatedUser.date_of_birth,
          avatar_url: updatedUser.avatar_url,
          bio: updatedUser.bio,
          // Correctly mapped from the JOIN result
          state: updatedUser.state_normalized,
          district: updatedUser.district_normalized,
          block: updatedUser.block_normalized,
          village: updatedUser.village_normalized,

          village_id: updatedUser.village_id, // Useful to return the ID too
          isContactVerified: updatedUser.is_contact_verified,
        },
      },
      "Profile updated successfully",
    ),
  );
});
export const getProfileStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  if (!userId) throw new ApiError(400, "Not Authorised.");
  const data = await CommunityModel.getProfileStats(userId);
  console.log(data);
  return res
    .status(200)
    .json(
      new ApiResponse(200, data, "Profile statistics fetched successfully."),
    );
});

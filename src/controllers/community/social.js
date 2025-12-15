import CommunityModel from "../../models/community.models.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// --- FOLLOW USER ---
export const followUser = asyncHandler(async (req, res) => {
  const { id: targetUserId } = req.params; // The user to follow
  const followerId = req.user.id; // The logged-in user
  console.log(req.params);

  if (targetUserId === followerId) {
    throw new ApiError(400, "You cannot follow yourself");
  }

  await CommunityModel.follow(followerId, targetUserId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User followed successfully"));
});

// --- UNFOLLOW USER ---
export const unfollowUser = asyncHandler(async (req, res) => {
  const { id: targetUserId } = req.params;
  const followerId = req.user.id;

  await CommunityModel.unfollow(followerId, targetUserId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User unfollowed successfully"));
});

export const getUserFollower = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  if (!userId) throw new ApiError(400, "Unauthorised access.");
  const followers = await CommunityModel.getUserFollowers(userId);
  console.log("Followers", followers);
  return res
    .status(200)
    .json(new ApiResponse(200, followers, "Followers fetched successfully."));
});

export const getUserFollowings = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  if (!userId) throw new ApiError(400, "Unauthorised access.");
  const followings = await CommunityModel.getUserFollowings(userId);
  return res
    .status(200)
    .json(new ApiResponse(200, followings, "Followings fetched successfully."));
});

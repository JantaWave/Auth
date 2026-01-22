import CommunityModel from "../../models/community.models.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notifyUser } from "../../services/notification.service.js";

/* ---------- FOLLOW USER ---------- */
export const followUser = asyncHandler(async (req, res) => {
  const { id: targetUserId } = req.params;
  const followerId = req.user.id;

  if (targetUserId === followerId) {
    throw new ApiError(400, "You cannot follow yourself");
  }

  await CommunityModel.follow(followerId, targetUserId);

  await notifyUser(targetUserId, {
    title: "New Follower",
    body: `${req.user.first_name} started following you`,
    data: { type: "FOLLOW", followerId },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User followed successfully"));
});

/* ---------- UNFOLLOW USER ---------- */
export const unfollowUser = asyncHandler(async (req, res) => {
  const { id: targetUserId } = req.params;
  const followerId = req.user.id;

  await CommunityModel.unfollow(followerId, targetUserId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User unfollowed successfully"));
});

/* ---------- REMOVE FOLLOWER ---------- */
export const removeFollower = asyncHandler(async (req, res) => {
  const leaderId = req.user.id;
  const followerId = req.params.id;

  if (!followerId) {
    throw new ApiError(400, "Follower ID is required");
  }

  if (leaderId === followerId) {
    throw new ApiError(400, "You cannot remove yourself");
  }

  const removed = await CommunityModel.removeFollower(leaderId, followerId);

  if (!removed) {
    throw new ApiError(404, "Follower relationship not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Follower removed successfully"));
});

/* ---------- GET FOLLOWERS ---------- */
export const getUserFollowers = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  if (!userId) throw new ApiError(401, "Unauthorised access");

  const followers = await CommunityModel.getUserFollowers(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, followers, "Followers fetched successfully"));
});

/* ---------- GET FOLLOWINGS ---------- */
export const getUserFollowings = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  if (!userId) throw new ApiError(401, "Unauthorised access");

  const followings = await CommunityModel.getUserFollowings(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, followings, "Followings fetched successfully"));
});

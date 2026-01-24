import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
// Import Services
import * as StreamSetupService from "../../services/stream-setup.service.js";
import * as StreamSessionService from "../../services/stream-session.service.js";
import StreamModel from "../../models/streams.models.js";
import ActivityModel from "../../models/activity.models.js";
import CommunityModel from "../../models/community.models.js";

/**
 * GET /streams - Get user's own streams with pagination
 */
export const getUserStreams = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  console.log(userId);
  if (!userId) throw new ApiError(401, "UserId is required");

  const limit = Number(req.query.limit || 10);
  const cursor = req.query.cursor || null;

  const result = await StreamModel.getAllUserStreams(userId, limit, cursor);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        streams: result.streams,
        nextCursor: result.nextCursor,
      },
      "Fetched user streams",
    ),
  );
});

/**
 * POST /streams/setup
 */
export const setupStream = asyncHandler(async (req, res) => {
  const config = await StreamSetupService.setup(req.body);
  return res
    .status(200)
    .json(new ApiResponse(200, config, "Stream setup successfully"));
});

/**
 * POST /streams/start
 */
export const startStream = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    throw new ApiError(400, "Session ID is required to start stream");
  }

  if (typeof StreamSessionService.start !== "function") {
    console.error(
      "[Controller Error] StreamSessionService exports:",
      StreamSessionService,
    );
    throw new ApiError(
      500,
      "Server internal error: StreamSessionService.start is missing",
    );
  }

  const result = await StreamSessionService.start(sessionId);

  await Promise.all(
    (await CommunityModel.getUserFollowers(req.user.id)).map((f) =>
      notifyUser(f.follower_id, {
        title: "🔴 Stream Live",
        body: "Leader is live now, join the stream!",
        data: { type: "STREAM", streamId: sessionId, leaderId: req.user.id },
      }),
    ),
  );

  await ActivityModel.create({
    actorId: req.user.id,
    targetUserId: req.user.id,
    entityType: "stream",
    entityId: sessionId,
    action: "start",
  });

  return res.status(200).json(new ApiResponse(200, result, "Stream started"));
});

/**
 * POST /streams/stop
 */
export const stopStream = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) throw new ApiError(400, "Session ID is required");

  await StreamSessionService.stop(sessionId);
  return res
    .status(200)
    .json(new ApiResponse(200, { stopped: true }, "Stream stopped"));
});

/**
 * POST /streams/restart
 */
export const restartStream = asyncHandler(async (req, res) => {
  const { sessionId, isCameraOn } = req.body;
  const result = await StreamSessionService.restart(sessionId, isCameraOn);
  return res.status(200).json(new ApiResponse(200, result, "Stream restarted"));
});

/**
 * POST /streams/overlays/update
 */
export const updateOverlays = asyncHandler(async (req, res) => {
  const { sessionId, overlays } = req.body;
  if (!sessionId) throw new ApiError(400, "sessionId is required");
  if (!overlays) throw new ApiError(400, "overlays are required");

  await StreamSessionService.updateOverlays(sessionId, overlays);
  return res
    .status(200)
    .json(new ApiResponse(200, { updated: true }, "Overlay updated"));
});

/**
 * GET /streams/feed - Get streams feed with pagination
 */
export const getStreamsForUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) throw new ApiError(401, "Unauthorized request");

  const limit = Number(req.query.limit || 10);
  const cursor = req.query.cursor || null;

  const result = await StreamModel.getStreamsForUser(userId, limit, cursor);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        streams: result.streams,
        nextCursor: result.nextCursor,
      },
      "Streams fetched successfully",
    ),
  );
});

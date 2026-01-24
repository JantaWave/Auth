import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import NotificationModel from "../../models/notification.models.js";

export const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) throw new ApiError(401, "Unauthorized");

  const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
  const offset = parseInt(req.query.offset || "0", 10);

  const notifications = await NotificationModel.listByUserId(
    userId,
    limit,
    offset,
  );
  const unreadCount = await NotificationModel.countUnread(userId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { notifications, unreadCount },
        "Notifications fetched",
      ),
    );
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) throw new ApiError(401, "Unauthorized");

  const unreadCount = await NotificationModel.countUnread(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, { unreadCount }, "Unread count fetched"));
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) throw new ApiError(401, "Unauthorized");

  const updated = await NotificationModel.markRead(userId, id);
  if (!updated) throw new ApiError(404, "Notification not found");

  return res
    .status(200)
    .json(new ApiResponse(200, updated, "Notification marked as read"));
});

export const markAllRead = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) throw new ApiError(401, "Unauthorized");

  const updatedCount = await NotificationModel.markAllRead(userId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updatedCount },
        "All notifications marked as read",
      ),
    );
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) throw new ApiError(401, "Unauthorized");

  const deleted = await NotificationModel.deleteById(userId, id);
  if (!deleted) throw new ApiError(404, "Notification not found");

  return res
    .status(200)
    .json(new ApiResponse(200, deleted, "Notification deleted"));
});

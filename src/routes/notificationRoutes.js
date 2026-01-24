import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  getMyNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllRead,
  deleteNotification,
} from "../controllers/notifications/notification.controller.js";

const router = Router();

router.get("", getMyNotifications);
router.get("/unread-count", getUnreadCount);

router.patch("/:id/read", markNotificationRead);
router.patch("/read-all", markAllRead);

router.delete("/:id", deleteNotification);

export default router;

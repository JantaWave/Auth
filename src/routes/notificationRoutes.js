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

router.get("/notifications", authMiddleware, getMyNotifications);
router.get("/notifications/unread-count", authMiddleware, getUnreadCount);

router.patch("/notifications/:id/read", authMiddleware, markNotificationRead);
router.patch("/notifications/read-all", authMiddleware, markAllRead);

router.delete("/notifications/:id", authMiddleware, deleteNotification);

export default router;

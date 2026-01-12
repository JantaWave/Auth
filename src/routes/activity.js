import { Router } from "express";

import {
  deleteActivity,
  getActivityStats,
  getCombinedActivity,
  getMyActivity,
  getUserActivity,
} from "../controllers/activity/activity.controller.js";

const router = Router();

router.get("/me", getUserActivity);
router.get("/myActivities", getMyActivity);
router.get("/combined", getCombinedActivity);
router.get("/stats", getActivityStats);
router.delete("/:activityId", deleteActivity);

export default router;

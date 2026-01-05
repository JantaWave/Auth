import { Router } from "express";

import { getUserActivity } from "../controllers/activity/activity.controller.js";

const router = Router();

router.get("/me", getUserActivity);

export default router;

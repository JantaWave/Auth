import { Router } from "express";
import { registerPushToken } from "../controllers/notifications/push.controller.js";

const router = Router();

router.post("/register", registerPushToken);

export default router;

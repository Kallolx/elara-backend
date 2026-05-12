import { Router } from "express";
import { getSiteSettings, updateSiteSettings } from "../controllers/site-settings.controller";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", getSiteSettings);
router.put("/", verifyToken, isAdmin, updateSiteSettings);

export default router;

import { Router } from "express";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";
import { getDashboardStats } from "../controllers/stats.controller";

const router = Router();

// GET /api/stats/dashboard - Needs admin auth
router.get("/dashboard", verifyToken, isAdmin, getDashboardStats);

export default router;

import { Router } from "express";
import { scrapeKobaProducts, syncInventory, autoSyncFullInventory } from "../controllers/sourcing.controller";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Secure scraper endpoints (Only authenticated ADMIN users can access Koba Sourcing tools)
router.post("/scrape", verifyToken, isAdmin, scrapeKobaProducts);
router.post("/sync-inventory", verifyToken, isAdmin, syncInventory);
router.post("/auto-sync", verifyToken, isAdmin, autoSyncFullInventory);

export default router;

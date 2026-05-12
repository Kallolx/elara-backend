import { Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware";
import { getWishlist, toggleWishlist } from "../controllers/wishlist.controller";

const router = Router();

// Protect all wishlist routes
router.use(verifyToken);

router.get("/", getWishlist);
router.post("/toggle", toggleWishlist);

export default router;

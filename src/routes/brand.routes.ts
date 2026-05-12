import { Router } from "express";
import * as brandController from "../controllers/brand.controller";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Public read access
router.get("/", brandController.getAllBrands);
router.get("/:id", brandController.getBrandById);

// Protected admin writes
router.post("/", verifyToken, isAdmin, brandController.createBrand);
router.put("/:id", verifyToken, isAdmin, brandController.updateBrand);
router.delete("/:id", verifyToken, isAdmin, brandController.deleteBrand);

export default router;

import { Router } from "express";
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  unlinkOffer,
} from "../controllers/product.controller";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Product CRUD routes
router.get("/", getAllProducts);
router.get("/:id", getProductById);

// Protected Admin Mutation routes
router.post("/", verifyToken, isAdmin, createProduct);
router.put("/:id", verifyToken, isAdmin, updateProduct);
router.delete("/:id", verifyToken, isAdmin, deleteProduct);
router.delete("/:id/offers/:offerId", verifyToken, isAdmin, unlinkOffer);

export default router;

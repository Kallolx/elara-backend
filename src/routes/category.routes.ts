import { Router } from "express";
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Category CRUD endpoints
router.get("/", getAllCategories);
router.get("/:id", getCategoryById);

// Protected Admin Mutation routes
router.post("/", verifyToken, isAdmin, createCategory);
router.put("/:id", verifyToken, isAdmin, updateCategory);
router.delete("/:id", verifyToken, isAdmin, deleteCategory);

export default router;

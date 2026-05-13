import express from "express";
import {
  getAllSocialPosts,
  createSocialPost,
  deleteSocialPost,
  updateSocialPost,
} from "../controllers/social-post.controller";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";

const router = express.Router();

// Public endpoint for front-end display
router.get("/", getAllSocialPosts);

// Protected administrative endpoints
router.post("/", verifyToken, isAdmin, createSocialPost);
router.put("/:id", verifyToken, isAdmin, updateSocialPost);
router.delete("/:id", verifyToken, isAdmin, deleteSocialPost);

export default router;

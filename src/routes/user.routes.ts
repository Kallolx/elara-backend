import { Router } from "express";
import { getAllUsers, updateUserRole, deleteUser, updateUserProfile } from "../controllers/user.controller";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Secure Admin-only User endpoints
router.get("/", verifyToken, isAdmin, getAllUsers);
router.put("/:id/role", verifyToken, isAdmin, updateUserRole);

// Secure update user profile endpoint (requester can be the owner or an admin)
router.put("/:id/profile", verifyToken, updateUserProfile);

// Secure delete user endpoint (requester can be the owner or an admin)
router.delete("/:id", verifyToken, deleteUser);

export default router;

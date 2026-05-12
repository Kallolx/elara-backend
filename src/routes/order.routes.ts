import { Router } from "express";
import { createOrder, getMyOrders, getAllOrders, updateOrderStatus, deleteOrder } from "../controllers/order.controller";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Create order (strictly authenticated users only)
router.post("/", verifyToken, createOrder);

// Retrieve authenticated user's order list
router.get("/my-orders", verifyToken, getMyOrders);

// Admin-only: Retrieve all store orders
router.get("/", verifyToken, isAdmin, getAllOrders);

// Admin-only: Update specific order status
router.put("/:id/status", verifyToken, isAdmin, updateOrderStatus);

// Admin-only: Permanently delete order
router.delete("/:id", verifyToken, isAdmin, deleteOrder);

export default router;

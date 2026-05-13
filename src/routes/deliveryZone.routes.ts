import { Router } from "express";
import { 
  getAllDeliveryZones, 
  createDeliveryZone, 
  updateDeliveryZone, 
  deleteDeliveryZone,
  seedDeliveryZonesFromJson
} from "../controllers/deliveryZone.controller";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

// 🌍 Public Route (Needed for Checkout Dropdown)
router.get("/", getAllDeliveryZones);

// 🔐 Admin Controlled Modifications
router.post("/seed-from-json", verifyToken, isAdmin, seedDeliveryZonesFromJson);
router.post("/", verifyToken, isAdmin, createDeliveryZone);
router.put("/:id", verifyToken, isAdmin, updateDeliveryZone);
router.delete("/:id", verifyToken, isAdmin, deleteDeliveryZone);

export default router;



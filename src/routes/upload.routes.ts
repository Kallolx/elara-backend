import { Router } from "express";
import { upload } from "../middlewares/upload.middleware";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware";
import { 
  uploadSingleImage, 
  uploadMultipleImages,
  getAllImages,
  deleteImage 
} from "../controllers/upload.controller";

const router = Router();

// Protected admin-only listing and deletion
router.get("/", verifyToken, isAdmin, getAllImages);
router.delete("/:filename", verifyToken, isAdmin, deleteImage);

// Endpoint for uploading a single file: POST /api/uploads/single
router.post("/single", upload.single("image"), uploadSingleImage);

// Endpoint for uploading multiple files: POST /api/uploads/multiple
router.post("/multiple", upload.array("images", 10), uploadMultipleImages);

export default router;

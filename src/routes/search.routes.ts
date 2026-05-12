import { Router } from "express";
import { globalSearch } from "../controllers/search.controller";

const router = Router();

// Publicly accessible multi-vector lookup engine
router.get("/", globalSearch);

export default router;

import { Router } from "express";
import productRoutes from "./product.routes";
import categoryRoutes from "./category.routes";
import brandRoutes from "./brand.routes";
import uploadRoutes from "./upload.routes";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import sourcingRoutes from "./sourcing.routes";
import siteSettingsRoutes from "./site-settings.routes";
import orderRoutes from "./order.routes";
import socialRoutes from "./social-post.routes";
import statsRoutes from "./stats.routes";
import wishlistRoutes from "./wishlist.routes";
import offerRoutes from "./offer.routes";
import searchRoutes from "./search.routes";
import deliveryZoneRoutes from "./deliveryZone.routes";

const router = Router();

// Mount individual domain routers under unified API namespaces
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/brands", brandRoutes);
router.use("/uploads", uploadRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/sourcing", sourcingRoutes);
router.use("/site-settings", siteSettingsRoutes);
router.use("/orders", orderRoutes);
router.use("/social", socialRoutes);
router.use("/stats", statsRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/offers", offerRoutes);
router.use("/search", searchRoutes);
router.use("/delivery-zones", deliveryZoneRoutes);

export default router;

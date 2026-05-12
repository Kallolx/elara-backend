import { Router } from 'express';
import {
  getOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
} from '../controllers/offer.controller';
import { verifyToken, isAdmin } from '../middlewares/auth.middleware';

const router = Router();

// Public routes (none for offers directly, offers are fetched with products)

// Admin only routes
router.use(verifyToken, isAdmin);

router.get('/', getOffers);
router.get('/:id', getOffer);
router.post('/', createOffer);
router.put('/:id', updateOffer);
router.delete('/:id', deleteOffer);

export default router;

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get all offers
export const getOffers = async (req: Request, res: Response) => {
  try {
    const offers = await prisma.offer.findMany({
      include: {
        products: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(offers);
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
};

// Get single offer
export const getOffer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        products: true,
      },
    });

    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    res.json(offer);
  } catch (error) {
    console.error('Error fetching offer:', error);
    res.status(500).json({ error: 'Failed to fetch offer' });
  }
};

// Create offer
export const createOffer = async (req: Request, res: Response) => {
  try {
    const {
      title,
      code,
      discountType,
      discountValue,
      status,
      isFlashSale,
      startDate,
      endDate,
      productIds,
    } = req.body;

    const offer = await prisma.offer.create({
      data: {
        title,
        code: code || null,
        discountType,
        discountValue,
        status,
        isFlashSale,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        products: {
          connect: productIds ? productIds.map((id: String) => ({ id })) : [],
        },
      },
      include: {
        products: true,
      },
    });

    res.status(201).json(offer);
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({ error: 'Failed to create offer' });
  }
};

// Update offer
export const updateOffer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      code,
      discountType,
      discountValue,
      status,
      isFlashSale,
      startDate,
      endDate,
      productIds,
    } = req.body;

    // Disconnect all existing products, then connect new ones
    const offer = await prisma.offer.update({
      where: { id },
      data: {
        title,
        code: code || null,
        discountType,
        discountValue,
        status,
        isFlashSale,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        products: {
          set: productIds ? productIds.map((id: String) => ({ id })) : [],
        },
      },
      include: {
        products: true,
      },
    });

    res.json(offer);
  } catch (error) {
    console.error('Error updating offer:', error);
    res.status(500).json({ error: 'Failed to update offer' });
  }
};

// Delete offer
export const deleteOffer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.offer.delete({
      where: { id },
    });
    res.json({ message: 'Offer deleted successfully' });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ error: 'Failed to delete offer' });
  }
};

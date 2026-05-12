import { Request, Response, NextFunction } from "express";
import prisma from "../config/database";

export const getWishlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wishlist: {
          include: {
            sizes: true,
            category: true,
            brand: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: user.wishlist
    });
  } catch (error) {
    next(error);
  }
};

export const toggleWishlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: "Product ID is required" });
    }

    // Ensure product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Check if user already has it in wishlist
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wishlist: { select: { id: true } } }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isWishlisted = user.wishlist.some(p => p.id === productId);

    let updatedUser;
    if (isWishlisted) {
      // Remove from wishlist
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          wishlist: {
            disconnect: { id: productId }
          }
        },
        include: { wishlist: { select: { id: true } } }
      });
    } else {
      // Add to wishlist
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          wishlist: {
            connect: { id: productId }
          }
        },
        include: { wishlist: { select: { id: true } } }
      });
    }

    res.status(200).json({
      success: true,
      message: isWishlisted ? "Removed from wishlist" : "Added to wishlist",
      data: {
        wishlistIds: updatedUser.wishlist.map(p => p.id)
      }
    });
  } catch (error) {
    next(error);
  }
};

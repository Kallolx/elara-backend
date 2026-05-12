import { Request, Response, NextFunction } from "express";
import prisma from "../config/database";

export const globalSearch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. STRICT SANITIZATION & TRUNCATION
    // Immediately limit buffer to 100 chars to prevent oversized packet overflows
    let rawQuery = (req.query.q as string || "").substring(0, 100);
    
    // Strip any potential HTML tags, control characters, and risky regex operators
    // Allowing safe: letters, numbers, spaces, hyphens, dots, commas, and underscores
    const searchTerm = rawQuery.replace(/[^\p{L}\p{N}\s.\-_,]/gu, '').trim();

    if (!searchTerm || searchTerm.length < 2) {
       res.status(200).json({
        success: true,
        data: { products: [], brands: [], categories: [] }
      });
      return;
    }

    // Parallel execution using Promise.all for optimum backend latency
    const [products, brands, categories] = await Promise.all([
      prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { sku: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          sku: true,
          image: true,
          isOutOfStock: true,
          sizes: { take: 1, select: { label: true, price: true, oldPrice: true } },
          offers: {
            where: { status: "ACTIVE" },
            take: 1,
            select: { title: true, discountType: true, discountValue: true }
          }
        },
        take: 6,
      }),
      prisma.brand.findMany({
        where: {
          name: { contains: searchTerm, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          logo: true,
          slug: true
        },
        take: 3,
      }),
      prisma.category.findMany({
        where: {
          name: { contains: searchTerm, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          icon: true,
          slug: true
        },
        take: 3,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        products,
        brands,
        categories,
      },
    });
  } catch (error: any) {
    console.error("Search failure:", error);
    res.status(500).json({
      success: false,
      message: "Internal search engine failure.",
      error: error.message
    });
  }
};

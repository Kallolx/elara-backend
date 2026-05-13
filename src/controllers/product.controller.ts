import { Request, Response, NextFunction } from "express";
import prisma from "../config/database";

// Fetch all products with pagination, search, and filtering capabilities
export const getAllProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId, brandId, search } = req.query;
    
    // Pagination controls
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 0; // default 0 means fetch all for compatibility
    const skip = limit > 0 ? (page - 1) * limit : undefined;
    const take = limit > 0 ? limit : undefined;

    // Dynamic query conditions
    const whereConditions: any = {
      ...(categoryId ? { categoryId: String(categoryId) } : {}),
      ...(brandId ? { brandId: String(brandId) } : {}),
    };

    // Highly optimized Name & SKU Fuzzy Search Injection
    if (search && String(search).trim().length > 0) {
      const cleanSearch = String(search).trim();
      whereConditions.OR = [
        { name: { contains: cleanSearch, mode: "insensitive" } },
        { sku: { contains: cleanSearch, mode: "insensitive" } },
      ];
    }

    // Execute total metric aggregation and entity collection in parallel
    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: whereConditions,
        include: {
          category: { select: { name: true, slug: true } },
          brand: true,
          offers: true,
          sizes: { orderBy: { price: "asc" } },
          reviews: { orderBy: { date: "desc" } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.product.count({ where: whereConditions }),
    ]);

    res.status(200).json({ 
      success: true, 
      data: products,
      pagination: {
        total: totalCount,
        page: page,
        limit: limit > 0 ? limit : totalCount,
        totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 1
      }
    });
  } catch (error) {
    next(error);
  }
};

// Fetch a single product by ID or Slug (e.g., "EL-CLN-VC-150" or "bright-cleanser")
export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    let product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          select: { name: true, slug: true },
        },
        brand: true,
        offers: true,
        sizes: {
          orderBy: { price: "asc" },
        },
        reviews: {
          orderBy: { date: "desc" },
        },
      },
    });

    if (!product) {
      // Fallback: match by dynamic slug
      const allProducts = await prisma.product.findMany({
        include: {
          category: {
            select: { name: true, slug: true },
          },
          brand: true,
          offers: true,
          sizes: {
            orderBy: { price: "asc" },
          },
          reviews: {
            orderBy: { date: "desc" },
          },
        },
      });

      product = allProducts.find((p) => {
        const dynamicSlug = p.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "");
        return dynamicSlug === id;
      }) || null;
    }

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

// Create a new product with sizes and reviews
export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      id,
      sku,
      name,
      categoryId,
      subcategory,
      hasOffer,
      rating,
      reviewCount,
      shortDescription,
      description,
      ingredients,
      howToUse,
      image,
      gallery,
      isOutOfStock, // Added global state
      sizes,   // Array of { label, price, oldPrice, sku, isOutOfStock }
      reviews, // Array of { author, rating, title, text }
      brandId,
    } = req.body;

    if (!sku || !name || !categoryId) {
      return res.status(400).json({
        success: false,
        message: "SKU, Name, and Category ID are required fields",
      });
    }

    // Verify category exists
    const categoryExists = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!categoryExists) {
      return res.status(400).json({ success: false, message: "Specified Category ID does not exist" });
    }

    // Auto-generate Product ID if not provided
    let finalId = id;
    if (!finalId) {
      const categorySlug = categoryExists.slug || "product";
      const productSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      finalId = `EL-${categorySlug.toUpperCase()}-${productSlug.toUpperCase()}-${randomSuffix}`;
    }

    // Check if ID is unique
    const idExists = await prisma.product.findUnique({ where: { id: finalId } });
    if (idExists) {
      return res.status(400).json({ success: false, message: "Product with this ID already exists" });
    }

    // Check if SKU is unique
    const skuExists = await prisma.product.findUnique({ where: { sku } });
    if (skuExists) {
      return res.status(400).json({ success: false, message: "Product with this SKU already exists" });
    }

    // Create the product atomic operation
    const product = await prisma.product.create({
      data: {
        id: finalId,
        sku,
        name,
        categoryId,
        brandId: brandId || null,
        subcategory,
        hasOffer: hasOffer || false,
        rating: rating ? Number(rating) : 0.0,
        reviewCount: reviewCount ? Number(reviewCount) : 0,
        shortDescription,
        description,
        ingredients: ingredients || [],
        howToUse: howToUse || [],
        image,
        gallery: gallery || [],
        isOutOfStock: isOutOfStock === true,
        sizes: sizes && Array.isArray(sizes) ? {
          create: sizes.map((s: any) => ({
            label: s.label,
            price: Number(s.price),
            oldPrice: s.oldPrice ? Number(s.oldPrice) : null,
            sku: s.sku || null,
            isOutOfStock: s.isOutOfStock === true,
          })),
        } : undefined,
        reviews: reviews && Array.isArray(reviews) ? {
          create: reviews.map((r: any) => ({
            author: r.author,
            rating: Number(r.rating),
            title: r.title,
            text: r.text,
            date: r.date ? new Date(r.date) : new Date(),
          })),
        } : undefined,
      },
      include: {
        sizes: true,
        reviews: true,
        brand: true,
        offers: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

// Update an existing product and nested sizes/reviews in a transaction
export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const {
      sku,
      name,
      categoryId,
      subcategory,
      hasOffer,
      rating,
      reviewCount,
      shortDescription,
      description,
      ingredients,
      howToUse,
      image,
      gallery,
      isOutOfStock, // Added global state
      sizes,        // Array of { label, price, oldPrice, sku, isOutOfStock }
      reviews,
      brandId,
    } = req.body;

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (sku && sku !== existingProduct.sku) {
      const skuCheck = await prisma.product.findUnique({ where: { sku } });
      if (skuCheck) {
        return res.status(400).json({ success: false, message: "Product with this SKU already exists" });
      }
    }

    if (categoryId) {
      const categoryExists = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!categoryExists) {
        return res.status(400).json({ success: false, message: "Specified Category ID does not exist" });
      }
    }

    // Process nested updates atomically inside a transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Handle sizes recreation if provided
      if (sizes && Array.isArray(sizes)) {
        await tx.productSize.deleteMany({ where: { productId: id } });
      }

      // Handle reviews recreation if provided
      if (reviews && Array.isArray(reviews)) {
        await tx.review.deleteMany({ where: { productId: id } });
      }

      return tx.product.update({
        where: { id },
        data: {
          sku,
          name,
          categoryId,
          brandId: brandId !== undefined ? (brandId || null) : undefined,
          subcategory,
          hasOffer,
          rating: rating !== undefined && rating !== null ? Number(rating) : undefined,
          reviewCount: reviewCount !== undefined && reviewCount !== null ? Number(reviewCount) : undefined,
          shortDescription,
          description,
          ingredients,
          howToUse,
          image,
          gallery,
          isOutOfStock: isOutOfStock !== undefined ? (isOutOfStock === true) : undefined,
          sizes: sizes && Array.isArray(sizes) ? {
            create: sizes.map((s: any) => ({
              label: s.label,
              price: Number(s.price),
              oldPrice: s.oldPrice ? Number(s.oldPrice) : null,
              sku: s.sku || null,
              isOutOfStock: s.isOutOfStock === true,
            })),
          } : undefined,
          reviews: reviews && Array.isArray(reviews) ? {
            create: reviews.map((r: any) => ({
              author: r.author,
              rating: Number(r.rating),
              title: r.title,
              text: r.text,
              date: r.date ? new Date(r.date) : new Date(),
            })),
          } : undefined,
        },
        include: {
          sizes: true,
          reviews: true,
          brand: true,
          offers: true,
        },
      });
    });

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// Delete product (cascades automatically to sizes and reviews)
export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    await prisma.product.delete({ where: { id } });

    res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// Unlink an offer from a product
export const unlinkOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: productId, offerId } = req.params;
    
    await prisma.product.update({
      where: { id: productId },
      data: {
        offers: {
          disconnect: { id: offerId }
        }
      }
    });
    
    res.json({ success: true, message: "Offer unlinked from product successfully" });
  } catch (error) {
    next(error);
  }
};

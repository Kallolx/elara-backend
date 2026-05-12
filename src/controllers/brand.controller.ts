import { Request, Response, NextFunction } from "express";
import prisma from "../config/database";

// Fetch all brands
export const getAllBrands = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const brands = await prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    const formatted = brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logo: b.logo,
      description: b.description,
      website: b.website,
      status: b.status,
      productsCount: b._count.products,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
};

// Fetch single brand by ID or Slug
export const getBrandById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    const brand = await prisma.brand.findFirst({
      where: {
        OR: [{ id: id }, { slug: id }],
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    res.status(200).json({ success: true, data: brand });
  } catch (error) {
    next(error);
  }
};

// Create new brand
export const createBrand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, logo, description, website, status } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ success: false, message: "Name and slug are required" });
    }

    const existingSlug = await prisma.brand.findUnique({ where: { slug } });
    if (existingSlug) {
      return res.status(400).json({ success: false, message: "Slug already in use" });
    }

    const brand = await prisma.brand.create({
      data: {
        name,
        slug,
        logo,
        description,
        website,
        status: status || "Active",
      },
    });

    res.status(201).json({ success: true, message: "Brand created", data: brand });
  } catch (error) {
    next(error);
  }
};

// Update brand
export const updateBrand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, slug, logo, description, website, status } = req.body;

    const existing = await prisma.brand.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    if (slug && slug !== existing.slug) {
      const slugCheck = await prisma.brand.findUnique({ where: { slug } });
      if (slugCheck) {
        return res.status(400).json({ success: false, message: "Slug already in use" });
      }
    }

    const updated = await prisma.brand.update({
      where: { id },
      data: {
        name,
        slug,
        logo,
        description,
        website,
        status,
      },
    });

    res.status(200).json({ success: true, message: "Brand updated", data: updated });
  } catch (error) {
    next(error);
  }
};

// Delete brand
export const deleteBrand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.brand.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    await prisma.brand.delete({ where: { id } });

    res.status(200).json({ success: true, message: "Brand deleted successfully" });
  } catch (error) {
    next(error);
  }
};

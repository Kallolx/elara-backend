import { Request, Response, NextFunction } from "express";
import prisma from "../config/database";

// Fetch all categories
export const getAllCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    // Format count to match the expected products field on frontend
    const formatted = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      status: cat.status,
      icon: cat.icon,
      description: cat.description,
      image: cat.image,
      subcategories: cat.subcategories,
      products: cat._count.products,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
};

// Fetch single category by ID
export const getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        products: true,
      },
    });

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.status(200).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

// Create a new category
export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, status, icon, description, image, subcategories } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ success: false, message: "Name and Slug are required" });
    }

    // Check if slug is unique
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      return res.status(400).json({ success: false, message: "Category slug must be unique" });
    }

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        status: status || "Active",
        icon: icon || "Grid",
        description,
        image,
        subcategories: subcategories || [],
      },
    });

    res.status(201).json({ success: true, message: "Category created successfully", data: category });
  } catch (error) {
    next(error);
  }
};

// Update an existing category by ID
export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, slug, status, icon, description, image, subcategories } = req.body;

    const existingCategory = await prisma.category.findUnique({ where: { id } });
    if (!existingCategory) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    // If slug is changed, check if it's unique
    if (slug && slug !== existingCategory.slug) {
      const slugCheck = await prisma.category.findUnique({ where: { slug } });
      if (slugCheck) {
        return res.status(400).json({ success: false, message: "Category slug must be unique" });
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name,
        slug,
        status,
        icon,
        description,
        image,
        subcategories: subcategories !== undefined ? subcategories : undefined,
      },
    });

    res.status(200).json({ success: true, message: "Category updated successfully", data: updated });
  } catch (error) {
    next(error);
  }
};

// Delete category by ID
export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    await prisma.category.delete({ where: { id } });

    res.status(200).json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    next(error);
  }
};

import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import prisma from "../config/database";

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// helper to extract just filename from full path/url
const extractFilename = (str: string | null | undefined) => {
  if (!str) return null;
  try {
    const parts = str.split(/[/\\]/);
    return parts[parts.length - 1];
  } catch (e) {
    return null;
  }
};

export const uploadSingleImage = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const fileUrl = `${backendUrl}/uploads/${req.file.filename}`;

    res.status(201).json({
      success: true,
      message: "Image uploaded successfully",
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: fileUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadMultipleImages = (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const uploadedFiles = files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `${backendUrl}/uploads/${file.filename}`,
    }));

    res.status(201).json({
      success: true,
      message: `${files.length} images uploaded successfully`,
      data: uploadedFiles,
    });
  } catch (error) {
    next(error);
  }
};

// Fetch all uploaded media files with intelligent usage tracking
export const getAllImages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      return res.status(200).json({ success: true, data: [] });
    }

    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const filenames = fs.readdirSync(UPLOADS_DIR);

    // Build a reverse lookup database map of image usage
    const [dbProducts, dbCategories, dbBrands] = await Promise.all([
      prisma.product.findMany({ select: { id: true, name: true, image: true, gallery: true } }),
      prisma.category.findMany({ select: { id: true, name: true, image: true } }),
      prisma.brand.findMany({ select: { id: true, name: true, logo: true } }),
    ]);

    // Fast lookup structures
    const usageMap: Record<string, { type: string; id: string; name: string }[]> = {};

    const addUsage = (filename: string | null, type: string, item: { id: string, name: string }) => {
      const clean = extractFilename(filename);
      if (!clean) return;
      if (!usageMap[clean]) usageMap[clean] = [];
      // Deduplicate multiple inclusions
      if (!usageMap[clean].some(u => u.id === item.id && u.type === type)) {
        usageMap[clean].push({ type, id: item.id, name: item.name });
      }
    };

    // Map usages
    dbProducts.forEach(p => {
      addUsage(p.image, "Product", p);
      if (p.gallery && Array.isArray(p.gallery)) {
        p.gallery.forEach(g => addUsage(g, "Product", p));
      }
    });

    dbCategories.forEach(c => {
      addUsage(c.image, "Category", c);
    });

    dbBrands.forEach(b => {
      addUsage(b.logo, "Brand", b);
    });

    const filesInfo = filenames
      .map((name) => {
        try {
          const stats = fs.statSync(path.join(UPLOADS_DIR, name));
          if (!stats.isFile()) return null;

          const usages = usageMap[name] || [];
          
          // Determine top category/folder
          let group = "Unassigned";
          if (usages.length > 0) {
            // If it appears in multiple, choose the dominant one, else pick first
            group = usages[0].type + "s"; // e.g. "Products"
          }

          return {
            filename: name,
            size: stats.size,
            createdAt: stats.mtime,
            url: `${backendUrl}/uploads/${name}`,
            usages: usages,
            group: group
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());

    res.status(200).json({ success: true, data: filesInfo });
  } catch (error) {
    next(error);
  }
};

// Delete a specific image file
export const deleteImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOADS_DIR, filename);

    // Basic path traversal security prevention
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ success: false, message: "Invalid filename supplied" });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "File not found on server" });
    }

    fs.unlinkSync(filePath);

    res.status(200).json({ success: true, message: "File deleted successfully" });
  } catch (error) {
    next(error);
  }
};

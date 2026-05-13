import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getAllSocialPosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const posts = await prisma.socialPost.findMany({
      orderBy: { order: "asc" },
      include: {
        products: {
          include: {
            sizes: true,
          },
        },
      },
    });
    res.status(200).json({ success: true, data: posts });
  } catch (error) {
    next(error);
  }
};

export const createSocialPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, mediaUrl, link, order, thumbnailUrl, productIds } = req.body;

    if (!mediaUrl || !productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, message: "mediaUrl and productIds (array) are required" });
    }

    const post = await prisma.socialPost.create({
      data: {
        type: type || "video",
        mediaUrl,
        thumbnailUrl,
        link,
        order: order ? Number(order) : 0,
        products: {
          connect: productIds.map((id: string) => ({ id }))
        }
      },
      include: {
        products: true
      }
    });

    res.status(201).json({ success: true, message: "Social post added", data: post });
  } catch (error) {
    next(error);
  }
};

export const updateSocialPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { type, mediaUrl, link, order, thumbnailUrl, productIds } = req.body;

    const post = await prisma.socialPost.update({
      where: { id },
      data: {
        type,
        mediaUrl,
        thumbnailUrl,
        link,
        order: order ? Number(order) : 0,
        products: productIds ? {
          set: [], // Clear existing
          connect: productIds.map((id: string) => ({ id }))
        } : undefined
      },
      include: {
        products: true
      }
    });

    res.status(200).json({ success: true, message: "Social post updated", data: post });
  } catch (error) {
    next(error);
  }
};

export const deleteSocialPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await prisma.socialPost.delete({
      where: { id },
    });

    res.status(200).json({ success: true, message: "Social post deleted successfully" });
  } catch (error) {
    next(error);
  }
};

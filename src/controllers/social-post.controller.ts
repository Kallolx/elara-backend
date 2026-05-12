import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getAllSocialPosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const posts = await prisma.socialPost.findMany({
      orderBy: { order: "asc" },
    });
    res.status(200).json({ success: true, data: posts });
  } catch (error) {
    next(error);
  }
};

export const createSocialPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, mediaUrl, link, order } = req.body;

    if (!mediaUrl) {
      return res.status(400).json({ success: false, message: "mediaUrl is required" });
    }

    const post = await prisma.socialPost.create({
      data: {
        type: type || "image",
        mediaUrl,
        link,
        order: order ? Number(order) : 0,
      },
    });

    res.status(201).json({ success: true, message: "Social post added", data: post });
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

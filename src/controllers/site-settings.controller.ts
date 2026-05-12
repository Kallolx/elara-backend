import { Request, Response, NextFunction } from "express";
import prisma from "../config/database";

export const getSiteSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let settings = await prisma.siteSettings.findUnique({
      where: { id: "default" },
    });

    if (!settings) {
      const defaultBanners = [
        {
          image: "/products/cleanser.png",
          smallText: "Natural • Soft • Everyday Care",
          title: "Creamy skincare for warm routines.",
          buttonText: "Explore products",
          buttonLink: "#shop",
        },
      ];

      settings = await prisma.siteSettings.create({
        data: {
          id: "default",
          logo: "",
          logoAlt: "Elara",
          banners: defaultBanners,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve site settings",
    });
  }
};

export const updateSiteSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      logo,
      logoAlt,
      banners,
      socialProfileUrl,
      featuredProductIds,
    } = req.body;

    const settings = await prisma.siteSettings.upsert({
      where: { id: "default" },
      update: {
        logo,
        logoAlt,
        banners: banners || [],
        socialProfileUrl,
        featuredProductIds: featuredProductIds || [],
      },
      create: {
        id: "default",
        logo: logo || "",
        logoAlt: logoAlt || "Elara",
        banners: banners || [],
        socialProfileUrl: socialProfileUrl || "https://instagram.com",
        featuredProductIds: featuredProductIds || [],
      },
    });

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update site settings",
    });
  }
};

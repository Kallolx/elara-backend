import { Request, Response, NextFunction } from "express";
import prisma from "../config/database";
import * as fs from "fs";
import * as path from "path";

// 📡 Retrieve all available geographic zones
export const getAllDeliveryZones = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const zones = await prisma.deliveryZone.findMany({
      orderBy: { district: "asc" }
    });
    
    return res.status(200).json({
      success: true,
      count: zones.length,
      data: zones
    });
  } catch (error: any) {
    console.error("❌ Failed to fetch delivery zones:", error.message);
    res.status(500).json({ success: false, message: "Database read failure." });
  }
};

// ➕ Add a new geographic district
export const createDeliveryZone = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { district, charge, subAreas } = req.body;

    if (!district) {
      return res.status(400).json({ success: false, message: "District name is required." });
    }

    // Uniqueness verification
    const existing = await prisma.deliveryZone.findUnique({ where: { district } });
    if (existing) {
      return res.status(409).json({ success: false, message: `A location named '${district}' already exists.` });
    }

    const newZone = await prisma.deliveryZone.create({
      data: {
        district,
        charge: parseFloat(charge || "0"),
        subAreas: Array.isArray(subAreas) ? subAreas : []
      }
    });

    return res.status(201).json({
      success: true,
      message: `Location '${district}' added to system.`,
      data: newZone
    });
  } catch (error: any) {
    console.error("❌ Create zone failure:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔐 Modify properties of a district (Admin action - supports comprehensive updates)
export const updateDeliveryZone = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { district, charge, subAreas } = req.body;

    const dataToUpdate: any = {};
    if (district !== undefined) dataToUpdate.district = district;
    if (charge !== undefined) dataToUpdate.charge = parseFloat(charge);
    if (subAreas !== undefined && Array.isArray(subAreas)) dataToUpdate.subAreas = subAreas;

    const updatedZone = await prisma.deliveryZone.update({
      where: { id },
      data: dataToUpdate
    });

    return res.status(200).json({
      success: true,
      message: `Location '${updatedZone.district}' updated successfully.`,
      data: updatedZone
    });
  } catch (error: any) {
    console.error("❌ Update location failure:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🗑️ Remove a geographic district entirely
export const deleteDeliveryZone = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    const deleted = await prisma.deliveryZone.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: `Successfully wiped '${deleted.district}' from delivery catalog.`
    });
  } catch (error: any) {
    console.error("❌ Delete location failure:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🌱 Hydrate database with pre-harvested 65 districts from local storage
export const seedDeliveryZonesFromJson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Resilient path resolving: compiled node distributions running from dist/ do not copy JSON files by default.
    // We cascade search local directories and project root (process.cwd) to guarantee asset recovery!
    let jsonPath = path.join(__dirname, "..", "delivery-locations-seed.json");

    if (!fs.existsSync(jsonPath)) {
      // Fallback A: Inspect standard src/ relative to server project root (Works 100% on client VPS)
      jsonPath = path.join(process.cwd(), "src", "delivery-locations-seed.json");
    }

    if (!fs.existsSync(jsonPath)) {
      // Fallback B: Inspect standard root root 
      jsonPath = path.join(process.cwd(), "delivery-locations-seed.json");
    }

    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ 
        success: false, 
        message: `Ingestion failure: Static geographical asset missing from running process. Checked: ${path.join(process.cwd(), "src", "delivery-locations-seed.json")}` 
      });
    }

    const rawData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    
    const cleanDistricts = rawData.filter((item: any) => {
      const name = item.district.toLowerCase();
      return (
        !name.includes("charge") && 
        !name.includes("fee") && 
        !name.includes("amount") &&
        item.subAreas && 
        item.subAreas.length > 0 && 
        item.subAreas[0] !== "Fixed"
      );
    });

    let count = 0;
    for (const item of cleanDistricts) {
      await prisma.deliveryZone.upsert({
        where: { district: item.district },
        update: {
          subAreas: item.subAreas,
          charge: item.charge
        },
        create: {
          district: item.district,
          subAreas: item.subAreas,
          charge: item.charge
        }
      });
      count++;
    }

    return res.status(200).json({
      success: true,
      message: `1-Click Hydration Complete: Synced ${count} verified districts and mapped their sub-areas.`,
      count
    });
  } catch (error: any) {
    console.error("❌ Seed route triggered failure:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};



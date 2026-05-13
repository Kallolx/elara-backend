import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function seed() {
  console.log("📦 Commencing database injection of Delivery Zones...");
  
  const jsonPath = path.join(__dirname, "delivery-locations-seed.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("❌ Missing seed source! Run harvest script first.");
    return;
  }

  const rawData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  
  // Filter out meta items/pricing variables that are not actual geographical districts
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

  console.log(`🎯 Filtered and identified ${cleanDistricts.length} valid geographic Districts to seed.`);

  let count = 0;
  for (const item of cleanDistricts) {
    try {
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
    } catch (err: any) {
      console.error(`⚠️ Failed injecting ${item.district}:`, err.message);
    }
  }

  console.log(`\n=========================================`);
  console.log(`🎉 SEED INJECTION SUCCESSFUL!`);
  console.log(`✅ Synced ${count} of ${cleanDistricts.length} districts successfully.`);
  console.log(`=========================================\n`);
  
  await prisma.$disconnect();
}

seed().catch(async (e) => {
  console.error("💥 Critical Seed Fault:", e);
  await prisma.$disconnect();
  process.exit(1);
});

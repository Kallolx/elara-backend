import prisma from "../config/database";
import puppeteer from "puppeteer";

// Live Puppeteer Koba Reseller Dashboard Scraper
export const scrapeKobaProducts = async (req: any, res: any, next: any) => {
  let browser;
  try {
    console.log("🚀 Launching Puppeteer for live reseller scraping...");
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.platform === "win32" 
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" 
        : undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1440, height: 900 });

    // 1. Navigate to Koba Reseller Login page
    console.log("📍 Navigating to Koba Reseller Login...");
    await page.goto("https://www.kobareseller.com/login", { waitUntil: "networkidle2" });

    // 2. Perform automated login using configured environment credentials
    const email = process.env.KOBA_EMAIL;
    const password = process.env.KOBA_PASSWORD;

    if (!email || !password) {
      throw new Error("Missing KOBA_EMAIL or KOBA_PASSWORD inside environment variables (.env file).");
    }

    console.log(`🔑 Authenticating with reseller account...`);
    await page.type("#email", email);
    await page.type("#password", password);

    const submitBtn = await page.$("button[type='submit']");
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const loginBtn = btns.find((b) => b.textContent?.toLowerCase().includes("log in"));
        if (loginBtn) loginBtn.click();
      });
    }

    // Wait for validation and redirection
    console.log("⏳ Waiting for credentials validation...");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 });

    // 3. Navigate directly to Reseller Products Dashboard
    const { url } = req.body;
    const targetUrl = url || "https://www.kobareseller.com/dashboard/products";
    console.log(`📍 Fetching product listings from: ${targetUrl}...`);
    await page.goto(targetUrl, {
      waitUntil: "networkidle2",
    });

    // 4. Extract and parse items with clean title parsing
    const products = await page.evaluate((url) => {
      const items: any[] = [];
      const imgElements = Array.from(document.querySelectorAll("img"));

      imgElements.forEach((img) => {
        const src = img.getAttribute("src") || "";
        if (!src || src.includes("logo") || src.includes("avatar")) return;

        let parent = img.parentElement;
        let cardText = "";
        let iterations = 0;

        while (parent && iterations < 5) {
          cardText = parent.textContent || "";
          if (cardText.includes("SKU:") && cardText.includes("Price")) {
            break;
          }
          parent = parent.parentElement;
          iterations++;
        }

        if (parent && cardText.includes("SKU:") && cardText.includes("Price")) {
          const rawTitle = parent.textContent || "";
          // Clean title by splitting at the SKU mark
          const name = rawTitle.split("SKU:")[0].trim();
          
          const skuMatch = cardText.match(/SKU:\s*([A-Z0-9-]+)/i) || cardText.match(/SKU:\s*(\d+)/i);
          const sku = skuMatch ? skuMatch[1] : "";

          const priceMatch = cardText.replace(/\s/g, "").match(/Price৳(\d+)/i) || 
                             cardText.replace(/\s/g, "").match(/৳(\d+)/i);
          const price = priceMatch ? Number(priceMatch[1]) : 1200;

          const commissionMatch = cardText.replace(/\s/g, "").match(/Commission৳([\d.]+)/i);
          const commission = commissionMatch ? Number(commissionMatch[1]) : 0;

          // Parse stock quantity or statuses dynamically
          const stockMatch = cardText.match(/(?:Stock|Qty|Available|Quantity):\s*(\d+)/i);
          let stockStatus = stockMatch ? `${stockMatch[1]} Units` : "Unknown";
          
          let isOutOfStock = /Out\s*of\s*Stock/i.test(cardText) || /Sold\s*Out/i.test(cardText);
          
          // If explicitly states 'In Stock' but no number, label it
          if (stockStatus === "Unknown" && /In\s*Stock/i.test(cardText)) {
             stockStatus = "In Stock";
          } else if (isOutOfStock) {
             stockStatus = "Out of Stock";
          }

          if (sku && !items.some((item) => item.sku === sku)) {
            items.push({
              sku: `KOBA-${sku}`,
              name: name,
              price: price,
              commission: commission,
              stockStatus: stockStatus,
              isOutOfStock: isOutOfStock,
              oldPrice: Math.round(price * 1.15), // Auto retail margin of 15% markup
              image: src,
              url: url,
              category: "Skin Care",
              shortDescription: `Authentic Koba Reseller skincare product: ${name}.`,
              description: `This premium ${name} is sourced directly from your Koba Reseller dashboard. High-potency, reseller commission-based skin therapy.`,
            });
          }
        }
      });

      return items;
    }, targetUrl);

    console.log(`🎉 Successfully scraped ${products.length} live reseller products!`);

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error: any) {
    console.error("❌ Live Scraper Error:", error.message);
    res.status(500).json({
      success: false,
      message: `Failed to scrape products: ${error.message}`,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

// Bulk Sync Inventory State using Latest Scrape Result
export const syncInventory = async (req: any, res: any, next: any) => {
  try {
    const { scrapedProducts } = req.body;

    if (!scrapedProducts || !Array.isArray(scrapedProducts)) {
      return res.status(400).json({ success: false, message: "Invalid scraped products list provided." });
    }

    let updateCount = 0;
    
    // Construct a mapping of scraped SKUs to their Out of Stock boolean
    const scrapeMap = new Map();
    scrapedProducts.forEach((p: any) => {
      scrapeMap.set(p.sku, p.isOutOfStock === true);
    });

    // Fetch all products currently in our local database that match ANY of the scraped SKUs
    const localProducts = await prisma.product.findMany({
      where: {
        sku: {
          in: Array.from(scrapeMap.keys())
        }
      },
      select: { id: true, sku: true, isOutOfStock: true }
    });

    // Perform batch update transactions for mismatched states
    const updates = localProducts
      .filter(p => scrapeMap.get(p.sku) !== p.isOutOfStock)
      .map(p => 
        prisma.product.update({
          where: { id: p.id },
          data: { isOutOfStock: scrapeMap.get(p.sku) }
        })
      );

    if (updates.length > 0) {
      await prisma.$transaction(updates);
      updateCount = updates.length;
    }

    console.log(`🔄 Synced inventory for ${updateCount} products based on latest scrape.`);

    res.status(200).json({
      success: true,
      message: `Successfully synchronized inventory. Updated status of ${updateCount} products!`,
      updatedCount: updateCount
    });

  } catch (error: any) {
    console.error("❌ Failed to Sync Inventory:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Full-Automated Background Direct Sync: Scraping multiple pages sequentially and updating DB internally.
export const autoSyncFullInventory = async (req: any, res: any, next: any) => {
  let browser;
  try {
    console.log("🚀 Initiating Full Background Automated Stock Sync...");
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.platform === "win32" 
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" 
        : undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1440, height: 900 });

    // 1. Login Routine
    console.log("📍 Logging into Koba portal...");
    await page.goto("https://www.kobareseller.com/login", { waitUntil: "networkidle2" });
    
    const email = process.env.KOBA_EMAIL;
    const password = process.env.KOBA_PASSWORD;
    if (!email || !password) throw new Error("Missing configuration: KOBA_EMAIL / KOBA_PASSWORD.");

    await page.type("#email", email);
    await page.type("#password", password);
    const submitBtn = await page.$("button[type='submit']");
    if (submitBtn) { await submitBtn.click(); } else {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.toLowerCase().includes("log in"));
        if (btn) btn.click();
      });
    }
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 });
    console.log("✅ Login Successful. Beginning Multi-page Extraction Loop...");

    // 2. Deep Crawl Loop (Max 15 pages)
    let allFoundProducts: any[] = [];
    const MAX_PAGES = 15;

    for (let p = 1; p <= MAX_PAGES; p++) {
      const pageUrl = `https://www.kobareseller.com/dashboard/products?page=${p}`;
      console.log(`📄 Scanning page ${p} of ${MAX_PAGES}...`);
      
      await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 20000 });

      // Give extra 1 second just to be sure dynamic images loaded
      await new Promise(resolve => setTimeout(resolve, 1200));

      const pageItems = await page.evaluate(() => {
        const items: any[] = [];
        const images = Array.from(document.querySelectorAll("img"));
        
        images.forEach((img) => {
          const src = img.getAttribute("src") || "";
          if (!src || src.includes("logo")) return;
          
          let parent = img.parentElement;
          let iters = 0;
          while (parent && iters < 5) {
            if (parent.textContent?.includes("SKU:") && parent.textContent?.includes("Price")) break;
            parent = parent.parentElement;
            iters++;
          }

          if (parent && parent.textContent) {
            const text = parent.textContent;
            const skuMatch = text.match(/SKU:\s*([A-Z0-9-]+)/i) || text.match(/SKU:\s*(\d+)/i);
            if (!skuMatch) return;
            const rawSku = skuMatch[1];
            
            const isOutOfStock = /Out\s*of\s*Stock/i.test(text) || /Sold\s*Out/i.test(text);
            
            if (!items.some(x => x.sku === rawSku)) {
              items.push({ sku: `KOBA-${rawSku}`, isOutOfStock });
            }
          }
        });
        return items;
      });

      console.log(`   -> Found ${pageItems.length} items on page ${p}.`);
      
      if (pageItems.length === 0) {
        console.log("🛑 No more products found on this page. Stopping iteration early.");
        break; // Exit loop if page is empty
      }

      allFoundProducts.push(...pageItems);
    }

    await browser.close();
    console.log(`🏁 Scan Complete! Total parsed unique items: ${allFoundProducts.length}`);

    // 3. Database Bulk Processing
    if (allFoundProducts.length === 0) {
      return res.status(200).json({ success: false, message: "Scraper finished but no products were parsed from supplier dashboard." });
    }

    // Deduplicate by SKU to be safe
    const scrapeMap = new Map();
    allFoundProducts.forEach(p => scrapeMap.set(p.sku, p.isOutOfStock));

    // Fetch all currently local products in Elara DB that match any from the scrape list
    const localMatches = await prisma.product.findMany({
      where: { sku: { in: Array.from(scrapeMap.keys()) } },
      select: { id: true, sku: true, isOutOfStock: true }
    });

    // Filter to ones that actually differ from current database state to optimize writes
    const updates = localMatches
      .filter(p => scrapeMap.get(p.sku) !== p.isOutOfStock)
      .map(p => 
        prisma.product.update({
          where: { id: p.id },
          data: { isOutOfStock: scrapeMap.get(p.sku) }
        })
      );

    let updatedCount = 0;
    if (updates.length > 0) {
      await prisma.$transaction(updates);
      updatedCount = updates.length;
    }

    res.status(200).json({
      success: true,
      message: `System synchronized successfully! Processed ${allFoundProducts.length} supplier items, identified ${localMatches.length} matches, and updated ${updatedCount} localized states.`,
      totalScanned: allFoundProducts.length,
      updatedCount: updatedCount
    });

  } catch (error: any) {
    console.error("❌ Background Sync Failure:", error.message);
    if (browser) await browser.close();
    res.status(500).json({ success: false, message: `Automation fault: ${error.message}` });
  }
};

import prisma from "../config/database";
import puppeteer from "puppeteer";

// Live Puppeteer Koba Reseller Dashboard Scraper
export const scrapeKobaProducts = async (req: any, res: any, next: any) => {
  req.setTimeout(600000); // Extend connection timeout tolerance to 10 minutes for scraping
  let browser;
  try {
    console.log("🚀 Launching Puppeteer for live reseller scraping...");
    browser = await puppeteer.launch({
      headless: true,
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

    // 3. Determine range of pages to scrape
    const { url, maxPages = 1 } = req.body;
    const initialTarget = url || "https://www.kobareseller.com/dashboard/products";
    
    let aggregatedProducts: any[] = [];
    const limit = Math.max(1, Math.min(10, Number(maxPages))); // Ceiling of 10 safety limit
    
    console.log(`📡 Starting multi-page gathering (Limit: ${limit} pages)`);

    for (let currentPage = 1; currentPage <= limit; currentPage++) {
      // Build iterated URL
      let finalUrl = new URL(initialTarget);
      
      // If there's already a page in URL, respect start point, else overwrite/append
      const initialPage = Number(finalUrl.searchParams.get("page")) || 1;
      const activePage = (initialPage + currentPage - 1);
      
      finalUrl.searchParams.set("page", String(activePage));
      const currentUrlStr = finalUrl.toString();
      
      console.log(`📍 [Page ${activePage}] Fetching products from: ${currentUrlStr}...`);
      
      await page.goto(currentUrlStr, {
        waitUntil: "networkidle2",
      });

      // Standard delay to handle dynamic rendering / hydration
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 4. Extract current page payload
      const pageItems = await page.evaluate((extUrl) => {
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
            const name = rawTitle.split("SKU:")[0].trim();
            
            const skuMatch = cardText.match(/SKU:\s*([A-Z0-9-]+)/i) || cardText.match(/SKU:\s*(\d+)/i);
            const sku = skuMatch ? skuMatch[1] : "";

            const priceMatch = cardText.replace(/\s/g, "").match(/Price৳(\d+)/i) || 
                               cardText.replace(/\s/g, "").match(/৳(\d+)/i);
            const price = priceMatch ? Number(priceMatch[1]) : 1200;

            const commissionMatch = cardText.replace(/\s/g, "").match(/Commission৳([\d.]+)/i);
            const commission = commissionMatch ? Number(commissionMatch[1]) : 0;

            const stockMatch = cardText.match(/(?:Stock|Qty|Available|Quantity):\s*(\d+)/i);
            let stockStatus = stockMatch ? `${stockMatch[1]} Units` : "Unknown";
            
            let isOutOfStock = /Out\s*of\s*Stock/i.test(cardText) || /Sold\s*Out/i.test(cardText);
            if (stockStatus === "Unknown" && /In\s*Stock/i.test(cardText)) {
               stockStatus = "In Stock";
            } else if (isOutOfStock) {
               stockStatus = "Out of Stock";
            }

            if (sku && !items.some((item) => item.sku === sku)) {
              items.push({
                sku: sku,
                name: name,
                price: price,
                commission: commission,
                stockStatus: stockStatus,
                isOutOfStock: isOutOfStock,
                oldPrice: Math.round(price * 1.15),
                image: src,
                url: extUrl,
                category: "Skin Care",
                shortDescription: `Authentic Koba Reseller skincare product: ${name}.`,
                description: `This premium ${name} is sourced directly from your Koba Reseller dashboard.`,
              });
            }
          }
        });
        return items;
      }, currentUrlStr);

      console.log(`✅ Page ${activePage} done. Found ${pageItems.length} items.`);
      
      if (pageItems.length === 0) {
        console.log("🛑 No items found on this page. Terminating multi-gather early.");
        break;
      }

      aggregatedProducts.push(...pageItems);
      
      // Optional spacing to minimize bot blocking
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // De-duplicate aggregated collection by SKU just in case
    const seen = new Set();
    const products = aggregatedProducts.filter(item => {
      const duplicate = seen.has(item.sku);
      seen.add(item.sku);
      return !duplicate;
    });



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

// Reusable core business engine for intelligent stock synchronization across sizes and products
const executeIntelligentSync = async (scrapedProducts: any[]) => {
  // 1. Gather all local inventory items for in-memory high-performance cross-analysis
  const localInventory = await prisma.product.findMany({
    include: { sizes: true }
  });

  const productStatusQueues: { id: string; isOutOfStock: boolean }[] = [];
  const sizeStatusQueues: { id: string; isOutOfStock: boolean }[] = [];
  const processedMatches: { name: string; sku: string; method: string; outOfStock: boolean; wasUpdated: boolean }[] = [];

  // Text Normalization for dynamic fuzzy matching
  const cleanText = (val: string) => String(val || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  
  // Robust SKU Normalizer (strips 'KOBA-', dashes, spaces, converts to pure raw alphanumeric)
  const normalizeSku = (val: any) => String(val || "").toUpperCase().replace(/^KOBA-/, "").replace(/[^A-Z0-9]/g, "").trim();

  // Dynamic parser to extract numeric quantities and scale units (e.g., "50ml", "250 ml", "100 g")
  const parseVolume = (val: string) => {
    const match = val.match(/(\d+)\s*(ml|g|pcs|fl\s*oz|oz)/i);
    return match ? { value: match[1], unit: match[2].toLowerCase() } : null;
  };

  console.log("🔍 Commencing user-optimized intelligent cross-resolver pipeline...");
  console.log(`📥 Processing ${scrapedProducts.length} scraped Koba items against ${localInventory.length} local store products.`);

  // Refactored Resolver Loop: Correctly handles multi-variant products having multiple distinct listings in scraped pool!
  for (const localProd of localInventory) {
    const cleanLocalName = cleanText(localProd.name);
    const localSkus = [
      normalizeSku(localProd.sku),
      ...(localProd.sizes?.map(s => normalizeSku(s.sku)).filter(Boolean) || [])
    ].filter(Boolean);

    // 1. Collect ALL scraped items that correspond to this local product (via shared SKUs or shared fuzzy name)
    const relevantScraped = scrapedProducts.filter(sc => {
      const normScraped = normalizeSku(sc.sku);
      if (normScraped && localSkus.includes(normScraped)) return true;

      const cleanSupplierName = cleanText(sc.name);
      return cleanLocalName && cleanSupplierName && (
        cleanLocalName === cleanSupplierName ||
        cleanSupplierName.includes(cleanLocalName) ||
        cleanLocalName.includes(cleanSupplierName)
      );
    });

    if (relevantScraped.length === 0) continue;

    console.log(`🎯 EVALUATING PRODUCT: "${localProd.name}" (${relevantScraped.length} scraped candidates parsed)`);
    let hasChanged = false;
    let topLevelMatchedScraped = relevantScraped[0];

    if (localProd.sizes.length > 0) {
      // This product has variants. Perform precision matching for EACH variant separately!
      for (const sz of localProd.sizes) {
        const szSku = normalizeSku(sz.sku);
        const szVol = parseVolume(sz.label);
        const cleanLabel = cleanText(sz.label);

        // Locate the absolute best candidate in our pool for THIS specific sub-variant
        let bestScraped = relevantScraped.find(sc => {
          const scSku = normalizeSku(sc.sku);
          // A. Direct exact SKU match (highest precedence)
          if (szSku && scSku && szSku === scSku) return true;

          // B. Volume Metric overlap match (e.g. 100 == 100)
          const scVol = parseVolume(sc.name || "");
          if (szVol && scVol && szVol.value === scVol.value) return true;

          // C. Containment Fallback (does text '100g' exist in supplier's title)
          if (cleanLabel && cleanText(sc.name).includes(cleanLabel)) return true;

          return false;
        });

        // Single-variant emergency fallback
        if (!bestScraped && localProd.sizes.length === 1) {
          bestScraped = relevantScraped[0];
        }

        if (bestScraped) {
          topLevelMatchedScraped = bestScraped;
          const isCurrentlyOut = bestScraped.isOutOfStock === true;
          
          // Determine debug label for logs
          let linkageType = "📝 Containment";
          if (szSku && normalizeSku(bestScraped.sku) === szSku) linkageType = "🧩 SKU Match";
          else if (szVol && parseVolume(bestScraped.name || "")?.value === szVol.value) linkageType = "⚖️ Volume Match";

          console.log(`    -> Sub-variant [${sz.label}] matched "${bestScraped.name}" via ${linkageType}. Supplier Out: ${isCurrentlyOut}`);

          if (sz.isOutOfStock !== isCurrentlyOut) {
            sizeStatusQueues.push({ id: sz.id, isOutOfStock: isCurrentlyOut });
            sz.isOutOfStock = isCurrentlyOut;
            hasChanged = true;
            console.log(`       🔥 REAL-TIME TOGGLE: Variant [${sz.label}] database value updated to: ${isCurrentlyOut ? 'SOLD OUT' : 'IN STOCK'}`);
          } else {
            console.log(`       ✅ Variant [${sz.label}] database matches supplier. No update required.`);
          }
        } else {
          console.log(`    ⚠️ Variant [${sz.label}] skipped: No precise scraped candidate located.`);
        }
      }
    } else {
      // Single root item (no variants). Match directly.
      const isCurrentlyOut = topLevelMatchedScraped.isOutOfStock === true;
      console.log(`    -> Root Product matched "${topLevelMatchedScraped.name}". Supplier Out: ${isCurrentlyOut}`);
      if (localProd.isOutOfStock !== isCurrentlyOut) {
        productStatusQueues.push({ id: localProd.id, isOutOfStock: isCurrentlyOut });
        localProd.isOutOfStock = isCurrentlyOut;
        hasChanged = true;
        console.log(`       🔥 REAL-TIME TOGGLE: Root Product stock updated to: ${isCurrentlyOut ? 'SOLD OUT' : 'IN STOCK'}`);
      } else {
        console.log(`       ✅ Root Product stock matches supplier.`);
      }
    }

    processedMatches.push({
      name: localProd.name,
      sku: localProd.sku || topLevelMatchedScraped.sku || "N/A",
      method: (localSkus.includes(normalizeSku(topLevelMatchedScraped.sku))) ? "Direct SKU" : "Fuzzy Name",
      outOfStock: localProd.isOutOfStock,
      wasUpdated: hasChanged
    });
  }

  // LEVEL 4: CASCADING ARCHITECTURAL OVERRIDES (Reconcile child inventories to parents)
  for (const p of localInventory) {
    if (p.sizes.length > 0) {
      // Rule: Parent is out of stock ONLY if EVERY SINGLE child variant is out of stock.
      // Rule: If even 1 variant remains in-stock, parent remains available.
      const allSizesSoldOut = p.sizes.every(sz => sz.isOutOfStock === true);
      
      if (p.isOutOfStock !== allSizesSoldOut) {
        const existingQueueIdx = productStatusQueues.findIndex(q => q.id === p.id);
        if (existingQueueIdx !== -1) {
          productStatusQueues[existingQueueIdx].isOutOfStock = allSizesSoldOut;
        } else {
          productStatusQueues.push({ id: p.id, isOutOfStock: allSizesSoldOut });
        }
      }
    }
  }

  // Level 5: Assemble & Flush Transaction stack to Postgres
  const operationStack = [];
  for (const szUpdate of sizeStatusQueues) {
    operationStack.push(prisma.productSize.update({ 
      where: { id: szUpdate.id }, 
      data: { isOutOfStock: szUpdate.isOutOfStock } 
    }));
  }
  for (const prodUpdate of productStatusQueues) {
    operationStack.push(prisma.product.update({ 
      where: { id: prodUpdate.id }, 
      data: { isOutOfStock: prodUpdate.isOutOfStock } 
    }));
  }

  if (operationStack.length > 0) {
    await prisma.$transaction(operationStack);
  }

  console.log(`⚡ Intelligent solver flushed ${operationStack.length} SQL updates!`);
  return {
    updateCount: operationStack.length,
    matches: processedMatches
  };
};

// Bulk Sync Inventory State using Latest Scrape Result
export const syncInventory = async (req: any, res: any, next: any) => {
  try {
    const { scrapedProducts } = req.body;

    if (!scrapedProducts || !Array.isArray(scrapedProducts)) {
      return res.status(400).json({ success: false, message: "Invalid scraped products list provided." });
    }

    // Execute the Intelligent cross-resolver engine
    const syncResult = await executeIntelligentSync(scrapedProducts);

    res.status(200).json({
      success: true,
      message: `Successfully synchronized inventory via intelligent resolver. Processed ${syncResult.updateCount} inventory adjustments!`,
      updatedCount: syncResult.updateCount,
      totalMatches: syncResult.matches.length,
      matches: syncResult.matches
    });

  } catch (error: any) {
    console.error("❌ Failed to Sync Inventory:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Full-Automated Background Direct Sync: Scraping multiple pages sequentially and updating DB internally.
// Global, in-memory task registry to securely isolate background threads and broadcast live telemetry
let activeSyncTask: {
  isRunning: boolean;
  status: string;
  progressMsg: string;
  result: any;
  error: any;
  updatedAt: number;
} = {
  isRunning: false,
  status: "idle",
  progressMsg: "Engine standing by...",
  result: null,
  error: null,
  updatedAt: Date.now()
};

// Read-only Telemetry Hub: Allows the frontend to poll the exact live progress of background crawlers safely!
export const getSyncStatus = async (req: any, res: any) => {
  res.status(200).json({
    success: true,
    ...activeSyncTask
  });
};

// Non-Blocking Hyper-Asynchronous Task Spawner: Instantly spawns thread and returns 202 to eliminate VPS timeouts!
export const autoSyncFullInventory = async (req: any, res: any, next: any) => {
  try {
    // 1. Lockout mechanism: Prevent parallel thread collison or accidental double-triggers
    if (activeSyncTask.isRunning) {
      return res.status(200).json({
        success: true,
        alreadyRunning: true,
        message: "An automated stock sync is already executing in the background.",
        status: activeSyncTask.status,
        progressMsg: activeSyncTask.progressMsg
      });
    }

    // 2. Clear state and reset telemetry tracker
    activeSyncTask = {
      isRunning: true,
      status: "initializing",
      progressMsg: "🚀 Booting automated browser engine...",
      result: null,
      error: null,
      updatedAt: Date.now()
    };

    // 3. Spin up background thread via Non-blocking Asynchronous IIFE! (Execution proceeds in background)
    (async () => {
      let browser: any;
      try {
        console.log("🚀 Initiating Full Background Automated Stock Sync via Asynchronous Worker...");
        browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });

        activeSyncTask.progressMsg = "📍 Logging into Koba reseller dashboard...";
        activeSyncTask.updatedAt = Date.now();

        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
        await page.setViewport({ width: 1440, height: 900 });

        // 1. High-Speed Login Routine
        await page.goto("https://www.kobareseller.com/login", { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForSelector("#email", { timeout: 10000 });
        
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
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 });
        await page.close();
        
        activeSyncTask.status = "initializing";
        activeSyncTask.progressMsg = "🔍 Analysing local database for active SKUs to sync...";
        activeSyncTask.updatedAt = Date.now();

        // Extract all active SKU targets registered across parent products and sub-variants
        const localProducts = await prisma.product.findMany({
          where: { sku: { not: "" } },
          select: { sku: true }
        });
        const localSizes = await prisma.productSize.findMany({
          where: { sku: { not: null } },
          select: { sku: true }
        });

        // Sanitize, pool, and deduplicate target SKUs (e.g. KOBA-8806182572951 -> 8806182572951)
        const rawSkus = [
          ...localProducts.map(p => p.sku),
          ...localSizes.map(s => s.sku)
        ].filter(Boolean) as string[];

        const targetSkus = Array.from(new Set(
          rawSkus.map(s => s.toUpperCase().replace("KOBA-", "").trim())
        )).filter(s => s.length > 2);

        console.log(`🎯 Targeted Sync Engine loaded ${targetSkus.length} unique SKU barcodes from Local DB.`);
        if (targetSkus.length === 0) {
          throw new Error("System found zero active KOBA-SKUs registered in your database!");
        }

        activeSyncTask.status = "scanning";
        activeSyncTask.progressMsg = `✅ Ready. Launching targeted search queries for ${targetSkus.length} SKUs...`;
        activeSyncTask.updatedAt = Date.now();

        let allFoundProducts: any[] = [];

        // High-speed targeted SKU search parser
        const scrapeTargetSkuConcurrently = async (cleanSku: string) => {
          const tab = await browser.newPage();
          try {
            await tab.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
            await tab.setViewport({ width: 1440, height: 900 });
            
            // Direct Target Search Navigation!
            await tab.goto(`https://www.kobareseller.com/dashboard/products?product=${cleanSku}`, { 
              waitUntil: "domcontentloaded", 
              timeout: 20000 
            });

            // Fast dynamic stabilizer delay
            await tab.waitForSelector("img", { timeout: 5000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 300));

            const items = await tab.evaluate(() => {
              const results: any[] = [];
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
                  const rawTitle = parent.textContent.split("SKU:")[0].trim();
                  const isOutOfStock = /Out\s*of\s*Stock/i.test(text) || /Sold\s*Out/i.test(text);
                  
                  if (!results.some(x => x.sku === rawSku)) {
                    results.push({ sku: rawSku, isOutOfStock, name: rawTitle });
                  }
                }
              });
              return results;
            });

            return items;
          } catch (err: any) {
            console.error(`   ❌ Target Search [${cleanSku}] timed out or failed:`, err.message);
            return [];
          } finally {
            await tab.close();
          }
        };

        // Execute targeted SKU search queue in parallel batches of 5 (extreme speed + lightweight RAM)
        const BATCH_SIZE = 5;
        for (let i = 0; i < targetSkus.length; i += BATCH_SIZE) {
          const currentBatch = targetSkus.slice(i, i + BATCH_SIZE);
          const currentEnd = Math.min(i + BATCH_SIZE, targetSkus.length);
          
          activeSyncTask.progressMsg = `🚀 Searching SKUs ${i + 1} to ${currentEnd} of ${targetSkus.length}... (${allFoundProducts.length} items located)`;
          activeSyncTask.updatedAt = Date.now();

          const batchPromises = currentBatch.map(sku => scrapeTargetSkuConcurrently(sku));
          const batchResults = await Promise.all(batchPromises);
          
          for (const results of batchResults) {
            allFoundProducts.push(...results);
          }
        }

        await browser.close();
        console.log(`🏁 Targeted Precision Scan Complete! Scanned and retrieved ${allFoundProducts.length} verified products.`);

        // 3. Intelligent Database Processing
        if (allFoundProducts.length === 0) {
          throw new Error("Background scraper completed but no products were found on the supplier's portal.");
        }

        activeSyncTask.status = "processing";
        activeSyncTask.progressMsg = `🔍 Analyzing ${allFoundProducts.length} scraped items against localized store database...`;
        activeSyncTask.updatedAt = Date.now();

        const syncResult = await executeIntelligentSync(allFoundProducts);

        // Set Final Telemetry Results
        activeSyncTask.result = {
          totalScanned: allFoundProducts.length,
          updatedCount: syncResult.updateCount,
          totalMatches: syncResult.matches.length,
          matches: syncResult.matches
        };
        activeSyncTask.status = "completed";
        activeSyncTask.progressMsg = `🏁 Successfully finished! Synced ${allFoundProducts.length} items and pushed ${syncResult.updateCount} database updates!`;
        activeSyncTask.updatedAt = Date.now();

      } catch (error: any) {
        console.error("❌ Background Sync Thread Fault:", error.message);
        activeSyncTask.status = "failed";
        activeSyncTask.error = error.message;
        activeSyncTask.progressMsg = `❌ Sync Failed: ${error.message}`;
        activeSyncTask.updatedAt = Date.now();
      } finally {
        activeSyncTask.isRunning = false;
        activeSyncTask.updatedAt = Date.now();
        if (browser) await browser.close().catch(() => {});
      }
    })();

    // 4. Respond immediately to HTTP client (Returns in 50ms, preventing VPS timeouts!)
    res.status(202).json({
      success: true,
      message: "Intelligent Stock Sync launched successfully in a dedicated background worker thread!",
      status: "started"
    });

  } catch (error: any) {
    console.error("❌ Failed to launch Background Sync:", error.message);
    res.status(500).json({ success: false, message: `Internal Server Error: ${error.message}` });
  }
};

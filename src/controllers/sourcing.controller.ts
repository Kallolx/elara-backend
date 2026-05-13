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

  // User Envisioned Approach: Loop through our local products one by one and locate them in the scanned Koba pool!
  for (const localProd of localInventory) {
    const cleanLocalName = cleanText(localProd.name);
    const localSkus = [
      normalizeSku(localProd.sku),
      ...(localProd.sizes?.map(s => normalizeSku(s.sku)).filter(Boolean) || [])
    ].filter(Boolean);

    let matchedScraped = null;

    // A. MATCHING LEVEL 1: Match by Normalized SKU (Matches direct barcodes perfectly!)
    if (localSkus.length > 0) {
      matchedScraped = scrapedProducts.find(sc => {
        const normScraped = normalizeSku(sc.sku);
        return normScraped && localSkus.includes(normScraped);
      });
    }

    // B. MATCHING LEVEL 2: Fuzzy Product Name match fallback (Matches matching titles!)
    if (!matchedScraped) {
      matchedScraped = scrapedProducts.find(sc => {
        const cleanSupplierName = cleanText(sc.name);
        return cleanLocalName && cleanSupplierName && (
          cleanLocalName === cleanSupplierName ||
          cleanSupplierName.includes(cleanLocalName) ||
          cleanLocalName.includes(cleanSupplierName)
        );
      });
    }

    // C. RECONCILE STATE IF A MATCH IS FOUND
    if (matchedScraped) {
      const isCurrentlyOut = matchedScraped.isOutOfStock === true;
      const supplierVol = parseVolume(matchedScraped.name || "");
      
      // Check matching method for analytics
      const isSkuMatch = localSkus.length > 0 && normalizeSku(matchedScraped.sku) && localSkus.includes(normalizeSku(matchedScraped.sku));
      let hasChanged = false;

      console.log(`🎯 MATCH DETECTED: "${localProd.name}" <-> "${matchedScraped.name}" | Supplier OutOfStock: ${isCurrentlyOut}`);

      if (localProd.sizes.length > 0) {
        let subVariantMatched = false;

        for (const sz of localProd.sizes) {
          let matchesThisVariant = false;

          // 1. Explicit Variant SKU Overlap
          if (sz.sku && matchedScraped.sku) {
            matchesThisVariant = normalizeSku(sz.sku) === normalizeSku(matchedScraped.sku);
            if (matchesThisVariant) console.log(`   🧩 Variant [${sz.label}] linked via exact SKU match.`);
          }

          // 2. Volume Metric Parser Overlap
          const szVol = parseVolume(sz.label);
          if (!matchesThisVariant && supplierVol && szVol) {
            matchesThisVariant = (szVol.value === supplierVol.value);
            if (matchesThisVariant) console.log(`   ⚖️ Variant [${sz.label}] linked via parsed volumes (${szVol.value} === ${supplierVol.value}).`);
          }

          // 3. Smart Containment Fallback: Label inclusion inside Supplier's Title
          if (!matchesThisVariant && sz.label && matchedScraped.name) {
            const cleanLabel = cleanText(sz.label);
            const cleanSuppTitle = cleanText(matchedScraped.name);
            if (cleanLabel && cleanSuppTitle.includes(cleanLabel)) {
              matchesThisVariant = true;
              console.log(`   📝 Variant [${sz.label}] linked via title inclusion ("${cleanLabel}" found in scraped name).`);
            }
          }

          if (matchesThisVariant) {
            if (sz.isOutOfStock !== isCurrentlyOut) {
              sizeStatusQueues.push({ id: sz.id, isOutOfStock: isCurrentlyOut });
              sz.isOutOfStock = isCurrentlyOut; // Propagate reference change
              hasChanged = true;
              console.log(`   🔥 REAL-TIME TOGGLE: Variant [${sz.label}] database value updated to: ${isCurrentlyOut ? 'SOLD OUT' : 'IN STOCK'}`);
            } else {
              console.log(`   ✅ Variant [${sz.label}] database matches supplier. No SQL update needed.`);
            }
            subVariantMatched = true;
          } else {
            console.log(`   ⚠️ Skipped Variant [${sz.label}]: Reconciler found no SKU match, volume match, or title label match.`);
          }
        }

        // 4. Safe Single-Variant Full Fallback: If product ONLY has 1 size, sync absolutely
        if (!subVariantMatched && localProd.sizes.length === 1) {
          const targetSz = localProd.sizes[0];
          console.log(`   💫 Single-variant fallback invoked for [${targetSz.label}] due to single product mapping.`);
          if (targetSz.isOutOfStock !== isCurrentlyOut) {
            sizeStatusQueues.push({ id: targetSz.id, isOutOfStock: isCurrentlyOut });
            targetSz.isOutOfStock = isCurrentlyOut;
            hasChanged = true;
            console.log(`   🔥 REAL-TIME TOGGLE (Fallback): Variant [${targetSz.label}] database updated to: ${isCurrentlyOut ? 'SOLD OUT' : 'IN STOCK'}`);
          } else {
            console.log(`   ✅ Variant [${targetSz.label}] (Fallback) is already matching supplier.`);
          }
        }
      } else {
        // Parent single-item root update
        if (localProd.isOutOfStock !== isCurrentlyOut) {
          productStatusQueues.push({ id: localProd.id, isOutOfStock: isCurrentlyOut });
          localProd.isOutOfStock = isCurrentlyOut;
          hasChanged = true;
        }
      }

      processedMatches.push({
        name: localProd.name,
        sku: localProd.sku || matchedScraped.sku || "N/A",
        method: isSkuMatch ? "Direct SKU" : "Fuzzy Name",
        outOfStock: isCurrentlyOut,
        wasUpdated: hasChanged
      });
    }
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
        
        activeSyncTask.status = "scanning";
        activeSyncTask.progressMsg = "✅ Login Successful. Launching concurrent multi-page deep scan...";
        activeSyncTask.updatedAt = Date.now();

        // 2. High-Performance Concurrent Deep Crawl Loop (Supports Dynamic Deep Scanning)
        let allFoundProducts: any[] = [];
        const MAX_PAGES = 100; 

        // High-speed dynamic concurrency parser
        const scrapePageConcurrently = async (pageNum: number) => {
          const tab = await browser.newPage();
          try {
            await tab.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
            await tab.setViewport({ width: 1440, height: 900 });
            
            // Request with per_page=50 in case Koba API accepts higher payload boundaries
            await tab.goto(`https://www.kobareseller.com/dashboard/products?per_page=50&page=${pageNum}`, { 
              waitUntil: "domcontentloaded", 
              timeout: 20000 
            });

            // Wait for selector to mount and inject a dynamic stabilizer micro-delay
            await tab.waitForSelector("img", { timeout: 5000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 400));

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
            console.error(`   ❌ Error loading page ${pageNum}:`, err.message);
            return [];
          } finally {
            await tab.close();
          }
        };

        // Execute in parallel batches of 4 (lightweight on VPS RAM, but incredibly fast!)
        const BATCH_SIZE = 4;
        for (let i = 1; i <= MAX_PAGES; i += BATCH_SIZE) {
          const currentEndPage = Math.min(i + BATCH_SIZE - 1, MAX_PAGES);
          activeSyncTask.progressMsg = `🚀 Crawling catalog pages ${i} to ${currentEndPage}... (${allFoundProducts.length} items scraped)`;
          activeSyncTask.updatedAt = Date.now();

          const batchPromises = [];
          for (let j = 0; j < BATCH_SIZE && (i + j) <= MAX_PAGES; j++) {
            batchPromises.push(scrapePageConcurrently(i + j));
          }
          
          const batchResults = await Promise.all(batchPromises);
          
          // Add to master array and sum items to detect catalog boundaries
          let itemsInBatch = 0;
          for (const results of batchResults) {
            itemsInBatch += results.length;
            allFoundProducts.push(...results);
          }

          // Early Escape: If an entire batch (3 pages) contains 0 items, we have hit the end of the supplier's inventory. Stop crawl!
          if (itemsInBatch === 0) {
            console.log("📭 Empty parallel batch detected. Supplier catalog exhausted. Terminating scan early!");
            break;
          }
        }

        await browser.close();
        console.log(`🏁 High-Speed Scan Complete! Total parsed unique items: ${allFoundProducts.length}`);

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

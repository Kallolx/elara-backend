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

  // Text Normalization for dynamic fuzzy matching
  const cleanText = (val: string) => String(val || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  
  // Robust SKU Normalizer (strips 'KOBA-', dashes, spaces, converts to pure raw alphanumeric)
  const normalizeSku = (val: string) => String(val || "").toUpperCase().replace(/^KOBA-/, "").replace(/[^A-Z0-9]/g, "").trim();

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
      
      console.log(`🎯 MATCH DETECTED: "${localProd.name}" <-> "${matchedScraped.name}" | Supplier OutOfStock: ${isCurrentlyOut}`);

      if (localProd.sizes.length > 0) {
        let subVariantMatched = false;

        for (const sz of localProd.sizes) {
          let matchesThisVariant = false;

          // Explicit Variant SKU Overlap
          if (sz.sku && matchedScraped.sku) {
            matchesThisVariant = normalizeSku(sz.sku) === normalizeSku(matchedScraped.sku);
          }

          // Volume metric fallback
          if (!matchesThisVariant && supplierVol) {
            const szVol = parseVolume(sz.label);
            if (szVol && szVol.value === supplierVol.value) {
              matchesThisVariant = true;
            }
          }

          if (matchesThisVariant) {
            if (sz.isOutOfStock !== isCurrentlyOut) {
              sizeStatusQueues.push({ id: sz.id, isOutOfStock: isCurrentlyOut });
              sz.isOutOfStock = isCurrentlyOut; // Mutate memory reference to propagate to level 4 parent cascade
            }
            subVariantMatched = true;
          }
        }

        // Safe single-variant fallback if volume parser wasn't definitive
        if (!subVariantMatched && localProd.sizes.length === 1) {
          const targetSz = localProd.sizes[0];
          if (targetSz.isOutOfStock !== isCurrentlyOut) {
            sizeStatusQueues.push({ id: targetSz.id, isOutOfStock: isCurrentlyOut });
            targetSz.isOutOfStock = isCurrentlyOut;
          }
        }
      } else {
        // Parent single-item root update
        if (localProd.isOutOfStock !== isCurrentlyOut) {
          productStatusQueues.push({ id: localProd.id, isOutOfStock: isCurrentlyOut });
          localProd.isOutOfStock = isCurrentlyOut;
        }
      }
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
  return operationStack.length;
};

// Bulk Sync Inventory State using Latest Scrape Result
export const syncInventory = async (req: any, res: any, next: any) => {
  try {
    const { scrapedProducts } = req.body;

    if (!scrapedProducts || !Array.isArray(scrapedProducts)) {
      return res.status(400).json({ success: false, message: "Invalid scraped products list provided." });
    }

    // Execute the Intelligent cross-resolver engine
    const count = await executeIntelligentSync(scrapedProducts);

    res.status(200).json({
      success: true,
      message: `Successfully synchronized inventory via intelligent resolver. Processed ${count} inventory adjustments!`,
      updatedCount: count
    });

  } catch (error: any) {
    console.error("❌ Failed to Sync Inventory:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Full-Automated Background Direct Sync: Scraping multiple pages sequentially and updating DB internally.
export const autoSyncFullInventory = async (req: any, res: any, next: any) => {
  req.setTimeout(600000); // Extend connection timeout tolerance to 10 minutes for full crawls
  let browser;
  try {
    console.log("🚀 Initiating Full Background Automated Stock Sync...");
    browser = await puppeteer.launch({
      headless: true,
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
            
            // Extract the name payload for fuzzy support
            const rawTitle = parent.textContent.split("SKU:")[0].trim();
            const isOutOfStock = /Out\s*of\s*Stock/i.test(text) || /Sold\s*Out/i.test(text);
            
            if (!items.some(x => x.sku === rawSku)) {
              items.push({ sku: rawSku, isOutOfStock, name: rawTitle });
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

    // 3. Intelligent Database Processing
    if (allFoundProducts.length === 0) {
      return res.status(200).json({ success: false, message: "Scraper finished but no products were parsed from supplier dashboard." });
    }

    const count = await executeIntelligentSync(allFoundProducts);

    res.status(200).json({
      success: true,
      message: `System synchronized successfully! Processed ${allFoundProducts.length} supplier items and updated ${count} localized record fields.`,
      totalScanned: allFoundProducts.length,
      updatedCount: count
    });

  } catch (error: any) {
    console.error("❌ Background Sync Failure:", error.message);
    if (browser) await browser.close();
    res.status(500).json({ success: false, message: `Automation fault: ${error.message}` });
  }
};

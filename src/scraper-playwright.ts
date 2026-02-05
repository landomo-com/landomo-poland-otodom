/**
 * Otodom Playwright-Based Scraper
 * Uses browser automation to bypass CloudFront protection
 */

import { chromium, Browser, Page } from 'playwright';
import { config, MAJOR_CITIES } from './config';
import { transformToStandard } from './transformer';
import { sendToCoreService } from './core';
import { logger } from './logger';
import { randomDelay } from './utils';
import { OtodomListing, Property } from './types';

/**
 * Convert Playwright ad data to Property format expected by transformer
 */
function convertPlaywrightAdToProperty(ad: any): Property {
  const target = ad.target || {};

  // Map Otodom estate types to standard property types
  const estateTypeMap: Record<string, string> = {
    'mieszkanie': 'mieszkanie',
    'dom': 'dom',
    'dzialka': 'dzialka',
    'lokal': 'lokal',
    'haleimagazyny': 'commercial',
    'garaz': 'other',
  };

  const propertyType = ad.estate ? estateTypeMap[ad.estate.toLowerCase()] || ad.estate : 'mieszkanie';

  return {
    id: String(ad.id),
    title: ad.title || '',
    description: ad.description || '',
    price: target.Price || ad.price?.value || null,
    currency: target.Currency || 'PLN',
    pricePerSqm: target.Price_per_m || undefined,
    propertyType: propertyType,
    listingType: ad.advertType || (ad.market === 'PRIMARY' ? 'sale' : 'sale'),

    location: {
      address: target.Street ? `${target.Street} ${target.Street_number || ''}`.trim() : undefined,
      city: target.City || undefined,
      district: target.District || target.Subregion || undefined,
      province: target.Province || target.Region || undefined,
      postalCode: undefined,
      coordinates: target.Latitude && target.Longitude ? {
        lat: parseFloat(target.Latitude),
        lng: parseFloat(target.Longitude),
      } : undefined,
    },

    details: {
      sqm: target.Area ? parseFloat(target.Area) : undefined,
      rooms: target.Rooms_num ? parseInt(target.Rooms_num) : undefined,
      bedrooms: target.Rooms_num ? parseInt(target.Rooms_num) : undefined,
      bathrooms: undefined,
      floor: target.Floor_no ? String(target.Floor_no) : undefined,
      totalFloors: target.Building_floors_num ? parseInt(target.Building_floors_num) : undefined,
      terrainArea: target.Terrain_area ? parseFloat(target.Terrain_area) : undefined,
      buildingYear: target.Build_year ? parseInt(target.Build_year) : undefined,
      yearBuilt: target.Build_year ? parseInt(target.Build_year) : undefined,
      buildingType: target.Building_type || undefined,
    },

    features: ad.features || [],
    amenities: ad.features || [],
    images: target.Photo && Array.isArray(target.Photo)
      ? target.Photo.map((p: any) => p.url || p)
      : (ad.images || []),

    agent: {
      name: ad.advertiser?.name || undefined,
      agency: ad.agency?.name || undefined,
      phone: ad.advertiser?.phones?.[0] || undefined,
    },

    status: {
      isPromoted: ad.isPromoted || false,
      isExclusiveOffer: ad.exclusiveOffer || false,
    },

    dates: {
      createdAt: ad.createdAt || undefined,
      updatedAt: ad.modifiedAt || undefined,
    },

    development: ad.developmentId ? {
      id: ad.developmentId,
      title: ad.developmentTitle,
      url: ad.developmentUrl,
    } : undefined,

    scrapedAt: new Date().toISOString(),
  };
}

export class OtodomPlaywrightScraper {
  private browser: Browser | null = null;
  private processedIds = new Set<string>();

  async initialize() {
    logger.info('Launching Playwright browser...');
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    logger.info('Browser launched successfully');
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }

  /**
   * Fetch listing IDs from a search page
   */
  async fetchListingIds(city: string, page: number = 1): Promise<{ ids: string[]; total: number }> {
    if (!this.browser) throw new Error('Browser not initialized');

    const transactionType = config.transactionType === 'sale' ? 'sprzedaz' : 'wynajem';
    const propertyType = config.propertyType || 'mieszkanie';

    // Try different URL formats
    // Use the working URL format for Poland
    const url = `https://www.otodom.pl/pl/wyniki/${transactionType}/${propertyType}/mazowieckie/${city}?limit=72&page=${page}`;

    logger.info(`Fetching listings page ${page} for ${city}`);

    try {
      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });
      const browserPage = await context.newPage();

      // Navigate and wait for network to be idle
      await browserPage.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

      // Wait for JavaScript to execute
      await browserPage.waitForTimeout(2000);

      // Extract __NEXT_DATA__ from page
      const nextData = await browserPage.evaluate(() => {
        const scriptTag = document.getElementById('__NEXT_DATA__');
        if (!scriptTag) return null;

        try {
          return JSON.parse(scriptTag.textContent || '{}');
        } catch (e) {
          console.error('Error parsing __NEXT_DATA__:', e);
          return null;
        }
      });

      await context.close();

      // Check if we have the data we need
      // Note: __NEXT_DATA__ structure is nextData.props.pageProps.data.searchAds
      if (nextData?.props?.pageProps?.data?.searchAds?.items) {
        const items: OtodomListing[] = nextData.props.pageProps.data.searchAds.items;
        const pagination = nextData.props.pageProps.data.searchAds.pagination;

        // Use slug instead of ID for detail page URLs
        // Return in format "id:slug" so we can use both
        const ids = items.map((item: any) => {
          const id = String(item.id);
          const slug = item.slug || id;
          return `${id}:${slug}`;
        });
        const total = pagination?.totalItems || 0;

        logger.info(`Page ${page}: Found ${ids.length} listings (total: ${total})`);

        return { ids, total };
      } else {
        logger.warn(`No data found on page ${page} for ${city}`);
        return { ids: [], total: 0 };
      }
    } catch (error) {
      logger.error('Error fetching listing IDs', {
        city,
        page,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ids: [], total: 0 };
    }
  }

  /**
   * Fetch property details
   */
  async fetchPropertyDetail(listingId: string, city: string): Promise<any | null> {
    if (!this.browser) throw new Error('Browser not initialized');

    // Extract slug from "id:slug" format
    const [id, slug] = listingId.includes(':') ? listingId.split(':') : [listingId, listingId];
    const url = `https://www.otodom.pl/pl/oferta/${slug}`;

    try {
      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });
      const browserPage = await context.newPage();

      // Navigate and wait for network to be idle
      await browserPage.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

      // Wait for JavaScript to execute
      await browserPage.waitForTimeout(2000);

      // Extract __NEXT_DATA__
      const nextData = await browserPage.evaluate(() => {
        const scriptTag = document.getElementById('__NEXT_DATA__');
        if (!scriptTag) return null;

        try {
          return JSON.parse(scriptTag.textContent || '{}');
        } catch (e) {
          console.error('Error parsing __NEXT_DATA__:', e);
          return null;
        }
      });

      await context.close();

      // Note: __NEXT_DATA__ structure is nextData.props.pageProps.ad
      if (!nextData?.props?.pageProps?.ad) {
        logger.warn(`No data found for listing ${id}`);
        return null;
      }

      const ad = nextData.props.pageProps.ad;

      return {
        id: String(ad.id),
        source: 'otodom',
        url: `https://www.otodom.pl/pl/oferta/${ad.slug}`,
        ...ad,
        rawData: ad,
      };
    } catch (error) {
      logger.error('Error fetching property detail', {
        listingId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Scrape a single city
   */
  async scrapeCity(citySlug: string, maxPages: number = 10): Promise<any> {
    logger.info(`Starting scrape for ${citySlug}`);

    const result = {
      total: 0,
      scraped: 0,
      failed: 0,
      city: citySlug,
      properties: [],
    };

    try {
      // Phase 1: Collect listing IDs
      logger.info(`Phase 1: Fetching listing IDs for ${citySlug}`);
      const allIds: string[] = [];
      
      const firstPage = await this.fetchListingIds(citySlug, 1);
      allIds.push(...firstPage.ids);
      result.total = firstPage.total;

      const totalPages = Math.min(Math.ceil(firstPage.total / 72), maxPages);

      for (let page = 2; page <= totalPages; page++) {
        await randomDelay(2000, 4000); // Longer delay for Playwright
        const pageResult = await this.fetchListingIds(citySlug, page);
        allIds.push(...pageResult.ids);
      }

      logger.info(`Phase 1 complete: ${allIds.length} IDs collected`);

      // Phase 2: Fetch details
      logger.info(`Phase 2: Fetching property details`);

      for (const id of allIds) {
        if (this.processedIds.has(id)) continue;

        await randomDelay(1000, 2000);

        const property = await this.fetchPropertyDetail(id, citySlug);

        if (property) {
          try {
            // Convert Playwright ad format to Property format
            const convertedProperty = convertPlaywrightAdToProperty(property);

            // Transform to standard format
            const standardized = transformToStandard(convertedProperty);

            // Send to core service (will skip if no API key)
            await sendToCoreService({
              portal: 'otodom',
              portal_id: id.split(':')[0], // Use numeric ID only
              country: 'poland',
              data: standardized,
              raw_data: property,
            });

            this.processedIds.add(id);
            result.scraped++;
          } catch (transformError) {
            logger.error(`Error transforming property ${id}:`, transformError);
            result.failed++;
          }
        } else {
          result.failed++;
        }

        if (result.scraped % 10 === 0) {
          logger.info(`Progress: ${result.scraped}/${allIds.length} scraped`);
        }
      }

      logger.info(`Completed ${citySlug}:`, {
        total: result.total,
        scraped: result.scraped,
        failed: result.failed,
      });

      return result;
    } catch (error) {
      logger.error(`Error scraping ${citySlug}:`, error);
      return result;
    }
  }

  /**
   * Scrape all major cities
   */
  async scrapeAllCities(maxPages: number = 10): Promise<void> {
    const cities = typeof MAJOR_CITIES[0] === 'string'
      ? MAJOR_CITIES.map((c: any) => ({ name: c, slug: c }))
      : MAJOR_CITIES;

    for (const city of cities) {
      logger.info(`\n=== Scraping ${(city as any).name} ===`);
      await this.scrapeCity((city as any).slug, maxPages);
      await randomDelay(5000, 10000); // Long delay between cities
    }
  }
}

/**
 * Quick test function for debugging
 */
async function quickTest() {
  const scraper = new OtodomPlaywrightScraper();

  try {
    await scraper.initialize();

    logger.info('=== QUICK TEST MODE ===');
    logger.info('Testing with 3 properties from Warsaw...\n');

    // Fetch first page
    const listingsResult = await scraper.fetchListingIds('warszawa', 1);
    logger.info(`Found ${listingsResult.ids.length} listings (total: ${listingsResult.total})`);

    if (listingsResult.ids.length === 0) {
      logger.error('No listings found!');
      await scraper.cleanup();
      return;
    }

    // Test with first 3 properties
    let success = 0;
    let failed = 0;

    for (let i = 0; i < Math.min(3, listingsResult.ids.length); i++) {
      const id = listingsResult.ids[i];
      logger.info(`\nTesting property ${i + 1}/3: ${id.split(':')[0]}`);

      await randomDelay(1000, 2000);

      const property = await scraper.fetchPropertyDetail(id, 'warszawa');

      if (property) {
        try {
          // Convert Playwright ad format to Property format
          const convertedProperty = convertPlaywrightAdToProperty(property);

          // Transform to StandardProperty format
          const standardized = transformToStandard(convertedProperty);

          logger.info(`✓ Title: ${standardized.title}`);
          logger.info(`✓ Price: ${standardized.price} ${standardized.currency}`);
          logger.info(`✓ Type: ${standardized.property_type}`);
          logger.info(`✓ Location: ${standardized.location.city || 'N/A'}`);
          success++;
        } catch (transformError) {
          logger.error(`✗ Transform failed:`, transformError);
          failed++;
        }
      } else {
        logger.error(`✗ Failed to fetch property`);
        failed++;
      }
    }

    logger.info('\n=== TEST COMPLETE ===');
    logger.info(`Success: ${success}/3`);
    logger.info(`Failed: ${failed}/3`);

    await scraper.cleanup();
  } catch (error) {
    logger.error('Test failed:', error);
    await scraper.cleanup();
    process.exit(1);
  }
}

// Main execution
async function main() {
  const scraper = new OtodomPlaywrightScraper();

  try {
    await scraper.initialize();

    // Test with Warsaw first (limit to 1 page = ~48 listings)
    logger.info('Starting scrape for Warsaw (1 page)...');
    const result = await scraper.scrapeCity('warszawa', 1);

    logger.info('\n=== SCRAPE COMPLETE ===');
    logger.info(`Total listings available: ${result.total}`);
    logger.info(`Successfully scraped: ${result.scraped}`);
    logger.info(`Failed: ${result.failed}`);

    await scraper.cleanup();
  } catch (error) {
    logger.error('Scraper failed:', error);
    await scraper.cleanup();
    process.exit(1);
  }
}

// Run quick test if TEST_MODE env var is set, otherwise run full scraper
if (require.main === module) {
  if (process.env.TEST_MODE === 'true') {
    quickTest();
  } else {
    main();
  }
}

export default OtodomPlaywrightScraper;

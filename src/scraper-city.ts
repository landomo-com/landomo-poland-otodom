/**
 * Otodom City-Based Scraper - Phase 2 Architecture
 * Scrapes all major Polish cities
 *
 * Phase 1: Discover all listing IDs for each city
 * Phase 2: Fetch detailed data for each listing
 */

import axios from 'axios';
import { config, MAJOR_CITIES } from './config';
import { transformToStandard } from './transformer';
import { sendToCoreService } from './core';
import { logger } from './logger';
import { randomDelay } from './utils';
import { ScraperResult, OtodomListing } from './types';

export class OtodomCityScraper {
  private processedIds = new Set<string>();
  private apiBaseUrl = 'https://www.otodom.pl/_next/data';
  private buildId = 'latest'; // Will be fetched dynamically

  constructor() {}

  async initialize() {
    // Fetch build ID from main page
    try {
      const response = await axios.get('https://www.otodom.pl');
      const match = response.data.match(/"buildId":"([^"]+)"/);
      if (match) {
        this.buildId = match[1];
        logger.info('Fetched Otodom buildId', { buildId: this.buildId });
      }
    } catch (error) {
      logger.warn('Could not fetch buildId, using default');
    }

    logger.info('Otodom City scraper initialized');
  }

  /**
   * Fetch listing IDs for a city
   */
  async fetchListingIds(city: string, page: number = 1): Promise<{ ids: string[]; total: number }> {
    const transactionType = config.transactionType === 'sale' ? 'sprzedaz' : 'wynajem';
    const propertyType = config.propertyType || 'mieszkanie';

    const url = `${this.apiBaseUrl}/${this.buildId}/pl/wyniki/${transactionType}/${propertyType}/${city}.json`;

    const params = {
      page: String(page),
      limit: String(config.pageSize || 36),
    };

    try {
      const response = await axios.get(url, {
        params,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 30000,
      });

      const data = response.data;

      if (!data?.pageProps?.data?.searchAds?.items) {
        return { ids: [], total: 0 };
      }

      const items: OtodomListing[] = data.pageProps.data.searchAds.items;
      const pagination = data.pageProps.data.searchAds.pagination;

      const ids = items.map(item => String(item.id));
      const total = pagination?.totalItems || 0;

      return { ids, total };
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
    const transactionType = config.transactionType === 'sale' ? 'sprzedaz' : 'wynajem';
    const propertyType = config.propertyType || 'mieszkanie';

    // Build detail URL
    const url = `${this.apiBaseUrl}/${this.buildId}/pl/oferta/${listingId}.json`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 30000,
      });

      const data = response.data;

      if (!data?.pageProps?.ad) {
        return null;
      }

      const ad = data.pageProps.ad;

      return {
        id: String(ad.id),
        source: 'otodom',
        url: `https://www.otodom.pl/pl/oferta/${ad.slug}`,
        ...ad,
        rawData: ad,
      };
    } catch (error) {
      logger.error('Error fetching property detail', {
        listingId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Scrape a single city
   */
  async scrapeCity(citySlug: string): Promise<ScraperResult> {
    logger.info(`Starting scrape for ${citySlug}`);

    const result: ScraperResult = {
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
      let page = 1;

      const firstPage = await this.fetchListingIds(citySlug, 1);
      result.total = firstPage.total;
      allIds.push(...firstPage.ids);

      logger.info(`Found ${result.total} listings in ${citySlug}`);

      // Calculate total pages
      const pageSize = config.pageSize || 36;
      const totalPages = Math.ceil(result.total / pageSize);

      // Fetch remaining pages with rate limiting
      for (page = 2; page <= totalPages; page++) {
        await randomDelay(config.requestDelayMs * 0.5, config.requestDelayMs * 1.0);

        try {
          const pageData = await this.fetchListingIds(citySlug, page);
          allIds.push(...pageData.ids);

          if (page % 5 === 0) {
            logger.info(`Collected ${allIds.length} IDs from ${page} pages...`);
          }
        } catch (error) {
          logger.warn(`Failed at page ${page}, stopping`, {
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        }
      }

      logger.info(`Phase 1 complete: ${allIds.length} IDs collected`);

      // Phase 2: Fetch details for each property
      logger.info(`Phase 2: Fetching property details`);

      for (const id of allIds) {
        if (this.processedIds.has(id)) continue;

        let retries = 0;
        const maxRetries = 3;
        let success = false;

        while (retries <= maxRetries && !success) {
          try {
            const property = await this.fetchPropertyDetail(id, citySlug);

            if (property) {
              this.processedIds.add(property.id);
              const standardized = transformToStandard(property);
              result.scraped++;
              result.properties.push(standardized);

              if (config.apiKey) {
                await sendToCoreService({
                  portal: config.portal,
                  portal_id: property.id,
                  country: config.country,
                  data: standardized,
                  raw_data: property.rawData,
                });
              }
            }

            success = true;

            // Rate limiting
            await randomDelay(config.requestDelayMs * 0.6, config.requestDelayMs * 1.4);

            if (result.scraped % 50 === 0 && result.scraped > 0) {
              logger.info(`Progress: ${result.scraped}/${allIds.length} properties`);
            }
          } catch (error) {
            retries++;
            if (retries > maxRetries) {
              result.failed++;
              logger.error('Failed after retries', { id });
            } else {
              const backoffDelay = config.requestDelayMs * Math.pow(2, retries - 1);
              await randomDelay(backoffDelay, backoffDelay * 1.5);
            }
          }
        }
      }

      logger.info(`Completed ${citySlug}:`, {
        total: result.total,
        scraped: result.scraped,
        failed: result.failed,
      });
    } catch (error) {
      logger.error(`Failed to scrape ${citySlug}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return result;
  }

  /**
   * Scrape all cities in parallel (with concurrency limit)
   */
  async scrapeAllCities(cityLimit?: number): Promise<ScraperResult[]> {
    const citiesToScrape = cityLimit ? MAJOR_CITIES.slice(0, cityLimit) : MAJOR_CITIES;

    logger.info(`Starting scrape for ${citiesToScrape.length} cities`);

    const results: ScraperResult[] = [];

    // Process cities sequentially to avoid rate limiting
    for (const citySlug of citiesToScrape) {
      try {
        const result = await this.scrapeCity(citySlug);
        results.push(result);

        // Delay between cities
        await randomDelay(5000, 10000);
      } catch (error) {
        logger.error(`Failed to scrape ${citySlug}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        results.push({
          total: 0,
          scraped: 0,
          failed: 0,
          city: citySlug,
          properties: [],
        });
      }
    }

    return results;
  }

  async cleanup() {
    // No cleanup needed for axios-based scraper
  }
}

// Main execution
async function main() {
  logger.info('Starting Otodom City scraper - All major Polish cities');

  const scraper = new OtodomCityScraper();
  await scraper.initialize();

  try {
    // Scrape all cities
    const results = await scraper.scrapeAllCities();

    const allProperties = results.flatMap(r => r.properties);
    console.log(JSON.stringify(allProperties));

    const summary = {
      totalListings: results.reduce((sum, r) => sum + r.total, 0),
      totalScraped: results.reduce((sum, r) => sum + r.scraped, 0),
      totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
      cities: results.length,
      propertiesCollected: allProperties.length,
    };

    logger.info('🎉 City scraping completed - ALL POLAND', summary);

    await scraper.cleanup();
  } catch (error) {
    logger.error('City scraping failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

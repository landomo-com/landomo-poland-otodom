/**
 * Otodom Geo Grid Scraper - Covers ENTIRE Poland using geographic grid
 * Divides Poland into grid cells and searches each area comprehensively
 */

import axios from 'axios';
import { config } from './config';
import { transformToStandard } from './transformer';
import { sendToCoreService } from './core';
import { logger } from './logger';
import { randomDelay } from './utils';
import { ScraperResult } from './types';

// Poland's geographic boundaries
const POLAND_BOUNDS = {
  north: 54.84,    // Baltic coast (Świnoujście area)
  south: 49.00,    // Tatra Mountains (southern border)
  east: 24.15,     // Eastern border (near Belarus/Ukraine)
  west: 14.12,     // Western border (near Germany)
};

// Grid cell size (in degrees) - 0.25° ≈ 28km at Poland's latitude
const GRID_SIZE = 0.25;

interface GridCell {
  lat: number;
  lng: number;
  viewport: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  index: number;
  total: number;
}

export class OtodomGeoGridScraper {
  private processedIds = new Set<string>();
  private allListingIds = new Set<string>();
  private apiBaseUrl = 'https://www.otodom.pl/_next/data';
  private buildId = 'latest';

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

    logger.info('Otodom Geo Grid scraper initialized');
  }

  /**
   * Generate grid cells covering entire Poland
   */
  generateGrid(): GridCell[] {
    const cells: GridCell[] = [];
    let index = 0;

    // Calculate number of cells
    const latSteps = Math.ceil((POLAND_BOUNDS.north - POLAND_BOUNDS.south) / GRID_SIZE);
    const lngSteps = Math.ceil((POLAND_BOUNDS.east - POLAND_BOUNDS.west) / GRID_SIZE);
    const totalCells = latSteps * lngSteps;

    logger.info(`Generating grid: ${latSteps} rows × ${lngSteps} cols = ${totalCells} cells`);

    for (let lat = POLAND_BOUNDS.south; lat < POLAND_BOUNDS.north; lat += GRID_SIZE) {
      for (let lng = POLAND_BOUNDS.west; lng < POLAND_BOUNDS.east; lng += GRID_SIZE) {
        const cellLat = lat + (GRID_SIZE / 2); // Center of cell
        const cellLng = lng + (GRID_SIZE / 2);

        cells.push({
          lat: cellLat,
          lng: cellLng,
          viewport: {
            north: lat + GRID_SIZE,
            south: lat,
            east: lng + GRID_SIZE,
            west: lng,
          },
          index: ++index,
          total: totalCells,
        });
      }
    }

    return cells;
  }

  /**
   * Fetch listing IDs for a specific grid cell
   * Note: Otodom API is city-based, not coordinate-based
   * This is a conceptual implementation - actual implementation
   * would need to map coordinates to nearest city/region
   */
  async fetchCellListingIds(cell: GridCell, offset: number = 0): Promise<{ ids: string[]; total: number }> {
    // For Otodom, we would need to:
    // 1. Reverse geocode the cell center to get city/region
    // 2. Query the API for that city
    // This is a simplified placeholder

    logger.warn('Geographic grid search not directly supported by Otodom API');
    logger.warn('Use city-based scraper instead (scraper-city.ts)');

    return { ids: [], total: 0 };
  }

  /**
   * Scrape all listings from a single grid cell
   */
  async scrapeCell(cell: GridCell): Promise<number> {
    // Placeholder - see note above
    return 0;
  }

  /**
   * Fetch property details
   */
  async fetchPropertyDetail(listingId: string): Promise<any | null> {
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
   * Phase 1: Discover all listing IDs across entire Poland using grid search
   */
  async discoverAllListings(): Promise<void> {
    logger.info('=== PHASE 1: Geographic Grid Discovery ===');
    logger.warn('NOTE: Geographic grid not directly supported by Otodom API');
    logger.warn('Recommend using city-based scraper instead');

    const grid = this.generateGrid();
    logger.info(`Generated ${grid.length} grid cells covering all of Poland`);

    // For Otodom, this approach is not practical
    // The API is city-based, not coordinate-based
    logger.info('Grid generation complete - but scraping requires city-based approach');
  }

  /**
   * Phase 2: Fetch detailed data for all discovered listings
   */
  async fetchAllDetails(): Promise<ScraperResult> {
    logger.info('=== PHASE 2: Fetching Property Details ===');
    logger.info(`Processing ${this.allListingIds.size} unique listings`);

    const result: ScraperResult = {
      total: this.allListingIds.size,
      scraped: 0,
      failed: 0,
      city: 'all-poland',
      properties: [],
    };

    const listingIds = Array.from(this.allListingIds);

    for (const id of listingIds) {
      if (this.processedIds.has(id)) continue;

      let retries = 0;
      const maxRetries = 3;
      let success = false;

      while (retries <= maxRetries && !success) {
        try {
          const property = await this.fetchPropertyDetail(id);

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
          await randomDelay(config.requestDelayMs * 0.6, config.requestDelayMs * 1.6);

          if (result.scraped % 100 === 0 && result.scraped > 0) {
            logger.info(`Progress: ${result.scraped}/${this.allListingIds.size} properties`);
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

    logger.info('=== PHASE 2 COMPLETE ===', {
      total: result.total,
      scraped: result.scraped,
      failed: result.failed,
    });

    return result;
  }

  async cleanup() {
    // No cleanup needed for axios-based scraper
  }
}

// Main execution
async function main() {
  logger.info('Starting Otodom Geo Grid Scraper');
  logger.warn('⚠️  NOTE: Otodom API is city-based, not coordinate-based');
  logger.warn('⚠️  For production use, prefer scraper-city.ts instead');
  logger.info('Strategy: Geographic grid search (conceptual)');

  const scraper = new OtodomGeoGridScraper();
  await scraper.initialize();

  try {
    // Phase 1: Discover all listing IDs using grid search
    await scraper.discoverAllListings();

    logger.info('Grid-based discovery not practical for Otodom');
    logger.info('Use city-based scraper: npm run start:city');

    await scraper.cleanup();
  } catch (error) {
    logger.error('Geo Grid Scraping failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

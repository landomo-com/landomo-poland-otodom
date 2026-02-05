/**
 * Otodom Coordinator - Phase 1: ID Discovery
 *
 * Discovers all listing IDs from Otodom REST API and pushes them to Redis queue.
 *
 * Features:
 * - REST API-based discovery (fast and reliable)
 * - OAuth 2.0 authentication
 * - City-based search strategy
 * - Pagination support (50 listings per page)
 * - Rate limiting (2 req/s)
 *
 * Usage:
 *   npm run coordinator
 */

import axios from 'axios';
import { config } from './config';
import { logger } from './logger';
import { randomDelay } from './utils';
import { RedisQueue } from './redis-queue';

// Major Polish cities for discovery
const POLAND_CITIES = [
  'warszawa', 'krakow', 'wroclaw', 'poznan', 'gdansk',
  'szczecin', 'bydgoszcz', 'lublin', 'katowice', 'bialystok',
  'gdynia', 'czestochowa', 'radom', 'sosnowiec', 'torun',
  'kielce', 'gliwice', 'zabrze', 'bytom', 'olsztyn',
  'rzeszow', 'bielsko-biala', 'ruda-slaska', 'rybnik', 'tychy',
  'dabrowa-gornicza', 'plock', 'elblag', 'opole', 'gorzow-wielkopolski',
  'walbrzych', 'zielona-gora', 'wloclawek', 'tarnow', 'chorzow',
  'koszalin', 'kalisz', 'legnica', 'grudziadz', 'slupsk',
];

interface OtodomSearchResponse {
  data?: Array<{ id: string; [key: string]: unknown }>;
  results?: Array<{ id: string; [key: string]: unknown }>;
  pagination?: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
  meta?: {
    total: number;
    offset: number;
    limit: number;
  };
}

export class OtodomCoordinator {
  private queue: RedisQueue;
  private accessToken?: string;
  private tokenExpiry?: number;
  private readonly tokenRefreshBuffer = 60000; // 1 minute

  constructor() {
    this.queue = new RedisQueue('otodom');
  }

  async initialize() {
    await this.queue.initialize();
    await this.refreshToken();
    logger.info('Otodom Coordinator initialized');
  }

  /**
   * Refresh OAuth 2.0 access token
   */
  async refreshToken(): Promise<void> {
    // Check if token is still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - this.tokenRefreshBuffer) {
      return;
    }

    const clientId = process.env.OTODOM_CLIENT_ID;
    const clientSecret = process.env.OTODOM_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.warn('OAuth credentials not found - using public API mode');
      return;
    }

    try {
      const response = await axios.post(
        'https://api.otodom.pl/oauth/token',
        {
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = Date.now() + expiresIn * 1000;

      logger.info(`OAuth token refreshed (expires in ${expiresIn}s)`);
    } catch (error) {
      logger.error('Failed to refresh OAuth token:', error);
      throw error;
    }
  }

  /**
   * Build authorization headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    return headers;
  }

  /**
   * Fetch listing IDs from search endpoint
   */
  async fetchListingIds(
    city: string,
    listingType: 'sale' | 'rent',
    offset: number = 0,
    limit: number = 50
  ): Promise<{ ids: string[]; total: number }> {
    await this.refreshToken();

    const params = new URLSearchParams({
      city,
      listing_type: listingType,
      offset: String(offset),
      limit: String(limit),
    });

    try {
      const response = await axios.get<OtodomSearchResponse>(
        `https://api.otodom.pl/api/v3/listings?${params.toString()}`,
        {
          headers: this.getHeaders(),
          timeout: 30000,
        }
      );

      const data = response.data;

      // Handle different response formats
      const items = data.data || data.results || [];
      const total = data.pagination?.total || data.meta?.total || 0;

      const ids = items.map(item => String(item.id));

      return { ids, total };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          // Token expired, refresh and retry
          await this.refreshToken();
          return this.fetchListingIds(city, listingType, offset, limit);
        }
      }
      throw error;
    }
  }

  /**
   * Discover all listings for a single city
   */
  async discoverCity(city: string, listingType: 'sale' | 'rent'): Promise<number> {
    logger.info(`Discovering ${listingType} listings in ${city}`);

    let offset = 0;
    const limit = 50;
    let totalAdded = 0;

    try {
      // Fetch first page to get total
      const firstPage = await this.fetchListingIds(city, listingType, 0, limit);

      if (firstPage.total === 0) {
        logger.info(`${city} (${listingType}): No listings found`);
        return 0;
      }

      // Queue first page IDs
      const added = await this.queue.pushListingIds(firstPage.ids);
      totalAdded += added;

      logger.info(`${city} (${listingType}): Found ${firstPage.total} listings, queued ${added} new IDs`);

      // Fetch remaining pages
      offset += limit;
      while (offset < firstPage.total) {
        await randomDelay(500, 1000); // Rate limiting

        const page = await this.fetchListingIds(city, listingType, offset, limit);
        const pageAdded = await this.queue.pushListingIds(page.ids);
        totalAdded += pageAdded;
        offset += limit;
      }

      logger.info(
        `${city} (${listingType}): Queued ${totalAdded} new IDs ` +
        `(${firstPage.total - totalAdded} duplicates)`
      );

      return totalAdded;
    } catch (error) {
      logger.error(`Failed to discover ${city} (${listingType}):`, error);
      return 0;
    }
  }

  /**
   * Discover all cities for both sale and rent
   */
  async discoverAllCities(): Promise<void> {
    logger.info(`=== OTODOM DISCOVERY: ${POLAND_CITIES.length} Cities ===`);

    let totalAdded = 0;
    let citiesProcessed = 0;

    for (const city of POLAND_CITIES) {
      // Discover sale listings
      const saleAdded = await this.discoverCity(city, 'sale');
      totalAdded += saleAdded;

      await randomDelay(500, 1000);

      // Discover rental listings
      const rentAdded = await this.discoverCity(city, 'rent');
      totalAdded += rentAdded;

      citiesProcessed++;

      // Progress update every 5 cities
      if (citiesProcessed % 5 === 0) {
        const stats = await this.queue.getStats();
        logger.info(
          `Progress: ${citiesProcessed}/${POLAND_CITIES.length} cities | ` +
          `${stats.totalDiscovered} total IDs`
        );
      }

      await randomDelay(1000, 2000);
    }

    const finalStats = await this.queue.getStats();
    logger.info('=== DISCOVERY COMPLETE ===', {
      citiesProcessed,
      totalDiscovered: finalStats.totalDiscovered,
      newIdsQueued: totalAdded,
    });

    // Find missing properties
    await this.identifyMissingProperties();
  }

  /**
   * Identify properties not seen recently
   */
  async identifyMissingProperties(hoursThreshold: number = 12): Promise<void> {
    logger.info(`\n=== IDENTIFYING MISSING PROPERTIES (>${hoursThreshold}h) ===`);

    const missingIds = await this.queue.findMissingProperties(hoursThreshold);

    if (missingIds.length === 0) {
      logger.info('No missing properties found');
      return;
    }

    logger.info(`Found ${missingIds.length} properties not seen in last ${hoursThreshold} hours`);

    const queued = await this.queue.pushToMissingQueue(missingIds);

    logger.info(
      `Queued ${queued} properties for verification ` +
      `(${missingIds.length - queued} already verified inactive)`
    );
  }

  async cleanup() {
    await this.queue.close();
  }
}

// Main execution
async function main() {
  logger.info('Starting Otodom Coordinator');

  const coordinator = new OtodomCoordinator();
  await coordinator.initialize();

  try {
    await coordinator.discoverAllCities();

    const stats = await coordinator['queue'].getStats();
    logger.info('=== FINAL STATS ===', stats);

    await coordinator.cleanup();
  } catch (error) {
    logger.error('Coordinator failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

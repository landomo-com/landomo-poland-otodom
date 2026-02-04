import { Property, ScraperConfig, OtodomResponse } from './types.js';
import { parseNextData, extractListings, extractPagination, transformListing } from './parser.js';
import Redis from 'ioredis';
import { createLogger } from './logger';

const BASE_URL = 'https://www.otodom.pl';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class OtodomScraper {
  private logger = createLogger(this.constructor.name);
  private config: ScraperConfig;
  private redis: Redis | null = null;

  constructor(config: ScraperConfig) {
    this.config = {
      delayMs: 2000,
      ...config,
    };
  }

  async init(): Promise<void> {
    if (this.config.redisUrl) {
      this.redis = new Redis(this.config.redisUrl);
      this.logger.info('Connected to Redis');
    }
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  private async fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getUrl(page: number): string {
    // Transaction type mapping
    const transactionMap: Record<string, string> = {
      'sale': 'sprzedaz',
      'rent': 'wynajem',
    };
    const transaction = transactionMap[this.config.transactionType];

    // Property type is already in Polish
    const propertyType = this.config.propertyType;
    const location = this.config.location || 'cala-polska';

    let url = `${BASE_URL}/pl/wyniki/${transaction}/${propertyType}/${location}`;
    if (page > 1) {
      url += `?page=${page}`;
    }
    return url;
  }

  async scrape(): Promise<Property[]> {
    const allProperties: Property[] = [];
    let page = 1;
    let totalPages = 1;

    const transactionType = this.config.transactionType;
    this.logger.info(`Scraping ${this.config.propertyType} for ${transactionType}...`);

    while (page <= totalPages) {
      if (this.config.maxPages && page > this.config.maxPages) {
        this.logger.info(`Reached max pages limit (${this.config.maxPages})`);
        break;
      }

      const url = this.getUrl(page);
      this.logger.info(`  Page ${page}/${totalPages}: ${url}`);

      try {
        const html = await this.fetchPage(url);
        const data = parseNextData(html);

        if (!data) {
          this.logger.error(`  Failed to parse __NEXT_DATA__ from page ${page}`);
          break;
        }

        const listings = extractListings(data);
        const pagination = extractPagination(data);

        if (pagination) {
          totalPages = pagination.totalPages;
          if (page === 1) {
            this.logger.info(`  Total: ${pagination.totalItems.toLocaleString()} listings, ${totalPages.toLocaleString()} pages`);
          }
        }

        if (listings.length === 0) {
          this.logger.info(`  No listings found on page ${page}`);
          break;
        }

        const properties = listings.map(l => transformListing(l, transactionType));
        allProperties.push(...properties);

        this.logger.info(`  Extracted ${listings.length} listings (total: ${allProperties.length})`);

        if (this.redis) {
          await this.saveToRedis(properties);
        }

        page++;

        if (page <= totalPages) {
          await this.delay(this.config.delayMs || 2000);
        }
      } catch (error) {
        this.logger.error(`  Error on page ${page}:`, error);
        break;
      }
    }

    this.logger.info(`\nTotal scraped: ${allProperties.length} properties`);
    return allProperties;
  }

  private async saveToRedis(properties: Property[]): Promise<void> {
    if (!this.redis) return;

    const pipeline = this.redis.pipeline();

    for (const property of properties) {
      const key = `property:otodom:${property.id}`;
      pipeline.hset(key, {
        data: JSON.stringify(property),
        scrapedAt: property.scrapedAt,
      });
      pipeline.sadd('properties:otodom:ids', property.id);
      pipeline.sadd(`properties:otodom:${property.transactionType}`, property.id);
      if (property.location.city) {
        pipeline.sadd(`properties:otodom:city:${property.location.city}`, property.id);
      }
    }

    pipeline.set('properties:otodom:lastRun', new Date().toISOString());

    await pipeline.exec();
  }
}

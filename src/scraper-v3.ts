/**
 * Otodom Scraper V3 - Main scraper for all Polish cities
 * Scrapes ALL major cities in Poland using Otodom's Next.js data API
 */

import axios from 'axios';
import { config, MAJOR_CITIES } from './config';
import { transformToStandard } from './transformer';
import { sendToCoreService } from './core';
import { logger } from './logger';
import { randomDelay } from './utils';
import { ScraperResult, OtodomListing, Property } from './types';

export class OtodomScraperV3 {
  private processedIds = new Set<string>();
  private apiBaseUrl = 'https://www.otodom.pl/_next/data';
  private buildId = 'latest'; // Will be fetched dynamically

  constructor() {}

  async initialize() {
    // Fetch build ID from main page
    try {
      const response = await axios.get('https://www.otodom.pl', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 30000,
      });

      const match = response.data.match(/"buildId":"([^"]+)"/);
      if (match && match[1]) {
        this.buildId = match[1];
        logger.info('Fetched Otodom buildId', { buildId: this.buildId });
      } else {
        logger.warn('Could not extract buildId from page, using default');
      }
    } catch (error) {
      logger.error('Error fetching buildId', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info('Otodom V3 scraper initialized');
  }

  /**
   * Parse city slug to get readable name
   */
  private parseCityName(slug: string): string {
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Fetch listing IDs using Next.js data endpoint
   */
  async fetchListingIds(city: string, page: number = 1): Promise<{ ids: string[]; total: number }> {
    const transactionType = config.transactionType === 'sale' ? 'sprzedaz' : 'wynajem';
    const propertyType = config.propertyType || 'mieszkanie';

    const url = `${this.apiBaseUrl}/${this.buildId}/pl/wyniki/${transactionType}/${propertyType}/${city}.json`;

    const params: Record<string, string> = {
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
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.debug(`No listings found for ${city} page ${page}`);
        return { ids: [], total: 0 };
      }

      logger.error('Error fetching listing IDs', {
        city,
        page,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ids: [], total: 0 };
    }
  }

  /**
   * Fetch property details using Next.js data endpoint
   */
  async fetchPropertyDetail(listingId: string): Promise<Property | null> {
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

      // Transform Otodom API response to our Property type
      return this.transformOtodomAdToProperty(ad);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.debug(`Listing ${listingId} not found (404)`);
        return null;
      }

      logger.error('Error fetching property detail', {
        listingId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Transform Otodom ad object to Property type
   */
  private transformOtodomAdToProperty(ad: any): Property {
    const transactionType = ad.transaction?.toLowerCase() || 'sale';
    const propertyType = ad.estate?.toLowerCase() || 'apartment';

    // Extract price
    let price: number | null = null;
    let pricePerSqm: number | undefined = undefined;

    if (transactionType === 'sale' && ad.totalPrice?.value) {
      price = ad.totalPrice.value;
    } else if (transactionType === 'rent' && ad.rentPrice?.value) {
      price = ad.rentPrice.value;
    }

    if (ad.pricePerSquareMeter?.value) {
      pricePerSqm = ad.pricePerSquareMeter.value;
    }

    // Extract location
    const location: Property['location'] = {};

    if (ad.location?.address) {
      if (ad.location.address.city?.name) {
        location.city = ad.location.address.city.name;
      }
      if (ad.location.address.province?.name) {
        location.province = ad.location.address.province.name;
      }
      if (ad.location.address.street) {
        const street = ad.location.address.street;
        location.address = street.name
          ? `${street.name}${street.number ? ' ' + street.number : ''}`
          : undefined;
      }
    }

    // Extract coordinates from reverseGeocoding
    if (ad.location?.reverseGeocoding?.locations?.[0]) {
      const geo = ad.location.reverseGeocoding.locations[0];
      if (geo.coordinates) {
        location.coordinates = {
          lat: geo.coordinates.latitude,
          lng: geo.coordinates.longitude,
        };
      }
    }

    // Extract district from reverseGeocoding
    if (ad.location?.reverseGeocoding?.locations) {
      const districtLoc = ad.location.reverseGeocoding.locations.find(
        (loc: any) => loc.fullName && loc.fullName.includes(',')
      );
      if (districtLoc) {
        location.district = districtLoc.fullName.split(',')[0].trim();
      }
    }

    // Extract images
    const images: string[] = [];
    if (ad.images && Array.isArray(ad.images)) {
      images.push(...ad.images.map((img: any) => img.large || img.medium).filter(Boolean));
    }

    // Extract features
    const features: string[] = [];
    if (ad.characteristics && Array.isArray(ad.characteristics)) {
      ad.characteristics.forEach((char: any) => {
        if (char.values && Array.isArray(char.values)) {
          char.values.forEach((val: any) => {
            if (val.label) features.push(val.label);
          });
        }
      });
    }

    // Extract details
    const details: Property['details'] = {
      sqm: ad.areaInSquareMeters,
      terrainArea: ad.terrainAreaInSquareMeters,
    };

    if (ad.roomsNumber) {
      details.rooms = parseInt(String(ad.roomsNumber), 10) || undefined;
    }

    if (ad.floorNumber) {
      details.floor = String(ad.floorNumber);
    }

    // Extract dates
    const dates: Property['dates'] = {};
    if (ad.createdAtFirst) {
      dates.createdAt = ad.createdAtFirst;
    }
    if (ad.dateCreated) {
      dates.updatedAt = ad.dateCreated;
    }

    // Extract agent info
    const agent: Property['agent'] = {};
    if (ad.agency?.name) {
      agent.agency = ad.agency.name;
    }

    // Extract status
    const status: Property['status'] = {
      isPrivateOwner: ad.isPrivateOwner || false,
      isPromoted: ad.isPromoted || false,
      isExclusiveOffer: ad.isExclusiveOffer || false,
    };

    // Extract development info
    const development: Property['development'] = {};
    if (ad.developmentId) {
      development.id = ad.developmentId;
      development.title = ad.developmentTitle;
      development.url = ad.developmentUrl;
    }

    return {
      id: String(ad.id),
      title: ad.title || 'Untitled Property',
      description: ad.shortDescription,
      price,
      currency: 'PLN',
      pricePerSqm,
      propertyType,
      listingType: transactionType,
      location,
      details,
      features,
      images,
      agent: Object.keys(agent).length > 0 ? agent : undefined,
      status,
      dates: Object.keys(dates).length > 0 ? dates : undefined,
      development: development.id ? development : undefined,
      scrapedAt: new Date().toISOString(),
    };
  }

  /**
   * Scrape a single city
   */
  async scrapeCity(citySlug: string): Promise<ScraperResult> {
    const cityName = this.parseCityName(citySlug);
    logger.info(`Starting V3 scrape for ${cityName}`);

    const result: ScraperResult = {
      total: 0,
      scraped: 0,
      failed: 0,
      city: cityName,
      properties: [],
    };

    try {
      // Phase 1: Collect listing IDs
      logger.info(`Phase 1: Fetching listing IDs for ${cityName}`);
      const allIds: string[] = [];
      let page = 1;

      const firstPage = await this.fetchListingIds(citySlug, page);
      result.total = firstPage.total;
      allIds.push(...firstPage.ids);

      logger.info(`Found ${result.total} listings in ${cityName}`);

      // Calculate total pages
      const pageSize = config.pageSize || 36;
      const totalPages = Math.ceil(result.total / pageSize);

      // Fetch remaining pages with rate limiting
      page = 2;
      while (page <= totalPages) {
        await randomDelay(config.requestDelayMs * 0.6, config.requestDelayMs * 1.6);

        try {
          const pageData = await this.fetchListingIds(citySlug, page);
          allIds.push(...pageData.ids);

          if (page % 10 === 0) {
            logger.info(`Collected ${allIds.length} IDs (page ${page}/${totalPages})...`);
          }

          page++;
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
                  raw_data: property,
                });
              }

              if (process.env.DEBUG === 'true' && result.scraped <= 3) {
                logger.debug('Sample V3 property', { property, standardized });
              }
            }

            success = true;

            // Rate limiting
            await randomDelay(config.requestDelayMs * 0.6, config.requestDelayMs * 1.6);

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

      logger.info(`Completed ${cityName}:`, {
        total: result.total,
        scraped: result.scraped,
        failed: result.failed,
      });
    } catch (error) {
      logger.error(`Failed to scrape ${cityName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return result;
  }

  /**
   * Scrape all cities in parallel
   */
  async scrapeAllCities(cityLimit?: number): Promise<ScraperResult[]> {
    const citiesToScrape = cityLimit ? MAJOR_CITIES.slice(0, cityLimit) : MAJOR_CITIES;

    logger.info(`Starting scrape for ${citiesToScrape.length} cities`);

    const promises = citiesToScrape.map(async (citySlug) => {
      try {
        return await this.scrapeCity(citySlug);
      } catch (error) {
        logger.error(`Failed to scrape ${citySlug}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          total: 0,
          scraped: 0,
          failed: 0,
          city: citySlug,
          properties: [],
        };
      }
    });

    return await Promise.all(promises);
  }

  async cleanup() {
    // No cleanup needed for axios-based scraper
  }
}

// Main execution
async function main() {
  logger.info('Starting Otodom V3 scraper - All major Polish cities');

  const scraper = new OtodomScraperV3();
  await scraper.initialize();

  try {
    // Scrape ALL cities in parallel!
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

    logger.info('🎉 V3 Scraping completed - ALL POLAND', summary);

    await scraper.cleanup();
  } catch (error) {
    logger.error('V3 Scraping failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

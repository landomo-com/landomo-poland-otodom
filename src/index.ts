import { OtodomScraper } from './scraper.js';
import { ScraperConfig } from './types.js';
import { createLogger } from './logger';

const logger = createLogger('module');

function parseArgs(): {
  limit?: number;
  redis?: string;
  location?: string;
  transaction?: string;
  type?: string;
} {
  const args = process.argv.slice(2);
  const result: {
    limit?: number;
    redis?: string;
    location?: string;
    transaction?: string;
    type?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      result.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--redis' && args[i + 1]) {
      result.redis = args[i + 1];
      i++;
    } else if (args[i] === '--location' && args[i + 1]) {
      result.location = args[i + 1];
      i++;
    } else if (args[i] === '--transaction' && args[i + 1]) {
      result.transaction = args[i + 1];
      i++;
    } else if (args[i] === '--type' && args[i + 1]) {
      result.type = args[i + 1];
      i++;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  // Otodom shows 36 listings per page
  const listingsPerPage = 36;

  const config: ScraperConfig = {
    transactionType: (args.transaction as 'sale' | 'rent') || 'sale',
    propertyType: (args.type as 'mieszkanie' | 'dom' | 'dzialka' | 'lokal') || 'mieszkanie',
    location: args.location,
    maxPages: args.limit ? Math.ceil(args.limit / listingsPerPage) : undefined,
    delayMs: 2000,
    redisUrl: args.redis,
  };

  logger.info('Otodom Poland Scraper');
  logger.info('=====================');
  logger.info(`Transaction: ${config.transactionType}`);
  logger.info(`Property type: ${config.propertyType}`);
  logger.info(`Location: ${config.location || 'All Poland'}`);
  if (config.maxPages) {
    logger.info(`Max pages: ${config.maxPages}`);
  }
  logger.info('');

  const scraper = new OtodomScraper(config);

  try {
    await scraper.init();
    const properties = await scraper.scrape();

    if (properties.length > 0) {
      logger.info('\n=== Sample Properties ===');
      const samples = properties.slice(0, 3);
      for (const p of samples) {
        logger.info(`\n[${p.transactionType.toUpperCase()}] ${p.title}`);
        logger.info(`  Price: ${p.price ? `${p.price.toLocaleString()} ${p.currency}` : 'N/A'}`);
        if (p.pricePerSqm) {
          logger.info(`  Price/m²: ${p.pricePerSqm.toLocaleString()} ${p.currency}`);
        }
        logger.info(`  Type: ${p.propertyType}`);
        logger.info(`  Location: ${p.location.city || 'N/A'}${p.location.district ? `, ${p.location.district}` : ''}`);
        logger.info(`  Details: ${p.details.rooms || '?'} rooms, ${p.details.sqm || '?'} m²`);
        logger.info(`  URL: ${p.url}`);
      }
    }

    logger.info(`\n✅ Scraping complete: ${properties.length} properties`);
  } catch (error) {
    logger.error('Scraper error:', error);
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

main();

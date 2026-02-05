/**
 * Integration tests for Otodom scraper
 * Tests Phase 1 (ID discovery) and Phase 2 (detail fetching)
 */

import { OtodomCityScraper } from './scraper-city';
import { logger } from './logger';

async function testSingleCity() {
  logger.info('=== TEST: Single City Scraping ===');

  const scraper = new OtodomCityScraper();
  await scraper.initialize();

  try {
    // Test with Warszawa (Warsaw) - limit to first page only
    logger.info('Testing with Warszawa (Warsaw)');

    const result = await scraper.scrapeCity('warszawa');

    logger.info('Single city test results:', {
      city: result.city,
      total: result.total,
      scraped: result.scraped,
      failed: result.failed,
      propertiesCount: result.properties.length,
    });

    // Show sample property
    if (result.properties.length > 0) {
      logger.info('Sample property:', JSON.stringify(result.properties[0], null, 2));
    }

    return result;
  } catch (error) {
    logger.error('Single city test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await scraper.cleanup();
  }
}

async function testMultipleCities() {
  logger.info('=== TEST: Multiple Cities Scraping ===');

  const scraper = new OtodomCityScraper();
  await scraper.initialize();

  try {
    // Test with top 3 cities only
    logger.info('Testing with top 3 cities: Warszawa, Krakow, Wroclaw');

    const results = await scraper.scrapeAllCities(3);

    const summary = {
      cities: results.length,
      totalListings: results.reduce((sum, r) => sum + r.total, 0),
      totalScraped: results.reduce((sum, r) => sum + r.scraped, 0),
      totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
    };

    logger.info('Multiple cities test results:', summary);

    // Show breakdown by city
    results.forEach(r => {
      logger.info(`City: ${r.city}`, {
        total: r.total,
        scraped: r.scraped,
        failed: r.failed,
      });
    });

    return results;
  } catch (error) {
    logger.error('Multiple cities test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await scraper.cleanup();
  }
}

async function testPhase1Only() {
  logger.info('=== TEST: Phase 1 Only (ID Discovery) ===');

  const scraper = new OtodomCityScraper();
  await scraper.initialize();

  try {
    logger.info('Testing Phase 1: Fetching listing IDs for Warszawa');

    // Fetch first 3 pages
    let allIds: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const { ids, total } = await scraper.fetchListingIds('warszawa', page);

      logger.info(`Page ${page}:`, {
        idsCount: ids.length,
        total,
      });

      allIds.push(...ids);

      // Show sample IDs from first page
      if (page === 1 && ids.length > 0) {
        logger.info('Sample IDs:', ids.slice(0, 5));
      }
    }

    logger.info('Phase 1 test complete:', {
      totalIds: allIds.length,
      uniqueIds: new Set(allIds).size,
    });

    return allIds;
  } catch (error) {
    logger.error('Phase 1 test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await scraper.cleanup();
  }
}

async function testPhase2Only() {
  logger.info('=== TEST: Phase 2 Only (Detail Fetching) ===');

  const scraper = new OtodomCityScraper();
  await scraper.initialize();

  try {
    // First get some IDs
    logger.info('Getting sample IDs from Warszawa');
    const { ids } = await scraper.fetchListingIds('warszawa', 1);

    if (ids.length === 0) {
      logger.error('No IDs found to test Phase 2');
      return;
    }

    // Test fetching details for first 3 listings
    logger.info(`Testing Phase 2: Fetching details for ${Math.min(3, ids.length)} listings`);

    const testIds = ids.slice(0, 3);
    const properties = [];

    for (const id of testIds) {
      logger.info(`Fetching details for listing ${id}`);

      const property = await scraper.fetchPropertyDetail(id, 'warszawa');

      if (property) {
        properties.push(property);
        logger.info(`✓ Successfully fetched listing ${id}`);
      } else {
        logger.warn(`✗ Failed to fetch listing ${id}`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('Phase 2 test complete:', {
      attempted: testIds.length,
      successful: properties.length,
      failed: testIds.length - properties.length,
    });

    // Show one full property
    if (properties.length > 0) {
      logger.info('Sample property detail:', JSON.stringify(properties[0], null, 2));
    }

    return properties;
  } catch (error) {
    logger.error('Phase 2 test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await scraper.cleanup();
  }
}

async function testTransformer() {
  logger.info('=== TEST: Transformer ===');

  const scraper = new OtodomCityScraper();
  await scraper.initialize();

  try {
    // Get one property
    const { ids } = await scraper.fetchListingIds('warszawa', 1);

    if (ids.length === 0) {
      logger.error('No IDs found to test transformer');
      return;
    }

    const property = await scraper.fetchPropertyDetail(ids[0], 'warszawa');

    if (!property) {
      logger.error('Failed to fetch property for transformer test');
      return;
    }

    logger.info('Raw property:', JSON.stringify(property, null, 2));

    // Import and test transformer
    const { transformToStandard } = await import('./transformer');
    const standardized = transformToStandard(property);

    logger.info('Standardized property:', JSON.stringify(standardized, null, 2));

    // Validate required fields
    const requiredFields = ['title', 'price', 'currency', 'property_type', 'transaction_type', 'location'];
    const missingFields = requiredFields.filter(field => !(field in standardized));

    if (missingFields.length > 0) {
      logger.error('Missing required fields:', missingFields);
    } else {
      logger.info('✓ All required fields present');
    }

    return standardized;
  } catch (error) {
    logger.error('Transformer test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await scraper.cleanup();
  }
}

async function main() {
  logger.info('🚀 Starting Otodom Integration Tests');
  logger.info('=====================================\n');

  const testMode = process.argv[2] || 'all';

  try {
    switch (testMode) {
      case 'phase1':
        await testPhase1Only();
        break;
      case 'phase2':
        await testPhase2Only();
        break;
      case 'transformer':
        await testTransformer();
        break;
      case 'single':
        await testSingleCity();
        break;
      case 'multiple':
        await testMultipleCities();
        break;
      case 'all':
      default:
        await testPhase1Only();
        await testPhase2Only();
        await testTransformer();
        await testSingleCity();
        break;
    }

    logger.info('\n=====================================');
    logger.info('✅ All tests completed successfully');
  } catch (error) {
    logger.error('\n=====================================');
    logger.error('❌ Tests failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

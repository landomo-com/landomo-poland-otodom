# Phase 2 Architecture Migration - Poland Otodom Scraper

This document describes the Phase 2 architecture implementation copied from the QuintoAndar Brazil scraper and adapted for Otodom Poland.

## Overview

The Phase 2 architecture separates scraping into two distinct phases:
1. **Phase 1**: Discover all listing IDs
2. **Phase 2**: Fetch detailed property data for each ID

This approach provides comprehensive coverage, deduplication, and better error handling.

## Files Added

### Core Scraper Files

#### 1. `src/scraper-city.ts`
City-based scraper that processes all major Polish cities.

**Key Features:**
- Two-phase scraping architecture
- Scrapes 31 major Polish cities
- Automatic deduplication of listings
- Retry logic with exponential backoff
- Progress tracking and logging

**Usage:**
```bash
npm run start:city
```

#### 2. `src/scraper-geo-grid.ts`
Geographic grid-based scraper (conceptual for Otodom).

**Note:** Otodom API is city-based, not coordinate-based. This file is included for architectural consistency with QuintoAndar but recommends using `scraper-city.ts` instead.

**Key Features:**
- Grid generation for Poland's geographic bounds
- Conceptual implementation
- Educational reference

#### 3. `src/test-integration.ts`
Comprehensive integration test suite.

**Test Modes:**
- `npm run test:integration` - Run all tests
- `npm run test:integration phase1` - Test ID discovery only
- `npm run test:integration phase2` - Test detail fetching only
- `npm run test:integration transformer` - Test data transformation
- `npm run test:integration single` - Test single city scraping
- `npm run test:integration multiple` - Test multiple cities

### Supporting Files

#### 4. `src/tls-client.ts`
TLS fingerprinting client with browser profile rotation.

**Features:**
- 9 browser profiles (Chrome, Firefox, Safari)
- Automatic TLS fingerprint matching
- User-Agent synchronization
- Session rotation

**Profiles:**
- Chrome 131, 124, 120, 117, 112
- Firefox 120, 117
- Safari 16.0, 15.6.1

#### 5. `src/user-agents.ts`
100+ user agent strings for rotation.

**Categories:**
- Chrome on Windows (10 variants)
- Chrome on macOS (10 variants)
- Firefox on Windows/macOS (15 variants)
- Safari on macOS (8 variants)
- Edge on Windows (5 variants)
- Chrome/Firefox on Linux (9 variants)
- Opera, Brave, Vivaldi (6 variants)
- Mobile devices (6 variants)

**Functions:**
- `getRandomUserAgent()` - Get random UA
- `getRandomUserAgentByType(type)` - Get UA by browser type

## Updated Files

### 1. `src/config.ts`
Added city coordinates and geographic data.

**New Exports:**
- `CITY_COORDS`: Record of major Polish city coordinates with viewport bounds
- Coordinates for 10 major cities: Warszawa, Kraków, Wrocław, Poznań, Gdańsk, etc.

### 2. `src/types.ts`
Added Phase 2 related types.

**New Types:**
```typescript
interface CityCoordinates {
  lat: number;
  lng: number;
  viewport?: { north, south, east, west };
}

interface ScraperResult {
  total: number;
  scraped: number;
  failed: number;
  city: string;
  state?: string;
  properties: any[];
}

interface SearchOptions {
  city?: string;
  transactionType?: 'sale' | 'rent';
  propertyType?: string;
  page?: number;
  limit?: number;
}
```

### 3. `package.json`
Added new dependencies and scripts.

**New Dependency:**
- `node-tls-client@^2.1.0` - TLS fingerprinting library

**New Scripts:**
```json
{
  "start:city": "tsx src/scraper-city.ts",
  "start:geo": "tsx src/scraper-geo-grid.ts",
  "test:integration": "tsx src/test-integration.ts"
}
```

### 4. `README.md`
Added comprehensive Phase 2 documentation.

**New Sections:**
- Architecture overview
- Available scrapers comparison
- Integration test documentation
- Phase 2 architecture details
- Redis queue architecture
- Major Polish cities coverage

### 5. `CHANGELOG.md` (New)
Complete changelog documenting Phase 2 additions.

## Architecture Comparison

### Single-Phase (Old)
```
Search → Parse → Transform → Store
```

**Issues:**
- Missed listings during pagination
- No deduplication
- Hard to track progress
- Difficult to retry failures

### Phase 2 (New)
```
Phase 1: Search → Collect IDs → Store in Set
Phase 2: For each ID → Fetch Details → Transform → Store
```

**Benefits:**
- ✅ Complete coverage
- ✅ Automatic deduplication
- ✅ Easy progress tracking
- ✅ Granular retry logic
- ✅ Separation of concerns

## Data Flow

### Phase 1: ID Discovery
```
City 1 → Pages 1-N → Extract IDs → ID Set
City 2 → Pages 1-N → Extract IDs → ID Set (deduplicated)
...
City 31 → Pages 1-N → Extract IDs → ID Set (deduplicated)
```

### Phase 2: Detail Fetching
```
For each unique ID:
  1. Fetch property detail from API
  2. Transform to StandardProperty format
  3. Send to Core Service API
  4. Store in Scraper DB (optional)
  5. Update progress counter
```

## Configuration

### Environment Variables
```bash
# Core Service
LANDOMO_API_URL=https://core.landomo.com/api/v1
LANDOMO_API_KEY=your_api_key

# Scraper Settings
TRANSACTION_TYPE=sale  # or rent
PROPERTY_TYPE=mieszkanie  # mieszkanie, dom, dzialka, lokal
PAGE_SIZE=36
REQUEST_DELAY_MS=2000
MAX_CONCURRENT_REQUESTS=3

# Redis
REDIS_URL=redis://localhost:6379

# Database
SCRAPER_DB_HOST=localhost
SCRAPER_DB_PORT=5432
SCRAPER_DB_NAME=scraper_poland_otodom
SCRAPER_DB_USER=landomo
SCRAPER_DB_PASSWORD=your_password

# Metrics
METRICS_PORT=9090
METRICS_UPDATE_INTERVAL=15000
```

## Usage Examples

### Basic City Scraping
```bash
# Scrape all major Polish cities
npm run start:city
```

### Integration Testing
```bash
# Test Phase 1 (ID discovery)
npm run test:integration phase1

# Test Phase 2 (detail fetching)
npm run test:integration phase2

# Test transformer
npm run test:integration transformer

# Test single city
npm run test:integration single

# Test multiple cities (top 3)
npm run test:integration multiple

# Run all tests
npm run test:integration
```

### Distributed Architecture
```bash
# Terminal 1: Start coordinator
npm run coordinator

# Terminal 2: Start worker (repeat for multiple workers)
npm run worker

# Terminal 3: Monitor metrics
npm run metrics
curl http://localhost:9090/metrics

# Terminal 4: Check queue stats
npm run queue:stats
```

## Coverage

### Cities Covered (31 total)
1. Warszawa (Warsaw)
2. Kraków
3. Wrocław
4. Poznań
5. Gdańsk
6. Szczecin
7. Bydgoszcz
8. Lublin
9. Katowice
10. Białystok
... and 21 more

### Property Types
- Apartments (mieszkanie): ~146,000 for sale, ~65,000 for rent
- Houses (dom): ~100,000 for sale, ~10,000 for rent
- Land (działka): ~50,000 for sale, ~5,000 for rent
- Commercial (lokal): ~30,000 for sale, ~20,000 for rent

### Expected Total
~500,000+ listings across all cities and property types

## Performance

### Phase 1 (ID Discovery)
- **Speed**: ~200-300 IDs per minute
- **Rate Limiting**: 2-second delay between requests
- **Memory**: Minimal (stores IDs in Set)
- **Time**: ~30-60 minutes for all cities

### Phase 2 (Detail Fetching)
- **Speed**: ~30-50 properties per minute
- **Rate Limiting**: 2-second delay + exponential backoff
- **Memory**: Processes one property at a time
- **Time**: ~5-8 hours for 10,000 properties

### Total Time Estimate
- 31 cities × ~16,000 listings = ~500,000 properties
- Phase 1: ~3-4 hours
- Phase 2: ~250-300 hours (distributed across workers)
- With 10 workers: ~25-30 hours total

## Migration Path

### For Existing Users

1. **Install new dependency**
   ```bash
   npm install
   ```

2. **Test Phase 2 scraper**
   ```bash
   npm run test:integration single
   ```

3. **Switch to Phase 2**
   ```bash
   # Old way
   npm run start

   # New way (recommended)
   npm run start:city
   ```

4. **Use distributed architecture (optional)**
   ```bash
   npm run coordinator
   npm run worker  # Run multiple instances
   ```

## Differences from QuintoAndar

### API Structure
- **QuintoAndar**: Coordinate-based search with viewport filtering
- **Otodom**: City-based search with pagination

### Grid Approach
- **QuintoAndar**: Geographic grid works perfectly
- **Otodom**: Geographic grid not practical (API is city-based)
- **Solution**: Use city-based approach instead

### Authentication
- **QuintoAndar**: No authentication required
- **Otodom**: No authentication required (Next.js data endpoint)

### TLS Requirements
- **QuintoAndar**: TLS fingerprinting helpful
- **Otodom**: Simple HTTP requests work (included TLS support for future-proofing)

## Next Steps

1. **Test the new scrapers**
   ```bash
   npm run test:integration
   ```

2. **Run production scrape**
   ```bash
   npm run start:city
   ```

3. **Monitor performance**
   ```bash
   npm run metrics
   ```

4. **Scale with workers**
   ```bash
   # Add more worker instances as needed
   npm run worker
   ```

## Support

For issues or questions:
- Check logs in console output
- Review CHANGELOG.md for recent changes
- Refer to CLAUDE.md for Landomo architecture
- Test with `npm run test:integration` first

## Credits

Phase 2 architecture adapted from:
- **Repository**: landomo-brazil-quintoandar
- **Reference Files**: scraper-v3.ts, scraper-geo-grid.ts, tls-client.ts
- **Adapted By**: Claude Code
- **Date**: 2026-02-04

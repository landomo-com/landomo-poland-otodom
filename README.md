# Otodom Poland Scraper

Scrapes property listings from [otodom.pl](https://www.otodom.pl) - Poland's largest real estate portal with ~146,000+ apartment listings.

## Status

| | |
|---|---|
| Website | https://www.otodom.pl |
| Listings | ~146,000 (apartments) |
| Scraper | ✅ Working |
| Approach | __NEXT_DATA__ (no protection!) |

## Features

- **No Cloudflare/bot protection** - Works with simple HTTP requests
- Extracts data from `__NEXT_DATA__` JSON
- Multiple property types: apartments, houses, land, commercial
- Both sale and rent listings
- Redis storage support

## Available Listings

| Property Type | Polish | Sale | Rent |
|---------------|--------|------|------|
| Apartment | mieszkanie | ~146,000 | ~65,000 |
| House | dom | ~100,000 | ~10,000 |
| Land | dzialka | ~50,000 | ~5,000 |
| Commercial | lokal | ~30,000 | ~20,000 |

## Architecture

This scraper uses a **Phase 2 architecture** for comprehensive data collection:

### Phase 1: ID Discovery
Collects listing IDs from search results pages for each city/region.

### Phase 2: Detail Fetching
Fetches complete property data for each discovered ID.

## Available Scrapers

### 1. **Main V3 Scraper (Recommended)**
```bash
npm run start           # or npm run start:v3
```
Full-featured scraper based on QuintoAndar architecture. Scrapes all major Polish cities with:
- Two-phase architecture (ID discovery → Detail fetching)
- Parallel city processing
- Comprehensive error handling and retries
- Rate limiting and anti-detection
- Direct integration with Core Service API

### 2. City-Based Scraper
```bash
npm run start:city
```
Sequential city scraping. Alternative implementation.

### 3. Geographic Grid Scraper (Conceptual)
```bash
npm run start:geo
```
Note: Otodom API is city-based, not coordinate-based. Use V3 scraper instead.

### 4. Integration Tests
```bash
npm run test:integration        # Run all tests
npm run test:integration phase1 # Test ID discovery only
npm run test:integration phase2 # Test detail fetching only
npm run test:integration single # Test single city
```

## Quick Start

```bash
# Install dependencies
npm install

# Run Phase 2 city-based scraper
npm run start:city

# Run integration tests
npm run test:integration

# Legacy single-phase scraper
npm run start

# Redis-based distributed architecture
npm run coordinator        # Start coordinator (city-based)
npm run worker             # Start worker (multiple instances)
npm run worker:verifier    # Start verifier worker
npm run metrics            # View metrics (http://localhost:9090/metrics)
npm run queue:stats        # View queue statistics
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--type` | mieszkanie, dom, dzialka, lokal | mieszkanie |
| `--transaction` | sale or rent | sale |
| `--location` | City/region slug | All Poland |
| `--limit` | Max listings to scrape | Unlimited |
| `--redis` | Redis URL for storage | None |

## Data Fields

| Field | Available |
|-------|:---------:|
| ID | ✅ |
| Title | ✅ |
| Price | ✅ |
| Price/m² | ✅ |
| Rooms | ✅ |
| Size (m²) | ✅ |
| Floor | ✅ |
| Location | ✅ |
| District | ✅ |
| Province | ✅ |
| Images | ✅ |
| Agency | ✅ |
| Private Owner | ✅ |

## Foreign Ownership

- **Full ownership** for EU/EEA citizens
- Non-EU citizens need Ministry approval for:
  - Land larger than 0.3 hectares
  - Property in border zones
- Approval process typically 1-3 months
- No restrictions on apartments/flats

## Phase 2 Architecture Details

### City-Based Scraper (`scraper-city.ts`)

**Phase 1: ID Discovery**
```typescript
// Fetches listing IDs from search results
for each city:
  for each page:
    fetch search results
    extract listing IDs
    store in memory
```

**Phase 2: Detail Fetching**
```typescript
// Fetches complete property data
for each listing ID:
  fetch property detail
  transform to standard format
  send to Core Service API
  store in database
```

**Benefits:**
- Comprehensive coverage of all listings
- Deduplication of listings across cities
- Rate limiting and retry logic
- Separate ID collection from detail fetching

### Redis Queue Architecture

For large-scale scraping, use the distributed architecture:

```
Coordinator → Redis Queue → Workers
                  ↓
            Core Service API
```

**Coordinator:** Discovers listing IDs and adds to queue
**Workers:** Process queue items (fetch details, transform, ingest)
**Verifier:** Validates data quality and completeness

### Major Polish Cities Covered

- Warszawa (Warsaw)
- Kraków
- Wrocław
- Poznań
- Gdańsk
- Szczecin
- Bydgoszcz
- Lublin
- Katowice
- Białystok
- And 21 more cities...

## Technical Notes

- Uses Otodom's Next.js data API
- No bot protection (simple HTTP requests)
- 36 listings per page
- Configurable rate limiting (default: 2s delay)
- TLS client support for advanced anti-detection
- User-Agent rotation (100+ variants)

## Files

```
landomo-poland-otodom/
├── src/
│   ├── scraper-v3.ts          # Main V3 scraper (QuintoAndar-based)
│   ├── scraper-city.ts        # City-based scraper
│   ├── scraper-geo-grid.ts    # Geographic grid scraper (conceptual)
│   ├── coordinator.ts         # Phase 1: ID discovery (Redis)
│   ├── worker.ts              # Phase 2: Detail fetching (Redis)
│   ├── worker-verifier.ts     # Data verification worker
│   ├── transformer.ts         # Otodom → StandardProperty
│   ├── types.ts               # TypeScript interfaces
│   ├── config.ts              # Configuration & city coordinates
│   ├── core.ts                # Core Service API client
│   ├── database.ts            # PostgreSQL client (Tier 1 DB)
│   ├── redis-queue.ts         # Redis queue implementation
│   ├── redis.ts               # Redis client
│   ├── logger.ts              # Winston logger
│   ├── utils.ts               # Utility functions
│   ├── metrics.ts             # Prometheus metrics
│   ├── metrics-server.ts      # Metrics HTTP server
│   ├── queue-stats.ts         # Queue statistics CLI
│   ├── tls-client.ts          # TLS fingerprinting client
│   ├── user-agents.ts         # User-Agent rotation
│   ├── api-client.ts          # Base API client
│   ├── api-scraper.ts         # REST API scraper
│   ├── parser.ts              # HTML/JSON parser
│   ├── normalizer-utils.ts    # Data normalization
│   ├── stealth.ts             # Anti-detection utilities
│   ├── test-integration.ts    # Integration tests
│   └── index.ts               # Package exports
├── database/
│   ├── schema.sql             # Database schema
│   └── migrations/            # Database migrations
├── docs/
│   └── API.md                 # API documentation
├── .env.example               # Environment variables template
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript config
├── Dockerfile                 # Docker image
├── docker-compose.yml         # Docker Compose config
└── README.md                  # This file
```

## Implementation Complete

This Otodom scraper is now **complete** and follows the QuintoAndar reference architecture:

✅ **scraper-v3.ts** - Main production scraper
✅ **Two-phase architecture** - ID discovery + Detail fetching
✅ **Core Service integration** - Sends to Landomo Core API
✅ **Transformer** - Polish market → StandardProperty
✅ **Redis queue support** - Distributed processing
✅ **PostgreSQL storage** - Optional Tier 1 database
✅ **Metrics & monitoring** - Prometheus metrics
✅ **Error handling** - Retry logic & backoff
✅ **Rate limiting** - Configurable delays
✅ **All 31 major cities** - Complete Poland coverage

### Architecture Highlights

**Based on landomo-brazil-quintoandar:**
- ✅ Same file structure & naming conventions
- ✅ Two-phase scraping pattern (coordinator + worker)
- ✅ Redis queue for distributed processing
- ✅ StandardProperty transformer
- ✅ Core Service API integration
- ✅ Metrics & observability
- ✅ TLS fingerprinting support
- ✅ User-Agent rotation
- ✅ Comprehensive error handling

**Ready for production deployment!**

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

## Quick Start

```bash
# Install dependencies
npm install

# Test with ~36 listings
npm run test

# Run full scrape
npm run scrape

# Scrape specific type and location
npm run scrape -- --type dom --location warszawa --transaction sale

# Store in Redis
npm run scrape -- --redis redis://localhost:6379
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

## Technical Notes

- Uses native `fetch` API (Node.js 18+)
- Parses `__NEXT_DATA__` from server-rendered pages
- 36 listings per page
- 2-second delay between requests

## Files

```
otodom/
├── src/
│   ├── types.ts
│   ├── parser.ts
│   ├── scraper.ts
│   └── index.ts
├── docs/
│   └── API.md
└── README.md
```

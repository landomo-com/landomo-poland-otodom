# Otodom Playwright Scraper - Debug Summary

**Date**: 2026-02-05
**Status**: ✅ WORKING

## Problem
The Playwright scraper was launching successfully but finding no data on pages. The `__NEXT_DATA__` extraction was returning empty results.

## Root Causes Identified

### 1. Incorrect __NEXT_DATA__ Path
**Issue**: Code was looking for `nextData.pageProps.data.searchAds` but the actual structure is `nextData.props.pageProps.data.searchAds`.

**Fix**: Updated all data extraction paths to use `nextData.props.pageProps.*`

### 2. Wrong Detail Page URLs
**Issue**: Using numeric listing IDs for detail page URLs instead of slugs.

**Example**:
- ❌ Wrong: `https://www.otodom.pl/pl/oferta/66463943`
- ✅ Correct: `https://www.otodom.pl/pl/oferta/stalowa-form-43-45-ID4uSj5`

**Fix**: Modified `fetchListingIds()` to return `"id:slug"` format, then extract slug in `fetchPropertyDetail()`.

### 3. URL Format for Search Pages
**Issue**: Tested multiple URL formats to find working one.

**Working URL**: `https://www.otodom.pl/pl/wyniki/sprzedaz/mieszkanie/mazowieckie/warszawa?limit=72&page=1`

### 4. Data Structure Mismatch
**Issue**: Playwright returns data in a different structure than expected by the transformer.

Playwright structure:
```javascript
{
  id: 67665638,
  title: "...",
  target: {
    Price: 2299999,
    Currency: "PLN",
    City: "warszawa",
    Area: 120,
    // ... many more fields
  },
  estate: "mieszkanie",
  advertType: "sale",
  // ...
}
```

Expected structure (from old scraper):
```javascript
{
  id: "67665638",
  title: "...",
  propertyType: "mieszkanie",
  listingType: "sale",
  location: { city: "warszawa", ... },
  details: { sqm: 120, ... },
  // ...
}
```

**Fix**: Created `convertPlaywrightAdToProperty()` function to map between structures.

## Solutions Applied

### 1. Fixed __NEXT_DATA__ Extraction Paths
```typescript
// Before
if (nextData?.pageProps?.data?.searchAds?.items)

// After
if (nextData?.props?.pageProps?.data?.searchAds?.items)
```

### 2. Implemented Slug-Based Detail URLs
```typescript
// Return IDs in "id:slug" format
const ids = items.map((item: any) => {
  const id = String(item.id);
  const slug = item.slug || id;
  return `${id}:${slug}`;
});

// Extract slug when fetching details
const [id, slug] = listingId.includes(':') ? listingId.split(':') : [listingId, listingId];
const url = `https://www.otodom.pl/pl/oferta/${slug}`;
```

### 3. Created Data Converter Function
```typescript
function convertPlaywrightAdToProperty(ad: any): Property {
  const target = ad.target || {};

  return {
    id: String(ad.id),
    title: ad.title || '',
    price: target.Price || null,
    currency: target.Currency || 'PLN',
    propertyType: ad.estate || 'mieszkanie',
    location: {
      city: target.City,
      coordinates: {
        lat: parseFloat(target.Latitude),
        lng: parseFloat(target.Longitude),
      }
    },
    details: {
      sqm: target.Area ? parseFloat(target.Area) : undefined,
      rooms: target.Rooms_num ? parseInt(target.Rooms_num) : undefined,
      // ...
    },
    // ... more mappings
  };
}
```

### 4. Updated Workflow
```typescript
// Fetch property detail (Playwright format)
const property = await scraper.fetchPropertyDetail(id, 'warszawa');

// Convert to expected Property format
const convertedProperty = convertPlaywrightAdToProperty(property);

// Transform to StandardProperty format
const standardized = transformToStandard(convertedProperty);
```

## Test Results

✅ **Listing Discovery**: Successfully fetches 50 listings per page (17,973 total in Warsaw)

✅ **Detail Fetching**: Successfully retrieves full property data using slug-based URLs

✅ **Data Transformation**: Correctly converts to StandardProperty format

✅ **Property Type Mapping**: Correctly identifies "mieszkanie" → "apartment"

### Sample Output
```
Testing property 1/3: 67321831
✓ Title: 4-pok. mieszkanie 65,79m2+ogródek 101m2
✓ Price: 983955 PLN
✓ Type: apartment
✓ Location: warszawa

Testing property 2/3: 67636421
✓ Title: 2 pok przy Metrze, Nowe osiedle, Najlepsze ceny.
✓ Price: 589000 PLN
✓ Type: apartment
✓ Location: warszawa

Testing property 3/3: 67665638
✓ Title: Mieszkanie na sprzedaż Warszawa Praga-Południe
✓ Price: 2299999 PLN
✓ Type: apartment
✓ Location: warszawa

=== TEST COMPLETE ===
Success: 3/3
Failed: 0/3
```

## Files Modified

1. `/home/samuelseidel/landomo/landomo-poland-otodom/src/scraper-playwright.ts`
   - Fixed __NEXT_DATA__ extraction paths
   - Implemented slug-based detail URLs
   - Created `convertPlaywrightAdToProperty()` function
   - Added test mode with `TEST_MODE` env var
   - Cleaned up debug logging

## How to Use

### Quick Test (3 properties)
```bash
TEST_MODE=true npx tsx src/scraper-playwright.ts
```

### Full Scrape (1 page = ~50 properties)
```bash
npx tsx src/scraper-playwright.ts
```

### Production Scrape (all cities, multiple pages)
```typescript
// Modify main() function to call:
await scraper.scrapeAllCities(maxPages: 10);
```

## Next Steps

1. ✅ Scraper is working - ready for production use
2. Test with other cities (Kraków, Wrocław, Poznań, etc.)
3. Add retry logic for failed requests
4. Implement rate limiting to avoid detection
5. Add progress tracking and resumption capability
6. Deploy to production environment

## Notes

- CloudFront protection is bypassed by Playwright browser automation
- The scraper uses `networkidle` wait strategy to ensure JavaScript execution
- Property type mapping handles Polish estate types: mieszkanie, dom, dzialka, lokal
- Images are extracted from `ad.images` array (Photo field in target is not reliably an array)

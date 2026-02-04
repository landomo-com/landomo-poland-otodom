import { Property, OtodomListing, OtodomResponse } from './types.js';
import * as normalizerUtils from './normalizer-utils';

const BASE_URL = 'https://www.otodom.pl';

export function parseNextData(html: string): OtodomResponse | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function extractListings(response: OtodomResponse): OtodomListing[] {
  return response?.props?.pageProps?.data?.searchAds?.items || [];
}

export function extractPagination(response: OtodomResponse) {
  return response?.props?.pageProps?.data?.searchAds?.pagination || null;
}

export function transformListing(listing: OtodomListing, transactionType: 'sale' | 'rent'): Property {
  const price = transactionType === 'sale'
    ? listing.totalPrice?.value
    : listing.rentPrice?.value;

  const currency = listing.totalPrice?.currency || listing.rentPrice?.currency || 'PLN';

  // Extract location details from reverseGeocoding
  // The API returns locations with fullName like "Krzyki, Wroclaw, dolnoslaskie"
  const locations = listing.location?.reverseGeocoding?.locations || [];

  // City is typically the second location (after province)
  const city = listing.location?.address?.city?.name
    || extractLocationPart(locations, 1);

  // District is typically the third or fourth location
  const district = extractLocationPart(locations, 2);

  // Province is the first location
  const province = listing.location?.address?.province?.name
    || extractLocationPart(locations, 0);

  // Parse rooms number
  const roomsMap: Record<string, number> = {
    'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5,
    'SIX': 6, 'SEVEN': 7, 'EIGHT': 8, 'NINE': 9, 'TEN': 10,
  };
  const rooms = listing.roomsNumber ? roomsMap[listing.roomsNumber] || undefined : undefined;

  // Extract images
  const images = listing.images?.slice(0, 5).map(img => img.large || img.medium || '').filter(Boolean) || [];

  // Build street address from street name and number
  const streetName = listing.location?.address?.street?.name;
  const streetNumber = listing.location?.address?.street?.number;
  const address = streetName
    ? (streetNumber ? `${streetName} ${streetNumber}` : streetName)
    : undefined;

  // href contains [lang] placeholder that needs to be replaced with /pl
  const url = listing.href
    ? `${BASE_URL}${listing.href.replace('[lang]', '/pl')}`
    : `${BASE_URL}/pl/oferta/${listing.slug}`;

  // Build development info if available
  const development = listing.developmentId && listing.developmentId > 0
    ? {
        id: listing.developmentId,
        title: listing.developmentTitle || undefined,
        url: listing.developmentUrl || undefined,
      }
    : undefined;

  // Use utility functions for enhanced extraction
  const sqm = listing.areaInSquareMeters;
  const fullText = `${listing.title} ${listing.shortDescription || ''}`;

  // Detect bedrooms from title/description or calculate from rooms
  const bedrooms = normalizerUtils.extractBedrooms(fullText) ||
                   (rooms && rooms > 0 ? Math.max(1, rooms - 1) : undefined);

  // Detect bathrooms from text or estimate from area
  let bathrooms = normalizerUtils.extractBathrooms(fullText);
  if (!bathrooms && sqm && rooms) {
    if (sqm < 50) bathrooms = 1;
    else if (sqm < 100) bathrooms = 1;
    else if (sqm < 150) bathrooms = 2;
    else bathrooms = Math.floor(sqm / 50);
  }

  // Calculate sqft from sqm
  const areaConversion = sqm ? normalizerUtils.convertArea(sqm, 'sqm') : { sqm: 0, sqft: 0 };
  const sqft = sqm ? areaConversion.sqft : undefined;

  // Calculate price metrics
  const pricePerSqm = price && sqm ? normalizerUtils.calculatePricePerSqm(price, sqm) : listing.pricePerSquareMeter?.value;
  const pricePerSqft = price && sqft ? normalizerUtils.calculatePricePerSqft(price, sqft) : undefined;

  // Detect property type
  const detectedPropertyType = normalizerUtils.detectPropertyType(fullText, normalizePropertyType(listing.estate));

  // Detect listing type
  const detectedListingType = normalizerUtils.detectListingType(url, fullText, transactionType);

  // Detect if furnished
  const furnished = normalizerUtils.detectFurnished(fullText);

  // Extract features using utility
  const features = normalizerUtils.extractFeatures(fullText);

  // Extract building year if present
  const buildingYear = normalizerUtils.extractBuildingYear(fullText);

  return {
    id: listing.id.toString(),
    source: 'otodom-poland',
    url,
    title: listing.title,
    price: price ?? null,
    currency,
    pricePerSqm: listing.pricePerSquareMeter?.value,
    pricePerSqft: pricePerSqft,
    propertyType: detectedPropertyType,
    listingType: detectedListingType,
    location: {
      address,
      city,
      district,
      province,
      country: 'Poland',
    },
    details: {
      sqm: listing.areaInSquareMeters,
      sqft: sqft,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      rooms,
      floor: listing.floorNumber,
      totalFloors: undefined, // Not provided by API
      terrainArea: listing.terrainAreaInSquareMeters,
      furnished: furnished,
      buildingYear: buildingYear,
    },
    features: features,
    images,
    description: listing.shortDescription,
    agent: listing.agency?.name ? { agency: listing.agency.name } : undefined,
    status: {
      isPrivateOwner: listing.isPrivateOwner,
      isPromoted: listing.isPromoted,
      isExclusiveOffer: listing.isExclusiveOffer,
    },
    dates: {
      createdAt: listing.dateCreated,
      postedAt: listing.dateCreated,
    },
    development,
    metadata: {
      source: 'otodom',
      portalName: 'Otodom',
      country: 'Poland',
    },
    scrapedAt: new Date().toISOString(),
  };
}

// Helper to extract location part from reverseGeocoding locations
function extractLocationPart(locations: Array<{ id: string; fullName: string }>, index: number): string | undefined {
  if (index >= locations.length) return undefined;
  const loc = locations[index];
  if (!loc?.fullName) return undefined;
  // fullName is like "Krzyki, Wroclaw, dolnoslaskie" - get the first part
  const parts = loc.fullName.split(',');
  return parts[0]?.trim();
}

function normalizePropertyType(estate?: string): string {
  if (!estate) return 'property';
  const map: Record<string, string> = {
    'FLAT': 'apartment',
    'HOUSE': 'house',
    'TERRAIN': 'land',
    'COMMERCIAL': 'commercial',
  };
  return map[estate] || estate.toLowerCase();
}

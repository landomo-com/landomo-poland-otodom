/**
 * Transformer for Otodom Poland Scraper
 *
 * Converts scraped Polish property data to StandardProperty format
 * for ingestion into the Core Service API.
 *
 * Polish Market Specifics:
 * - Property types: mieszkanie (apartment), dom (house), działka (land), lokal (commercial)
 * - Currency: PLN (Polish Złoty)
 * - Area units: Square meters (m²)
 * - Floor notation: Ground floor = 0, parter = ground
 * - Building types: kamienica, blok, wieżowiec, apartamentowiec
 */

import { Property } from './types.js';

/**
 * Standard property format for Core Service API
 * Based on Landomo StandardProperty specification
 */
export interface StandardProperty {
  // Core identification
  title: string;
  description?: string;

  // Pricing
  price: number | null;
  currency: string;
  price_per_sqm?: number;
  price_per_sqft?: number;

  // Property classification
  property_type: string;
  transaction_type: 'sale' | 'rent' | 'lease' | 'other';

  // Location
  location: {
    address?: string;
    city?: string;
    district?: string;
    province?: string;
    postal_code?: string;
    country: string;
    coordinates?: {
      lat: number;
      lon: number;
    };
  };

  // Property details
  details: {
    bedrooms?: number;
    bathrooms?: number;
    sqm?: number;
    sqft?: number;
    rooms?: number;
    floor?: string;
    total_floors?: number;
    year_built?: number;
    land_area_sqm?: number;
  };

  // Features and amenities
  features: string[];
  amenities?: {
    has_parking?: boolean;
    has_garage?: boolean;
    has_balcony?: boolean;
    has_terrace?: boolean;
    has_garden?: boolean;
    has_elevator?: boolean;
    has_air_conditioning?: boolean;
    has_heating?: boolean;
    has_security?: boolean;
    is_furnished?: boolean;
  };

  // Media
  images: string[];

  // Agent information
  agent?: {
    name?: string;
    agency?: string;
    phone?: string;
    email?: string;
  };

  // Status flags
  status?: {
    is_featured?: boolean;
    is_promoted?: boolean;
    is_exclusive?: boolean;
    is_verified?: boolean;
    is_private_owner?: boolean;
  };

  // Timestamps
  created_at?: string;
  updated_at?: string;
  scraped_at: string;

  // Country-specific fields for Polish market
  country_specific: {
    // Polish property type (original)
    typ_nieruchomosci?: 'mieszkanie' | 'dom' | 'dzialka' | 'lokal';

    // Building information
    typ_budynku?: string; // kamienica, blok, wieżowiec, apartamentowiec
    stan_wykonczenia?: string; // do wykończenia, do zamieszkania, do remontu
    material_budynku?: string; // cegła, beton, drewno

    // Floor information (Polish notation)
    pietro?: string; // parter, 1, 2, -1 (suterena)
    liczba_pieter?: number;

    // Room configuration
    liczba_pokoi?: number;

    // Ownership and legal
    forma_wlasnosci?: string; // własność, spółdzielcze własnościowe, spółdzielcze z KW
    forma_korzystania?: string; // pełna własność, użytkowanie wieczyste

    // Market information
    rynek?: string; // pierwotny (primary), wtórny (secondary)
    rok_budowy?: number;

    // Energy and utilities
    ogrzewanie?: string; // centralne, gazowe, elektryczne
    media?: string[]; // prąd, woda, gaz, kanalizacja

    // Additional Polish-specific features
    czynsz?: number; // Monthly maintenance fee (for apartments)
    czynsz_waluta?: string;
    balkon?: boolean;
    taras?: boolean;
    ogrod?: boolean;
    garaz?: boolean;
    piwnica?: boolean; // Cellar/basement
    poddasze?: boolean; // Attic
    winda?: boolean; // Elevator

    // Development information
    inwestycja_id?: number;
    inwestycja_nazwa?: string;
    inwestycja_url?: string;
  };
}

/**
 * Payload format for Core Service API ingestion
 */
export interface IngestionPayload {
  portal: string;
  portal_id: string;
  country: string;
  data: StandardProperty;
  raw_data: Property;
}

/**
 * Transform scraped property to StandardProperty format
 */
export function transformToStandard(property: Property): StandardProperty {
  // Map property type to standardized format
  const propertyTypeMap: Record<string, string> = {
    'apartment': 'apartment',
    'mieszkanie': 'apartment',
    'house': 'house',
    'dom': 'house',
    'land': 'land',
    'dzialka': 'land',
    'działka': 'land',
    'commercial': 'commercial',
    'lokal': 'commercial',
    'property': 'other',
  };

  const standardPropertyType = propertyTypeMap[property.propertyType.toLowerCase()] || 'other';

  // Map listing type to transaction type
  const transactionTypeMap: Record<string, 'sale' | 'rent' | 'lease' | 'other'> = {
    'sale': 'sale',
    'rent': 'rent',
    'lease': 'lease',
    'other': 'other',
  };

  const transactionType = transactionTypeMap[property.listingType] || 'other';

  // Extract coordinates
  const coordinates = property.location.coordinates?.lat && property.location.coordinates?.lng
    ? {
        lat: property.location.coordinates.lat,
        lon: property.location.coordinates.lng,
      }
    : undefined;

  // Convert sqm to sqft
  const sqft = property.details.sqm
    ? Math.round(property.details.sqm * 10.7639 * 10) / 10
    : property.details.sqft;

  // Parse amenities from features
  const amenities = parseAmenities(property.features, property.amenities);

  // Build country-specific fields
  const countrySpecific = buildCountrySpecificFields(property);

  // Convert price per sqm to price per sqft
  const pricePerSqft = property.pricePerSqm && property.details.sqm
    ? Math.round(property.pricePerSqm / 10.7639)
    : undefined;

  return {
    title: property.title,
    description: property.description,

    price: property.price,
    currency: property.currency,
    price_per_sqm: property.pricePerSqm,
    price_per_sqft: pricePerSqft,

    property_type: standardPropertyType,
    transaction_type: transactionType,

    location: {
      address: property.location.address,
      city: property.location.city,
      district: property.location.district,
      province: property.location.province,
      postal_code: property.location.postalCode,
      country: 'poland',
      coordinates,
    },

    details: {
      bedrooms: property.details.bedrooms,
      bathrooms: property.details.bathrooms,
      sqm: property.details.sqm,
      sqft,
      rooms: property.details.rooms,
      floor: property.details.floor,
      total_floors: property.details.totalFloors,
      year_built: property.details.buildingYear || property.details.yearBuilt,
      land_area_sqm: property.details.terrainArea,
    },

    features: property.features,
    amenities,

    images: property.images,

    agent: property.agent,

    status: {
      is_featured: property.status?.isFeatured,
      is_promoted: property.status?.isPromoted,
      is_exclusive: property.status?.isExclusiveOffer,
      is_verified: property.status?.isVerified,
      is_private_owner: property.status?.isPrivateOwner,
    },

    created_at: property.dates?.createdAt,
    updated_at: property.dates?.updatedAt,
    scraped_at: property.scrapedAt,

    country_specific: countrySpecific,
  };
}

/**
 * Parse amenities from features array
 */
function parseAmenities(
  features: string[],
  existingAmenities?: string[]
): StandardProperty['amenities'] {
  const allFeatures = [...features, ...(existingAmenities || [])];
  const featureText = allFeatures.join(' ').toLowerCase();

  return {
    has_parking: checkFeature(featureText, ['parking', 'garaż', 'miejsce parkingowe']),
    has_garage: checkFeature(featureText, ['garage', 'garaż']),
    has_balcony: checkFeature(featureText, ['balcony', 'balkon']),
    has_terrace: checkFeature(featureText, ['terrace', 'taras']),
    has_garden: checkFeature(featureText, ['garden', 'ogród', 'ogrod']),
    has_elevator: checkFeature(featureText, ['elevator', 'lift', 'winda']),
    has_air_conditioning: checkFeature(featureText, ['air', 'klimatyzacja', 'ac']),
    has_heating: checkFeature(featureText, ['heating', 'ogrzewanie', 'centralne']),
    has_security: checkFeature(featureText, ['security', 'alarm', 'ochrona', 'monitoring']),
    is_furnished: checkFeature(featureText, ['furnished', 'umeblowane', 'wyposażone']),
  };
}

/**
 * Check if any keyword exists in feature text
 */
function checkFeature(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}

/**
 * Build country-specific fields for Polish market
 */
function buildCountrySpecificFields(property: Property): StandardProperty['country_specific'] {
  const specific: StandardProperty['country_specific'] = {};

  // Original Polish property type
  const polishTypeMap: Record<string, 'mieszkanie' | 'dom' | 'dzialka' | 'lokal'> = {
    'apartment': 'mieszkanie',
    'house': 'dom',
    'land': 'dzialka',
    'commercial': 'lokal',
  };
  specific.typ_nieruchomosci = polishTypeMap[property.propertyType.toLowerCase()];

  // Building type from details or features
  if (property.details.buildingType) {
    specific.typ_budynku = property.details.buildingType;
  }

  // Floor information (preserve Polish notation)
  if (property.details.floor) {
    specific.pietro = property.details.floor;
  }
  if (property.details.totalFloors) {
    specific.liczba_pieter = property.details.totalFloors;
  }

  // Room count
  if (property.details.rooms) {
    specific.liczba_pokoi = property.details.rooms;
  }

  // Building year
  if (property.details.buildingYear) {
    specific.rok_budowy = property.details.buildingYear;
  }

  // Parse features for Polish-specific amenities
  const featureText = property.features.join(' ').toLowerCase();

  specific.balkon = checkFeature(featureText, ['balkon', 'balcony']);
  specific.taras = checkFeature(featureText, ['taras', 'terrace']);
  specific.ogrod = checkFeature(featureText, ['ogród', 'ogrod', 'garden']);
  specific.garaz = checkFeature(featureText, ['garaż', 'garaz', 'garage']);
  specific.piwnica = checkFeature(featureText, ['piwnica', 'basement', 'cellar']);
  specific.poddasze = checkFeature(featureText, ['poddasze', 'attic']);
  specific.winda = checkFeature(featureText, ['winda', 'elevator', 'lift']);

  // Development information
  if (property.development?.id) {
    specific.inwestycja_id = property.development.id;
    specific.inwestycja_nazwa = property.development.title;
    specific.inwestycja_url = property.development.url;
  }

  // Energy class
  if (property.energyClass) {
    specific.ogrzewanie = property.energyClass;
  }

  return specific;
}

/**
 * Create ingestion payload for Core Service API
 */
export function createIngestionPayload(property: Property): IngestionPayload {
  return {
    portal: 'otodom',
    portal_id: property.id,
    country: 'poland',
    data: transformToStandard(property),
    raw_data: property,
  };
}

/**
 * Batch transform multiple properties
 */
export function transformBatch(properties: Property[]): StandardProperty[] {
  return properties.map(transformToStandard);
}

/**
 * Batch create ingestion payloads
 */
export function createBatchIngestionPayload(properties: Property[]): IngestionPayload[] {
  return properties.map(createIngestionPayload);
}

export default {
  transformToStandard,
  createIngestionPayload,
  transformBatch,
  createBatchIngestionPayload,
};

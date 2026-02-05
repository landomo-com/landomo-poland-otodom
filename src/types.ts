export interface StandardProperty {
  title: string;
  price: number | null;
  currency: string;
  property_type: string;
  transaction_type: 'sale' | 'rent' | 'lease' | 'other';
  
  location: {
    address?: string;
    city?: string;
    district?: string;
    province?: string;
    country: string;
    postal_code?: string;
    coordinates?: {
      lat: number;
      lon: number;
    };
  };
  
  details: {
    sqm?: number;
    sqft?: number;
    rooms?: number;
    bedrooms?: number;
    bathrooms?: number;
    floor?: string;
    total_floors?: number;
    terrain_area?: number;
    year_built?: number;
    building_type?: string;
    furnished?: boolean;
  };
  
  features: string[];
  amenities?: Record<string, boolean>;
  images: string[];
  description?: string;
  
  agent?: {
    name?: string;
    agency?: string;
    phone?: string;
    email?: string;
  };
  
  status?: {
    is_promoted?: boolean;
    is_exclusive?: boolean;
    is_verified?: boolean;
    is_private_owner?: boolean;
  };
  
  dates?: {
    created_at?: string;
    posted_at?: string;
    updated_at?: string;
  };
  
  development?: {
    id?: number;
    title?: string;
    url?: string;
  };
  
  country_specific?: Record<string, any>;
}

export interface OtodomListing {
  id: number;
  title: string;
  slug: string;
  estate?: string;
  transaction?: string;
  location: {
    address?: {
      street?: { name?: string; number?: string };
      city?: { name: string };
      province?: { name: string };
    };
    reverseGeocoding?: {
      locations: Array<{
        id: string;
        fullName: string;
      }>;
    };
  };
  images?: Array<{ large?: string; medium?: string }>;
  totalPrice?: { value: number; currency: string };
  rentPrice?: { value: number; currency: string };
  pricePerSquareMeter?: { value: number; currency: string };
  areaInSquareMeters?: number;
  terrainAreaInSquareMeters?: number;
  roomsNumber?: string;
  floorNumber?: string;
  isPrivateOwner?: boolean;
  isPromoted?: boolean;
  isExclusiveOffer?: boolean;
  agency?: { name?: string };
  href?: string;
  dateCreated?: string;
  createdAtFirst?: string;
  shortDescription?: string;
  developmentId?: number;
  developmentTitle?: string;
  developmentUrl?: string;
}

export interface OtodomResponse {
  props: {
    pageProps: {
      data: {
        searchAds: {
          items: OtodomListing[];
          pagination: {
            totalItems: number;
            totalPages: number;
            currentPage: number;
            itemsPerPage: number;
          };
        };
      };
    };
  };
}

export interface APIResponse {
  hits?: {
    hits?: Array<{
      _id: string;
      _source: any;
    }>;
    total?: {
      value: number;
    };
  };
}

// Property type for transformer compatibility
export interface Property {
  id: string;
  title: string;
  description?: string;
  price: number | null;
  currency: string;
  pricePerSqm?: number;
  propertyType: string;
  listingType: string;

  location: {
    address?: string;
    city?: string;
    district?: string;
    province?: string;
    postalCode?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };

  details: {
    sqm?: number;
    sqft?: number;
    rooms?: number;
    bedrooms?: number;
    bathrooms?: number;
    floor?: string;
    totalFloors?: number;
    terrainArea?: number;
    buildingYear?: number;
    yearBuilt?: number;
    buildingType?: string;
  };

  features: string[];
  amenities?: string[];
  images: string[];

  agent?: {
    name?: string;
    agency?: string;
    phone?: string;
    email?: string;
  };

  status?: {
    isFeatured?: boolean;
    isPromoted?: boolean;
    isExclusiveOffer?: boolean;
    isVerified?: boolean;
    isPrivateOwner?: boolean;
  };

  dates?: {
    createdAt?: string;
    updatedAt?: string;
  };

  development?: {
    id?: number;
    title?: string;
    url?: string;
  };

  energyClass?: string;
  scrapedAt: string;
}

// City coordinates for geo-based scraping
export interface CityCoordinates {
  lat: number;
  lng: number;
  viewport?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

// Scraper result type for Phase 2
export interface ScraperResult {
  total: number;
  scraped: number;
  failed: number;
  city: string;
  state?: string;
  properties: any[];
}

// Search options for API calls
export interface SearchOptions {
  city?: string;
  transactionType?: 'sale' | 'rent';
  propertyType?: string;
  page?: number;
  limit?: number;
}

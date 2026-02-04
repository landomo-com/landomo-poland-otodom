export interface Property {
  // Core fields (10 minimum)
  id: string;
  source: string;
  url: string;
  title: string;
  price: number | null;
  currency: string;
  propertyType: string;
  listingType: 'sale' | 'rent' | 'lease' | 'other';
  location: {
    address?: string;
    city?: string;
    district?: string;
    province?: string;
    country: string;
    coordinates?: {
      lat?: number;
      lng?: number;
    };
  };
  images: string[];
  scrapedAt: string;

  // Extended fields (5+)
  pricePerSqm?: number;
  pricePerSqft?: number;
  description?: string;

  details: {
    bedrooms?: number;
    bathrooms?: number;
    sqm?: number;
    sqft?: number;
    rooms?: number;
    floor?: string;
    totalFloors?: number;
    terrainArea?: number;
    buildingYear?: number;
    buildingAge?: number;
    buildingType?: string;
    furnished?: boolean | null;
    parkingSpots?: number;
    hasGarden?: boolean;
    hasBalcony?: boolean;
  };

  agent?: {
    name?: string;
    agency?: string;
    phone?: string;
    email?: string;
    url?: string;
  };

  features: string[];
  amenities?: string[];
  energyClass?: string;

  status?: {
    isPrivateOwner?: boolean;
    isPromoted?: boolean;
    isExclusiveOffer?: boolean;
    isFeatured?: boolean;
    isVerified?: boolean;
  };

  dates?: {
    postedAt?: string;
    updatedAt?: string;
    createdAt?: string;
  };

  development?: {
    id?: number;
    title?: string;
    url?: string;
  };

  metadata?: {
    source?: string;
    portalName?: string;
    country?: string;
  };
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

export interface ScraperConfig {
  transactionType: 'sale' | 'rent';
  propertyType: 'mieszkanie' | 'dom' | 'dzialka' | 'lokal';
  location?: string;
  maxPages?: number;
  delayMs?: number;
  redisUrl?: string;
}

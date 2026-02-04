/**
 * Field Extraction Enhancement Utilities
 *
 * Provides standardized functions for:
 * - Currency conversion
 * - Area unit conversion (sqft ↔ sqm)
 * - Price normalization
 * - Field detection from text
 * - Feature extraction
 */

// Currency conversion rates to USD (Updated January 2026)
export const CURRENCY_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.09,
  GBP: 1.27,
  JPY: 0.0067,
  CNY: 0.138,
  AUD: 0.65,
  CAD: 0.74,
  CHF: 1.12,
  SEK: 0.095,
  NOK: 0.094,
  DKK: 0.146,
  PLN: 0.25,
  CZK: 0.042,
  HUF: 0.0027,
  RON: 0.22,
  BGN: 0.56,
  HRK: 0.145,
  RUB: 0.011,
  UKR: 0.024,
  TRY: 0.031,
  ILS: 0.27,
  AED: 0.27,
  SAR: 0.27,
  JOD: 1.41,
  EGP: 0.032,
  ZAR: 0.054,
  NGN: 0.0006,
  KES: 0.0077,
  INR: 0.012,
  PKR: 0.0036,
  BDT: 0.0093,
  THA: 0.028,
  MYR: 0.21,
  SGD: 0.74,
  IDR: 0.000063,
  PHP: 0.018,
  VND: 0.000039,
  BRL: 0.20,
  MXN: 0.058,
  COP: 0.00024,
  ARS: 0.0011,
  PEN: 0.27,
  CLP: 0.0011,
};

// Area conversion constants
export const SQFT_TO_SQM = 0.092903;
export const SQM_TO_SQFT = 10.7639;

/**
 * Convert area from one unit to another
 */
export function convertArea(value: number, fromUnit: 'sqft' | 'sqm'): { sqm: number; sqft: number } {
  if (!value || isNaN(value)) {
    return { sqm: 0, sqft: 0 };
  }

  const sqm = fromUnit === 'sqft' ? Math.round(value * SQFT_TO_SQM * 10) / 10 : Math.round(value * 10) / 10;
  const sqft = fromUnit === 'sqft' ? Math.round(value * 10) / 10 : Math.round(value * SQM_TO_SQFT * 10) / 10;

  return { sqm, sqft };
}

/**
 * Convert price to USD equivalent
 */
export function convertPriceToUSD(price: number, currency: string): number {
  if (!price || isNaN(price)) return 0;
  const rate = CURRENCY_RATES[currency] || 1;
  return Math.round(price * rate);
}

/**
 * Normalize text by removing extra spaces and lowercasing
 */
export function normalizeText(text: string | undefined | null): string {
  if (!text) return '';
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Extract bedrooms from text
 */
export function extractBedrooms(text: string, currentValue?: number): number | undefined {
  if (currentValue !== undefined && currentValue > 0) return currentValue;

  const normalized = normalizeText(text);

  // Check for specific patterns
  const patterns = [
    /(\d+)\s*(?:bedroom|bed|br|bedrooms|beds)/i,
    /(\d+)\s*(?:спальн|сп\.?|br|chambre)/i,
    /(\d+)\s*(?:sypialnia|pokój|spálň|ložnice|yatak|chambre)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0 && num < 20) return num;
    }
  }

  return undefined;
}

/**
 * Extract bathrooms from text
 */
export function extractBathrooms(text: string, currentValue?: number): number | undefined {
  if (currentValue !== undefined && currentValue > 0) return currentValue;

  const patterns = [
    /(\d+)\s*(?:bathroom|bath|ba|bathrooms|baths)/i,
    /(\d+)\s*(?:ванн|wc|łazienka|koupelna|banyo|salle\s+de\s+bain)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0 && num < 20) return num;
    }
  }

  return undefined;
}

/**
 * Extract floor number from text
 */
export function extractFloor(text: string, currentValue?: string): string | undefined {
  if (currentValue) return currentValue;

  const patterns = [
    /(?:floor|piso|étage|piëtro|piętr?o|poschodí|kat|floor)\s*[:]?\s*(\d+)/i,
    /(\d+)(?:st|nd|rd|th)?\s*(?:floor|story)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Extract total floors from text
 */
export function extractTotalFloors(text: string, currentValue?: string | number): number | undefined {
  if (currentValue) {
    if (typeof currentValue === 'number') return currentValue;
    const parsed = parseInt(currentValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  const patterns = [
    /(?:total|all|building)\s*(?:floors|stories|stories|étages|piętr?o)\s*[:]?\s*(\d+)/i,
    /(\d+)\s*(?:storey|story|floor|étage|piętr?o|poschodí)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0 && num < 100) return num;
    }
  }

  return undefined;
}

/**
 * Extract property type from text
 */
export function detectPropertyType(text: string, currentValue?: string): string {
  if (currentValue && currentValue !== 'unknown' && currentValue !== 'property') return currentValue;

  const normalized = normalizeText(text);

  // Apartment patterns
  if (normalized.match(/apartment|apt|flat|studio|apartmen|апартамен|wohnun|apartado|apartemen|căn hộ|apartado|apartament|lakás|byt|stan|apartman/i)) {
    return 'apartment';
  }

  // House patterns
  if (normalized.match(/house|villa|home|single family|detached|maison|casa|dom|haus|huis|дом|hjem|onda|rumah|casa|chalets|chalet|nhà|σπίτι/i)) {
    return 'house';
  }

  // Land/Plot patterns
  if (normalized.match(/land|plot|lot|terrain|земл|tomt|grund|parcela|lote|terreno|участок|участ|tanah|đất|участка|לקרקע/i)) {
    return 'land';
  }

  // Commercial patterns
  if (normalized.match(/commercial|office|retail|warehouse|shop|bureau|loja|tienda|магаз|handel|negocio|lokal|офис|दुकान|ki/i)) {
    return 'commercial';
  }

  // Townhouse/Duplex patterns
  if (normalized.match(/townhouse|duplex|semi|terraced|cottage|rowhouse|таунха|двойн/i)) {
    return 'townhouse';
  }

  return 'property';
}

/**
 * Detect listing type (sale/rent)
 */
export function detectListingType(url: string, text: string, currentValue?: string): 'sale' | 'rent' | 'lease' {
  if (currentValue && (currentValue === 'sale' || currentValue === 'rent' || currentValue === 'lease')) {
    return currentValue;
  }

  const normalized = normalizeText(url + ' ' + text);

  // Rent patterns
  if (normalized.match(/rent|rental|lease|alquiler|louer|miete|huur|прокат|arriendo|租用|thuê|χρήση|للايجار|vermiet|μισθ/i)) {
    return 'rent';
  }

  // Sale patterns
  if (normalized.match(/sale|buy|purchase|vend|verkauf|verkoop|продаж|comprar|compra|beli|satılık|vásárlá|خاص|koop/i)) {
    return 'sale';
  }

  // Default to sale if not explicitly rent
  return 'sale';
}

/**
 * Extract features/amenities from text
 */
export function extractFeatures(text: string, existingFeatures: string[] = []): string[] {
  const features = new Set([...existingFeatures]);
  const normalized = normalizeText(text);

  // Feature mappings
  const featurePatterns: Record<string, RegExp[]> = {
    parking: [/parking|garaž|garaje|автомоб|停車|停车/i],
    garage: [/garage|garaż|garaj/i],
    balcony: [/balcon|balkó|terase|балкон|陽台|балконе/i],
    terrace: [/terrace|terás|terrazza|taras|терра|露台|테라스/i],
    garden: [/garden|jardin|garten|tuin|сад|庭園|ogród|zahrad/i],
    pool: [/pool|piscin|schwimm|zwembad|бассей|プール|pula|bazen/i],
    elevator: [/elevator|lift|aufzug|ascensor|ascenseur|лифт|エレベーター|winda|výtah/i],
    'air-conditioning': [/air\s*conditioning|ac|aircon|klimatyzac|klimaanlage|airco|кондиционер|エアコン|klimatizac/i],
    'central-heating': [/central\s*heat|heating|chauffage|heizung|verwarming|отоплен|暖房|topení|ısıtma/i],
    'hot-water': [/hot\s*water|agua\s*caliente|eau\s*chaude|warmwasser|agua\s*quente|горячая\s*вода/i],
    'alarm-system': [/alarm|sécur|безопас|警報|sistema\s+de\s+seguridad/i],
    'security-gate': [/gate|portão|puerta|portone|въезд|gate/i],
    furnished: [/furnished|amueblad|meublé|möbliert|gemeubleerd|меблирован|furnished/i],
    'laundry-room': [/laundry|washer|lavanderia|buanderie|waschmaschine|lavadero/i],
    'storage-room': [/storage|bodega|cave|keller|kelder|подвал/i],
  };

  for (const [feature, patterns] of Object.entries(featurePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        features.add(feature);
        break;
      }
    }
  }

  return Array.from(features);
}

/**
 * Extract contact information from text
 */
export function extractContactInfo(text: string): { phone?: string; email?: string } {
  const contact: { phone?: string; email?: string } = {};

  // Phone patterns (international)
  const phonePattern = /(?:\+\d{1,3}[-.\s]?)?\(?[0-9]{1,4}\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{0,4}/g;
  const phones = text.match(phonePattern);
  if (phones && phones.length > 0) {
    contact.phone = phones[0];
  }

  // Email pattern
  const emailPattern = /[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const emails = text.match(emailPattern);
  if (emails && emails.length > 0) {
    contact.email = emails[0];
  }

  return contact;
}

/**
 * Detect if property is furnished
 */
export function detectFurnished(text: string, currentValue?: boolean | null): boolean | null {
  if (currentValue !== null && currentValue !== undefined) return currentValue;

  const normalized = normalizeText(text);

  const furnishedPatterns = [
    /furnished|meublé|möbliert|amueblad|furnished|umeblowany|зафур|меблирован|furnished/i,
  ];

  const unfurnishedPatterns = [
    /unfurnished|not furnished|bare|bespoke|ungemeubleerd|nie umeblowany|не меблирован|素房|emptyset/i,
  ];

  for (const pattern of furnishedPatterns) {
    if (pattern.test(text)) return true;
  }

  for (const pattern of unfurnishedPatterns) {
    if (pattern.test(text)) return false;
  }

  return null;
}

/**
 * Extract building year
 */
export function extractBuildingYear(text: string, currentValue?: number): number | undefined {
  if (currentValue && currentValue > 1800 && currentValue < 2100) return currentValue;

  const patterns = [
    /(?:built|construido|built|construit|bouwjaar|год\s*строит|築|건설)\s*[:]?\s*(\d{4})/i,
    /(\d{4})\s*(?:built|construído|construcción|construction|construcción|建築|건축)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const year = parseInt(match[1], 10);
      if (!isNaN(year) && year > 1800 && year < 2100) {
        return year;
      }
    }
  }

  return undefined;
}

/**
 * Calculate price per sqm
 */
export function calculatePricePerSqm(price: number | undefined, sqm: number | undefined): number | undefined {
  if (!price || !sqm || sqm === 0) return undefined;
  return Math.round(price / sqm);
}

/**
 * Calculate price per sqft
 */
export function calculatePricePerSqft(price: number | undefined, sqft: number | undefined): number | undefined {
  if (!price || !sqft || sqft === 0) return undefined;
  return Math.round(price / sqft);
}

/**
 * Validate price range for currency
 */
export function isValidPrice(price: number, currency: string): boolean {
  if (!price || price < 0) return false;

  // Reasonable price ranges in original currency
  const ranges: Record<string, [number, number]> = {
    USD: [1000, 100_000_000],
    EUR: [1000, 100_000_000],
    GBP: [1000, 100_000_000],
    PLN: [10000, 500_000_000],
    CZK: [50000, 2_000_000_000],
    HUF: [1_000_000, 100_000_000_000],
    INR: [100_000, 10_000_000_000],
    BRL: [10000, 100_000_000],
    RUB: [100_000, 10_000_000_000],
  };

  const range = ranges[currency] || [100, 1_000_000_000];
  return price >= range[0] && price <= range[1];
}

/**
 * Format field extraction report
 */
export interface FieldExtractionReport {
  totalProperties: number;
  averageFields: number;
  fieldCoverage: Record<string, number>;
  properties: Array<{
    id: string;
    fieldsExtracted: string[];
    fieldCount: number;
  }>;
}

export function generateFieldExtractionReport(properties: any[]): FieldExtractionReport {
  const fieldCounts: Record<string, number> = {};
  const propertyReports = [];

  for (const prop of properties) {
    const fields = Object.keys(prop).filter(k => prop[k] !== undefined && prop[k] !== null);
    propertyReports.push({
      id: prop.id,
      fieldsExtracted: fields,
      fieldCount: fields.length,
    });

    for (const field of fields) {
      fieldCounts[field] = (fieldCounts[field] || 0) + 1;
    }
  }

  const totalFields = Object.values(fieldCounts).reduce((a, b) => a + b, 0);
  const averageFields = properties.length > 0 ? totalFields / properties.length : 0;

  // Calculate coverage percentage
  const fieldCoverage: Record<string, number> = {};
  for (const [field, count] of Object.entries(fieldCounts)) {
    fieldCoverage[field] = Math.round((count / properties.length) * 100);
  }

  return {
    totalProperties: properties.length,
    averageFields: Math.round(averageFields * 10) / 10,
    fieldCoverage,
    properties: propertyReports,
  };
}

export default {
  CURRENCY_RATES,
  SQFT_TO_SQM,
  SQM_TO_SQFT,
  convertArea,
  convertPriceToUSD,
  normalizeText,
  extractBedrooms,
  extractBathrooms,
  extractFloor,
  extractTotalFloors,
  detectPropertyType,
  detectListingType,
  extractFeatures,
  extractContactInfo,
  detectFurnished,
  extractBuildingYear,
  calculatePricePerSqm,
  calculatePricePerSqft,
  isValidPrice,
  generateFieldExtractionReport,
};

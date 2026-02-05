import dotenv from 'dotenv';
import { CityCoordinates } from './types';

dotenv.config();

export const config = {
  // Core Service API
  apiUrl: process.env.LANDOMO_API_URL || 'https://core.landomo.com/api/v1',
  apiKey: process.env.LANDOMO_API_KEY || '',
  
  // Portal info
  portal: 'otodom',
  country: 'poland',
  
  // Scraper config
  transactionType: (process.env.TRANSACTION_TYPE as 'sale' | 'rent') || 'sale',
  propertyType: process.env.PROPERTY_TYPE || 'mieszkanie', // mieszkanie, dom, dzialka, lokal
  pageSize: parseInt(process.env.PAGE_SIZE || '36'),
  
  // Rate limiting
  requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || '2000'),
  maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '3'),
  
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Database
  scraperDb: {
    host: process.env.SCRAPER_DB_HOST || 'localhost',
    port: parseInt(process.env.SCRAPER_DB_PORT || '5432'),
    database: process.env.SCRAPER_DB_NAME || 'scraper_poland_otodom',
    user: process.env.SCRAPER_DB_USER || 'landomo',
    password: process.env.SCRAPER_DB_PASSWORD || '',
  },
  
  // Metrics
  metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
  metricsUpdateInterval: parseInt(process.env.METRICS_UPDATE_INTERVAL || '15000'),
};

// Major Polish cities for city-based scraping
export const MAJOR_CITIES = [
  'warszawa',
  'krakow', 
  'wroclaw',
  'poznan',
  'gdansk',
  'szczecin',
  'bydgoszcz',
  'lublin',
  'katowice',
  'bialystok',
  'gdynia',
  'czestochowa',
  'radom',
  'sosnowiec',
  'torun',
  'kielce',
  'gliwice',
  'zabrze',
  'bytom',
  'olsztyn',
  'bielsko-biala',
  'rzeszow',
  'ruda-slaska',
  'rybnik',
  'tychy',
  'dabrowa-gornicza',
  'opole',
  'elblag',
  'plock',
  'gorzow-wielkopolski',
];

// City coordinates for major Polish cities
export const CITY_COORDS: Record<string, CityCoordinates> = {
  'warszawa-poland': {
    lat: 52.2297,
    lng: 21.0122,
    viewport: { north: 52.37, south: 52.09, east: 21.27, west: 20.85 },
  },
  'krakow-poland': {
    lat: 50.0647,
    lng: 19.9450,
    viewport: { north: 50.12, south: 50.01, east: 20.07, west: 19.82 },
  },
  'wroclaw-poland': {
    lat: 51.1079,
    lng: 17.0385,
    viewport: { north: 51.19, south: 51.03, east: 17.16, west: 16.92 },
  },
  'poznan-poland': {
    lat: 52.4064,
    lng: 16.9252,
    viewport: { north: 52.47, south: 52.34, east: 17.05, west: 16.80 },
  },
  'gdansk-poland': {
    lat: 54.3520,
    lng: 18.6466,
    viewport: { north: 54.42, south: 54.28, east: 18.77, west: 18.52 },
  },
  'szczecin-poland': {
    lat: 53.4285,
    lng: 14.5528,
    viewport: { north: 53.50, south: 53.36, east: 14.68, west: 14.43 },
  },
  'bydgoszcz-poland': {
    lat: 53.1235,
    lng: 18.0084,
    viewport: { north: 53.19, south: 53.06, east: 18.13, west: 17.89 },
  },
  'lublin-poland': {
    lat: 51.2465,
    lng: 22.5684,
    viewport: { north: 51.31, south: 51.18, east: 22.69, west: 22.45 },
  },
  'katowice-poland': {
    lat: 50.2649,
    lng: 19.0238,
    viewport: { north: 50.33, south: 50.20, east: 19.15, west: 18.90 },
  },
  'bialystok-poland': {
    lat: 53.1325,
    lng: 23.1688,
    viewport: { north: 53.19, south: 53.07, east: 23.29, west: 23.05 },
  },
};

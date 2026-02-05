/**
 * Prometheus Metrics for Scraper Monitoring
 * Exposes metrics on /metrics endpoint for Prometheus scraping
 */

import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { logger } from './logger';

// Create registry
export const register = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// Custom metrics

// Properties processed
export const propertiesProcessedTotal = new Counter({
  name: 'scraper_properties_processed_total',
  help: 'Total number of properties processed',
  labelNames: ['status'], // 'changed', 'unchanged', 'failed'
  registers: [register],
});

// Properties discovered
export const propertiesDiscoveredTotal = new Counter({
  name: 'scraper_properties_discovered_total',
  help: 'Total number of properties discovered',
  labelNames: ['source'], // 'city', 'geo'
  registers: [register],
});

// Change rate
export const changeRateGauge = new Gauge({
  name: 'scraper_change_rate',
  help: 'Current change rate (percentage of properties that changed)',
  registers: [register],
});

// Queue depth
export const queueDepthGauge = new Gauge({
  name: 'scraper_queue_depth',
  help: 'Current number of items in processing queue',
  labelNames: ['queue_type'], // 'main', 'missing'
  registers: [register],
});

// Missing queue depth
export const missingQueueDepthGauge = new Gauge({
  name: 'scraper_missing_queue_depth',
  help: 'Current number of items in missing verification queue',
  registers: [register],
});

// API call duration
export const apiCallDuration = new Histogram({
  name: 'scraper_api_call_duration_seconds',
  help: 'Duration of API calls in seconds',
  labelNames: ['endpoint', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Worker processing time
export const workerProcessingTime = new Histogram({
  name: 'scraper_worker_processing_time_seconds',
  help: 'Time taken to process a single property',
  labelNames: ['worker_id'],
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// Active workers
export const activeWorkersGauge = new Gauge({
  name: 'scraper_active_workers',
  help: 'Number of currently active workers',
  registers: [register],
});

// Verified inactive properties
export const verifiedInactiveTotal = new Counter({
  name: 'scraper_verified_inactive_total',
  help: 'Total number of properties verified as inactive',
  registers: [register],
});

// Database operations
export const databaseOperations = new Counter({
  name: 'scraper_database_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'status'], // operation: 'snapshot', 'change', 'metadata'
  registers: [register],
});

// Scrape run duration
export const scrapeRunDuration = new Histogram({
  name: 'scraper_run_duration_seconds',
  help: 'Duration of complete scrape runs',
  labelNames: ['run_type'], // 'city', 'geo'
  buckets: [60, 300, 600, 1800, 3600, 7200],
  registers: [register],
});

// Errors
export const errorsTotal = new Counter({
  name: 'scraper_errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type'], // 'fetch', 'transform', 'send', 'database'
  registers: [register],
});

// Geographic area stats
export const areaChangeRateGauge = new Gauge({
  name: 'scraper_area_change_rate',
  help: 'Change rate per geographic area',
  labelNames: ['area_name', 'area_type'],
  registers: [register],
});

export const areaScrapeIntervalGauge = new Gauge({
  name: 'scraper_area_interval_hours',
  help: 'Scrape interval in hours per geographic area',
  labelNames: ['area_name', 'area_type'],
  registers: [register],
});

// Helper functions for common operations

export function incrementProcessed(status: 'changed' | 'unchanged' | 'failed') {
  propertiesProcessedTotal.inc({ status });
}

export function incrementDiscovered(source: 'city' | 'geo') {
  propertiesDiscoveredTotal.inc({ source });
}

export function updateChangeRate(rate: number) {
  changeRateGauge.set(rate);
}

export function updateQueueDepth(depth: number, queueType: 'main' | 'missing' = 'main') {
  queueDepthGauge.set({ queue_type: queueType }, depth);
}

export function recordApiCall(endpoint: string, status: string, duration: number) {
  apiCallDuration.observe({ endpoint, status }, duration);
}

export function recordProcessingTime(workerId: string, duration: number) {
  workerProcessingTime.observe({ worker_id: workerId }, duration);
}

export function setActiveWorkers(count: number) {
  activeWorkersGauge.set(count);
}

export function incrementVerifiedInactive() {
  verifiedInactiveTotal.inc();
}

export function recordDatabaseOp(operation: string, status: 'success' | 'failure') {
  databaseOperations.inc({ operation, status });
}

export function recordScrapeRunDuration(runType: 'city' | 'geo', duration: number) {
  scrapeRunDuration.observe({ run_type: runType }, duration);
}

export function incrementError(errorType: string) {
  errorsTotal.inc({ error_type: errorType });
}

export function updateAreaMetrics(areaName: string, areaType: string, changeRate: number, intervalHours: number) {
  areaChangeRateGauge.set({ area_name: areaName, area_type: areaType }, changeRate);
  areaScrapeIntervalGauge.set({ area_name: areaName, area_type: areaType }, intervalHours);
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}

/**
 * Clear all metrics (for testing)
 */
export function clearMetrics() {
  register.resetMetrics();
}

logger.info('Prometheus metrics initialized');

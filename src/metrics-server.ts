/**
 * Metrics HTTP Server
 * Exposes Prometheus metrics on /metrics endpoint
 */

import http from 'http';
import { getMetrics, updateQueueDepth, updateChangeRate, setActiveWorkers } from './metrics';
import { RedisQueue } from './redis-queue';
import { ScraperDatabase } from './database';
import { logger } from './logger';

const PORT = parseInt(process.env.METRICS_PORT || '9090');
const UPDATE_INTERVAL = parseInt(process.env.METRICS_UPDATE_INTERVAL || '15000'); // 15 seconds

let queue: RedisQueue;
let db: ScraperDatabase;

/**
 * Update metrics from Redis and Database
 */
async function updateMetrics() {
  try {
    // Queue metrics
    const queueStats = await queue.getStats();
    updateQueueDepth(queueStats.queueDepth, 'main');

    const missingQueueDepth = await queue.getMissingQueueDepth();
    updateQueueDepth(missingQueueDepth, 'missing');

    // Change rate from queue
    if (queueStats.totalDiscovered > 0) {
      const changeRate = (queueStats.processedCount / queueStats.totalDiscovered) * 100;
      updateChangeRate(changeRate);
    }

    // Database metrics (if available)
    if (process.env.SCRAPER_DB_HOST) {
      try {
        const dbStats = await db.getStats();
        // Could add more database-specific metrics here
      } catch (err) {
        // Database not available, skip
      }
    }
  } catch (error) {
    logger.error('Failed to update metrics:', error);
  }
}

/**
 * Start metrics server
 */
export async function startMetricsServer() {
  // Initialize queue
  queue = new RedisQueue('quintoandar');
  await queue.initialize();

  // Initialize database (if configured)
  if (process.env.SCRAPER_DB_HOST) {
    db = new ScraperDatabase();
    try {
      await db.initialize();
      logger.info('Database metrics enabled');
    } catch (error) {
      logger.warn('Database not available, some metrics will be unavailable');
    }
  }

  // Create HTTP server
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      const metrics = await getMetrics();
      res.end(metrics);
    } else if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    } else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  });

  // Update metrics periodically
  setInterval(updateMetrics, UPDATE_INTERVAL);

  // Initial update
  await updateMetrics();

  server.listen(PORT, () => {
    logger.info(`Metrics server listening on http://localhost:${PORT}/metrics`);
    logger.info(`Health check available at http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down metrics server...');
    server.close();
    await queue.close();
    if (db) await db.close();
    process.exit(0);
  });
}

// Start server if run directly
if (require.main === module) {
  startMetricsServer().catch((error) => {
    logger.error('Failed to start metrics server:', error);
    process.exit(1);
  });
}

/**
 * Queue Statistics and Management CLI
 *
 * Monitor and manage the Redis queue
 *
 * Usage:
 *   npm run queue:stats         # Show queue statistics
 *   npm run queue:clear         # Clear all queue data
 *   npm run queue:retry-failed  # Retry all failed listings
 */

import { RedisQueue } from './redis-queue';
import { logger } from './logger';

async function showStats() {
  const queue = new RedisQueue('quintoandar');
  await queue.initialize();

  const stats = await queue.getStats();
  const progress = await queue.getProgress();

  console.log('\n=== QUEUE STATISTICS ===\n');
  console.log(`Total Discovered:  ${stats.totalDiscovered.toLocaleString()}`);
  console.log(`Processed:         ${stats.processedCount.toLocaleString()} (${progress.toFixed(2)}%)`);
  console.log(`Remaining:         ${stats.remaining.toLocaleString()}`);
  console.log(`Failed:            ${stats.failedCount.toLocaleString()}`);
  console.log(`Queue Depth:       ${stats.queueDepth.toLocaleString()}`);

  if (stats.startedAt) {
    const startTime = new Date(stats.startedAt);
    const elapsed = Date.now() - startTime.getTime();
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    console.log(`Started At:        ${stats.startedAt}`);
    console.log(`Elapsed Time:      ${hours}h ${minutes}m`);

    if (stats.processedCount > 0) {
      const rate = stats.processedCount / (elapsed / 1000 / 60); // per minute
      console.log(`Processing Rate:   ${rate.toFixed(2)} listings/min`);

      if (stats.remaining > 0) {
        const remainingMinutes = stats.remaining / rate;
        const eta = new Date(Date.now() + remainingMinutes * 60 * 1000);
        console.log(`ETA:               ${eta.toLocaleString()} (${Math.floor(remainingMinutes)}m remaining)`);
      }
    }
  }

  console.log('\n');

  await queue.close();
}

async function clearQueue() {
  const queue = new RedisQueue('quintoandar');
  await queue.initialize();

  console.log('\n⚠️  WARNING: This will clear ALL queue data!\n');
  console.log('Are you sure? Press Ctrl+C to cancel, or wait 5 seconds to confirm...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  await queue.clear();
  console.log('✅ Queue data cleared\n');

  await queue.close();
}

async function retryFailed() {
  const queue = new RedisQueue('quintoandar');
  await queue.initialize();

  const failedIds = await queue.getFailedIds();
  console.log(`\nFound ${failedIds.length} failed listings\n`);

  if (failedIds.length === 0) {
    console.log('No failed listings to retry\n');
    await queue.close();
    return;
  }

  const retried = await queue.retryFailedListings();
  console.log(`✅ Re-queued ${retried} failed listings\n`);

  await queue.close();
}

async function showFailed() {
  const queue = new RedisQueue('quintoandar');
  await queue.initialize();

  const failedIds = await queue.getFailedIds();

  console.log(`\n=== FAILED LISTINGS (${failedIds.length}) ===\n`);

  if (failedIds.length === 0) {
    console.log('No failed listings\n');
  } else {
    failedIds.slice(0, 20).forEach(id => console.log(`  - ${id}`));
    if (failedIds.length > 20) {
      console.log(`  ... and ${failedIds.length - 20} more\n`);
    }
  }

  await queue.close();
}

// Main execution
async function main() {
  const command = process.argv[2] || 'stats';

  try {
    switch (command) {
      case 'stats':
        await showStats();
        break;
      case 'clear':
        await clearQueue();
        break;
      case 'retry-failed':
        await retryFailed();
        break;
      case 'show-failed':
        await showFailed();
        break;
      default:
        console.log(`Unknown command: ${command}`);
        console.log('Available commands: stats, clear, retry-failed, show-failed');
        process.exit(1);
    }
  } catch (error) {
    logger.error('Command failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

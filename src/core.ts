/**
 * Core Service API Client
 * Handles communication with Landomo Core Service
 */

import axios from 'axios';
import { config } from './config';
import { logger } from './logger';
import { StandardProperty } from './types';

export interface IngestionPayload {
  portal: string;
  portal_id: string;
  country: string;
  data: StandardProperty;
  raw_data: any;
  status?: 'active' | 'inactive';
}

/**
 * Send property to Core Service API
 */
export async function sendToCoreService(payload: IngestionPayload): Promise<void> {
  if (!config.apiKey) {
    logger.warn('No API key configured - skipping Core Service ingestion');
    return;
  }

  try {
    await axios.post(
      `${config.apiUrl}/properties/ingest`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    logger.debug(`Sent property ${payload.portal_id} to Core Service`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`Core Service error for ${payload.portal_id}:`, {
        status: error.response?.status,
        data: error.response?.data,
      });
    } else {
      logger.error(`Failed to send ${payload.portal_id} to Core Service:`, error);
    }
    throw error;
  }
}

/**
 * Mark property as inactive in Core Service
 */
export async function markPropertyInactive(
  portal: string,
  portalId: string,
  country: string,
  reason: string
): Promise<void> {
  if (!config.apiKey) {
    logger.warn('No API key configured - skipping inactive marking');
    return;
  }

  try {
    await axios.post(
      `${config.apiUrl}/properties/mark-inactive`,
      {
        portal,
        portal_id: portalId,
        country,
        reason,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    logger.debug(`Marked property ${portalId} as inactive`);
  } catch (error) {
    logger.error(`Failed to mark ${portalId} as inactive:`, error);
    throw error;
  }
}

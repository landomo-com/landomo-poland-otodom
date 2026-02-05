/**
 * TLS-aware HTTP client with browser fingerprint rotation
 * Matches User-Agent headers with corresponding TLS fingerprints
 */

import { Session, ClientIdentifier, initTLS, destroyTLS } from 'node-tls-client';
import { logger } from './logger';

// Browser fingerprints with matching User-Agent headers
const BROWSER_PROFILES = [
  {
    identifier: ClientIdentifier.chrome_131,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    identifier: ClientIdentifier.chrome_124,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  {
    identifier: ClientIdentifier.chrome_120,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  {
    identifier: ClientIdentifier.chrome_117,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
  },
  {
    identifier: ClientIdentifier.chrome_112,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
  },
  {
    identifier: ClientIdentifier.firefox_120,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  },
  {
    identifier: ClientIdentifier.firefox_117,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:117.0) Gecko/20100101 Firefox/117.0',
  },
  {
    identifier: ClientIdentifier.safari_16_0,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  },
  {
    identifier: ClientIdentifier.safari_15_6_1,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15',
  },
];

export class TLSClient {
  private session: Session | null = null;
  private currentProfile: typeof BROWSER_PROFILES[0];
  private initialized = false;

  constructor() {
    this.currentProfile = this.getRandomProfile();
  }

  async initialize() {
    if (!this.initialized) {
      await initTLS();
      this.initialized = true;
      logger.info('TLS client initialized');
    }
    await this.rotateProfile();
  }

  async rotateProfile() {
    // Close existing session
    if (this.session) {
      await this.session.close();
    }

    // Select new random profile
    this.currentProfile = this.getRandomProfile();

    // Create new session with matching TLS fingerprint
    this.session = new Session({
      clientIdentifier: this.currentProfile.identifier,
      timeout: 30000,
    });

    logger.info('Rotated to new browser profile', {
      identifier: this.currentProfile.identifier,
    });
  }

  private getRandomProfile() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
  }

  async get(url: string, params?: Record<string, string>): Promise<any> {
    if (!this.session) {
      await this.initialize();
    }

    // Build URL with query params
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      fullUrl = `${url}?${queryString}`;
    }

    try {
      const response = await this.session!.get(fullUrl, {
        headers: {
          'User-Agent': this.currentProfile.userAgent,
          'Accept': 'application/json',
          'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
          'Content-Type': 'application/json',
        },
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        // If JSON parsing fails, try text
        const text = await response.text();
        logger.error('Failed to parse JSON response', { url: fullUrl, text: text.substring(0, 200) });
        throw new Error(`Invalid JSON response from ${url}`);
      }

      return {
        data,
        status: response.status,
      };
    } catch (error) {
      logger.error('TLS client request failed', {
        url: fullUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async post(url: string, body: any): Promise<any> {
    if (!this.session) {
      await this.initialize();
    }

    try {
      const response = await this.session!.post(url, {
        headers: {
          'User-Agent': this.currentProfile.userAgent,
          'Accept': 'application/json',
          'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        const text = await response.text();
        logger.error('Failed to parse JSON response', { url, text: text.substring(0, 200) });
        throw new Error(`Invalid JSON response from ${url}`);
      }

      return {
        data,
        status: response.status,
      };
    } catch (error) {
      logger.error('TLS client POST request failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async destroy() {
    if (this.session) {
      await this.session.close();
    }
    if (this.initialized) {
      await destroyTLS();
      this.initialized = false;
    }
  }
}

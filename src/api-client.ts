/**
 * Base API Client for European Real Estate Portals
 * Provides reusable functionality for REST API integrations
 */

import { ScraperLogger } from './logger.js';

export interface RateLimitConfig {
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface ApiClientConfig extends RateLimitConfig {
  timeout?: number;
  baseUrl: string;
  authToken?: string;
  apiKey?: string;
  userAgent?: string;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
  timestamp: number;
}

export interface RateLimitState {
  requestCount: number;
  resetTime: number;
  remainingRequests?: number;
}

/**
 * Base API Client with rate limiting, error handling, and retry logic
 */
export class BaseApiClient {
  protected config: ApiClientConfig;
  protected logger: ScraperLogger;
  private rateLimitState: RateLimitState;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  constructor(config: ApiClientConfig, loggerName?: string) {
    this.config = {
      timeout: 30000,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      retryAttempts: 3,
      retryDelayMs: 1000,
      requestsPerSecond: 1,
      ...config,
    };
    this.logger = new ScraperLogger(loggerName || 'api-client');
    this.rateLimitState = {
      requestCount: 0,
      resetTime: Date.now(),
    };
  }

  /**
   * Make HTTP GET request with rate limiting and error handling
   */
  protected async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, params);
  }

  /**
   * Make HTTP POST request
   */
  protected async post<T = unknown>(
    path: string,
    data?: unknown,
    params?: Record<string, unknown>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, data, params);
  }

  /**
   * Make HTTP PUT request
   */
  protected async put<T = unknown>(
    path: string,
    data?: unknown,
    params?: Record<string, unknown>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, data, params);
  }

  /**
   * Make HTTP request with rate limiting and retries
   */
  protected async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: unknown,
    params?: Record<string, unknown>,
    attempt = 0,
  ): Promise<ApiResponse<T>> {
    try {
      // Apply rate limiting
      await this.checkRateLimit();

      // Build URL
      const url = this.buildUrl(path, params);
      this.logger.info(`${method} ${url}`);

      // Build headers
      const headers = this.buildHeaders();

      // Make request
      const fetchOptions: RequestInit = {
        method,
        headers,
        timeout: this.config.timeout,
      };

      if (data) {
        fetchOptions.body = typeof data === 'string' ? data : JSON.stringify(data);
      }

      const response = await fetch(url, fetchOptions);
      this.updateRateLimit(response);

      if (!response.ok) {
        // Handle rate limit response
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
          this.logger.warn(`Rate limited, retry after ${retryAfter}s`);

          if (attempt < (this.config.retryAttempts || 3)) {
            await this.delay(retryAfter * 1000);
            return this.request<T>(method, path, data, params, attempt + 1);
          }
        }

        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // Parse response
      const contentType = response.headers.get('content-type');
      let parsedData: T;

      if (contentType?.includes('application/json')) {
        parsedData = (await response.json()) as T;
      } else {
        parsedData = (await response.text()) as T;
      }

      return {
        data: parsedData,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        timestamp: Date.now(),
      };
    } catch (error) {
      if (attempt < (this.config.retryAttempts || 3)) {
        const delay = (this.config.retryDelayMs || 1000) * Math.pow(2, attempt);
        this.logger.warn(`Request failed, retrying in ${delay}ms`, { attempt });
        await this.delay(delay);
        return this.request<T>(method, path, data, params, attempt + 1);
      }

      this.logger.error(`Request failed after ${attempt} attempts`, error);
      throw error;
    }
  }

  /**
   * Build URL with base URL and optional query parameters
   */
  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(path.startsWith('http') ? path : `${this.config.baseUrl}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Build request headers with auth and user agent
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.config.userAgent || 'Mozilla/5.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    } else if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    }

    return headers;
  }

  /**
   * Check and apply rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const secondsSinceReset = (now - this.rateLimitState.resetTime) / 1000;

    // Reset counter if period has passed
    if (secondsSinceReset >= 1) {
      this.rateLimitState.requestCount = 0;
      this.rateLimitState.resetTime = now;
    }

    // Apply rate limit
    if (this.config.requestsPerSecond) {
      if (this.rateLimitState.requestCount >= this.config.requestsPerSecond) {
        const waitTime = 1000 - (now - this.rateLimitState.resetTime);
        if (waitTime > 0) {
          await this.delay(waitTime);
        }
      }
    }

    this.rateLimitState.requestCount++;
  }

  /**
   * Update rate limit state from response headers
   */
  private updateRateLimit(response: Response): void {
    const remaining = response.headers.get('x-rate-limit-remaining');
    const reset = response.headers.get('x-rate-limit-reset');

    if (remaining) {
      this.rateLimitState.remainingRequests = parseInt(remaining, 10);
    }

    if (reset) {
      this.rateLimitState.resetTime = parseInt(reset, 10) * 1000;
    }
  }

  /**
   * Delay execution
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit state
   */
  getRateLimitState(): RateLimitState {
    return { ...this.rateLimitState };
  }

  /**
   * Reset rate limit state
   */
  resetRateLimit(): void {
    this.rateLimitState = {
      requestCount: 0,
      resetTime: Date.now(),
    };
  }
}

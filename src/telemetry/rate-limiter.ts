/**
 * Rate Limiter for Telemetry
 * Implements sliding window rate limiting to prevent excessive telemetry events
 */

import { TELEMETRY_CONFIG } from './telemetry-types';
import { logger } from '../utils/logger';

export class TelemetryRateLimiter {
  private eventTimestamps: number[] = [];
  private windowMs: number;
  private maxEvents: number;
  private droppedEventsCount: number = 0;
  private lastWarningTime: number = 0;
  private readonly WARNING_INTERVAL = 60000; // Warn at most once per minute
  private readonly MAX_ARRAY_SIZE = 1000; // Prevent memory leaks by limiting array size

  constructor(
    windowMs: number = TELEMETRY_CONFIG.RATE_LIMIT_WINDOW,
    maxEvents: number = TELEMETRY_CONFIG.RATE_LIMIT_MAX_EVENTS
  ) {
    this.windowMs = windowMs;
    this.maxEvents = maxEvents;
  }

  /**
   * Check if an event can be tracked based on rate limits
   * Returns true if event can proceed, false if rate limited
   */
  allow(): boolean {
    const now = Date.now();

    // Clean up old timestamps outside the window
    this.cleanupOldTimestamps(now);

    // Check if we've hit the rate limit
    if (this.eventTimestamps.length >= this.maxEvents) {
      this.handleRateLimitHit(now);
      return false;
    }

    // Add current timestamp and allow event
    this.eventTimestamps.push(now);
    return true;
  }

  /**
   * Check if rate limiting would occur without actually blocking
   * Useful for pre-flight checks
   */
  wouldAllow(): boolean {
    const now = Date.now();
    this.cleanupOldTimestamps(now);
    return this.eventTimestamps.length < this.maxEvents;
  }

  /**
   * Get current usage statistics
   */
  getStats() {
    const now = Date.now();
    this.cleanupOldTimestamps(now);

    return {
      currentEvents: this.eventTimestamps.length,
      maxEvents: this.maxEvents,
      windowMs: this.windowMs,
      droppedEvents: this.droppedEventsCount,
      utilizationPercent: Math.round((this.eventTimestamps.length / this.maxEvents) * 100),
      remainingCapacity: Math.max(0, this.maxEvents - this.eventTimestamps.length),
      arraySize: this.eventTimestamps.length,
      maxArraySize: this.MAX_ARRAY_SIZE,
      memoryUsagePercent: Math.round((this.eventTimestamps.length / this.MAX_ARRAY_SIZE) * 100)
    };
  }

  /**
   * Reset the rate limiter (useful for testing)
   */
  reset(): void {
    this.eventTimestamps = [];
    this.droppedEventsCount = 0;
    this.lastWarningTime = 0;
  }

  /**
   * Clean up timestamps outside the current window and enforce array size limit
   */
  private cleanupOldTimestamps(now: number): void {
    const windowStart = now - this.windowMs;

    // Remove all timestamps before the window start
    let i = 0;
    while (i < this.eventTimestamps.length && this.eventTimestamps[i] < windowStart) {
      i++;
    }

    if (i > 0) {
      this.eventTimestamps.splice(0, i);
    }

    // Enforce maximum array size to prevent memory leaks
    if (this.eventTimestamps.length > this.MAX_ARRAY_SIZE) {
      const excess = this.eventTimestamps.length - this.MAX_ARRAY_SIZE;
      this.eventTimestamps.splice(0, excess);

      if (now - this.lastWarningTime > this.WARNING_INTERVAL) {
        logger.debug(
          `Telemetry rate limiter array trimmed: removed ${excess} oldest timestamps to prevent memory leak. ` +
          `Array size: ${this.eventTimestamps.length}/${this.MAX_ARRAY_SIZE}`
        );
        this.lastWarningTime = now;
      }
    }
  }

  /**
   * Handle rate limit hit
   */
  private handleRateLimitHit(now: number): void {
    this.droppedEventsCount++;

    // Log warning if enough time has passed since last warning
    if (now - this.lastWarningTime > this.WARNING_INTERVAL) {
      const stats = this.getStats();
      logger.debug(
        `Telemetry rate limit reached: ${stats.currentEvents}/${stats.maxEvents} events in ${stats.windowMs}ms window. ` +
        `Total dropped: ${stats.droppedEvents}`
      );
      this.lastWarningTime = now;
    }
  }

  /**
   * Get the number of dropped events
   */
  getDroppedEventsCount(): number {
    return this.droppedEventsCount;
  }

  /**
   * Estimate time until capacity is available (in ms)
   * Returns 0 if capacity is available now
   */
  getTimeUntilCapacity(): number {
    const now = Date.now();
    this.cleanupOldTimestamps(now);

    if (this.eventTimestamps.length < this.maxEvents) {
      return 0;
    }

    // Find the oldest timestamp that would need to expire
    const oldestRelevant = this.eventTimestamps[this.eventTimestamps.length - this.maxEvents];
    const timeUntilExpiry = Math.max(0, (oldestRelevant + this.windowMs) - now);

    return timeUntilExpiry;
  }

  /**
   * Update rate limit configuration dynamically
   */
  updateLimits(windowMs?: number, maxEvents?: number): void {
    if (windowMs !== undefined && windowMs > 0) {
      this.windowMs = windowMs;
    }
    if (maxEvents !== undefined && maxEvents > 0) {
      this.maxEvents = maxEvents;
    }

    logger.debug(`Rate limiter updated: ${this.maxEvents} events per ${this.windowMs}ms`);
  }
}
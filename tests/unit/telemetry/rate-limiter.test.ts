import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelemetryRateLimiter } from '../../../src/telemetry/rate-limiter';

describe('TelemetryRateLimiter', () => {
  let rateLimiter: TelemetryRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter = new TelemetryRateLimiter(1000, 5); // 5 events per second
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('allow()', () => {
    it('should allow events within the limit', () => {
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.allow()).toBe(true);
      }
    });

    it('should block events exceeding the limit', () => {
      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.allow()).toBe(true);
      }

      // Next event should be blocked
      expect(rateLimiter.allow()).toBe(false);
    });

    it('should allow events again after the window expires', () => {
      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.allow();
      }

      // Should be blocked
      expect(rateLimiter.allow()).toBe(false);

      // Advance time to expire the window
      vi.advanceTimersByTime(1100);

      // Should allow events again
      expect(rateLimiter.allow()).toBe(true);
    });
  });

  describe('wouldAllow()', () => {
    it('should check without modifying state', () => {
      // Fill up 4 of 5 allowed
      for (let i = 0; i < 4; i++) {
        rateLimiter.allow();
      }

      // Check multiple times - should always return true
      expect(rateLimiter.wouldAllow()).toBe(true);
      expect(rateLimiter.wouldAllow()).toBe(true);

      // Actually use the last slot
      expect(rateLimiter.allow()).toBe(true);

      // Now should return false
      expect(rateLimiter.wouldAllow()).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('should return accurate statistics', () => {
      // Use 3 of 5 allowed
      for (let i = 0; i < 3; i++) {
        rateLimiter.allow();
      }

      const stats = rateLimiter.getStats();
      expect(stats.currentEvents).toBe(3);
      expect(stats.maxEvents).toBe(5);
      expect(stats.windowMs).toBe(1000);
      expect(stats.utilizationPercent).toBe(60);
      expect(stats.remainingCapacity).toBe(2);
    });

    it('should track dropped events', () => {
      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.allow();
      }

      // Try to add more - should be dropped
      rateLimiter.allow();
      rateLimiter.allow();

      const stats = rateLimiter.getStats();
      expect(stats.droppedEvents).toBe(2);
    });
  });

  describe('getTimeUntilCapacity()', () => {
    it('should return 0 when capacity is available', () => {
      expect(rateLimiter.getTimeUntilCapacity()).toBe(0);
    });

    it('should return time until capacity when at limit', () => {
      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.allow();
      }

      const timeUntilCapacity = rateLimiter.getTimeUntilCapacity();
      expect(timeUntilCapacity).toBeGreaterThan(0);
      expect(timeUntilCapacity).toBeLessThanOrEqual(1000);
    });
  });

  describe('updateLimits()', () => {
    it('should dynamically update rate limits', () => {
      // Update to allow 10 events per 2 seconds
      rateLimiter.updateLimits(2000, 10);

      // Should allow 10 events
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.allow()).toBe(true);
      }

      // 11th should be blocked
      expect(rateLimiter.allow()).toBe(false);

      const stats = rateLimiter.getStats();
      expect(stats.maxEvents).toBe(10);
      expect(stats.windowMs).toBe(2000);
    });
  });

  describe('reset()', () => {
    it('should clear all state', () => {
      // Use some events and drop some
      for (let i = 0; i < 7; i++) {
        rateLimiter.allow();
      }

      // Reset
      rateLimiter.reset();

      const stats = rateLimiter.getStats();
      expect(stats.currentEvents).toBe(0);
      expect(stats.droppedEvents).toBe(0);

      // Should allow events again
      expect(rateLimiter.allow()).toBe(true);
    });
  });

  describe('sliding window behavior', () => {
    it('should correctly implement sliding window', () => {
      const timestamps: number[] = [];

      // Add events at different times
      for (let i = 0; i < 3; i++) {
        expect(rateLimiter.allow()).toBe(true);
        timestamps.push(Date.now());
        vi.advanceTimersByTime(300);
      }

      // Should still have capacity (3 events used, 2 slots remaining)
      expect(rateLimiter.allow()).toBe(true);
      expect(rateLimiter.allow()).toBe(true);

      // Should be at limit (5 events used)
      expect(rateLimiter.allow()).toBe(false);

      // Advance time for first event to expire
      vi.advanceTimersByTime(200);

      // Should have capacity again as first event is outside window
      expect(rateLimiter.allow()).toBe(true);
    });
  });
});
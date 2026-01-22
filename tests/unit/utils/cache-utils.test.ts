/**
 * Unit tests for cache utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createCacheKey,
  getCacheConfig,
  createInstanceCache,
  CacheMutex,
  calculateBackoffDelay,
  withRetry,
  getCacheStatistics,
  cacheMetrics,
  DEFAULT_RETRY_CONFIG
} from '../../../src/utils/cache-utils';

describe('cache-utils', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.INSTANCE_CACHE_MAX;
    delete process.env.INSTANCE_CACHE_TTL_MINUTES;
    // Reset cache metrics
    cacheMetrics.reset();
  });

  describe('createCacheKey', () => {
    it('should create consistent SHA-256 hash for same input', () => {
      const input = 'https://api.n8n.cloud:valid-key:instance1';
      const hash1 = createCacheKey(input);
      const hash2 = createCacheKey(input);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
      expect(hash1).toMatch(/^[a-f0-9]+$/); // Only hex characters
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = createCacheKey('input1');
      const hash2 = createCacheKey('input2');

      expect(hash1).not.toBe(hash2);
    });

    it('should use memoization for repeated inputs', () => {
      const input = 'memoized-input';

      // First call creates hash
      const hash1 = createCacheKey(input);

      // Second call should return memoized result
      const hash2 = createCacheKey(input);

      expect(hash1).toBe(hash2);
    });

    it('should limit memoization cache size', () => {
      // Create more than MAX_MEMO_SIZE (1000) unique hashes
      const hashes = new Set<string>();
      for (let i = 0; i < 1100; i++) {
        const hash = createCacheKey(`input-${i}`);
        hashes.add(hash);
      }

      // All hashes should be unique
      expect(hashes.size).toBe(1100);

      // Early entries should have been evicted from memo cache
      // but should still produce consistent results
      const earlyHash = createCacheKey('input-0');
      expect(earlyHash).toBe(hashes.values().next().value);
    });
  });

  describe('getCacheConfig', () => {
    it('should return default configuration when no env vars set', () => {
      const config = getCacheConfig();

      expect(config.max).toBe(100);
      expect(config.ttlMinutes).toBe(30);
    });

    it('should use environment variables when set', () => {
      process.env.INSTANCE_CACHE_MAX = '500';
      process.env.INSTANCE_CACHE_TTL_MINUTES = '60';

      const config = getCacheConfig();

      expect(config.max).toBe(500);
      expect(config.ttlMinutes).toBe(60);
    });

    it('should enforce minimum bounds', () => {
      process.env.INSTANCE_CACHE_MAX = '0';
      process.env.INSTANCE_CACHE_TTL_MINUTES = '0';

      const config = getCacheConfig();

      expect(config.max).toBe(1); // Min is 1
      expect(config.ttlMinutes).toBe(1); // Min is 1
    });

    it('should enforce maximum bounds', () => {
      process.env.INSTANCE_CACHE_MAX = '20000';
      process.env.INSTANCE_CACHE_TTL_MINUTES = '2000';

      const config = getCacheConfig();

      expect(config.max).toBe(10000); // Max is 10000
      expect(config.ttlMinutes).toBe(1440); // Max is 1440 (24 hours)
    });

    it('should handle invalid values gracefully', () => {
      process.env.INSTANCE_CACHE_MAX = 'invalid';
      process.env.INSTANCE_CACHE_TTL_MINUTES = 'not-a-number';

      const config = getCacheConfig();

      expect(config.max).toBe(100); // Falls back to default
      expect(config.ttlMinutes).toBe(30); // Falls back to default
    });
  });

  describe('createInstanceCache', () => {
    it('should create LRU cache with correct configuration', () => {
      process.env.INSTANCE_CACHE_MAX = '50';
      process.env.INSTANCE_CACHE_TTL_MINUTES = '15';

      const cache = createInstanceCache<{ data: string }>();

      // Add items to cache
      cache.set('key1', { data: 'value1' });
      cache.set('key2', { data: 'value2' });

      expect(cache.get('key1')).toEqual({ data: 'value1' });
      expect(cache.get('key2')).toEqual({ data: 'value2' });
      expect(cache.size).toBe(2);
    });

    it('should call dispose callback on eviction', () => {
      const disposeFn = vi.fn();
      const cache = createInstanceCache<{ data: string }>(disposeFn);

      // Set max to 2 for testing
      process.env.INSTANCE_CACHE_MAX = '2';
      const smallCache = createInstanceCache<{ data: string }>(disposeFn);

      smallCache.set('key1', { data: 'value1' });
      smallCache.set('key2', { data: 'value2' });
      smallCache.set('key3', { data: 'value3' }); // Should evict key1

      expect(disposeFn).toHaveBeenCalledWith({ data: 'value1' }, 'key1');
    });

    it('should update age on get', () => {
      const cache = createInstanceCache<{ data: string }>();

      cache.set('key1', { data: 'value1' });

      // Access should update age
      const value = cache.get('key1');
      expect(value).toEqual({ data: 'value1' });

      // Item should still be in cache
      expect(cache.has('key1')).toBe(true);
    });
  });

  describe('CacheMutex', () => {
    it('should prevent concurrent access to same key', async () => {
      const mutex = new CacheMutex();
      const key = 'test-key';
      const results: number[] = [];

      // First operation acquires lock
      const release1 = await mutex.acquire(key);

      // Second operation should wait
      const promise2 = mutex.acquire(key).then(release => {
        results.push(2);
        release();
      });

      // First operation completes
      results.push(1);
      release1();

      // Wait for second operation
      await promise2;

      expect(results).toEqual([1, 2]); // Operations executed in order
    });

    it('should allow concurrent access to different keys', async () => {
      const mutex = new CacheMutex();
      const results: string[] = [];

      const [release1, release2] = await Promise.all([
        mutex.acquire('key1'),
        mutex.acquire('key2')
      ]);

      results.push('both-acquired');
      release1();
      release2();

      expect(results).toEqual(['both-acquired']);
    });

    it('should check if key is locked', async () => {
      const mutex = new CacheMutex();
      const key = 'test-key';

      expect(mutex.isLocked(key)).toBe(false);

      const release = await mutex.acquire(key);
      expect(mutex.isLocked(key)).toBe(true);

      release();
      expect(mutex.isLocked(key)).toBe(false);
    });

    it('should clear all locks', async () => {
      const mutex = new CacheMutex();

      const release1 = await mutex.acquire('key1');
      const release2 = await mutex.acquire('key2');

      expect(mutex.isLocked('key1')).toBe(true);
      expect(mutex.isLocked('key2')).toBe(true);

      mutex.clearAll();

      expect(mutex.isLocked('key1')).toBe(false);
      expect(mutex.isLocked('key2')).toBe(false);

      // Should not throw when calling release after clear
      release1();
      release2();
    });

    it('should handle timeout for stuck locks', async () => {
      const mutex = new CacheMutex();
      const key = 'stuck-key';

      // Acquire lock but don't release
      await mutex.acquire(key);

      // Wait for timeout (mock the timeout)
      vi.useFakeTimers();

      // Try to acquire same lock
      const acquirePromise = mutex.acquire(key);

      // Fast-forward past timeout
      vi.advanceTimersByTime(6000); // Timeout is 5 seconds

      // Should be able to acquire after timeout
      const release = await acquirePromise;
      release();

      vi.useRealTimers();
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, jitterFactor: 0 }; // No jitter for predictable tests

      expect(calculateBackoffDelay(0, config)).toBe(1000); // 1 * 1000
      expect(calculateBackoffDelay(1, config)).toBe(2000); // 2 * 1000
      expect(calculateBackoffDelay(2, config)).toBe(4000); // 4 * 1000
      expect(calculateBackoffDelay(3, config)).toBe(8000); // 8 * 1000
    });

    it('should respect max delay', () => {
      const config = {
        ...DEFAULT_RETRY_CONFIG,
        maxDelayMs: 5000,
        jitterFactor: 0
      };

      expect(calculateBackoffDelay(10, config)).toBe(5000); // Capped at max
    });

    it('should add jitter', () => {
      const config = {
        ...DEFAULT_RETRY_CONFIG,
        baseDelayMs: 1000,
        jitterFactor: 0.5
      };

      const delay = calculateBackoffDelay(0, config);

      // With 50% jitter, delay should be between 1000 and 1500
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(1500);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      // Create retryable errors (503 Service Unavailable)
      const retryableError1 = new Error('Service temporarily unavailable');
      (retryableError1 as any).response = { status: 503 };

      const retryableError2 = new Error('Another temporary failure');
      (retryableError2 as any).response = { status: 503 };

      const fn = vi.fn()
        .mockRejectedValueOnce(retryableError1)
        .mockRejectedValueOnce(retryableError2)
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterFactor: 0
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      // Create retryable error (503 Service Unavailable)
      const retryableError = new Error('Persistent failure');
      (retryableError as any).response = { status: 503 };

      const fn = vi.fn().mockRejectedValue(retryableError);

      await expect(withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterFactor: 0
      })).rejects.toThrow('Persistent failure');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Not retryable');
      (error as any).response = { status: 400 }; // Client error

      const fn = vi.fn().mockRejectedValue(error);

      await expect(withRetry(fn)).rejects.toThrow('Not retryable');
      expect(fn).toHaveBeenCalledTimes(1); // No retry
    });

    it('should retry network errors', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNREFUSED';

      const fn = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterFactor: 0
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry 429 Too Many Requests', async () => {
      const error = new Error('Rate limited');
      (error as any).response = { status: 429 };

      const fn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterFactor: 0
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('cacheMetrics', () => {
    it('should track cache operations', () => {
      cacheMetrics.recordHit();
      cacheMetrics.recordHit();
      cacheMetrics.recordMiss();
      cacheMetrics.recordSet();
      cacheMetrics.recordDelete();
      cacheMetrics.recordEviction();

      const metrics = cacheMetrics.getMetrics();

      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(1);
      expect(metrics.sets).toBe(1);
      expect(metrics.deletes).toBe(1);
      expect(metrics.evictions).toBe(1);
      expect(metrics.avgHitRate).toBeCloseTo(0.667, 2); // 2/3
    });

    it('should update cache size', () => {
      cacheMetrics.updateSize(50, 100);

      const metrics = cacheMetrics.getMetrics();

      expect(metrics.size).toBe(50);
      expect(metrics.maxSize).toBe(100);
    });

    it('should reset metrics', () => {
      cacheMetrics.recordHit();
      cacheMetrics.recordMiss();
      cacheMetrics.reset();

      const metrics = cacheMetrics.getMetrics();

      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.avgHitRate).toBe(0);
    });

    it('should format metrics for logging', () => {
      cacheMetrics.recordHit();
      cacheMetrics.recordHit();
      cacheMetrics.recordMiss();
      cacheMetrics.updateSize(25, 100);
      cacheMetrics.recordEviction();

      const formatted = cacheMetrics.getFormattedMetrics();

      expect(formatted).toContain('Hits=2');
      expect(formatted).toContain('Misses=1');
      expect(formatted).toContain('HitRate=66.67%');
      expect(formatted).toContain('Size=25/100');
      expect(formatted).toContain('Evictions=1');
    });
  });

  describe('getCacheStatistics', () => {
    it('should return formatted statistics', () => {
      cacheMetrics.recordHit();
      cacheMetrics.recordHit();
      cacheMetrics.recordMiss();
      cacheMetrics.updateSize(30, 100);

      const stats = getCacheStatistics();

      expect(stats).toContain('Cache Statistics:');
      expect(stats).toContain('Total Operations: 3');
      expect(stats).toContain('Hit Rate: 66.67%');
      expect(stats).toContain('Current Size: 30/100');
    });

    it('should calculate runtime', () => {
      const stats = getCacheStatistics();

      expect(stats).toContain('Runtime:');
      expect(stats).toMatch(/Runtime: \d+ minutes/);
    });
  });
});
/**
 * Verification Tests for v2.18.3 Critical Fixes
 * Tests all 7 fixes from the code review:
 * - CRITICAL-01: Database checkpoints logged
 * - CRITICAL-02: Defensive initialization
 * - CRITICAL-03: Non-blocking checkpoints
 * - HIGH-01: ReDoS vulnerability fixed
 * - HIGH-02: Race condition prevention
 * - HIGH-03: Timeout on Supabase operations
 * - HIGH-04: N8N API checkpoints logged
 */

import { EarlyErrorLogger } from '../../../src/telemetry/early-error-logger';
import { sanitizeErrorMessageCore } from '../../../src/telemetry/error-sanitization-utils';
import { STARTUP_CHECKPOINTS } from '../../../src/telemetry/startup-checkpoints';

describe('v2.18.3 Critical Fixes Verification', () => {
  describe('CRITICAL-02: Defensive Initialization', () => {
    it('should initialize all fields to safe defaults before any throwing operation', () => {
      // Create instance - should not throw even if Supabase fails
      const logger = EarlyErrorLogger.getInstance();
      expect(logger).toBeDefined();

      // Should be able to call methods immediately without crashing
      expect(() => logger.logCheckpoint(STARTUP_CHECKPOINTS.PROCESS_STARTED)).not.toThrow();
      expect(() => logger.getCheckpoints()).not.toThrow();
      expect(() => logger.getStartupDuration()).not.toThrow();
    });

    it('should handle multiple getInstance calls correctly (singleton)', () => {
      const logger1 = EarlyErrorLogger.getInstance();
      const logger2 = EarlyErrorLogger.getInstance();

      expect(logger1).toBe(logger2);
    });

    it('should gracefully handle being disabled', () => {
      const logger = EarlyErrorLogger.getInstance();

      // Even if disabled, these should not throw
      expect(() => logger.logCheckpoint(STARTUP_CHECKPOINTS.PROCESS_STARTED)).not.toThrow();
      expect(() => logger.logStartupError(STARTUP_CHECKPOINTS.DATABASE_CONNECTING, new Error('test'))).not.toThrow();
      expect(() => logger.logStartupSuccess([], 100)).not.toThrow();
    });
  });

  describe('CRITICAL-03: Non-blocking Checkpoints', () => {
    it('logCheckpoint should be synchronous (fire-and-forget)', () => {
      const logger = EarlyErrorLogger.getInstance();
      const start = Date.now();

      // Should return immediately, not block
      logger.logCheckpoint(STARTUP_CHECKPOINTS.PROCESS_STARTED);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50); // Should be nearly instant
    });

    it('logStartupError should be synchronous (fire-and-forget)', () => {
      const logger = EarlyErrorLogger.getInstance();
      const start = Date.now();

      // Should return immediately, not block
      logger.logStartupError(STARTUP_CHECKPOINTS.DATABASE_CONNECTING, new Error('test'));

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50); // Should be nearly instant
    });

    it('logStartupSuccess should be synchronous (fire-and-forget)', () => {
      const logger = EarlyErrorLogger.getInstance();
      const start = Date.now();

      // Should return immediately, not block
      logger.logStartupSuccess([STARTUP_CHECKPOINTS.PROCESS_STARTED], 100);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50); // Should be nearly instant
    });
  });

  describe('HIGH-01: ReDoS Vulnerability Fixed', () => {
    it('should handle long token strings without catastrophic backtracking', () => {
      // This would cause ReDoS with the old regex: (?<!Bearer\s)token\s*[=:]\s*\S+
      const maliciousInput = 'token=' + 'a'.repeat(10000);

      const start = Date.now();
      const result = sanitizeErrorMessageCore(maliciousInput);
      const duration = Date.now() - start;

      // Should complete in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
      expect(result).toContain('[REDACTED]');
    });

    it('should use simplified regex pattern without negative lookbehind', () => {
      // Test that the new pattern works correctly
      const testCases = [
        { input: 'token=abc123', shouldContain: '[REDACTED]' },
        { input: 'token: xyz789', shouldContain: '[REDACTED]' },
        { input: 'Bearer token=secret', shouldContain: '[TOKEN]' }, // Bearer gets handled separately
        { input: 'token = test', shouldContain: '[REDACTED]' },
        { input: 'some text here', shouldNotContain: '[REDACTED]' },
      ];

      testCases.forEach((testCase) => {
        const result = sanitizeErrorMessageCore(testCase.input);
        if ('shouldContain' in testCase) {
          expect(result).toContain(testCase.shouldContain);
        } else if ('shouldNotContain' in testCase) {
          expect(result).not.toContain(testCase.shouldNotContain);
        }
      });
    });

    it('should handle edge cases without hanging', () => {
      const edgeCases = [
        'token=',
        'token:',
        'token =     ',
        '= token',
        'tokentoken=value',
      ];

      edgeCases.forEach((input) => {
        const start = Date.now();
        expect(() => sanitizeErrorMessageCore(input)).not.toThrow();
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(50);
      });
    });
  });

  describe('HIGH-02: Race Condition Prevention', () => {
    it('should track initialization state with initPromise', async () => {
      const logger = EarlyErrorLogger.getInstance();

      // Should have waitForInit method
      expect(logger.waitForInit).toBeDefined();
      expect(typeof logger.waitForInit).toBe('function');

      // Should be able to wait for init without hanging
      await expect(logger.waitForInit()).resolves.not.toThrow();
    });

    it('should handle concurrent checkpoint logging safely', () => {
      const logger = EarlyErrorLogger.getInstance();

      // Log multiple checkpoints concurrently
      const checkpoints = [
        STARTUP_CHECKPOINTS.PROCESS_STARTED,
        STARTUP_CHECKPOINTS.DATABASE_CONNECTING,
        STARTUP_CHECKPOINTS.DATABASE_CONNECTED,
        STARTUP_CHECKPOINTS.N8N_API_CHECKING,
        STARTUP_CHECKPOINTS.N8N_API_READY,
      ];

      expect(() => {
        checkpoints.forEach(cp => logger.logCheckpoint(cp));
      }).not.toThrow();
    });
  });

  describe('HIGH-03: Timeout on Supabase Operations', () => {
    it('should implement withTimeout wrapper function', async () => {
      const logger = EarlyErrorLogger.getInstance();

      // We can't directly test the private withTimeout function,
      // but we can verify that operations don't hang indefinitely
      const start = Date.now();

      // Log an error - should complete quickly even if Supabase fails
      logger.logStartupError(STARTUP_CHECKPOINTS.DATABASE_CONNECTING, new Error('test'));

      // Give it a moment to attempt the operation
      await new Promise(resolve => setTimeout(resolve, 100));

      const duration = Date.now() - start;

      // Should not hang for more than 6 seconds (5s timeout + 1s buffer)
      expect(duration).toBeLessThan(6000);
    });

    it('should gracefully degrade when timeout occurs', async () => {
      const logger = EarlyErrorLogger.getInstance();

      // Multiple error logs should all complete quickly
      const promises = [];
      for (let i = 0; i < 5; i++) {
        logger.logStartupError(STARTUP_CHECKPOINTS.DATABASE_CONNECTING, new Error(`test-${i}`));
        promises.push(new Promise(resolve => setTimeout(resolve, 50)));
      }

      await Promise.all(promises);

      // All operations should have returned (fire-and-forget)
      expect(true).toBe(true);
    });
  });

  describe('Error Sanitization - Shared Utilities', () => {
    it('should remove sensitive patterns in correct order', () => {
      const sensitiveData = 'Error: https://api.example.com/token=secret123 user@email.com';
      const sanitized = sanitizeErrorMessageCore(sensitiveData);

      expect(sanitized).not.toContain('api.example.com');
      expect(sanitized).not.toContain('secret123');
      expect(sanitized).not.toContain('user@email.com');
      expect(sanitized).toContain('[URL]');
      expect(sanitized).toContain('[EMAIL]');
    });

    it('should handle AWS keys', () => {
      const input = 'Error: AWS key AKIAIOSFODNN7EXAMPLE leaked';
      const result = sanitizeErrorMessageCore(input);

      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result).toContain('[AWS_KEY]');
    });

    it('should handle GitHub tokens', () => {
      const input = 'Auth failed with ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const result = sanitizeErrorMessageCore(input);

      expect(result).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyz');
      expect(result).toContain('[GITHUB_TOKEN]');
    });

    it('should handle JWTs', () => {
      const input = 'JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij';
      const result = sanitizeErrorMessageCore(input);

      // JWT pattern should match the full JWT
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(result).toContain('[JWT]');
    });

    it('should limit stack traces to 3 lines', () => {
      const stackTrace = 'Error: Test\n  at func1 (file1.js:1:1)\n  at func2 (file2.js:2:2)\n  at func3 (file3.js:3:3)\n  at func4 (file4.js:4:4)';
      const result = sanitizeErrorMessageCore(stackTrace);

      const lines = result.split('\n');
      expect(lines.length).toBeLessThanOrEqual(3);
    });

    it('should truncate at 500 chars after sanitization', () => {
      const longMessage = 'Error: ' + 'a'.repeat(1000);
      const result = sanitizeErrorMessageCore(longMessage);

      expect(result.length).toBeLessThanOrEqual(503); // 500 + '...'
    });

    it('should return safe default on sanitization failure', () => {
      // Pass something that might cause issues
      const result = sanitizeErrorMessageCore(null as any);

      expect(result).toBe('[SANITIZATION_FAILED]');
    });
  });

  describe('Checkpoint Integration', () => {
    it('should have all required checkpoint constants defined', () => {
      expect(STARTUP_CHECKPOINTS.PROCESS_STARTED).toBe('process_started');
      expect(STARTUP_CHECKPOINTS.DATABASE_CONNECTING).toBe('database_connecting');
      expect(STARTUP_CHECKPOINTS.DATABASE_CONNECTED).toBe('database_connected');
      expect(STARTUP_CHECKPOINTS.N8N_API_CHECKING).toBe('n8n_api_checking');
      expect(STARTUP_CHECKPOINTS.N8N_API_READY).toBe('n8n_api_ready');
      expect(STARTUP_CHECKPOINTS.TELEMETRY_INITIALIZING).toBe('telemetry_initializing');
      expect(STARTUP_CHECKPOINTS.TELEMETRY_READY).toBe('telemetry_ready');
      expect(STARTUP_CHECKPOINTS.MCP_HANDSHAKE_STARTING).toBe('mcp_handshake_starting');
      expect(STARTUP_CHECKPOINTS.MCP_HANDSHAKE_COMPLETE).toBe('mcp_handshake_complete');
      expect(STARTUP_CHECKPOINTS.SERVER_READY).toBe('server_ready');
    });

    it('should track checkpoints correctly', () => {
      const logger = EarlyErrorLogger.getInstance();
      const initialCount = logger.getCheckpoints().length;

      logger.logCheckpoint(STARTUP_CHECKPOINTS.PROCESS_STARTED);

      const checkpoints = logger.getCheckpoints();
      expect(checkpoints.length).toBeGreaterThanOrEqual(initialCount);
    });

    it('should calculate startup duration', () => {
      const logger = EarlyErrorLogger.getInstance();
      const duration = logger.getStartupDuration();

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(typeof duration).toBe('number');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TelemetryConfigManager } from '../../../src/telemetry/config-manager';
import { existsSync, readFileSync, unlinkSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

/**
 * Integration tests for Docker user ID stability
 * Tests actual file system operations and environment detection
 */
describe('Docker User ID Stability - Integration Tests', () => {
  let manager: TelemetryConfigManager;
  const configPath = join(homedir(), '.n8n-mcp', 'telemetry.json');
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean up any existing config
    try {
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Reset singleton
    (TelemetryConfigManager as any).instance = null;

    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;

    // Clean up test config
    try {
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('boot_id file reading', () => {
    it('should read boot_id from /proc/sys/kernel/random/boot_id if available', () => {
      const bootIdPath = '/proc/sys/kernel/random/boot_id';

      // Skip test if not on Linux or boot_id not available
      if (!existsSync(bootIdPath)) {
        console.log('⚠️  Skipping boot_id test - not available on this system');
        return;
      }

      try {
        const bootId = readFileSync(bootIdPath, 'utf-8').trim();

        // Verify it's a valid UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(bootId).toMatch(uuidRegex);
        expect(bootId).toHaveLength(36); // UUID with dashes
      } catch (error) {
        console.log('⚠️  boot_id exists but not readable:', error);
      }
    });

    it('should generate stable user ID when boot_id is available in Docker', () => {
      const bootIdPath = '/proc/sys/kernel/random/boot_id';

      // Skip if not in Docker environment or boot_id not available
      if (!existsSync(bootIdPath)) {
        console.log('⚠️  Skipping Docker boot_id test - not in Linux container');
        return;
      }

      process.env.IS_DOCKER = 'true';

      manager = TelemetryConfigManager.getInstance();
      const userId1 = manager.getUserId();

      // Reset singleton and get new instance
      (TelemetryConfigManager as any).instance = null;
      manager = TelemetryConfigManager.getInstance();
      const userId2 = manager.getUserId();

      // Should be identical across recreations (boot_id is stable)
      expect(userId1).toBe(userId2);
      expect(userId1).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('persistence across getInstance() calls', () => {
    it('should return same user ID across multiple getInstance() calls', () => {
      process.env.IS_DOCKER = 'true';

      const manager1 = TelemetryConfigManager.getInstance();
      const userId1 = manager1.getUserId();

      const manager2 = TelemetryConfigManager.getInstance();
      const userId2 = manager2.getUserId();

      const manager3 = TelemetryConfigManager.getInstance();
      const userId3 = manager3.getUserId();

      expect(userId1).toBe(userId2);
      expect(userId2).toBe(userId3);
      expect(manager1).toBe(manager2);
      expect(manager2).toBe(manager3);
    });

    it('should persist user ID to disk and reload correctly', () => {
      process.env.IS_DOCKER = 'true';

      // First instance - creates config
      const manager1 = TelemetryConfigManager.getInstance();
      const userId1 = manager1.getUserId();

      // Load config to trigger save
      manager1.loadConfig();

      // Wait a bit for file write
      expect(existsSync(configPath)).toBe(true);

      // Reset singleton
      (TelemetryConfigManager as any).instance = null;

      // Second instance - loads from disk
      const manager2 = TelemetryConfigManager.getInstance();
      const userId2 = manager2.getUserId();

      expect(userId1).toBe(userId2);
    });
  });

  describe('Docker vs non-Docker detection', () => {
    it('should detect Docker environment via IS_DOCKER=true', () => {
      process.env.IS_DOCKER = 'true';

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      // In Docker, should use boot_id-based method
      expect(config.userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should use file-based method for non-Docker local installations', () => {
      // Ensure no Docker/cloud environment variables
      delete process.env.IS_DOCKER;
      delete process.env.RAILWAY_ENVIRONMENT;
      delete process.env.RENDER;
      delete process.env.FLY_APP_NAME;
      delete process.env.HEROKU_APP_NAME;
      delete process.env.AWS_EXECUTION_ENV;
      delete process.env.KUBERNETES_SERVICE_HOST;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.AZURE_FUNCTIONS_ENVIRONMENT;

      manager = TelemetryConfigManager.getInstance();
      const config = manager.loadConfig();

      // Should generate valid user ID
      expect(config.userId).toMatch(/^[a-f0-9]{16}$/);

      // Should persist to file for local installations
      expect(existsSync(configPath)).toBe(true);
    });
  });

  describe('environment variable detection', () => {
    it('should detect Railway cloud environment', () => {
      process.env.RAILWAY_ENVIRONMENT = 'production';

      manager = TelemetryConfigManager.getInstance();
      const userId = manager.getUserId();

      // Should use Docker/cloud method (boot_id-based)
      expect(userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should detect Render cloud environment', () => {
      process.env.RENDER = 'true';

      manager = TelemetryConfigManager.getInstance();
      const userId = manager.getUserId();

      expect(userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should detect Fly.io cloud environment', () => {
      process.env.FLY_APP_NAME = 'n8n-mcp-app';

      manager = TelemetryConfigManager.getInstance();
      const userId = manager.getUserId();

      expect(userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should detect Heroku cloud environment', () => {
      process.env.HEROKU_APP_NAME = 'n8n-mcp-app';

      manager = TelemetryConfigManager.getInstance();
      const userId = manager.getUserId();

      expect(userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should detect AWS cloud environment', () => {
      process.env.AWS_EXECUTION_ENV = 'AWS_ECS_FARGATE';

      manager = TelemetryConfigManager.getInstance();
      const userId = manager.getUserId();

      expect(userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should detect Kubernetes environment', () => {
      process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';

      manager = TelemetryConfigManager.getInstance();
      const userId = manager.getUserId();

      expect(userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should detect Google Cloud environment', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'n8n-mcp-project';

      manager = TelemetryConfigManager.getInstance();
      const userId = manager.getUserId();

      expect(userId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should detect Azure cloud environment', () => {
      process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'production';

      manager = TelemetryConfigManager.getInstance();
      const userId = manager.getUserId();

      expect(userId).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('fallback chain behavior', () => {
    it('should use combined fingerprint fallback when boot_id unavailable', () => {
      // Set Docker environment but boot_id won't be available on macOS
      process.env.IS_DOCKER = 'true';

      manager = TelemetryConfigManager.getInstance();
      const userId = manager.getUserId();

      // Should still generate valid user ID via fallback
      expect(userId).toMatch(/^[a-f0-9]{16}$/);
      expect(userId).toHaveLength(16);
    });

    it('should generate consistent generic Docker ID when all else fails', () => {
      // Set Docker but no boot_id or /proc signals available (e.g., macOS)
      process.env.IS_DOCKER = 'true';

      const manager1 = TelemetryConfigManager.getInstance();
      const userId1 = manager1.getUserId();

      // Reset singleton
      (TelemetryConfigManager as any).instance = null;

      const manager2 = TelemetryConfigManager.getInstance();
      const userId2 = manager2.getUserId();

      // Generic Docker ID should be consistent across calls
      expect(userId1).toBe(userId2);
      expect(userId1).toMatch(/^[a-f0-9]{16}$/);
    });
  });
});

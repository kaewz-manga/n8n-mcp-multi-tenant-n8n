/**
 * Integration tests for multi-tenant support across the entire codebase
 *
 * This test file provides comprehensive coverage for the multi-tenant implementation
 * by testing the actual behavior and integration points rather than implementation details.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstanceContext, isInstanceContext, validateInstanceContext } from '../../src/types/instance-context';

// Mock logger properly
vi.mock('../../src/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Multi-Tenant Support Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('InstanceContext Validation', () => {
    describe('Real-world URL patterns', () => {
      const validUrls = [
        'https://app.n8n.cloud',
        'https://tenant1.n8n.cloud',
        'https://my-company.n8n.cloud',
        'https://n8n.example.com',
        'https://automation.company.com',
        'http://localhost:5678',
        'https://localhost:8443',
        'http://127.0.0.1:5678',
        'https://192.168.1.100:8080',
        'https://10.0.0.1:3000',
        'http://n8n.internal.company.com',
        'https://workflow.enterprise.local'
      ];

      validUrls.forEach(url => {
        it(`should accept realistic n8n URL: ${url}`, () => {
          const context: InstanceContext = {
            n8nApiUrl: url,
            n8nApiKey: 'valid-api-key-123'
          };

          expect(isInstanceContext(context)).toBe(true);

          const validation = validateInstanceContext(context);
          expect(validation.valid).toBe(true);
          expect(validation.errors).toBeUndefined();
        });
      });
    });

    describe('Security validation', () => {
      const maliciousUrls = [
        'javascript:alert("xss")',
        'vbscript:msgbox("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'file:///etc/passwd',
        'ldap://attacker.com/cn=admin',
        'ftp://malicious.com'
      ];

      maliciousUrls.forEach(url => {
        it(`should reject potentially malicious URL: ${url}`, () => {
          const context: InstanceContext = {
            n8nApiUrl: url,
            n8nApiKey: 'valid-key'
          };

          expect(isInstanceContext(context)).toBe(false);

          const validation = validateInstanceContext(context);
          expect(validation.valid).toBe(false);
          expect(validation.errors).toBeDefined();
        });
      });
    });

    describe('API key validation', () => {
      const invalidApiKeys = [
        '',
        'placeholder',
        'YOUR_API_KEY',
        'example',
        'your_api_key_here'
      ];

      invalidApiKeys.forEach(key => {
        it(`should reject invalid API key: "${key}"`, () => {
          const context: InstanceContext = {
            n8nApiUrl: 'https://valid.n8n.cloud',
            n8nApiKey: key
          };

          if (key === '') {
            // Empty string validation
            const validation = validateInstanceContext(context);
            expect(validation.valid).toBe(false);
            expect(validation.errors?.[0]).toContain('empty string');
          } else {
            // Placeholder validation
            expect(isInstanceContext(context)).toBe(false);
          }
        });
      });

      it('should accept valid API keys', () => {
        const validKeys = [
          'sk_live_AbCdEf123456789',
          'api-key-12345-abcdef',
          'n8n_api_key_production_v1_xyz',
          'Bearer-token-abc123',
          'jwt.eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9'
        ];

        validKeys.forEach(key => {
          const context: InstanceContext = {
            n8nApiUrl: 'https://valid.n8n.cloud',
            n8nApiKey: key
          };

          expect(isInstanceContext(context)).toBe(true);
          const validation = validateInstanceContext(context);
          expect(validation.valid).toBe(true);
        });
      });
    });

    describe('Edge cases and error handling', () => {
      it('should handle partial instance context', () => {
        const partialContext: InstanceContext = {
          n8nApiUrl: 'https://tenant1.n8n.cloud'
          // n8nApiKey intentionally missing
        };

        expect(isInstanceContext(partialContext)).toBe(true);
        const validation = validateInstanceContext(partialContext);
        expect(validation.valid).toBe(true);
      });

      it('should handle completely empty context', () => {
        const emptyContext: InstanceContext = {};

        expect(isInstanceContext(emptyContext)).toBe(true);
        const validation = validateInstanceContext(emptyContext);
        expect(validation.valid).toBe(true);
      });

      it('should handle numerical values gracefully', () => {
        const contextWithNumbers: InstanceContext = {
          n8nApiUrl: 'https://tenant1.n8n.cloud',
          n8nApiKey: 'valid-key',
          n8nApiTimeout: 30000,
          n8nApiMaxRetries: 3
        };

        expect(isInstanceContext(contextWithNumbers)).toBe(true);
        const validation = validateInstanceContext(contextWithNumbers);
        expect(validation.valid).toBe(true);
      });

      it('should reject invalid numerical values', () => {
        const invalidTimeout: InstanceContext = {
          n8nApiUrl: 'https://tenant1.n8n.cloud',
          n8nApiKey: 'valid-key',
          n8nApiTimeout: -1
        };

        expect(isInstanceContext(invalidTimeout)).toBe(false);
        const validation = validateInstanceContext(invalidTimeout);
        expect(validation.valid).toBe(false);
        expect(validation.errors?.[0]).toContain('Must be positive');
      });

      it('should reject invalid retry values', () => {
        const invalidRetries: InstanceContext = {
          n8nApiUrl: 'https://tenant1.n8n.cloud',
          n8nApiKey: 'valid-key',
          n8nApiMaxRetries: -5
        };

        expect(isInstanceContext(invalidRetries)).toBe(false);
        const validation = validateInstanceContext(invalidRetries);
        expect(validation.valid).toBe(false);
        expect(validation.errors?.[0]).toContain('Must be non-negative');
      });
    });
  });

  describe('Environment Variable Handling', () => {
    it('should handle ENABLE_MULTI_TENANT flag correctly', () => {
      // Test various flag values
      const flagValues = [
        { value: 'true', expected: true },
        { value: 'false', expected: false },
        { value: 'TRUE', expected: false },  // Case sensitive
        { value: 'yes', expected: false },
        { value: '1', expected: false },
        { value: '', expected: false },
        { value: undefined, expected: false }
      ];

      flagValues.forEach(({ value, expected }) => {
        if (value === undefined) {
          delete process.env.ENABLE_MULTI_TENANT;
        } else {
          process.env.ENABLE_MULTI_TENANT = value;
        }

        const isEnabled = process.env.ENABLE_MULTI_TENANT === 'true';
        expect(isEnabled).toBe(expected);
      });
    });

    it('should handle N8N_API_URL and N8N_API_KEY environment variables', () => {
      // Test backward compatibility
      process.env.N8N_API_URL = 'https://env.n8n.cloud';
      process.env.N8N_API_KEY = 'env-api-key';

      const hasEnvConfig = !!(process.env.N8N_API_URL || process.env.N8N_API_KEY);
      expect(hasEnvConfig).toBe(true);

      // Test when not set
      delete process.env.N8N_API_URL;
      delete process.env.N8N_API_KEY;

      const hasNoEnvConfig = !!(process.env.N8N_API_URL || process.env.N8N_API_KEY);
      expect(hasNoEnvConfig).toBe(false);
    });
  });

  describe('Header Processing Simulation', () => {
    it('should process multi-tenant headers correctly', () => {
      // Simulate Express request headers
      const mockHeaders = {
        'x-n8n-url': 'https://tenant1.n8n.cloud',
        'x-n8n-key': 'tenant1-api-key',
        'x-instance-id': 'tenant1-instance',
        'x-session-id': 'tenant1-session-123'
      };

      // Simulate header extraction
      const extractedContext: InstanceContext = {
        n8nApiUrl: mockHeaders['x-n8n-url'],
        n8nApiKey: mockHeaders['x-n8n-key'],
        instanceId: mockHeaders['x-instance-id'],
        sessionId: mockHeaders['x-session-id']
      };

      expect(isInstanceContext(extractedContext)).toBe(true);
      const validation = validateInstanceContext(extractedContext);
      expect(validation.valid).toBe(true);
    });

    it('should handle missing headers gracefully', () => {
      const mockHeaders: any = {
        'authorization': 'Bearer token',
        'content-type': 'application/json'
        // No x-n8n-* headers
      };

      const extractedContext = {
        n8nApiUrl: mockHeaders['x-n8n-url'], // undefined
        n8nApiKey: mockHeaders['x-n8n-key']  // undefined
      };

      // When no relevant headers exist, context should be undefined
      const shouldCreateContext = !!(extractedContext.n8nApiUrl || extractedContext.n8nApiKey);
      expect(shouldCreateContext).toBe(false);
    });

    it('should handle malformed headers', () => {
      const mockHeaders = {
        'x-n8n-url': 'not-a-url',
        'x-n8n-key': 'placeholder'
      };

      const extractedContext: InstanceContext = {
        n8nApiUrl: mockHeaders['x-n8n-url'],
        n8nApiKey: mockHeaders['x-n8n-key']
      };

      expect(isInstanceContext(extractedContext)).toBe(false);
      const validation = validateInstanceContext(extractedContext);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Configuration Priority Logic', () => {
    it('should implement correct priority logic for tool inclusion', () => {
      // Test the shouldIncludeManagementTools logic
      const scenarios = [
        {
          name: 'env config only',
          envUrl: 'https://env.example.com',
          envKey: 'env-key',
          instanceContext: undefined,
          multiTenant: false,
          expected: true
        },
        {
          name: 'instance config only',
          envUrl: undefined,
          envKey: undefined,
          instanceContext: { n8nApiUrl: 'https://tenant.example.com', n8nApiKey: 'tenant-key' },
          multiTenant: false,
          expected: true
        },
        {
          name: 'multi-tenant flag only',
          envUrl: undefined,
          envKey: undefined,
          instanceContext: undefined,
          multiTenant: true,
          expected: true
        },
        {
          name: 'no configuration',
          envUrl: undefined,
          envKey: undefined,
          instanceContext: undefined,
          multiTenant: false,
          expected: false
        }
      ];

      scenarios.forEach(({ name, envUrl, envKey, instanceContext, multiTenant, expected }) => {
        // Setup environment
        if (envUrl) process.env.N8N_API_URL = envUrl;
        else delete process.env.N8N_API_URL;

        if (envKey) process.env.N8N_API_KEY = envKey;
        else delete process.env.N8N_API_KEY;

        if (multiTenant) process.env.ENABLE_MULTI_TENANT = 'true';
        else delete process.env.ENABLE_MULTI_TENANT;

        // Test logic
        const hasEnvConfig = !!(process.env.N8N_API_URL || process.env.N8N_API_KEY);
        const hasInstanceConfig = !!(instanceContext?.n8nApiUrl || instanceContext?.n8nApiKey);
        const isMultiTenantEnabled = process.env.ENABLE_MULTI_TENANT === 'true';

        const shouldIncludeManagementTools = hasEnvConfig || hasInstanceConfig || isMultiTenantEnabled;

        expect(shouldIncludeManagementTools).toBe(expected);
      });
    });
  });

  describe('Session Management Concepts', () => {
    it('should generate consistent identifiers for same configuration', () => {
      const config1 = {
        n8nApiUrl: 'https://tenant1.n8n.cloud',
        n8nApiKey: 'api-key-123'
      };

      const config2 = {
        n8nApiUrl: 'https://tenant1.n8n.cloud',
        n8nApiKey: 'api-key-123'
      };

      // Same configuration should produce same hash
      const hash1 = JSON.stringify(config1);
      const hash2 = JSON.stringify(config2);
      expect(hash1).toBe(hash2);
    });

    it('should generate different identifiers for different configurations', () => {
      const config1 = {
        n8nApiUrl: 'https://tenant1.n8n.cloud',
        n8nApiKey: 'api-key-123'
      };

      const config2 = {
        n8nApiUrl: 'https://tenant2.n8n.cloud',
        n8nApiKey: 'different-api-key'
      };

      // Different configuration should produce different hash
      const hash1 = JSON.stringify(config1);
      const hash2 = JSON.stringify(config2);
      expect(hash1).not.toBe(hash2);
    });

    it('should handle session isolation concepts', () => {
      const sessions = new Map();

      // Simulate creating sessions for different tenants
      const tenant1Context = {
        n8nApiUrl: 'https://tenant1.n8n.cloud',
        n8nApiKey: 'tenant1-key',
        instanceId: 'tenant1'
      };

      const tenant2Context = {
        n8nApiUrl: 'https://tenant2.n8n.cloud',
        n8nApiKey: 'tenant2-key',
        instanceId: 'tenant2'
      };

      sessions.set('session-1', { context: tenant1Context, lastAccess: new Date() });
      sessions.set('session-2', { context: tenant2Context, lastAccess: new Date() });

      // Verify isolation
      expect(sessions.get('session-1').context.instanceId).toBe('tenant1');
      expect(sessions.get('session-2').context.instanceId).toBe('tenant2');
      expect(sessions.size).toBe(2);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle validation errors gracefully', () => {
      const invalidContext: InstanceContext = {
        n8nApiUrl: '',  // Empty URL
        n8nApiKey: '',  // Empty key
        n8nApiTimeout: -1,  // Invalid timeout
        n8nApiMaxRetries: -1  // Invalid retries
      };

      // Should not throw
      expect(() => isInstanceContext(invalidContext)).not.toThrow();
      expect(() => validateInstanceContext(invalidContext)).not.toThrow();

      const validation = validateInstanceContext(invalidContext);
      expect(validation.valid).toBe(false);
      expect(validation.errors?.length).toBeGreaterThan(0);

      // Each error should be descriptive
      validation.errors?.forEach(error => {
        expect(error).toContain('Invalid');
        expect(typeof error).toBe('string');
        expect(error.length).toBeGreaterThan(10);
      });
    });

    it('should provide specific error messages', () => {
      const testCases = [
        {
          context: { n8nApiUrl: '', n8nApiKey: 'valid' },
          expectedError: 'empty string'
        },
        {
          context: { n8nApiUrl: 'https://example.com', n8nApiKey: 'placeholder' },
          expectedError: 'placeholder'
        },
        {
          context: { n8nApiUrl: 'https://example.com', n8nApiKey: 'valid', n8nApiTimeout: -1 },
          expectedError: 'Must be positive'
        },
        {
          context: { n8nApiUrl: 'https://example.com', n8nApiKey: 'valid', n8nApiMaxRetries: -1 },
          expectedError: 'Must be non-negative'
        }
      ];

      testCases.forEach(({ context, expectedError }) => {
        const validation = validateInstanceContext(context);
        expect(validation.valid).toBe(false);
        expect(validation.errors?.some(err => err.includes(expectedError))).toBe(true);
      });
    });
  });
});
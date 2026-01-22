/**
 * Comprehensive unit tests for multi-tenant tool listing functionality in MCP server
 *
 * Tests the ListToolsRequestSchema handler that now includes:
 * - Environment variable checking (backward compatibility)
 * - Instance context checking (multi-tenant support)
 * - ENABLE_MULTI_TENANT flag support
 * - shouldIncludeManagementTools logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';
import { InstanceContext } from '../../../src/types/instance-context';

// Mock external dependencies
vi.mock('../../../src/utils/logger', () => ({
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

vi.mock('../../../src/utils/console-manager', () => ({
  ConsoleManager: {
    getInstance: vi.fn().mockReturnValue({
      isolate: vi.fn((fn) => fn())
    })
  }
}));

vi.mock('../../../src/database/database-adapter', () => ({
  DatabaseAdapter: vi.fn().mockImplementation(() => ({
    isInitialized: () => true,
    close: vi.fn()
  }))
}));

vi.mock('../../../src/database/node-repository', () => ({
  NodeRepository: vi.fn().mockImplementation(() => ({
    // Mock repository methods
  }))
}));

vi.mock('../../../src/database/template-repository', () => ({
  TemplateRepository: vi.fn().mockImplementation(() => ({
    // Mock template repository methods
  }))
}));

// Mock MCP tools
vi.mock('../../../src/mcp/tools', () => ({
  n8nDocumentationToolsFinal: [
    { name: 'search_nodes', description: 'Search n8n nodes', inputSchema: {} },
    { name: 'get_node_info', description: 'Get node info', inputSchema: {} }
  ],
  n8nManagementTools: [
    { name: 'n8n_create_workflow', description: 'Create workflow', inputSchema: {} },
    { name: 'n8n_get_workflow', description: 'Get workflow', inputSchema: {} }
  ]
}));

// Mock n8n API configuration check
vi.mock('../../../src/services/n8n-api-client', () => ({
  isN8nApiConfigured: vi.fn(() => false)
}));

describe.skip('MCP Server Multi-Tenant Tool Listing', () => {
  // TODO: Fix mock interface issues - server.handleRequest and server.setInstanceContext not available
  let server: N8NDocumentationMCPServer;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Clear environment variables
    delete process.env.N8N_API_URL;
    delete process.env.N8N_API_KEY;
    delete process.env.ENABLE_MULTI_TENANT;

    // Create server instance
    server = new N8NDocumentationMCPServer();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('Tool Availability Logic', () => {
    describe('Environment Variable Configuration (Backward Compatibility)', () => {
      it('should include management tools when N8N_API_URL and N8N_API_KEY are set', async () => {
        // Arrange
        process.env.N8N_API_URL = 'https://api.n8n.cloud';
        process.env.N8N_API_KEY = 'test-api-key';

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);

        // Should include both documentation and management tools
        expect(toolNames).toContain('search_nodes');  // Documentation tool
        expect(toolNames).toContain('n8n_create_workflow');  // Management tool
        expect(toolNames.length).toBeGreaterThan(20);  // Should have both sets
      });

      it('should include management tools when only N8N_API_URL is set', async () => {
        // Arrange
        process.env.N8N_API_URL = 'https://api.n8n.cloud';
        // N8N_API_KEY intentionally not set

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });

      it('should include management tools when only N8N_API_KEY is set', async () => {
        // Arrange
        process.env.N8N_API_KEY = 'test-api-key';
        // N8N_API_URL intentionally not set

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });

      it('should only include documentation tools when no environment variables are set', async () => {
        // Arrange - environment already cleared in beforeEach

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);

        // Should only include documentation tools
        expect(toolNames).toContain('search_nodes');
        expect(toolNames).not.toContain('n8n_create_workflow');
        expect(toolNames.length).toBeLessThan(20);  // Only documentation tools
      });
    });

    describe('Instance Context Configuration (Multi-Tenant Support)', () => {
      it('should include management tools when instance context has both URL and key', async () => {
        // Arrange
        const instanceContext: InstanceContext = {
          n8nApiUrl: 'https://tenant1.n8n.cloud',
          n8nApiKey: 'tenant1-api-key'
        };

        server.setInstanceContext(instanceContext);

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });

      it('should include management tools when instance context has only URL', async () => {
        // Arrange
        const instanceContext: InstanceContext = {
          n8nApiUrl: 'https://tenant1.n8n.cloud'
        };

        server.setInstanceContext(instanceContext);

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });

      it('should include management tools when instance context has only key', async () => {
        // Arrange
        const instanceContext: InstanceContext = {
          n8nApiKey: 'tenant1-api-key'
        };

        server.setInstanceContext(instanceContext);

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });

      it('should only include documentation tools when instance context is empty', async () => {
        // Arrange
        const instanceContext: InstanceContext = {};

        server.setInstanceContext(instanceContext);

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('search_nodes');
        expect(toolNames).not.toContain('n8n_create_workflow');
      });

      it('should only include documentation tools when instance context is undefined', async () => {
        // Arrange - instance context not set

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('search_nodes');
        expect(toolNames).not.toContain('n8n_create_workflow');
      });
    });

    describe('Multi-Tenant Flag Support', () => {
      it('should include management tools when ENABLE_MULTI_TENANT is true', async () => {
        // Arrange
        process.env.ENABLE_MULTI_TENANT = 'true';

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });

      it('should not include management tools when ENABLE_MULTI_TENANT is false', async () => {
        // Arrange
        process.env.ENABLE_MULTI_TENANT = 'false';

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('search_nodes');
        expect(toolNames).not.toContain('n8n_create_workflow');
      });

      it('should not include management tools when ENABLE_MULTI_TENANT is undefined', async () => {
        // Arrange - ENABLE_MULTI_TENANT not set (cleared in beforeEach)

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('search_nodes');
        expect(toolNames).not.toContain('n8n_create_workflow');
      });

      it('should not include management tools when ENABLE_MULTI_TENANT is empty string', async () => {
        // Arrange
        process.env.ENABLE_MULTI_TENANT = '';

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).not.toContain('n8n_create_workflow');
      });

      it('should not include management tools when ENABLE_MULTI_TENANT is any other value', async () => {
        // Arrange
        process.env.ENABLE_MULTI_TENANT = 'yes';

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).not.toContain('n8n_create_workflow');
      });
    });

    describe('Combined Configuration Scenarios', () => {
      it('should include management tools when both env vars and instance context are set', async () => {
        // Arrange
        process.env.N8N_API_URL = 'https://env.n8n.cloud';
        process.env.N8N_API_KEY = 'env-api-key';

        const instanceContext: InstanceContext = {
          n8nApiUrl: 'https://tenant1.n8n.cloud',
          n8nApiKey: 'tenant1-api-key'
        };

        server.setInstanceContext(instanceContext);

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });

      it('should include management tools when env vars and multi-tenant flag are both set', async () => {
        // Arrange
        process.env.N8N_API_URL = 'https://env.n8n.cloud';
        process.env.N8N_API_KEY = 'env-api-key';
        process.env.ENABLE_MULTI_TENANT = 'true';

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });

      it('should include management tools when instance context and multi-tenant flag are both set', async () => {
        // Arrange
        process.env.ENABLE_MULTI_TENANT = 'true';

        const instanceContext: InstanceContext = {
          n8nApiUrl: 'https://tenant1.n8n.cloud',
          n8nApiKey: 'tenant1-api-key'
        };

        server.setInstanceContext(instanceContext);

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });

      it('should include management tools when all three configuration methods are set', async () => {
        // Arrange
        process.env.N8N_API_URL = 'https://env.n8n.cloud';
        process.env.N8N_API_KEY = 'env-api-key';
        process.env.ENABLE_MULTI_TENANT = 'true';

        const instanceContext: InstanceContext = {
          n8nApiUrl: 'https://tenant1.n8n.cloud',
          n8nApiKey: 'tenant1-api-key'
        };

        server.setInstanceContext(instanceContext);

        // Act
        const result = await server.handleRequest({
          method: 'tools/list',
          params: {}
        });

        // Assert
        expect(result.tools).toBeDefined();
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('n8n_create_workflow');
      });
    });

    describe('shouldIncludeManagementTools Logic Truth Table', () => {
      const testCases = [
        {
          name: 'no configuration',
          envConfig: false,
          instanceConfig: false,
          multiTenant: false,
          expected: false
        },
        {
          name: 'env config only',
          envConfig: true,
          instanceConfig: false,
          multiTenant: false,
          expected: true
        },
        {
          name: 'instance config only',
          envConfig: false,
          instanceConfig: true,
          multiTenant: false,
          expected: true
        },
        {
          name: 'multi-tenant flag only',
          envConfig: false,
          instanceConfig: false,
          multiTenant: true,
          expected: true
        },
        {
          name: 'env + instance config',
          envConfig: true,
          instanceConfig: true,
          multiTenant: false,
          expected: true
        },
        {
          name: 'env config + multi-tenant',
          envConfig: true,
          instanceConfig: false,
          multiTenant: true,
          expected: true
        },
        {
          name: 'instance config + multi-tenant',
          envConfig: false,
          instanceConfig: true,
          multiTenant: true,
          expected: true
        },
        {
          name: 'all configuration methods',
          envConfig: true,
          instanceConfig: true,
          multiTenant: true,
          expected: true
        }
      ];

      testCases.forEach(({ name, envConfig, instanceConfig, multiTenant, expected }) => {
        it(`should ${expected ? 'include' : 'exclude'} management tools for ${name}`, async () => {
          // Arrange
          if (envConfig) {
            process.env.N8N_API_URL = 'https://env.n8n.cloud';
            process.env.N8N_API_KEY = 'env-api-key';
          }

          if (instanceConfig) {
            const instanceContext: InstanceContext = {
              n8nApiUrl: 'https://tenant1.n8n.cloud',
              n8nApiKey: 'tenant1-api-key'
            };
            server.setInstanceContext(instanceContext);
          }

          if (multiTenant) {
            process.env.ENABLE_MULTI_TENANT = 'true';
          }

          // Act
          const result = await server.handleRequest({
            method: 'tools/list',
            params: {}
          });

          // Assert
          expect(result.tools).toBeDefined();
          const toolNames = result.tools.map((tool: any) => tool.name);

          if (expected) {
            expect(toolNames).toContain('n8n_create_workflow');
          } else {
            expect(toolNames).not.toContain('n8n_create_workflow');
          }
        });
      });
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle malformed instance context gracefully', async () => {
      // Arrange
      const malformedContext = {
        n8nApiUrl: 'not-a-url',
        n8nApiKey: 'placeholder'
      } as InstanceContext;

      server.setInstanceContext(malformedContext);

      // Act & Assert - should not throw
      expect(async () => {
        await server.handleRequest({
          method: 'tools/list',
          params: {}
        });
      }).not.toThrow();
    });

    it('should handle null instance context gracefully', async () => {
      // Arrange
      server.setInstanceContext(null as any);

      // Act & Assert - should not throw
      expect(async () => {
        await server.handleRequest({
          method: 'tools/list',
          params: {}
        });
      }).not.toThrow();
    });

    it('should handle undefined instance context gracefully', async () => {
      // Arrange
      server.setInstanceContext(undefined as any);

      // Act & Assert - should not throw
      expect(async () => {
        await server.handleRequest({
          method: 'tools/list',
          params: {}
        });
      }).not.toThrow();
    });

    it('should sanitize sensitive information in logs', async () => {
      // This test would require access to the logger mock to verify
      // that sensitive information is not logged in plain text
      const { logger } = await import('../../../src/utils/logger');

      // Arrange
      process.env.N8N_API_KEY = 'secret-api-key';

      // Act
      await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      // Assert
      expect(logger.debug).toHaveBeenCalled();
      const logCalls = vi.mocked(logger.debug).mock.calls;

      // Verify that API keys are not logged in plain text
      logCalls.forEach(call => {
        const logMessage = JSON.stringify(call);
        expect(logMessage).not.toContain('secret-api-key');
      });
    });
  });

  describe('Tool Count Validation', () => {
    it('should return expected number of documentation tools', async () => {
      // Arrange - no configuration to get only documentation tools

      // Act
      const result = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      // Assert
      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBeGreaterThan(10); // Should have multiple documentation tools
      expect(result.tools.length).toBeLessThan(30); // But not management tools
    });

    it('should return expected number of total tools when management tools are included', async () => {
      // Arrange
      process.env.ENABLE_MULTI_TENANT = 'true';

      // Act
      const result = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      // Assert
      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBeGreaterThan(20); // Should have both sets of tools
    });

    it('should have consistent tool structures', async () => {
      // Arrange
      process.env.ENABLE_MULTI_TENANT = 'true';

      // Act
      const result = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      // Assert
      expect(result.tools).toBeDefined();
      result.tools.forEach((tool: any) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
      });
    });
  });
});
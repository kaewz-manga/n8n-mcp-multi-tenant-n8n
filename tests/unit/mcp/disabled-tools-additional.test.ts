import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';

// Mock the database and dependencies
vi.mock('../../../src/database/database-adapter');
vi.mock('../../../src/database/node-repository');
vi.mock('../../../src/templates/template-service');
vi.mock('../../../src/utils/logger');

/**
 * Test wrapper class that exposes private methods for unit testing.
 * This pattern is preferred over modifying production code visibility
 * or using reflection-based testing utilities.
 */
class TestableN8NMCPServer extends N8NDocumentationMCPServer {
  /**
   * Expose getDisabledTools() for testing environment variable parsing.
   * @returns Set of disabled tool names from DISABLED_TOOLS env var
   */
  public testGetDisabledTools(): Set<string> {
    return (this as any).getDisabledTools();
  }

  /**
   * Expose executeTool() for testing the defense-in-depth guard.
   * @param name - Tool name to execute
   * @param args - Tool arguments
   * @returns Tool execution result
   */
  public async testExecuteTool(name: string, args: any): Promise<any> {
    return (this as any).executeTool(name, args);
  }
}

describe('Disabled Tools Additional Coverage (Issue #410)', () => {
  let server: TestableN8NMCPServer;

  beforeEach(() => {
    // Set environment variable to use in-memory database
    process.env.NODE_DB_PATH = ':memory:';
  });

  afterEach(() => {
    delete process.env.NODE_DB_PATH;
    delete process.env.DISABLED_TOOLS;
    delete process.env.ENABLE_MULTI_TENANT;
    delete process.env.N8N_API_URL;
    delete process.env.N8N_API_KEY;
  });

  describe('Error Response Structure Validation', () => {
    it('should throw error with specific message format', async () => {
      process.env.DISABLED_TOOLS = 'test_tool';
      server = new TestableN8NMCPServer();

      let thrownError: Error | null = null;
      try {
        await server.testExecuteTool('test_tool', {});
      } catch (error) {
        thrownError = error as Error;
      }

      // Verify error was thrown
      expect(thrownError).not.toBeNull();
      expect(thrownError?.message).toBe(
        "Tool 'test_tool' is disabled via DISABLED_TOOLS environment variable"
      );
    });

    it('should include tool name in error message', async () => {
      const toolName = 'my_special_tool';
      process.env.DISABLED_TOOLS = toolName;
      server = new TestableN8NMCPServer();

      let errorMessage = '';
      try {
        await server.testExecuteTool(toolName, {});
      } catch (error: any) {
        errorMessage = error.message;
      }

      expect(errorMessage).toContain(toolName);
      expect(errorMessage).toContain('disabled via DISABLED_TOOLS');
    });

    it('should throw consistent error format for all disabled tools', async () => {
      const tools = ['tool1', 'tool2', 'tool3'];
      process.env.DISABLED_TOOLS = tools.join(',');
      server = new TestableN8NMCPServer();

      for (const tool of tools) {
        let errorMessage = '';
        try {
          await server.testExecuteTool(tool, {});
        } catch (error: any) {
          errorMessage = error.message;
        }

        // Verify consistent error format
        expect(errorMessage).toMatch(/^Tool '.*' is disabled via DISABLED_TOOLS environment variable$/);
        expect(errorMessage).toContain(tool);
      }
    });
  });

  describe('Multi-Tenant Mode Interaction', () => {
    it('should respect DISABLED_TOOLS in multi-tenant mode', () => {
      process.env.ENABLE_MULTI_TENANT = 'true';
      process.env.DISABLED_TOOLS = 'n8n_delete_workflow,n8n_update_full_workflow';
      delete process.env.N8N_API_URL;
      delete process.env.N8N_API_KEY;

      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      // Even in multi-tenant mode, disabled tools should be filtered
      expect(disabledTools.has('n8n_delete_workflow')).toBe(true);
      expect(disabledTools.has('n8n_update_full_workflow')).toBe(true);
      expect(disabledTools.size).toBe(2);
    });

    it('should parse DISABLED_TOOLS regardless of N8N_API_URL setting', () => {
      process.env.DISABLED_TOOLS = 'tool1,tool2';
      process.env.N8N_API_URL = 'http://localhost:5678';
      process.env.N8N_API_KEY = 'test-key';

      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.size).toBe(2);
      expect(disabledTools.has('tool1')).toBe(true);
      expect(disabledTools.has('tool2')).toBe(true);
    });

    it('should work when only ENABLE_MULTI_TENANT is set', () => {
      process.env.ENABLE_MULTI_TENANT = 'true';
      process.env.DISABLED_TOOLS = 'restricted_tool';

      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.has('restricted_tool')).toBe(true);
    });
  });

  describe('Edge Cases - Special Characters and Unicode', () => {
    it('should handle unicode tool names correctly', () => {
      process.env.DISABLED_TOOLS = 'tool_测试,tool_münchen,tool_العربية';
      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.size).toBe(3);
      expect(disabledTools.has('tool_测试')).toBe(true);
      expect(disabledTools.has('tool_münchen')).toBe(true);
      expect(disabledTools.has('tool_العربية')).toBe(true);
    });

    it('should handle emoji in tool names', () => {
      process.env.DISABLED_TOOLS = 'tool_🎯,tool_✅,tool_❌';
      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.size).toBe(3);
      expect(disabledTools.has('tool_🎯')).toBe(true);
      expect(disabledTools.has('tool_✅')).toBe(true);
      expect(disabledTools.has('tool_❌')).toBe(true);
    });

    it('should treat regex special characters as literals', () => {
      process.env.DISABLED_TOOLS = 'tool.*,tool[0-9],tool(test)';
      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      // These should be treated as literal strings, not regex patterns
      expect(disabledTools.has('tool.*')).toBe(true);
      expect(disabledTools.has('tool[0-9]')).toBe(true);
      expect(disabledTools.has('tool(test)')).toBe(true);
      expect(disabledTools.size).toBe(3);
    });

    it('should handle tool names with dots and colons', () => {
      process.env.DISABLED_TOOLS = 'org.example.tool,namespace:tool:v1';
      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.has('org.example.tool')).toBe(true);
      expect(disabledTools.has('namespace:tool:v1')).toBe(true);
    });

    it('should handle tool names with @ symbols', () => {
      process.env.DISABLED_TOOLS = '@scope/tool,user@tool';
      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.has('@scope/tool')).toBe(true);
      expect(disabledTools.has('user@tool')).toBe(true);
    });
  });

  describe('Performance and Scale', () => {
    it('should handle 100 disabled tools efficiently', () => {
      const manyTools = Array.from({ length: 100 }, (_, i) => `tool_${i}`);
      process.env.DISABLED_TOOLS = manyTools.join(',');

      const start = Date.now();
      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();
      const duration = Date.now() - start;

      expect(disabledTools.size).toBe(100);
      expect(duration).toBeLessThan(50); // Should be very fast
    });

    it('should handle 1000 disabled tools efficiently and enforce 200 tool limit', () => {
      const manyTools = Array.from({ length: 1000 }, (_, i) => `tool_${i}`);
      process.env.DISABLED_TOOLS = manyTools.join(',');

      const start = Date.now();
      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();
      const duration = Date.now() - start;

      // Safety limit: max 200 tools enforced
      expect(disabledTools.size).toBe(200);
      expect(duration).toBeLessThan(100); // Should still be fast
    });

    it('should efficiently check membership in large disabled set', () => {
      const manyTools = Array.from({ length: 500 }, (_, i) => `tool_${i}`);
      process.env.DISABLED_TOOLS = manyTools.join(',');

      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      // Test membership check performance (Set.has() is O(1))
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        disabledTools.has(`tool_${i % 500}`);
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10); // Should be very fast
    });
  });

  describe('Environment Variable Edge Cases', () => {
    it('should handle very long tool names', () => {
      const longToolName = 'tool_' + 'a'.repeat(500);
      process.env.DISABLED_TOOLS = longToolName;

      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.has(longToolName)).toBe(true);
    });

    it('should handle newlines in tool names (after trim)', () => {
      process.env.DISABLED_TOOLS = 'tool1\n,tool2\r\n,tool3\r';

      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      // Newlines should be trimmed
      expect(disabledTools.has('tool1')).toBe(true);
      expect(disabledTools.has('tool2')).toBe(true);
      expect(disabledTools.has('tool3')).toBe(true);
    });

    it('should handle tabs in tool names (after trim)', () => {
      process.env.DISABLED_TOOLS = '\ttool1\t,\ttool2\t';

      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.has('tool1')).toBe(true);
      expect(disabledTools.has('tool2')).toBe(true);
    });

    it('should handle mixed whitespace correctly', () => {
      process.env.DISABLED_TOOLS = '  \t tool1 \n ,  tool2  \r\n, tool3  ';

      server = new TestableN8NMCPServer();
      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.size).toBe(3);
      expect(disabledTools.has('tool1')).toBe(true);
      expect(disabledTools.has('tool2')).toBe(true);
      expect(disabledTools.has('tool3')).toBe(true);
    });

    it('should enforce 10KB limit on DISABLED_TOOLS environment variable', () => {
      // Create a very long env var (15KB) by repeating tool names
      const longTools = Array.from({ length: 1500 }, (_, i) => `tool_${i}`);
      const longValue = longTools.join(',');

      // Verify we created >10KB string
      expect(longValue.length).toBeGreaterThan(10000);

      process.env.DISABLED_TOOLS = longValue;
      server = new TestableN8NMCPServer();

      // Should succeed and truncate to 10KB
      const disabledTools = server.testGetDisabledTools();

      // Should have parsed some tools (at least the first ones)
      expect(disabledTools.size).toBeGreaterThan(0);

      // First few tools should be present (they're in the first 10KB)
      expect(disabledTools.has('tool_0')).toBe(true);
      expect(disabledTools.has('tool_1')).toBe(true);
      expect(disabledTools.has('tool_2')).toBe(true);

      // Last tools should NOT be present (they were truncated)
      expect(disabledTools.has('tool_1499')).toBe(false);
      expect(disabledTools.has('tool_1498')).toBe(false);
    });
  });

  describe('Defense in Depth - Multiple Layers', () => {
    it('should prevent execution at executeTool level', async () => {
      process.env.DISABLED_TOOLS = 'blocked_tool';
      server = new TestableN8NMCPServer();

      // The executeTool method should throw immediately
      await expect(async () => {
        await server.testExecuteTool('blocked_tool', {});
      }).rejects.toThrow('disabled via DISABLED_TOOLS');
    });

    it('should be case-sensitive in tool name matching', async () => {
      process.env.DISABLED_TOOLS = 'BlockedTool';
      server = new TestableN8NMCPServer();

      // 'blockedtool' should NOT be blocked (case-sensitive)
      const disabledTools = server.testGetDisabledTools();
      expect(disabledTools.has('BlockedTool')).toBe(true);
      expect(disabledTools.has('blockedtool')).toBe(false);
    });

    it('should check disabled status on every executeTool call', async () => {
      process.env.DISABLED_TOOLS = 'tool1';
      server = new TestableN8NMCPServer();

      // First call should fail
      await expect(async () => {
        await server.testExecuteTool('tool1', {});
      }).rejects.toThrow('disabled');

      // Second call should also fail (consistent behavior)
      await expect(async () => {
        await server.testExecuteTool('tool1', {});
      }).rejects.toThrow('disabled');

      // Non-disabled tool should work (or fail for other reasons)
      try {
        await server.testExecuteTool('other_tool', {});
      } catch (error: any) {
        // Should not be disabled error
        expect(error.message).not.toContain('disabled via DISABLED_TOOLS');
      }
    });

    it('should not leak list of disabled tools in error response', async () => {
      // Set multiple disabled tools including some "secret" ones
      process.env.DISABLED_TOOLS = 'secret_tool_1,secret_tool_2,secret_tool_3,attempted_tool';
      server = new TestableN8NMCPServer();

      // Try to execute one of the disabled tools
      let errorMessage = '';
      try {
        await server.testExecuteTool('attempted_tool', {});
      } catch (error: any) {
        errorMessage = error.message;
      }

      // Error message should mention the attempted tool
      expect(errorMessage).toContain('attempted_tool');
      expect(errorMessage).toContain('disabled via DISABLED_TOOLS');

      // Error message should NOT leak the other disabled tools
      expect(errorMessage).not.toContain('secret_tool_1');
      expect(errorMessage).not.toContain('secret_tool_2');
      expect(errorMessage).not.toContain('secret_tool_3');

      // Should not contain any arrays or lists
      expect(errorMessage).not.toContain('[');
      expect(errorMessage).not.toContain(']');
    });
  });

  describe('Real-World Deployment Verification', () => {
    it('should support common security hardening scenario', () => {
      // Disable all write/delete operations in production
      const dangerousTools = [
        'n8n_delete_workflow',
        'n8n_update_full_workflow',
        'n8n_delete_execution',
      ];

      process.env.DISABLED_TOOLS = dangerousTools.join(',');
      server = new TestableN8NMCPServer();

      const disabledTools = server.testGetDisabledTools();

      dangerousTools.forEach(tool => {
        expect(disabledTools.has(tool)).toBe(true);
      });
    });

    it('should support staging environment scenario', () => {
      // In staging, disable only production-specific tools
      process.env.DISABLED_TOOLS = 'n8n_trigger_webhook_workflow';
      server = new TestableN8NMCPServer();

      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.has('n8n_trigger_webhook_workflow')).toBe(true);
      expect(disabledTools.size).toBe(1);
    });

    it('should support development environment scenario', () => {
      // In dev, maybe disable resource-intensive tools
      process.env.DISABLED_TOOLS = 'search_templates_by_metadata,fetch_large_datasets';
      server = new TestableN8NMCPServer();

      const disabledTools = server.testGetDisabledTools();

      expect(disabledTools.size).toBe(2);
    });
  });
});

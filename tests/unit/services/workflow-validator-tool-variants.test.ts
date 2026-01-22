/**
 * Tests for WorkflowValidator - Tool Variant Validation
 *
 * Tests the validateAIToolSource() method which ensures that base nodes
 * with ai_tool connections use the correct Tool variant node type.
 *
 * Coverage:
 * - Langchain tool nodes pass validation
 * - Tool variant nodes pass validation
 * - Base nodes with Tool variants fail with WRONG_NODE_TYPE_FOR_AI_TOOL
 * - Error includes fix suggestion with tool-variant-correction type
 * - Unknown nodes don't cause errors
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowValidator } from '@/services/workflow-validator';
import { NodeRepository } from '@/database/node-repository';
import { EnhancedConfigValidator } from '@/services/enhanced-config-validator';

// Mock dependencies
vi.mock('@/database/node-repository');
vi.mock('@/services/enhanced-config-validator');
vi.mock('@/utils/logger');

describe('WorkflowValidator - Tool Variant Validation', () => {
  let validator: WorkflowValidator;
  let mockRepository: NodeRepository;
  let mockValidator: typeof EnhancedConfigValidator;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock repository
    mockRepository = {
      getNode: vi.fn((nodeType: string) => {
        // Mock base node with Tool variant available
        if (nodeType === 'nodes-base.supabase') {
          return {
            nodeType: 'nodes-base.supabase',
            displayName: 'Supabase',
            isAITool: true,
            hasToolVariant: true,
            isToolVariant: false,
            isTrigger: false,
            properties: []
          };
        }

        // Mock Tool variant node
        if (nodeType === 'nodes-base.supabaseTool') {
          return {
            nodeType: 'nodes-base.supabaseTool',
            displayName: 'Supabase Tool',
            isAITool: true,
            hasToolVariant: false,
            isToolVariant: true,
            toolVariantOf: 'nodes-base.supabase',
            isTrigger: false,
            properties: []
          };
        }

        // Mock langchain node (Calculator tool)
        if (nodeType === 'nodes-langchain.toolCalculator') {
          return {
            nodeType: 'nodes-langchain.toolCalculator',
            displayName: 'Calculator',
            isAITool: true,
            hasToolVariant: false,
            isToolVariant: false,
            isTrigger: false,
            properties: []
          };
        }

        // Mock HTTP Request Tool node
        if (nodeType === 'nodes-langchain.toolHttpRequest') {
          return {
            nodeType: 'nodes-langchain.toolHttpRequest',
            displayName: 'HTTP Request Tool',
            isAITool: true,
            hasToolVariant: false,
            isToolVariant: false,
            isTrigger: false,
            properties: []
          };
        }

        // Mock base node without Tool variant
        if (nodeType === 'nodes-base.httpRequest') {
          return {
            nodeType: 'nodes-base.httpRequest',
            displayName: 'HTTP Request',
            isAITool: false,
            hasToolVariant: false,
            isToolVariant: false,
            isTrigger: false,
            properties: []
          };
        }

        return null; // Unknown node
      })
    } as any;

    mockValidator = EnhancedConfigValidator;

    validator = new WorkflowValidator(mockRepository, mockValidator);
  });

  describe('validateAIToolSource - Langchain tool nodes', () => {
    it('should pass validation for Calculator tool node', async () => {
      const workflow = {
        nodes: [
          {
            id: 'calculator-1',
            name: 'Calculator',
            type: 'n8n-nodes-langchain.toolCalculator',
            typeVersion: 1.2,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          Calculator: {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      // Should not have errors about wrong node type for AI tool
      const toolVariantErrors = result.errors.filter(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );
      expect(toolVariantErrors).toHaveLength(0);
    });

    it('should pass validation for HTTP Request Tool node', async () => {
      const workflow = {
        nodes: [
          {
            id: 'http-tool-1',
            name: 'HTTP Request Tool',
            type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
            typeVersion: 1.2,
            position: [250, 300] as [number, number],
            parameters: {
              url: 'https://api.example.com',
              toolDescription: 'Fetch data from API'
            }
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          'HTTP Request Tool': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      const toolVariantErrors = result.errors.filter(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );
      expect(toolVariantErrors).toHaveLength(0);
    });
  });

  describe('validateAIToolSource - Tool variant nodes', () => {
    it('should pass validation for Tool variant node (supabaseTool)', async () => {
      const workflow = {
        nodes: [
          {
            id: 'supabase-tool-1',
            name: 'Supabase Tool',
            type: 'n8n-nodes-base.supabaseTool',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {
              toolDescription: 'Query Supabase database'
            }
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          'Supabase Tool': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      const toolVariantErrors = result.errors.filter(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );
      expect(toolVariantErrors).toHaveLength(0);
    });

    it('should verify Tool variant is marked correctly in database', async () => {
      const workflow = {
        nodes: [
          {
            id: 'supabase-tool-1',
            name: 'Supabase Tool',
            type: 'n8n-nodes-base.supabaseTool',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          'Supabase Tool': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      await validator.validateWorkflow(workflow);

      // Verify repository was called to check if it's a Tool variant
      expect(mockRepository.getNode).toHaveBeenCalledWith('nodes-base.supabaseTool');
    });
  });

  describe('validateAIToolSource - Base nodes with Tool variants', () => {
    it('should fail when base node is used instead of Tool variant', async () => {
      const workflow = {
        nodes: [
          {
            id: 'supabase-1',
            name: 'Supabase',
            type: 'n8n-nodes-base.supabase',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          Supabase: {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      // Should have error with WRONG_NODE_TYPE_FOR_AI_TOOL code
      const toolVariantErrors = result.errors.filter(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );
      expect(toolVariantErrors).toHaveLength(1);
    });

    it('should include fix suggestion in error', async () => {
      const workflow = {
        nodes: [
          {
            id: 'supabase-1',
            name: 'Supabase',
            type: 'n8n-nodes-base.supabase',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          Supabase: {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      const toolVariantError = result.errors.find(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      ) as any;

      expect(toolVariantError).toBeDefined();
      expect(toolVariantError.fix).toBeDefined();
      expect(toolVariantError.fix.type).toBe('tool-variant-correction');
      expect(toolVariantError.fix.currentType).toBe('n8n-nodes-base.supabase');
      expect(toolVariantError.fix.suggestedType).toBe('n8n-nodes-base.supabaseTool');
      expect(toolVariantError.fix.description).toContain('n8n-nodes-base.supabase');
      expect(toolVariantError.fix.description).toContain('n8n-nodes-base.supabaseTool');
    });

    it('should provide clear error message', async () => {
      const workflow = {
        nodes: [
          {
            id: 'supabase-1',
            name: 'Supabase',
            type: 'n8n-nodes-base.supabase',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          Supabase: {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      const toolVariantError = result.errors.find(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );

      expect(toolVariantError).toBeDefined();
      expect(toolVariantError!.message).toContain('cannot output ai_tool connections');
      expect(toolVariantError!.message).toContain('Tool variant');
      expect(toolVariantError!.message).toContain('n8n-nodes-base.supabaseTool');
    });

    it('should handle multiple base nodes incorrectly used as tools', async () => {
      mockRepository.getNode = vi.fn((nodeType: string) => {
        if (nodeType === 'nodes-base.postgres') {
          return {
            nodeType: 'nodes-base.postgres',
            displayName: 'Postgres',
            isAITool: true,
            hasToolVariant: true,
            isToolVariant: false,
            isTrigger: false,
            properties: []
          };
        }
        if (nodeType === 'nodes-base.supabase') {
          return {
            nodeType: 'nodes-base.supabase',
            displayName: 'Supabase',
            isAITool: true,
            hasToolVariant: true,
            isToolVariant: false,
            isTrigger: false,
            properties: []
          };
        }
        return null;
      }) as any;

      const workflow = {
        nodes: [
          {
            id: 'postgres-1',
            name: 'Postgres',
            type: 'n8n-nodes-base.postgres',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'supabase-1',
            name: 'Supabase',
            type: 'n8n-nodes-base.supabase',
            typeVersion: 1,
            position: [250, 400] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          Postgres: {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          },
          Supabase: {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      const toolVariantErrors = result.errors.filter(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );
      expect(toolVariantErrors).toHaveLength(2);
    });
  });

  describe('validateAIToolSource - Unknown nodes', () => {
    it('should not error for unknown node types', async () => {
      const workflow = {
        nodes: [
          {
            id: 'unknown-1',
            name: 'Unknown Tool',
            type: 'custom-package.unknownTool',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          'Unknown Tool': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      // Unknown nodes should not cause tool variant errors
      // Let other validation handle unknown node types
      const toolVariantErrors = result.errors.filter(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );
      expect(toolVariantErrors).toHaveLength(0);

      // But there might be an "Unknown node type" error from different validation
      const unknownNodeErrors = result.errors.filter(e =>
        e.message && e.message.includes('Unknown node type')
      );
      expect(unknownNodeErrors.length).toBeGreaterThan(0);
    });

    it('should not error for community nodes', async () => {
      const workflow = {
        nodes: [
          {
            id: 'community-1',
            name: 'Community Tool',
            type: 'community-package.customTool',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          'Community Tool': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      // Community nodes should not cause tool variant errors
      const toolVariantErrors = result.errors.filter(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );
      expect(toolVariantErrors).toHaveLength(0);
    });
  });

  describe('validateAIToolSource - Edge cases', () => {
    it('should not error for base nodes without ai_tool connections', async () => {
      const workflow = {
        nodes: [
          {
            id: 'supabase-1',
            name: 'Supabase',
            type: 'n8n-nodes-base.supabase',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'set-1',
            name: 'Set',
            type: 'n8n-nodes-base.set',
            typeVersion: 1,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          Supabase: {
            main: [[{ node: 'Set', type: 'main', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      // No ai_tool connections, so no tool variant validation errors
      const toolVariantErrors = result.errors.filter(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );
      expect(toolVariantErrors).toHaveLength(0);
    });

    it('should not error when base node without Tool variant uses ai_tool', async () => {
      const workflow = {
        nodes: [
          {
            id: 'http-1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          'HTTP Request': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      // httpRequest has no Tool variant, so this should produce a different error
      const toolVariantErrors = result.errors.filter(e =>
        e.code === 'WRONG_NODE_TYPE_FOR_AI_TOOL'
      );
      expect(toolVariantErrors).toHaveLength(0);

      // Should have INVALID_AI_TOOL_SOURCE error instead
      const invalidToolErrors = result.errors.filter(e =>
        e.code === 'INVALID_AI_TOOL_SOURCE'
      );
      expect(invalidToolErrors.length).toBeGreaterThan(0);
    });
  });

  describe('validateAllNodes - Inferred Tool Variants (Issue #522)', () => {
    /**
     * Tests for dynamic AI Tool nodes that are created at runtime by n8n
     * when ANY node is used in an AI Agent's tool slot.
     *
     * These nodes (e.g., googleDriveTool, googleSheetsTool) don't exist in npm packages
     * but are valid when the base node exists.
     */

    beforeEach(() => {
      // Update mock repository to include Google nodes
      mockRepository.getNode = vi.fn((nodeType: string) => {
        // Base node with Tool variant
        if (nodeType === 'nodes-base.supabase') {
          return {
            nodeType: 'nodes-base.supabase',
            displayName: 'Supabase',
            isAITool: true,
            hasToolVariant: true,
            isToolVariant: false,
            isTrigger: false,
            properties: []
          };
        }

        // Tool variant in database
        if (nodeType === 'nodes-base.supabaseTool') {
          return {
            nodeType: 'nodes-base.supabaseTool',
            displayName: 'Supabase Tool',
            isAITool: true,
            hasToolVariant: false,
            isToolVariant: true,
            toolVariantOf: 'nodes-base.supabase',
            isTrigger: false,
            properties: []
          };
        }

        // Google Drive base node (exists, but no Tool variant in DB)
        if (nodeType === 'nodes-base.googleDrive') {
          return {
            nodeType: 'nodes-base.googleDrive',
            displayName: 'Google Drive',
            isAITool: false, // Not marked as AI tool in npm package
            hasToolVariant: false, // No Tool variant in database
            isToolVariant: false,
            isTrigger: false,
            properties: [],
            category: 'files'
          };
        }

        // Google Sheets base node (exists, but no Tool variant in DB)
        if (nodeType === 'nodes-base.googleSheets') {
          return {
            nodeType: 'nodes-base.googleSheets',
            displayName: 'Google Sheets',
            isAITool: false,
            hasToolVariant: false,
            isToolVariant: false,
            isTrigger: false,
            properties: [],
            category: 'productivity'
          };
        }

        // AI Agent node
        if (nodeType === 'nodes-langchain.agent') {
          return {
            nodeType: 'nodes-langchain.agent',
            displayName: 'AI Agent',
            isAITool: false,
            hasToolVariant: false,
            isToolVariant: false,
            isTrigger: false,
            properties: []
          };
        }

        return null; // Unknown node
      }) as any;
    });

    it('should pass validation for googleDriveTool when googleDrive exists', async () => {
      const workflow = {
        nodes: [
          {
            id: 'drive-tool-1',
            name: 'Google Drive Tool',
            type: 'n8n-nodes-base.googleDriveTool',
            typeVersion: 3,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should NOT have "Unknown node type" error
      const unknownErrors = result.errors.filter(e =>
        e.message && e.message.includes('Unknown node type')
      );
      expect(unknownErrors).toHaveLength(0);

      // Should have INFERRED_TOOL_VARIANT warning
      const inferredWarnings = result.warnings.filter(e =>
        (e as any).code === 'INFERRED_TOOL_VARIANT'
      );
      expect(inferredWarnings).toHaveLength(1);
      expect(inferredWarnings[0].message).toContain('googleDriveTool');
      expect(inferredWarnings[0].message).toContain('Google Drive');
    });

    it('should pass validation for googleSheetsTool when googleSheets exists', async () => {
      const workflow = {
        nodes: [
          {
            id: 'sheets-tool-1',
            name: 'Google Sheets Tool',
            type: 'n8n-nodes-base.googleSheetsTool',
            typeVersion: 4,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should NOT have "Unknown node type" error
      const unknownErrors = result.errors.filter(e =>
        e.message && e.message.includes('Unknown node type')
      );
      expect(unknownErrors).toHaveLength(0);

      // Should have INFERRED_TOOL_VARIANT warning
      const inferredWarnings = result.warnings.filter(e =>
        (e as any).code === 'INFERRED_TOOL_VARIANT'
      );
      expect(inferredWarnings).toHaveLength(1);
      expect(inferredWarnings[0].message).toContain('googleSheetsTool');
      expect(inferredWarnings[0].message).toContain('Google Sheets');
    });

    it('should report error for unknownNodeTool when base node does not exist', async () => {
      const workflow = {
        nodes: [
          {
            id: 'unknown-tool-1',
            name: 'Unknown Tool',
            type: 'n8n-nodes-base.nonExistentNodeTool',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should have "Unknown node type" error
      const unknownErrors = result.errors.filter(e =>
        e.message && e.message.includes('Unknown node type')
      );
      expect(unknownErrors).toHaveLength(1);

      // Should NOT have INFERRED_TOOL_VARIANT warning
      const inferredWarnings = result.warnings.filter(e =>
        (e as any).code === 'INFERRED_TOOL_VARIANT'
      );
      expect(inferredWarnings).toHaveLength(0);
    });

    it('should handle multiple inferred tool variants in same workflow', async () => {
      const workflow = {
        nodes: [
          {
            id: 'drive-tool-1',
            name: 'Google Drive Tool',
            type: 'n8n-nodes-base.googleDriveTool',
            typeVersion: 3,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'sheets-tool-1',
            name: 'Google Sheets Tool',
            type: 'n8n-nodes-base.googleSheetsTool',
            typeVersion: 4,
            position: [250, 400] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          'Google Drive Tool': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          },
          'Google Sheets Tool': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      // Should NOT have "Unknown node type" errors
      const unknownErrors = result.errors.filter(e =>
        e.message && e.message.includes('Unknown node type')
      );
      expect(unknownErrors).toHaveLength(0);

      // Should have 2 INFERRED_TOOL_VARIANT warnings
      const inferredWarnings = result.warnings.filter(e =>
        (e as any).code === 'INFERRED_TOOL_VARIANT'
      );
      expect(inferredWarnings).toHaveLength(2);
    });

    it('should prefer database record over inference for supabaseTool', async () => {
      const workflow = {
        nodes: [
          {
            id: 'supabase-tool-1',
            name: 'Supabase Tool',
            type: 'n8n-nodes-base.supabaseTool',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should NOT have "Unknown node type" error
      const unknownErrors = result.errors.filter(e =>
        e.message && e.message.includes('Unknown node type')
      );
      expect(unknownErrors).toHaveLength(0);

      // Should NOT have INFERRED_TOOL_VARIANT warning (it's in database)
      const inferredWarnings = result.warnings.filter(e =>
        (e as any).code === 'INFERRED_TOOL_VARIANT'
      );
      expect(inferredWarnings).toHaveLength(0);
    });

    it('should include helpful message in warning', async () => {
      const workflow = {
        nodes: [
          {
            id: 'drive-tool-1',
            name: 'Google Drive Tool',
            type: 'n8n-nodes-base.googleDriveTool',
            typeVersion: 3,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      const inferredWarning = result.warnings.find(e =>
        (e as any).code === 'INFERRED_TOOL_VARIANT'
      );

      expect(inferredWarning).toBeDefined();
      expect(inferredWarning!.message).toContain('inferred as a dynamic AI Tool variant');
      expect(inferredWarning!.message).toContain('nodes-base.googleDrive');
      expect(inferredWarning!.message).toContain('Google Drive');
      expect(inferredWarning!.message).toContain('AI Agent');
    });
  });
});

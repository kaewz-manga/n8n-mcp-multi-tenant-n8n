/**
 * Tests for WorkflowAutoFixer - Tool Variant Fixes
 *
 * Tests the processToolVariantFixes() method which generates fix operations
 * to replace base node types with their Tool variant equivalents when
 * incorrectly used with ai_tool connections.
 *
 * Coverage:
 * - tool-variant-correction fixes are generated from validation errors
 * - Fix changes node type from base to Tool variant
 * - Fixes have high confidence
 * - Multiple tool variant fixes in same workflow
 * - Fix operations are correctly structured
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowAutoFixer } from '@/services/workflow-auto-fixer';
import { NodeRepository } from '@/database/node-repository';
import type { WorkflowValidationResult } from '@/services/workflow-validator';
import type { Workflow, WorkflowNode } from '@/types/n8n-api';

vi.mock('@/database/node-repository');
vi.mock('@/utils/logger');

describe('WorkflowAutoFixer - Tool Variant Fixes', () => {
  let autoFixer: WorkflowAutoFixer;
  let mockRepository: NodeRepository;

  const createMockWorkflow = (nodes: WorkflowNode[]): Workflow => ({
    id: 'test-workflow',
    name: 'Test Workflow',
    active: false,
    nodes,
    connections: {},
    settings: {},
    createdAt: '',
    updatedAt: ''
  });

  const createMockNode = (
    id: string,
    name: string,
    type: string,
    parameters: any = {}
  ): WorkflowNode => ({
    id,
    name,
    type,
    typeVersion: 1,
    position: [0, 0],
    parameters
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = new NodeRepository({} as any);

    // Mock getNodeVersions to return empty array (prevent version upgrade processing)
    vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue([]);

    autoFixer = new WorkflowAutoFixer(mockRepository);
  });

  describe('processToolVariantFixes - Basic functionality', () => {
    it('should generate fix for base node incorrectly used as AI tool', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Node "Supabase" uses "n8n-nodes-base.supabase" which cannot output ai_tool connections. Use the Tool variant "n8n-nodes-base.supabaseTool" instead for AI Agent integration.',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Change node type from "n8n-nodes-base.supabase" to "n8n-nodes-base.supabaseTool"'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      expect(result.fixes).toHaveLength(1);
      expect(result.fixes[0].type).toBe('tool-variant-correction');
      expect(result.fixes[0].node).toBe('Supabase');
      expect(result.fixes[0].field).toBe('type');
      expect(result.fixes[0].before).toBe('n8n-nodes-base.supabase');
      expect(result.fixes[0].after).toBe('n8n-nodes-base.supabaseTool');
    });

    it('should generate fix with high confidence', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Node uses wrong type for AI tool',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Fix tool variant'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      expect(result.fixes).toHaveLength(1);
      expect(result.fixes[0].confidence).toBe('high');
    });

    it('should generate correct update operation', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {
          resource: 'database',
          operation: 'query'
        })
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Wrong node type for AI tool',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Fix tool variant'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].type).toBe('updateNode');
      expect((result.operations[0] as any).nodeId).toBe('Supabase');
      expect((result.operations[0] as any).updates.type).toBe('n8n-nodes-base.supabaseTool');
    });
  });

  describe('processToolVariantFixes - Multiple fixes', () => {
    it('should generate fixes for multiple nodes', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {}),
        createMockNode('postgres-1', 'Postgres', 'n8n-nodes-base.postgres', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Fix supabase tool variant'
            }
          },
          {
            type: 'error',
            nodeId: 'postgres-1',
            nodeName: 'Postgres',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.postgres',
              suggestedType: 'n8n-nodes-base.postgresTool',
              description: 'Fix postgres tool variant'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 2,
          enabledNodes: 2,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      expect(result.fixes).toHaveLength(2);
      expect(result.operations).toHaveLength(2);

      const supabaseFix = result.fixes.find(f => f.node === 'Supabase');
      expect(supabaseFix).toBeDefined();
      expect(supabaseFix!.after).toBe('n8n-nodes-base.supabaseTool');

      const postgresFix = result.fixes.find(f => f.node === 'Postgres');
      expect(postgresFix).toBeDefined();
      expect(postgresFix!.after).toBe('n8n-nodes-base.postgresTool');
    });
  });

  describe('processToolVariantFixes - Error handling', () => {
    it('should skip errors without WRONG_NODE_TYPE_FOR_AI_TOOL code', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Different error',
            code: 'DIFFERENT_ERROR'
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      const toolVariantFixes = result.fixes.filter(f => f.type === 'tool-variant-correction');
      expect(toolVariantFixes).toHaveLength(0);
    });

    it('should skip errors without fix metadata', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL'
            // No fix metadata
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      const toolVariantFixes = result.fixes.filter(f => f.type === 'tool-variant-correction');
      expect(toolVariantFixes).toHaveLength(0);
    });

    it('should skip errors with wrong fix type', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'different-fix-type',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Fix'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      const toolVariantFixes = result.fixes.filter(f => f.type === 'tool-variant-correction');
      expect(toolVariantFixes).toHaveLength(0);
    });

    it('should skip errors without node name or ID', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Fix'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      const toolVariantFixes = result.fixes.filter(f => f.type === 'tool-variant-correction');
      expect(toolVariantFixes).toHaveLength(0);
    });

    it('should skip errors when node not found in workflow', async () => {
      const workflow = createMockWorkflow([
        createMockNode('other-1', 'Other', 'n8n-nodes-base.set', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Fix'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      const toolVariantFixes = result.fixes.filter(f => f.type === 'tool-variant-correction');
      expect(toolVariantFixes).toHaveLength(0);
    });
  });

  describe('processToolVariantFixes - Integration with other fixes', () => {
    it('should work alongside expression format fixes', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {
          url: '{{ $json.url }}' // Missing = prefix
        })
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Fix tool variant'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 1
        },
        suggestions: []
      };

      const formatIssues = [
        {
          fieldPath: 'url',
          currentValue: '{{ $json.url }}',
          correctedValue: '={{ $json.url }}',
          issueType: 'missing-prefix' as const,
          severity: 'error' as const,
          explanation: 'Missing = prefix',
          nodeName: 'Supabase',
          nodeId: 'supabase-1'
        }
      ];

      const result = await autoFixer.generateFixes(workflow, validationResult, formatIssues);

      // Should have both tool variant and expression fixes
      expect(result.fixes.length).toBeGreaterThanOrEqual(2);

      const toolVariantFix = result.fixes.find(f => f.type === 'tool-variant-correction');
      const expressionFix = result.fixes.find(f => f.type === 'expression-format');

      expect(toolVariantFix).toBeDefined();
      expect(expressionFix).toBeDefined();
    });
  });

  describe('processToolVariantFixes - Description and summary', () => {
    it('should include fix description from error', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Change node type from "n8n-nodes-base.supabase" to "n8n-nodes-base.supabaseTool"'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      expect(result.fixes[0].description).toBe(
        'Change node type from "n8n-nodes-base.supabase" to "n8n-nodes-base.supabaseTool"'
      );
    });

    it('should include tool variant corrections in summary', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Fix tool variant'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      expect(result.summary).toContain('tool variant');
      expect(result.stats.byType['tool-variant-correction']).toBe(1);
    });

    it('should pluralize summary correctly', async () => {
      const workflow = createMockWorkflow([
        createMockNode('supabase-1', 'Supabase', 'n8n-nodes-base.supabase', {}),
        createMockNode('postgres-1', 'Postgres', 'n8n-nodes-base.postgres', {})
      ]);

      const validationResult: WorkflowValidationResult = {
        valid: false,
        errors: [
          {
            type: 'error',
            nodeId: 'supabase-1',
            nodeName: 'Supabase',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.supabase',
              suggestedType: 'n8n-nodes-base.supabaseTool',
              description: 'Fix supabase'
            }
          },
          {
            type: 'error',
            nodeId: 'postgres-1',
            nodeName: 'Postgres',
            message: 'Wrong node type',
            code: 'WRONG_NODE_TYPE_FOR_AI_TOOL',
            fix: {
              type: 'tool-variant-correction',
              currentType: 'n8n-nodes-base.postgres',
              suggestedType: 'n8n-nodes-base.postgresTool',
              description: 'Fix postgres'
            }
          }
        ],
        warnings: [],
        statistics: {
          totalNodes: 2,
          enabledNodes: 2,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0
        },
        suggestions: []
      };

      const result = await autoFixer.generateFixes(workflow, validationResult, []);

      expect(result.summary).toContain('tool variant corrections');
      expect(result.stats.byType['tool-variant-correction']).toBe(2);
    });
  });
});

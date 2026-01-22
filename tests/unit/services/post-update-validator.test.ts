import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostUpdateValidator, type PostUpdateGuidance } from '@/services/post-update-validator';
import { NodeVersionService } from '@/services/node-version-service';
import { BreakingChangeDetector, type VersionUpgradeAnalysis, type DetectedChange } from '@/services/breaking-change-detector';
import { type MigrationResult } from '@/services/node-migration-service';

vi.mock('@/services/node-version-service');
vi.mock('@/services/breaking-change-detector');

describe('PostUpdateValidator', () => {
  let validator: PostUpdateValidator;
  let mockVersionService: NodeVersionService;
  let mockBreakingChangeDetector: BreakingChangeDetector;

  const createMockMigrationResult = (
    success: boolean,
    remainingIssues: string[] = []
  ): MigrationResult => ({
    success,
    nodeId: 'node-1',
    nodeName: 'Test Node',
    fromVersion: '1.0',
    toVersion: '2.0',
    appliedMigrations: [],
    remainingIssues,
    confidence: success ? 'HIGH' : 'MEDIUM',
    updatedNode: {}
  });

  const createMockChange = (
    propertyName: string,
    changeType: DetectedChange['changeType'],
    autoMigratable: boolean,
    severity: DetectedChange['severity'] = 'MEDIUM'
  ): DetectedChange => ({
    propertyName,
    changeType,
    isBreaking: true,
    migrationHint: `Migrate ${propertyName}`,
    autoMigratable,
    severity,
    source: 'registry'
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockVersionService = {} as any;
    mockBreakingChangeDetector = {} as any;
    validator = new PostUpdateValidator(mockVersionService, mockBreakingChangeDetector);

    mockVersionService.compareVersions = vi.fn((v1, v2) => {
      const parse = (v: string) => parseFloat(v);
      return parse(v1) - parse(v2);
    });
  });

  describe('generateGuidance', () => {
    it('should generate complete guidance for successful migration', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: false,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'LOW',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.migrationStatus).toBe('complete');
      expect(guidance.confidence).toBe('HIGH');
      expect(guidance.requiredActions).toHaveLength(0);
    });

    it('should identify manual_required status for critical issues', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('criticalProp', 'requirement_changed', false, 'HIGH')
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 1,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Manual action required']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.migrationStatus).toBe('manual_required');
      expect(guidance.confidence).not.toBe('HIGH');
    });

    it('should set partial status for some remaining issues', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('prop', 'added', true, 'LOW')
        ],
        autoMigratableCount: 1,
        manualRequiredCount: 0,
        overallSeverity: 'LOW',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Minor issue']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.migrationStatus).toBe('partial');
    });
  });

  describe('required actions generation', () => {
    it('should generate required actions for manual changes', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('newRequiredProp', 'added', false, 'HIGH')
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 1,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Add property']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.requiredActions).toHaveLength(1);
      expect(guidance.requiredActions[0].type).toBe('ADD_PROPERTY');
      expect(guidance.requiredActions[0].property).toBe('newRequiredProp');
      expect(guidance.requiredActions[0].priority).toBe('CRITICAL');
    });

    it('should map change types to action types correctly', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('addedProp', 'added', false, 'HIGH'),
          createMockChange('changedProp', 'requirement_changed', false, 'MEDIUM'),
          createMockChange('defaultProp', 'default_changed', false, 'LOW')
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 3,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Issues']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.requiredActions[0].type).toBe('ADD_PROPERTY');
      expect(guidance.requiredActions[1].type).toBe('UPDATE_PROPERTY');
      expect(guidance.requiredActions[2].type).toBe('CONFIGURE_OPTION');
    });

    it('should map severity to priority correctly', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('highProp', 'added', false, 'HIGH'),
          createMockChange('medProp', 'added', false, 'MEDIUM'),
          createMockChange('lowProp', 'added', false, 'LOW')
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 3,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Issues']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.requiredActions[0].priority).toBe('CRITICAL');
      expect(guidance.requiredActions[1].priority).toBe('MEDIUM');
      expect(guidance.requiredActions[2].priority).toBe('LOW');
    });
  });

  describe('deprecated properties identification', () => {
    it('should identify removed properties', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          {
            ...createMockChange('oldProp', 'removed', true),
            migrationStrategy: { type: 'remove_property' }
          }
        ],
        autoMigratableCount: 1,
        manualRequiredCount: 0,
        overallSeverity: 'MEDIUM',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.deprecatedProperties).toHaveLength(1);
      expect(guidance.deprecatedProperties[0].property).toBe('oldProp');
      expect(guidance.deprecatedProperties[0].status).toBe('removed');
      expect(guidance.deprecatedProperties[0].action).toBe('remove');
    });

    it('should mark breaking removals appropriately', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          {
            ...createMockChange('breakingProp', 'removed', false),
            isBreaking: true
          }
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 1,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Issue']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.deprecatedProperties[0].impact).toBe('breaking');
    });
  });

  describe('behavior changes documentation', () => {
    it('should document Execute Workflow v1.1 data passing changes', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'n8n-nodes-base.executeWorkflow',
        fromVersion: '1.0',
        toVersion: '1.1',
        hasBreakingChanges: true,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Execute Workflow',
        'n8n-nodes-base.executeWorkflow',
        '1.0',
        '1.1',
        migrationResult
      );

      expect(guidance.behaviorChanges).toHaveLength(1);
      expect(guidance.behaviorChanges[0].aspect).toContain('Data passing');
      expect(guidance.behaviorChanges[0].impact).toBe('HIGH');
      expect(guidance.behaviorChanges[0].actionRequired).toBe(true);
    });

    it('should document Webhook v2.1 persistence changes', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'n8n-nodes-base.webhook',
        fromVersion: '2.0',
        toVersion: '2.1',
        hasBreakingChanges: false,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'LOW',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Webhook',
        'n8n-nodes-base.webhook',
        '2.0',
        '2.1',
        migrationResult
      );

      const persistenceChange = guidance.behaviorChanges.find(c => c.aspect.includes('persistence'));
      expect(persistenceChange).toBeDefined();
      expect(persistenceChange?.impact).toBe('MEDIUM');
    });

    it('should document Webhook v2.0 response handling changes', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'n8n-nodes-base.webhook',
        fromVersion: '1.9',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'MEDIUM',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Webhook',
        'n8n-nodes-base.webhook',
        '1.9',
        '2.0',
        migrationResult
      );

      const responseChange = guidance.behaviorChanges.find(c => c.aspect.includes('Response'));
      expect(responseChange).toBeDefined();
      expect(responseChange?.actionRequired).toBe(true);
    });

    it('should not document behavior changes for other nodes', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: false,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'LOW',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'HTTP Request',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.behaviorChanges).toHaveLength(0);
    });
  });

  describe('migration steps generation', () => {
    it('should generate ordered migration steps', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          {
            ...createMockChange('removedProp', 'removed', true),
            migrationStrategy: { type: 'remove_property' }
          },
          createMockChange('criticalProp', 'added', false, 'HIGH'),
          createMockChange('mediumProp', 'added', false, 'MEDIUM')
        ],
        autoMigratableCount: 1,
        manualRequiredCount: 2,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Issues']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.migrationSteps.length).toBeGreaterThan(0);
      expect(guidance.migrationSteps[0]).toContain('deprecated');
      expect(guidance.migrationSteps.some(s => s.includes('critical'))).toBe(true);
      expect(guidance.migrationSteps.some(s => s.includes('Test workflow'))).toBe(true);
    });

    it('should include behavior change adaptation steps', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'n8n-nodes-base.executeWorkflow',
        fromVersion: '1.0',
        toVersion: '1.1',
        hasBreakingChanges: true,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Execute Workflow',
        'n8n-nodes-base.executeWorkflow',
        '1.0',
        '1.1',
        migrationResult
      );

      expect(guidance.migrationSteps.some(s => s.includes('behavior changes'))).toBe(true);
    });

    it('should always include final validation step', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: false,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'LOW',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.migrationSteps.some(s => s.includes('Test workflow'))).toBe(true);
    });
  });

  describe('confidence calculation', () => {
    it('should set HIGH confidence for complete migrations', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: false,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'LOW',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.confidence).toBe('HIGH');
    });

    it('should set MEDIUM confidence for partial migrations with few issues', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('prop', 'added', true, 'MEDIUM')
        ],
        autoMigratableCount: 1,
        manualRequiredCount: 0,
        overallSeverity: 'MEDIUM',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Minor issue']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.confidence).toBe('MEDIUM');
    });

    it('should set LOW confidence for manual_required with many critical actions', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('prop1', 'added', false, 'HIGH'),
          createMockChange('prop2', 'added', false, 'HIGH'),
          createMockChange('prop3', 'added', false, 'HIGH'),
          createMockChange('prop4', 'added', false, 'HIGH')
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 4,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Issues']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.confidence).toBe('LOW');
    });
  });

  describe('time estimation', () => {
    it('should estimate < 1 minute for simple migrations', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: false,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'LOW',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.estimatedTime).toBe('< 1 minute');
    });

    it('should estimate 2-5 minutes for few actions', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('prop1', 'added', false, 'HIGH'),
          createMockChange('prop2', 'added', false, 'MEDIUM')
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 2,
        overallSeverity: 'MEDIUM',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Issue']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      expect(guidance.estimatedTime).toMatch(/2-5|5-10/);
    });

    it('should estimate 20+ minutes for complex migrations', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'n8n-nodes-base.executeWorkflow',
        fromVersion: '1.0',
        toVersion: '1.1',
        hasBreakingChanges: true,
        changes: [
          createMockChange('prop1', 'added', false, 'HIGH'),
          createMockChange('prop2', 'added', false, 'HIGH'),
          createMockChange('prop3', 'added', false, 'HIGH'),
          createMockChange('prop4', 'added', false, 'HIGH'),
          createMockChange('prop5', 'added', false, 'HIGH')
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 5,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Issues']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Execute Workflow',
        'n8n-nodes-base.executeWorkflow',
        '1.0',
        '1.1',
        migrationResult
      );

      expect(guidance.estimatedTime).toContain('20+');
    });
  });

  describe('generateSummary', () => {
    it('should generate readable summary', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('prop1', 'added', false, 'HIGH'),
          createMockChange('prop2', 'added', false, 'MEDIUM')
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 2,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Issues']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      const summary = validator.generateSummary(guidance);

      expect(summary).toContain('Test Node');
      expect(summary).toContain('1.0');
      expect(summary).toContain('2.0');
      expect(summary).toContain('Required actions');
    });

    it('should limit actions displayed in summary', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          createMockChange('prop1', 'added', false, 'HIGH'),
          createMockChange('prop2', 'added', false, 'HIGH'),
          createMockChange('prop3', 'added', false, 'HIGH'),
          createMockChange('prop4', 'added', false, 'HIGH'),
          createMockChange('prop5', 'added', false, 'HIGH')
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 5,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(false, ['Issues']);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Test Node',
        'nodes-base.httpRequest',
        '1.0',
        '2.0',
        migrationResult
      );

      const summary = validator.generateSummary(guidance);

      expect(summary).toContain('and 2 more');
    });

    it('should include behavior changes in summary', async () => {
      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'n8n-nodes-base.webhook',
        fromVersion: '2.0',
        toVersion: '2.1',
        hasBreakingChanges: false,
        changes: [],
        autoMigratableCount: 0,
        manualRequiredCount: 0,
        overallSeverity: 'LOW',
        recommendations: []
      };

      mockBreakingChangeDetector.analyzeVersionUpgrade = vi.fn().mockResolvedValue(mockAnalysis);

      const migrationResult = createMockMigrationResult(true);

      const guidance = await validator.generateGuidance(
        'node-1',
        'Webhook',
        'n8n-nodes-base.webhook',
        '2.0',
        '2.1',
        migrationResult
      );

      const summary = validator.generateSummary(guidance);

      expect(summary).toContain('Behavior changes');
    });
  });
});

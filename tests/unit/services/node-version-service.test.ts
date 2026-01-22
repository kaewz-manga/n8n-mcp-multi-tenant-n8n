import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeVersionService, type NodeVersion, type VersionComparison } from '@/services/node-version-service';
import { NodeRepository } from '@/database/node-repository';
import { BreakingChangeDetector, type VersionUpgradeAnalysis } from '@/services/breaking-change-detector';

vi.mock('@/database/node-repository');
vi.mock('@/services/breaking-change-detector');

describe('NodeVersionService', () => {
  let service: NodeVersionService;
  let mockRepository: NodeRepository;
  let mockBreakingChangeDetector: BreakingChangeDetector;

  const createMockVersion = (version: string, isCurrentMax = false): NodeVersion => ({
    nodeType: 'nodes-base.httpRequest',
    version,
    packageName: 'n8n-nodes-base',
    displayName: 'HTTP Request',
    isCurrentMax,
    breakingChanges: [],
    deprecatedProperties: [],
    addedProperties: []
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = new NodeRepository({} as any);
    mockBreakingChangeDetector = new BreakingChangeDetector(mockRepository);
    service = new NodeVersionService(mockRepository, mockBreakingChangeDetector);
  });

  describe('getAvailableVersions', () => {
    it('should return versions from database', () => {
      const versions = [createMockVersion('1.0'), createMockVersion('2.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const result = service.getAvailableVersions('nodes-base.httpRequest');

      expect(result).toEqual(versions);
      expect(mockRepository.getNodeVersions).toHaveBeenCalledWith('nodes-base.httpRequest');
    });

    it('should cache results', () => {
      const versions = [createMockVersion('1.0')];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      service.getAvailableVersions('nodes-base.httpRequest');
      service.getAvailableVersions('nodes-base.httpRequest');

      expect(mockRepository.getNodeVersions).toHaveBeenCalledTimes(1);
    });

    it('should use cache within TTL', () => {
      const versions = [createMockVersion('1.0')];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const result1 = service.getAvailableVersions('nodes-base.httpRequest');
      const result2 = service.getAvailableVersions('nodes-base.httpRequest');

      expect(result1).toEqual(result2);
      expect(mockRepository.getNodeVersions).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache after TTL expiry', () => {
      vi.useFakeTimers();
      const versions = [createMockVersion('1.0')];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      service.getAvailableVersions('nodes-base.httpRequest');

      // Advance time beyond TTL (5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      service.getAvailableVersions('nodes-base.httpRequest');

      expect(mockRepository.getNodeVersions).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('getLatestVersion', () => {
    it('should return version marked as currentMax', () => {
      const versions = [
        createMockVersion('1.0'),
        createMockVersion('2.0', true),
        createMockVersion('1.5')
      ];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const result = service.getLatestVersion('nodes-base.httpRequest');

      expect(result).toBe('2.0');
    });

    it('should fallback to highest version if no currentMax', () => {
      const versions = [
        createMockVersion('1.0'),
        createMockVersion('2.0'),
        createMockVersion('1.5')
      ];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const result = service.getLatestVersion('nodes-base.httpRequest');

      expect(result).toBe('2.0');
    });

    it('should fallback to main nodes table if no versions', () => {
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue([]);
      vi.spyOn(mockRepository, 'getNode').mockReturnValue({
        nodeType: 'nodes-base.httpRequest',
        version: '1.0',
        packageName: 'n8n-nodes-base',
        displayName: 'HTTP Request'
      } as any);

      const result = service.getLatestVersion('nodes-base.httpRequest');

      expect(result).toBe('1.0');
    });

    it('should return null if no version data available', () => {
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue([]);
      vi.spyOn(mockRepository, 'getNode').mockReturnValue(null);

      const result = service.getLatestVersion('nodes-base.httpRequest');

      expect(result).toBeNull();
    });
  });

  describe('compareVersions', () => {
    it('should return -1 when first version is lower', () => {
      const result = service.compareVersions('1.0', '2.0');
      expect(result).toBe(-1);
    });

    it('should return 1 when first version is higher', () => {
      const result = service.compareVersions('2.0', '1.0');
      expect(result).toBe(1);
    });

    it('should return 0 when versions are equal', () => {
      const result = service.compareVersions('1.0', '1.0');
      expect(result).toBe(0);
    });

    it('should handle multi-part versions', () => {
      expect(service.compareVersions('1.2.3', '1.2.4')).toBe(-1);
      expect(service.compareVersions('2.0.0', '1.9.9')).toBe(1);
      expect(service.compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should handle versions with different lengths', () => {
      expect(service.compareVersions('1.0', '1.0.0')).toBe(0);
      expect(service.compareVersions('1.0', '1.0.1')).toBe(-1);
      expect(service.compareVersions('2', '1.9')).toBe(1);
    });
  });

  describe('analyzeVersion', () => {
    it('should return up-to-date status when on latest version', () => {
      const versions = [createMockVersion('1.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const result = service.analyzeVersion('nodes-base.httpRequest', '1.0');

      expect(result.isOutdated).toBe(false);
      expect(result.recommendUpgrade).toBe(false);
      expect(result.confidence).toBe('HIGH');
      expect(result.reason).toContain('already at the latest version');
    });

    it('should detect outdated version', () => {
      const versions = [createMockVersion('2.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);
      vi.spyOn(mockBreakingChangeDetector, 'hasBreakingChanges').mockReturnValue(false);

      const result = service.analyzeVersion('nodes-base.httpRequest', '1.0');

      expect(result.isOutdated).toBe(true);
      expect(result.latestVersion).toBe('2.0');
      expect(result.recommendUpgrade).toBe(true);
    });

    it('should calculate version gap', () => {
      const versions = [createMockVersion('3.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);
      vi.spyOn(mockBreakingChangeDetector, 'hasBreakingChanges').mockReturnValue(false);

      const result = service.analyzeVersion('nodes-base.httpRequest', '1.0');

      expect(result.versionGap).toBeGreaterThan(0);
    });

    it('should detect breaking changes and lower confidence', () => {
      const versions = [createMockVersion('2.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);
      vi.spyOn(mockBreakingChangeDetector, 'hasBreakingChanges').mockReturnValue(true);

      const result = service.analyzeVersion('nodes-base.httpRequest', '1.0');

      expect(result.hasBreakingChanges).toBe(true);
      expect(result.confidence).toBe('MEDIUM');
      expect(result.reason).toContain('breaking changes');
    });

    it('should lower confidence for large version gaps', () => {
      const versions = [createMockVersion('10.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);
      vi.spyOn(mockBreakingChangeDetector, 'hasBreakingChanges').mockReturnValue(false);

      const result = service.analyzeVersion('nodes-base.httpRequest', '1.0');

      expect(result.confidence).toBe('LOW');
      expect(result.reason).toContain('Version gap is large');
    });

    it('should handle missing version information', () => {
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue([]);
      vi.spyOn(mockRepository, 'getNode').mockReturnValue(null);

      const result = service.analyzeVersion('nodes-base.httpRequest', '1.0');

      expect(result.isOutdated).toBe(false);
      expect(result.confidence).toBe('HIGH');
      expect(result.reason).toContain('No version information available');
    });
  });

  describe('suggestUpgradePath', () => {
    it('should return null when already on latest version', async () => {
      const versions = [createMockVersion('1.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const result = await service.suggestUpgradePath('nodes-base.httpRequest', '1.0');

      expect(result).toBeNull();
    });

    it('should return null when no version information available', async () => {
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue([]);
      vi.spyOn(mockRepository, 'getNode').mockReturnValue(null);

      const result = await service.suggestUpgradePath('nodes-base.httpRequest', '1.0');

      expect(result).toBeNull();
    });

    it('should suggest direct upgrade for simple cases', async () => {
      const versions = [createMockVersion('2.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

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
      vi.spyOn(mockBreakingChangeDetector, 'analyzeVersionUpgrade').mockResolvedValue(mockAnalysis);

      const result = await service.suggestUpgradePath('nodes-base.httpRequest', '1.0');

      expect(result).not.toBeNull();
      expect(result!.direct).toBe(true);
      expect(result!.steps).toHaveLength(1);
      expect(result!.steps[0].fromVersion).toBe('1.0');
      expect(result!.steps[0].toVersion).toBe('2.0');
    });

    it('should suggest multi-step upgrade for complex cases', async () => {
      const versions = [
        createMockVersion('1.0'),
        createMockVersion('1.5'),
        createMockVersion('2.0', true)
      ];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [
          { isBreaking: true, autoMigratable: false } as any,
          { isBreaking: true, autoMigratable: false } as any,
          { isBreaking: true, autoMigratable: false } as any
        ],
        autoMigratableCount: 0,
        manualRequiredCount: 3,
        overallSeverity: 'HIGH',
        recommendations: []
      };

      vi.spyOn(mockBreakingChangeDetector, 'analyzeVersionUpgrade').mockResolvedValue(mockAnalysis);

      const result = await service.suggestUpgradePath('nodes-base.httpRequest', '1.0');

      expect(result).not.toBeNull();
      expect(result!.intermediateVersions).toContain('1.5');
    });

    it('should calculate estimated effort correctly', async () => {
      const versions = [createMockVersion('2.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const mockAnalysisLow: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: false,
        changes: [{ isBreaking: false, autoMigratable: true } as any],
        autoMigratableCount: 1,
        manualRequiredCount: 0,
        overallSeverity: 'LOW',
        recommendations: []
      };
      vi.spyOn(mockBreakingChangeDetector, 'analyzeVersionUpgrade').mockResolvedValue(mockAnalysisLow);

      const result = await service.suggestUpgradePath('nodes-base.httpRequest', '1.0');

      expect(result!.estimatedEffort).toBe('LOW');
    });

    it('should estimate HIGH effort for many breaking changes', async () => {
      const versions = [createMockVersion('2.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const mockAnalysisHigh: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: Array(7).fill({ isBreaking: true, autoMigratable: false }),
        autoMigratableCount: 0,
        manualRequiredCount: 7,
        overallSeverity: 'HIGH',
        recommendations: []
      };
      vi.spyOn(mockBreakingChangeDetector, 'analyzeVersionUpgrade').mockResolvedValue(mockAnalysisHigh);

      const result = await service.suggestUpgradePath('nodes-base.httpRequest', '1.0');

      expect(result!.estimatedEffort).toBe('HIGH');
      expect(result!.totalBreakingChanges).toBeGreaterThan(5);
    });

    it('should include migration hints in steps', async () => {
      const versions = [createMockVersion('2.0', true)];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const mockAnalysis: VersionUpgradeAnalysis = {
        nodeType: 'nodes-base.httpRequest',
        fromVersion: '1.0',
        toVersion: '2.0',
        hasBreakingChanges: true,
        changes: [{ isBreaking: true, autoMigratable: false } as any],
        autoMigratableCount: 0,
        manualRequiredCount: 1,
        overallSeverity: 'MEDIUM',
        recommendations: ['Review property changes']
      };
      vi.spyOn(mockBreakingChangeDetector, 'analyzeVersionUpgrade').mockResolvedValue(mockAnalysis);

      const result = await service.suggestUpgradePath('nodes-base.httpRequest', '1.0');

      expect(result!.steps[0].migrationHints).toContain('Review property changes');
    });
  });

  describe('versionExists', () => {
    it('should return true if version exists', () => {
      const versions = [createMockVersion('1.0'), createMockVersion('2.0')];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const result = service.versionExists('nodes-base.httpRequest', '1.0');

      expect(result).toBe(true);
    });

    it('should return false if version does not exist', () => {
      const versions = [createMockVersion('1.0')];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      const result = service.versionExists('nodes-base.httpRequest', '2.0');

      expect(result).toBe(false);
    });
  });

  describe('getVersionMetadata', () => {
    it('should return version metadata', () => {
      const version = createMockVersion('1.0');
      vi.spyOn(mockRepository, 'getNodeVersion').mockReturnValue(version);

      const result = service.getVersionMetadata('nodes-base.httpRequest', '1.0');

      expect(result).toEqual(version);
    });

    it('should return null if version not found', () => {
      vi.spyOn(mockRepository, 'getNodeVersion').mockReturnValue(null);

      const result = service.getVersionMetadata('nodes-base.httpRequest', '99.0');

      expect(result).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific node type', () => {
      const versions = [createMockVersion('1.0')];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      service.getAvailableVersions('nodes-base.httpRequest');
      service.clearCache('nodes-base.httpRequest');
      service.getAvailableVersions('nodes-base.httpRequest');

      expect(mockRepository.getNodeVersions).toHaveBeenCalledTimes(2);
    });

    it('should clear entire cache when no node type specified', () => {
      const versions = [createMockVersion('1.0')];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      service.getAvailableVersions('nodes-base.httpRequest');
      service.getAvailableVersions('nodes-base.webhook');

      service.clearCache();

      service.getAvailableVersions('nodes-base.httpRequest');
      service.getAvailableVersions('nodes-base.webhook');

      expect(mockRepository.getNodeVersions).toHaveBeenCalledTimes(4);
    });
  });

  describe('cache management', () => {
    it('should cache different node types separately', () => {
      const httpVersions = [createMockVersion('1.0')];
      const webhookVersions = [createMockVersion('2.0')];

      vi.spyOn(mockRepository, 'getNodeVersions')
        .mockReturnValueOnce(httpVersions)
        .mockReturnValueOnce(webhookVersions);

      const result1 = service.getAvailableVersions('nodes-base.httpRequest');
      const result2 = service.getAvailableVersions('nodes-base.webhook');

      expect(result1).toEqual(httpVersions);
      expect(result2).toEqual(webhookVersions);
      expect(mockRepository.getNodeVersions).toHaveBeenCalledTimes(2);
    });

    it('should not use cache after clearing', () => {
      const versions = [createMockVersion('1.0')];
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue(versions);

      service.getAvailableVersions('nodes-base.httpRequest');
      expect(mockRepository.getNodeVersions).toHaveBeenCalledTimes(1);

      service.clearCache('nodes-base.httpRequest');
      service.getAvailableVersions('nodes-base.httpRequest');

      expect(mockRepository.getNodeVersions).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty version arrays', () => {
      vi.spyOn(mockRepository, 'getNodeVersions').mockReturnValue([]);
      vi.spyOn(mockRepository, 'getNode').mockReturnValue(null);

      const result = service.getLatestVersion('nodes-base.httpRequest');

      expect(result).toBeNull();
    });

    it('should handle version comparison with zero parts', () => {
      const result = service.compareVersions('0.0.0', '0.0.1');

      expect(result).toBe(-1);
    });

    it('should handle single digit versions', () => {
      const result = service.compareVersions('1', '2');

      expect(result).toBe(-1);
    });
  });
});

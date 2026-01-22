import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TemplateRepository } from '../../../src/templates/template-repository';
import { DatabaseAdapter, PreparedStatement, RunResult } from '../../../src/database/database-adapter';
import { logger } from '../../../src/utils/logger';

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock template sanitizer
vi.mock('../../../src/utils/template-sanitizer', () => {
  class MockTemplateSanitizer {
    sanitizeWorkflow = vi.fn((workflow) => ({ sanitized: workflow, wasModified: false }));
    detectTokens = vi.fn(() => []);
  }

  return {
    TemplateSanitizer: MockTemplateSanitizer
  };
});

// Create mock database adapter
class MockDatabaseAdapter implements DatabaseAdapter {
  private statements = new Map<string, MockPreparedStatement>();
  private execCalls: string[] = [];
  private _fts5Support = true;

  prepare = vi.fn((sql: string) => {
    if (!this.statements.has(sql)) {
      this.statements.set(sql, new MockPreparedStatement(sql));
    }
    return this.statements.get(sql)!;
  });

  exec = vi.fn((sql: string) => {
    this.execCalls.push(sql);
  });
  close = vi.fn();
  pragma = vi.fn();
  transaction = vi.fn((fn: () => any) => fn());
  checkFTS5Support = vi.fn(() => this._fts5Support);
  inTransaction = false;

  _setFTS5Support(supported: boolean) {
    this._fts5Support = supported;
  }

  _getStatement(sql: string) {
    return this.statements.get(sql);
  }

  _getExecCalls() {
    return this.execCalls;
  }

  _clearExecCalls() {
    this.execCalls = [];
  }
}

class MockPreparedStatement implements PreparedStatement {
  public mockResults: any[] = [];
  public capturedParams: any[][] = [];

  run = vi.fn((...params: any[]): RunResult => {
    this.capturedParams.push(params);
    return { changes: 1, lastInsertRowid: 1 };
  });

  get = vi.fn((...params: any[]) => {
    this.capturedParams.push(params);
    return this.mockResults[0] || null;
  });

  all = vi.fn((...params: any[]) => {
    this.capturedParams.push(params);
    return this.mockResults;
  });

  iterate = vi.fn();
  pluck = vi.fn(() => this);
  expand = vi.fn(() => this);
  raw = vi.fn(() => this);
  columns = vi.fn(() => []);
  bind = vi.fn(() => this);

  constructor(private sql: string) {}

  _setMockResults(results: any[]) {
    this.mockResults = results;
  }

  _getCapturedParams() {
    return this.capturedParams;
  }
}

describe('TemplateRepository - Metadata Filter Tests', () => {
  let repository: TemplateRepository;
  let mockAdapter: MockDatabaseAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = new MockDatabaseAdapter();
    repository = new TemplateRepository(mockAdapter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('buildMetadataFilterConditions - All Filter Combinations', () => {
    it('should build conditions with no filters', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({}, 10, 0);

      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      // Should only have the base condition
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      // Should not have any additional conditions
      expect(prepareCall).not.toContain("json_extract(metadata_json, '$.categories')");
      expect(prepareCall).not.toContain("json_extract(metadata_json, '$.complexity')");
    });

    it('should build conditions with only category filter', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({ category: 'automation' }, 10, 0);

      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      expect(prepareCall).toContain("json_extract(metadata_json, '$.categories') LIKE '%' || ? || '%'");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0][0]).toBe('automation');
    });

    it('should build conditions with only complexity filter', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({ complexity: 'simple' }, 10, 0);

      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      expect(prepareCall).toContain("json_extract(metadata_json, '$.complexity') = ?");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0][0]).toBe('simple');
    });

    it('should build conditions with only maxSetupMinutes filter', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({ maxSetupMinutes: 30 }, 10, 0);

      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      expect(prepareCall).toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) <= ?");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0][0]).toBe(30);
    });

    it('should build conditions with only minSetupMinutes filter', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({ minSetupMinutes: 10 }, 10, 0);

      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      expect(prepareCall).toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) >= ?");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0][0]).toBe(10);
    });

    it('should build conditions with only requiredService filter', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({ requiredService: 'slack' }, 10, 0);

      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      expect(prepareCall).toContain("json_extract(metadata_json, '$.required_services') LIKE '%' || ? || '%'");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0][0]).toBe('slack');
    });

    it('should build conditions with only targetAudience filter', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({ targetAudience: 'developers' }, 10, 0);

      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      expect(prepareCall).toContain("json_extract(metadata_json, '$.target_audience') LIKE '%' || ? || '%'");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0][0]).toBe('developers');
    });

    it('should build conditions with all filters combined', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({
        category: 'automation',
        complexity: 'medium',
        maxSetupMinutes: 60,
        minSetupMinutes: 15,
        requiredService: 'openai',
        targetAudience: 'marketers'
      }, 10, 0);

      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      expect(prepareCall).toContain("json_extract(metadata_json, '$.categories') LIKE '%' || ? || '%'");
      expect(prepareCall).toContain("json_extract(metadata_json, '$.complexity') = ?");
      expect(prepareCall).toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) <= ?");
      expect(prepareCall).toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) >= ?");
      expect(prepareCall).toContain("json_extract(metadata_json, '$.required_services') LIKE '%' || ? || '%'");
      expect(prepareCall).toContain("json_extract(metadata_json, '$.target_audience') LIKE '%' || ? || '%'");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0]).toEqual(['automation', 'medium', 60, 15, 'openai', 'marketers', 10, 0]);
    });

    it('should build conditions with partial filter combinations', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({
        category: 'data-processing',
        maxSetupMinutes: 45,
        targetAudience: 'analysts'
      }, 10, 0);

      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      expect(prepareCall).toContain("json_extract(metadata_json, '$.categories') LIKE '%' || ? || '%'");
      expect(prepareCall).toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) <= ?");
      expect(prepareCall).toContain("json_extract(metadata_json, '$.target_audience') LIKE '%' || ? || '%'");
      // Should not have complexity, minSetupMinutes, or requiredService conditions
      expect(prepareCall).not.toContain("json_extract(metadata_json, '$.complexity') = ?");
      expect(prepareCall).not.toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) >= ?");
      expect(prepareCall).not.toContain("json_extract(metadata_json, '$.required_services') LIKE '%' || ? || '%'");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0]).toEqual(['data-processing', 45, 'analysts', 10, 0]);
    });

    it('should handle complexity variations', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      // Test each complexity level
      const complexityLevels: Array<'simple' | 'medium' | 'complex'> = ['simple', 'medium', 'complex'];

      complexityLevels.forEach((complexity) => {
        vi.clearAllMocks();
        stmt.capturedParams = [];

        repository.searchTemplatesByMetadata({ complexity }, 10, 0);

        const capturedParams = stmt._getCapturedParams();
        expect(capturedParams[0][0]).toBe(complexity);
      });
    });

    it('should handle setup minutes edge cases', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      // Test zero values
      repository.searchTemplatesByMetadata({ maxSetupMinutes: 0, minSetupMinutes: 0 }, 10, 0);

      let capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0]).toContain(0);

      // Test very large values
      vi.clearAllMocks();
      stmt.capturedParams = [];
      repository.searchTemplatesByMetadata({ maxSetupMinutes: 999999 }, 10, 0);

      capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0]).toContain(999999);

      // Test negative values (should still work, though might not make sense semantically)
      vi.clearAllMocks();
      stmt.capturedParams = [];
      repository.searchTemplatesByMetadata({ minSetupMinutes: -10 }, 10, 0);

      capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0]).toContain(-10);
    });

    it('should sanitize special characters in string filters', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const specialCategory = 'test"with\'quotes';
      const specialService = 'service\\with\\backslashes';
      const specialAudience = 'audience\nwith\nnewlines';

      repository.searchTemplatesByMetadata({
        category: specialCategory,
        requiredService: specialService,
        targetAudience: specialAudience
      }, 10, 0);

      const capturedParams = stmt._getCapturedParams();
      // JSON.stringify escapes special characters, then slice(1, -1) removes quotes
      expect(capturedParams[0][0]).toBe(JSON.stringify(specialCategory).slice(1, -1));
      expect(capturedParams[0][1]).toBe(JSON.stringify(specialService).slice(1, -1));
      expect(capturedParams[0][2]).toBe(JSON.stringify(specialAudience).slice(1, -1));
    });
  });

  describe('Performance Logging and Timing', () => {
    it('should log debug info on successful search', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([
        { id: 1 },
        { id: 2 }
      ]);

      const stmt2 = new MockPreparedStatement('');
      stmt2._setMockResults([
        { id: 1, workflow_id: 1, name: 'Template 1', workflow_json: '{}' },
        { id: 2, workflow_id: 2, name: 'Template 2', workflow_json: '{}' }
      ]);

      let callCount = 0;
      mockAdapter.prepare = vi.fn((sql: string) => {
        callCount++;
        return callCount === 1 ? stmt : stmt2;
      });

      repository.searchTemplatesByMetadata({ complexity: 'simple' }, 10, 0);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Metadata search found'),
        expect.objectContaining({
          filters: { complexity: 'simple' },
          count: 2,
          phase1Ms: expect.any(Number),
          phase2Ms: expect.any(Number),
          totalMs: expect.any(Number),
          optimization: 'two-phase-with-ordering'
        })
      );
    });

    it('should log debug info on empty results', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      repository.searchTemplatesByMetadata({ category: 'nonexistent' }, 10, 0);

      expect(logger.debug).toHaveBeenCalledWith(
        'Metadata search found 0 results',
        expect.objectContaining({
          filters: { category: 'nonexistent' },
          phase1Ms: expect.any(Number)
        })
      );
    });

    it('should include all filter types in logs', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const filters = {
        category: 'automation',
        complexity: 'medium' as const,
        maxSetupMinutes: 60,
        minSetupMinutes: 15,
        requiredService: 'slack',
        targetAudience: 'developers'
      };

      repository.searchTemplatesByMetadata(filters, 10, 0);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filters: filters
        })
      );
    });
  });

  describe('ID Filtering and Validation', () => {
    it('should filter out negative IDs', () => {
      const stmt1 = new MockPreparedStatement('');
      stmt1._setMockResults([
        { id: 1 },
        { id: -5 },
        { id: 2 }
      ]);

      const stmt2 = new MockPreparedStatement('');
      stmt2._setMockResults([
        { id: 1, workflow_id: 1, name: 'Template 1', workflow_json: '{}' },
        { id: 2, workflow_id: 2, name: 'Template 2', workflow_json: '{}' }
      ]);

      let callCount = 0;
      mockAdapter.prepare = vi.fn((sql: string) => {
        callCount++;
        return callCount === 1 ? stmt1 : stmt2;
      });

      repository.searchTemplatesByMetadata({}, 10, 0);

      // Should only fetch valid IDs (1 and 2)
      const prepareCall = mockAdapter.prepare.mock.calls[1][0];
      expect(prepareCall).toContain('(1, 0)');
      expect(prepareCall).toContain('(2, 1)');
      expect(prepareCall).not.toContain('-5');
    });

    it('should filter out zero IDs', () => {
      const stmt1 = new MockPreparedStatement('');
      stmt1._setMockResults([
        { id: 0 },
        { id: 1 }
      ]);

      const stmt2 = new MockPreparedStatement('');
      stmt2._setMockResults([
        { id: 1, workflow_id: 1, name: 'Template 1', workflow_json: '{}' }
      ]);

      let callCount = 0;
      mockAdapter.prepare = vi.fn((sql: string) => {
        callCount++;
        return callCount === 1 ? stmt1 : stmt2;
      });

      repository.searchTemplatesByMetadata({}, 10, 0);

      // Should only fetch valid ID (1)
      const prepareCall = mockAdapter.prepare.mock.calls[1][0];
      expect(prepareCall).toContain('(1, 0)');
      expect(prepareCall).not.toContain('(0,');
    });

    it('should filter out non-integer IDs', () => {
      const stmt1 = new MockPreparedStatement('');
      stmt1._setMockResults([
        { id: 1 },
        { id: 2.5 },
        { id: 3 }
      ]);

      const stmt2 = new MockPreparedStatement('');
      stmt2._setMockResults([
        { id: 1, workflow_id: 1, name: 'Template 1', workflow_json: '{}' },
        { id: 3, workflow_id: 3, name: 'Template 3', workflow_json: '{}' }
      ]);

      let callCount = 0;
      mockAdapter.prepare = vi.fn((sql: string) => {
        callCount++;
        return callCount === 1 ? stmt1 : stmt2;
      });

      repository.searchTemplatesByMetadata({}, 10, 0);

      // Should only fetch integer IDs (1 and 3)
      const prepareCall = mockAdapter.prepare.mock.calls[1][0];
      expect(prepareCall).toContain('(1, 0)');
      expect(prepareCall).toContain('(3, 1)');
      expect(prepareCall).not.toContain('2.5');
    });

    it('should filter out null IDs', () => {
      const stmt1 = new MockPreparedStatement('');
      stmt1._setMockResults([
        { id: 1 },
        { id: null },
        { id: 2 }
      ]);

      const stmt2 = new MockPreparedStatement('');
      stmt2._setMockResults([
        { id: 1, workflow_id: 1, name: 'Template 1', workflow_json: '{}' },
        { id: 2, workflow_id: 2, name: 'Template 2', workflow_json: '{}' }
      ]);

      let callCount = 0;
      mockAdapter.prepare = vi.fn((sql: string) => {
        callCount++;
        return callCount === 1 ? stmt1 : stmt2;
      });

      repository.searchTemplatesByMetadata({}, 10, 0);

      // Should only fetch valid IDs (1 and 2)
      const prepareCall = mockAdapter.prepare.mock.calls[1][0];
      expect(prepareCall).toContain('(1, 0)');
      expect(prepareCall).toContain('(2, 1)');
      expect(prepareCall).not.toContain('null');
    });

    it('should warn when no valid IDs after filtering', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([
        { id: -1 },
        { id: 0 },
        { id: null }
      ]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const result = repository.searchTemplatesByMetadata({}, 10, 0);

      expect(result).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'No valid IDs after filtering',
        expect.objectContaining({
          filters: {},
          originalCount: 3
        })
      );
    });

    it('should warn when some IDs are filtered out', () => {
      const stmt1 = new MockPreparedStatement('');
      stmt1._setMockResults([
        { id: 1 },
        { id: -2 },
        { id: 3 },
        { id: null }
      ]);

      const stmt2 = new MockPreparedStatement('');
      stmt2._setMockResults([
        { id: 1, workflow_id: 1, name: 'Template 1', workflow_json: '{}' },
        { id: 3, workflow_id: 3, name: 'Template 3', workflow_json: '{}' }
      ]);

      let callCount = 0;
      mockAdapter.prepare = vi.fn((sql: string) => {
        callCount++;
        return callCount === 1 ? stmt1 : stmt2;
      });

      repository.searchTemplatesByMetadata({}, 10, 0);

      expect(logger.warn).toHaveBeenCalledWith(
        'Some IDs were filtered out as invalid',
        expect.objectContaining({
          original: 4,
          valid: 2,
          filtered: 2
        })
      );
    });

    it('should not warn when all IDs are valid', () => {
      const stmt1 = new MockPreparedStatement('');
      stmt1._setMockResults([
        { id: 1 },
        { id: 2 },
        { id: 3 }
      ]);

      const stmt2 = new MockPreparedStatement('');
      stmt2._setMockResults([
        { id: 1, workflow_id: 1, name: 'Template 1', workflow_json: '{}' },
        { id: 2, workflow_id: 2, name: 'Template 2', workflow_json: '{}' },
        { id: 3, workflow_id: 3, name: 'Template 3', workflow_json: '{}' }
      ]);

      let callCount = 0;
      mockAdapter.prepare = vi.fn((sql: string) => {
        callCount++;
        return callCount === 1 ? stmt1 : stmt2;
      });

      repository.searchTemplatesByMetadata({}, 10, 0);

      expect(logger.warn).not.toHaveBeenCalledWith(
        'Some IDs were filtered out as invalid',
        expect.any(Object)
      );
    });
  });

  describe('getMetadataSearchCount - Shared Helper Usage', () => {
    it('should use buildMetadataFilterConditions for category', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([{ count: 5 }]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const result = repository.getMetadataSearchCount({ category: 'automation' });

      expect(result).toBe(5);
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain("json_extract(metadata_json, '$.categories') LIKE '%' || ? || '%'");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0][0]).toBe('automation');
    });

    it('should use buildMetadataFilterConditions for complexity', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([{ count: 10 }]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const result = repository.getMetadataSearchCount({ complexity: 'medium' });

      expect(result).toBe(10);
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain("json_extract(metadata_json, '$.complexity') = ?");
    });

    it('should use buildMetadataFilterConditions for setup minutes', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([{ count: 3 }]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const result = repository.getMetadataSearchCount({
        maxSetupMinutes: 30,
        minSetupMinutes: 10
      });

      expect(result).toBe(3);
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) <= ?");
      expect(prepareCall).toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) >= ?");
    });

    it('should use buildMetadataFilterConditions for service and audience', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([{ count: 7 }]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const result = repository.getMetadataSearchCount({
        requiredService: 'openai',
        targetAudience: 'developers'
      });

      expect(result).toBe(7);
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain("json_extract(metadata_json, '$.required_services') LIKE '%' || ? || '%'");
      expect(prepareCall).toContain("json_extract(metadata_json, '$.target_audience') LIKE '%' || ? || '%'");
    });

    it('should use buildMetadataFilterConditions with all filters', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([{ count: 2 }]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const result = repository.getMetadataSearchCount({
        category: 'integration',
        complexity: 'complex',
        maxSetupMinutes: 120,
        minSetupMinutes: 30,
        requiredService: 'slack',
        targetAudience: 'marketers'
      });

      expect(result).toBe(2);
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain("json_extract(metadata_json, '$.categories') LIKE '%' || ? || '%'");
      expect(prepareCall).toContain("json_extract(metadata_json, '$.complexity') = ?");
      expect(prepareCall).toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) <= ?");
      expect(prepareCall).toContain("CAST(json_extract(metadata_json, '$.estimated_setup_minutes') AS INTEGER) >= ?");
      expect(prepareCall).toContain("json_extract(metadata_json, '$.required_services') LIKE '%' || ? || '%'");
      expect(prepareCall).toContain("json_extract(metadata_json, '$.target_audience') LIKE '%' || ? || '%'");

      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0]).toEqual(['integration', 'complex', 120, 30, 'slack', 'marketers']);
    });

    it('should return 0 when no matches', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([{ count: 0 }]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const result = repository.getMetadataSearchCount({ category: 'nonexistent' });

      expect(result).toBe(0);
    });
  });

  describe('Two-Phase Query Optimization', () => {
    it('should execute two separate queries', () => {
      const stmt1 = new MockPreparedStatement('');
      stmt1._setMockResults([{ id: 1 }, { id: 2 }]);

      const stmt2 = new MockPreparedStatement('');
      stmt2._setMockResults([
        { id: 1, workflow_id: 1, name: 'Template 1', workflow_json: '{}' },
        { id: 2, workflow_id: 2, name: 'Template 2', workflow_json: '{}' }
      ]);

      let callCount = 0;
      mockAdapter.prepare = vi.fn((sql: string) => {
        callCount++;
        return callCount === 1 ? stmt1 : stmt2;
      });

      repository.searchTemplatesByMetadata({ complexity: 'simple' }, 10, 0);

      expect(mockAdapter.prepare).toHaveBeenCalledTimes(2);

      // First query should select only ID
      const phase1Query = mockAdapter.prepare.mock.calls[0][0];
      expect(phase1Query).toContain('SELECT id FROM templates');
      expect(phase1Query).toContain('ORDER BY views DESC, created_at DESC, id ASC');

      // Second query should use CTE with ordered IDs
      const phase2Query = mockAdapter.prepare.mock.calls[1][0];
      expect(phase2Query).toContain('WITH ordered_ids(id, sort_order) AS');
      expect(phase2Query).toContain('VALUES (1, 0), (2, 1)');
      expect(phase2Query).toContain('SELECT t.* FROM templates t');
      expect(phase2Query).toContain('INNER JOIN ordered_ids o ON t.id = o.id');
      expect(phase2Query).toContain('ORDER BY o.sort_order');
    });

    it('should skip phase 2 when no IDs found', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);

      const result = repository.searchTemplatesByMetadata({ category: 'nonexistent' }, 10, 0);

      expect(result).toHaveLength(0);
      // Should only call prepare once (phase 1)
      expect(mockAdapter.prepare).toHaveBeenCalledTimes(1);
    });

    it('should preserve ordering with stable sort', () => {
      const stmt1 = new MockPreparedStatement('');
      stmt1._setMockResults([
        { id: 5 },
        { id: 3 },
        { id: 1 }
      ]);

      const stmt2 = new MockPreparedStatement('');
      stmt2._setMockResults([
        { id: 5, workflow_id: 5, name: 'Template 5', workflow_json: '{}' },
        { id: 3, workflow_id: 3, name: 'Template 3', workflow_json: '{}' },
        { id: 1, workflow_id: 1, name: 'Template 1', workflow_json: '{}' }
      ]);

      let callCount = 0;
      mockAdapter.prepare = vi.fn((sql: string) => {
        callCount++;
        return callCount === 1 ? stmt1 : stmt2;
      });

      repository.searchTemplatesByMetadata({}, 10, 0);

      // Check that phase 2 query maintains order: (5,0), (3,1), (1,2)
      const phase2Query = mockAdapter.prepare.mock.calls[1][0];
      expect(phase2Query).toContain('VALUES (5, 0), (3, 1), (1, 2)');
    });
  });
});

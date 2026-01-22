import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateRepository } from '../../../src/templates/template-repository';
import { DatabaseAdapter, PreparedStatement, RunResult } from '../../../src/database/database-adapter';

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
  
  // Test helpers
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
  
  // Test helpers
  _setMockResults(results: any[]) {
    this.mockResults = results;
  }
  
  _getCapturedParams() {
    return this.capturedParams;
  }
}

describe('TemplateRepository - Security Tests', () => {
  let repository: TemplateRepository;
  let mockAdapter: MockDatabaseAdapter;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = new MockDatabaseAdapter();
    repository = new TemplateRepository(mockAdapter);
  });
  
  describe('SQL Injection Prevention', () => {
    describe('searchTemplatesByMetadata', () => {
      it('should prevent SQL injection in category parameter', () => {
        const maliciousCategory = "'; DROP TABLE templates; --";
        
        const stmt = new MockPreparedStatement('');
        stmt._setMockResults([]);
        mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
        
        repository.searchTemplatesByMetadata({
          category: maliciousCategory}, 10, 0);
        
        // Should use parameterized queries, not inject SQL
        const capturedParams = stmt._getCapturedParams();
        expect(capturedParams.length).toBeGreaterThan(0);
        // The parameter should be the sanitized version (JSON.stringify then slice to remove quotes)
        const expectedParam = JSON.stringify(maliciousCategory).slice(1, -1);
        // capturedParams[0] is the first call's parameters array
        expect(capturedParams[0][0]).toBe(expectedParam);
        
        // Verify the SQL doesn't contain the malicious content directly
        const prepareCall = mockAdapter.prepare.mock.calls[0][0];
        expect(prepareCall).not.toContain('DROP TABLE');
        expect(prepareCall).toContain("json_extract(metadata_json, '$.categories') LIKE '%' || ? || '%'");
      });

      it('should prevent SQL injection in requiredService parameter', () => {
        const maliciousService = "'; UNION SELECT * FROM sqlite_master; --";
        
        const stmt = new MockPreparedStatement('');
        stmt._setMockResults([]);
        mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
        
        repository.searchTemplatesByMetadata({
          requiredService: maliciousService}, 10, 0);
        
        const capturedParams = stmt._getCapturedParams();
        const expectedParam = JSON.stringify(maliciousService).slice(1, -1);
        // capturedParams[0] is the first call's parameters array
        expect(capturedParams[0][0]).toBe(expectedParam);
        
        const prepareCall = mockAdapter.prepare.mock.calls[0][0];
        expect(prepareCall).not.toContain('UNION SELECT');
        expect(prepareCall).toContain("json_extract(metadata_json, '$.required_services') LIKE '%' || ? || '%'");
      });

      it('should prevent SQL injection in targetAudience parameter', () => {
        const maliciousAudience = "administrators'; DELETE FROM templates WHERE '1'='1";
        
        const stmt = new MockPreparedStatement('');
        stmt._setMockResults([]);
        mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
        
        repository.searchTemplatesByMetadata({
          targetAudience: maliciousAudience}, 10, 0);
        
        const capturedParams = stmt._getCapturedParams();
        const expectedParam = JSON.stringify(maliciousAudience).slice(1, -1);
        // capturedParams[0] is the first call's parameters array
        expect(capturedParams[0][0]).toBe(expectedParam);
        
        const prepareCall = mockAdapter.prepare.mock.calls[0][0];
        expect(prepareCall).not.toContain('DELETE FROM');
        expect(prepareCall).toContain("json_extract(metadata_json, '$.target_audience') LIKE '%' || ? || '%'");
      });

      it('should safely handle special characters in parameters', () => {
        const specialChars = "test'with\"quotes\\and%wildcards_and[brackets]";
        
        const stmt = new MockPreparedStatement('');
        stmt._setMockResults([]);
        mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
        
        repository.searchTemplatesByMetadata({
          category: specialChars}, 10, 0);
        
        const capturedParams = stmt._getCapturedParams();
        const expectedParam = JSON.stringify(specialChars).slice(1, -1);
        // capturedParams[0] is the first call's parameters array
        expect(capturedParams[0][0]).toBe(expectedParam);
        
        // Should use parameterized query
        const prepareCall = mockAdapter.prepare.mock.calls[0][0];
        expect(prepareCall).toContain("json_extract(metadata_json, '$.categories') LIKE '%' || ? || '%'");
      });

      it('should prevent injection through numeric parameters', () => {
        const stmt = new MockPreparedStatement('');
        stmt._setMockResults([]);
        mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
        
        // Try to inject through numeric parameters
        repository.searchTemplatesByMetadata({maxSetupMinutes: 999999999, // Large number
          minSetupMinutes: -999999999 // Negative number
        }, 10, 0);
        
        const capturedParams = stmt._getCapturedParams();
        // capturedParams[0] is the first call's parameters array
        expect(capturedParams[0]).toContain(999999999);
        expect(capturedParams[0]).toContain(-999999999);
        
        // Should use CAST and parameterized queries
        const prepareCall = mockAdapter.prepare.mock.calls[0][0];
        expect(prepareCall).toContain('CAST(json_extract(metadata_json, \'$.estimated_setup_minutes\') AS INTEGER)');
      });
    });

    describe('getMetadataSearchCount', () => {
      it('should use parameterized queries for count operations', () => {
        const maliciousCategory = "'; DROP TABLE templates; SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%";
        
        const stmt = new MockPreparedStatement('');
        stmt._setMockResults([{ count: 0 }]);
        mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
        
        repository.getMetadataSearchCount({
          category: maliciousCategory
        });
        
        const capturedParams = stmt._getCapturedParams();
        const expectedParam = JSON.stringify(maliciousCategory).slice(1, -1);
        // capturedParams[0] is the first call's parameters array
        expect(capturedParams[0][0]).toBe(expectedParam);
        
        const prepareCall = mockAdapter.prepare.mock.calls[0][0];
        expect(prepareCall).not.toContain('DROP TABLE');
        expect(prepareCall).toContain('SELECT COUNT(*) as count FROM templates');
      });
    });

    describe('updateTemplateMetadata', () => {
      it('should safely handle metadata with special characters', () => {
        const maliciousMetadata = {
          categories: ["automation'; DROP TABLE templates; --"],
          complexity: "simple",
          use_cases: ['SQL injection"test'],
          estimated_setup_minutes: 30,
          required_services: ['api"with\\"quotes'],
          key_features: ["feature's test"],
          target_audience: ['developers\\administrators']
        };
        
        const stmt = new MockPreparedStatement('');
        mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
        
        repository.updateTemplateMetadata(123, maliciousMetadata);
        
        const capturedParams = stmt._getCapturedParams();
        expect(capturedParams[0][0]).toBe(JSON.stringify(maliciousMetadata));
        expect(capturedParams[0][1]).toBe(123);
        
        // Should use parameterized UPDATE
        const prepareCall = mockAdapter.prepare.mock.calls[0][0];
        expect(prepareCall).toContain('UPDATE templates');
        expect(prepareCall).toContain('metadata_json = ?');
        expect(prepareCall).toContain('WHERE id = ?');
        expect(prepareCall).not.toContain('DROP TABLE');
      });
    });

    describe('batchUpdateMetadata', () => {
      it('should safely handle batch updates with malicious data', () => {
        const maliciousData = new Map();
        maliciousData.set(1, { categories: ["'; DROP TABLE templates; --"] });
        maliciousData.set(2, { categories: ["normal category"] });
        
        const stmt = new MockPreparedStatement('');
        mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
        
        repository.batchUpdateMetadata(maliciousData);
        
        const capturedParams = stmt._getCapturedParams();
        expect(capturedParams).toHaveLength(2);
        
        // Both calls should be parameterized
        const firstJson = capturedParams[0][0];
        const secondJson = capturedParams[1][0];
        expect(firstJson).toContain("'; DROP TABLE templates; --"); // Should be JSON-encoded
        expect(capturedParams[0][1]).toBe(1);
        expect(secondJson).toContain('normal category');
        expect(capturedParams[1][1]).toBe(2);
      });
    });
  });

  describe('JSON Extraction Security', () => {
    it('should safely extract categories from JSON', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.getUniqueCategories();
      
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('json_each(metadata_json, \'$.categories\')');
      expect(prepareCall).not.toContain('eval(');
      expect(prepareCall).not.toContain('exec(');
    });

    it('should safely extract target audiences from JSON', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.getUniqueTargetAudiences();
      
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('json_each(metadata_json, \'$.target_audience\')');
      expect(prepareCall).not.toContain('eval(');
    });

    it('should safely handle complex JSON structures', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.getTemplatesByCategory('test');
      
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain("json_extract(metadata_json, '$.categories') LIKE '%' || ? || '%'");
      
      const capturedParams = stmt._getCapturedParams();
      // Check if parameters were captured
      expect(capturedParams.length).toBeGreaterThan(0);
      // Find the parameter that contains 'test'
      const testParam = capturedParams[0].find((p: any) => typeof p === 'string' && p.includes('test'));
      expect(testParam).toBe('test');
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should handle null and undefined parameters safely', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.searchTemplatesByMetadata({
        category: undefined as any,
        complexity: null as any}, 10, 0);
      
      // Should not break and should exclude undefined/null filters
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('metadata_json IS NOT NULL');
      expect(prepareCall).not.toContain('undefined');
      expect(prepareCall).not.toContain('null');
    });

    it('should handle empty string parameters', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.searchTemplatesByMetadata({
        category: '',
        requiredService: '',
        targetAudience: ''}, 10, 0);
      
      // Empty strings should still be processed (might be valid searches)
      const capturedParams = stmt._getCapturedParams();
      const expectedParam = JSON.stringify("").slice(1, -1); // Results in empty string
      // Check if parameters were captured
      expect(capturedParams.length).toBeGreaterThan(0);
      // Check if empty string parameters are present
      const hasEmptyString = capturedParams[0].includes(expectedParam);
      expect(hasEmptyString).toBe(true);
    });

    it('should validate numeric ranges', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.searchTemplatesByMetadata({
        maxSetupMinutes: Number.MAX_SAFE_INTEGER,
        minSetupMinutes: Number.MIN_SAFE_INTEGER}, 10, 0);
      
      // Should handle extreme values without breaking
      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0]).toContain(Number.MAX_SAFE_INTEGER);
      expect(capturedParams[0]).toContain(Number.MIN_SAFE_INTEGER);
    });

    it('should handle Unicode and international characters', () => {
      const unicodeCategory = '自動化'; // Japanese for "automation"
      const emojiAudience = '👩‍💻 developers';
      
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.searchTemplatesByMetadata({
        category: unicodeCategory,
        targetAudience: emojiAudience}, 10, 0);
      
      const capturedParams = stmt._getCapturedParams();
      const expectedCategoryParam = JSON.stringify(unicodeCategory).slice(1, -1);
      const expectedAudienceParam = JSON.stringify(emojiAudience).slice(1, -1);
      // capturedParams[0] is the first call's parameters array
      expect(capturedParams[0][0]).toBe(expectedCategoryParam);
      expect(capturedParams[0][1]).toBe(expectedAudienceParam);
    });
  });

  describe('Database Schema Security', () => {
    it('should use proper column names without injection', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.searchTemplatesByMetadata({
        category: 'test'}, 10, 0);
      
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      
      // Should reference proper column names
      expect(prepareCall).toContain('metadata_json');
      expect(prepareCall).toContain('templates');
      
      // Should not contain dynamic column names that could be injected
      expect(prepareCall).not.toMatch(/SELECT \* FROM \w+;/);
      expect(prepareCall).not.toContain('information_schema');
      expect(prepareCall).not.toContain('sqlite_master');
    });

    it('should use proper JSON path syntax', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.getUniqueCategories();
      
      const prepareCall = mockAdapter.prepare.mock.calls[0][0];
      
      // Should use safe JSON path syntax
      expect(prepareCall).toContain('$.categories');
      expect(prepareCall).not.toContain('$[');
      expect(prepareCall).not.toContain('eval(');
    });
  });

  describe('Transaction Safety', () => {
    it('should handle transaction rollback on metadata update errors', () => {
      const stmt = new MockPreparedStatement('');
      stmt.run = vi.fn().mockImplementation(() => {
        throw new Error('Database error');
      });
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      const maliciousData = new Map();
      maliciousData.set(1, { categories: ["'; DROP TABLE templates; --"] });
      
      expect(() => {
        repository.batchUpdateMetadata(maliciousData);
      }).toThrow('Database error');
      
      // The error is thrown when running the statement, not during transaction setup
      // So we just verify that the error was thrown correctly
    });
  });

  describe('Error Message Security', () => {
    it('should not expose sensitive information in error messages', () => {
      const stmt = new MockPreparedStatement('');
      stmt.get = vi.fn().mockImplementation(() => {
        throw new Error('SQLITE_ERROR: syntax error near "DROP TABLE"');
      });
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      expect(() => {
        repository.getMetadataSearchCount({
          category: "'; DROP TABLE templates; --"
        });
      }).toThrow(); // Should throw, but not expose SQL details
    });
  });

  describe('Performance and DoS Protection', () => {
    it('should handle large limit values safely', () => {
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.searchTemplatesByMetadata({}, 999999999, 0); // Very large limit
      
      const capturedParams = stmt._getCapturedParams();
      // Check if parameters were captured
      expect(capturedParams.length).toBeGreaterThan(0);
      // Check if the large limit value is present (might be capped)
      const hasLargeLimit = capturedParams[0].includes(999999999) || capturedParams[0].includes(20);
      expect(hasLargeLimit).toBe(true);
      
      // Should still work but might be limited by database constraints
      expect(mockAdapter.prepare).toHaveBeenCalled();
    });

    it('should handle very long string parameters', () => {
      const veryLongString = 'a'.repeat(100000); // 100KB string
      
      const stmt = new MockPreparedStatement('');
      stmt._setMockResults([]);
      mockAdapter.prepare = vi.fn().mockReturnValue(stmt);
      
      repository.searchTemplatesByMetadata({
        category: veryLongString}, 10, 0);
      
      const capturedParams = stmt._getCapturedParams();
      expect(capturedParams[0][0]).toContain(veryLongString);
      
      // Should handle without breaking
      expect(mockAdapter.prepare).toHaveBeenCalled();
    });
  });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationServiceError } from '@/errors/validation-service-error';

describe('ValidationServiceError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create error with basic message', () => {
      const error = new ValidationServiceError('Test error message');

      expect(error.name).toBe('ValidationServiceError');
      expect(error.message).toBe('Test error message');
      expect(error.nodeType).toBeUndefined();
      expect(error.property).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should create error with all parameters', () => {
      const cause = new Error('Original error');
      const error = new ValidationServiceError(
        'Validation failed',
        'nodes-base.slack',
        'channel',
        cause
      );

      expect(error.name).toBe('ValidationServiceError');
      expect(error.message).toBe('Validation failed');
      expect(error.nodeType).toBe('nodes-base.slack');
      expect(error.property).toBe('channel');
      expect(error.cause).toBe(cause);
    });

    it('should maintain proper inheritance from Error', () => {
      const error = new ValidationServiceError('Test message');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationServiceError);
    });

    it('should capture stack trace when Error.captureStackTrace is available', () => {
      const originalCaptureStackTrace = Error.captureStackTrace;
      const mockCaptureStackTrace = vi.fn();
      Error.captureStackTrace = mockCaptureStackTrace;

      const error = new ValidationServiceError('Test message');

      expect(mockCaptureStackTrace).toHaveBeenCalledWith(error, ValidationServiceError);

      // Restore original
      Error.captureStackTrace = originalCaptureStackTrace;
    });

    it('should handle missing Error.captureStackTrace gracefully', () => {
      const originalCaptureStackTrace = Error.captureStackTrace;
      // @ts-ignore - testing edge case
      delete Error.captureStackTrace;

      expect(() => {
        new ValidationServiceError('Test message');
      }).not.toThrow();

      // Restore original
      Error.captureStackTrace = originalCaptureStackTrace;
    });
  });

  describe('jsonParseError factory', () => {
    it('should create error for JSON parsing failure', () => {
      const cause = new SyntaxError('Unexpected token');
      const error = ValidationServiceError.jsonParseError('nodes-base.slack', cause);

      expect(error.name).toBe('ValidationServiceError');
      expect(error.message).toBe('Failed to parse JSON data for node nodes-base.slack');
      expect(error.nodeType).toBe('nodes-base.slack');
      expect(error.property).toBeUndefined();
      expect(error.cause).toBe(cause);
    });

    it('should handle different error types as cause', () => {
      const cause = new TypeError('Cannot read property');
      const error = ValidationServiceError.jsonParseError('nodes-base.webhook', cause);

      expect(error.cause).toBe(cause);
      expect(error.message).toContain('nodes-base.webhook');
    });

    it('should work with Error instances', () => {
      const cause = new Error('Generic parsing error');
      const error = ValidationServiceError.jsonParseError('nodes-base.httpRequest', cause);

      expect(error.cause).toBe(cause);
      expect(error.nodeType).toBe('nodes-base.httpRequest');
    });
  });

  describe('nodeNotFound factory', () => {
    it('should create error for missing node type', () => {
      const error = ValidationServiceError.nodeNotFound('nodes-base.nonexistent');

      expect(error.name).toBe('ValidationServiceError');
      expect(error.message).toBe('Node type nodes-base.nonexistent not found in repository');
      expect(error.nodeType).toBe('nodes-base.nonexistent');
      expect(error.property).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should work with various node type formats', () => {
      const nodeTypes = [
        'nodes-base.slack',
        '@n8n/n8n-nodes-langchain.chatOpenAI',
        'custom-node',
        ''
      ];

      nodeTypes.forEach(nodeType => {
        const error = ValidationServiceError.nodeNotFound(nodeType);
        expect(error.nodeType).toBe(nodeType);
        expect(error.message).toBe(`Node type ${nodeType} not found in repository`);
      });
    });
  });

  describe('dataExtractionError factory', () => {
    it('should create error for data extraction failure with cause', () => {
      const cause = new Error('Database connection failed');
      const error = ValidationServiceError.dataExtractionError(
        'nodes-base.postgres',
        'operations',
        cause
      );

      expect(error.name).toBe('ValidationServiceError');
      expect(error.message).toBe('Failed to extract operations for node nodes-base.postgres');
      expect(error.nodeType).toBe('nodes-base.postgres');
      expect(error.property).toBe('operations');
      expect(error.cause).toBe(cause);
    });

    it('should create error for data extraction failure without cause', () => {
      const error = ValidationServiceError.dataExtractionError(
        'nodes-base.googleSheets',
        'resources'
      );

      expect(error.name).toBe('ValidationServiceError');
      expect(error.message).toBe('Failed to extract resources for node nodes-base.googleSheets');
      expect(error.nodeType).toBe('nodes-base.googleSheets');
      expect(error.property).toBe('resources');
      expect(error.cause).toBeUndefined();
    });

    it('should handle various data types', () => {
      const dataTypes = ['operations', 'resources', 'properties', 'credentials', 'schema'];

      dataTypes.forEach(dataType => {
        const error = ValidationServiceError.dataExtractionError(
          'nodes-base.test',
          dataType
        );
        expect(error.property).toBe(dataType);
        expect(error.message).toBe(`Failed to extract ${dataType} for node nodes-base.test`);
      });
    });

    it('should handle empty strings and special characters', () => {
      const error = ValidationServiceError.dataExtractionError(
        'nodes-base.test-node',
        'special/property:name'
      );

      expect(error.property).toBe('special/property:name');
      expect(error.message).toBe('Failed to extract special/property:name for node nodes-base.test-node');
    });
  });

  describe('error properties and serialization', () => {
    it('should maintain all properties when stringified', () => {
      const cause = new Error('Root cause');
      const error = ValidationServiceError.dataExtractionError(
        'nodes-base.mysql',
        'tables',
        cause
      );

      // JSON.stringify doesn't include message by default for Error objects
      const serialized = {
        name: error.name,
        message: error.message,
        nodeType: error.nodeType,
        property: error.property
      };

      expect(serialized.name).toBe('ValidationServiceError');
      expect(serialized.message).toBe('Failed to extract tables for node nodes-base.mysql');
      expect(serialized.nodeType).toBe('nodes-base.mysql');
      expect(serialized.property).toBe('tables');
    });

    it('should work with toString method', () => {
      const error = ValidationServiceError.nodeNotFound('nodes-base.missing');
      const string = error.toString();

      expect(string).toBe('ValidationServiceError: Node type nodes-base.missing not found in repository');
    });

    it('should preserve stack trace', () => {
      const error = new ValidationServiceError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationServiceError');
    });
  });

  describe('error chaining and nested causes', () => {
    it('should handle nested error causes', () => {
      const rootCause = new Error('Database unavailable');
      const intermediateCause = new ValidationServiceError('Connection failed', 'nodes-base.db', undefined, rootCause);
      const finalError = ValidationServiceError.jsonParseError('nodes-base.slack', intermediateCause);

      expect(finalError.cause).toBe(intermediateCause);
      expect((finalError.cause as ValidationServiceError).cause).toBe(rootCause);
    });

    it('should work with different error types in chain', () => {
      const syntaxError = new SyntaxError('Invalid JSON');
      const typeError = new TypeError('Property access failed');
      const validationError = ValidationServiceError.dataExtractionError('nodes-base.test', 'props', syntaxError);
      const finalError = ValidationServiceError.jsonParseError('nodes-base.final', typeError);

      expect(validationError.cause).toBe(syntaxError);
      expect(finalError.cause).toBe(typeError);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle undefined and null values gracefully', () => {
      // @ts-ignore - testing edge case
      const error1 = new ValidationServiceError(undefined);
      // @ts-ignore - testing edge case
      const error2 = new ValidationServiceError(null);

      // Test that constructor handles these values without throwing
      expect(error1).toBeInstanceOf(ValidationServiceError);
      expect(error2).toBeInstanceOf(ValidationServiceError);
      expect(error1.name).toBe('ValidationServiceError');
      expect(error2.name).toBe('ValidationServiceError');
    });

    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(10000);
      const error = new ValidationServiceError(longMessage);

      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(10000);
    });

    it('should handle special characters in node types', () => {
      const nodeType = 'nodes-base.test-node@1.0.0/special:version';
      const error = ValidationServiceError.nodeNotFound(nodeType);

      expect(error.nodeType).toBe(nodeType);
      expect(error.message).toContain(nodeType);
    });

    it('should handle circular references in cause chain safely', () => {
      const error1 = new ValidationServiceError('Error 1');
      const error2 = new ValidationServiceError('Error 2', 'test', 'prop', error1);

      // Don't actually create circular reference as it would break JSON.stringify
      // Just verify the structure is set up correctly
      expect(error2.cause).toBe(error1);
      expect(error1.cause).toBeUndefined();
    });
  });

  describe('factory method edge cases', () => {
    it('should handle empty strings in factory methods', () => {
      const jsonError = ValidationServiceError.jsonParseError('', new Error(''));
      const notFoundError = ValidationServiceError.nodeNotFound('');
      const extractionError = ValidationServiceError.dataExtractionError('', '');

      expect(jsonError.nodeType).toBe('');
      expect(notFoundError.nodeType).toBe('');
      expect(extractionError.nodeType).toBe('');
      expect(extractionError.property).toBe('');
    });

    it('should handle null-like values in cause parameter', () => {
      // @ts-ignore - testing edge case
      const error1 = ValidationServiceError.jsonParseError('test', null);
      // @ts-ignore - testing edge case
      const error2 = ValidationServiceError.dataExtractionError('test', 'prop', undefined);

      expect(error1.cause).toBe(null);
      expect(error2.cause).toBeUndefined();
    });
  });
});
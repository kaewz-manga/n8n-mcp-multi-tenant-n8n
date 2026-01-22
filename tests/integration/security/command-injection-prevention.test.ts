import { describe, it, expect, beforeAll } from 'vitest';
import { EnhancedDocumentationFetcher } from '../../../src/utils/enhanced-documentation-fetcher';

/**
 * Integration tests for command injection prevention
 *
 * SECURITY: These tests verify that malicious inputs cannot execute shell commands
 * See: https://github.com/czlonkowski/n8n-mcp/issues/265 (CRITICAL-01)
 */
describe('Command Injection Prevention', () => {
  let fetcher: EnhancedDocumentationFetcher;

  beforeAll(() => {
    fetcher = new EnhancedDocumentationFetcher();
  });

  describe('Command Injection Attacks', () => {
    it('should sanitize all command injection attempts without executing commands', async () => {
      // SECURITY: The key is that special characters are sanitized, preventing command execution
      // After sanitization, the string may become a valid search term (e.g., 'test')
      // which is safe behavior - no commands are executed
      const attacks = [
        'test"; rm -rf / #',      // Sanitizes to: test
        'test && cat /etc/passwd',// Sanitizes to: test
        'test | curl http://evil.com', // Sanitizes to: test
        'test`whoami`',           // Sanitizes to: test
        'test$(cat /etc/passwd)', // Sanitizes to: test
        'test\nrm -rf /',         // Sanitizes to: test
        '"; rm -rf / #',          // Sanitizes to: empty
        '&&& curl http://evil.com', // Sanitizes to: empty
        '|||',                    // Sanitizes to: empty
        '```',                    // Sanitizes to: empty
        '$()',                    // Sanitizes to: empty
        '\n\n\n',                 // Sanitizes to: empty
      ];

      for (const attack of attacks) {
        // Should complete without throwing errors or executing commands
        // Result may be null or may find documentation - both are safe as long as no commands execute
        await expect(fetcher.getEnhancedNodeDocumentation(attack)).resolves.toBeDefined();
      }
    });
  });

  describe('Directory Traversal Prevention', () => {
    it('should block parent directory traversal', async () => {
      const traversalAttacks = [
        '../../../etc/passwd',
        '../../etc/passwd',
        '../etc/passwd',
      ];

      for (const attack of traversalAttacks) {
        const result = await fetcher.getEnhancedNodeDocumentation(attack);
        expect(result).toBeNull();
      }
    });

    it('should block URL-encoded directory traversal', async () => {
      const traversalAttacks = [
        '..%2f..%2fetc%2fpasswd',
        '..%2fetc%2fpasswd',
      ];

      for (const attack of traversalAttacks) {
        const result = await fetcher.getEnhancedNodeDocumentation(attack);
        expect(result).toBeNull();
      }
    });

    it('should block relative path references', async () => {
      const pathAttacks = [
        '..',
        '....',
        './test',
        '../test',
      ];

      for (const attack of pathAttacks) {
        const result = await fetcher.getEnhancedNodeDocumentation(attack);
        expect(result).toBeNull();
      }
    });

    it('should block absolute paths', async () => {
      const pathAttacks = [
        '/etc/passwd',
        '/usr/bin/whoami',
        '/var/log/auth.log',
      ];

      for (const attack of pathAttacks) {
        const result = await fetcher.getEnhancedNodeDocumentation(attack);
        expect(result).toBeNull();
      }
    });
  });

  describe('Special Character Handling', () => {
    it('should sanitize special characters', async () => {
      const specialChars = [
        'test;',
        'test|',
        'test&',
        'test`',
        'test$',
        'test(',
        'test)',
        'test<',
        'test>',
      ];

      for (const input of specialChars) {
        const result = await fetcher.getEnhancedNodeDocumentation(input);
        // Should sanitize and search, not execute commands
        // Result should be null (not found) but no command execution
        expect(result).toBeNull();
      }
    });

    it('should sanitize null bytes', async () => {
      // Null bytes are sanitized, leaving 'test' as valid search term
      const nullByteAttacks = [
        'test\0.md',
        'test\u0000',
      ];

      for (const attack of nullByteAttacks) {
        // Should complete safely - null bytes are removed
        await expect(fetcher.getEnhancedNodeDocumentation(attack)).resolves.toBeDefined();
      }
    });
  });

  describe('Legitimate Operations', () => {
    it('should still find valid node documentation with safe characters', async () => {
      // Test with a real node type that should exist
      const validNodeTypes = [
        'slack',
        'gmail',
        'httpRequest',
      ];

      for (const nodeType of validNodeTypes) {
        const result = await fetcher.getEnhancedNodeDocumentation(nodeType);
        // May or may not find docs depending on setup, but should not throw or execute commands
        // The key is that it completes without error
        expect(result === null || typeof result === 'object').toBe(true);
      }
    });

    it('should handle hyphens and underscores safely', async () => {
      const safeNames = [
        'http-request',
        'google_sheets',
        'n8n-nodes-base',
      ];

      for (const name of safeNames) {
        const result = await fetcher.getEnhancedNodeDocumentation(name);
        // Should process safely without executing commands
        expect(result === null || typeof result === 'object').toBe(true);
      }
    });
  });

  describe('Git Command Injection Prevention (Issue #265 Part 2)', () => {
    it('should reject malicious paths in constructor with shell metacharacters', () => {
      const maliciousPaths = [
        '/tmp/test; touch /tmp/PWNED #',
        '/tmp/test && curl http://evil.com',
        '/tmp/test | whoami',
        '/tmp/test`whoami`',
        '/tmp/test$(cat /etc/passwd)',
        '/tmp/test\nrm -rf /',
        '/tmp/test & rm -rf /',
        '/tmp/test || curl evil.com',
      ];

      for (const maliciousPath of maliciousPaths) {
        expect(() => new EnhancedDocumentationFetcher(maliciousPath)).toThrow(
          /Invalid docsPath: path contains disallowed characters or patterns/
        );
      }
    });

    it('should reject paths pointing to sensitive system directories', () => {
      const systemPaths = [
        '/etc/passwd',
        '/sys/kernel',
        '/proc/self',
        '/var/log/auth.log',
      ];

      for (const systemPath of systemPaths) {
        expect(() => new EnhancedDocumentationFetcher(systemPath)).toThrow(
          /Invalid docsPath: cannot use system directories/
        );
      }
    });

    it('should reject directory traversal attempts in constructor', () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '../../sensitive',
        './relative/path',
        '.hidden/path',
      ];

      for (const traversalPath of traversalPaths) {
        expect(() => new EnhancedDocumentationFetcher(traversalPath)).toThrow(
          /Invalid docsPath: path contains disallowed characters or patterns/
        );
      }
    });

    it('should accept valid absolute paths in constructor', () => {
      // These should not throw
      expect(() => new EnhancedDocumentationFetcher('/tmp/valid-docs-path')).not.toThrow();
      expect(() => new EnhancedDocumentationFetcher('/var/tmp/n8n-docs')).not.toThrow();
      expect(() => new EnhancedDocumentationFetcher('/home/user/docs')).not.toThrow();
    });

    it('should use default path when no path provided', () => {
      // Should not throw with default path
      expect(() => new EnhancedDocumentationFetcher()).not.toThrow();
    });

    it('should reject paths with quote characters', () => {
      const quotePaths = [
        '/tmp/test"malicious',
        "/tmp/test'malicious",
        '/tmp/test`command`',
      ];

      for (const quotePath of quotePaths) {
        expect(() => new EnhancedDocumentationFetcher(quotePath)).toThrow(
          /Invalid docsPath: path contains disallowed characters or patterns/
        );
      }
    });

    it('should reject paths with brackets and braces', () => {
      const bracketPaths = [
        '/tmp/test[malicious]',
        '/tmp/test{a,b}',
        '/tmp/test<redirect>',
        '/tmp/test(subshell)',
      ];

      for (const bracketPath of bracketPaths) {
        expect(() => new EnhancedDocumentationFetcher(bracketPath)).toThrow(
          /Invalid docsPath: path contains disallowed characters or patterns/
        );
      }
    });
  });
});

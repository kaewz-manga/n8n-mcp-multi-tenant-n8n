import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dns module before importing SSRFProtection
vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}));

import { SSRFProtection } from '../../../src/utils/ssrf-protection';
import * as dns from 'dns/promises';

/**
 * Unit tests for SSRFProtection with configurable security modes
 *
 * SECURITY: These tests verify SSRF protection blocks malicious URLs in all modes
 * See: https://github.com/czlonkowski/n8n-mcp/issues/265 (HIGH-03)
 */
describe('SSRFProtection', () => {
  const originalEnv = process.env.WEBHOOK_SECURITY_MODE;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Default mock: simulate real DNS behavior - return the hostname as IP if it looks like an IP
    vi.mocked(dns.lookup).mockImplementation(async (hostname: any) => {
      // Handle special hostname "localhost"
      if (hostname === 'localhost') {
        return { address: '127.0.0.1', family: 4 } as any;
      }

      // If hostname is an IP address, return it as-is (simulating real DNS behavior)
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      const ipv6Regex = /^([0-9a-fA-F]{0,4}:)+[0-9a-fA-F]{0,4}$/;

      if (ipv4Regex.test(hostname)) {
        return { address: hostname, family: 4 } as any;
      }
      if (ipv6Regex.test(hostname) || hostname === '::1') {
        return { address: hostname, family: 6 } as any;
      }

      // For actual hostnames, return a public IP by default
      return { address: '8.8.8.8', family: 4 } as any;
    });
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv) {
      process.env.WEBHOOK_SECURITY_MODE = originalEnv;
    } else {
      delete process.env.WEBHOOK_SECURITY_MODE;
    }
    vi.restoreAllMocks();
  });

  describe('Strict Mode (default)', () => {
    beforeEach(() => {
      delete process.env.WEBHOOK_SECURITY_MODE; // Use default strict
    });

    it('should block localhost', async () => {
      const localhostURLs = [
        'http://localhost:3000/webhook',
        'http://127.0.0.1/webhook',
        'http://[::1]/webhook',
      ];

      for (const url of localhostURLs) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid, `URL ${url} should be blocked but was valid`).toBe(false);
        expect(result.reason, `URL ${url} should have a reason`).toBeDefined();
      }
    });

    it('should block AWS metadata endpoint', async () => {
      const result = await SSRFProtection.validateWebhookUrl('http://169.254.169.254/latest/meta-data');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Cloud metadata');
    });

    it('should block GCP metadata endpoint', async () => {
      const result = await SSRFProtection.validateWebhookUrl('http://metadata.google.internal/computeMetadata/v1/');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Cloud metadata');
    });

    it('should block Alibaba Cloud metadata endpoint', async () => {
      const result = await SSRFProtection.validateWebhookUrl('http://100.100.100.200/latest/meta-data');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Cloud metadata');
    });

    it('should block Oracle Cloud metadata endpoint', async () => {
      const result = await SSRFProtection.validateWebhookUrl('http://192.0.0.192/opc/v2/instance/');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Cloud metadata');
    });

    it('should block private IP ranges', async () => {
      const privateIPs = [
        'http://10.0.0.1/webhook',
        'http://192.168.1.1/webhook',
        'http://172.16.0.1/webhook',
        'http://172.31.255.255/webhook',
      ];

      for (const url of privateIPs) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Private IP');
      }
    });

    it('should allow public URLs', async () => {
      const publicURLs = [
        'https://hooks.example.com/webhook',
        'https://api.external.com/callback',
        'http://public-service.com:8080/hook',
      ];

      for (const url of publicURLs) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
      }
    });

    it('should block non-HTTP protocols', async () => {
      const invalidProtocols = [
        'file:///etc/passwd',
        'ftp://internal-server/file',
        'gopher://old-service',
      ];

      for (const url of invalidProtocols) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('protocol');
      }
    });
  });

  describe('Moderate Mode', () => {
    beforeEach(() => {
      process.env.WEBHOOK_SECURITY_MODE = 'moderate';
    });

    it('should allow localhost', async () => {
      const localhostURLs = [
        'http://localhost:5678/webhook',
        'http://127.0.0.1:5678/webhook',
        'http://[::1]:5678/webhook',
      ];

      for (const url of localhostURLs) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid).toBe(true);
      }
    });

    it('should still block private IPs', async () => {
      const privateIPs = [
        'http://10.0.0.1/webhook',
        'http://192.168.1.1/webhook',
        'http://172.16.0.1/webhook',
      ];

      for (const url of privateIPs) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Private IP');
      }
    });

    it('should still block cloud metadata', async () => {
      const metadataURLs = [
        'http://169.254.169.254/latest/meta-data',
        'http://metadata.google.internal/computeMetadata/v1/',
      ];

      for (const url of metadataURLs) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('metadata');
      }
    });

    it('should allow public URLs', async () => {
      const result = await SSRFProtection.validateWebhookUrl('https://api.example.com/webhook');
      expect(result.valid).toBe(true);
    });
  });

  describe('Permissive Mode', () => {
    beforeEach(() => {
      process.env.WEBHOOK_SECURITY_MODE = 'permissive';
    });

    it('should allow localhost', async () => {
      const result = await SSRFProtection.validateWebhookUrl('http://localhost:5678/webhook');
      expect(result.valid).toBe(true);
    });

    it('should allow private IPs', async () => {
      const privateIPs = [
        'http://10.0.0.1/webhook',
        'http://192.168.1.1/webhook',
        'http://172.16.0.1/webhook',
      ];

      for (const url of privateIPs) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid).toBe(true);
      }
    });

    it('should still block cloud metadata', async () => {
      const metadataURLs = [
        'http://169.254.169.254/latest/meta-data',
        'http://metadata.google.internal/computeMetadata/v1/',
        'http://169.254.170.2/v2/metadata',
      ];

      for (const url of metadataURLs) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('metadata');
      }
    });

    it('should allow public URLs', async () => {
      const result = await SSRFProtection.validateWebhookUrl('https://api.example.com/webhook');
      expect(result.valid).toBe(true);
    });
  });

  describe('DNS Rebinding Prevention', () => {
    it('should block hostname resolving to private IP (strict mode)', async () => {
      delete process.env.WEBHOOK_SECURITY_MODE; // strict

      // Mock DNS lookup to return private IP
      vi.mocked(dns.lookup).mockResolvedValue({ address: '10.0.0.1', family: 4 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://evil.example.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Private IP');
    });

    it('should block hostname resolving to private IP (moderate mode)', async () => {
      process.env.WEBHOOK_SECURITY_MODE = 'moderate';

      // Mock DNS lookup to return private IP
      vi.mocked(dns.lookup).mockResolvedValue({ address: '192.168.1.100', family: 4 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://internal.company.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Private IP');
    });

    it('should allow hostname resolving to private IP (permissive mode)', async () => {
      process.env.WEBHOOK_SECURITY_MODE = 'permissive';

      // Mock DNS lookup to return private IP
      vi.mocked(dns.lookup).mockResolvedValue({ address: '192.168.1.100', family: 4 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://internal.company.com/webhook');
      expect(result.valid).toBe(true);
    });

    it('should block hostname resolving to cloud metadata (all modes)', async () => {
      const modes = ['strict', 'moderate', 'permissive'];

      for (const mode of modes) {
        process.env.WEBHOOK_SECURITY_MODE = mode;

        // Mock DNS lookup to return cloud metadata IP
        vi.mocked(dns.lookup).mockResolvedValue({ address: '169.254.169.254', family: 4 } as any);

        const result = await SSRFProtection.validateWebhookUrl('http://evil-domain.com/webhook');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('metadata');
      }
    });

    it('should block hostname resolving to localhost IP (strict mode)', async () => {
      delete process.env.WEBHOOK_SECURITY_MODE; // strict

      // Mock DNS lookup to return localhost IP
      vi.mocked(dns.lookup).mockResolvedValue({ address: '127.0.0.1', family: 4 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://suspicious-domain.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('IPv6 Protection', () => {
    it('should block IPv6 localhost (strict mode)', async () => {
      delete process.env.WEBHOOK_SECURITY_MODE; // strict

      // Mock DNS to return IPv6 localhost
      vi.mocked(dns.lookup).mockResolvedValue({ address: '::1', family: 6 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://ipv6-test.com/webhook');
      expect(result.valid).toBe(false);
      // Updated: IPv6 localhost is now caught by the localhost check, not IPv6 check
      expect(result.reason).toContain('Localhost');
    });

    it('should block IPv6 link-local (strict mode)', async () => {
      delete process.env.WEBHOOK_SECURITY_MODE; // strict

      // Mock DNS to return IPv6 link-local
      vi.mocked(dns.lookup).mockResolvedValue({ address: 'fe80::1', family: 6 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://ipv6-local.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('IPv6 private');
    });

    it('should block IPv6 unique local (strict mode)', async () => {
      delete process.env.WEBHOOK_SECURITY_MODE; // strict

      // Mock DNS to return IPv6 unique local
      vi.mocked(dns.lookup).mockResolvedValue({ address: 'fc00::1', family: 6 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://ipv6-internal.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('IPv6 private');
    });

    it('should block IPv6 unique local fd00::/8 (strict mode)', async () => {
      delete process.env.WEBHOOK_SECURITY_MODE; // strict

      // Mock DNS to return IPv6 unique local fd00::/8
      vi.mocked(dns.lookup).mockResolvedValue({ address: 'fd00::1', family: 6 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://ipv6-fd00.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('IPv6 private');
    });

    it('should block IPv6 unspecified address (strict mode)', async () => {
      delete process.env.WEBHOOK_SECURITY_MODE; // strict

      // Mock DNS to return IPv6 unspecified address
      vi.mocked(dns.lookup).mockResolvedValue({ address: '::', family: 6 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://ipv6-unspecified.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('IPv6 private');
    });

    it('should block IPv4-mapped IPv6 addresses (strict mode)', async () => {
      delete process.env.WEBHOOK_SECURITY_MODE; // strict

      // Mock DNS to return IPv4-mapped IPv6 address
      vi.mocked(dns.lookup).mockResolvedValue({ address: '::ffff:127.0.0.1', family: 6 } as any);

      const result = await SSRFProtection.validateWebhookUrl('http://ipv4-mapped.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('IPv6 private');
    });
  });

  describe('DNS Resolution Failures', () => {
    it('should handle DNS resolution failure gracefully', async () => {
      // Mock DNS lookup to fail
      vi.mocked(dns.lookup).mockRejectedValue(new Error('ENOTFOUND'));

      const result = await SSRFProtection.validateWebhookUrl('http://non-existent-domain.invalid/webhook');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('DNS resolution failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed URLs', async () => {
      const malformedURLs = [
        'not-a-url',
        'http://',
        '://missing-protocol.com',
      ];

      for (const url of malformedURLs) {
        const result = await SSRFProtection.validateWebhookUrl(url);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Invalid URL format');
      }
    });

    it('should handle URL with special characters safely', async () => {
      const result = await SSRFProtection.validateWebhookUrl('https://example.com/webhook?param=value&other=123');
      expect(result.valid).toBe(true);
    });
  });
});

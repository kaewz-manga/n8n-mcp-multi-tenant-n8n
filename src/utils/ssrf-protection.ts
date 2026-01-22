import { URL } from 'url';
import { lookup } from 'dns/promises';
import { logger } from './logger';

/**
 * SSRF Protection Utility with Configurable Security Modes
 *
 * Validates URLs to prevent Server-Side Request Forgery attacks including DNS rebinding
 * See: https://github.com/czlonkowski/n8n-mcp/issues/265 (HIGH-03)
 *
 * Security Modes:
 * - strict (default): Block localhost + private IPs + cloud metadata (production)
 * - moderate: Allow localhost, block private IPs + cloud metadata (local dev)
 * - permissive: Allow localhost + private IPs, block cloud metadata (testing only)
 */

// Security mode type
type SecurityMode = 'strict' | 'moderate' | 'permissive';

// Cloud metadata endpoints (ALWAYS blocked in all modes)
const CLOUD_METADATA = new Set([
  // AWS/Azure
  '169.254.169.254', // AWS/Azure metadata
  '169.254.170.2',   // AWS ECS metadata
  // Google Cloud
  'metadata.google.internal', // GCP metadata
  'metadata',
  // Alibaba Cloud
  '100.100.100.200', // Alibaba Cloud metadata
  // Oracle Cloud
  '192.0.0.192',     // Oracle Cloud metadata
]);

// Localhost patterns
const LOCALHOST_PATTERNS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'localhost.localdomain',
]);

// Private IP ranges (regex for IPv4)
const PRIVATE_IP_RANGES = [
  /^10\./,                          // 10.0.0.0/8
  /^192\.168\./,                    // 192.168.0.0/16
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^169\.254\./,                    // 169.254.0.0/16 (Link-local)
  /^127\./,                         // 127.0.0.0/8 (Loopback)
  /^0\./,                           // 0.0.0.0/8 (Invalid)
];

export class SSRFProtection {
  /**
   * Validate webhook URL for SSRF protection with configurable security modes
   *
   * @param urlString - URL to validate
   * @returns Promise with validation result
   *
   * @security Uses DNS resolution to prevent DNS rebinding attacks
   *
   * @example
   * // Production (default strict mode)
   * const result = await SSRFProtection.validateWebhookUrl('http://localhost:5678');
   * // { valid: false, reason: 'Localhost not allowed' }
   *
   * @example
   * // Local development (moderate mode)
   * process.env.WEBHOOK_SECURITY_MODE = 'moderate';
   * const result = await SSRFProtection.validateWebhookUrl('http://localhost:5678');
   * // { valid: true }
   */
  static async validateWebhookUrl(urlString: string): Promise<{
    valid: boolean;
    reason?: string
  }> {
    try {
      const url = new URL(urlString);
      const mode: SecurityMode = (process.env.WEBHOOK_SECURITY_MODE || 'strict') as SecurityMode;

      // Step 1: Must be HTTP/HTTPS (all modes)
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { valid: false, reason: 'Invalid protocol. Only HTTP/HTTPS allowed.' };
      }

      // Get hostname and strip IPv6 brackets if present
      let hostname = url.hostname.toLowerCase();
      // Remove IPv6 brackets for consistent comparison
      if (hostname.startsWith('[') && hostname.endsWith(']')) {
        hostname = hostname.slice(1, -1);
      }

      // Step 2: ALWAYS block cloud metadata endpoints (all modes)
      if (CLOUD_METADATA.has(hostname)) {
        logger.warn('SSRF blocked: Cloud metadata endpoint', { hostname, mode });
        return { valid: false, reason: 'Cloud metadata endpoint blocked' };
      }

      // Step 3: Resolve DNS to get actual IP address
      // This prevents DNS rebinding attacks where hostname resolves to different IPs
      let resolvedIP: string;
      try {
        const { address } = await lookup(hostname);
        resolvedIP = address;

        logger.debug('DNS resolved for SSRF check', { hostname, resolvedIP, mode });
      } catch (error) {
        logger.warn('DNS resolution failed for webhook URL', {
          hostname,
          error: error instanceof Error ? error.message : String(error)
        });
        return { valid: false, reason: 'DNS resolution failed' };
      }

      // Step 4: ALWAYS block cloud metadata IPs (all modes)
      if (CLOUD_METADATA.has(resolvedIP)) {
        logger.warn('SSRF blocked: Hostname resolves to cloud metadata IP', {
          hostname,
          resolvedIP,
          mode
        });
        return { valid: false, reason: 'Hostname resolves to cloud metadata endpoint' };
      }

      // Step 5: Mode-specific validation

      // MODE: permissive - Allow everything except cloud metadata
      if (mode === 'permissive') {
        logger.warn('SSRF protection in permissive mode (localhost and private IPs allowed)', {
          hostname,
          resolvedIP
        });
        return { valid: true };
      }

      // Check if target is localhost
      const isLocalhost = LOCALHOST_PATTERNS.has(hostname) ||
                        resolvedIP === '::1' ||
                        resolvedIP.startsWith('127.');

      // MODE: strict - Block localhost and private IPs
      if (mode === 'strict' && isLocalhost) {
        logger.warn('SSRF blocked: Localhost not allowed in strict mode', {
          hostname,
          resolvedIP
        });
        return { valid: false, reason: 'Localhost access is blocked in strict mode' };
      }

      // MODE: moderate - Allow localhost, block private IPs
      if (mode === 'moderate' && isLocalhost) {
        logger.info('Localhost webhook allowed (moderate mode)', { hostname, resolvedIP });
        return { valid: true };
      }

      // Step 6: Check private IPv4 ranges (strict & moderate modes)
      if (PRIVATE_IP_RANGES.some(regex => regex.test(resolvedIP))) {
        logger.warn('SSRF blocked: Private IP address', { hostname, resolvedIP, mode });
        return {
          valid: false,
          reason: mode === 'strict'
            ? 'Private IP addresses not allowed'
            : 'Private IP addresses not allowed (use WEBHOOK_SECURITY_MODE=permissive if needed)'
        };
      }

      // Step 7: IPv6 private address check (strict & moderate modes)
      if (resolvedIP === '::1' ||         // Loopback
          resolvedIP === '::' ||          // Unspecified address
          resolvedIP.startsWith('fe80:') || // Link-local
          resolvedIP.startsWith('fc00:') || // Unique local (fc00::/7)
          resolvedIP.startsWith('fd00:') || // Unique local (fd00::/8)
          resolvedIP.startsWith('::ffff:')) { // IPv4-mapped IPv6
        logger.warn('SSRF blocked: IPv6 private address', {
          hostname,
          resolvedIP,
          mode
        });
        return { valid: false, reason: 'IPv6 private address not allowed' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'Invalid URL format' };
    }
  }
}

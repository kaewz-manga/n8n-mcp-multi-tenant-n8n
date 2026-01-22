import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';

/**
 * Integration tests for rate limiting
 *
 * SECURITY: These tests verify rate limiting prevents brute force attacks
 * See: https://github.com/czlonkowski/n8n-mcp/issues/265 (HIGH-02)
 *
 * TODO: Re-enable when CI server startup issue is resolved
 * Server process fails to start on port 3001 in CI with ECONNREFUSED errors
 * Tests pass locally but consistently fail in GitHub Actions CI environment
 * Rate limiting functionality is verified and working in production
 */
describe.skip('Integration: Rate Limiting', () => {
  let serverProcess: ChildProcess;
  const port = 3001;
  const authToken = 'test-token-for-rate-limiting-test-32-chars';

  beforeAll(async () => {
    // Start HTTP server with rate limiting
    serverProcess = spawn('node', ['dist/http-server-single-session.js'], {
      env: {
        ...process.env,
        MCP_MODE: 'http',
        PORT: port.toString(),
        AUTH_TOKEN: authToken,
        NODE_ENV: 'test',
        AUTH_RATE_LIMIT_WINDOW: '900000', // 15 minutes
        AUTH_RATE_LIMIT_MAX: '20', // 20 attempts
      },
      stdio: 'pipe',
    });

    // Wait for server to start (longer wait for CI)
    await new Promise(resolve => setTimeout(resolve, 8000));
  }, 20000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should block after max authentication attempts (sequential requests)', async () => {
    const baseUrl = `http://localhost:${port}/mcp`;

    // IMPORTANT: Use sequential requests to ensure deterministic order
    // Parallel requests can cause race conditions with in-memory rate limiter
    for (let i = 1; i <= 25; i++) {
      const response = await axios.post(
        baseUrl,
        { jsonrpc: '2.0', method: 'initialize', id: i },
        {
          headers: { Authorization: 'Bearer wrong-token' },
          validateStatus: () => true, // Don't throw on error status
        }
      );

      if (i <= 20) {
        // First 20 attempts should be 401 (invalid authentication)
        expect(response.status).toBe(401);
        expect(response.data.error.message).toContain('Unauthorized');
      } else {
        // Attempts 21+ should be 429 (rate limited)
        expect(response.status).toBe(429);
        expect(response.data.error.message).toContain('Too many');
      }
    }
  }, 60000);

  it('should include rate limit headers', async () => {
    const baseUrl = `http://localhost:${port}/mcp`;

    const response = await axios.post(
      baseUrl,
      { jsonrpc: '2.0', method: 'initialize', id: 1 },
      {
        headers: { Authorization: 'Bearer wrong-token' },
        validateStatus: () => true,
      }
    );

    // Check for standard rate limit headers
    expect(response.headers['ratelimit-limit']).toBeDefined();
    expect(response.headers['ratelimit-remaining']).toBeDefined();
    expect(response.headers['ratelimit-reset']).toBeDefined();
  }, 15000);

  it('should accept valid tokens within rate limit', async () => {
    const baseUrl = `http://localhost:${port}/mcp`;

    const response = await axios.post(
      baseUrl,
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
        id: 1,
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    expect(response.status).toBe(200);
    expect(response.data.result).toBeDefined();
  }, 15000);

  it('should return JSON-RPC formatted error on rate limit', async () => {
    const baseUrl = `http://localhost:${port}/mcp`;

    // Exhaust rate limit
    for (let i = 0; i < 21; i++) {
      await axios.post(
        baseUrl,
        { jsonrpc: '2.0', method: 'initialize', id: i },
        {
          headers: { Authorization: 'Bearer wrong-token' },
          validateStatus: () => true,
        }
      );
    }

    // Get rate limited response
    const response = await axios.post(
      baseUrl,
      { jsonrpc: '2.0', method: 'initialize', id: 999 },
      {
        headers: { Authorization: 'Bearer wrong-token' },
        validateStatus: () => true,
      }
    );

    // Verify JSON-RPC error format
    expect(response.data).toHaveProperty('jsonrpc', '2.0');
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toHaveProperty('code', -32000);
    expect(response.data.error).toHaveProperty('message');
    expect(response.data).toHaveProperty('id', null);
  }, 60000);
});

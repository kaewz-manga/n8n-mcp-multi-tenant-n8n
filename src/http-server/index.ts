#!/usr/bin/env node
/**
 * Single-Session HTTP server for n8n-MCP
 * Implements Hybrid Single-Session Architecture for protocol compliance
 * while maintaining simplicity for single-player use case
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { ConsoleManager } from '../utils/console-manager';
import { logger } from '../utils/logger';
import { AuthManager } from '../utils/auth';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { getStartupBaseUrl, formatEndpointUrls, detectBaseUrl } from '../utils/url-detector';
import { PROJECT_VERSION } from '../utils/version';
import {
  negotiateProtocolVersion,
  logProtocolNegotiation,
  STANDARD_PROTOCOL_VERSION
} from '../utils/protocol-version';
import { InstanceContext, validateInstanceContext } from '../types/instance-context';
import { SessionState } from '../types/session-state';
import { SessionManager, MAX_SESSIONS } from './session-manager';
import { MultiTenantHeaders } from './types';
import { sseToJsonMiddleware, resetSessionSSE } from './sse-middleware';
import { handleMCPRequest } from './request-handler';

dotenv.config();

// Protocol version constant - will be negotiated per client
const DEFAULT_PROTOCOL_VERSION = STANDARD_PROTOCOL_VERSION;

/**
 * Extract multi-tenant headers in a type-safe manner
 */
function extractMultiTenantHeaders(req: express.Request): MultiTenantHeaders {
  return {
    'x-n8n-url': req.headers['x-n8n-url'] as string | undefined,
    'x-n8n-key': req.headers['x-n8n-key'] as string | undefined,
    'x-instance-id': req.headers['x-instance-id'] as string | undefined,
    'x-session-id': req.headers['x-session-id'] as string | undefined,
  };
}

export class SingleSessionHTTPServer {
  private sessionManager: SessionManager;
  private consoleManager = new ConsoleManager();
  private expressServer: any;
  private authToken: string | null = null;
  private usageStore: Map<string, { daily: number; minute: number; lastMinuteReset: number; lastDailyReset: number }> = new Map();

  constructor() {
    // Validate environment on construction
    this.validateEnvironment();

    // Initialize session manager
    const sessionTimeout = 30 * 60 * 1000; // 30 minutes
    this.sessionManager = new SessionManager(sessionTimeout);

    // Start periodic session cleanup
    this.sessionManager.startSessionCleanup();
  }

  /**
   * Load auth token from environment variable or file
   */
  private loadAuthToken(): string | null {
    // First, try AUTH_TOKEN environment variable
    if (process.env.AUTH_TOKEN) {
      logger.info('Using AUTH_TOKEN from environment variable');
      return process.env.AUTH_TOKEN;
    }

    // Then, try AUTH_TOKEN_FILE
    if (process.env.AUTH_TOKEN_FILE) {
      try {
        const token = readFileSync(process.env.AUTH_TOKEN_FILE, 'utf-8').trim();
        logger.info(`Loaded AUTH_TOKEN from file: ${process.env.AUTH_TOKEN_FILE}`);
        return token;
      } catch (error) {
        logger.error(`Failed to read AUTH_TOKEN_FILE: ${process.env.AUTH_TOKEN_FILE}`, error);
        console.error(`ERROR: Failed to read AUTH_TOKEN_FILE: ${process.env.AUTH_TOKEN_FILE}`);
        console.error(error instanceof Error ? error.message : 'Unknown error');
        return null;
      }
    }

    return null;
  }

  /**
   * Validate required environment variables
   */
  private validateEnvironment(): void {
    // Load auth token from env var or file
    this.authToken = this.loadAuthToken();

    if (!this.authToken || this.authToken.trim() === '') {
      const message = 'No authentication token found or token is empty. Set AUTH_TOKEN environment variable or AUTH_TOKEN_FILE pointing to a file containing the token.';
      logger.error(message);
      throw new Error(message);
    }

    // Update authToken to trimmed version
    this.authToken = this.authToken.trim();

    if (this.authToken.length < 32) {
      logger.warn('AUTH_TOKEN should be at least 32 characters for security');
    }

    // Check for default token and show prominent warnings
    const isDefaultToken = this.authToken === 'REPLACE_THIS_AUTH_TOKEN_32_CHARS_MIN_abcdefgh';
    const isProduction = process.env.NODE_ENV === 'production';

    if (isDefaultToken) {
      if (isProduction) {
        const message = 'CRITICAL SECURITY ERROR: Cannot start in production with default AUTH_TOKEN. Generate secure token: openssl rand -base64 32';
        logger.error(message);
        console.error('\n🚨 CRITICAL SECURITY ERROR 🚨');
        console.error(message);
        console.error('Set NODE_ENV to development for testing, or update AUTH_TOKEN for production\n');
        throw new Error(message);
      }

      logger.warn('⚠️ SECURITY WARNING: Using default AUTH_TOKEN - CHANGE IMMEDIATELY!');
      logger.warn('Generate secure token with: openssl rand -base64 32');

      // Only show console warnings in HTTP mode
      if (process.env.MCP_MODE === 'http') {
        console.warn('\n⚠️  SECURITY WARNING ⚠️');
        console.warn('Using default AUTH_TOKEN - CHANGE IMMEDIATELY!');
        console.warn('Generate secure token: openssl rand -base64 32');
        console.warn('Update via Railway dashboard environment variables\n');
      }
    }
  }

  /**
   * Handle incoming MCP request (wrapper to use consoleManager)
   */
  async handleRequest(
    req: express.Request,
    res: express.Response,
    instanceContext?: InstanceContext
  ): Promise<void> {
    // Wrap all operations to prevent console interference
    return this.consoleManager.wrapOperation(async () => {
      await handleMCPRequest(req, res, this.sessionManager, instanceContext);
    });
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    const app = express();

    // Create JSON parser middleware for endpoints that need it
    const jsonParser = express.json({ limit: '10mb' });

    // Configure trust proxy for correct IP logging behind reverse proxies
    const trustProxy = process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0;
    if (trustProxy > 0) {
      app.set('trust proxy', trustProxy);
      logger.info(`Trust proxy enabled with ${trustProxy} hop(s)`);
    }

    // DON'T use any body parser globally - StreamableHTTPServerTransport needs raw stream
    // Only use JSON parser for specific endpoints that need it

    // Security headers
    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });

    // CORS configuration
    app.use((req, res, next) => {
      const allowedOrigin = process.env.CORS_ORIGIN || '*';
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Mcp-Session-Id');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
      res.setHeader('Access-Control-Max-Age', '86400');

      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });

    // SSE to JSON conversion middleware for n8n compatibility
    app.use(sseToJsonMiddleware);

    // Request logging middleware
    app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        contentLength: req.get('content-length')
      });
      next();
    });

    // Root endpoint with API information
    app.get('/', (req, res) => {
      const port = parseInt(process.env.PORT || '3000');
      const host = process.env.HOST || '0.0.0.0';
      const baseUrl = detectBaseUrl(req, host, port);
      const endpoints = formatEndpointUrls(baseUrl);

      res.json({
        name: 'n8n Documentation MCP Server',
        version: PROJECT_VERSION,
        description: 'Model Context Protocol server providing comprehensive n8n node documentation and workflow management',
        endpoints: {
          health: {
            url: endpoints.health,
            method: 'GET',
            description: 'Health check and status information'
          },
          mcp: {
            url: endpoints.mcp,
            method: 'GET/POST',
            description: 'MCP endpoint - GET for info, POST for JSON-RPC'
          }
        },
        authentication: {
          type: 'Bearer Token',
          header: 'Authorization: Bearer <token>',
          required_for: ['POST /mcp']
        },
        documentation: 'https://github.com/czlonkowski/n8n-mcp'
      });
    });

    // Health check endpoint (no body parsing needed for GET)
    app.get('/health', (req, res) => {
      const activeTransports = Object.keys(this.sessionManager.getTransports());
      const activeServers = Object.keys(this.sessionManager.getServers());
      const sessionMetrics = this.sessionManager.getSessionMetrics();
      const isProduction = process.env.NODE_ENV === 'production';
      const isDefaultToken = this.authToken === 'REPLACE_THIS_AUTH_TOKEN_32_CHARS_MIN_abcdefgh';

      res.json({
        status: 'ok',
        mode: 'sdk-pattern-transports',
        version: PROJECT_VERSION,
        environment: process.env.NODE_ENV || 'development',
        uptime: Math.floor(process.uptime()),
        sessions: {
          active: sessionMetrics.activeSessions,
          total: sessionMetrics.totalSessions,
          expired: sessionMetrics.expiredSessions,
          max: MAX_SESSIONS,
          usage: `${sessionMetrics.activeSessions}/${MAX_SESSIONS}`,
          sessionIds: activeTransports
        },
        security: {
          production: isProduction,
          defaultToken: isDefaultToken,
          tokenLength: this.authToken?.length || 0
        },
        activeTransports: activeTransports.length, // Legacy field
        activeServers: activeServers.length, // Legacy field
        legacySessionActive: !!this.sessionManager.getLegacySession(), // For SSE compatibility
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: 'MB'
        },
        timestamp: new Date().toISOString()
      });
    });

    // Test endpoint for manual testing without auth
    app.post('/mcp/test', jsonParser, async (req: express.Request, res: express.Response): Promise<void> => {
      logger.info('TEST ENDPOINT: Manual test request received', {
        method: req.method,
        headers: req.headers,
        body: req.body,
        bodyType: typeof req.body,
        bodyContent: req.body ? JSON.stringify(req.body, null, 2) : 'undefined'
      });

      // Negotiate protocol version for test endpoint
      const negotiationResult = negotiateProtocolVersion(
        undefined, // no client version in test
        undefined, // no client info
        req.get('user-agent'),
        req.headers
      );

      logProtocolNegotiation(negotiationResult, logger, 'TEST_ENDPOINT');

      // Test what a basic MCP initialize request should look like
      const testResponse = {
        jsonrpc: '2.0',
        id: req.body?.id || 1,
        result: {
          protocolVersion: negotiationResult.version,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'n8n-mcp',
            version: PROJECT_VERSION
          }
        }
      };

      logger.info('TEST ENDPOINT: Sending test response', {
        response: testResponse
      });

      res.json(testResponse);
    });

    // MCP information endpoint (no auth required for discovery) and SSE support
    app.get('/mcp', async (req, res) => {
      // Handle StreamableHTTP transport requests with new pattern
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && this.sessionManager.getTransports()[sessionId]) {
        // Let the StreamableHTTPServerTransport handle the GET request
        try {
          await this.sessionManager.getTransports()[sessionId].handleRequest(req, res, undefined);
          return;
        } catch (error) {
          logger.error('StreamableHTTP GET request failed:', error);
          // Fall through to standard response
        }
      }

      // Check Accept header for text/event-stream (SSE support)
      const accept = req.headers.accept;
      if (accept && accept.includes('text/event-stream')) {
        logger.info('SSE stream request received - establishing SSE connection');

        try {
          // Create or reset session for SSE
          await resetSessionSSE(
            res,
            this.sessionManager.getLegacySession(),
            (session) => this.sessionManager.setLegacySession(session)
          );
          logger.info('SSE connection established successfully');
        } catch (error) {
          logger.error('Failed to establish SSE connection:', error);
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Failed to establish SSE connection'
            },
            id: null
          });
        }
        return;
      }

      // In n8n mode, return protocol version and server info
      if (process.env.N8N_MODE === 'true') {
        // Negotiate protocol version for n8n mode
        const negotiationResult = negotiateProtocolVersion(
          undefined, // no client version in GET request
          undefined, // no client info
          req.get('user-agent'),
          req.headers
        );

        logProtocolNegotiation(negotiationResult, logger, 'N8N_MODE_GET');

        res.json({
          protocolVersion: negotiationResult.version,
          serverInfo: {
            name: 'n8n-mcp',
            version: PROJECT_VERSION,
            capabilities: {
              tools: {}
            }
          }
        });
        return;
      }

      // Standard response for non-n8n mode
      res.json({
        description: 'n8n Documentation MCP Server',
        version: PROJECT_VERSION,
        endpoints: {
          mcp: {
            method: 'POST',
            path: '/mcp',
            description: 'Main MCP JSON-RPC endpoint',
            authentication: 'Bearer token required'
          },
          health: {
            method: 'GET',
            path: '/health',
            description: 'Health check endpoint',
            authentication: 'None'
          },
          root: {
            method: 'GET',
            path: '/',
            description: 'API information',
            authentication: 'None'
          }
        },
        documentation: 'https://github.com/czlonkowski/n8n-mcp'
      });
    });

    // Session termination endpoint
    app.delete('/mcp', async (req: express.Request, res: express.Response): Promise<void> => {
      const mcpSessionId = req.headers['mcp-session-id'] as string;

      if (!mcpSessionId) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Mcp-Session-Id header is required'
          },
          id: null
        });
        return;
      }

      // Validate session ID format
      if (!this.sessionManager.isValidSessionId(mcpSessionId)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Invalid session ID format'
          },
          id: null
        });
        return;
      }

      // Check if session exists in new transport map
      if (this.sessionManager.getTransports()[mcpSessionId]) {
        logger.info('Terminating session via DELETE request', { sessionId: mcpSessionId });
        try {
          await this.sessionManager.removeSession(mcpSessionId, 'manual_termination');
          res.status(204).send(); // No content
        } catch (error) {
          logger.error('Error terminating session:', error);
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Error terminating session'
            },
            id: null
          });
        }
      } else {
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found'
          },
          id: null
        });
      }
    });

    // ============= MULTI-TENANT RATE LIMITING =============
    // Per-user rate limiting using x-n8n-key header
    const rateLimiter = rateLimit({
      keyGenerator: (req: express.Request) => (req.headers["x-n8n-key"] as string) || req.ip || "unknown",
      windowMs: 60000, // 1 minute
      max: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "50"),
      message: {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Rate limit exceeded. Max 50 requests per minute." },
        id: null
      },
      standardHeaders: true,
      legacyHeaders: false
    });

    // Daily limit per user
    const dailyLimiter = rateLimit({
      keyGenerator: (req: express.Request) => (req.headers["x-n8n-key"] as string) || req.ip || "unknown",
      windowMs: 86400000, // 24 hours
      max: parseInt(process.env.DAILY_LIMIT || "100"),
      message: {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Daily limit exceeded. Max 100 requests per day." },
        id: null
      },
      standardHeaders: true,
      legacyHeaders: false
    });

    // Usage tracking middleware
    const trackUsage = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const apiKey = req.headers['x-n8n-key'] as string;
      if (!apiKey) { next(); return; }

      const now = Date.now();
      const usage = this.usageStore.get(apiKey) || {
        daily: 0, minute: 0, lastMinuteReset: now, lastDailyReset: now
      };

      if (now - usage.lastMinuteReset > 60000) { usage.minute = 0; usage.lastMinuteReset = now; }
      if (now - usage.lastDailyReset > 86400000) { usage.daily = 0; usage.lastDailyReset = now; }

      usage.daily++; usage.minute++;
      this.usageStore.set(apiKey, usage);
      next();
    };

    // SECURITY: Rate limiting for authentication endpoint
    // Prevents brute force attacks and DoS
    // See: https://github.com/czlonkowski/n8n-mcp/issues/265 (HIGH-02)
    const authLimiter = rateLimit({
      windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW || '900000'), // 15 minutes
      max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20'), // 20 authentication attempts per IP
      message: {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Too many authentication attempts. Please try again later.'
        },
        id: null
      },
      standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
      legacyHeaders: false, // Disable `X-RateLimit-*` headers
      handler: (req, res) => {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          event: 'rate_limit'
        });
        res.status(429).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Too many authentication attempts'
          },
          id: null
        });
      }
    });

    // ============= STATS ENDPOINT =============
    // Allows users to check their usage stats
    app.get('/stats', (req: express.Request, res: express.Response) => {
      const apiKey = req.query.api_key as string || req.headers['x-n8n-key'] as string;

      if (!apiKey) {
        res.status(400).json({
          error: 'Missing api_key parameter or x-n8n-key header',
          usage: 'GET /stats?api_key=YOUR_API_KEY or include x-n8n-key header'
        });
        return;
      }

      const maskedKey = apiKey.length > 15
        ? apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 5)
        : apiKey.substring(0, 5) + '...';

      const usage = this.usageStore.get(apiKey);
      const now = Date.now();

      if (!usage) {
        res.json({
          api_key: maskedKey,
          message: 'No usage recorded yet',
          limits: {
            per_minute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "50"),
            per_day: parseInt(process.env.DAILY_LIMIT || "100")
          }
        });
        return;
      }

      // Calculate remaining time until reset
      const minuteResetIn = Math.max(0, 60000 - (now - usage.lastMinuteReset));
      const dailyResetIn = Math.max(0, 86400000 - (now - usage.lastDailyReset));

      res.json({
        api_key: maskedKey,
        usage: {
          minute: {
            used: usage.minute,
            limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "50"),
            remaining: Math.max(0, parseInt(process.env.RATE_LIMIT_PER_MINUTE || "50") - usage.minute),
            resets_in_seconds: Math.ceil(minuteResetIn / 1000)
          },
          daily: {
            used: usage.daily,
            limit: parseInt(process.env.DAILY_LIMIT || "100"),
            remaining: Math.max(0, parseInt(process.env.DAILY_LIMIT || "100") - usage.daily),
            resets_in_hours: Math.ceil(dailyResetIn / 3600000)
          }
        },
        timestamp: new Date().toISOString()
      });
    });

    // Main MCP endpoint with authentication and rate limiting
    app.post('/mcp', dailyLimiter, rateLimiter, authLimiter, trackUsage, jsonParser, async (req: express.Request, res: express.Response): Promise<void> => {
      // Log comprehensive debug info about the request
      logger.info('POST /mcp request received - DETAILED DEBUG', {
        headers: req.headers,
        readable: req.readable,
        readableEnded: req.readableEnded,
        complete: req.complete,
        bodyType: typeof req.body,
        bodyContent: req.body ? JSON.stringify(req.body, null, 2) : 'undefined',
        contentLength: req.get('content-length'),
        contentType: req.get('content-type'),
        userAgent: req.get('user-agent'),
        ip: req.ip,
        method: req.method,
        url: req.url,
        originalUrl: req.originalUrl
      });

      // Handle connection close to immediately clean up sessions
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      // Only add event listener if the request object supports it (not in test mocks)
      if (typeof req.on === 'function') {
        const closeHandler = () => {
          if (!res.headersSent && sessionId) {
            logger.info('Connection closed before response sent', { sessionId });
            // Schedule immediate cleanup if connection closes unexpectedly
            setImmediate(() => {
              if (this.sessionManager.getSessionMetadata()[sessionId]) {
                const metadata = this.sessionManager.getSessionMetadata()[sessionId];
                const timeSinceAccess = Date.now() - metadata.lastAccess.getTime();
                // Only remove if it's been inactive for a bit to avoid race conditions
                if (timeSinceAccess > 60000) { // 1 minute
                  this.sessionManager.removeSession(sessionId, 'connection_closed').catch(err => {
                    logger.error('Error during connection close cleanup', { error: err });
                  });
                }
              }
            });
          }
        };

        req.on('close', closeHandler);

        // Clean up event listener when response ends to prevent memory leaks
        res.on('finish', () => {
          req.removeListener('close', closeHandler);
        });
      }

      // Enhanced authentication check with specific logging
      // Modified for multi-tenant: accept x-n8n-key header as auth fallback
      const authHeader = req.headers.authorization || (req.headers["x-n8n-key"] ? "Bearer " + req.headers["x-n8n-key"] : undefined);
      logger.info("[DEBUG] Auth headers check:", { authorization: req.headers.authorization, xN8nKey: req.headers["x-n8n-key"], allHeaders: Object.keys(req.headers) });
      const isMultiTenantRequest = !!req.headers["x-n8n-key"];

      // Check if Authorization header is missing
      if (!authHeader) {
        logger.warn('Authentication failed: Missing Authorization header', {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          reason: 'no_auth_header'
        });
        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized'
          },
          id: null
        });
        return;
      }

      // Check if Authorization header has Bearer prefix
      if (!authHeader.startsWith('Bearer ')) {
        logger.warn('Authentication failed: Invalid Authorization header format (expected Bearer token)', {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          reason: 'invalid_auth_format',
          headerPrefix: authHeader.substring(0, Math.min(authHeader.length, 10)) + '...'  // Log first 10 chars for debugging
        });
        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized'
          },
          id: null
        });
        return;
      }

      // Extract token and trim whitespace
      const token = authHeader.slice(7).trim();

      // SECURITY: Use timing-safe comparison to prevent timing attacks
      // See: https://github.com/czlonkowski/n8n-mcp/issues/265 (CRITICAL-02)
      // Skip AUTH_TOKEN validation for multi-tenant requests (they use x-n8n-key instead)
      const isValidToken = isMultiTenantRequest || (this.authToken &&
        AuthManager.timingSafeCompare(token, this.authToken));

      if (!isValidToken) {
        logger.warn('Authentication failed: Invalid token', {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          reason: 'invalid_token'
        });
        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized'
          },
          id: null
        });
        return;
      }

      // Handle request with single session
      logger.info('Authentication successful - proceeding to handleRequest', {
        hasSession: !!this.sessionManager.getLegacySession(),
        sessionType: this.sessionManager.getLegacySession()?.isSSE ? 'SSE' : 'StreamableHTTP',
        sessionInitialized: this.sessionManager.getLegacySession()?.initialized
      });

      // Extract instance context from headers if present (for multi-tenant support)
      const instanceContext: InstanceContext | undefined = (() => {
        // Use type-safe header extraction
        const headers = extractMultiTenantHeaders(req);
        const hasUrl = headers['x-n8n-url'];
        const hasKey = headers['x-n8n-key'];

        if (!hasUrl && !hasKey) return undefined;

        // Create context with proper type handling
        const context: InstanceContext = {
          n8nApiUrl: hasUrl || undefined,
          n8nApiKey: hasKey || undefined,
          instanceId: headers['x-instance-id'] || undefined,
          sessionId: headers['x-session-id'] || undefined
        };

        // Add metadata if available
        if (req.headers['user-agent'] || req.ip) {
          context.metadata = {
            userAgent: req.headers['user-agent'] as string | undefined,
            ip: req.ip
          };
        }

        // Validate the context
        const validation = validateInstanceContext(context);
        if (!validation.valid) {
          logger.warn('Invalid instance context from headers', {
            errors: validation.errors,
            hasUrl: !!hasUrl,
            hasKey: !!hasKey
          });
          return undefined;
        }

        return context;
      })();

      // Log context extraction for debugging (only if context exists)
      if (instanceContext) {
        // Use sanitized logging for security
        logger.debug('Instance context extracted from headers', {
          hasUrl: !!instanceContext.n8nApiUrl,
          hasKey: !!instanceContext.n8nApiKey,
          instanceId: instanceContext.instanceId ? instanceContext.instanceId.substring(0, 8) + '...' : undefined,
          sessionId: instanceContext.sessionId ? instanceContext.sessionId.substring(0, 8) + '...' : undefined,
          urlDomain: instanceContext.n8nApiUrl ? new URL(instanceContext.n8nApiUrl).hostname : undefined
        });
      }

      await this.handleRequest(req, res, instanceContext);

      logger.info('POST /mcp request completed - checking response status', {
        responseHeadersSent: res.headersSent,
        responseStatusCode: res.statusCode,
        responseFinished: res.finished
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Cannot ${req.method} ${req.path}`
      });
    });

    // Error handler
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Express error handler:', err);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: process.env.NODE_ENV === 'development' ? err.message : undefined
          },
          id: null
        });
      }
    });

    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';

    this.expressServer = app.listen(port, host, () => {
      const isProduction = process.env.NODE_ENV === 'production';
      const isDefaultToken = this.authToken === 'REPLACE_THIS_AUTH_TOKEN_32_CHARS_MIN_abcdefgh';

      logger.info(`n8n MCP Single-Session HTTP Server started`, {
        port,
        host,
        environment: process.env.NODE_ENV || 'development',
        maxSessions: MAX_SESSIONS,
        sessionTimeout: 30,
        production: isProduction,
        defaultToken: isDefaultToken
      });

      // Detect the base URL using our utility
      const baseUrl = getStartupBaseUrl(host, port);
      const endpoints = formatEndpointUrls(baseUrl);

      console.log(`n8n MCP Single-Session HTTP Server running on ${host}:${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Session Limits: ${MAX_SESSIONS} max sessions, 30min timeout`);
      console.log(`Health check: ${endpoints.health}`);
      console.log(`MCP endpoint: ${endpoints.mcp}`);

      if (isProduction) {
        console.log('🔒 Running in PRODUCTION mode - enhanced security enabled');
      } else {
        console.log('🛠️ Running in DEVELOPMENT mode');
      }

      console.log('\nPress Ctrl+C to stop the server');

      // Start periodic warning timer if using default token
      if (isDefaultToken && !isProduction) {
        setInterval(() => {
          logger.warn('⚠️ Still using default AUTH_TOKEN - security risk!');
          if (process.env.MCP_MODE === 'http') {
            console.warn('⚠️ REMINDER: Still using default AUTH_TOKEN - please change it!');
          }
        }, 300000); // Every 5 minutes
      }

      if (process.env.BASE_URL || process.env.PUBLIC_URL) {
        console.log(`\nPublic URL configured: ${baseUrl}`);
      } else if (process.env.TRUST_PROXY && Number(process.env.TRUST_PROXY) > 0) {
        console.log(`\nNote: TRUST_PROXY is enabled. URLs will be auto-detected from proxy headers.`);
      }
    });

    // Handle server errors
    this.expressServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
        console.error(`ERROR: Port ${port} is already in use`);
        process.exit(1);
      } else {
        logger.error('Server error:', error);
        console.error('Server error:', error);
        process.exit(1);
      }
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Single-Session HTTP server...');

    // Stop session cleanup timer
    this.sessionManager.stopSessionCleanup();

    // Close all active transports (SDK pattern)
    const sessionIds = Object.keys(this.sessionManager.getTransports());
    logger.info(`Closing ${sessionIds.length} active sessions`);

    for (const sessionId of sessionIds) {
      try {
        logger.info(`Closing transport for session ${sessionId}`);
        await this.sessionManager.removeSession(sessionId, 'server_shutdown');
      } catch (error) {
        logger.warn(`Error closing transport for session ${sessionId}:`, error);
      }
    }

    // Clean up legacy session (for SSE compatibility)
    const legacySession = this.sessionManager.getLegacySession();
    if (legacySession) {
      try {
        await legacySession.transport.close();
        logger.info('Legacy session closed');
      } catch (error) {
        logger.warn('Error closing legacy session:', error);
      }
      this.sessionManager.setLegacySession(null);
    }

    // Close Express server
    if (this.expressServer) {
      await new Promise<void>((resolve) => {
        this.expressServer.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }

    logger.info('Single-Session HTTP server shutdown completed');
  }

  /**
   * Get current session info (for testing/debugging)
   */
  getSessionInfo(): {
    active: boolean;
    sessionId?: string;
    age?: number;
    sessions?: {
      total: number;
      active: number;
      expired: number;
      max: number;
      sessionIds: string[];
    };
  } {
    const metrics = this.sessionManager.getSessionMetrics();
    const legacySession = this.sessionManager.getLegacySession();

    // Legacy SSE session info
    if (!legacySession) {
      return {
        active: false,
        sessions: {
          total: metrics.totalSessions,
          active: metrics.activeSessions,
          expired: metrics.expiredSessions,
          max: MAX_SESSIONS,
          sessionIds: Object.keys(this.sessionManager.getTransports())
        }
      };
    }

    return {
      active: true,
      sessionId: legacySession.sessionId,
      age: Date.now() - legacySession.lastAccess.getTime(),
      sessions: {
        total: metrics.totalSessions,
        active: metrics.activeSessions,
        expired: metrics.expiredSessions,
        max: MAX_SESSIONS,
        sessionIds: Object.keys(this.sessionManager.getTransports())
      }
    };
  }

  /**
   * Export all active session state for persistence
   */
  public exportSessionState(): SessionState[] {
    return this.sessionManager.exportSessionState();
  }

  /**
   * Restore session state from previously exported data
   */
  public restoreSessionState(sessions: SessionState[]): number {
    return this.sessionManager.restoreSessionState(sessions);
  }
}

// Start if called directly
if (require.main === module) {
  const server = new SingleSessionHTTPServer();

  // Graceful shutdown handlers
  const shutdown = async () => {
    await server.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    console.error('Uncaught exception:', error);
    shutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', reason);
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    shutdown();
  });

  // Start server
  server.start().catch(error => {
    logger.error('Failed to start Single-Session HTTP server:', error);
    console.error('Failed to start Single-Session HTTP server:', error);
    process.exit(1);
  });
}

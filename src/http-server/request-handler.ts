/**
 * MCP request handler
 * Handles incoming MCP requests using proper SDK pattern
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { N8NDocumentationMCPServer } from '../mcp/server';
import { logger } from '../utils/logger';
import { InstanceContext } from '../types/instance-context';
import { SessionManager, MAX_SESSIONS } from './session-manager';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

/**
 * Sanitize error information for client responses
 */
function sanitizeErrorForClient(error: unknown): { message: string; code: string } {
  const isProduction = process.env.NODE_ENV === 'production';

  if (error instanceof Error) {
    // In production, only return generic messages
    if (isProduction) {
      // Map known error types to safe messages
      if (error.message.includes('Unauthorized') || error.message.includes('authentication')) {
        return { message: 'Authentication failed', code: 'AUTH_ERROR' };
      }
      if (error.message.includes('Session') || error.message.includes('session')) {
        return { message: 'Session error', code: 'SESSION_ERROR' };
      }
      if (error.message.includes('Invalid') || error.message.includes('validation')) {
        return { message: 'Validation error', code: 'VALIDATION_ERROR' };
      }
      // Default generic error
      return { message: 'Internal server error', code: 'INTERNAL_ERROR' };
    }

    // In development, return more details but no stack traces
    return {
      message: error.message.substring(0, 200), // Limit message length
      code: error.name || 'ERROR'
    };
  }

  // For non-Error objects
  return { message: 'An error occurred', code: 'UNKNOWN_ERROR' };
}

/**
 * Handle incoming MCP request using proper SDK pattern
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param sessionManager - Session manager instance
 * @param instanceContext - Optional instance-specific configuration
 */
export async function handleMCPRequest(
  req: express.Request,
  res: express.Response,
  sessionManager: SessionManager,
  instanceContext?: InstanceContext
): Promise<void> {
  const startTime = Date.now();

  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const isInitialize = req.body ? isInitializeRequest(req.body) : false;

    // Log comprehensive incoming request details for debugging
    logger.info('handleRequest: Processing MCP request - SDK PATTERN', {
      requestId: req.get('x-request-id') || 'unknown',
      sessionId: sessionId,
      method: req.method,
      url: req.url,
      bodyType: typeof req.body,
      bodyContent: req.body ? JSON.stringify(req.body, null, 2) : 'undefined',
      existingTransports: Object.keys(sessionManager.getTransports()),
      isInitializeRequest: isInitialize
    });

    let transport: StreamableHTTPServerTransport;

    if (isInitialize) {
      // Check session limits before creating new session
      if (!sessionManager.canCreateSession()) {
        logger.warn('handleRequest: Session limit reached', {
          currentSessions: sessionManager.getActiveSessionCount(),
          maxSessions: MAX_SESSIONS
        });

        res.status(429).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: `Session limit reached (${MAX_SESSIONS}). Please wait for existing sessions to expire.`
          },
          id: req.body?.id || null
        });
        return;
      }

      // For initialize requests: always create new transport and server
      logger.info('handleRequest: Creating new transport for initialize request');

      // Generate session ID based on multi-tenant configuration
      let sessionIdToUse: string;

      const isMultiTenantEnabled = process.env.ENABLE_MULTI_TENANT === 'true';
      const sessionStrategy = process.env.MULTI_TENANT_SESSION_STRATEGY || 'instance';

      if (isMultiTenantEnabled && sessionStrategy === 'instance' && instanceContext?.instanceId) {
        // In multi-tenant mode with instance strategy, create session per instance
        // This ensures each tenant gets isolated sessions
        // Include configuration hash to prevent collisions with different configs
        const configHash = createHash('sha256')
          .update(JSON.stringify({
            url: instanceContext.n8nApiUrl,
            instanceId: instanceContext.instanceId
          }))
          .digest('hex')
          .substring(0, 8);

        sessionIdToUse = `instance-${instanceContext.instanceId}-${configHash}-${uuidv4()}`;
        logger.info('Multi-tenant mode: Creating instance-specific session', {
          instanceId: instanceContext.instanceId,
          configHash,
          sessionId: sessionIdToUse
        });
      } else {
        // Use client-provided session ID or generate a standard one
        sessionIdToUse = sessionId || uuidv4();
      }

      const server = new N8NDocumentationMCPServer(instanceContext);

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionIdToUse,
        onsessioninitialized: (initializedSessionId: string) => {
          // Store both transport and server by session ID when session is initialized
          logger.info('handleRequest: Session initialized, storing transport and server', {
            sessionId: initializedSessionId
          });
          sessionManager.storeSession(initializedSessionId, transport, server, instanceContext);
        }
      });

      // Set up cleanup handlers
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          logger.info('handleRequest: Transport closed, cleaning up', { sessionId: sid });
          sessionManager.removeSession(sid, 'transport_closed');
        }
      };

      // Handle transport errors to prevent connection drops
      transport.onerror = (error: Error) => {
        const sid = transport.sessionId;
        logger.error('Transport error', { sessionId: sid, error: error.message });
        if (sid) {
          sessionManager.removeSession(sid, 'transport_error').catch(err => {
            logger.error('Error during transport error cleanup', { error: err });
          });
        }
      };

      // Connect the server to the transport BEFORE handling the request
      logger.info('handleRequest: Connecting server to new transport');
      await server.connect(transport);

    } else if (sessionId && sessionManager.getTransports()[sessionId]) {
      // Validate session ID format
      if (!sessionManager.isValidSessionId(sessionId)) {
        logger.warn('handleRequest: Invalid session ID format', { sessionId });
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Invalid session ID format'
          },
          id: req.body?.id || null
        });
        return;
      }

      // For non-initialize requests: reuse existing transport for this session
      logger.info('handleRequest: Reusing existing transport for session', { sessionId });
      transport = sessionManager.getTransports()[sessionId];

      // In multi-tenant shared mode, update instance context if provided
      const isMultiTenantEnabled = process.env.ENABLE_MULTI_TENANT === 'true';
      const sessionStrategy = process.env.MULTI_TENANT_SESSION_STRATEGY || 'instance';

      if (isMultiTenantEnabled && sessionStrategy === 'shared' && instanceContext) {
        // Update the context for this session with locking to prevent race conditions
        await sessionManager.switchSessionContext(sessionId, instanceContext);
      }

      // Update session access time
      sessionManager.updateSessionAccess(sessionId);

    } else {
      // Invalid request - no session ID and not an initialize request
      const errorDetails = {
        hasSessionId: !!sessionId,
        isInitialize: isInitialize,
        sessionIdValid: sessionId ? sessionManager.isValidSessionId(sessionId) : false,
        sessionExists: sessionId ? !!sessionManager.getTransports()[sessionId] : false
      };

      logger.warn('handleRequest: Invalid request - no session ID and not initialize', errorDetails);

      let errorMessage = 'Bad Request: No valid session ID provided and not an initialize request';
      if (sessionId && !sessionManager.isValidSessionId(sessionId)) {
        errorMessage = 'Bad Request: Invalid session ID format';
      } else if (sessionId && !sessionManager.getTransports()[sessionId]) {
        errorMessage = 'Bad Request: Session not found or expired';
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: errorMessage
        },
        id: req.body?.id || null
      });
      return;
    }

    // Handle request with the transport
    logger.info('handleRequest: Handling request with transport', {
      sessionId: isInitialize ? 'new' : sessionId,
      isInitialize
    });
    await transport.handleRequest(req, res, req.body);

    const duration = Date.now() - startTime;
    logger.info('MCP request completed', { duration, sessionId: transport.sessionId });

  } catch (error) {
    logger.error('handleRequest: MCP request error:', {
      error: error instanceof Error ? error.message : error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      activeTransports: Object.keys(sessionManager.getTransports()),
      requestDetails: {
        method: req.method,
        url: req.url,
        hasBody: !!req.body,
        sessionId: req.headers['mcp-session-id']
      },
      duration: Date.now() - startTime
    });

    if (!res.headersSent) {
      // Send sanitized error to client
      const sanitizedError = sanitizeErrorForClient(error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: sanitizedError.message,
          data: {
            code: sanitizedError.code
          }
        },
        id: req.body?.id || null
      });
    }
  }
}

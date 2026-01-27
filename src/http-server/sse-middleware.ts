/**
 * SSE (Server-Sent Events) middleware and handlers
 * Provides SSE-to-JSON conversion for n8n compatibility
 */
import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { N8NDocumentationMCPServer } from '../mcp/server';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Session } from './types';

/**
 * SSE to JSON conversion middleware for n8n compatibility
 * Intercepts responses and converts SSE format to JSON when client doesn't accept text/event-stream
 */
export function sseToJsonMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const accept = req.headers.accept || '';
  const clientWantsJSON = !accept.includes('text/event-stream');

  if (clientWantsJSON) {
    // Inject SSE for SDK validation
    req.headers.accept = accept ? accept + ', text/event-stream' : 'application/json, text/event-stream';

    // Intercept ALL response methods
    const originalWriteHead = res.writeHead.bind(res);
    const originalSetHeader = res.setHeader.bind(res);
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    let chunks: Buffer[] = [];
    let headers: any = {};
    let statusCode = 200;
    let headersSent = false;

    // Intercept writeHead
    res.writeHead = function(code: number, ...args: any[]): any {
      statusCode = code;
      if (args[0] && typeof args[0] === 'object') {
        headers = { ...headers, ...args[0] };
      }
      return res;
    };

    // Intercept setHeader
    res.setHeader = function(name: string, value: any): any {
      headers[name] = value;
      return res;
    };

    // Intercept write
    res.write = function(chunk: any, ...args: any[]): boolean {
      if (chunk) chunks.push(Buffer.from(chunk));
      return true;
    };

    // Intercept end
    res.end = function(chunk: any, ...args: any[]): any {
      if (chunk) chunks.push(Buffer.from(chunk));

      const fullResponse = Buffer.concat(chunks).toString('utf-8');

      // Convert SSE to JSON
      if (fullResponse.startsWith('event: message\ndata:') || fullResponse.startsWith('event: message\r\ndata:')) {
        const dataMatch = fullResponse.match(/data:\s*({.*})/);
        if (dataMatch && dataMatch[1]) {
          try {
            const jsonData = JSON.parse(dataMatch[1]);
            originalSetHeader('Content-Type', 'application/json');
            originalWriteHead(statusCode);
            return originalEnd(JSON.stringify(jsonData));
          } catch (e) {
            logger.error('[SSE-JSON] Parse error:', e);
          }
        }
      }

      // Fallback: send as-is
      Object.keys(headers).forEach(h => originalSetHeader(h, headers[h]));
      originalWriteHead(statusCode);
      chunks.forEach(c => originalWrite(c));
      return originalEnd();
    };
  }

  next();
}

/**
 * Reset the session for SSE - clean up old and create new SSE transport
 */
export async function resetSessionSSE(
  res: express.Response,
  currentSession: Session | null,
  setSession: (session: Session | null) => void
): Promise<void> {
  // Clean up old session if exists
  if (currentSession) {
    try {
      logger.info('Closing previous session for SSE', { sessionId: currentSession.sessionId });
      await currentSession.transport.close();
    } catch (error) {
      logger.warn('Error closing previous session:', error);
    }
  }

  try {
    // Create new session
    logger.info('Creating new N8NDocumentationMCPServer for SSE...');
    const server = new N8NDocumentationMCPServer();

    // Generate cryptographically secure session ID
    const sessionId = uuidv4();

    logger.info('Creating SSEServerTransport...');
    const transport = new SSEServerTransport('/mcp', res);

    logger.info('Connecting server to SSE transport...');
    await server.connect(transport);

    // Note: server.connect() automatically calls transport.start(), so we don't need to call it again

    const newSession: Session = {
      server,
      transport,
      lastAccess: new Date(),
      sessionId,
      initialized: false,
      isSSE: true
    };

    setSession(newSession);
    logger.info('Created new SSE session successfully', { sessionId });
  } catch (error) {
    logger.error('Failed to create SSE session:', error);
    throw error;
  }
}

/**
 * Type definitions for HTTP server
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { N8NDocumentationMCPServer } from '../mcp/server';

// Type-safe headers interface for multi-tenant support
export interface MultiTenantHeaders {
  'x-n8n-url'?: string;
  'x-n8n-key'?: string;
  'x-instance-id'?: string;
  'x-session-id'?: string;
}

export interface Session {
  server: N8NDocumentationMCPServer;
  transport: StreamableHTTPServerTransport | SSEServerTransport;
  lastAccess: Date;
  sessionId: string;
  initialized: boolean;
  isSSE: boolean;
}

export interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  lastCleanup: Date;
}

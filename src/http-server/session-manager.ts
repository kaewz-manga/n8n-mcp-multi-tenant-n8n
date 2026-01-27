/**
 * Session management for HTTP server
 * Handles session lifecycle, cleanup, and persistence
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { N8NDocumentationMCPServer } from '../mcp/server';
import { logger } from '../utils/logger';
import { InstanceContext } from '../types/instance-context';
import { SessionState } from '../types/session-state';
import { Session, SessionMetrics } from './types';
import { exportSessionState as exportState, restoreSessionState as restoreState } from './session-persistence';

// Session management constants
export const MAX_SESSIONS = Math.max(1, parseInt(process.env.N8N_MCP_MAX_SESSIONS || '100', 10));
export const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * SessionManager handles all session lifecycle operations
 */
export class SessionManager {
  // Map to store transports by session ID (following SDK pattern)
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  private servers: { [sessionId: string]: N8NDocumentationMCPServer } = {};
  private sessionMetadata: { [sessionId: string]: { lastAccess: Date; createdAt: Date } } = {};
  private sessionContexts: { [sessionId: string]: InstanceContext | undefined } = {};
  private contextSwitchLocks: Map<string, Promise<void>> = new Map();
  private session: Session | null = null;  // Keep for SSE compatibility
  private sessionTimeout: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(sessionTimeout: number = 30 * 60 * 1000) {
    this.sessionTimeout = sessionTimeout;
  }

  /**
   * Get all transports (for external access)
   */
  public getTransports(): { [sessionId: string]: StreamableHTTPServerTransport } {
    return this.transports;
  }

  /**
   * Get all servers (for external access)
   */
  public getServers(): { [sessionId: string]: N8NDocumentationMCPServer } {
    return this.servers;
  }

  /**
   * Get session metadata (for external access)
   */
  public getSessionMetadata(): { [sessionId: string]: { lastAccess: Date; createdAt: Date } } {
    return this.sessionMetadata;
  }

  /**
   * Get session contexts (for external access)
   */
  public getSessionContexts(): { [sessionId: string]: InstanceContext | undefined } {
    return this.sessionContexts;
  }

  /**
   * Get legacy session (for SSE compatibility)
   */
  public getLegacySession(): Session | null {
    return this.session;
  }

  /**
   * Set legacy session (for SSE compatibility)
   */
  public setLegacySession(session: Session | null): void {
    this.session = session;
  }

  /**
   * Start periodic session cleanup
   */
  public startSessionCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        logger.error('Error during session cleanup', error);
      }
    }, SESSION_CLEANUP_INTERVAL);

    logger.info('Session cleanup started', {
      interval: SESSION_CLEANUP_INTERVAL / 1000 / 60,
      maxSessions: MAX_SESSIONS,
      sessionTimeout: this.sessionTimeout / 1000 / 60
    });
  }

  /**
   * Stop session cleanup
   */
  public stopSessionCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('Session cleanup timer stopped');
    }
  }

  /**
   * Clean up expired sessions based on last access time
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    // Check for expired sessions
    for (const sessionId in this.sessionMetadata) {
      const metadata = this.sessionMetadata[sessionId];
      if (now - metadata.lastAccess.getTime() > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    // Also check for orphaned contexts (sessions that were removed but context remained)
    for (const sessionId in this.sessionContexts) {
      if (!this.sessionMetadata[sessionId]) {
        // Context exists but session doesn't - clean it up
        delete this.sessionContexts[sessionId];
        logger.debug('Cleaned orphaned session context', { sessionId });
      }
    }

    // Remove expired sessions
    for (const sessionId of expiredSessions) {
      this.removeSession(sessionId, 'expired');
    }

    if (expiredSessions.length > 0) {
      logger.info('Cleaned up expired sessions', {
        removed: expiredSessions.length,
        remaining: this.getActiveSessionCount()
      });
    }
  }

  /**
   * Remove a session and clean up resources
   */
  public async removeSession(sessionId: string, reason: string): Promise<void> {
    try {
      // Store references before deletion
      const transport = this.transports[sessionId];
      const server = this.servers[sessionId];

      // Delete references FIRST to prevent onclose handler from triggering recursion
      // This breaks the circular reference: removeSession -> close -> onclose -> removeSession
      delete this.transports[sessionId];
      delete this.servers[sessionId];
      delete this.sessionMetadata[sessionId];
      delete this.sessionContexts[sessionId];

      // Close server first (may have references to transport)
      // This fixes memory leak where server resources weren't freed (issue #471)
      // Handle server close errors separately so transport close still runs
      if (server && typeof server.close === 'function') {
        try {
          await server.close();
        } catch (serverError) {
          logger.warn('Error closing server', { sessionId, error: serverError });
        }
      }

      // Close transport last
      // When onclose handler fires, it won't find the transport anymore
      if (transport) {
        await transport.close();
      }

      logger.info('Session removed', { sessionId, reason });
    } catch (error) {
      logger.warn('Error removing session', { sessionId, reason, error });
    }
  }

  /**
   * Get current active session count
   */
  public getActiveSessionCount(): number {
    return Object.keys(this.transports).length;
  }

  /**
   * Check if we can create a new session
   */
  public canCreateSession(): boolean {
    return this.getActiveSessionCount() < MAX_SESSIONS;
  }

  /**
   * Validate session ID format
   *
   * Accepts any non-empty string to support various MCP clients:
   * - UUIDv4 (internal n8n-mcp format)
   * - instance-{userId}-{hash}-{uuid} (multi-tenant format)
   * - Custom formats from mcp-remote and other proxies
   *
   * Security: Session validation happens via lookup in this.transports,
   * not format validation. This ensures compatibility with all MCP clients.
   *
   * @param sessionId - Session identifier from MCP client
   * @returns true if valid, false otherwise
   */
  public isValidSessionId(sessionId: string): boolean {
    // Accept any non-empty string as session ID
    // This ensures compatibility with all MCP clients and proxies
    return Boolean(sessionId && sessionId.length > 0);
  }

  /**
   * Update session last access time
   */
  public updateSessionAccess(sessionId: string): void {
    if (this.sessionMetadata[sessionId]) {
      this.sessionMetadata[sessionId].lastAccess = new Date();
    }
  }

  /**
   * Switch session context with locking to prevent race conditions
   */
  public async switchSessionContext(sessionId: string, newContext: InstanceContext): Promise<void> {
    // Check if there's already a switch in progress for this session
    const existingLock = this.contextSwitchLocks.get(sessionId);
    if (existingLock) {
      // Wait for the existing switch to complete
      await existingLock;
      return;
    }

    // Create a promise for this switch operation
    const switchPromise = this.performContextSwitch(sessionId, newContext);
    this.contextSwitchLocks.set(sessionId, switchPromise);

    try {
      await switchPromise;
    } finally {
      // Clean up the lock after completion
      this.contextSwitchLocks.delete(sessionId);
    }
  }

  /**
   * Perform the actual context switch
   */
  private async performContextSwitch(sessionId: string, newContext: InstanceContext): Promise<void> {
    const existingContext = this.sessionContexts[sessionId];

    // Only switch if the context has actually changed
    if (JSON.stringify(existingContext) !== JSON.stringify(newContext)) {
      logger.info('Multi-tenant shared mode: Updating instance context for session', {
        sessionId,
        oldInstanceId: existingContext?.instanceId,
        newInstanceId: newContext.instanceId
      });

      // Update the session context
      this.sessionContexts[sessionId] = newContext;

      // Update the MCP server's instance context if it exists
      if (this.servers[sessionId]) {
        (this.servers[sessionId] as any).instanceContext = newContext;
      }
    }
  }

  /**
   * Get session metrics for monitoring
   */
  public getSessionMetrics(): SessionMetrics {
    const now = Date.now();
    let expiredCount = 0;

    for (const sessionId in this.sessionMetadata) {
      const metadata = this.sessionMetadata[sessionId];
      if (now - metadata.lastAccess.getTime() > this.sessionTimeout) {
        expiredCount++;
      }
    }

    return {
      totalSessions: Object.keys(this.sessionMetadata).length,
      activeSessions: this.getActiveSessionCount(),
      expiredSessions: expiredCount,
      lastCleanup: new Date()
    };
  }

  /**
   * Check if current session is expired (legacy SSE)
   */
  public isExpired(): boolean {
    if (!this.session) return true;
    return Date.now() - this.session.lastAccess.getTime() > this.sessionTimeout;
  }

  /**
   * Check if a specific session is expired based on sessionId
   * Used for multi-session expiration checks during export/restore
   *
   * @param sessionId - The session ID to check
   * @returns true if session is expired or doesn't exist
   */
  public isSessionExpired(sessionId: string): boolean {
    const metadata = this.sessionMetadata[sessionId];
    if (!metadata) return true;
    return Date.now() - metadata.lastAccess.getTime() > this.sessionTimeout;
  }

  /**
   * Store a new transport and server for a session
   */
  public storeSession(
    sessionId: string,
    transport: StreamableHTTPServerTransport,
    server: N8NDocumentationMCPServer,
    context?: InstanceContext
  ): void {
    this.transports[sessionId] = transport;
    this.servers[sessionId] = server;
    this.sessionMetadata[sessionId] = {
      lastAccess: new Date(),
      createdAt: new Date()
    };
    this.sessionContexts[sessionId] = context;
  }

  /**
   * Export all active session state for persistence
   *
   * Used by multi-tenant backends to dump sessions before container restart.
   * This method exports the minimal state needed to restore sessions after
   * a restart: session metadata (timing) and instance context (credentials).
   *
   * Transport and server objects are NOT persisted - they will be recreated
   * on the first request after restore.
   *
   * SECURITY WARNING: The exported data contains plaintext n8n API keys.
   * The downstream application MUST encrypt this data before persisting to disk.
   *
   * @returns Array of session state objects, excluding expired sessions
   *
   * @example
   * // Before shutdown
   * const sessions = sessionManager.exportSessionState();
   * await saveToEncryptedStorage(sessions);
   */
  public exportSessionState(): SessionState[] {
    return exportState(
      this.sessionMetadata,
      this.sessionContexts,
      this.isSessionExpired.bind(this)
    );
  }

  /**
   * Restore session state from previously exported data
   *
   * Used by multi-tenant backends to restore sessions after container restart.
   * This method restores only the session metadata and instance context.
   * Transport and server objects will be recreated on the first request.
   *
   * Restored sessions are "dormant" until a client makes a request, at which
   * point the transport and server will be initialized normally.
   *
   * @param sessions - Array of session state objects from exportSessionState()
   * @returns Number of sessions successfully restored
   *
   * @example
   * // After startup
   * const sessions = await loadFromEncryptedStorage();
   * const count = sessionManager.restoreSessionState(sessions);
   * console.log(`Restored ${count} sessions`);
   */
  public restoreSessionState(sessions: SessionState[]): number {
    return restoreState(
      sessions,
      this.sessionMetadata,
      this.sessionContexts,
      this.sessionTimeout
    );
  }
}

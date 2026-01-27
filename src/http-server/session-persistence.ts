/**
 * Session persistence for multi-tenant deployments
 * Handles export and restore of session state
 */
import { logger } from '../utils/logger';
import { InstanceContext, validateInstanceContext } from '../types/instance-context';
import { SessionState } from '../types/session-state';
import { MAX_SESSIONS } from './session-manager';

/**
 * Security logging helper for audit trails
 * Provides structured logging for security-relevant events
 */
function logSecurityEvent(
  event: 'session_export' | 'session_restore' | 'session_restore_failed' | 'max_sessions_reached',
  details: {
    sessionId?: string;
    reason?: string;
    count?: number;
    instanceId?: string;
  }
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    ...details
  };

  // Log to standard logger with [SECURITY] prefix for easy filtering
  logger.info(`[SECURITY] ${event}`, logEntry);
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
 * @param sessionMetadata - Session metadata map
 * @param sessionContexts - Session contexts map
 * @param isSessionExpired - Function to check if session is expired
 * @returns Array of session state objects, excluding expired sessions
 *
 * @example
 * // Before shutdown
 * const sessions = exportSessionState(metadata, contexts, isExpired);
 * await saveToEncryptedStorage(sessions);
 */
export function exportSessionState(
  sessionMetadata: { [sessionId: string]: { lastAccess: Date; createdAt: Date } },
  sessionContexts: { [sessionId: string]: InstanceContext | undefined },
  isSessionExpired: (sessionId: string) => boolean
): SessionState[] {
  const sessions: SessionState[] = [];
  const seenSessionIds = new Set<string>();

  // Iterate over all sessions with metadata (source of truth for active sessions)
  for (const sessionId of Object.keys(sessionMetadata)) {
    // Check for duplicates (defensive programming)
    if (seenSessionIds.has(sessionId)) {
      logger.warn(`Duplicate sessionId detected during export: ${sessionId}`);
      continue;
    }

    // Skip expired sessions - they're not worth persisting
    if (isSessionExpired(sessionId)) {
      continue;
    }

    const metadata = sessionMetadata[sessionId];
    const context = sessionContexts[sessionId];

    // Skip sessions without context - these can't be restored meaningfully
    // (Context is required to reconnect to the correct n8n instance)
    if (!context || !context.n8nApiUrl || !context.n8nApiKey) {
      logger.debug(`Skipping session ${sessionId} - missing required context`);
      continue;
    }

    seenSessionIds.add(sessionId);
    sessions.push({
      sessionId,
      metadata: {
        createdAt: metadata.createdAt.toISOString(),
        lastAccess: metadata.lastAccess.toISOString()
      },
      context: {
        n8nApiUrl: context.n8nApiUrl,
        n8nApiKey: context.n8nApiKey,
        instanceId: context.instanceId || sessionId, // Use sessionId as fallback
        sessionId: context.sessionId,
        metadata: context.metadata
      }
    });
  }

  logger.info(`Exported ${sessions.length} session(s) for persistence`);
  logSecurityEvent('session_export', { count: sessions.length });
  return sessions;
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
 * @param sessionMetadata - Session metadata map to populate
 * @param sessionContexts - Session contexts map to populate
 * @param sessionTimeout - Session timeout in milliseconds
 * @returns Number of sessions successfully restored
 *
 * @example
 * // After startup
 * const sessions = await loadFromEncryptedStorage();
 * const count = restoreSessionState(sessions, metadata, contexts, timeout);
 * console.log(`Restored ${count} sessions`);
 */
export function restoreSessionState(
  sessions: SessionState[],
  sessionMetadata: { [sessionId: string]: { lastAccess: Date; createdAt: Date } },
  sessionContexts: { [sessionId: string]: InstanceContext | undefined },
  sessionTimeout: number
): number {
  let restoredCount = 0;

  for (const sessionState of sessions) {
    try {
      // Skip null or invalid session objects
      if (!sessionState || typeof sessionState !== 'object' || !sessionState.sessionId) {
        logger.warn('Skipping invalid session state object');
        continue;
      }

      // Check if we've hit the MAX_SESSIONS limit (check real-time count)
      if (Object.keys(sessionMetadata).length >= MAX_SESSIONS) {
        logger.warn(
          `Reached MAX_SESSIONS limit (${MAX_SESSIONS}), skipping remaining sessions`
        );
        logSecurityEvent('max_sessions_reached', { count: MAX_SESSIONS });
        break;
      }

      // Skip if session already exists (duplicate sessionId)
      if (sessionMetadata[sessionState.sessionId]) {
        logger.debug(`Skipping session ${sessionState.sessionId} - already exists`);
        continue;
      }

      // Parse and validate dates first
      const createdAt = new Date(sessionState.metadata.createdAt);
      const lastAccess = new Date(sessionState.metadata.lastAccess);

      if (isNaN(createdAt.getTime()) || isNaN(lastAccess.getTime())) {
        logger.warn(
          `Skipping session ${sessionState.sessionId} - invalid date format`
        );
        continue;
      }

      // Validate session isn't expired
      const age = Date.now() - lastAccess.getTime();
      if (age > sessionTimeout) {
        logger.debug(
          `Skipping session ${sessionState.sessionId} - expired (age: ${Math.round(age / 1000)}s)`
        );
        continue;
      }

      // Validate context exists (TypeScript null narrowing)
      if (!sessionState.context) {
        logger.warn(`Skipping session ${sessionState.sessionId} - missing context`);
        continue;
      }

      // Validate context structure using existing validation
      const validation = validateInstanceContext(sessionState.context);
      if (!validation.valid) {
        const reason = validation.errors?.join(', ') || 'invalid context';
        logger.warn(
          `Skipping session ${sessionState.sessionId} - invalid context: ${reason}`
        );
        logSecurityEvent('session_restore_failed', {
          sessionId: sessionState.sessionId,
          reason
        });
        continue;
      }

      // Restore session metadata
      sessionMetadata[sessionState.sessionId] = {
        createdAt,
        lastAccess
      };

      // Restore session context
      sessionContexts[sessionState.sessionId] = {
        n8nApiUrl: sessionState.context.n8nApiUrl,
        n8nApiKey: sessionState.context.n8nApiKey,
        instanceId: sessionState.context.instanceId,
        sessionId: sessionState.context.sessionId,
        metadata: sessionState.context.metadata
      };

      logger.debug(`Restored session ${sessionState.sessionId}`);
      logSecurityEvent('session_restore', {
        sessionId: sessionState.sessionId,
        instanceId: sessionState.context.instanceId
      });
      restoredCount++;
    } catch (error) {
      logger.error(`Failed to restore session ${sessionState.sessionId}:`, error);
      logSecurityEvent('session_restore_failed', {
        sessionId: sessionState.sessionId,
        reason: error instanceof Error ? error.message : 'unknown error'
      });
      // Continue with next session - don't let one failure break the entire restore
    }
  }

  logger.info(
    `Restored ${restoredCount}/${sessions.length} session(s) from persistence`
  );
  return restoredCount;
}

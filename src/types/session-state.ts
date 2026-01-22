/**
 * Session persistence types for multi-tenant deployments
 *
 * These types support exporting and restoring MCP session state across
 * container restarts, enabling seamless session persistence in production.
 */

import { InstanceContext } from './instance-context.js';

/**
 * Serializable session state for persistence across restarts
 *
 * This interface represents the minimal state needed to restore an MCP session
 * after a container restart. Only the session metadata and instance context are
 * persisted - transport and server objects are recreated on the first request.
 *
 * @example
 * // Export sessions before shutdown
 * const sessions = server.exportSessionState();
 * await saveToEncryptedStorage(sessions);
 *
 * @example
 * // Restore sessions on startup
 * const sessions = await loadFromEncryptedStorage();
 * const count = server.restoreSessionState(sessions);
 * console.log(`Restored ${count} sessions`);
 */
export interface SessionState {
  /**
   * Unique session identifier
   * Format: UUID v4 or custom format from MCP proxy
   */
  sessionId: string;

  /**
   * Session timing metadata for expiration tracking
   */
  metadata: {
    /**
     * When the session was created (ISO 8601 timestamp)
     * Used to track total session age
     */
    createdAt: string;

    /**
     * When the session was last accessed (ISO 8601 timestamp)
     * Used to determine if session has expired based on timeout
     */
    lastAccess: string;
  };

  /**
   * n8n instance context (credentials and configuration)
   *
   * Contains the n8n API credentials and instance-specific settings.
   * This is the critical data needed to reconnect to the correct n8n instance.
   *
   * Note: API keys are stored in plaintext. The downstream application
   * MUST encrypt this data before persisting to disk.
   */
  context: {
    /**
     * n8n instance API URL
     * Example: "https://n8n.example.com"
     */
    n8nApiUrl: string;

    /**
     * n8n instance API key (plaintext - encrypt before storage!)
     * Example: "n8n_api_1234567890abcdef"
     */
    n8nApiKey: string;

    /**
     * Instance identifier (optional)
     * Custom identifier for tracking which n8n instance this session belongs to
     */
    instanceId?: string;

    /**
     * Session-specific ID (optional)
     * May differ from top-level sessionId in some proxy configurations
     */
    sessionId?: string;

    /**
     * Additional metadata (optional)
     * Extensible field for custom application data
     */
    metadata?: Record<string, any>;
  };
}

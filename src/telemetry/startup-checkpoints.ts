/**
 * Startup Checkpoint System
 * Defines checkpoints throughout the server initialization process
 * to identify where failures occur
 */

/**
 * Startup checkpoint constants
 * These checkpoints mark key stages in the server initialization process
 */
export const STARTUP_CHECKPOINTS = {
  /** Process has started, very first checkpoint */
  PROCESS_STARTED: 'process_started',

  /** About to connect to database */
  DATABASE_CONNECTING: 'database_connecting',

  /** Database connection successful */
  DATABASE_CONNECTED: 'database_connected',

  /** About to check n8n API configuration (if applicable) */
  N8N_API_CHECKING: 'n8n_api_checking',

  /** n8n API is configured and ready (if applicable) */
  N8N_API_READY: 'n8n_api_ready',

  /** About to initialize telemetry system */
  TELEMETRY_INITIALIZING: 'telemetry_initializing',

  /** Telemetry system is ready */
  TELEMETRY_READY: 'telemetry_ready',

  /** About to start MCP handshake */
  MCP_HANDSHAKE_STARTING: 'mcp_handshake_starting',

  /** MCP handshake completed successfully */
  MCP_HANDSHAKE_COMPLETE: 'mcp_handshake_complete',

  /** Server is fully ready to handle requests */
  SERVER_READY: 'server_ready',
} as const;

/**
 * Type for checkpoint names
 */
export type StartupCheckpoint = typeof STARTUP_CHECKPOINTS[keyof typeof STARTUP_CHECKPOINTS];

/**
 * Checkpoint data structure
 */
export interface CheckpointData {
  name: StartupCheckpoint;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Get all checkpoint names in order
 */
export function getAllCheckpoints(): StartupCheckpoint[] {
  return Object.values(STARTUP_CHECKPOINTS);
}

/**
 * Find which checkpoint failed based on the list of passed checkpoints
 * Returns the first checkpoint that was not passed
 */
export function findFailedCheckpoint(passedCheckpoints: string[]): StartupCheckpoint {
  const allCheckpoints = getAllCheckpoints();

  for (const checkpoint of allCheckpoints) {
    if (!passedCheckpoints.includes(checkpoint)) {
      return checkpoint;
    }
  }

  // If all checkpoints were passed, the failure must have occurred after SERVER_READY
  // This would be an unexpected post-initialization failure
  return STARTUP_CHECKPOINTS.SERVER_READY;
}

/**
 * Validate if a string is a valid checkpoint
 */
export function isValidCheckpoint(checkpoint: string): checkpoint is StartupCheckpoint {
  return getAllCheckpoints().includes(checkpoint as StartupCheckpoint);
}

/**
 * Get human-readable description for a checkpoint
 */
export function getCheckpointDescription(checkpoint: StartupCheckpoint): string {
  const descriptions: Record<StartupCheckpoint, string> = {
    [STARTUP_CHECKPOINTS.PROCESS_STARTED]: 'Process initialization started',
    [STARTUP_CHECKPOINTS.DATABASE_CONNECTING]: 'Connecting to database',
    [STARTUP_CHECKPOINTS.DATABASE_CONNECTED]: 'Database connection established',
    [STARTUP_CHECKPOINTS.N8N_API_CHECKING]: 'Checking n8n API configuration',
    [STARTUP_CHECKPOINTS.N8N_API_READY]: 'n8n API ready',
    [STARTUP_CHECKPOINTS.TELEMETRY_INITIALIZING]: 'Initializing telemetry system',
    [STARTUP_CHECKPOINTS.TELEMETRY_READY]: 'Telemetry system ready',
    [STARTUP_CHECKPOINTS.MCP_HANDSHAKE_STARTING]: 'Starting MCP protocol handshake',
    [STARTUP_CHECKPOINTS.MCP_HANDSHAKE_COMPLETE]: 'MCP handshake completed',
    [STARTUP_CHECKPOINTS.SERVER_READY]: 'Server fully initialized and ready',
  };

  return descriptions[checkpoint] || 'Unknown checkpoint';
}

/**
 * Get the next expected checkpoint after the given one
 * Returns null if this is the last checkpoint
 */
export function getNextCheckpoint(current: StartupCheckpoint): StartupCheckpoint | null {
  const allCheckpoints = getAllCheckpoints();
  const currentIndex = allCheckpoints.indexOf(current);

  if (currentIndex === -1 || currentIndex === allCheckpoints.length - 1) {
    return null;
  }

  return allCheckpoints[currentIndex + 1];
}

/**
 * Calculate completion percentage based on checkpoints passed
 */
export function getCompletionPercentage(passedCheckpoints: string[]): number {
  const totalCheckpoints = getAllCheckpoints().length;
  const passedCount = passedCheckpoints.length;

  return Math.round((passedCount / totalCheckpoints) * 100);
}

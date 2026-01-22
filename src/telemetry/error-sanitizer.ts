/**
 * Error Sanitizer for Startup Errors (v2.18.3)
 * Extracts and sanitizes error messages with security-focused patterns
 * Now uses shared sanitization utilities to avoid code duplication
 */

import { logger } from '../utils/logger';
import { sanitizeErrorMessageCore } from './error-sanitization-utils';

/**
 * Extract error message from unknown error type
 * Safely handles Error objects, strings, and other types
 */
export function extractErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error) {
      // Include stack trace if available (will be truncated later)
      return error.stack || error.message || 'Unknown error';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error && typeof error === 'object') {
      // Try to extract message from object
      const errorObj = error as any;
      if (errorObj.message) {
        return String(errorObj.message);
      }
      if (errorObj.error) {
        return String(errorObj.error);
      }
      // Fall back to JSON stringify with truncation
      try {
        return JSON.stringify(error).substring(0, 500);
      } catch {
        return 'Error object (unstringifiable)';
      }
    }

    return String(error);
  } catch (extractError) {
    logger.debug('Error during message extraction:', extractError);
    return 'Error message extraction failed';
  }
}

/**
 * Sanitize startup error message to remove sensitive data
 * Now uses shared sanitization core from error-sanitization-utils.ts (v2.18.3)
 * This eliminates code duplication and the ReDoS vulnerability
 */
export function sanitizeStartupError(errorMessage: string): string {
  return sanitizeErrorMessageCore(errorMessage);
}

/**
 * Combined operation: Extract and sanitize error message
 * This is the main entry point for startup error processing
 */
export function processStartupError(error: unknown): string {
  const message = extractErrorMessage(error);
  return sanitizeStartupError(message);
}

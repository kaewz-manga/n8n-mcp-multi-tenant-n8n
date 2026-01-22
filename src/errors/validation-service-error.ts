/**
 * Custom error class for validation service failures
 */
export class ValidationServiceError extends Error {
  constructor(
    message: string,
    public readonly nodeType?: string,
    public readonly property?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ValidationServiceError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationServiceError);
    }
  }

  /**
   * Create error for JSON parsing failure
   */
  static jsonParseError(nodeType: string, cause: Error): ValidationServiceError {
    return new ValidationServiceError(
      `Failed to parse JSON data for node ${nodeType}`,
      nodeType,
      undefined,
      cause
    );
  }

  /**
   * Create error for node not found
   */
  static nodeNotFound(nodeType: string): ValidationServiceError {
    return new ValidationServiceError(
      `Node type ${nodeType} not found in repository`,
      nodeType
    );
  }

  /**
   * Create error for critical data extraction failure
   */
  static dataExtractionError(nodeType: string, dataType: string, cause?: Error): ValidationServiceError {
    return new ValidationServiceError(
      `Failed to extract ${dataType} for node ${nodeType}`,
      nodeType,
      dataType,
      cause
    );
  }
}
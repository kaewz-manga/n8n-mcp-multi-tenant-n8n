/**
 * Utility functions for detecting and handling n8n expressions
 */

/**
 * Detects if a value is an n8n expression
 *
 * n8n expressions can be:
 * - Pure expression: `={{ $json.value }}`
 * - Mixed content: `=https://api.com/{{ $json.id }}/data`
 * - Prefix-only: `=$json.value`
 *
 * @param value - The value to check
 * @returns true if the value is an expression (starts with =)
 */
export function isExpression(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('=');
}

/**
 * Detects if a string contains n8n expression syntax {{ }}
 *
 * This checks for expression markers within the string,
 * regardless of whether it has the = prefix.
 *
 * @param value - The value to check
 * @returns true if the value contains {{ }} markers
 */
export function containsExpression(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  // Use single regex for better performance than two includes()
  return /\{\{.*\}\}/s.test(value);
}

/**
 * Detects if a value should skip literal validation
 *
 * This is the main utility to use before validating values like URLs, JSON, etc.
 * It returns true if:
 * - The value is an expression (starts with =)
 * - OR the value contains expression markers {{ }}
 *
 * @param value - The value to check
 * @returns true if validation should be skipped
 */
export function shouldSkipLiteralValidation(value: unknown): boolean {
  return isExpression(value) || containsExpression(value);
}

/**
 * Extracts the expression content from a value
 *
 * If value is `={{ $json.value }}`, returns `$json.value`
 * If value is `=$json.value`, returns `$json.value`
 * If value is not an expression, returns the original value
 *
 * @param value - The value to extract from
 * @returns The expression content or original value
 */
export function extractExpressionContent(value: string): string {
  if (!isExpression(value)) {
    return value;
  }

  const withoutPrefix = value.substring(1); // Remove =

  // Check if it's wrapped in {{ }}
  const match = withoutPrefix.match(/^\{\{(.+)\}\}$/s);
  if (match) {
    return match[1].trim();
  }

  return withoutPrefix;
}

/**
 * Checks if a value is a mixed content expression
 *
 * Mixed content has both literal text and expressions:
 * - `Hello {{ $json.name }}!`
 * - `https://api.com/{{ $json.id }}/data`
 *
 * @param value - The value to check
 * @returns true if the value has mixed content
 */
export function hasMixedContent(value: unknown): boolean {
  // Type guard first to avoid calling containsExpression on non-strings
  if (typeof value !== 'string') {
    return false;
  }

  if (!containsExpression(value)) {
    return false;
  }

  // If it's wrapped entirely in {{ }}, it's not mixed
  const trimmed = value.trim();
  if (trimmed.startsWith('={{') && trimmed.endsWith('}}')) {
    // Check if there's only one pair of {{ }}
    const count = (trimmed.match(/\{\{/g) || []).length;
    if (count === 1) {
      return false;
    }
  }

  return true;
}

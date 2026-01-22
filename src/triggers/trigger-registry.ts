/**
 * Trigger Registry - central registry for trigger handlers
 *
 * Uses the plugin pattern for extensibility:
 * - Register handlers at startup
 * - Get handler by trigger type
 * - List all registered types
 */

import { N8nApiClient } from '../services/n8n-api-client';
import { InstanceContext } from '../types/instance-context';
import { TriggerType } from './types';
import { BaseTriggerHandler, TriggerHandlerConstructor } from './handlers/base-handler';

/**
 * Central registry for trigger handlers
 */
export class TriggerRegistry {
  private static handlers: Map<TriggerType, TriggerHandlerConstructor> = new Map();
  private static initialized = false;

  /**
   * Register a trigger handler
   *
   * @param type - The trigger type this handler supports
   * @param HandlerClass - The handler class constructor
   */
  static register(type: TriggerType, HandlerClass: TriggerHandlerConstructor): void {
    this.handlers.set(type, HandlerClass);
  }

  /**
   * Get a handler instance for a trigger type
   *
   * @param type - The trigger type
   * @param client - n8n API client
   * @param context - Optional instance context
   * @returns Handler instance or undefined if not registered
   */
  static getHandler(
    type: TriggerType,
    client: N8nApiClient,
    context?: InstanceContext
  ): BaseTriggerHandler | undefined {
    const HandlerClass = this.handlers.get(type);
    if (!HandlerClass) {
      return undefined;
    }
    return new HandlerClass(client, context);
  }

  /**
   * Check if a trigger type has a registered handler
   */
  static hasHandler(type: TriggerType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered trigger types
   */
  static getRegisteredTypes(): TriggerType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all registered handlers (useful for testing)
   */
  static clear(): void {
    this.handlers.clear();
    this.initialized = false;
  }

  /**
   * Check if registry is initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Mark registry as initialized
   */
  static markInitialized(): void {
    this.initialized = true;
  }
}

/**
 * Initialize the registry with all handlers
 * Called once at startup
 */
export async function initializeTriggerRegistry(): Promise<void> {
  if (TriggerRegistry.isInitialized()) {
    return;
  }

  // Import handlers dynamically to avoid circular dependencies
  const { WebhookHandler } = await import('./handlers/webhook-handler');
  const { FormHandler } = await import('./handlers/form-handler');
  const { ChatHandler } = await import('./handlers/chat-handler');

  // Register all handlers
  TriggerRegistry.register('webhook', WebhookHandler);
  TriggerRegistry.register('form', FormHandler);
  TriggerRegistry.register('chat', ChatHandler);

  TriggerRegistry.markInitialized();
}

/**
 * Ensure registry is initialized (lazy initialization)
 */
export async function ensureRegistryInitialized(): Promise<void> {
  if (!TriggerRegistry.isInitialized()) {
    await initializeTriggerRegistry();
  }
}

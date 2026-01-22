/**
 * Tool Variant Generator
 *
 * Generates Tool variant nodes for nodes with usableAsTool: true.
 *
 * n8n dynamically creates Tool variants (e.g., supabaseTool from supabase)
 * that can be connected to AI Agents. These variants have:
 * - A 'Tool' suffix on the node type
 * - An additional 'toolDescription' property
 * - Output type 'ai_tool' instead of 'main'
 */

import type { ParsedNode } from '../parsers/node-parser';

export class ToolVariantGenerator {
  /**
   * Generate a Tool variant from a base node with usableAsTool: true
   *
   * @param baseNode - The base ParsedNode that has isAITool: true
   * @returns A new ParsedNode representing the Tool variant, or null if not applicable
   */
  generateToolVariant(baseNode: ParsedNode): ParsedNode | null {
    // Only generate for nodes with usableAsTool: true (isAITool)
    if (!baseNode.isAITool) {
      return null;
    }

    // Don't generate Tool variant for nodes that are already Tool variants
    if (baseNode.isToolVariant) {
      return null;
    }

    // Don't generate for trigger nodes (they can't be used as tools)
    if (baseNode.isTrigger) {
      return null;
    }

    // Validate nodeType exists
    if (!baseNode.nodeType) {
      return null;
    }

    // Generate the Tool variant node type
    // e.g., nodes-base.supabase -> nodes-base.supabaseTool
    const toolNodeType = `${baseNode.nodeType}Tool`;

    // Ensure properties is an array to prevent spread operator errors
    const baseProperties = Array.isArray(baseNode.properties) ? baseNode.properties : [];

    return {
      ...baseNode,
      nodeType: toolNodeType,
      displayName: `${baseNode.displayName} Tool`,
      description: baseNode.description
        ? `${baseNode.description} (AI Tool variant for use with AI Agents)`
        : 'AI Tool variant for use with AI Agents',

      // Mark as Tool variant
      isToolVariant: true,
      toolVariantOf: baseNode.nodeType,
      hasToolVariant: false, // Tool variants don't have further variants

      // Override outputs for Tool variant
      outputs: [{ type: 'ai_tool', displayName: 'Tool' }],
      outputNames: ['Tool'],

      // Add toolDescription property at the beginning
      properties: this.addToolDescriptionProperty(baseProperties, baseNode.displayName),
    };
  }

  /**
   * Add the toolDescription property to the beginning of the properties array
   */
  private addToolDescriptionProperty(properties: any[], displayName: string): any[] {
    const toolDescriptionProperty = {
      displayName: 'Tool Description',
      name: 'toolDescription',
      type: 'string',
      default: '',
      required: false,
      description: 'Description for the AI to understand what this tool does and when to use it',
      typeOptions: {
        rows: 3
      },
      placeholder: `e.g., Use this tool to ${this.generateDescriptionPlaceholder(displayName)}`
    };

    return [toolDescriptionProperty, ...properties];
  }

  /**
   * Generate a placeholder description based on the node display name
   */
  private generateDescriptionPlaceholder(displayName: string): string {
    const lowerName = displayName.toLowerCase();

    // Common patterns
    if (lowerName.includes('database') || lowerName.includes('sql')) {
      return 'query and manage data in the database';
    }
    if (lowerName.includes('email') || lowerName.includes('mail')) {
      return 'send and manage emails';
    }
    if (lowerName.includes('sheet') || lowerName.includes('spreadsheet')) {
      return 'read and write spreadsheet data';
    }
    if (lowerName.includes('file') || lowerName.includes('drive') || lowerName.includes('storage')) {
      return 'manage files and storage';
    }
    if (lowerName.includes('message') || lowerName.includes('chat') || lowerName.includes('slack')) {
      return 'send messages and communicate';
    }
    if (lowerName.includes('http') || lowerName.includes('api') || lowerName.includes('request')) {
      return 'make API requests and fetch data';
    }
    if (lowerName.includes('calendar') || lowerName.includes('event')) {
      return 'manage calendar events and schedules';
    }

    // Default placeholder
    return `interact with ${displayName}`;
  }

  /**
   * Check if a node type looks like a Tool variant.
   * Valid Tool variants must:
   * - End with 'Tool' but not 'ToolTool'
   * - Have a valid package.nodeName pattern (contain a dot)
   * - Have content after the dot before 'Tool' suffix
   */
  static isToolVariantNodeType(nodeType: string): boolean {
    if (!nodeType || !nodeType.endsWith('Tool') || nodeType.endsWith('ToolTool')) {
      return false;
    }
    // The base part (without 'Tool' suffix) should be a valid node pattern
    const basePart = nodeType.slice(0, -4);
    // Valid pattern: package.nodeName (must contain a dot and have content after it)
    return basePart.includes('.') && basePart.split('.').pop()!.length > 0;
  }

  /**
   * Get the base node type from a Tool variant node type
   */
  static getBaseNodeType(toolNodeType: string): string | null {
    if (!ToolVariantGenerator.isToolVariantNodeType(toolNodeType)) {
      return null;
    }
    return toolNodeType.slice(0, -4); // Remove 'Tool' suffix
  }

  /**
   * Get the Tool variant node type from a base node type
   */
  static getToolVariantNodeType(baseNodeType: string): string {
    return `${baseNodeType}Tool`;
  }
}

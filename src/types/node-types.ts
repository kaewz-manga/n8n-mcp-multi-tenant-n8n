/**
 * TypeScript type definitions for n8n node parsing
 *
 * This file provides strong typing for node classes and instances,
 * preventing bugs like the v2.17.4 baseDescription issue where
 * TypeScript couldn't catch property name mistakes due to `any` types.
 *
 * @module types/node-types
 * @since 2.17.5
 */

// Import n8n's official interfaces
import type {
  IVersionedNodeType,
  INodeType,
  INodeTypeBaseDescription,
  INodeTypeDescription
} from 'n8n-workflow';

/**
 * Represents a node class that can be either:
 * - A constructor function that returns INodeType
 * - A constructor function that returns IVersionedNodeType
 * - An already-instantiated node instance
 *
 * This covers all patterns we encounter when loading nodes from n8n packages.
 */
export type NodeClass =
  | (new () => INodeType)
  | (new () => IVersionedNodeType)
  | INodeType
  | IVersionedNodeType;

/**
 * Instance of a versioned node type with all properties accessible.
 *
 * This represents nodes that use n8n's VersionedNodeType pattern,
 * such as AI Agent, HTTP Request, Slack, etc.
 *
 * @property currentVersion - The computed current version (defaultVersion ?? max(nodeVersions))
 * @property description - Base description stored as 'description' (NOT 'baseDescription')
 * @property nodeVersions - Map of version numbers to INodeType implementations
 *
 * @example
 * ```typescript
 * const aiAgent = new AIAgentNode() as VersionedNodeInstance;
 * console.log(aiAgent.currentVersion); // 2.2
 * console.log(aiAgent.description.defaultVersion); // 2.2
 * console.log(aiAgent.nodeVersions[1]); // INodeType for version 1
 * ```
 */
export interface VersionedNodeInstance extends IVersionedNodeType {
  currentVersion: number;
  description: INodeTypeBaseDescription;
  nodeVersions: {
    [version: number]: INodeType;
  };
}

/**
 * Instance of a regular (non-versioned) node type.
 *
 * This represents simple nodes that don't use versioning,
 * such as Edit Fields, Set, Code (v1), etc.
 */
export interface RegularNodeInstance extends INodeType {
  description: INodeTypeDescription;
}

/**
 * Union type for any node instance (versioned or regular).
 *
 * Use this when you need to handle both types of nodes.
 */
export type NodeInstance = VersionedNodeInstance | RegularNodeInstance;

/**
 * Type guard to check if a node is a VersionedNodeType instance.
 *
 * This provides runtime type safety and enables TypeScript to narrow
 * the type within conditional blocks.
 *
 * @param node - The node instance to check
 * @returns True if node is a VersionedNodeInstance
 *
 * @example
 * ```typescript
 * const instance = new nodeClass();
 * if (isVersionedNodeInstance(instance)) {
 *   // TypeScript knows instance is VersionedNodeInstance here
 *   console.log(instance.currentVersion);
 *   console.log(instance.nodeVersions);
 * }
 * ```
 */
export function isVersionedNodeInstance(node: any): node is VersionedNodeInstance {
  return (
    node !== null &&
    typeof node === 'object' &&
    'nodeVersions' in node &&
    'currentVersion' in node &&
    'description' in node &&
    typeof node.currentVersion === 'number'
  );
}

/**
 * Type guard to check if a value is a VersionedNodeType class.
 *
 * This checks the constructor name pattern used by n8n's VersionedNodeType.
 *
 * @param nodeClass - The class or value to check
 * @returns True if nodeClass is a VersionedNodeType constructor
 *
 * @example
 * ```typescript
 * if (isVersionedNodeClass(nodeClass)) {
 *   // It's a VersionedNodeType class
 *   const instance = new nodeClass() as VersionedNodeInstance;
 * }
 * ```
 */
export function isVersionedNodeClass(nodeClass: any): boolean {
  return (
    typeof nodeClass === 'function' &&
    nodeClass.prototype?.constructor?.name === 'VersionedNodeType'
  );
}

/**
 * Safely instantiate a node class with proper error handling.
 *
 * Some nodes require specific parameters or environment setup to instantiate.
 * This helper provides safe instantiation with fallback to null on error.
 *
 * @param nodeClass - The node class or instance to instantiate
 * @returns The instantiated node or null if instantiation fails
 *
 * @example
 * ```typescript
 * const instance = instantiateNode(nodeClass);
 * if (instance) {
 *   // Successfully instantiated
 *   const version = isVersionedNodeInstance(instance)
 *     ? instance.currentVersion
 *     : instance.description.version;
 * }
 * ```
 */
export function instantiateNode(nodeClass: NodeClass): NodeInstance | null {
  try {
    if (typeof nodeClass === 'function') {
      return new nodeClass();
    }
    // Already an instance
    return nodeClass;
  } catch (e) {
    // Some nodes require parameters to instantiate
    return null;
  }
}

/**
 * Safely get a node instance, handling both classes and instances.
 *
 * This is a non-throwing version that returns undefined on failure.
 *
 * @param nodeClass - The node class or instance
 * @returns The node instance or undefined
 */
export function getNodeInstance(nodeClass: NodeClass): NodeInstance | undefined {
  const instance = instantiateNode(nodeClass);
  return instance ?? undefined;
}

/**
 * Extract description from a node class or instance.
 *
 * Handles both versioned and regular nodes, with fallback logic.
 *
 * @param nodeClass - The node class or instance
 * @returns The node description or empty object on failure
 */
export function getNodeDescription(
  nodeClass: NodeClass
): INodeTypeBaseDescription | INodeTypeDescription {
  // Try to get description from instance first
  try {
    const instance = instantiateNode(nodeClass);

    if (instance) {
      // For VersionedNodeType, description is the baseDescription
      if (isVersionedNodeInstance(instance)) {
        return instance.description;
      }
      // For regular nodes, description is the full INodeTypeDescription
      return instance.description;
    }
  } catch (e) {
    // Ignore instantiation errors
  }

  // Fallback to static properties
  if (typeof nodeClass === 'object' && 'description' in nodeClass) {
    return nodeClass.description;
  }

  // Last resort: empty description
  return {
    displayName: '',
    name: '',
    group: [],
    description: '',
    version: 1,
    defaults: { name: '', color: '' },
    inputs: [],
    outputs: [],
    properties: []
  } as any; // Type assertion needed for fallback case
}

/**
 * Node Migration Service
 *
 * Handles smart auto-migration of node configurations during version upgrades.
 * Applies migration strategies from the breaking changes registry and detectors.
 *
 * Migration strategies:
 * - add_property: Add new required/optional properties with defaults
 * - remove_property: Remove deprecated properties
 * - rename_property: Rename properties that changed names
 * - set_default: Set default values for properties
 */

import { v4 as uuidv4 } from 'uuid';
import { BreakingChangeDetector, DetectedChange } from './breaking-change-detector';
import { NodeVersionService } from './node-version-service';

export interface MigrationResult {
  success: boolean;
  nodeId: string;
  nodeName: string;
  fromVersion: string;
  toVersion: string;
  appliedMigrations: AppliedMigration[];
  remainingIssues: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  updatedNode: any; // The migrated node configuration
}

export interface AppliedMigration {
  propertyName: string;
  action: string;
  oldValue?: any;
  newValue?: any;
  description: string;
}

export class NodeMigrationService {
  constructor(
    private versionService: NodeVersionService,
    private breakingChangeDetector: BreakingChangeDetector
  ) {}

  /**
   * Migrate a node from its current version to a target version
   */
  async migrateNode(
    node: any,
    fromVersion: string,
    toVersion: string
  ): Promise<MigrationResult> {
    const nodeId = node.id || 'unknown';
    const nodeName = node.name || 'Unknown Node';
    const nodeType = node.type;

    // Analyze the version upgrade
    const analysis = await this.breakingChangeDetector.analyzeVersionUpgrade(
      nodeType,
      fromVersion,
      toVersion
    );

    // Start with a copy of the node
    const migratedNode = JSON.parse(JSON.stringify(node));

    // Apply the version update
    migratedNode.typeVersion = this.parseVersion(toVersion);

    const appliedMigrations: AppliedMigration[] = [];
    const remainingIssues: string[] = [];

    // Apply auto-migratable changes
    for (const change of analysis.changes.filter(c => c.autoMigratable)) {
      const migration = this.applyMigration(migratedNode, change);

      if (migration) {
        appliedMigrations.push(migration);
      }
    }

    // Collect remaining manual issues
    for (const change of analysis.changes.filter(c => !c.autoMigratable)) {
      remainingIssues.push(
        `Manual action required for "${change.propertyName}": ${change.migrationHint}`
      );
    }

    // Determine confidence based on remaining issues
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

    if (remainingIssues.length > 0) {
      confidence = remainingIssues.length > 3 ? 'LOW' : 'MEDIUM';
    }

    return {
      success: remainingIssues.length === 0,
      nodeId,
      nodeName,
      fromVersion,
      toVersion,
      appliedMigrations,
      remainingIssues,
      confidence,
      updatedNode: migratedNode
    };
  }

  /**
   * Apply a single migration change to a node
   */
  private applyMigration(node: any, change: DetectedChange): AppliedMigration | null {
    if (!change.migrationStrategy) return null;

    const { type, defaultValue, sourceProperty, targetProperty } = change.migrationStrategy;

    switch (type) {
      case 'add_property':
        return this.addProperty(node, change.propertyName, defaultValue, change);

      case 'remove_property':
        return this.removeProperty(node, change.propertyName, change);

      case 'rename_property':
        return this.renameProperty(node, sourceProperty!, targetProperty!, change);

      case 'set_default':
        return this.setDefault(node, change.propertyName, defaultValue, change);

      default:
        return null;
    }
  }

  /**
   * Add a new property to the node configuration
   */
  private addProperty(
    node: any,
    propertyPath: string,
    defaultValue: any,
    change: DetectedChange
  ): AppliedMigration {
    const value = this.resolveDefaultValue(propertyPath, defaultValue, node);

    // Handle nested property paths (e.g., "parameters.inputFieldMapping")
    const parts = propertyPath.split('.');
    let target = node;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!target[part]) {
        target[part] = {};
      }
      target = target[part];
    }

    const finalKey = parts[parts.length - 1];
    target[finalKey] = value;

    return {
      propertyName: propertyPath,
      action: 'Added property',
      newValue: value,
      description: `Added "${propertyPath}" with default value`
    };
  }

  /**
   * Remove a deprecated property from the node configuration
   */
  private removeProperty(
    node: any,
    propertyPath: string,
    change: DetectedChange
  ): AppliedMigration | null {
    const parts = propertyPath.split('.');
    let target = node;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!target[part]) return null; // Property doesn't exist
      target = target[part];
    }

    const finalKey = parts[parts.length - 1];
    const oldValue = target[finalKey];

    if (oldValue !== undefined) {
      delete target[finalKey];

      return {
        propertyName: propertyPath,
        action: 'Removed property',
        oldValue,
        description: `Removed deprecated property "${propertyPath}"`
      };
    }

    return null;
  }

  /**
   * Rename a property (move value from old name to new name)
   */
  private renameProperty(
    node: any,
    sourcePath: string,
    targetPath: string,
    change: DetectedChange
  ): AppliedMigration | null {
    // Get old value
    const sourceParts = sourcePath.split('.');
    let sourceTarget = node;

    for (let i = 0; i < sourceParts.length - 1; i++) {
      if (!sourceTarget[sourceParts[i]]) return null;
      sourceTarget = sourceTarget[sourceParts[i]];
    }

    const sourceKey = sourceParts[sourceParts.length - 1];
    const oldValue = sourceTarget[sourceKey];

    if (oldValue === undefined) return null; // Source doesn't exist

    // Set new value
    const targetParts = targetPath.split('.');
    let targetTarget = node;

    for (let i = 0; i < targetParts.length - 1; i++) {
      if (!targetTarget[targetParts[i]]) {
        targetTarget[targetParts[i]] = {};
      }
      targetTarget = targetTarget[targetParts[i]];
    }

    const targetKey = targetParts[targetParts.length - 1];
    targetTarget[targetKey] = oldValue;

    // Remove old value
    delete sourceTarget[sourceKey];

    return {
      propertyName: targetPath,
      action: 'Renamed property',
      oldValue: `${sourcePath}: ${JSON.stringify(oldValue)}`,
      newValue: `${targetPath}: ${JSON.stringify(oldValue)}`,
      description: `Renamed "${sourcePath}" to "${targetPath}"`
    };
  }

  /**
   * Set a default value for a property
   */
  private setDefault(
    node: any,
    propertyPath: string,
    defaultValue: any,
    change: DetectedChange
  ): AppliedMigration | null {
    const parts = propertyPath.split('.');
    let target = node;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }

    const finalKey = parts[parts.length - 1];

    // Only set if not already defined
    if (target[finalKey] === undefined) {
      const value = this.resolveDefaultValue(propertyPath, defaultValue, node);
      target[finalKey] = value;

      return {
        propertyName: propertyPath,
        action: 'Set default value',
        newValue: value,
        description: `Set default value for "${propertyPath}"`
      };
    }

    return null;
  }

  /**
   * Resolve default value with special handling for certain property types
   */
  private resolveDefaultValue(propertyPath: string, defaultValue: any, node: any): any {
    // Special case: webhookId needs a UUID
    if (propertyPath === 'webhookId' || propertyPath.endsWith('.webhookId')) {
      return uuidv4();
    }

    // Special case: webhook path needs a unique value
    if (propertyPath === 'path' || propertyPath.endsWith('.path')) {
      if (node.type === 'n8n-nodes-base.webhook') {
        return `/webhook-${Date.now()}`;
      }
    }

    // Return provided default or null
    return defaultValue !== null && defaultValue !== undefined ? defaultValue : null;
  }

  /**
   * Parse version string to number (for typeVersion field)
   */
  private parseVersion(version: string): number {
    const parts = version.split('.').map(Number);

    // Handle versions like "1.1" -> 1.1, "2.0" -> 2
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] + parts[1] / 10;

    // For more complex versions, just use first number
    return parts[0];
  }

  /**
   * Validate that a migrated node is valid
   */
  async validateMigratedNode(node: any, nodeType: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!node.typeVersion) {
      errors.push('Missing typeVersion after migration');
    }

    if (!node.parameters) {
      errors.push('Missing parameters object');
    }

    // Check for common issues
    if (nodeType === 'n8n-nodes-base.webhook') {
      if (!node.parameters?.path) {
        errors.push('Webhook node missing required "path" parameter');
      }
      if (node.typeVersion >= 2.1 && !node.webhookId) {
        warnings.push('Webhook v2.1+ typically requires webhookId');
      }
    }

    if (nodeType === 'n8n-nodes-base.executeWorkflow') {
      if (node.typeVersion >= 1.1 && !node.parameters?.inputFieldMapping) {
        errors.push('Execute Workflow v1.1+ requires inputFieldMapping');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Batch migrate multiple nodes in a workflow
   */
  async migrateWorkflowNodes(
    workflow: any,
    targetVersions: Record<string, string> // nodeId -> targetVersion
  ): Promise<{
    success: boolean;
    results: MigrationResult[];
    overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  }> {
    const results: MigrationResult[] = [];

    for (const node of workflow.nodes || []) {
      const targetVersion = targetVersions[node.id];

      if (targetVersion && node.typeVersion) {
        const currentVersion = node.typeVersion.toString();

        const result = await this.migrateNode(node, currentVersion, targetVersion);
        results.push(result);

        // Update node in place
        Object.assign(node, result.updatedNode);
      }
    }

    // Calculate overall confidence
    const confidences = results.map(r => r.confidence);
    let overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

    if (confidences.includes('LOW')) {
      overallConfidence = 'LOW';
    } else if (confidences.includes('MEDIUM')) {
      overallConfidence = 'MEDIUM';
    }

    const success = results.every(r => r.success);

    return {
      success,
      results,
      overallConfidence
    };
  }
}

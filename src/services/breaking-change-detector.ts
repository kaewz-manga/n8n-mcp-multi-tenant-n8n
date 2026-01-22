/**
 * Breaking Change Detector
 *
 * Detects breaking changes between node versions by:
 * 1. Consulting the hardcoded breaking changes registry
 * 2. Dynamically comparing property schemas between versions
 * 3. Analyzing property requirement changes
 *
 * Used by the autofixer to intelligently upgrade node versions.
 */

import { NodeRepository } from '../database/node-repository';
import {
  BREAKING_CHANGES_REGISTRY,
  BreakingChange,
  getBreakingChangesForNode,
  getAllChangesForNode
} from './breaking-changes-registry';

export interface DetectedChange {
  propertyName: string;
  changeType: 'added' | 'removed' | 'renamed' | 'type_changed' | 'requirement_changed' | 'default_changed';
  isBreaking: boolean;
  oldValue?: any;
  newValue?: any;
  migrationHint: string;
  autoMigratable: boolean;
  migrationStrategy?: any;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  source: 'registry' | 'dynamic'; // Where this change was detected
}

export interface VersionUpgradeAnalysis {
  nodeType: string;
  fromVersion: string;
  toVersion: string;
  hasBreakingChanges: boolean;
  changes: DetectedChange[];
  autoMigratableCount: number;
  manualRequiredCount: number;
  overallSeverity: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendations: string[];
}

export class BreakingChangeDetector {
  constructor(private nodeRepository: NodeRepository) {}

  /**
   * Analyze a version upgrade and detect all changes
   */
  async analyzeVersionUpgrade(
    nodeType: string,
    fromVersion: string,
    toVersion: string
  ): Promise<VersionUpgradeAnalysis> {
    // Get changes from registry
    const registryChanges = this.getRegistryChanges(nodeType, fromVersion, toVersion);

    // Get dynamic changes by comparing schemas
    const dynamicChanges = this.detectDynamicChanges(nodeType, fromVersion, toVersion);

    // Merge and deduplicate changes
    const allChanges = this.mergeChanges(registryChanges, dynamicChanges);

    // Calculate statistics
    const hasBreakingChanges = allChanges.some(c => c.isBreaking);
    const autoMigratableCount = allChanges.filter(c => c.autoMigratable).length;
    const manualRequiredCount = allChanges.filter(c => !c.autoMigratable).length;

    // Determine overall severity
    const overallSeverity = this.calculateOverallSeverity(allChanges);

    // Generate recommendations
    const recommendations = this.generateRecommendations(allChanges);

    return {
      nodeType,
      fromVersion,
      toVersion,
      hasBreakingChanges,
      changes: allChanges,
      autoMigratableCount,
      manualRequiredCount,
      overallSeverity,
      recommendations
    };
  }

  /**
   * Get changes from the hardcoded registry
   */
  private getRegistryChanges(
    nodeType: string,
    fromVersion: string,
    toVersion: string
  ): DetectedChange[] {
    const registryChanges = getAllChangesForNode(nodeType, fromVersion, toVersion);

    return registryChanges.map(change => ({
      propertyName: change.propertyName,
      changeType: change.changeType,
      isBreaking: change.isBreaking,
      oldValue: change.oldValue,
      newValue: change.newValue,
      migrationHint: change.migrationHint,
      autoMigratable: change.autoMigratable,
      migrationStrategy: change.migrationStrategy,
      severity: change.severity,
      source: 'registry' as const
    }));
  }

  /**
   * Dynamically detect changes by comparing property schemas
   */
  private detectDynamicChanges(
    nodeType: string,
    fromVersion: string,
    toVersion: string
  ): DetectedChange[] {
    // Get both versions from the database
    const oldVersionData = this.nodeRepository.getNodeVersion(nodeType, fromVersion);
    const newVersionData = this.nodeRepository.getNodeVersion(nodeType, toVersion);

    if (!oldVersionData || !newVersionData) {
      return []; // Can't detect dynamic changes without version data
    }

    const changes: DetectedChange[] = [];

    // Compare properties schemas
    const oldProps = this.flattenProperties(oldVersionData.propertiesSchema || []);
    const newProps = this.flattenProperties(newVersionData.propertiesSchema || []);

    // Detect added properties
    for (const propName of Object.keys(newProps)) {
      if (!oldProps[propName]) {
        const prop = newProps[propName];
        const isRequired = prop.required === true;

        changes.push({
          propertyName: propName,
          changeType: 'added',
          isBreaking: isRequired, // Breaking if required
          newValue: prop.type || 'unknown',
          migrationHint: isRequired
            ? `Property "${propName}" is now required in v${toVersion}. Provide a value to prevent validation errors.`
            : `Property "${propName}" was added in v${toVersion}. Optional parameter, safe to ignore if not needed.`,
          autoMigratable: !isRequired, // Can auto-add with default if not required
          migrationStrategy: !isRequired
            ? {
                type: 'add_property',
                defaultValue: prop.default || null
              }
            : undefined,
          severity: isRequired ? 'HIGH' : 'LOW',
          source: 'dynamic'
        });
      }
    }

    // Detect removed properties
    for (const propName of Object.keys(oldProps)) {
      if (!newProps[propName]) {
        changes.push({
          propertyName: propName,
          changeType: 'removed',
          isBreaking: true, // Removal is always breaking
          oldValue: oldProps[propName].type || 'unknown',
          migrationHint: `Property "${propName}" was removed in v${toVersion}. Remove this property from your configuration.`,
          autoMigratable: true, // Can auto-remove
          migrationStrategy: {
            type: 'remove_property'
          },
          severity: 'MEDIUM',
          source: 'dynamic'
        });
      }
    }

    // Detect requirement changes
    for (const propName of Object.keys(newProps)) {
      if (oldProps[propName]) {
        const oldRequired = oldProps[propName].required === true;
        const newRequired = newProps[propName].required === true;

        if (oldRequired !== newRequired) {
          changes.push({
            propertyName: propName,
            changeType: 'requirement_changed',
            isBreaking: newRequired && !oldRequired, // Breaking if became required
            oldValue: oldRequired ? 'required' : 'optional',
            newValue: newRequired ? 'required' : 'optional',
            migrationHint: newRequired
              ? `Property "${propName}" is now required in v${toVersion}. Ensure a value is provided.`
              : `Property "${propName}" is now optional in v${toVersion}.`,
            autoMigratable: false, // Requirement changes need manual review
            severity: newRequired ? 'HIGH' : 'LOW',
            source: 'dynamic'
          });
        }
      }
    }

    return changes;
  }

  /**
   * Flatten nested properties into a map for easy comparison
   */
  private flattenProperties(properties: any[], prefix: string = ''): Record<string, any> {
    const flat: Record<string, any> = {};

    for (const prop of properties) {
      if (!prop.name && !prop.displayName) continue;

      const propName = prop.name || prop.displayName;
      const fullPath = prefix ? `${prefix}.${propName}` : propName;

      flat[fullPath] = prop;

      // Recursively flatten nested options
      if (prop.options && Array.isArray(prop.options)) {
        Object.assign(flat, this.flattenProperties(prop.options, fullPath));
      }
    }

    return flat;
  }

  /**
   * Merge registry and dynamic changes, avoiding duplicates
   */
  private mergeChanges(
    registryChanges: DetectedChange[],
    dynamicChanges: DetectedChange[]
  ): DetectedChange[] {
    const merged = [...registryChanges];

    // Add dynamic changes that aren't already in registry
    for (const dynamicChange of dynamicChanges) {
      const existsInRegistry = registryChanges.some(
        rc => rc.propertyName === dynamicChange.propertyName &&
              rc.changeType === dynamicChange.changeType
      );

      if (!existsInRegistry) {
        merged.push(dynamicChange);
      }
    }

    // Sort by severity (HIGH -> MEDIUM -> LOW)
    const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    merged.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return merged;
  }

  /**
   * Calculate overall severity of the upgrade
   */
  private calculateOverallSeverity(changes: DetectedChange[]): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (changes.some(c => c.severity === 'HIGH')) return 'HIGH';
    if (changes.some(c => c.severity === 'MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate actionable recommendations for the upgrade
   */
  private generateRecommendations(changes: DetectedChange[]): string[] {
    const recommendations: string[] = [];

    const breakingChanges = changes.filter(c => c.isBreaking);
    const autoMigratable = changes.filter(c => c.autoMigratable);
    const manualRequired = changes.filter(c => !c.autoMigratable);

    if (breakingChanges.length === 0) {
      recommendations.push('✓ No breaking changes detected. This upgrade should be safe.');
    } else {
      recommendations.push(
        `⚠ ${breakingChanges.length} breaking change(s) detected. Review carefully before applying.`
      );
    }

    if (autoMigratable.length > 0) {
      recommendations.push(
        `✓ ${autoMigratable.length} change(s) can be automatically migrated.`
      );
    }

    if (manualRequired.length > 0) {
      recommendations.push(
        `✋ ${manualRequired.length} change(s) require manual intervention.`
      );

      // List specific manual changes
      for (const change of manualRequired) {
        recommendations.push(`  - ${change.propertyName}: ${change.migrationHint}`);
      }
    }

    return recommendations;
  }

  /**
   * Quick check: does this upgrade have breaking changes?
   */
  hasBreakingChanges(nodeType: string, fromVersion: string, toVersion: string): boolean {
    const registryChanges = getBreakingChangesForNode(nodeType, fromVersion, toVersion);
    return registryChanges.length > 0;
  }

  /**
   * Get simple list of property names that changed
   */
  getChangedProperties(nodeType: string, fromVersion: string, toVersion: string): string[] {
    const registryChanges = getAllChangesForNode(nodeType, fromVersion, toVersion);
    return registryChanges.map(c => c.propertyName);
  }
}

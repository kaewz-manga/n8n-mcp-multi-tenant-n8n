/**
 * Post-Update Validator
 *
 * Generates comprehensive, AI-friendly migration reports after node version upgrades.
 * Provides actionable guidance for AI agents on what manual steps are needed.
 *
 * Validation includes:
 * - New required properties
 * - Deprecated/removed properties
 * - Behavior changes
 * - Step-by-step migration instructions
 */

import { BreakingChangeDetector, DetectedChange } from './breaking-change-detector';
import { MigrationResult } from './node-migration-service';
import { NodeVersionService } from './node-version-service';

export interface PostUpdateGuidance {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  oldVersion: string;
  newVersion: string;
  migrationStatus: 'complete' | 'partial' | 'manual_required';
  requiredActions: RequiredAction[];
  deprecatedProperties: DeprecatedProperty[];
  behaviorChanges: BehaviorChange[];
  migrationSteps: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedTime: string; // e.g., "5 minutes", "15 minutes"
}

export interface RequiredAction {
  type: 'ADD_PROPERTY' | 'UPDATE_PROPERTY' | 'CONFIGURE_OPTION' | 'REVIEW_CONFIGURATION';
  property: string;
  reason: string;
  suggestedValue?: any;
  currentValue?: any;
  documentation?: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface DeprecatedProperty {
  property: string;
  status: 'removed' | 'deprecated';
  replacement?: string;
  action: 'remove' | 'replace' | 'ignore';
  impact: 'breaking' | 'warning';
}

export interface BehaviorChange {
  aspect: string; // e.g., "data passing", "webhook handling"
  oldBehavior: string;
  newBehavior: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  actionRequired: boolean;
  recommendation: string;
}

export class PostUpdateValidator {
  constructor(
    private versionService: NodeVersionService,
    private breakingChangeDetector: BreakingChangeDetector
  ) {}

  /**
   * Generate comprehensive post-update guidance for a migrated node
   */
  async generateGuidance(
    nodeId: string,
    nodeName: string,
    nodeType: string,
    oldVersion: string,
    newVersion: string,
    migrationResult: MigrationResult
  ): Promise<PostUpdateGuidance> {
    // Analyze the version upgrade
    const analysis = await this.breakingChangeDetector.analyzeVersionUpgrade(
      nodeType,
      oldVersion,
      newVersion
    );

    // Determine migration status
    const migrationStatus = this.determineMigrationStatus(migrationResult, analysis.changes);

    // Generate required actions
    const requiredActions = this.generateRequiredActions(
      migrationResult,
      analysis.changes,
      nodeType
    );

    // Identify deprecated properties
    const deprecatedProperties = this.identifyDeprecatedProperties(analysis.changes);

    // Document behavior changes
    const behaviorChanges = this.documentBehaviorChanges(nodeType, oldVersion, newVersion);

    // Generate step-by-step migration instructions
    const migrationSteps = this.generateMigrationSteps(
      requiredActions,
      deprecatedProperties,
      behaviorChanges
    );

    // Calculate confidence and estimated time
    const confidence = this.calculateConfidence(requiredActions, migrationStatus);
    const estimatedTime = this.estimateTime(requiredActions, behaviorChanges);

    return {
      nodeId,
      nodeName,
      nodeType,
      oldVersion,
      newVersion,
      migrationStatus,
      requiredActions,
      deprecatedProperties,
      behaviorChanges,
      migrationSteps,
      confidence,
      estimatedTime
    };
  }

  /**
   * Determine the migration status based on results and changes
   */
  private determineMigrationStatus(
    migrationResult: MigrationResult,
    changes: DetectedChange[]
  ): 'complete' | 'partial' | 'manual_required' {
    if (migrationResult.remainingIssues.length === 0) {
      return 'complete';
    }

    const criticalIssues = changes.filter(c => c.isBreaking && !c.autoMigratable);

    if (criticalIssues.length > 0) {
      return 'manual_required';
    }

    return 'partial';
  }

  /**
   * Generate actionable required actions for the AI agent
   */
  private generateRequiredActions(
    migrationResult: MigrationResult,
    changes: DetectedChange[],
    nodeType: string
  ): RequiredAction[] {
    const actions: RequiredAction[] = [];

    // Actions from remaining issues (not auto-migrated)
    const manualChanges = changes.filter(c => !c.autoMigratable);

    for (const change of manualChanges) {
      actions.push({
        type: this.mapChangeTypeToActionType(change.changeType),
        property: change.propertyName,
        reason: change.migrationHint,
        suggestedValue: change.newValue,
        currentValue: change.oldValue,
        documentation: this.getPropertyDocumentation(nodeType, change.propertyName),
        priority: this.mapSeverityToPriority(change.severity)
      });
    }

    return actions;
  }

  /**
   * Identify deprecated or removed properties
   */
  private identifyDeprecatedProperties(changes: DetectedChange[]): DeprecatedProperty[] {
    const deprecated: DeprecatedProperty[] = [];

    for (const change of changes) {
      if (change.changeType === 'removed') {
        deprecated.push({
          property: change.propertyName,
          status: 'removed',
          replacement: change.migrationStrategy?.targetProperty,
          action: change.autoMigratable ? 'remove' : 'replace',
          impact: change.isBreaking ? 'breaking' : 'warning'
        });
      }
    }

    return deprecated;
  }

  /**
   * Document behavior changes for specific nodes
   */
  private documentBehaviorChanges(
    nodeType: string,
    oldVersion: string,
    newVersion: string
  ): BehaviorChange[] {
    const changes: BehaviorChange[] = [];

    // Execute Workflow node behavior changes
    if (nodeType === 'n8n-nodes-base.executeWorkflow') {
      if (this.versionService.compareVersions(oldVersion, '1.1') < 0 &&
          this.versionService.compareVersions(newVersion, '1.1') >= 0) {
        changes.push({
          aspect: 'Data passing to sub-workflows',
          oldBehavior: 'Automatic data passing - all data from parent workflow automatically available',
          newBehavior: 'Explicit field mapping required - must define inputFieldMapping to pass specific fields',
          impact: 'HIGH',
          actionRequired: true,
          recommendation: 'Define inputFieldMapping with specific field mappings between parent and child workflows. Review data dependencies.'
        });
      }
    }

    // Webhook node behavior changes
    if (nodeType === 'n8n-nodes-base.webhook') {
      if (this.versionService.compareVersions(oldVersion, '2.1') < 0 &&
          this.versionService.compareVersions(newVersion, '2.1') >= 0) {
        changes.push({
          aspect: 'Webhook persistence',
          oldBehavior: 'Webhook URL changes on workflow updates',
          newBehavior: 'Stable webhook URL via webhookId field',
          impact: 'MEDIUM',
          actionRequired: false,
          recommendation: 'Webhook URLs now remain stable across workflow updates. Update external systems if needed.'
        });
      }

      if (this.versionService.compareVersions(oldVersion, '2.0') < 0 &&
          this.versionService.compareVersions(newVersion, '2.0') >= 0) {
        changes.push({
          aspect: 'Response handling',
          oldBehavior: 'Automatic response after webhook trigger',
          newBehavior: 'Configurable response mode (onReceived vs lastNode)',
          impact: 'MEDIUM',
          actionRequired: true,
          recommendation: 'Review responseMode setting. Use "onReceived" for immediate responses or "lastNode" to wait for workflow completion.'
        });
      }
    }

    return changes;
  }

  /**
   * Generate step-by-step migration instructions for AI agents
   */
  private generateMigrationSteps(
    requiredActions: RequiredAction[],
    deprecatedProperties: DeprecatedProperty[],
    behaviorChanges: BehaviorChange[]
  ): string[] {
    const steps: string[] = [];
    let stepNumber = 1;

    // Start with deprecations
    if (deprecatedProperties.length > 0) {
      steps.push(`Step ${stepNumber++}: Remove deprecated properties`);
      for (const dep of deprecatedProperties) {
        steps.push(`  - Remove "${dep.property}" ${dep.replacement ? `(use "${dep.replacement}" instead)` : ''}`);
      }
    }

    // Then critical actions
    const criticalActions = requiredActions.filter(a => a.priority === 'CRITICAL');
    if (criticalActions.length > 0) {
      steps.push(`Step ${stepNumber++}: Address critical configuration requirements`);
      for (const action of criticalActions) {
        steps.push(`  - ${action.property}: ${action.reason}`);
        if (action.suggestedValue !== undefined) {
          steps.push(`    Suggested value: ${JSON.stringify(action.suggestedValue)}`);
        }
      }
    }

    // High priority actions
    const highActions = requiredActions.filter(a => a.priority === 'HIGH');
    if (highActions.length > 0) {
      steps.push(`Step ${stepNumber++}: Configure required properties`);
      for (const action of highActions) {
        steps.push(`  - ${action.property}: ${action.reason}`);
      }
    }

    // Behavior change adaptations
    const actionRequiredChanges = behaviorChanges.filter(c => c.actionRequired);
    if (actionRequiredChanges.length > 0) {
      steps.push(`Step ${stepNumber++}: Adapt to behavior changes`);
      for (const change of actionRequiredChanges) {
        steps.push(`  - ${change.aspect}: ${change.recommendation}`);
      }
    }

    // Medium/Low priority actions
    const otherActions = requiredActions.filter(a => a.priority === 'MEDIUM' || a.priority === 'LOW');
    if (otherActions.length > 0) {
      steps.push(`Step ${stepNumber++}: Review optional configurations`);
      for (const action of otherActions) {
        steps.push(`  - ${action.property}: ${action.reason}`);
      }
    }

    // Final validation step
    steps.push(`Step ${stepNumber}: Test workflow execution`);
    steps.push('  - Validate all node configurations');
    steps.push('  - Run a test execution');
    steps.push('  - Verify expected behavior');

    return steps;
  }

  /**
   * Map change type to action type
   */
  private mapChangeTypeToActionType(
    changeType: string
  ): 'ADD_PROPERTY' | 'UPDATE_PROPERTY' | 'CONFIGURE_OPTION' | 'REVIEW_CONFIGURATION' {
    switch (changeType) {
      case 'added':
        return 'ADD_PROPERTY';
      case 'requirement_changed':
      case 'type_changed':
        return 'UPDATE_PROPERTY';
      case 'default_changed':
        return 'CONFIGURE_OPTION';
      default:
        return 'REVIEW_CONFIGURATION';
    }
  }

  /**
   * Map severity to priority
   */
  private mapSeverityToPriority(
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
  ): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (severity === 'HIGH') return 'CRITICAL';
    return severity;
  }

  /**
   * Get documentation for a property (placeholder - would integrate with node docs)
   */
  private getPropertyDocumentation(nodeType: string, propertyName: string): string {
    // In future, this would fetch from node documentation
    return `See n8n documentation for ${nodeType} - ${propertyName}`;
  }

  /**
   * Calculate overall confidence in the migration
   */
  private calculateConfidence(
    requiredActions: RequiredAction[],
    migrationStatus: 'complete' | 'partial' | 'manual_required'
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (migrationStatus === 'complete') return 'HIGH';

    const criticalActions = requiredActions.filter(a => a.priority === 'CRITICAL');

    if (migrationStatus === 'manual_required' || criticalActions.length > 3) {
      return 'LOW';
    }

    return 'MEDIUM';
  }

  /**
   * Estimate time required for manual migration steps
   */
  private estimateTime(
    requiredActions: RequiredAction[],
    behaviorChanges: BehaviorChange[]
  ): string {
    const criticalCount = requiredActions.filter(a => a.priority === 'CRITICAL').length;
    const highCount = requiredActions.filter(a => a.priority === 'HIGH').length;
    const behaviorCount = behaviorChanges.filter(c => c.actionRequired).length;

    const totalComplexity = criticalCount * 5 + highCount * 3 + behaviorCount * 2;

    if (totalComplexity === 0) return '< 1 minute';
    if (totalComplexity <= 5) return '2-5 minutes';
    if (totalComplexity <= 10) return '5-10 minutes';
    if (totalComplexity <= 20) return '10-20 minutes';
    return '20+ minutes';
  }

  /**
   * Generate a human-readable summary for logging/display
   */
  generateSummary(guidance: PostUpdateGuidance): string {
    const lines: string[] = [];

    lines.push(`Node "${guidance.nodeName}" upgraded from v${guidance.oldVersion} to v${guidance.newVersion}`);
    lines.push(`Status: ${guidance.migrationStatus.toUpperCase()}`);
    lines.push(`Confidence: ${guidance.confidence}`);
    lines.push(`Estimated time: ${guidance.estimatedTime}`);

    if (guidance.requiredActions.length > 0) {
      lines.push(`\nRequired actions: ${guidance.requiredActions.length}`);
      for (const action of guidance.requiredActions.slice(0, 3)) {
        lines.push(`  - [${action.priority}] ${action.property}: ${action.reason}`);
      }
      if (guidance.requiredActions.length > 3) {
        lines.push(`  ... and ${guidance.requiredActions.length - 3} more`);
      }
    }

    if (guidance.behaviorChanges.length > 0) {
      lines.push(`\nBehavior changes: ${guidance.behaviorChanges.length}`);
      for (const change of guidance.behaviorChanges) {
        lines.push(`  - ${change.aspect}: ${change.newBehavior}`);
      }
    }

    return lines.join('\n');
  }
}

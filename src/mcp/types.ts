/**
 * Type definitions for MCP server
 */

import { DatabaseAdapter } from '../database/database-adapter';
import { NodeRepository } from '../database/node-repository';
import { TemplateService } from '../templates/template-service';
import { SimpleCache } from '../utils/simple-cache';
import { InstanceContext } from '../types/instance-context';

/**
 * Server context passed to all handler functions
 */
export interface ServerContext {
  db: DatabaseAdapter;
  repository: NodeRepository;
  cache: SimpleCache;
  templateService: TemplateService;
  instanceContext?: InstanceContext;
}

export interface NodeRow {
  node_type: string;
  package_name: string;
  display_name: string;
  description?: string;
  category?: string;
  development_style?: string;
  is_ai_tool: number;
  is_trigger: number;
  is_webhook: number;
  is_versioned: number;
  is_tool_variant: number;
  tool_variant_of?: string;
  has_tool_variant: number;
  version?: string;
  documentation?: string;
  properties_schema?: string;
  operations?: string;
  credentials_required?: string;
  // AI documentation fields
  ai_documentation_summary?: string;
  ai_summary_generated_at?: string;
}

export interface VersionSummary {
  currentVersion: string;
  totalVersions: number;
  hasVersionHistory: boolean;
}

export interface ToolVariantGuidance {
  isToolVariant: boolean;
  toolVariantOf?: string;
  hasToolVariant: boolean;
  toolVariantNodeType?: string;
  guidance?: string;
}

export interface NodeMinimalInfo {
  nodeType: string;
  workflowNodeType: string;
  displayName: string;
  description: string;
  category: string;
  package: string;
  isAITool: boolean;
  isTrigger: boolean;
  isWebhook: boolean;
  toolVariantInfo?: ToolVariantGuidance;
}

export interface NodeStandardInfo {
  nodeType: string;
  displayName: string;
  description: string;
  category: string;
  requiredProperties: any[];
  commonProperties: any[];
  operations?: any[];
  credentials?: any;
  examples?: any[];
  versionInfo: VersionSummary;
  toolVariantInfo?: ToolVariantGuidance;
}

export interface NodeFullInfo {
  nodeType: string;
  displayName: string;
  description: string;
  category: string;
  properties: any[];
  operations?: any[];
  credentials?: any;
  documentation?: string;
  versionInfo: VersionSummary;
  toolVariantInfo?: ToolVariantGuidance;
}

export interface VersionHistoryInfo {
  nodeType: string;
  versions: any[];
  latestVersion: string;
  hasBreakingChanges: boolean;
}

export interface VersionComparisonInfo {
  nodeType: string;
  fromVersion: string;
  toVersion: string;
  changes: any[];
  breakingChanges?: any[];
  migrations?: any[];
}

export type NodeInfoResponse = NodeMinimalInfo | NodeStandardInfo | NodeFullInfo | VersionHistoryInfo | VersionComparisonInfo;

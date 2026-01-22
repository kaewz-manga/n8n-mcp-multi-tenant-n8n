import { ToolDocumentation } from '../types';

export const validateNodeDoc: ToolDocumentation = {
  name: 'validate_node',
  category: 'validation',
  essentials: {
    description: 'Validate n8n node configuration. Use mode="full" for comprehensive validation with errors/warnings/suggestions, mode="minimal" for quick required fields check.',
    keyParameters: ['nodeType', 'config', 'mode', 'profile'],
    example: 'validate_node({nodeType: "nodes-base.slack", config: {resource: "channel", operation: "create"}})',
    performance: 'Fast (<100ms)',
    tips: [
      'Always call get_node({detail:"standard"}) first to see required fields',
      'Use mode="minimal" for quick checks during development',
      'Use mode="full" with profile="strict" before production deployment',
      'Includes automatic structure validation for filter, resourceMapper, etc.'
    ]
  },
  full: {
    description: `**Validation Modes:**
- full (default): Comprehensive validation with errors, warnings, suggestions, and automatic structure validation
- minimal: Quick check for required fields only - fast but less thorough

**Validation Profiles (for mode="full"):**
- minimal: Very lenient, basic checks only
- runtime: Standard validation (default)
- ai-friendly: Balanced for AI agent workflows
- strict: Most thorough, recommended for production

**Automatic Structure Validation:**
Validates complex n8n types automatically:
- filter (FilterValue): 40+ operations (equals, contains, regex, etc.)
- resourceMapper (ResourceMapperValue): Data mapping configuration
- assignmentCollection (AssignmentCollectionValue): Variable assignments
- resourceLocator (INodeParameterResourceLocator): Resource selection modes`,
    parameters: {
      nodeType: { type: 'string', required: true, description: 'Node type with prefix: "nodes-base.slack"' },
      config: { type: 'object', required: true, description: 'Configuration object to validate. Use {} for empty config' },
      mode: { type: 'string', required: false, description: 'Validation mode: "full" (default) or "minimal"' },
      profile: { type: 'string', required: false, description: 'Validation profile for mode=full: "minimal", "runtime" (default), "ai-friendly", "strict"' }
    },
    returns: `Object containing:
- nodeType: The validated node type
- workflowNodeType: Type to use in workflow JSON
- displayName: Human-readable node name
- valid: Boolean indicating if configuration is valid
- errors: Array of error objects with type, property, message, fix
- warnings: Array of warning objects with suggestions
- suggestions: Array of improvement suggestions
- missingRequiredFields: (mode=minimal only) Array of missing required field names
- summary: Object with hasErrors, errorCount, warningCount, suggestionCount`,
    examples: [
      '// Full validation with default profile\nvalidate_node({nodeType: "nodes-base.slack", config: {resource: "channel", operation: "create"}})',
      '// Quick required fields check\nvalidate_node({nodeType: "nodes-base.webhook", config: {}, mode: "minimal"})',
      '// Strict validation for production\nvalidate_node({nodeType: "nodes-base.httpRequest", config: {...}, mode: "full", profile: "strict"})',
      '// Validate IF node with filter\nvalidate_node({nodeType: "nodes-base.if", config: {conditions: {combinator: "and", conditions: [...]}}})'
    ],
    useCases: [
      'Validate node configuration before adding to workflow',
      'Quick check for required fields during development',
      'Pre-production validation with strict profile',
      'Validate complex structures (filters, resource mappers)',
      'Get suggestions for improving node configuration'
    ],
    performance: 'Fast validation: <50ms for minimal mode, <100ms for full mode. Structure validation adds minimal overhead.',
    bestPractices: [
      'Always call get_node() first to understand required fields',
      'Use mode="minimal" for rapid iteration during development',
      'Use profile="strict" before deploying to production',
      'Pay attention to warnings - they often prevent runtime issues',
      'Validate after any configuration changes'
    ],
    pitfalls: [
      'Empty config {} is valid for some nodes (e.g., manual trigger)',
      'mode="minimal" only checks required fields, not value validity',
      'Some warnings may be acceptable for specific use cases',
      'Credential validation requires runtime context'
    ],
    relatedTools: ['get_node', 'validate_workflow', 'n8n_autofix_workflow']
  }
};

import { ToolDocumentation } from '../types';

export const n8nTestWorkflowDoc: ToolDocumentation = {
  name: 'n8n_test_workflow',
  category: 'workflow_management',
  essentials: {
    description: 'Test/trigger workflow execution. Auto-detects trigger type (webhook/form/chat). Only workflows with these triggers can be executed externally.',
    keyParameters: ['workflowId', 'triggerType', 'data', 'message'],
    example: 'n8n_test_workflow({workflowId: "123"}) - auto-detect trigger',
    performance: 'Immediate trigger, response time depends on workflow complexity',
    tips: [
      'Auto-detects trigger type from workflow if not specified',
      'Workflow must have a webhook, form, or chat trigger to be executable',
      'For chat triggers, message is required',
      'All trigger types require the workflow to be ACTIVE'
    ]
  },
  full: {
    description: `Test and trigger n8n workflows through HTTP-based methods. This unified tool supports multiple trigger types:

**Trigger Types:**
- **webhook**: HTTP-based triggers (GET/POST/PUT/DELETE)
- **form**: Form submission triggers
- **chat**: AI chat triggers with conversation support

**Important:** n8n's public API does not support direct workflow execution. Only workflows with webhook, form, or chat triggers can be executed externally. Workflows with schedule, manual, or other trigger types cannot be triggered via this API.

The tool auto-detects the appropriate trigger type by analyzing the workflow's trigger node. You can override this with the triggerType parameter.`,
    parameters: {
      workflowId: {
        type: 'string',
        required: true,
        description: 'Workflow ID to execute'
      },
      triggerType: {
        type: 'string',
        required: false,
        enum: ['webhook', 'form', 'chat'],
        description: 'Trigger type. Auto-detected if not specified. Workflow must have matching trigger node.'
      },
      httpMethod: {
        type: 'string',
        required: false,
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'For webhook: HTTP method (default: from workflow config or POST)'
      },
      webhookPath: {
        type: 'string',
        required: false,
        description: 'For webhook: override the webhook path'
      },
      message: {
        type: 'string',
        required: false,
        description: 'For chat: message to send (required for chat triggers)'
      },
      sessionId: {
        type: 'string',
        required: false,
        description: 'For chat: session ID for conversation continuity'
      },
      data: {
        type: 'object',
        required: false,
        description: 'Input data/payload for webhook or form fields'
      },
      headers: {
        type: 'object',
        required: false,
        description: 'Custom HTTP headers'
      },
      timeout: {
        type: 'number',
        required: false,
        description: 'Timeout in ms (default: 120000)'
      },
      waitForResponse: {
        type: 'boolean',
        required: false,
        description: 'Wait for workflow completion (default: true)'
      }
    },
    returns: `Execution response including:
- success: boolean
- data: workflow output data
- executionId: for tracking/debugging
- triggerType: detected or specified trigger type
- metadata: timing and request details`,
    examples: [
      'n8n_test_workflow({workflowId: "123"}) - Auto-detect and trigger',
      'n8n_test_workflow({workflowId: "123", triggerType: "webhook", data: {name: "John"}}) - Webhook with data',
      'n8n_test_workflow({workflowId: "123", triggerType: "chat", message: "Hello AI"}) - Chat trigger',
      'n8n_test_workflow({workflowId: "123", triggerType: "form", data: {email: "test@example.com"}}) - Form submission'
    ],
    useCases: [
      'Test workflows during development',
      'Trigger AI chat workflows with messages',
      'Submit form data to form-triggered workflows',
      'Integrate n8n workflows with external systems via webhooks'
    ],
    performance: `Performance varies based on workflow complexity and waitForResponse setting:
- Webhook: Immediate trigger, depends on workflow
- Form: Immediate trigger, depends on workflow
- Chat: May have additional AI processing time`,
    errorHandling: `**Error Response with Execution Guidance**

When execution fails, the response includes guidance for debugging:

**With Execution ID** (workflow started but failed):
- Use n8n_executions({action: 'get', id: executionId, mode: 'preview'}) to investigate

**Without Execution ID** (workflow didn't start):
- Use n8n_executions({action: 'list', workflowId: 'wf_id'}) to find recent executions

**Common Errors:**
- "Workflow not found" - Check workflow ID exists
- "Workflow not active" - Activate workflow (required for all trigger types)
- "Workflow cannot be triggered externally" - Workflow has no webhook/form/chat trigger
- "Chat message required" - Provide message parameter for chat triggers
- "SSRF protection" - URL validation failed`,
    bestPractices: [
      'Let auto-detection choose the trigger type when possible',
      'Ensure workflow has a webhook, form, or chat trigger before testing',
      'For chat workflows, provide sessionId for multi-turn conversations',
      'Use mode="preview" with n8n_executions for efficient debugging',
      'Test with small data payloads first',
      'Activate workflows before testing (use n8n_update_partial_workflow with activateWorkflow)'
    ],
    pitfalls: [
      'All trigger types require the workflow to be ACTIVE',
      'Workflows without webhook/form/chat triggers cannot be executed externally',
      'Chat trigger requires message parameter',
      'Form data must match expected form fields',
      'Webhook method must match node configuration'
    ],
    relatedTools: ['n8n_executions', 'n8n_get_workflow', 'n8n_create_workflow', 'n8n_validate_workflow']
  }
};

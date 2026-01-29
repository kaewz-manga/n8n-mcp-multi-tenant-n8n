/**
 * Template handlers for MCP tools
 * Handles workflow template search, listing, and retrieval operations
 */

import { DatabaseAdapter } from '../../database/database-adapter';
import { TemplateService } from '../../templates/template-service';
import { TaskTemplates } from '../../services/task-templates';
import { getToolsOverview, getToolDocumentation } from '../tools-documentation';

/**
 * Get tools documentation
 */
export async function getToolsDocumentation(
  topic: string | undefined,
  depth: 'essentials' | 'full'
): Promise<string> {
  if (!topic || topic === 'overview') {
    return getToolsOverview(depth);
  }

  return getToolDocumentation(topic, depth);
}

/**
 * List workflow templates
 */
export async function listTemplates(
  limit: number,
  offset: number,
  sortBy: 'views' | 'created_at' | 'name',
  includeMetadata: boolean,
  templateService: TemplateService
): Promise<any> {
  const result = await templateService.listTemplates(limit, offset, sortBy, includeMetadata);

  return {
    ...result,
    tip: result.items.length > 0 ?
      `Use get_template(templateId) to get full workflow details. Total: ${result.total} templates available.` :
      "No templates found. Run 'npm run fetch:templates' to update template database"
  };
}

/**
 * List templates containing specific nodes
 */
export async function listNodeTemplates(
  nodeTypes: string[],
  limit: number,
  offset: number,
  templateService: TemplateService
): Promise<any> {
  const result = await templateService.listNodeTemplates(nodeTypes, limit, offset);

  if (result.items.length === 0 && offset === 0) {
    return {
      ...result,
      message: `No templates found using nodes: ${nodeTypes.join(', ')}`,
      tip: "Try searching with more common nodes or run 'npm run fetch:templates' to update template database"
    };
  }

  return {
    ...result,
    tip: `Showing ${result.items.length} of ${result.total} templates. Use offset for pagination.`
  };
}

/**
 * Get a specific template by ID
 */
export async function getTemplate(
  templateId: number,
  mode: 'nodes_only' | 'structure' | 'full',
  templateService: TemplateService
): Promise<any> {
  const template = await templateService.getTemplate(templateId, mode);

  if (!template) {
    return {
      error: `Template ${templateId} not found`,
      tip: "Use list_templates, list_node_templates or search_templates to find available templates"
    };
  }

  const usage = mode === 'nodes_only' ? "Node list for quick overview" :
    mode === 'structure' ? "Workflow structure without full details" :
      "Complete workflow JSON ready to import into n8n";

  return {
    mode,
    template,
    usage
  };
}

/**
 * Search templates by keyword
 */
export async function searchTemplates(
  query: string,
  limit: number,
  offset: number,
  fields: string[] | undefined,
  templateService: TemplateService
): Promise<any> {
  const result = await templateService.searchTemplates(query, limit, offset, fields);

  if (result.items.length === 0 && offset === 0) {
    return {
      ...result,
      message: `No templates found matching: "${query}"`,
      tip: "Try different keywords or run 'npm run fetch:templates' to update template database"
    };
  }

  return {
    ...result,
    query,
    tip: `Found ${result.total} templates matching "${query}". Showing ${result.items.length}.`
  };
}

/**
 * Get templates for a specific task
 */
export async function getTemplatesForTask(
  task: string,
  limit: number,
  offset: number,
  templateService: TemplateService
): Promise<any> {
  const result = await templateService.getTemplatesForTask(task, limit, offset);
  const availableTasks = templateService.listAvailableTasks();

  if (result.items.length === 0 && offset === 0) {
    return {
      ...result,
      message: `No templates found for task: ${task}`,
      availableTasks,
      tip: "Try a different task or use search_templates for custom searches"
    };
  }

  return {
    ...result,
    task,
    description: getTaskDescription(task),
    tip: `${result.total} templates available for ${task}. Showing ${result.items.length}.`
  };
}

/**
 * Search templates by metadata filters
 */
export async function searchTemplatesByMetadata(
  filters: {
    category?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    maxSetupMinutes?: number;
    minSetupMinutes?: number;
    requiredService?: string;
    targetAudience?: string;
  },
  limit: number,
  offset: number,
  templateService: TemplateService
): Promise<any> {
  const result = await templateService.searchTemplatesByMetadata(filters, limit, offset);

  // Build filter summary for feedback
  const filterSummary: string[] = [];
  if (filters.category) filterSummary.push(`category: ${filters.category}`);
  if (filters.complexity) filterSummary.push(`complexity: ${filters.complexity}`);
  if (filters.maxSetupMinutes) filterSummary.push(`max setup: ${filters.maxSetupMinutes} min`);
  if (filters.minSetupMinutes) filterSummary.push(`min setup: ${filters.minSetupMinutes} min`);
  if (filters.requiredService) filterSummary.push(`service: ${filters.requiredService}`);
  if (filters.targetAudience) filterSummary.push(`audience: ${filters.targetAudience}`);

  if (result.items.length === 0 && offset === 0) {
    // Get available categories and audiences for suggestions
    const availableCategories = await templateService.getAvailableCategories();
    const availableAudiences = await templateService.getAvailableTargetAudiences();

    return {
      ...result,
      message: `No templates found with filters: ${filterSummary.join(', ')}`,
      availableCategories: availableCategories.slice(0, 10),
      availableAudiences: availableAudiences.slice(0, 5),
      tip: "Try broader filters or different categories. Use list_templates to see all templates."
    };
  }

  return {
    ...result,
    filters,
    filterSummary: filterSummary.join(', '),
    tip: `Found ${result.total} templates matching filters. Showing ${result.items.length}. Each includes AI-generated metadata.`
  };
}

/**
 * List available tasks
 */
export async function listTasks(category: string | undefined): Promise<any> {
  if (category) {
    const categories = TaskTemplates.getTaskCategories();
    const tasks = categories[category];

    if (!tasks) {
      throw new Error(
        `Unknown category: ${category}. Available categories: ${Object.keys(categories).join(', ')}`
      );
    }

    return {
      category,
      tasks: tasks.map(task => {
        const template = TaskTemplates.getTaskTemplate(task);
        return {
          task,
          description: template?.description || '',
          nodeType: template?.nodeType || ''
        };
      })
    };
  }

  // Return all tasks grouped by category
  const categories = TaskTemplates.getTaskCategories();
  const result: any = {
    totalTasks: TaskTemplates.getAllTasks().length,
    categories: {}
  };

  for (const [cat, tasks] of Object.entries(categories)) {
    result.categories[cat] = tasks.map(task => {
      const template = TaskTemplates.getTaskTemplate(task);
      return {
        task,
        description: template?.description || '',
        nodeType: template?.nodeType || ''
      };
    });
  }

  return result;
}

// Helper function

function getTaskDescription(task: string): string {
  const descriptions: Record<string, string> = {
    'ai_automation': 'AI-powered workflows using OpenAI, LangChain, and other AI tools',
    'data_sync': 'Synchronize data between databases, spreadsheets, and APIs',
    'webhook_processing': 'Process incoming webhooks and trigger automated actions',
    'email_automation': 'Send, receive, and process emails automatically',
    'slack_integration': 'Integrate with Slack for notifications and bot interactions',
    'data_transformation': 'Transform, clean, and manipulate data',
    'file_processing': 'Handle file uploads, downloads, and transformations',
    'scheduling': 'Schedule recurring tasks and time-based automations',
    'api_integration': 'Connect to external APIs and web services',
    'database_operations': 'Query, insert, update, and manage database records'
  };

  return descriptions[task] || 'Workflow templates for this task';
}

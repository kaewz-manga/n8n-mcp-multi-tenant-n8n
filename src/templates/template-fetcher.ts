import axios from 'axios';
import { logger } from '../utils/logger';

export interface TemplateNode {
  id: number;
  name: string;
  icon: string;
}

export interface TemplateUser {
  id: number;
  name: string;
  username: string;
  verified: boolean;
}

export interface TemplateWorkflow {
  id: number;
  name: string;
  description: string;
  totalViews: number;
  createdAt: string;
  user: TemplateUser;
  nodes: TemplateNode[];
}

export interface TemplateDetail {
  id: number;
  name: string;
  description: string;
  views: number;
  createdAt: string;
  workflow: {
    nodes: any[];
    connections: any;
    settings?: any;
  };
}

export class TemplateFetcher {
  private readonly baseUrl = 'https://api.n8n.io/api/templates';
  private readonly pageSize = 250; // Maximum allowed by API
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second base delay

  /**
   * Retry helper for API calls
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    context: string,
    maxRetries: number = this.maxRetries
  ): Promise<T | null> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        if (attempt < maxRetries) {
          const delay = this.retryDelay * attempt; // Exponential backoff
          logger.warn(`${context} - Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    logger.error(`${context} - All ${maxRetries} attempts failed, skipping`, lastError);
    return null;
  }

  /**
   * Fetch all templates and filter to last 12 months
   * This fetches ALL pages first, then applies date filter locally
   */
  async fetchTemplates(progressCallback?: (current: number, total: number) => void, sinceDate?: Date): Promise<TemplateWorkflow[]> {
    const allTemplates = await this.fetchAllTemplates(progressCallback);

    // Use provided date or default to 12 months ago
    const cutoffDate = sinceDate || (() => {
      const oneYearAgo = new Date();
      oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);
      return oneYearAgo;
    })();

    const recentTemplates = allTemplates.filter((w: TemplateWorkflow) => {
      const createdDate = new Date(w.createdAt);
      return createdDate >= cutoffDate;
    });

    logger.info(`Filtered to ${recentTemplates.length} templates since ${cutoffDate.toISOString().split('T')[0]} (out of ${allTemplates.length} total)`);
    return recentTemplates;
  }
  
  /**
   * Fetch ALL templates from the API without date filtering
   * Used internally and can be used for other filtering strategies
   */
  async fetchAllTemplates(progressCallback?: (current: number, total: number) => void): Promise<TemplateWorkflow[]> {
    const allTemplates: TemplateWorkflow[] = [];
    let page = 1;
    let hasMore = true;
    let totalWorkflows = 0;

    logger.info('Starting complete template fetch from n8n.io API');

    while (hasMore) {
      const result = await this.retryWithBackoff(
        async () => {
          const response = await axios.get(`${this.baseUrl}/search`, {
            params: {
              page,
              rows: this.pageSize
              // Note: sort_by parameter doesn't work, templates come in popularity order
            }
          });
          return response.data;
        },
        `Fetching templates page ${page}`
      );

      if (result === null) {
        // All retries failed for this page, skip it and continue
        logger.warn(`Skipping page ${page} after ${this.maxRetries} failed attempts`);
        page++;
        continue;
      }

      const { workflows } = result;
      totalWorkflows = result.totalWorkflows || totalWorkflows;

      allTemplates.push(...workflows);

      // Calculate total pages for better progress reporting
      const totalPages = Math.ceil(totalWorkflows / this.pageSize);

      if (progressCallback) {
        // Enhanced progress with page information
        progressCallback(allTemplates.length, totalWorkflows);
      }

      logger.debug(`Fetched page ${page}/${totalPages}: ${workflows.length} templates (total so far: ${allTemplates.length}/${totalWorkflows})`);

      // Check if there are more pages
      if (workflows.length < this.pageSize) {
        hasMore = false;
      }

      page++;

      // Rate limiting - be nice to the API (slightly faster with 250 rows/page)
      if (hasMore) {
        await this.sleep(300); // 300ms between requests (was 500ms with 100 rows)
      }
    }

    logger.info(`Fetched all ${allTemplates.length} templates from n8n.io`);
    return allTemplates;
  }
  
  async fetchTemplateDetail(workflowId: number): Promise<TemplateDetail | null> {
    const result = await this.retryWithBackoff(
      async () => {
        const response = await axios.get(`${this.baseUrl}/workflows/${workflowId}`);
        return response.data.workflow;
      },
      `Fetching template detail for workflow ${workflowId}`
    );

    return result;
  }
  
  async fetchAllTemplateDetails(
    workflows: TemplateWorkflow[],
    progressCallback?: (current: number, total: number) => void
  ): Promise<Map<number, TemplateDetail>> {
    const details = new Map<number, TemplateDetail>();
    let skipped = 0;

    logger.info(`Fetching details for ${workflows.length} templates`);

    for (let i = 0; i < workflows.length; i++) {
      const workflow = workflows[i];

      const detail = await this.fetchTemplateDetail(workflow.id);

      if (detail !== null) {
        details.set(workflow.id, detail);
      } else {
        skipped++;
        logger.warn(`Skipped workflow ${workflow.id} after ${this.maxRetries} failed attempts`);
      }

      if (progressCallback) {
        progressCallback(i + 1, workflows.length);
      }

      // Rate limiting (conservative to avoid API throttling)
      await this.sleep(150); // 150ms between requests
    }

    logger.info(`Successfully fetched ${details.size} template details (${skipped} skipped)`);
    return details;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
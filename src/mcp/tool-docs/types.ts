export interface ToolDocumentation {
  name: string;
  category: string;
  essentials: {
    description: string;
    keyParameters: string[];
    example: string;
    performance: string;
    tips: string[];
  };
  full: {
    description: string;
    parameters: Record<string, {
      type: string;
      description: string;
      required?: boolean;
      default?: any;
      examples?: string[];
      enum?: string[];
    }>;
    returns: string;
    examples: string[];
    useCases: string[];
    performance: string;
    errorHandling?: string; // Optional: Documentation on error handling and debugging
    bestPractices: string[];
    pitfalls: string[];
    modeComparison?: string; // Optional: Comparison of different modes for tools with multiple modes
    relatedTools: string[];
  };
}
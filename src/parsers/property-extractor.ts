import type { NodeClass } from '../types/node-types';

export class PropertyExtractor {
  /**
   * Extract properties with proper handling of n8n's complex structures
   */
  extractProperties(nodeClass: NodeClass): any[] {
    const properties: any[] = [];
    
    // First try to get instance-level properties
    let instance: any;
    try {
      instance = typeof nodeClass === 'function' ? new nodeClass() : nodeClass;
    } catch (e) {
      // Failed to instantiate
    }
    
    // Handle versioned nodes - check instance for nodeVersions
    if (instance?.nodeVersions) {
      const versions = Object.keys(instance.nodeVersions).map(Number);
      if (versions.length > 0) {
        const latestVersion = Math.max(...versions);
        if (!isNaN(latestVersion)) {
          const versionedNode = instance.nodeVersions[latestVersion];

          if (versionedNode?.description?.properties) {
            return this.normalizeProperties(versionedNode.description.properties);
          }
        }
      }
    }
    
    // Check for description with properties
    const description = instance?.description || instance?.baseDescription || 
                       this.getNodeDescription(nodeClass);
    
    if (description?.properties) {
      return this.normalizeProperties(description.properties);
    }
    
    return properties;
  }
  
  private getNodeDescription(nodeClass: NodeClass): any {
    // Try to get description from the class first
    let description: any;

    if (typeof nodeClass === 'function') {
      // Try to instantiate to get description
      try {
        const instance = new nodeClass();
        // Strategic any assertion for instance properties
        const inst = instance as any;
        description = inst.description || inst.baseDescription || {};
      } catch (e) {
        // Some nodes might require parameters to instantiate
        // Strategic any assertion for class-level properties
        const nodeClassAny = nodeClass as any;
        description = nodeClassAny.description || {};
      }
    } else {
      // Strategic any assertion for instance properties
      const inst = nodeClass as any;
      description = inst.description || {};
    }

    return description;
  }
  
  /**
   * Extract operations from both declarative and programmatic nodes
   */
  extractOperations(nodeClass: NodeClass): any[] {
    const operations: any[] = [];
    
    // First try to get instance-level data
    let instance: any;
    try {
      instance = typeof nodeClass === 'function' ? new nodeClass() : nodeClass;
    } catch (e) {
      // Failed to instantiate
    }
    
    // Handle versioned nodes
    if (instance?.nodeVersions) {
      const versions = Object.keys(instance.nodeVersions).map(Number);
      if (versions.length > 0) {
        const latestVersion = Math.max(...versions);
        if (!isNaN(latestVersion)) {
          const versionedNode = instance.nodeVersions[latestVersion];

          if (versionedNode?.description) {
            return this.extractOperationsFromDescription(versionedNode.description);
          }
        }
      }
    }
    
    // Get description
    const description = instance?.description || instance?.baseDescription || 
                       this.getNodeDescription(nodeClass);
    
    return this.extractOperationsFromDescription(description);
  }
  
  private extractOperationsFromDescription(description: any): any[] {
    const operations: any[] = [];
    
    if (!description) return operations;
    
    // Declarative nodes (with routing)
    if (description.routing) {
      const routing = description.routing;
      
      // Extract from request.resource and request.operation
      if (routing.request?.resource) {
        const resources = routing.request.resource.options || [];
        const operationOptions = routing.request.operation?.options || {};
        
        resources.forEach((resource: any) => {
          const resourceOps = operationOptions[resource.value] || [];
          resourceOps.forEach((op: any) => {
            operations.push({
              resource: resource.value,
              operation: op.value,
              name: `${resource.name} - ${op.name}`,
              action: op.action
            });
          });
        });
      }
    }
    
    // Programmatic nodes - look for operation property in properties
    if (description.properties && Array.isArray(description.properties)) {
      const operationProp = description.properties.find(
        (p: any) => p.name === 'operation' || p.name === 'action'
      );
      
      if (operationProp?.options) {
        operationProp.options.forEach((op: any) => {
          operations.push({
            operation: op.value,
            name: op.name,
            description: op.description
          });
        });
      }
    }
    
    return operations;
  }
  
  /**
   * Deep search for AI tool capability
   */
  detectAIToolCapability(nodeClass: NodeClass): boolean {
    const description = this.getNodeDescription(nodeClass);

    // Direct property check
    if (description?.usableAsTool === true) return true;

    // Check in actions for declarative nodes
    if (description?.actions?.some((a: any) => a.usableAsTool === true)) return true;

    // Check versioned nodes
    // Strategic any assertion for nodeVersions property
    const nodeClassAny = nodeClass as any;
    if (nodeClassAny.nodeVersions) {
      for (const version of Object.values(nodeClassAny.nodeVersions)) {
        if ((version as any).description?.usableAsTool === true) return true;
      }
    }

    // Check for specific AI-related properties
    const aiIndicators = ['openai', 'anthropic', 'huggingface', 'cohere', 'ai'];
    const nodeName = description?.name?.toLowerCase() || '';

    return aiIndicators.some(indicator => nodeName.includes(indicator));
  }
  
  /**
   * Extract credential requirements with proper structure
   */
  extractCredentials(nodeClass: NodeClass): any[] {
    const credentials: any[] = [];
    
    // First try to get instance-level data
    let instance: any;
    try {
      instance = typeof nodeClass === 'function' ? new nodeClass() : nodeClass;
    } catch (e) {
      // Failed to instantiate
    }
    
    // Handle versioned nodes
    if (instance?.nodeVersions) {
      const versions = Object.keys(instance.nodeVersions).map(Number);
      if (versions.length > 0) {
        const latestVersion = Math.max(...versions);
        if (!isNaN(latestVersion)) {
          const versionedNode = instance.nodeVersions[latestVersion];

          if (versionedNode?.description?.credentials) {
            return versionedNode.description.credentials;
          }
        }
      }
    }
    
    // Check for description with credentials
    const description = instance?.description || instance?.baseDescription || 
                       this.getNodeDescription(nodeClass);
    
    if (description?.credentials) {
      return description.credentials;
    }
    
    return credentials;
  }
  
  private normalizeProperties(properties: any[]): any[] {
    // Ensure all properties have consistent structure
    return properties.map(prop => ({
      displayName: prop.displayName,
      name: prop.name,
      type: prop.type,
      default: prop.default,
      description: prop.description,
      options: prop.options,
      required: prop.required,
      displayOptions: prop.displayOptions,
      typeOptions: prop.typeOptions,
      modes: prop.modes, // For resourceLocator type properties - modes are at top level
      noDataExpression: prop.noDataExpression
    }));
  }
}
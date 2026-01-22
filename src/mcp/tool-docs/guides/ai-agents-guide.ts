import { ToolDocumentation } from '../types';

export const aiAgentsGuide: ToolDocumentation = {
  name: 'ai_agents_guide',
  category: 'guides',
  essentials: {
    description: 'Comprehensive guide to building AI Agent workflows in n8n. Covers architecture, connections, tools, validation, and best practices for production AI systems.',
    keyParameters: [],
    example: 'Use tools_documentation({topic: "ai_agents_guide"}) to access this guide',
    performance: 'N/A - Documentation only',
    tips: [
      'Start with Chat Trigger → AI Agent → Language Model pattern',
      'Always connect language model BEFORE enabling AI Agent',
      'Use proper toolDescription for all AI tools (15+ characters)',
      'Validate workflows with n8n_validate_workflow before deployment',
      'Use includeExamples=true when searching for AI nodes',
      'Check FINAL_AI_VALIDATION_SPEC.md for detailed requirements'
    ]
  },
  full: {
    description: `# Complete Guide to AI Agents in n8n

This comprehensive guide covers everything you need to build production-ready AI Agent workflows in n8n.

## Table of Contents
1. [AI Agent Architecture](#architecture)
2. [Essential Connection Types](#connections)
3. [Building Your First AI Agent](#first-agent)
4. [AI Tools Deep Dive](#tools)
5. [Advanced Patterns](#advanced)
6. [Validation & Best Practices](#validation)
7. [Troubleshooting](#troubleshooting)

---

## 1. AI Agent Architecture {#architecture}

### Core Components

An n8n AI Agent workflow typically consists of:

1. **Chat Trigger**: Entry point for user interactions
   - Webhook-based or manual trigger
   - Supports streaming responses (responseMode)
   - Passes user message to AI Agent

2. **AI Agent**: The orchestrator
   - Manages conversation flow
   - Decides when to use tools
   - Iterates until task is complete
   - Supports fallback models for reliability

3. **Language Model**: The AI brain
   - OpenAI GPT-4, Claude, Gemini, etc.
   - Connected via ai_languageModel port
   - Can have primary + fallback for reliability

4. **Tools**: AI Agent's capabilities
   - HTTP Request, Code, Vector Store, etc.
   - Connected via ai_tool port
   - Each tool needs clear toolDescription

5. **Optional Components**:
   - Memory (conversation history)
   - Output Parser (structured responses)
   - Vector Store (knowledge retrieval)

### Connection Flow

**CRITICAL**: AI connections flow TO the consumer (reversed from standard n8n):

\`\`\`
Standard n8n:  [Source] --main--> [Target]
AI pattern:    [Language Model] --ai_languageModel--> [AI Agent]
               [HTTP Tool] --ai_tool--> [AI Agent]
\`\`\`

This is why you use \`sourceOutput: "ai_languageModel"\` when connecting components.

---

## 2. Essential Connection Types {#connections}

### The 8 AI Connection Types

1. **ai_languageModel**
   - FROM: OpenAI Chat Model, Anthropic, Google Gemini, etc.
   - TO: AI Agent, Basic LLM Chain
   - REQUIRED: Every AI Agent needs 1-2 language models
   - Example: \`{type: "addConnection", source: "OpenAI", target: "AI Agent", sourceOutput: "ai_languageModel"}\`

2. **ai_tool**
   - FROM: Any tool node (HTTP Request Tool, Code Tool, etc.)
   - TO: AI Agent
   - REQUIRED: At least 1 tool recommended
   - Example: \`{type: "addConnection", source: "HTTP Request Tool", target: "AI Agent", sourceOutput: "ai_tool"}\`

3. **ai_memory**
   - FROM: Window Buffer Memory, Conversation Summary, etc.
   - TO: AI Agent
   - OPTIONAL: 0-1 memory system
   - Enables conversation history tracking

4. **ai_outputParser**
   - FROM: Structured Output Parser, JSON Parser, etc.
   - TO: AI Agent
   - OPTIONAL: For structured responses
   - Must set hasOutputParser=true on AI Agent

5. **ai_embedding**
   - FROM: Embeddings OpenAI, Embeddings Google, etc.
   - TO: Vector Store (Pinecone, In-Memory, etc.)
   - REQUIRED: For vector-based retrieval

6. **ai_vectorStore**
   - FROM: Vector Store node
   - TO: Vector Store Tool
   - REQUIRED: For retrieval-augmented generation (RAG)

7. **ai_document**
   - FROM: Document Loader, Default Data Loader
   - TO: Vector Store
   - REQUIRED: Provides data for vector storage

8. **ai_textSplitter**
   - FROM: Text Splitter nodes
   - TO: Document processing chains
   - OPTIONAL: Chunk large documents

### Connection Examples

\`\`\`typescript
// Basic AI Agent setup
n8n_update_partial_workflow({
  id: "workflow_id",
  operations: [
    // Connect language model (REQUIRED)
    {
      type: "addConnection",
      source: "OpenAI Chat Model",
      target: "AI Agent",
      sourceOutput: "ai_languageModel"
    },
    // Connect tools
    {
      type: "addConnection",
      source: "HTTP Request Tool",
      target: "AI Agent",
      sourceOutput: "ai_tool"
    },
    {
      type: "addConnection",
      source: "Code Tool",
      target: "AI Agent",
      sourceOutput: "ai_tool"
    },
    // Add memory (optional)
    {
      type: "addConnection",
      source: "Window Buffer Memory",
      target: "AI Agent",
      sourceOutput: "ai_memory"
    }
  ]
})
\`\`\`

---

## 3. Building Your First AI Agent {#first-agent}

### Step-by-Step Tutorial

#### Step 1: Create Chat Trigger

Use \`n8n_create_workflow\` or manually create a workflow with:

\`\`\`typescript
{
  name: "My First AI Agent",
  nodes: [
    {
      id: "chat_trigger",
      name: "Chat Trigger",
      type: "@n8n/n8n-nodes-langchain.chatTrigger",
      position: [100, 100],
      parameters: {
        options: {
          responseMode: "lastNode"  // or "streaming" for real-time
        }
      }
    }
  ],
  connections: {}
}
\`\`\`

#### Step 2: Add Language Model

\`\`\`typescript
n8n_update_partial_workflow({
  id: "workflow_id",
  operations: [
    {
      type: "addNode",
      node: {
        name: "OpenAI Chat Model",
        type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
        position: [300, 50],
        parameters: {
          model: "gpt-4",
          temperature: 0.7
        }
      }
    }
  ]
})
\`\`\`

#### Step 3: Add AI Agent

\`\`\`typescript
n8n_update_partial_workflow({
  id: "workflow_id",
  operations: [
    {
      type: "addNode",
      node: {
        name: "AI Agent",
        type: "@n8n/n8n-nodes-langchain.agent",
        position: [300, 150],
        parameters: {
          promptType: "auto",
          systemMessage: "You are a helpful assistant. Be concise and accurate."
        }
      }
    }
  ]
})
\`\`\`

#### Step 4: Connect Components

\`\`\`typescript
n8n_update_partial_workflow({
  id: "workflow_id",
  operations: [
    // Chat Trigger → AI Agent (main connection)
    {
      type: "addConnection",
      source: "Chat Trigger",
      target: "AI Agent"
    },
    // Language Model → AI Agent (AI connection)
    {
      type: "addConnection",
      source: "OpenAI Chat Model",
      target: "AI Agent",
      sourceOutput: "ai_languageModel"
    }
  ]
})
\`\`\`

#### Step 5: Validate

\`\`\`typescript
n8n_validate_workflow({id: "workflow_id"})
\`\`\`

---

## 4. AI Tools Deep Dive {#tools}

### Tool Types and When to Use Them

#### 1. HTTP Request Tool
**Use when**: AI needs to call external APIs

**Critical Requirements**:
- \`toolDescription\`: Clear, 15+ character description
- \`url\`: API endpoint (can include placeholders)
- \`placeholderDefinitions\`: Define all {placeholders}
- Proper authentication if needed

**Example**:
\`\`\`typescript
{
  type: "addNode",
  node: {
    name: "GitHub Issues Tool",
    type: "@n8n/n8n-nodes-langchain.toolHttpRequest",
    position: [500, 100],
    parameters: {
      method: "POST",
      url: "https://api.github.com/repos/{owner}/{repo}/issues",
      toolDescription: "Create GitHub issues. Requires owner (username), repo (repository name), title, and body.",
      placeholderDefinitions: {
        values: [
          {name: "owner", description: "Repository owner username"},
          {name: "repo", description: "Repository name"},
          {name: "title", description: "Issue title"},
          {name: "body", description: "Issue description"}
        ]
      },
      sendBody: true,
      jsonBody: "={{ { title: $json.title, body: $json.body } }}"
    }
  }
}
\`\`\`

#### 2. Code Tool
**Use when**: AI needs to run custom logic

**Critical Requirements**:
- \`name\`: Function name (alphanumeric + underscore)
- \`description\`: 10+ character explanation
- \`code\`: JavaScript or Python code
- \`inputSchema\`: Define expected inputs (recommended)

**Example**:
\`\`\`typescript
{
  type: "addNode",
  node: {
    name: "Calculate Shipping",
    type: "@n8n/n8n-nodes-langchain.toolCode",
    position: [500, 200],
    parameters: {
      name: "calculate_shipping",
      description: "Calculate shipping cost based on weight (kg) and distance (km)",
      language: "javaScript",
      code: "const cost = 5 + ($input.weight * 2) + ($input.distance * 0.1); return { cost };",
      specifyInputSchema: true,
      inputSchema: "{ \\"type\\": \\"object\\", \\"properties\\": { \\"weight\\": { \\"type\\": \\"number\\" }, \\"distance\\": { \\"type\\": \\"number\\" } } }"
    }
  }
}
\`\`\`

#### 3. Vector Store Tool
**Use when**: AI needs to search knowledge base

**Setup**: Requires Vector Store + Embeddings + Documents

**Example**:
\`\`\`typescript
// Step 1: Create Vector Store with embeddings and documents
n8n_update_partial_workflow({
  operations: [
    {type: "addConnection", source: "Embeddings OpenAI", target: "Pinecone", sourceOutput: "ai_embedding"},
    {type: "addConnection", source: "Document Loader", target: "Pinecone", sourceOutput: "ai_document"}
  ]
})

// Step 2: Connect Vector Store to Vector Store Tool
n8n_update_partial_workflow({
  operations: [
    {type: "addConnection", source: "Pinecone", target: "Vector Store Tool", sourceOutput: "ai_vectorStore"}
  ]
})

// Step 3: Connect tool to AI Agent
n8n_update_partial_workflow({
  operations: [
    {type: "addConnection", source: "Vector Store Tool", target: "AI Agent", sourceOutput: "ai_tool"}
  ]
})
\`\`\`

#### 4. AI Agent Tool (Sub-Agents)
**Use when**: Need specialized expertise

**Example**: Research specialist sub-agent
\`\`\`typescript
{
  type: "addNode",
  node: {
    name: "Research Specialist",
    type: "@n8n/n8n-nodes-langchain.agentTool",
    position: [500, 300],
    parameters: {
      name: "research_specialist",
      description: "Expert researcher that searches multiple sources and synthesizes information. Use for detailed research tasks.",
      systemMessage: "You are a research specialist. Search thoroughly, cite sources, and provide comprehensive analysis."
    }
  }
}
\`\`\`

#### 5. MCP Client Tool
**Use when**: Need to use Model Context Protocol servers

**Example**: Filesystem access
\`\`\`typescript
{
  type: "addNode",
  node: {
    name: "Filesystem Tool",
    type: "@n8n/n8n-nodes-langchain.mcpClientTool",
    position: [500, 400],
    parameters: {
      description: "Access file system to read files, list directories, and search content",
      mcpServer: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
      },
      tool: "read_file"
    }
  }
}
\`\`\`

---

## 5. Advanced Patterns {#advanced}

### Pattern 1: Streaming Responses

For real-time user experience:

\`\`\`typescript
// Set Chat Trigger to streaming mode
{
  parameters: {
    options: {
      responseMode: "streaming"
    }
  }
}

// CRITICAL: AI Agent must NOT have main output connections in streaming mode
// Responses stream back through Chat Trigger automatically
\`\`\`

**Validation will fail if**:
- Chat Trigger has streaming but target is not AI Agent
- AI Agent in streaming mode has main output connections

### Pattern 2: Fallback Language Models

For production reliability with fallback language models:

\`\`\`typescript
n8n_update_partial_workflow({
  operations: [
    // Primary model
    {
      type: "addConnection",
      source: "OpenAI GPT-4",
      target: "AI Agent",
      sourceOutput: "ai_languageModel",
      targetIndex: 0
    },
    // Fallback model
    {
      type: "addConnection",
      source: "Anthropic Claude",
      target: "AI Agent",
      sourceOutput: "ai_languageModel",
      targetIndex: 1
    }
  ]
})

// Enable fallback on AI Agent
{
  type: "updateNode",
  nodeName: "AI Agent",
  updates: {
    "parameters.needsFallback": true
  }
}
\`\`\`

### Pattern 3: RAG (Retrieval-Augmented Generation)

Complete knowledge base setup:

\`\`\`typescript
// 1. Load documents
{type: "addConnection", source: "PDF Loader", target: "Text Splitter", sourceOutput: "ai_document"}

// 2. Split and embed
{type: "addConnection", source: "Text Splitter", target: "Vector Store"}
{type: "addConnection", source: "Embeddings", target: "Vector Store", sourceOutput: "ai_embedding"}

// 3. Create search tool
{type: "addConnection", source: "Vector Store", target: "Vector Store Tool", sourceOutput: "ai_vectorStore"}

// 4. Give tool to agent
{type: "addConnection", source: "Vector Store Tool", target: "AI Agent", sourceOutput: "ai_tool"}
\`\`\`

### Pattern 4: Multi-Agent Systems

Specialized sub-agents for complex tasks:

\`\`\`typescript
// Create sub-agents with specific expertise
[
  {name: "research_agent", description: "Deep research specialist"},
  {name: "data_analyst", description: "Data analysis expert"},
  {name: "writer_agent", description: "Content writing specialist"}
].forEach(agent => {
  // Add as AI Agent Tool to main coordinator agent
  {
    type: "addConnection",
    source: agent.name,
    target: "Coordinator Agent",
    sourceOutput: "ai_tool"
  }
})
\`\`\`

---

## 6. Validation & Best Practices {#validation}

### Always Validate Before Deployment

\`\`\`typescript
const result = n8n_validate_workflow({id: "workflow_id"})

if (!result.valid) {
  console.log("Errors:", result.errors)
  console.log("Warnings:", result.warnings)
  console.log("Suggestions:", result.suggestions)
}
\`\`\`

### Common Validation Errors

1. **MISSING_LANGUAGE_MODEL**
   - Problem: AI Agent has no ai_languageModel connection
   - Fix: Connect a language model before creating AI Agent

2. **MISSING_TOOL_DESCRIPTION**
   - Problem: HTTP Request Tool has no toolDescription
   - Fix: Add clear description (15+ characters)

3. **STREAMING_WITH_MAIN_OUTPUT**
   - Problem: AI Agent in streaming mode has outgoing main connections
   - Fix: Remove main connections when using streaming

4. **FALLBACK_MISSING_SECOND_MODEL**
   - Problem: needsFallback=true but only 1 language model
   - Fix: Add second language model or disable needsFallback

### Best Practices Checklist

✅ **Before Creating AI Agent**:
- [ ] Language model is connected first
- [ ] At least one tool is prepared (or will be added)
- [ ] System message is thoughtful and specific

✅ **For Each Tool**:
- [ ] Has toolDescription/description (15+ characters)
- [ ] toolDescription explains WHEN to use the tool
- [ ] All required parameters are configured
- [ ] Credentials are set up if needed

✅ **For Production**:
- [ ] Workflow validated with n8n_validate_workflow
- [ ] Tested with real user queries
- [ ] Fallback model configured for reliability
- [ ] Error handling in place
- [ ] maxIterations set appropriately (default 10, max 50)

---

## 7. Troubleshooting {#troubleshooting}

### Problem: "AI Agent has no language model"

**Cause**: Connection created AFTER AI Agent or using wrong sourceOutput

**Solution**:
\`\`\`typescript
n8n_update_partial_workflow({
  operations: [
    {
      type: "addConnection",
      source: "OpenAI Chat Model",
      target: "AI Agent",
      sourceOutput: "ai_languageModel"  // ← CRITICAL
    }
  ]
})
\`\`\`

### Problem: "Tool has no description"

**Cause**: HTTP Request Tool or Code Tool missing toolDescription/description

**Solution**:
\`\`\`typescript
{
  type: "updateNode",
  nodeName: "HTTP Request Tool",
  updates: {
    "parameters.toolDescription": "Call weather API to get current conditions for a city"
  }
}
\`\`\`

### Problem: "Streaming mode not working"

**Causes**:
1. Chat Trigger not set to streaming
2. AI Agent has main output connections
3. Target of Chat Trigger is not AI Agent

**Solution**:
\`\`\`typescript
// 1. Set Chat Trigger to streaming
{
  type: "updateNode",
  nodeName: "Chat Trigger",
  updates: {
    "parameters.options.responseMode": "streaming"
  }
}

// 2. Remove AI Agent main outputs
{
  type: "removeConnection",
  source: "AI Agent",
  target: "Any Output Node"
}
\`\`\`

### Problem: "Agent keeps looping"

**Cause**: Tool not returning proper response or agent stuck in reasoning loop

**Solutions**:
1. Set maxIterations lower: \`"parameters.maxIterations": 5\`
2. Improve tool descriptions to be more specific
3. Add system message guidance: "Use tools efficiently, don't repeat actions"

---

## Quick Reference

### Essential Tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| HTTP Request Tool | API calls | toolDescription, url, placeholders |
| Code Tool | Custom logic | name, description, code, inputSchema |
| Vector Store Tool | Knowledge search | description, topK |
| AI Agent Tool | Sub-agents | name, description, systemMessage |
| MCP Client Tool | MCP protocol | description, mcpServer, tool |

### Connection Quick Codes

\`\`\`typescript
// Language Model → AI Agent
sourceOutput: "ai_languageModel"

// Tool → AI Agent
sourceOutput: "ai_tool"

// Memory → AI Agent
sourceOutput: "ai_memory"

// Parser → AI Agent
sourceOutput: "ai_outputParser"

// Embeddings → Vector Store
sourceOutput: "ai_embedding"

// Vector Store → Vector Store Tool
sourceOutput: "ai_vectorStore"
\`\`\`

### Validation Command

\`\`\`typescript
n8n_validate_workflow({id: "workflow_id"})
\`\`\`

---

## Related Resources

- **FINAL_AI_VALIDATION_SPEC.md**: Complete validation rules
- **n8n_update_partial_workflow**: Workflow modification tool
- **search_nodes({query: "AI", includeExamples: true})**: Find AI nodes with examples
- **get_node({nodeType: "...", detail: "standard", includeExamples: true})**: Node details with examples

---

*This guide is part of the n8n-mcp documentation system. For questions or issues, refer to the validation spec or use tools_documentation() for specific topics.*`,
    parameters: {},
    returns: 'Complete AI Agents guide with architecture, patterns, validation, and troubleshooting',
    examples: [
      'tools_documentation({topic: "ai_agents_guide"}) - Full guide',
      'tools_documentation({topic: "ai_agents_guide", depth: "essentials"}) - Quick reference',
      'When user asks about AI Agents, Chat Trigger, or building AI workflows → Point to this guide'
    ],
    useCases: [
      'Learning AI Agent architecture in n8n',
      'Understanding AI connection types and patterns',
      'Building first AI Agent workflow step-by-step',
      'Implementing advanced patterns (streaming, fallback, RAG, multi-agent)',
      'Troubleshooting AI workflow issues',
      'Validating AI workflows before deployment',
      'Quick reference for connection types and tools'
    ],
    performance: 'N/A - Static documentation',
    bestPractices: [
      'Reference this guide when users ask about AI Agents',
      'Point to specific sections based on user needs',
      'Combine with search_nodes(includeExamples=true) for working examples',
      'Validate workflows after following guide instructions',
      'Use FINAL_AI_VALIDATION_SPEC.md for detailed requirements'
    ],
    pitfalls: [
      'This is a guide, not an executable tool',
      'Always validate workflows after making changes',
      'AI connections require sourceOutput parameter',
      'Streaming mode has specific constraints',
      'Fallback models require AI Agent node with fallback support'
    ],
    relatedTools: [
      'n8n_create_workflow',
      'n8n_update_partial_workflow',
      'n8n_validate_workflow',
      'search_nodes',
      'get_node'
    ]
  }
};

# Final AI Node Validation Specification

## AI Agent Deep Architecture Analysis

### 1. Prompt Construction and Message Flow

The AI Agent node handles user prompts through two distinct modes controlled by `promptType`:

#### Mode 1: Auto (Connected Chat Trigger)
```typescript
{
  "promptType": "auto",
  "text": "={{ $json.chatInput }}"  // Default value
}
```
- **Behavior**: Expects input from Chat Trigger node via `main` connection
- **User Message Source**: `$json.chatInput` from Chat Trigger
- **Use Case**: Interactive chatbots with ongoing conversations
- **Validation**: MUST have Chat Trigger → AI Agent main connection

#### Mode 2: Define Below
```typescript
{
  "promptType": "define",
  "text": "Your custom prompt or ={{ $json.someField }}"
}
```
- **Behavior**: User message defined in node parameters
- **User Message Source**: Static text or expression from previous node
- **Use Case**: Automated processing, data transformations, batch operations
- **Validation**: Text field is REQUIRED when promptType="define"

**Real-World Examples**:
```typescript
// Example 1: WhatsApp message processing
{
  "promptType": "define",
  "text": "={{ $json.messages[0].text.body }}"
}

// Example 2: Content generation with structured input
{
  "promptType": "define",
  "text": "Generate a creative concept involving:\n\n[[\nA solid, hard material..."
}
```

### 2. System Message: The Agent's Core Instructions

System messages define the agent's **role, capabilities, constraints, and output format**. This is the most critical parameter for AI Agent behavior.

#### System Message Structure Pattern:
```typescript
{
  "options": {
    "systemMessage": `
**Role:**
[Define agent's persona and primary function]

**Capabilities:**
[List what the agent can do, tools it has access to]

**Rules:**
[Constraints, formatting requirements, behavior guidelines]

**Output Format:**
[Specific structure for responses]

**Process:**
[Step-by-step execution flow]
    `
  }
}
```

#### Real-World System Message Examples:

**Example 1: Database Assistant** (Template 2985)
```typescript
{
  "options": {
    "systemMessage": "You are an assistant working for a company who sells Yamaha Powered Loudspeakers and helping the user navigate the product catalog for the year 2024. Your goal is not to facilitate a sale but if the user enquires, direct them to the appropriate website, url or contact information.\n\nDo your best to answer any questions factually. If you don't know the answer or unable to obtain the information from the datastore, then tell the user so."
  }
}
```
**Pattern**: Clear role, specific domain, behavior constraints

**Example 2: Content Generator with Output Format** (Template 214907)
```typescript
{
  "options": {
    "systemMessage": "**Role:**  \nYou are an AI designed to generate **one immersive, realistic idea** based on a user-provided topic. Your output must be formatted as a **single-line JSON array** and follow the rules below exactly.\n\n### RULES\n\n1. **Number of ideas**  \n   - Return **only one idea**.\n\n2. **Topic**  \n   - The user will provide a keyword (e.g., \"glass cutting ASMR\").\n\n3. **Idea**  \n   - Maximum 13 words.  \n   - Describe a viral-worthy, original, or surreal moment.\n\n4. **Caption**  \n   - Short, punchy, viral-friendly.  \n   - Include **one emoji**.  \n   - Exactly **12 hashtags** in this order:  \n     1. 4 topic-relevant hashtags  \n     2. 4 all-time most popular hashtags  \n     3. 4 currently trending hashtags\n\n### OUTPUT FORMAT (single-line JSON array)\n\n```json\n[\n  {\n    \"Caption\": \"...\",\n    \"Idea\": \"...\",\n    \"Environment\": \"...\",\n    \"Sound\": \"...\",\n    \"Status\": \"for production\"\n  }\n]\n```"
  }
}
```
**Pattern**: Detailed rules, strict output format (JSON), validation constraints

**Example 3: Multi-Step Process Agent** (Template 5296)
```typescript
{
  "options": {
    "systemMessage": "You are an assistant that helps YouTube creators uncover what topics are trending in a given niche over the past two days.\n\n1. Niche Check\n\nIf the user has not yet specified a niche, respond with a short list of 5 popular niches and ask them to choose one.\n\n2. Trend Search\n\nOnce you know the niche, choose up to three distinct search queries that reflect different angles of that niche.\n\nFor each query, call the youtube_search tool to retrieve videos published in the last 2 days.\n\n3. Data Handling\n\nThe tool returns multiple JSON entries, each with fields:\n  \"video_id\": \"...\", \n  \"view_count\": ..., \n  ...\n\n4. Insight Generation\n\nAggregate results across all queries. Don't discuss individual videos; instead, synthesize overall patterns:\n\n5. Final Output\n\nSummarize the top 2–3 trending topics or formats in this niche over the last 48 hours."
  }
}
```
**Pattern**: Step-by-step process flow, tool usage instructions, aggregation logic

#### System Message Best Practices:
1. **Always define the role** - What is the agent's purpose?
2. **Specify constraints** - What should it NOT do?
3. **Define output format** - JSON, markdown, specific structure?
4. **Include tool usage guidance** - When to call which tools?
5. **Add validation rules** - What makes a valid response?

### 3. Fallback Models: Reliability Enhancement

Fallback models provide automatic failover when the primary LLM fails (rate limits, errors, downtime).

#### Configuration:
```typescript
{
  "needsFallback": true  // Default: false, only in version 2.1+
}
```

#### Connection Pattern:
```
[Primary LLM] --ai_languageModel[0]--> [AI Agent]
[Fallback LLM] --ai_languageModel[1]--> [AI Agent]
```

#### Validation Rules:
```typescript
if (node.parameters.needsFallback === true) {
  const languageModelConnections = reverseConnections
    .get(node.name)
    .filter(c => c.type === 'ai_languageModel');

  if (languageModelConnections.length < 2) {
    issues.push({
      severity: 'error',
      message: `AI Agent "${node.name}" has needsFallback=true but only ${languageModelConnections.length} language model connection(s). Connect a second language model as fallback.`
    });
  }
} else {
  // Normal case: exactly 1 language model required
  const languageModelConnections = reverseConnections
    .get(node.name)
    .filter(c => c.type === 'ai_languageModel');

  if (languageModelConnections.length !== 1) {
    issues.push({
      severity: 'error',
      message: `AI Agent "${node.name}" requires exactly 1 language model connection, found ${languageModelConnections.length}.`
    });
  }
}
```

#### When to Use Fallback Models:
- **Production systems** with high availability requirements
- **Multi-LLM strategies** (e.g., GPT-4 primary, Claude fallback)
- **Cost optimization** (expensive primary, cheaper fallback)
- **Rate limit mitigation** (automatic switch on 429 errors)

### 4. Output Parsers: Structured Data Enforcement

Output parsers ensure the LLM returns data in a specific, machine-readable format (JSON, XML, structured text).

#### Configuration:
```typescript
{
  "hasOutputParser": true  // Default: false
}
```

#### Connection Pattern:
```
[Output Parser] --ai_outputParser--> [AI Agent]
```

#### Available Output Parsers:
- **Structured Output Parser**: JSON with strict schema validation
- **Auto-fixing Output Parser**: Attempts to fix malformed JSON
- **Markdown Output Parser**: Structured markdown
- **Custom Output Parser**: User-defined format

#### Validation Rules:
```typescript
if (node.parameters.hasOutputParser === true) {
  const outputParserConnections = reverseConnections
    .get(node.name)
    .filter(c => c.type === 'ai_outputParser');

  if (outputParserConnections.length === 0) {
    issues.push({
      severity: 'error',
      message: `AI Agent "${node.name}" has hasOutputParser=true but no ai_outputParser connection. Connect an Output Parser node.`
    });
  } else if (outputParserConnections.length > 1) {
    issues.push({
      severity: 'warning',
      message: `AI Agent "${node.name}" has ${outputParserConnections.length} output parser connections. Only the first will be used.`
    });
  }
}
```

#### Real-World Usage (Template 214907):
```typescript
{
  "hasOutputParser": true,
  "options": {
    "systemMessage": "... Your output must be formatted as a **single-line JSON array** ..."
  }
}
// Connected to Structured Output Parser with JSON schema
```

**Pattern**: System message defines format rules, output parser enforces schema validation

### 5. Additional Options Collection

The `options` collection contains advanced configuration:

```typescript
{
  "options": {
    "systemMessage": string,          // Agent's core instructions
    "maxIterations": number,          // Max tool call loops (default: 10)
    "returnIntermediateSteps": boolean, // Include reasoning steps in output
    "passthroughBinaryImages": boolean, // Handle binary image data
    "batching": object                // Batch processing config
  }
}
```

#### maxIterations
```typescript
{
  "options": {
    "maxIterations": 15  // Default: 10
  }
}
```
- **Purpose**: Prevents infinite tool-calling loops
- **Use Case**: Complex multi-tool workflows (e.g., research → search → summarize → verify)
- **Validation**: Should be reasonable (1-50), warn if > 20

#### returnIntermediateSteps
```typescript
{
  "options": {
    "returnIntermediateSteps": true  // Default: false
  }
}
```
- **Purpose**: Returns step-by-step reasoning and tool calls
- **Use Case**: Debugging, transparency, audit trails
- **Output**: Includes intermediate thoughts, tool inputs/outputs
- **Performance**: Increases token usage and response time

#### passthroughBinaryImages
```typescript
{
  "options": {
    "passthroughBinaryImages": true  // Default: false
  }
}
```
- **Purpose**: Enables vision models to process images
- **Use Case**: Image analysis, OCR, visual question answering
- **Requirement**: LLM must support vision (GPT-4 Vision, Claude 3 Opus)

#### batching
```typescript
{
  "options": {
    "batching": {
      "enabled": true,
      "batchSize": 10
    }
  }
}
```
- **Purpose**: Process multiple inputs in parallel
- **Use Case**: Bulk data processing, batch API calls
- **Optimization**: Reduces total execution time

### 6. Version Differences and Migration

#### Version 1.x (Legacy)
```typescript
{
  "typeVersion": 1.7,
  "parameters": {
    "promptType": "auto",
    "text": "...",
    "options": {
      "systemMessage": "..."
    }
  }
}
```
- No `needsFallback` option
- No `hasOutputParser` option
- Limited options collection

#### Version 2.1+ (Current)
```typescript
{
  "typeVersion": 2.2,
  "parameters": {
    "promptType": "auto",
    "text": "...",
    "hasOutputParser": true,
    "needsFallback": true,
    "options": {
      "systemMessage": "...",
      "maxIterations": 15,
      "returnIntermediateSteps": true,
      "passthroughBinaryImages": true,
      "batching": {...}
    }
  }
}
```
- Added `needsFallback` flag
- Added `hasOutputParser` flag
- Expanded options collection
- Better streaming support

#### Validation Considerations:
```typescript
function validateAIAgentVersion(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (node.parameters.needsFallback && node.typeVersion < 2.1) {
    issues.push({
      severity: 'error',
      message: `AI Agent "${node.name}" uses needsFallback but typeVersion ${node.typeVersion} does not support it. Upgrade to version 2.1+.`
    });
  }

  return issues;
}
```

### 7. Complete AI Agent Validation Specification

```typescript
interface AIAgentRequirements {
  // Required Properties
  text: {
    required: true;
    default: "={{ $json.chatInput }}" | "";  // Based on promptType
    validation: "Must not be empty when promptType='define'";
  };

  // Connection Requirements
  connections: {
    ai_languageModel: {
      min: 1;
      max: 1;  // or 2 if needsFallback=true
      required: true;
    };
    ai_memory: {
      min: 0;
      max: 1;
      optional: true;
    };
    ai_tool: {
      min: 0;
      max: Infinity;
      optional: true;
    };
    ai_outputParser: {
      min: 0;
      max: 1;
      optional: true;
      requiredIf: "hasOutputParser === true";
    };
    main: {
      input: {
        typical: 1;
        source: "Chat Trigger or other node";
        requiredIf: "promptType === 'auto'";
      };
      output: {
        allowed: true;
        forbiddenIf: "upstream Chat Trigger has responseMode='streaming'";
      };
    };
  };

  // Optional Enhancements
  options: {
    systemMessage: {
      recommended: true;
      purpose: "Define agent role, capabilities, constraints";
      validation: "Should be clear, specific, include tool usage instructions";
    };
    maxIterations: {
      default: 10;
      range: [1, 50];
      warning: "Values > 20 may cause long execution times";
    };
    returnIntermediateSteps: {
      default: false;
      impact: "Increases output size and token usage";
    };
    passthroughBinaryImages: {
      default: false;
      requires: "LLM with vision capabilities";
    };
  };

  // Version-Specific Features
  features: {
    needsFallback: {
      sinceVersion: 2.1;
      requiresConnections: 2;  // 2x ai_languageModel
    };
    hasOutputParser: {
      sinceVersion: 2.0;
      requiresConnection: "ai_outputParser";
    };
  };
}
```

### 8. Improving MCP Tool Responses for AI Agent

Based on this analysis, MCP tools should return:

#### For `get_node_info` / `get_node_essentials`:
```typescript
{
  "essentials": {
    // Highlight prompt configuration
    "promptConfiguration": {
      "promptType": "auto (Chat Trigger) or define (Custom)",
      "textField": "REQUIRED when promptType='define'",
      "defaultValue": "={{ $json.chatInput }}"
    },

    // Emphasize system message importance
    "systemMessage": {
      "location": "options.systemMessage",
      "importance": "CRITICAL - defines agent behavior",
      "bestPractices": [
        "Define clear role and purpose",
        "Specify output format requirements",
        "Include tool usage instructions",
        "Add constraints and validation rules"
      ]
    },

    // Document fallback feature
    "fallbackModels": {
      "flag": "needsFallback",
      "sinceVersion": 2.1,
      "requires": "2 ai_languageModel connections",
      "useCase": "High-availability production systems"
    },

    // Document output parser integration
    "outputParsers": {
      "flag": "hasOutputParser",
      "requires": "1 ai_outputParser connection",
      "useCase": "Structured JSON/XML output"
    }
  }
}
```

#### For `search_nodes` with query "AI Agent":
```typescript
{
  "results": [
    {
      "node": "AI Agent",
      "keyFeatures": [
        "Multi-tool orchestration",
        "Conversation memory integration",
        "System message for role definition",
        "Fallback model support (v2.1+)",
        "Output format enforcement via parsers"
      ],
      "criticalConnections": [
        "ai_languageModel (REQUIRED, 1-2 connections)",
        "ai_memory (OPTIONAL, 0-1 connections)",
        "ai_tool (OPTIONAL, 0-N connections)",
        "ai_outputParser (OPTIONAL, 0-1 connections)"
      ],
      "commonPatterns": [
        "Chat Trigger → AI Agent (streaming chatbots)",
        "AI Agent + Memory + Tools (conversational agents)",
        "AI Agent + Output Parser (structured data extraction)"
      ]
    }
  ]
}
```

#### For `get_node_documentation`:
```markdown
# AI Agent

## Overview
The AI Agent node orchestrates complex workflows by combining language models, tools, and memory to solve multi-step problems.

## Critical Configuration

### 1. User Prompt
- **promptType**: "auto" (from Chat Trigger) or "define" (custom)
- **text**: User message (REQUIRED when promptType="define")

### 2. System Message (CRITICAL)
- **Location**: options.systemMessage
- **Purpose**: Defines agent's role, capabilities, constraints
- **Best Practices**:
  - Start with role definition
  - List available tools and when to use them
  - Specify output format requirements
  - Add behavioral constraints

### 3. Fallback Models (v2.1+)
- **Flag**: needsFallback
- **Requires**: 2 ai_languageModel connections
- **Use Case**: Production reliability, rate limit handling

### 4. Output Parsers
- **Flag**: hasOutputParser
- **Requires**: 1 ai_outputParser connection
- **Use Case**: JSON/XML structured output validation

## Connection Requirements
- **ai_languageModel**: REQUIRED (1 or 2 if fallback enabled)
- **ai_memory**: OPTIONAL (conversation context)
- **ai_tool**: OPTIONAL (external capabilities)
- **ai_outputParser**: OPTIONAL (output formatting)

## Common Mistakes
1. Missing system message → Generic, unhelpful responses
2. Too many maxIterations → Infinite loops, high costs
3. hasOutputParser=true but no parser connected → Runtime error
4. Streaming mode + main output → Response lost
```

## Critical Architecture: Connection Flow Direction

### CRITICAL INSIGHT: AI Connections Flow TO Consumers

Unlike standard n8n nodes where data flows FROM source TO target via `main` connections, **AI-specific connections flow TO the AI Agent/Chain nodes**, not from them:

```
Standard n8n pattern:
[HTTP Request] --main--> [Set] --main--> [Slack]

AI pattern (REVERSED):
[Language Model] --ai_languageModel--> [AI Agent]
[Memory Buffer]  --ai_memory--------> [AI Agent]
[Tool Node]      --ai_tool----------> [AI Agent]
[Chat Trigger]   --main-------------> [AI Agent]
[AI Agent]       --main (optional)--> [Next Node]
```

**Why This Matters for Validation:**
- Standard validation checks: `workflow.connections[sourceName][outputType]`
- AI validation needs: **Reverse connection map** to check what connects TO each node
- Must build: `Map<targetNodeName, Connection[]>` to validate AI nodes

**Real Example from Template #2985:**
```json
{
  "connections": {
    "Groq Chat Model": {
      "ai_languageModel": [[{
        "node": "AI Agent",
        "type": "ai_languageModel",
        "index": 0
      }]]
    },
    "Chat History": {
      "ai_memory": [[{
        "node": "AI Agent",
        "type": "ai_memory",
        "index": 0
      }]]
    }
  }
}
```

Notice: Connections are defined in **source nodes** but flow **TO the AI Agent**.

## Complete AI Tool Ecosystem

We have **269 nodes total** that can be used as AI tools in our database:
- **21 nodes** from `@n8n/n8n-nodes-langchain` (AI components)
- **248 nodes** from `n8n-nodes-base` (regular nodes)

### Purpose-Built AI Tool Sub-Nodes

These are the **13 specialized tool nodes** from `@n8n/n8n-nodes-langchain` designed specifically for AI Agent tool connections:

| Node Type | Display Name | Purpose | Special Requirements |
|-----------|--------------|---------|---------------------|
| `toolExecutor` | Tool Executor | Execute tools without AI Agent | No AI Agent connection needed |
| `agentTool` | AI Agent Tool | AI Agent packaged as a tool | Must have ai_languageModel |
| `toolWorkflow` | Call n8n Sub-Workflow Tool | Execute sub-workflows | Sub-workflow must exist |
| `toolCode` | Code Tool | JavaScript/Python execution | Should have input schema |
| `toolHttpRequest` | HTTP Request Tool | HTTP API calls | Should have placeholder definitions |
| `mcpClientTool` | MCP Client Tool | Connect MCP Server tools | Requires MCP server config |
| `toolThink` | Think Tool | AI reflection/thinking | No special requirements |
| `toolVectorStore` | Vector Store Q&A Tool | RAG from vector store | Requires ai_vectorStore + ai_embedding chain |
| `toolCalculator` | Calculator | Arithmetic operations | No special requirements |
| `toolSearXng` | SearXNG | SearXNG search | Requires credentials |
| `toolSerpApi` | SerpApi (Google Search) | Google search via SerpAPI | Requires credentials |
| `toolWikipedia` | Wikipedia | Wikipedia search | No special requirements |
| `toolWolframAlpha` | Wolfram\|Alpha | Computational queries | Requires credentials |

### Regular n8n Nodes Usable as Tools

**248 regular nodes** from `n8n-nodes-base` can be used as AI tools when `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`:

**Examples include**:
- Action Network, ActiveCampaign, Adalo, Affinity, Agile CRM
- Airtable, Airtop, AMQP Sender, Asana, Autopilot
- AWS services (Lambda, SES, SNS, Textract, Transcribe)
- Communication (Slack, Discord, Telegram, WhatsApp, Email)
- Databases (MySQL, PostgreSQL, MongoDB, Redis)
- Cloud storage (Google Drive, Dropbox, S3)
- Project management (Jira, Trello, ClickUp, Asana)
- CRM (Salesforce, HubSpot, Pipedrive)
- And 200+ more...

**Generic Tool Validation** (applies to all 248 nodes):
```typescript
interface RegularNodeAsToolValidation {
  connection: 'ai_tool';  // MUST connect via ai_tool output
  description: {
    // Tool description helps LLM decide when to use it
    source: 'node.parameters.toolDescription' | 'node.parameters.description';
    recommended: true;
  };
  credentials: {
    // Credentials are handled by n8n, not exposed to LLM
    validated: boolean;
  };
  parameters: {
    // All parameters should be valid for the node's operation
    validated: boolean;
  };
}
```

**When to warn**: Regular node used as tool should have:
1. Connection to AI Agent via `ai_tool` output
2. Valid credentials configured (if required)
3. Proper operation/resource selected
4. Optional but recommended: Custom tool description

## Connection Type Validation Matrix

### AI Agent (@n8n/n8n-nodes-langchain.agent)

| Connection Type | Cardinality | Direction | Validation |
|----------------|-------------|-----------|------------|
| `ai_languageModel` | **REQUIRED** (1 or 2) | LLM → Agent | Exactly 1 (or 2 if needsFallback=true) |
| `ai_memory` | Optional (0-1) | Memory → Agent | 0 or 1 allowed |
| `ai_tool` | Optional (0-N) | Tool → Agent | Any number allowed |
| `ai_outputParser` | Optional (0-1) | Parser → Agent | 0 or 1 allowed (required if hasOutputParser=true) |
| `main` (input) | Typical (1) | Trigger → Agent | Usually from Chat Trigger |
| `main` (output) | Conditional | Agent → Node | FORBIDDEN if streaming mode |

**Validation Rules**:

1. **Language Model Requirement**:
```typescript
if (node.parameters.needsFallback === true) {
  // MUST have exactly 2 ai_languageModel connections
  if (languageModelCount !== 2) {
    ERROR: "AI Agent with needsFallback=true requires 2 language models"
  }
} else {
  // MUST have exactly 1 ai_languageModel connection
  if (languageModelCount !== 1) {
    ERROR: "AI Agent requires exactly 1 language model"
  }
}
```

2. **Output Parser Requirement**:
```typescript
if (node.parameters.hasOutputParser === true) {
  // MUST have exactly 1 ai_outputParser connection
  if (outputParserCount === 0) {
    ERROR: "AI Agent with hasOutputParser=true requires an output parser connection"
  }
}
```

3. **Streaming Mode Rule**:
```typescript
IF (Chat Trigger → AI Agent with responseMode="streaming")
THEN (AI Agent MUST NOT have main output connections)
```

4. **Prompt Type Rule**:
```typescript
if (node.parameters.promptType === "auto") {
  // Should have Chat Trigger as input
  if (!hasChatTriggerInput) {
    WARNING: "AI Agent with promptType='auto' should receive input from Chat Trigger"
  }
}

if (node.parameters.promptType === "define") {
  // Text field must not be empty
  if (!node.parameters.text || node.parameters.text.trim() === "") {
    ERROR: "AI Agent with promptType='define' must have non-empty text field"
  }
}
```

### Basic LLM Chain (@n8n/n8n-nodes-langchain.chainLlm)

| Connection Type | Cardinality | Direction | Validation |
|----------------|-------------|-----------|------------|
| `ai_languageModel` | **REQUIRED** (1) | LLM → Chain | MUST have exactly 1 |
| `ai_outputParser` | Optional (0-1) | Parser → Chain | 0 or 1 allowed |
| `ai_memory` | **FORBIDDEN** | - | MUST NOT have |
| `ai_tool` | **FORBIDDEN** | - | MUST NOT have |

### Vector Store Tool (@n8n/n8n-nodes-langchain.toolVectorStore)

| Connection Type | Cardinality | Direction | Validation |
|----------------|-------------|-----------|------------|
| `ai_vectorStore` | **REQUIRED** (1) | VectorStore → Tool | MUST have exactly 1 |
| `ai_tool` (output) | Typical (1) | Tool → Agent | Should connect to AI Agent |

**Chain Validation**:
```
Vector Store Tool
  ← ai_vectorStore ← Vector Store
    ← ai_embedding ← Embeddings Model
    ← ai_document ← Document Loader
      ← ai_textSplitter ← Text Splitter (optional)
```

### Chat Trigger (@n8n/n8n-nodes-langchain.chatTrigger)

**Purpose**: Trigger node specifically designed for AI chatbot workflows. Provides a web interface for chat interactions.

**Key Characteristics**:
- **Is Trigger**: Yes (starts workflow)
- **Is Webhook**: Yes (provides HTTP endpoint)
- **Output Type**: `main` (connects to AI Agent or workflow logic)

**Unique Features**:
- Hosted chat UI (`mode: "hostedChat"`)
- Embedded chat widget (`mode: "webhook"`)
- File upload support
- Session management
- Streaming response capability
- Custom CSS styling

| Property | Values | Impact on Validation |
|----------|--------|---------------------|
| `responseMode` | "streaming" | AI Agent must NOT have main output (response streams back through trigger) |
| | "lastNode" | Normal workflow allowed (data from last executed node returned) |
| | "responseNode" | Must have Respond to Webhook node in workflow |
| | "responseNodes" | Must have Response nodes configured |
| `mode` | "hostedChat" | Provides n8n-hosted chat interface |
| | "webhook" | Embeddable chat widget |

**Validation Requirements**:
```typescript
function validateChatTrigger(
  node: WorkflowNode,
  workflow: WorkflowJson,
  result: WorkflowValidationResult
): void {
  const connections = workflow.connections[node.name];

  // 1. Check has downstream connections
  if (!connections?.main || connections.main.flat().filter(c => c).length === 0) {
    result.errors.push({
      type: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Chat Trigger "${node.name}" has no downstream connections. Connect it to an AI Agent or workflow logic.`
    });
    return;
  }

  // 2. Check responseMode compatibility
  const responseMode = node.parameters?.options?.responseMode || 'lastNode';
  const firstConnection = connections.main[0]?.[0];

  if (firstConnection) {
    const targetNode = workflow.nodes.find(n => n.name === firstConnection.node);
    const targetType = targetNode ? NodeTypeNormalizer.normalizeToFullForm(targetNode.type) : '';

    if (responseMode === 'streaming') {
      // Must connect to streaming-capable node
      if (targetType !== '@n8n/n8n-nodes-langchain.agent') {
        result.errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Chat Trigger "${node.name}" has responseMode="streaming" but does not connect to an AI Agent. Only AI Agent supports streaming responses.`
        });
      } else {
        // Check AI Agent has enableStreaming option
        const enableStreaming = targetNode?.parameters?.options?.enableStreaming;
        if (enableStreaming === false) {
          result.warnings.push({
            type: 'warning',
            nodeId: targetNode.id,
            nodeName: targetNode.name,
            message: `AI Agent "${targetNode.name}" has enableStreaming=false but Chat Trigger uses responseMode="streaming". Enable streaming in the AI Agent options.`
          });
        }

        // CRITICAL: Check AI Agent has NO main output
        const agentMainOutput = workflow.connections[targetNode.name]?.main;
        if (agentMainOutput && agentMainOutput.flat().some(c => c)) {
          result.errors.push({
            type: 'error',
            nodeId: targetNode.id,
            nodeName: targetNode.name,
            message: `AI Agent "${targetNode.name}" is connected from Chat Trigger with responseMode="streaming". It must NOT have outgoing main connections. The response streams back through the Chat Trigger.`
          });
        }
      }
    }

    if (responseMode === 'responseNode') {
      // Must have Respond to Webhook in workflow
      const hasRespondNode = workflow.nodes.some(n =>
        n.type.toLowerCase().includes('respondtowebhook')
      );
      if (!hasRespondNode) {
        result.errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `Chat Trigger "${node.name}" has responseMode="responseNode" but no "Respond to Webhook" node found in workflow.`
        });
      }
    }
  }

  // 3. Recommend connecting to AI nodes
  const downstreamNodes = connections.main.flat()
    .map(c => c?.node)
    .filter(Boolean) || [];

  const hasAINode = downstreamNodes.some(nodeName => {
    const targetNode = workflow.nodes.find(n => n.name === nodeName);
    return targetNode && (
      targetNode.type.includes('agent') ||
      targetNode.type.includes('chainLlm')
    );
  });

  if (!hasAINode) {
    result.warnings.push({
      type: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Chat Trigger "${node.name}" is not connected to an AI Agent or LLM Chain. Consider connecting to an AI node for chat functionality.`
    });
  }
}
```

## Tool-Specific Validation Rules

### 1. HTTP Request Tool (`toolHttpRequest`)

**Purpose**: Makes HTTP API requests with LLM-filled parameters, allowing AI agents to interact with external REST APIs dynamically.

**Configuration Options**:
- `toolDescription`: Description for LLM (REQUIRED)
- `method`: HTTP method - GET, POST, PUT, DELETE, PATCH (default: GET)
- `url`: API endpoint URL (REQUIRED, can contain {placeholders})
- `authentication`: None, Predefined Credential, Generic Credential
- `placeholderDefinitions`: Definitions for {placeholders} in URL/body/headers/query
- `sendQuery`: Whether to send query parameters
- `queryParameters`: Query string parameters (can contain {placeholders})
- `sendHeaders`: Whether to send custom headers
- `headerParameters`: HTTP headers (can contain {placeholders})
- `sendBody`: Whether to send request body
- `jsonBody`: Request body JSON (can contain {placeholders})
- `options`: Advanced options (response optimization, etc.)

**Placeholder System**:
LLM dynamically fills `{placeholder}` values in URL, query, headers, and body based on user input.

**Critical Requirements**:
1. Every `{placeholder}` must be defined in `placeholderDefinitions`
2. Placeholder names must match exactly (case-sensitive)
3. Tool description should explain what API it accesses

```typescript
function validateHTTPRequestTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check for tool description (REQUIRED)
  if (!node.parameters.toolDescription) {
    issues.push({
      severity: 'error',
      message: `HTTP Request Tool "${node.name}" has no toolDescription. Add one to help the LLM know when to use this tool.`
    });
  }

  // 2. Check for URL (REQUIRED)
  if (!node.parameters.url) {
    issues.push({
      severity: 'error',
      message: `HTTP Request Tool "${node.name}" has no URL. Provide the API endpoint URL.`
    });
  }

  // 3. Validate placeholders
  const hasPlaceholders =
    node.parameters.url?.includes('{') ||
    node.parameters.jsonBody?.includes('{') ||
    node.parameters.queryParameters?.includes('{') ||
    node.parameters.headerParameters?.includes('{');

  if (hasPlaceholders) {
    const definitions = node.parameters.placeholderDefinitions?.values || [];
    if (definitions.length === 0) {
      issues.push({
        severity: 'error',
        message: `HTTP Request Tool "${node.name}" uses placeholders but has no placeholderDefinitions. Define all placeholders.`
      });
    }

    // Extract all placeholders from all fields
    const allText = `${node.parameters.url || ''} ${JSON.stringify(node.parameters.jsonBody || '')} ${JSON.stringify(node.parameters.queryParameters || '')} ${JSON.stringify(node.parameters.headerParameters || '')}`;
    const placeholderRegex = /\{([^}]+)\}/g;
    const placeholders = new Set<string>();
    let match;
    while ((match = placeholderRegex.exec(allText)) !== null) {
      placeholders.add(match[1]);
    }

    // Check each placeholder is defined
    const definedNames = new Set(definitions.map((d: any) => d.name));
    for (const placeholder of placeholders) {
      if (!definedNames.has(placeholder)) {
        issues.push({
          severity: 'error',
          message: `HTTP Request Tool "${node.name}" uses placeholder {${placeholder}} but it is not defined in placeholderDefinitions.`
        });
      }
    }

    // Validate placeholder definitions have required fields
    for (const def of definitions) {
      if (!def.name) {
        issues.push({
          severity: 'error',
          message: `HTTP Request Tool "${node.name}" has a placeholder definition without a name.`
        });
      }
      if (!def.description) {
        issues.push({
          severity: 'warning',
          message: `HTTP Request Tool "${node.name}" placeholder "${def.name}" has no description. Add one to help the LLM provide correct values.`
        });
      }
    }
  }

  // 4. Validate authentication if specified
  if (node.parameters.authentication === 'predefinedCredentialType' ||
      node.parameters.authentication === 'genericCredentialType') {
    if (!node.credentials || Object.keys(node.credentials).length === 0) {
      issues.push({
        severity: 'error',
        message: `HTTP Request Tool "${node.name}" uses authentication but no credentials are configured.`
      });
    }
  }

  // 5. Validate method
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  if (node.parameters.method && !validMethods.includes(node.parameters.method.toUpperCase())) {
    issues.push({
      severity: 'error',
      message: `HTTP Request Tool "${node.name}" has invalid method "${node.parameters.method}". Must be one of: ${validMethods.join(', ')}.`
    });
  }

  // 6. Validate body for methods that support it
  if (['POST', 'PUT', 'PATCH'].includes(node.parameters.method?.toUpperCase() || 'GET')) {
    if (node.parameters.sendBody && !node.parameters.jsonBody) {
      issues.push({
        severity: 'warning',
        message: `HTTP Request Tool "${node.name}" has sendBody enabled but no jsonBody specified.`
      });
    }
  }

  return issues;
}
```

**Validation Examples**:

✅ **CORRECT - Simple GET Request**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolHttpRequest",
  "name": "Get User Info",
  "parameters": {
    "toolDescription": "Retrieves user information by user ID",
    "method": "GET",
    "url": "https://api.example.com/users/{userId}",
    "placeholderDefinitions": {
      "values": [
        {
          "name": "userId",
          "description": "The unique identifier for the user",
          "type": "string"
        }
      ]
    }
  }
}
```

✅ **CORRECT - POST with Body and Headers**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolHttpRequest",
  "name": "Create Order",
  "parameters": {
    "toolDescription": "Creates a new order with specified items and quantity",
    "method": "POST",
    "url": "https://api.example.com/orders",
    "authentication": "predefinedCredentialType",
    "sendHeaders": true,
    "headerParameters": {
      "Content-Type": "application/json"
    },
    "sendBody": true,
    "jsonBody": {
      "product": "{productId}",
      "quantity": "{quantity}",
      "customer": "{customerId}"
    },
    "placeholderDefinitions": {
      "values": [
        {
          "name": "productId",
          "description": "Product identifier",
          "type": "string"
        },
        {
          "name": "quantity",
          "description": "Number of items to order",
          "type": "number"
        },
        {
          "name": "customerId",
          "description": "Customer ID",
          "type": "string"
        }
      ]
    }
  }
}
```

❌ **INCORRECT - Missing URL**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolHttpRequest",
  "parameters": {
    "toolDescription": "Get data",
    "method": "GET"
    // Missing url!
  }
}
```

❌ **INCORRECT - Placeholder Not Defined**:
```json
{
  "parameters": {
    "toolDescription": "Get user",
    "url": "https://api.example.com/users/{userId}",
    "placeholderDefinitions": {
      "values": [
        {
          "name": "id",  // Wrong! URL uses {userId} not {id}
          "description": "User ID",
          "type": "string"
        }
      ]
    }
  }
}
```

❌ **INCORRECT - Missing Tool Description**:
```json
{
  "parameters": {
    "method": "GET",
    "url": "https://api.example.com/data"
    // Missing toolDescription! LLM won't know when to use this
  }
}
```

### 2. Code Tool (`toolCode`)

**Purpose**: Executes custom JavaScript or Python code as an AI tool, allowing the LLM to perform calculations, transformations, or business logic that isn't available through standard tools.

**Configuration Options**:
- `name` (string, REQUIRED): Function name that the LLM calls (must contain only letters, numbers, underscores)
- `description` (string, REQUIRED): Explains to the LLM what the tool does and when to use it
- `code` (string, REQUIRED): The actual JavaScript or Python code to execute
- `language` (string): Programming language - "javaScript" or "python" (default: "javaScript")
- `specifyInputSchema` (boolean): Whether to define input parameter schema (RECOMMENDED for validation)
- `schemaType` (string): How to define schema - "fromJson" (auto-generate from example) or "manual"
- `jsonSchemaExample` (string): Example JSON input for auto-generating schema (when schemaType="fromJson")
- `inputSchema` (string): Manual JSON schema definition (when schemaType="manual")

**How Code Tool Works**:
The LLM calls the function by name with parameters. The code executes in a sandboxed environment and returns results to the LLM. For JavaScript, the code must return a value. For Python, use `return` statements.

**Critical Requirements**:
1. Function `name` must be valid identifier (letters, numbers, underscores only)
2. `description` required to help LLM understand when to use the tool
3. `code` must be syntactically valid and return a value
4. Input schema HIGHLY RECOMMENDED to validate LLM-provided parameters

**Validation Logic**:
```typescript
function validateCodeTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check function name (REQUIRED)
  if (!node.parameters.name) {
    issues.push({
      severity: 'error',
      message: `Code Tool "${node.name}" has no function name. Add a name property.`
    });
  } else if (!/^[a-zA-Z0-9_]+$/.test(node.parameters.name)) {
    issues.push({
      severity: 'error',
      message: `Code Tool "${node.name}" function name "${node.parameters.name}" contains invalid characters. Use only letters, numbers, and underscores.`
    });
  } else if (/^\d/.test(node.parameters.name)) {
    issues.push({
      severity: 'error',
      message: `Code Tool "${node.name}" function name "${node.parameters.name}" cannot start with a number.`
    });
  }

  // 2. Check description (REQUIRED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'error',
      message: `Code Tool "${node.name}" has no description. Add one to help the LLM understand the tool's purpose.`
    });
  } else if (node.parameters.description.trim().length < 10) {
    issues.push({
      severity: 'warning',
      message: `Code Tool "${node.name}" description is too short. Provide more detail about what the tool does.`
    });
  }

  // 3. Check code exists (REQUIRED)
  if (!node.parameters.code || node.parameters.code.trim().length === 0) {
    issues.push({
      severity: 'error',
      message: `Code Tool "${node.name}" has no code. Add the JavaScript or Python code to execute.`
    });
  }

  // 4. Check language validity
  if (node.parameters.language && !['javaScript', 'python'].includes(node.parameters.language)) {
    issues.push({
      severity: 'error',
      message: `Code Tool "${node.name}" has invalid language "${node.parameters.language}". Use "javaScript" or "python".`
    });
  }

  // 5. Recommend input schema
  if (!node.parameters.specifyInputSchema) {
    issues.push({
      severity: 'warning',
      message: `Code Tool "${node.name}" does not specify an input schema. Consider adding one to validate LLM inputs.`
    });
  } else {
    // 6. Validate schema if specified
    if (node.parameters.schemaType === 'fromJson') {
      if (!node.parameters.jsonSchemaExample) {
        issues.push({
          severity: 'error',
          message: `Code Tool "${node.name}" uses schemaType="fromJson" but has no jsonSchemaExample.`
        });
      } else {
        try {
          JSON.parse(node.parameters.jsonSchemaExample);
        } catch (e) {
          issues.push({
            severity: 'error',
            message: `Code Tool "${node.name}" has invalid JSON schema example.`
          });
        }
      }
    } else if (node.parameters.schemaType === 'manual') {
      if (!node.parameters.inputSchema) {
        issues.push({
          severity: 'error',
          message: `Code Tool "${node.name}" uses schemaType="manual" but has no inputSchema.`
        });
      } else {
        try {
          const schema = JSON.parse(node.parameters.inputSchema);
          if (!schema.type) {
            issues.push({
              severity: 'warning',
              message: `Code Tool "${node.name}" manual schema should have a 'type' field.`
            });
          }
          if (!schema.properties && schema.type === 'object') {
            issues.push({
              severity: 'warning',
              message: `Code Tool "${node.name}" object schema should have 'properties' field.`
            });
          }
        } catch (e) {
          issues.push({
            severity: 'error',
            message: `Code Tool "${node.name}" has invalid JSON schema.`
          });
        }
      }
    }
  }

  // 7. Check for common code mistakes
  if (node.parameters.code) {
    const lang = node.parameters.language || 'javaScript';
    if (lang === 'javaScript') {
      // Check if code has return statement or expression
      const hasReturn = /\breturn\b/.test(node.parameters.code);
      const isSingleExpression = !node.parameters.code.includes(';') &&
                                 !node.parameters.code.includes('\n');
      if (!hasReturn && !isSingleExpression) {
        issues.push({
          severity: 'warning',
          message: `Code Tool "${node.name}" JavaScript code should return a value. Add a return statement.`
        });
      }
    }
  }

  return issues;
}
```

**Validation Examples**:

✅ **Correct Example 1** - Simple calculation tool:
```typescript
{
  type: 'toolCode',
  name: 'Calculate Tax',
  parameters: {
    name: 'calculate_tax',
    description: 'Calculates sales tax for a given price and tax rate percentage',
    language: 'javaScript',
    code: 'return price * (taxRate / 100);',
    specifyInputSchema: true,
    schemaType: 'fromJson',
    jsonSchemaExample: '{"price": 100, "taxRate": 8.5}'
  }
}
// Valid: Has function name, description, code with return statement, and input schema
```

✅ **Correct Example 2** - Python data transformation:
```typescript
{
  type: 'toolCode',
  name: 'Format Date',
  parameters: {
    name: 'format_date',
    description: 'Converts ISO date string to human-readable format',
    language: 'python',
    code: `from datetime import datetime
date_obj = datetime.fromisoformat(iso_date)
return date_obj.strftime('%B %d, %Y')`,
    specifyInputSchema: true,
    schemaType: 'manual',
    inputSchema: '{"type": "object", "properties": {"iso_date": {"type": "string"}}, "required": ["iso_date"]}'
  }
}
// Valid: Python code with proper return, manual schema with type and properties
```

✅ **Correct Example 3** - Business logic without schema:
```typescript
{
  type: 'toolCode',
  name: 'Discount Calculator',
  parameters: {
    name: 'apply_discount',
    description: 'Applies tiered discount based on order total: 10% off over $100, 20% off over $500',
    language: 'javaScript',
    code: `if (total >= 500) return total * 0.8;
if (total >= 100) return total * 0.9;
return total;`
  }
}
// Valid even without schema: Has name, description, and working code
// WARNING will be issued recommending schema
```

❌ **Incorrect Example 1** - Invalid function name:
```typescript
{
  type: 'toolCode',
  name: 'Calculate Tax',
  parameters: {
    name: '3rd_party_calculator',  // ❌ Starts with number
    description: 'Calculates sales tax',
    code: 'return price * 0.085;'
  }
}
// ERROR: Function name cannot start with a number
```

❌ **Incorrect Example 2** - Missing required fields:
```typescript
{
  type: 'toolCode',
  name: 'My Tool',
  parameters: {
    name: 'my_tool',
    // ❌ No description
    code: ''  // ❌ Empty code
  }
}
// ERROR: Missing description (required for LLM)
// ERROR: No code provided
```

❌ **Incorrect Example 3** - Invalid schema configuration:
```typescript
{
  type: 'toolCode',
  name: 'Data Processor',
  parameters: {
    name: 'process_data',
    description: 'Processes input data',
    code: 'return data.toUpperCase();',
    specifyInputSchema: true,
    schemaType: 'fromJson',
    // ❌ No jsonSchemaExample when using fromJson
  }
}
// ERROR: schemaType="fromJson" requires jsonSchemaExample
```

❌ **Incorrect Example 4** - Invalid characters in name:
```typescript
{
  type: 'toolCode',
  name: 'Format Name',
  parameters: {
    name: 'format-name-helper',  // ❌ Contains hyphens
    description: 'Formats user names',
    code: 'return firstName + " " + lastName;'
  }
}
// ERROR: Function name contains invalid characters (hyphens not allowed)
// Only letters, numbers, and underscores permitted
```

### 3. Vector Store Tool (`toolVectorStore`)

**Purpose**: Enables the AI agent to perform semantic search over a knowledge base by querying a vector store. The LLM can retrieve relevant documents or data based on natural language queries.

**Configuration Options**:
- `name` (string, REQUIRED): Tool name that the LLM uses to invoke the search
- `description` (string, REQUIRED): Explains what knowledge base is being searched and when to use it
- `topK` (number): Number of most relevant results to return (default: 4)

**How Vector Store Tool Works**:
The LLM calls this tool with a search query. The tool converts the query to embeddings, searches the vector store for similar embeddings, and returns the most relevant documents/chunks. This enables RAG (Retrieval Augmented Generation) patterns.

**Critical Requirements**:
1. MUST have `ai_vectorStore` connection to a Vector Store node (e.g., Pinecone, In-Memory Vector Store)
2. Vector Store MUST have `ai_embedding` connection to an Embeddings node (e.g., Embeddings OpenAI)
3. Vector Store SHOULD have `ai_document` connection to populate it with data
4. `description` REQUIRED to help LLM understand what knowledge is searchable

**Connection Architecture**:
```
[Document Loader] --ai_document--> [Vector Store] <--ai_vectorStore-- [Vector Store Tool]
[Embeddings]      --ai_embedding--> [Vector Store]
                                     [Vector Store] --ai_vectorStore--> [AI Agent]
```

**Validation Logic**:
```typescript
function validateVectorStoreTool(
  node: WorkflowNode,
  reverseConnections: Map<string, Connection[]>,
  workflow: WorkflowJson
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check tool name (REQUIRED)
  if (!node.parameters.name) {
    issues.push({
      severity: 'error',
      message: `Vector Store Tool "${node.name}" has no tool name. Add a name property.`
    });
  }

  // 2. Check description (REQUIRED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'error',
      message: `Vector Store Tool "${node.name}" has no description. Add one to explain what data it searches.`
    });
  } else if (node.parameters.description.trim().length < 15) {
    issues.push({
      severity: 'warning',
      message: `Vector Store Tool "${node.name}" description is too short. Explain what knowledge base is being searched.`
    });
  }

  // 3. Check ai_vectorStore connection (REQUIRED)
  const incoming = reverseConnections.get(node.name) || [];
  const vectorStoreConn = incoming.find(c => c.type === 'ai_vectorStore');

  if (!vectorStoreConn) {
    issues.push({
      severity: 'error',
      message: `Vector Store Tool "${node.name}" requires an ai_vectorStore connection. Connect a Vector Store node (e.g., Pinecone, In-Memory Vector Store).`
    });
    return issues;  // Can't continue without this
  }

  // 4. Validate Vector Store node exists
  const vectorStoreNode = workflow.nodes.find(n => n.name === vectorStoreConn.sourceName);
  if (!vectorStoreNode) {
    issues.push({
      severity: 'error',
      message: `Vector Store Tool "${node.name}" connects to non-existent node "${vectorStoreConn.sourceName}".`
    });
    return issues;
  }

  // 5. Validate Vector Store has embedding (REQUIRED)
  const vsIncoming = reverseConnections.get(vectorStoreNode.name) || [];
  const embeddingConn = vsIncoming.find(c => c.type === 'ai_embedding');

  if (!embeddingConn) {
    issues.push({
      severity: 'error',
      message: `Vector Store "${vectorStoreNode.name}" requires an ai_embedding connection. Connect an Embeddings node (e.g., Embeddings OpenAI, Embeddings Google Gemini).`
    });
  }

  // 6. Check for document loader (RECOMMENDED)
  const documentConn = vsIncoming.find(c => c.type === 'ai_document');
  if (!documentConn) {
    issues.push({
      severity: 'warning',
      message: `Vector Store "${vectorStoreNode.name}" has no ai_document connection. Without documents, the vector store will be empty. Connect a Document Loader to populate it.`
    });
  }

  // 7. Validate topK parameter if specified
  if (node.parameters.topK !== undefined) {
    if (typeof node.parameters.topK !== 'number' || node.parameters.topK < 1) {
      issues.push({
        severity: 'error',
        message: `Vector Store Tool "${node.name}" has invalid topK value. Must be a positive number.`
      });
    } else if (node.parameters.topK > 20) {
      issues.push({
        severity: 'warning',
        message: `Vector Store Tool "${node.name}" has topK=${node.parameters.topK}. Large values may overwhelm the LLM context. Consider reducing to 10 or less.`
      });
    }
  }

  return issues;
}
```

**Validation Examples**:

✅ **Correct Example 1** - Complete RAG setup:
```typescript
{
  type: 'toolVectorStore',
  name: 'Search Knowledge Base',
  parameters: {
    name: 'search_docs',
    description: 'Searches our product documentation and knowledge base articles to answer customer questions',
    topK: 5
  }
}
// Connected to:
// - In-Memory Vector Store (with ai_vectorStore connection)
//   - Embeddings OpenAI (with ai_embedding connection)
//   - Default Data Loader (with ai_document connection)
// Valid: Has name, description, proper connection chain
```

✅ **Correct Example 2** - Pinecone integration:
```typescript
{
  type: 'toolVectorStore',
  name: 'Search Customer History',
  parameters: {
    name: 'search_customer_data',
    description: 'Searches previous customer interactions, support tickets, and feedback to provide context for current conversation',
    topK: 3
  }
}
// Connected to:
// - Pinecone Vector Store (with ai_vectorStore connection)
//   - Embeddings Google Gemini (with ai_embedding connection)
//   - CSV File Loader (with ai_document connection)
// Valid: All required connections present
```

✅ **Correct Example 3** - Minimal setup:
```typescript
{
  type: 'toolVectorStore',
  name: 'Search Company Policies',
  parameters: {
    name: 'search_policies',
    description: 'Searches company policies, procedures, and guidelines to answer employee questions'
  }
}
// Connected to vector store with embeddings
// Valid: Uses default topK=4, has all required components
// WARNING will be issued if no document loader connected
```

❌ **Incorrect Example 1** - Missing vector store connection:
```typescript
{
  type: 'toolVectorStore',
  name: 'Search Tool',
  parameters: {
    name: 'search',
    description: 'Searches documents'
  }
}
// ❌ No ai_vectorStore connection
// ERROR: Vector Store Tool requires an ai_vectorStore connection
```

❌ **Incorrect Example 2** - Vector store missing embeddings:
```typescript
{
  type: 'toolVectorStore',
  name: 'Search Documents',
  parameters: {
    name: 'search_docs',
    description: 'Searches our document collection'
  }
}
// Connected to: In-Memory Vector Store (no ai_embedding connection)
// ERROR: Vector Store requires an ai_embedding connection
// Without embeddings, semantic search cannot function
```

❌ **Incorrect Example 3** - Missing required fields:
```typescript
{
  type: 'toolVectorStore',
  name: 'Search Tool',
  parameters: {
    // ❌ No name property
    description: 'Search'  // ❌ Description too short
  }
}
// ERROR: No tool name
// WARNING: Description too short (provide more detail)
```

❌ **Incorrect Example 4** - Invalid topK:
```typescript
{
  type: 'toolVectorStore',
  name: 'Search Everything',
  parameters: {
    name: 'search_all',
    description: 'Searches all available documents in the knowledge base',
    topK: 50  // ❌ Too many results
  }
}
// WARNING: topK=50 may overwhelm LLM context
// Large result sets reduce response quality
```

### 4. Workflow Tool (`toolWorkflow`)

**Purpose**: Executes another n8n workflow as a tool, allowing complex reusable logic to be packaged as agent capabilities.

**Configuration Options**:
- `source`: "database" (existing workflow) or "parameter" (inline workflow JSON)
- `workflowId`: ID of workflow to execute (when source="database")
- `workflowJson`: Inline workflow definition (when source="parameter")
- `description`: Tool description for LLM (REQUIRED)
- `specifyInputSchema`: Whether to define input schema (recommended)
- `workflowInputs`: Field mapping from LLM to workflow inputs

**Critical Requirement**: Sub-workflow MUST start with "Execute Workflow Trigger" node.

```typescript
function validateWorkflowTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check description (REQUIRED for LLM to understand tool)
  if (!node.parameters.description) {
    issues.push({
      severity: 'error',
      message: `Workflow Tool "${node.name}" has no description. Add a clear description to help the LLM know when to use this sub-workflow.`
    });
  }

  // 2. Check source parameter exists
  if (!node.parameters.source) {
    issues.push({
      severity: 'error',
      message: `Workflow Tool "${node.name}" has no source parameter. Set source to "database" or "parameter".`
    });
    return issues;  // Can't continue without source
  }

  // 3. Validate based on source type
  if (node.parameters.source === 'database') {
    // When using database, workflowId is required
    if (!node.parameters.workflowId) {
      issues.push({
        severity: 'error',
        message: `Workflow Tool "${node.name}" has source="database" but no workflowId specified. Select a sub-workflow to execute.`
      });
    }

    // Note: We can't validate if the sub-workflow exists at validation time
    // because workflows are deployed independently. This should be checked at runtime.
    // The sub-workflow MUST start with "Execute Workflow Trigger" node.

  } else if (node.parameters.source === 'parameter') {
    // When using parameter, workflowJson is required
    if (!node.parameters.workflowJson) {
      issues.push({
        severity: 'error',
        message: `Workflow Tool "${node.name}" has source="parameter" but no workflowJson specified. Provide inline workflow definition.`
      });
    } else {
      // Validate workflowJson is valid JSON
      try {
        const workflow = typeof node.parameters.workflowJson === 'string'
          ? JSON.parse(node.parameters.workflowJson)
          : node.parameters.workflowJson;

        // Check if workflow has nodes
        if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
          issues.push({
            severity: 'error',
            message: `Workflow Tool "${node.name}" has invalid workflowJson. Missing or invalid nodes array.`
          });
        } else {
          // Check if workflow starts with Execute Workflow Trigger
          const hasTrigger = workflow.nodes.some((n: any) =>
            n.type && (
              n.type.includes('executeWorkflowTrigger') ||
              n.type.includes('executeWorkflow')
            )
          );

          if (!hasTrigger) {
            issues.push({
              severity: 'error',
              message: `Workflow Tool "${node.name}" sub-workflow does not start with "Execute Workflow Trigger". Add this trigger node to the sub-workflow.`
            });
          }
        }
      } catch (e) {
        issues.push({
          severity: 'error',
          message: `Workflow Tool "${node.name}" has invalid workflowJson. Must be valid JSON: ${(e as Error).message}`
        });
      }
    }
  } else {
    issues.push({
      severity: 'error',
      message: `Workflow Tool "${node.name}" has invalid source="${node.parameters.source}". Must be "database" or "parameter".`
    });
  }

  // 4. Recommend input schema for better LLM integration
  if (!node.parameters.specifyInputSchema) {
    issues.push({
      severity: 'info',
      message: `Workflow Tool "${node.name}" does not specify an input schema. Consider adding one to validate LLM inputs and provide better guidance.`
    });
  } else {
    // Validate input schema if specified
    if (node.parameters.schemaType === 'fromJson') {
      try {
        JSON.parse(node.parameters.jsonSchemaExample || '{}');
      } catch (e) {
        issues.push({
          severity: 'error',
          message: `Workflow Tool "${node.name}" has invalid JSON schema example.`
        });
      }
    } else if (node.parameters.schemaType === 'manual') {
      try {
        const schema = JSON.parse(node.parameters.inputSchema || '{}');
        if (!schema.type || !schema.properties) {
          issues.push({
            severity: 'warning',
            message: `Workflow Tool "${node.name}" manual schema should have 'type' and 'properties' fields.`
          });
        }
      } catch (e) {
        issues.push({
          severity: 'error',
          message: `Workflow Tool "${node.name}" has invalid JSON schema.`
        });
      }
    }
  }

  // 5. Check workflowInputs configuration
  if (!node.parameters.workflowInputs) {
    issues.push({
      severity: 'info',
      message: `Workflow Tool "${node.name}" has no workflowInputs defined. Map fields to help LLM provide correct data to sub-workflow.`
    });
  }

  return issues;
}
```

**Validation Examples**:

✅ **CORRECT - Database Source**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "name": "Search Knowledge Base",
  "parameters": {
    "description": "Searches the company knowledge base for documentation and answers",
    "source": "database",
    "workflowId": "abc123",
    "specifyInputSchema": true,
    "jsonSchemaExample": "{\"query\": \"search term\"}"
  }
}
```

✅ **CORRECT - Parameter Source**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "name": "Process Order",
  "parameters": {
    "description": "Processes a customer order and returns confirmation",
    "source": "parameter",
    "workflowJson": {
      "nodes": [
        {
          "type": "n8n-nodes-base.executeWorkflowTrigger",
          "name": "Execute Workflow Trigger"
        }
      ]
    }
  }
}
```

❌ **INCORRECT - Missing workflowId**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "parameters": {
    "description": "Search KB",
    "source": "database"
    // Missing workflowId!
  }
}
```

❌ **INCORRECT - Sub-workflow missing Execute Workflow Trigger**:
```json
{
  "parameters": {
    "source": "parameter",
    "workflowJson": {
      "nodes": [
        {
          "type": "n8n-nodes-base.httpRequest"  // Wrong! Should be executeWorkflowTrigger
        }
      ]
    }
  }
}
```

### 5. Search Tools (SerpApi, Wikipedia, SearXNG, WolframAlpha)

#### 5a. SerpApi Tool (`toolSerpApi`)

**Purpose**: Performs Google searches via the SerpApi service, returning web search results to the AI agent. Provides access to current web information and search results.

**Configuration Options**:
- `description` (string, OPTIONAL): Custom description for when to use Google search
- Credentials: SerpApi API key (REQUIRED)

**How SerpApi Tool Works**:
The LLM provides a search query. The tool uses SerpApi to perform a Google search and returns relevant search results including titles, snippets, and URLs.

**Use Cases**:
- Finding current information not in LLM training data
- Web research and fact-checking
- Finding specific websites or resources
- News and trending topics

**Critical Requirements**:
1. MUST have valid SerpApi credentials configured
2. Requires active SerpApi subscription with available credits
3. Custom description recommended to differentiate from other search tools

**Validation Logic**:
```typescript
function validateSerpApiTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check credentials (REQUIRED)
  if (!node.credentials || !node.credentials.serpApi) {
    issues.push({
      severity: 'error',
      message: `SerpApi Tool "${node.name}" requires SerpApi credentials. Configure your API key.`
    });
  }

  // 2. Check description (RECOMMENDED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'info',
      message: `SerpApi Tool "${node.name}" has no custom description. Add one to explain when to use Google search vs. other search tools.`
    });
  }

  return issues;
}
```

**Validation Examples**:

✅ **Correct Example**:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolSerpApi',
  name: 'Google Search',
  credentials: {
    serpApi: 'serpapi_credentials_id'
  },
  parameters: {
    description: 'Search Google for current news, recent events, and general web information. Use when you need up-to-date information from the internet.'
  }
}
// Valid: Has credentials and helpful description
```

❌ **Incorrect Example**:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolSerpApi',
  name: 'Search'
  // ❌ No credentials configured
}
// ERROR: SerpApi Tool requires credentials
```

#### 5b. Wikipedia Tool (`toolWikipedia`)

**Purpose**: Searches and retrieves information from Wikipedia, providing the AI agent access to encyclopedia knowledge on a wide range of topics.

**Configuration Options**:
- `description` (string, OPTIONAL): Custom description for when to use Wikipedia
- `language` (string): Wikipedia language code (default: "en")
- `returnType` (string): "summary" or "full" article content

**How Wikipedia Tool Works**:
The LLM provides a topic or search query. The tool searches Wikipedia and returns article content, either as a summary or full text.

**Use Cases**:
- General knowledge queries
- Historical information
- Biographies and notable figures
- Scientific and technical concepts
- Geographic information

**Critical Requirements**:
1. No credentials required (public API)
2. Best for factual, encyclopedic information
3. Not ideal for current events (Wikipedia has lag time)

**Validation Logic**:
```typescript
function validateWikipediaTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check description (RECOMMENDED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'info',
      message: `Wikipedia Tool "${node.name}" has no custom description. Add one to explain when to use Wikipedia vs. other knowledge sources.`
    });
  }

  // 2. Validate language if specified
  if (node.parameters.language) {
    const validLanguageCodes = /^[a-z]{2,3}$/;  // ISO 639 codes
    if (!validLanguageCodes.test(node.parameters.language)) {
      issues.push({
        severity: 'warning',
        message: `Wikipedia Tool "${node.name}" has potentially invalid language code "${node.parameters.language}". Use ISO 639 codes (e.g., "en", "es", "fr").`
      });
    }
  }

  return issues;
}
```

**Validation Examples**:

✅ **Correct Example 1** - Default English:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolWikipedia',
  name: 'Wikipedia',
  parameters: {
    description: 'Search Wikipedia for encyclopedic information on historical events, people, places, and concepts. Best for factual, well-established knowledge.'
  }
}
// Valid: Simple configuration with helpful description
```

✅ **Correct Example 2** - Multilingual:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolWikipedia',
  name: 'Wikipedia Spanish',
  parameters: {
    description: 'Search Spanish Wikipedia for information in Spanish',
    language: 'es'
  }
}
// Valid: Configured for Spanish Wikipedia
```

#### 5c. SearXNG Tool (`toolSearXng`)

**Purpose**: Searches using a self-hosted SearXNG metasearch engine, providing privacy-focused web search aggregated from multiple search engines.

**Configuration Options**:
- `description` (string, OPTIONAL): Custom description for when to use SearXNG
- Credentials: SearXNG instance URL and optional API key (REQUIRED)
- `categories` (array): Search categories (general, images, news, etc.)

**How SearXNG Tool Works**:
The LLM provides a search query. The tool queries your SearXNG instance which aggregates results from multiple search engines (Google, Bing, DuckDuckGo, etc.) and returns combined results.

**Use Cases**:
- Privacy-focused web search
- Aggregated results from multiple sources
- Self-hosted search infrastructure
- Custom search engine configuration

**Critical Requirements**:
1. MUST have SearXNG instance URL configured
2. Instance must be accessible from n8n
3. Optional API key if instance requires authentication
4. Requires self-hosted or third-party SearXNG instance

**Validation Logic**:
```typescript
function validateSearXngTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check credentials (REQUIRED)
  if (!node.credentials || !node.credentials.searXng) {
    issues.push({
      severity: 'error',
      message: `SearXNG Tool "${node.name}" requires SearXNG instance credentials. Configure your instance URL.`
    });
  }

  // 2. Check description (RECOMMENDED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'info',
      message: `SearXNG Tool "${node.name}" has no custom description. Add one to explain when to use SearXNG vs. other search tools.`
    });
  }

  return issues;
}
```

**Validation Examples**:

✅ **Correct Example**:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolSearXng',
  name: 'Privacy Search',
  credentials: {
    searXng: 'searxng_credentials_id'  // Contains instance URL
  },
  parameters: {
    description: 'Privacy-focused metasearch aggregating results from multiple search engines. Use for general web searches.',
    categories: ['general', 'news']
  }
}
// Valid: Has credentials and configuration
```

❌ **Incorrect Example**:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolSearXng',
  name: 'Search'
  // ❌ No credentials configured
}
// ERROR: SearXNG Tool requires instance credentials
```

#### 5d. WolframAlpha Tool (`toolWolframAlpha`)

**Purpose**: Queries Wolfram|Alpha computational knowledge engine for mathematical computations, scientific data, statistics, and factual queries.

**Configuration Options**:
- `description` (string, OPTIONAL): Custom description for when to use Wolfram|Alpha
- Credentials: Wolfram|Alpha API key (REQUIRED)

**How WolframAlpha Tool Works**:
The LLM provides a computational or factual query. The tool sends it to Wolfram|Alpha's API and returns computed results, data, or answers.

**Use Cases**:
- Complex mathematical computations
- Scientific calculations and conversions
- Statistical data queries
- Physics, chemistry, astronomy calculations
- Unit conversions
- Factual data (population, dates, distances, etc.)

**Critical Requirements**:
1. MUST have valid Wolfram|Alpha App ID (API key)
2. Best for computational and scientific queries
3. Not ideal for general web search or current news

**Validation Logic**:
```typescript
function validateWolframAlphaTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check credentials (REQUIRED)
  if (!node.credentials || !node.credentials.wolframAlpha) {
    issues.push({
      severity: 'error',
      message: `WolframAlpha Tool "${node.name}" requires Wolfram|Alpha API credentials. Configure your App ID.`
    });
  }

  // 2. Check description (RECOMMENDED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'info',
      message: `WolframAlpha Tool "${node.name}" has no custom description. Add one to explain when to use Wolfram|Alpha for computational queries.`
    });
  }

  return issues;
}
```

**Validation Examples**:

✅ **Correct Example**:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolWolframAlpha',
  name: 'Wolfram Computation',
  credentials: {
    wolframAlpha: 'wolfram_credentials_id'
  },
  parameters: {
    description: 'Use for complex mathematical calculations, scientific computations, unit conversions, and factual data queries (population, distances, dates). NOT for general web search.'
  }
}
// Valid: Has credentials and clear usage guidance
```

❌ **Incorrect Example**:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolWolframAlpha',
  name: 'Calculator'
  // ❌ No credentials configured
}
// ERROR: WolframAlpha Tool requires API credentials
```

### 6. Simple Tools (Calculator, Think)

#### 6a. Calculator Tool (`toolCalculator`)

**Purpose**: Performs mathematical calculations and arithmetic operations. The LLM can use this tool when it needs to compute exact numerical results.

**Configuration Options**:
- `description` (string, OPTIONAL): Custom description for when the LLM should use this calculator

**How Calculator Tool Works**:
The LLM calls this tool with mathematical expressions as strings. The tool evaluates the expression and returns the numerical result. Handles basic arithmetic, exponents, and mathematical functions.

**Use Cases**:
- Precise arithmetic calculations
- Financial computations
- Unit conversions requiring math
- Any task requiring exact numerical results

**Critical Requirements**:
1. No special configuration required - works out of the box
2. No AI connections needed (self-contained)
3. Custom description optional but can help guide LLM usage

**Validation Logic**:
```typescript
function validateCalculatorTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Calculator is self-contained and requires no configuration
  // Optional: Check for custom description
  if (node.parameters.description) {
    if (node.parameters.description.trim().length < 10) {
      issues.push({
        severity: 'info',
        message: `Calculator Tool "${node.name}" has a very short description. Consider being more specific about when to use it.`
      });
    }
  }

  return issues;
}
```

**Validation Examples**:

✅ **Correct Example 1** - Default calculator:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolCalculator',
  name: 'Calculator'
}
// Valid: No configuration needed, works with defaults
```

✅ **Correct Example 2** - Custom description:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolCalculator',
  name: 'Financial Calculator',
  parameters: {
    description: 'Use for precise financial calculations, tax computations, and percentage calculations. Always use this instead of estimating numbers.'
  }
}
// Valid: Custom description guides LLM on specific use case
```

#### 6b. Think Tool (`toolThink`)

**Purpose**: Gives the AI agent time to think, reason, and plan before taking action. The agent can "think out loud" to work through complex problems step by step.

**Configuration Options**:
- `description` (string, OPTIONAL): Custom description for when the LLM should pause to think

**How Think Tool Works**:
When the LLM calls this tool, it returns the thinking content back to the agent. This creates a feedback loop where the agent can reason through problems, consider alternatives, and plan multi-step approaches before executing actions.

**Use Cases**:
- Complex problem-solving requiring multi-step reasoning
- Planning sequences of actions
- Considering trade-offs and alternatives
- Breaking down complex tasks
- Self-correction and validation

**Critical Requirements**:
1. No special configuration required
2. No AI connections needed (self-contained)
3. Most useful when agent faces complex, multi-step problems

**Validation Logic**:
```typescript
function validateThinkTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Think tool is self-contained and requires no configuration
  // Optional: Check for custom description
  if (node.parameters.description) {
    if (node.parameters.description.trim().length < 15) {
      issues.push({
        severity: 'info',
        message: `Think Tool "${node.name}" has a very short description. Explain when the agent should use thinking vs. action.`
      });
    }
  }

  return issues;
}
```

**Validation Examples**:

✅ **Correct Example 1** - Default think tool:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolThink',
  name: 'Think'
}
// Valid: No configuration needed, works with defaults
```

✅ **Correct Example 2** - Custom description for complex reasoning:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolThink',
  name: 'Strategic Planner',
  parameters: {
    description: 'Use this tool when you need to plan a complex multi-step approach, consider trade-offs between options, or validate your reasoning before taking action. Think through edge cases and potential failures.'
  }
}
// Valid: Detailed description guides agent on when to think vs. act
```

✅ **Correct Example 3** - Problem-solving focus:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.toolThink',
  name: 'Reasoning Tool',
  parameters: {
    description: 'Break down complex problems into steps, identify what information is missing, and plan your approach before using other tools'
  }
}
// Valid: Focuses agent on structured problem-solving
```

### 7. AI Agent Tool (`agentTool`)

**Purpose**: Creates a nested AI agent that functions as a tool for a parent AI agent. Enables complex agent hierarchies where specialized sub-agents handle specific tasks, each with their own model, tools, and capabilities.

**Configuration Options**:
- `name` (string, REQUIRED): Tool name that the parent agent uses to invoke this sub-agent
- `description` (string, REQUIRED): Explains the sub-agent's capabilities and when the parent should use it
- `promptType` (string): "auto" or "define" - how to construct prompts for this sub-agent
- `text` (string): Custom system prompt (when promptType="define")
- `systemMessage` (string): System message defining sub-agent's role
- `maxIterations` (number): Maximum tool-calling iterations (default: 10)
- `returnIntermediateSteps` (boolean): Return sub-agent's reasoning steps to parent

**How AI Agent Tool Works**:
The parent AI agent can invoke this sub-agent as a tool. The sub-agent has its own language model, tools, and configuration. It processes the request independently and returns results to the parent. This creates hierarchical agent architectures.

**Use Cases**:
- Specialized experts (e.g., "SQL Query Expert" sub-agent with database tools)
- Complex multi-step workflows (e.g., "Research Assistant" that uses search + summarization)
- Domain-specific processing (e.g., "Financial Analysis Agent" with calculation tools)

**Critical Requirements**:
1. MUST have exactly 1 `ai_languageModel` connection (the sub-agent's model)
2. `name` and `description` REQUIRED for parent agent to invoke properly
3. Can have its own `ai_tool` connections (sub-agent's toolset)
4. Can have `ai_memory` connection (sub-agent's memory)
5. Should have clear systemMessage defining sub-agent's specialized role

**Connection Architecture**:
```
[Language Model] --ai_languageModel--> [AI Agent Tool] --ai_tool--> [Parent AI Agent]
[Tool 1]         --ai_tool-----------> [AI Agent Tool]
[Tool 2]         --ai_tool-----------> [AI Agent Tool]
```

**Validation Logic**:
```typescript
function validateAIAgentTool(
  node: WorkflowNode,
  reverseConnections: Map<string, Connection[]>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // This is an AI Agent packaged as a tool
  // It has the same requirements as a regular AI Agent

  // 1. Check ai_languageModel connection (REQUIRED, exactly 1)
  const incoming = reverseConnections.get(node.name) || [];
  const languageModelConn = incoming.filter(c => c.type === 'ai_languageModel');

  if (languageModelConn.length === 0) {
    issues.push({
      severity: 'error',
      message: `AI Agent Tool "${node.name}" requires an ai_languageModel connection. Connect a language model node.`
    });
  } else if (languageModelConn.length > 1) {
    issues.push({
      severity: 'error',
      message: `AI Agent Tool "${node.name}" has ${languageModelConn.length} ai_languageModel connections. AI Agent Tool only supports 1 language model (no fallback).`
    });
  }

  // 2. Check tool name (REQUIRED)
  if (!node.parameters.name) {
    issues.push({
      severity: 'error',
      message: `AI Agent Tool "${node.name}" has no tool name. Add a name so the parent agent can invoke this sub-agent.`
    });
  }

  // 3. Check description (REQUIRED)
  if (!node.parameters.description) {
    issues.push({
      severity: 'error',
      message: `AI Agent Tool "${node.name}" has no description. Add one to help the parent agent know when to use this sub-agent.`
    });
  } else if (node.parameters.description.trim().length < 20) {
    issues.push({
      severity: 'warning',
      message: `AI Agent Tool "${node.name}" description is too short. Explain the sub-agent's specific expertise and capabilities.`
    });
  }

  // 4. Check system message (RECOMMENDED)
  if (!node.parameters.systemMessage && node.parameters.promptType !== 'define') {
    issues.push({
      severity: 'warning',
      message: `AI Agent Tool "${node.name}" has no systemMessage. Add one to define the sub-agent's specialized role and constraints.`
    });
  }

  // 5. Validate promptType configuration
  if (node.parameters.promptType === 'define') {
    if (!node.parameters.text || node.parameters.text.trim() === '') {
      issues.push({
        severity: 'error',
        message: `AI Agent Tool "${node.name}" has promptType="define" but no text field. Provide the custom prompt.`
      });
    }
  }

  // 6. Check if sub-agent has its own tools
  const toolConnections = incoming.filter(c => c.type === 'ai_tool');
  if (toolConnections.length === 0) {
    issues.push({
      severity: 'info',
      message: `AI Agent Tool "${node.name}" has no ai_tool connections. Consider giving the sub-agent tools to enhance its capabilities.`
    });
  }

  // 7. Validate maxIterations if specified
  if (node.parameters.maxIterations !== undefined) {
    if (typeof node.parameters.maxIterations !== 'number' || node.parameters.maxIterations < 1) {
      issues.push({
        severity: 'error',
        message: `AI Agent Tool "${node.name}" has invalid maxIterations. Must be a positive number.`
      });
    }
  }

  return issues;
}
```

**Validation Examples**:

✅ **Correct Example 1** - Specialized SQL expert sub-agent:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.agentTool',
  name: 'SQL Expert',
  parameters: {
    name: 'sql_expert',
    description: 'Expert SQL analyst that can query databases, analyze data patterns, and generate complex queries. Use when you need database insights or data analysis.',
    systemMessage: 'You are a SQL expert. Generate optimized SQL queries and explain query plans. Always validate input before querying.',
    maxIterations: 5
  }
}
// Connected to:
// - OpenAI Chat Model (with ai_languageModel connection)
// - Postgres Tool (with ai_tool connection)
// - Code Tool for data analysis (with ai_tool connection)
// Valid: Has model, name, description, tools, specialized system message
```

✅ **Correct Example 2** - Research assistant sub-agent:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.agentTool',
  name: 'Research Assistant',
  parameters: {
    name: 'research_assistant',
    description: 'Specialized research agent that searches the web, analyzes sources, and synthesizes information. Use for fact-finding and research tasks.',
    systemMessage: 'You are a research assistant. Search multiple sources, verify information, cite sources, and provide comprehensive summaries.',
    returnIntermediateSteps: true
  }
}
// Connected to:
// - Anthropic Chat Model (with ai_languageModel connection)
// - SerpApi Tool (with ai_tool connection)
// - Wikipedia Tool (with ai_tool connection)
// - Vector Store Tool (with ai_tool connection)
// Valid: Multi-tool sub-agent with clear specialization
```

✅ **Correct Example 3** - Minimal sub-agent:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.agentTool',
  name: 'Calculator Agent',
  parameters: {
    name: 'calculator',
    description: 'Simple calculator agent for basic arithmetic operations',
    systemMessage: 'You are a calculator. Perform accurate arithmetic calculations.'
  }
}
// Connected to:
// - OpenAI Chat Model (with ai_languageModel connection)
// - Calculator Tool (with ai_tool connection)
// Valid: Simple but complete configuration
// INFO will suggest adding more tools
```

❌ **Incorrect Example 1** - Missing language model:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.agentTool',
  name: 'Helper Agent',
  parameters: {
    name: 'helper',
    description: 'Helps with tasks'
  }
}
// ❌ No ai_languageModel connection
// ERROR: AI Agent Tool requires an ai_languageModel connection
```

❌ **Incorrect Example 2** - Missing required fields:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.agentTool',
  name: 'Agent Tool',
  parameters: {
    // ❌ No name property
    description: 'Agent'  // ❌ Description too short
  }
}
// ERROR: No tool name
// WARNING: Description too short (explain sub-agent's expertise)
```

❌ **Incorrect Example 3** - Multiple language models:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.agentTool',
  name: 'Dual Model Agent',
  parameters: {
    name: 'dual_agent',
    description: 'Agent with fallback model support'
  }
}
// Connected to:
// - OpenAI Chat Model (with ai_languageModel connection)
// - Anthropic Chat Model (with ai_languageModel connection)  // ❌ Second model
// ERROR: AI Agent Tool has 2 ai_languageModel connections. Only 1 allowed (no fallback support)
```

❌ **Incorrect Example 4** - Invalid promptType configuration:
```typescript
{
  type: '@n8n/n8n-nodes-langchain.agentTool',
  name: 'Custom Agent',
  parameters: {
    name: 'custom',
    description: 'Custom agent with specific prompt',
    promptType: 'define',
    // ❌ No text field when using define mode
  }
}
// ERROR: promptType="define" requires text field with custom prompt
```

### 8. MCP Client Tool (`mcpClientTool`)

**Purpose**: Connects to Model Context Protocol (MCP) servers to access external tools and resources, allowing AI agents to use MCP-compliant tools.

**Configuration Options**:
- `mcpServer`: MCP server connection configuration (REQUIRED)
  - Can reference existing server or define new one
- `tool`: Specific MCP tool to use from the server (REQUIRED)
- `description`: Tool description for LLM (REQUIRED)
- `toolParameters`: Tool-specific parameters
- `useCustomInputSchema`: Whether to override tool's input schema

**MCP Server Configuration**:
- `transport`: "stdio" or "sse" (Server-Sent Events)
- `command`: Executable command (for stdio)
- `args`: Command arguments (for stdio)
- `url`: Server URL (for SSE)
- `env`: Environment variables

**Critical Requirements**:
1. MCP server must be properly configured and accessible
2. Selected tool must exist on the MCP server
3. Tool parameters must match the tool's input schema

```typescript
function validateMCPClientTool(node: WorkflowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Check description (REQUIRED for LLM to understand tool)
  if (!node.parameters.description) {
    issues.push({
      severity: 'error',
      message: `MCP Client Tool "${node.name}" has no description. Add a clear description to help the LLM know when to use this MCP tool.`
    });
  }

  // 2. Check MCP server is configured (REQUIRED)
  if (!node.parameters.mcpServer) {
    issues.push({
      severity: 'error',
      message: `MCP Client Tool "${node.name}" has no MCP server configured. Select or configure an MCP server connection.`
    });
    return issues;  // Can't continue without server
  }

  // 3. Validate MCP server configuration
  const mcpServer = node.parameters.mcpServer;

  if (typeof mcpServer === 'object') {
    // Inline server configuration
    if (!mcpServer.transport) {
      issues.push({
        severity: 'error',
        message: `MCP Client Tool "${node.name}" has MCP server with no transport specified. Set transport to "stdio" or "sse".`
      });
    } else if (mcpServer.transport === 'stdio') {
      // Stdio transport requires command
      if (!mcpServer.command) {
        issues.push({
          severity: 'error',
          message: `MCP Client Tool "${node.name}" uses stdio transport but has no command specified. Provide the executable command.`
        });
      }
    } else if (mcpServer.transport === 'sse') {
      // SSE transport requires URL
      if (!mcpServer.url) {
        issues.push({
          severity: 'error',
          message: `MCP Client Tool "${node.name}" uses SSE transport but has no URL specified. Provide the server URL.`
        });
      } else {
        // Validate URL format
        try {
          new URL(mcpServer.url);
        } catch (e) {
          issues.push({
            severity: 'error',
            message: `MCP Client Tool "${node.name}" has invalid server URL: ${mcpServer.url}`
          });
        }
      }
    } else {
      issues.push({
        severity: 'error',
        message: `MCP Client Tool "${node.name}" has invalid transport "${mcpServer.transport}". Must be "stdio" or "sse".`
      });
    }
  }

  // 4. Check tool is selected (REQUIRED)
  if (!node.parameters.tool) {
    issues.push({
      severity: 'error',
      message: `MCP Client Tool "${node.name}" has no tool selected. Select which MCP tool to use from the server.`
    });
  }

  // 5. Validate tool parameters if specified
  if (node.parameters.toolParameters) {
    try {
      // Check if toolParameters is valid JSON
      if (typeof node.parameters.toolParameters === 'string') {
        JSON.parse(node.parameters.toolParameters);
      }
    } catch (e) {
      issues.push({
        severity: 'error',
        message: `MCP Client Tool "${node.name}" has invalid toolParameters. Must be valid JSON.`
      });
    }
  }

  // 6. Validate custom input schema if specified
  if (node.parameters.useCustomInputSchema) {
    if (!node.parameters.inputSchema) {
      issues.push({
        severity: 'error',
        message: `MCP Client Tool "${node.name}" has useCustomInputSchema=true but no inputSchema provided.`
      });
    } else {
      try {
        const schema = typeof node.parameters.inputSchema === 'string'
          ? JSON.parse(node.parameters.inputSchema)
          : node.parameters.inputSchema;

        if (!schema.type || !schema.properties) {
          issues.push({
            severity: 'warning',
            message: `MCP Client Tool "${node.name}" input schema should have 'type' and 'properties' fields for proper validation.`
          });
        }
      } catch (e) {
        issues.push({
          severity: 'error',
          message: `MCP Client Tool "${node.name}" has invalid inputSchema. Must be valid JSON Schema.`
        });
      }
    }
  }

  // 7. Recommend server name for better management
  if (typeof mcpServer === 'object' && !mcpServer.name) {
    issues.push({
      severity: 'info',
      message: `MCP Client Tool "${node.name}" MCP server has no name. Add a name for better server management and debugging.`
    });
  }

  return issues;
}
```

**Validation Examples**:

✅ **CORRECT - Stdio Transport**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.mcpClientTool",
  "name": "Filesystem Access",
  "parameters": {
    "description": "Access filesystem to read and write files",
    "mcpServer": {
      "name": "filesystem-server",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "env": {}
    },
    "tool": "read_file"
  }
}
```

✅ **CORRECT - SSE Transport**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.mcpClientTool",
  "name": "Remote API Access",
  "parameters": {
    "description": "Access remote API through MCP server",
    "mcpServer": {
      "name": "api-server",
      "transport": "sse",
      "url": "https://mcp.example.com/api"
    },
    "tool": "fetch_data",
    "toolParameters": "{\"endpoint\": \"/users\"}"
  }
}
```

✅ **CORRECT - With Custom Input Schema**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.mcpClientTool",
  "parameters": {
    "description": "Search database with custom validation",
    "mcpServer": "server-ref-123",
    "tool": "search",
    "useCustomInputSchema": true,
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {"type": "string"},
        "limit": {"type": "number", "maximum": 100}
      },
      "required": ["query"]
    }
  }
}
```

❌ **INCORRECT - Missing MCP Server**:
```json
{
  "type": "@n8n/n8n-nodes-langchain.mcpClientTool",
  "parameters": {
    "description": "Access files",
    "tool": "read_file"
    // Missing mcpServer!
  }
}
```

❌ **INCORRECT - Stdio Without Command**:
```json
{
  "parameters": {
    "mcpServer": {
      "transport": "stdio"
      // Missing command!
    },
    "tool": "read_file"
  }
}
```

❌ **INCORRECT - SSE Without URL**:
```json
{
  "parameters": {
    "mcpServer": {
      "transport": "sse"
      // Missing url!
    },
    "tool": "fetch_data"
  }
}
```

❌ **INCORRECT - Missing Tool Selection**:
```json
{
  "parameters": {
    "description": "Access MCP server",
    "mcpServer": {
      "transport": "stdio",
      "command": "mcp-server"
    }
    // Missing tool selection!
  }
}
```

**Common MCP Server Configurations**:

**Filesystem Server**:
```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
}
```

**GitHub Server**:
```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "{{ $credentials.githubToken }}"
  }
}
```

**PostgreSQL Server**:
```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."]
}
```

**Puppeteer Server**:
```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
}
```

**Remote SSE Server**:
```json
{
  "transport": "sse",
  "url": "https://your-mcp-server.com/sse"
}
```

## Complete Tool Validation Function

```typescript
function validateAllToolNodes(
  workflow: WorkflowJson,
  reverseConnections: Map<string, Connection[]>,
  result: WorkflowValidationResult
): void {
  for (const node of workflow.nodes) {
    const normalizedType = NodeTypeNormalizer.normalizeToFullForm(node.type);

    let issues: ValidationIssue[] = [];

    switch (normalizedType) {
      case '@n8n/n8n-nodes-langchain.toolHttpRequest':
        issues = validateHTTPRequestTool(node);
        break;

      case '@n8n/n8n-nodes-langchain.toolCode':
        issues = validateCodeTool(node);
        break;

      case '@n8n/n8n-nodes-langchain.toolVectorStore':
        issues = validateVectorStoreTool(node, reverseConnections, workflow);
        break;

      case '@n8n/n8n-nodes-langchain.toolWorkflow':
        issues = validateWorkflowTool(node);
        break;

      case '@n8n/n8n-nodes-langchain.toolSerpApi':
      case '@n8n/n8n-nodes-langchain.toolWikipedia':
      case '@n8n/n8n-nodes-langchain.toolSearXng':
      case '@n8n/n8n-nodes-langchain.toolWolframAlpha':
        issues = validateSearchTool(node);
        break;

      case '@n8n/n8n-nodes-langchain.agentTool':
        issues = validateAIAgentTool(node, reverseConnections);
        break;

      case '@n8n/n8n-nodes-langchain.mcpClientTool':
        issues = validateMCPClientTool(node);
        break;

      case '@n8n/n8n-nodes-langchain.toolCalculator':
      case '@n8n/n8n-nodes-langchain.toolThink':
        issues = validateSimpleTool(node);
        break;
    }

    // Add issues to result
    for (const issue of issues) {
      if (issue.severity === 'error') {
        result.errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: issue.message
        });
      } else if (issue.severity === 'warning') {
        result.warnings.push({
          type: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: issue.message
        });
      }
      // Skip 'info' level issues for now
    }

    // Generic check: Tool should be connected to AI Agent
    if (normalizedType.startsWith('@n8n/n8n-nodes-langchain.tool')) {
      const outgoing = workflow.connections[node.name];
      if (!outgoing?.ai_tool || outgoing.ai_tool.flat().filter(c => c).length === 0) {
        result.warnings.push({
          type: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: `Tool node "${node.name}" is not connected to any AI Agent via ai_tool output.`
        });
      }
    }
  }
}
```

## Summary: Validation Coverage

✅ **Complete Coverage**:
- AI Agent (required connections, streaming mode, prompt type)
- Basic LLM Chain (required connections, forbidden connections)
- Chat Trigger (response mode, downstream compatibility)
- All 13 AI tool sub-nodes with specific validation rules

✅ **Connection Direction Enforcement**:
- Reverse connection mapping to validate incoming connections
- Proper validation of ai_languageModel, ai_memory, ai_tool, etc.

✅ **Tool-Specific Rules**:
- HTTP Request Tool: Placeholder validation
- Code Tool: Function name and schema validation
- Vector Store Tool: Complete chain validation (Tool → VectorStore → Embedding)
- Workflow Tool: Sub-workflow existence
- Search Tools: Credential validation
- AI Agent Tool: Nested agent validation
- MCP Client Tool: Server configuration validation

## Database Coverage Summary

### What We Have in Our Database ✅

1. **All Purpose-Built AI Tool Sub-Nodes** (13 nodes)
   - Tool HTTP Request, Tool Code, Tool Workflow, Tool Vector Store
   - Tool Calculator, Tool Wikipedia, Tool SerpAPI, Tool SearXNG
   - Tool WolframAlpha, Tool Think
   - AI Agent Tool, MCP Client Tool, Tool Executor

2. **All AI Components** (21 nodes from @n8n/n8n-nodes-langchain)
   - AI Agent, Basic LLM Chain
   - All LLM nodes (OpenAI, Anthropic, Google Gemini, Cohere, etc.)
   - All Embedding nodes (OpenAI, Azure, Cohere, HuggingFace)
   - All Chain nodes (QA Chain, Summarization Chain)
   - Memory nodes, Vector Store nodes, Document Loaders, etc.

3. **All Regular Nodes Usable as Tools** (248 nodes from n8n-nodes-base)
   - Complete access to node metadata (type, properties, operations, credentials)
   - Can validate: Airtable, Slack, HTTP Request, Google Sheets, MySQL, PostgreSQL, etc.
   - Can check: Required parameters, credentials, operation modes

### Validation Capabilities by Node Type

| Node Category | Count | Validation Level |
|---------------|-------|------------------|
| **Purpose-Built Tool Nodes** | 13 | ⭐⭐⭐ **Specific** (custom validation per tool) |
| **AI Agent & Chains** | 5 | ⭐⭐⭐ **Specific** (connection type enforcement) |
| **LLM & Embedding Nodes** | 16 | ⭐⭐ **Medium** (generic AI component validation) |
| **Regular Nodes as Tools** | 248 | ⭐⭐ **Medium** (generic tool validation + node config) |

### What We Can Validate

✅ **Connection Architecture**:
- All 8 AI connection types (ai_languageModel, ai_memory, ai_tool, etc.)
- Connection direction enforcement (connections flow TO AI Agent)
- Reverse connection mapping
- Streaming mode constraints

✅ **Purpose-Built Tool Nodes** (13 nodes with specific rules):
- HTTP Request Tool: Placeholder validation
- Code Tool: Function name, input schema validation
- Vector Store Tool: Complete chain validation (vectorStore → embedding)
- Workflow Tool: Sub-workflow reference validation
- Search Tools: Credential validation
- All others with appropriate rules

✅ **Regular Nodes as Tools** (248 nodes):
- Node type lookup from database
- Property validation using node schema
- Credential requirement checking
- Operation/resource mode validation
- Tool description recommendations

✅ **AI Agent Workflows**:
- Required ai_languageModel connection
- Optional ai_memory, ai_tool, ai_outputParser connections
- Chat Trigger integration (streaming mode, prompt type)
- Tool connectivity and descriptions

✅ **Basic LLM Chain Workflows**:
- Required ai_languageModel connection
- Forbidden ai_memory and ai_tool connections
- Optional ai_outputParser connection

### Implementation Priority

**Phase 1: Core Infrastructure** ✅
- [x] Document complete AI tool ecosystem (269 nodes)
- [ ] Update `WorkflowConnection` interface with all AI connection types
- [ ] Implement `buildReverseConnectionMap()` utility
- [ ] Add helper functions for node type checking

**Phase 2: AI Agent & Chain Validation** (CRITICAL)
- [ ] Implement `validateAIAgent()` with:
  - Required ai_languageModel check
  - Streaming mode validation
  - Prompt type compatibility
  - Tool connection validation
- [ ] Implement `validateBasicLLMChain()` with:
  - Required ai_languageModel check
  - Forbidden connection checks
- [ ] Implement `validateChatTrigger()` with:
  - Response mode compatibility
  - Downstream node validation

**Phase 3: Purpose-Built Tool Validation** (HIGH PRIORITY)
- [ ] Implement `validateHTTPRequestTool()` with placeholder checking
- [ ] Implement `validateCodeTool()` with schema validation
- [ ] Implement `validateVectorStoreTool()` with chain validation
- [ ] Implement `validateWorkflowTool()` with reference checking
- [ ] Implement `validateSearchTool()` with credential checking
- [ ] Implement remaining tool-specific validators

**Phase 4: Generic Tool Validation** (MEDIUM PRIORITY)
- [ ] Implement generic tool connection validator
- [ ] Validate tool descriptions (toolDescription or description field)
- [ ] Check credentials configured for regular nodes used as tools
- [ ] Validate node parameters using database schema

**Phase 5: Testing & Documentation**
- [ ] Write unit tests for each validation function
- [ ] Write integration tests with real workflow templates (2985, 3680, 5296)
- [ ] Test with all 13 purpose-built tool nodes
- [ ] Test with sample regular nodes as tools (Slack, HTTP Request, Airtable)
- [ ] Update validation documentation
- [ ] Add MCP tool examples for validation checking

## Implementation Checklist

### Core Infrastructure ✅
- [ ] Update `WorkflowConnection` interface with all AI connection types
- [ ] Implement `buildReverseConnectionMap()` utility
- [ ] Add helper functions for node type checking

### AI Agent Validation (Enhanced with Deep Understanding) 🎯
- [ ] Implement `validateAIAgent()` with:
  - [x] **Prompt type validation** (auto vs define)
  - [x] **Text field requirement** check (when promptType='define')
  - [x] **Language model connection validation** (1 or 2 based on needsFallback)
  - [x] **Fallback model validation** (needsFallback flag + 2 LLM connections)
  - [x] **Output parser validation** (hasOutputParser flag + ai_outputParser connection)
  - [x] **System message recommendations** (warn if missing)
  - [x] **maxIterations validation** (warn if > 20)
  - [x] **Version compatibility checks** (needsFallback requires v2.1+)
  - [x] **Streaming mode validation** (Chat Trigger responseMode='streaming' → no main output)
  - [ ] Memory connection validation (0-1 ai_memory)
  - [ ] Tool connection validation (0-N ai_tool)

### Other AI Node Validation
- [ ] Implement `validateBasicLLMChain()`
- [ ] Implement `validateChatTrigger()`
- [ ] Implement `validateAllToolNodes()` with all 13 sub-validations
- [ ] Implement generic regular node as tool validation (248 nodes)

### Integration
- [ ] Add validation calls in main `validateWorkflow()` method
- [ ] Leverage database for node schema validation (269 nodes total)

### Testing
- [ ] Write unit tests for each validation function
- [ ] Write integration tests with real workflow templates (2985, 3680, 5296)

### Documentation
- [x] **Complete AI Agent deep architecture analysis**
- [x] **Document prompt construction (auto vs define)**
- [x] **Document system message patterns and best practices**
- [x] **Document fallback models feature**
- [x] **Document output parser integration**
- [x] **Document additional options (maxIterations, returnIntermediateSteps, etc.)**
- [x] **Document version differences (1.x vs 2.1+)**
- [x] **Provide real-world configuration examples**
- [x] **Specify MCP tool response improvements**
- [ ] Update MCP tool implementations to return enhanced information

## Key Insights for Implementation

### 1. AI Agent is NOT a Simple Node
The AI Agent node is the most complex node in n8n with:
- **2 prompt modes** (auto from Chat Trigger vs custom defined)
- **Dynamic connection requirements** (1-2 LLMs based on fallback setting)
- **Critical system message** that defines entire behavior
- **Multiple optional enhancements** (memory, tools, output parsers)
- **Version-specific features** (fallback, output parser in v2.1+)
- **Streaming mode constraints** (no main output when Chat Trigger streams)

### 2. Validation Must Be Context-Aware
Validation rules change based on:
- `promptType` setting → affects text field requirement
- `needsFallback` flag → affects LLM connection count requirement
- `hasOutputParser` flag → affects output parser connection requirement
- `typeVersion` → affects available features
- Upstream Chat Trigger's `responseMode` → affects downstream connection rules

### 3. System Message is the Most Important Field
- Defines agent's role, capabilities, constraints
- Controls tool usage behavior
- Specifies output format requirements
- Should be validated for completeness (warn if missing)
- Real-world templates show detailed, structured system messages

### 4. Fallback Models Are Production-Critical
- Automatic failover for reliability
- Rate limit mitigation
- Cost optimization strategies
- Must validate 2 LLM connections when enabled

### 5. Output Parsers Enforce Structure
- JSON/XML schema validation
- Required for structured data extraction
- System message should define format, parser enforces it
- Must validate connection when flag is set

### 6. MCP Tools Need Enhancement
Current MCP tools should return:
- **Prompt configuration details** (auto vs define modes)
- **System message importance and best practices**
- **Fallback model feature documentation**
- **Output parser integration patterns**
- **Connection requirement matrix**
- **Common configuration mistakes**
- **Real-world usage examples from templates**

## Implementation Pseudo-Code

### Core Utility: Build Reverse Connection Map

```typescript
/**
 * Builds a reverse connection map to find what connects TO each node
 * This is CRITICAL for validating AI nodes since connections flow TO them
 */
function buildReverseConnectionMap(workflow: WorkflowJson): Map<string, ReverseConnection[]> {
  const map = new Map<string, ReverseConnection[]>();

  for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
    const sourceNode = workflow.nodes.find(n => n.name === sourceName);
    const sourceType = sourceNode ? NodeTypeNormalizer.normalizeToFullForm(sourceNode.type) : '';

    // Iterate through all connection types (main, error, ai_*)
    for (const [outputType, connections] of Object.entries(outputs)) {
      if (!Array.isArray(connections)) continue;

      for (const connArray of connections) {
        if (!Array.isArray(connArray)) continue;

        for (const conn of connArray) {
          if (!conn) continue;

          // Add to reverse map
          if (!map.has(conn.node)) {
            map.set(conn.node, []);
          }
          map.get(conn.node)!.push({
            sourceName,
            sourceType,
            type: outputType,
            index: conn.index
          });
        }
      }
    }
  }

  return map;
}

interface ReverseConnection {
  sourceName: string;
  sourceType: string;
  type: string;  // 'main', 'ai_languageModel', 'ai_tool', etc.
  index: number;
}
```

### Main Validation Flow

```typescript
/**
 * Main entry point for AI node validation
 */
function validateAINodes(
  workflow: WorkflowJson,
  result: WorkflowValidationResult
): void {
  // Build reverse connection map
  const reverseConnections = buildReverseConnectionMap(workflow);

  for (const node of workflow.nodes) {
    if (node.disabled || isStickyNote(node)) continue;

    const normalizedType = NodeTypeNormalizer.normalizeToFullForm(node.type);

    // Route to appropriate validator
    if (normalizedType === '@n8n/n8n-nodes-langchain.agent') {
      validateAIAgent(node, reverseConnections, workflow, result);
    } else if (normalizedType === '@n8n/n8n-nodes-langchain.chainLlm') {
      validateBasicLLMChain(node, reverseConnections, result);
    } else if (normalizedType === '@n8n/n8n-nodes-langchain.chatTrigger') {
      validateChatTrigger(node, workflow, result);
    } else if (isToolNode(normalizedType)) {
      validateToolNode(node, reverseConnections, workflow, result);
    }
  }
}

function isToolNode(nodeType: string): boolean {
  const toolNodeTypes = [
    '@n8n/n8n-nodes-langchain.toolHttpRequest',
    '@n8n/n8n-nodes-langchain.toolCode',
    '@n8n/n8n-nodes-langchain.toolWorkflow',
    '@n8n/n8n-nodes-langchain.toolVectorStore',
    '@n8n/n8n-nodes-langchain.toolCalculator',
    '@n8n/n8n-nodes-langchain.toolWikipedia',
    '@n8n/n8n-nodes-langchain.toolSerpApi',
    '@n8n/n8n-nodes-langchain.toolSearXng',
    '@n8n/n8n-nodes-langchain.toolWolframAlpha',
    '@n8n/n8n-nodes-langchain.toolThink',
    '@n8n/n8n-nodes-langchain.agentTool',
    '@n8n/n8n-nodes-langchain.mcpClientTool',
    '@n8n/n8n-nodes-langchain.toolExecutor'
  ];
  return toolNodeTypes.includes(nodeType);
}
```

### Complete AI Agent Validator

```typescript
function validateAIAgent(
  node: WorkflowNode,
  reverseConnections: Map<string, ReverseConnection[]>,
  workflow: WorkflowJson,
  result: WorkflowValidationResult
): void {
  const incoming = reverseConnections.get(node.name) || [];

  // 1. REQUIRED: ai_languageModel connection (1 or 2 if fallback)
  const languageModelConnections = incoming.filter(c => c.type === 'ai_languageModel');

  if (node.parameters.needsFallback === true) {
    if (languageModelConnections.length !== 2) {
      result.errors.push({
        type: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent "${node.name}" has needsFallback=true but has ${languageModelConnections.length} language model connection(s). Exactly 2 are required (primary + fallback).`
      });
    }

    // Check version support
    if (node.typeVersion < 2.1) {
      result.errors.push({
        type: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent "${node.name}" uses needsFallback but typeVersion ${node.typeVersion} does not support it. Upgrade to version 2.1+.`
      });
    }
  } else {
    if (languageModelConnections.length === 0) {
      result.errors.push({
        type: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent "${node.name}" requires an ai_languageModel connection. Connect a language model node (e.g., OpenAI Chat Model, Google Gemini).`
      });
    } else if (languageModelConnections.length > 1) {
      result.errors.push({
        type: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent "${node.name}" has ${languageModelConnections.length} ai_languageModel connections but needsFallback=false. Either enable fallback or keep only 1 language model.`
      });
    }
  }

  // 2. Output parser validation
  if (node.parameters.hasOutputParser === true) {
    const outputParserConnections = incoming.filter(c => c.type === 'ai_outputParser');

    if (outputParserConnections.length === 0) {
      result.errors.push({
        type: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent "${node.name}" has hasOutputParser=true but no ai_outputParser connection. Connect an Output Parser node.`
      });
    } else if (outputParserConnections.length > 1) {
      result.warnings.push({
        type: 'warning',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent "${node.name}" has ${outputParserConnections.length} output parser connections. Only the first will be used.`
      });
    }
  }

  // 3. Prompt type validation
  if (node.parameters.promptType === 'define') {
    if (!node.parameters.text || node.parameters.text.trim() === '') {
      result.errors.push({
        type: 'error',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent "${node.name}" has promptType="define" but the text field is empty. Provide a prompt or change to promptType="auto".`
      });
    }
  } else if (node.parameters.promptType === 'auto') {
    const chatTriggerInput = incoming.find(c =>
      c.type === 'main' &&
      c.sourceType === '@n8n/n8n-nodes-langchain.chatTrigger'
    );

    if (!chatTriggerInput) {
      result.warnings.push({
        type: 'warning',
        nodeId: node.id,
        nodeName: node.name,
        message: `AI Agent "${node.name}" has promptType="auto" but no Chat Trigger is connected. Either connect a Chat Trigger or change promptType to "define".`
      });
    }
  }

  // 4. Streaming mode validation (CRITICAL)
  const chatTriggerInput = incoming.find(c =>
    c.type === 'main' &&
    c.sourceType === '@n8n/n8n-nodes-langchain.chatTrigger'
  );

  if (chatTriggerInput) {
    const chatTriggerNode = workflow.nodes.find(n => n.name === chatTriggerInput.sourceName);
    const responseMode = chatTriggerNode?.parameters?.options?.responseMode;

    if (responseMode === 'streaming') {
      const outgoingMain = workflow.connections[node.name]?.main;
      if (outgoingMain && outgoingMain.flat().some(c => c)) {
        result.errors.push({
          type: 'error',
          nodeId: node.id,
          nodeName: node.name,
          message: `AI Agent "${node.name}" is connected from Chat Trigger with responseMode="streaming". It must NOT have outgoing main connections. The response streams back through the Chat Trigger.`
        });
      }
    }
  }

  // 5. System message recommendation
  if (!node.parameters.options?.systemMessage) {
    result.warnings.push({
      type: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent "${node.name}" has no system message. Add one in options.systemMessage to define the agent's role, capabilities, and constraints.`
    });
  }

  // 6. maxIterations validation
  const maxIterations = node.parameters.options?.maxIterations;
  if (maxIterations !== undefined && maxIterations > 20) {
    result.warnings.push({
      type: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent "${node.name}" has maxIterations=${maxIterations}. High values may cause long execution times and high costs. Consider reducing to 20 or less.`
    });
  }

  // 7. Memory validation (optional, 0-1)
  const memoryConnections = incoming.filter(c => c.type === 'ai_memory');
  if (memoryConnections.length > 1) {
    result.warnings.push({
      type: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `AI Agent "${node.name}" has ${memoryConnections.length} ai_memory connections. Only 1 is supported; additional connections will be ignored.`
    });
  }

  // 8. Tool validation
  const toolConnections = incoming.filter(c => c.type === 'ai_tool');
  for (const toolConn of toolConnections) {
    const toolNode = workflow.nodes.find(n => n.name === toolConn.sourceName);
    if (toolNode && !toolNode.parameters.toolDescription && !toolNode.parameters.description) {
      result.warnings.push({
        type: 'warning',
        nodeId: toolNode.id,
        nodeName: toolNode.name,
        message: `Tool "${toolNode.name}" connected to AI Agent has no description. Add a toolDescription to help the LLM understand when to use this tool.`
      });
    }
  }
}
```

### Basic LLM Chain Validator

```typescript
function validateBasicLLMChain(
  node: WorkflowNode,
  reverseConnections: Map<string, ReverseConnection[]>,
  result: WorkflowValidationResult
): void {
  const incoming = reverseConnections.get(node.name) || [];

  // 1. REQUIRED: ai_languageModel connection
  const languageModelConnections = incoming.filter(c => c.type === 'ai_languageModel');
  if (languageModelConnections.length === 0) {
    result.errors.push({
      type: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Basic LLM Chain "${node.name}" requires an ai_languageModel connection. Connect a language model node.`
    });
  } else if (languageModelConnections.length > 1) {
    result.warnings.push({
      type: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Basic LLM Chain "${node.name}" has ${languageModelConnections.length} ai_languageModel connections. Only 1 is supported.`
    });
  }

  // 2. FORBIDDEN: ai_memory connections
  const memoryConnections = incoming.filter(c => c.type === 'ai_memory');
  if (memoryConnections.length > 0) {
    result.errors.push({
      type: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Basic LLM Chain "${node.name}" does not support ai_memory connections. Use AI Agent instead if you need conversation memory.`
    });
  }

  // 3. FORBIDDEN: ai_tool connections
  const toolConnections = incoming.filter(c => c.type === 'ai_tool');
  if (toolConnections.length > 0) {
    result.errors.push({
      type: 'error',
      nodeId: node.id,
      nodeName: node.name,
      message: `Basic LLM Chain "${node.name}" does not support ai_tool connections. Use AI Agent instead if you need tool calling.`
    });
  }

  // 4. OPTIONAL: ai_outputParser connection (0-1)
  const outputParserConnections = incoming.filter(c => c.type === 'ai_outputParser');
  if (outputParserConnections.length > 1) {
    result.warnings.push({
      type: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Basic LLM Chain "${node.name}" has ${outputParserConnections.length} output parser connections. Only 1 is supported.`
    });
  }
}
```

## Next Steps

1. **Implement Enhanced AI Agent Validator** using the complete specification from this document
2. **Update MCP Tool Responses** to include AI Agent deep understanding
3. **Test with Real Templates** (2985, 3680, 5296) to validate correctness
4. **Extend to Other AI Nodes** (Basic LLM Chain, Chat Trigger, Tools)
5. **Complete 269-Node Validation Coverage** for all tool nodes

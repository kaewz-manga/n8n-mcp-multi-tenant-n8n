#!/usr/bin/env node
/**
 * Debug test for AI validation issues
 * Reproduces the bugs found by n8n-mcp-tester
 */

import { validateAISpecificNodes, buildReverseConnectionMap } from '../src/services/ai-node-validator';
import type { WorkflowJson } from '../src/services/ai-tool-validators';
import { NodeTypeNormalizer } from '../src/utils/node-type-normalizer';

console.log('=== AI Validation Debug Tests ===\n');

// Test 1: AI Agent with NO language model connection
console.log('Test 1: Missing Language Model Detection');
const workflow1: WorkflowJson = {
  name: 'Test Missing LM',
  nodes: [
    {
      id: 'ai-agent-1',
      name: 'AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      position: [500, 300],
      parameters: {
        promptType: 'define',
        text: 'You are a helpful assistant'
      },
      typeVersion: 1.7
    }
  ],
  connections: {
    // NO connections - AI Agent is isolated
  }
};

console.log('Workflow:', JSON.stringify(workflow1, null, 2));

const reverseMap1 = buildReverseConnectionMap(workflow1);
console.log('\nReverse connection map for AI Agent:');
console.log('Entries:', Array.from(reverseMap1.entries()));
console.log('AI Agent connections:', reverseMap1.get('AI Agent'));

// Check node normalization
const normalizedType1 = NodeTypeNormalizer.normalizeToFullForm(workflow1.nodes[0].type);
console.log(`\nNode type: ${workflow1.nodes[0].type}`);
console.log(`Normalized type: ${normalizedType1}`);
console.log(`Match check: ${normalizedType1 === '@n8n/n8n-nodes-langchain.agent'}`);

const issues1 = validateAISpecificNodes(workflow1);
console.log('\nValidation issues:');
console.log(JSON.stringify(issues1, null, 2));

const hasMissingLMError = issues1.some(
  i => i.severity === 'error' && i.code === 'MISSING_LANGUAGE_MODEL'
);
console.log(`\n✓ Has MISSING_LANGUAGE_MODEL error: ${hasMissingLMError}`);
console.log(`✗ Expected: true, Got: ${hasMissingLMError}`);

// Test 2: AI Agent WITH language model connection
console.log('\n\n' + '='.repeat(60));
console.log('Test 2: AI Agent WITH Language Model (Should be valid)');
const workflow2: WorkflowJson = {
  name: 'Test With LM',
  nodes: [
    {
      id: 'openai-1',
      name: 'OpenAI Chat Model',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      position: [200, 300],
      parameters: {
        modelName: 'gpt-4'
      },
      typeVersion: 1
    },
    {
      id: 'ai-agent-1',
      name: 'AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      position: [500, 300],
      parameters: {
        promptType: 'define',
        text: 'You are a helpful assistant'
      },
      typeVersion: 1.7
    }
  ],
  connections: {
    'OpenAI Chat Model': {
      ai_languageModel: [
        [
          {
            node: 'AI Agent',
            type: 'ai_languageModel',
            index: 0
          }
        ]
      ]
    }
  }
};

console.log('\nConnections:', JSON.stringify(workflow2.connections, null, 2));

const reverseMap2 = buildReverseConnectionMap(workflow2);
console.log('\nReverse connection map for AI Agent:');
console.log('AI Agent connections:', reverseMap2.get('AI Agent'));

const issues2 = validateAISpecificNodes(workflow2);
console.log('\nValidation issues:');
console.log(JSON.stringify(issues2, null, 2));

const hasMissingLMError2 = issues2.some(
  i => i.severity === 'error' && i.code === 'MISSING_LANGUAGE_MODEL'
);
console.log(`\n✓ Should NOT have MISSING_LANGUAGE_MODEL error: ${!hasMissingLMError2}`);
console.log(`Expected: false, Got: ${hasMissingLMError2}`);

// Test 3: AI Agent with tools but no language model
console.log('\n\n' + '='.repeat(60));
console.log('Test 3: AI Agent with Tools but NO Language Model');
const workflow3: WorkflowJson = {
  name: 'Test Tools No LM',
  nodes: [
    {
      id: 'http-tool-1',
      name: 'HTTP Request Tool',
      type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
      position: [200, 300],
      parameters: {
        toolDescription: 'Calls an API',
        url: 'https://api.example.com'
      },
      typeVersion: 1.1
    },
    {
      id: 'ai-agent-1',
      name: 'AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      position: [500, 300],
      parameters: {
        promptType: 'define',
        text: 'You are a helpful assistant'
      },
      typeVersion: 1.7
    }
  ],
  connections: {
    'HTTP Request Tool': {
      ai_tool: [
        [
          {
            node: 'AI Agent',
            type: 'ai_tool',
            index: 0
          }
        ]
      ]
    }
  }
};

console.log('\nConnections:', JSON.stringify(workflow3.connections, null, 2));

const reverseMap3 = buildReverseConnectionMap(workflow3);
console.log('\nReverse connection map for AI Agent:');
const aiAgentConns = reverseMap3.get('AI Agent');
console.log('AI Agent connections:', aiAgentConns);
console.log('Connection types:', aiAgentConns?.map(c => c.type));

const issues3 = validateAISpecificNodes(workflow3);
console.log('\nValidation issues:');
console.log(JSON.stringify(issues3, null, 2));

const hasMissingLMError3 = issues3.some(
  i => i.severity === 'error' && i.code === 'MISSING_LANGUAGE_MODEL'
);
const hasNoToolsInfo3 = issues3.some(
  i => i.severity === 'info' && i.message.includes('no ai_tool connections')
);

console.log(`\n✓ Should have MISSING_LANGUAGE_MODEL error: ${hasMissingLMError3}`);
console.log(`Expected: true, Got: ${hasMissingLMError3}`);
console.log(`✗ Should NOT have "no tools" info: ${!hasNoToolsInfo3}`);
console.log(`Expected: false, Got: ${hasNoToolsInfo3}`);

console.log('\n' + '='.repeat(60));
console.log('Summary:');
console.log(`Test 1 (No LM): ${hasMissingLMError ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Test 2 (With LM): ${!hasMissingLMError2 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Test 3 (Tools, No LM): ${hasMissingLMError3 && !hasNoToolsInfo3 ? 'PASS ✓' : 'FAIL ✗'}`);

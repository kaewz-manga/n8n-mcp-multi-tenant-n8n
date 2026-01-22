# Type Structure Validation

## Overview

Type Structure Validation is an automatic validation system that ensures complex n8n node configurations conform to their expected data structures. Implemented as part of the n8n-mcp validation system, it provides zero-configuration validation for special n8n types that have complex nested structures.

**Status:** Production (v2.22.21+)
**Performance:** 100% pass rate on 776 real-world validations
**Speed:** 0.01ms average validation time (500x faster than target)

The system automatically validates node configurations without requiring any additional setup or configuration from users or AI assistants.

## Supported Types

The validation system supports four special n8n types that have complex structures:

### 1. **filter** (FilterValue)
Complex filtering conditions with boolean operators, comparison operations, and nested logic.

**Structure:**
- `combinator`: "and" | "or" - How conditions are combined
- `conditions`: Array of filter conditions
  - Each condition has: `leftValue`, `operator` (type + operation), `rightValue`
  - Supports 40+ operations: equals, contains, exists, notExists, gt, lt, regex, etc.

**Example Usage:** IF node, Switch node condition filtering

### 2. **resourceMapper** (ResourceMapperValue)
Data mapping configuration for transforming data between different formats.

**Structure:**
- `mappingMode`: "defineBelow" | "autoMapInputData" | "mapManually"
- `value`: Field mappings or expressions
- `matchingColumns`: Column matching configuration
- `schema`: Target schema definition

**Example Usage:** Google Sheets node, Airtable node data mapping

### 3. **assignmentCollection** (AssignmentCollectionValue)
Variable assignments for setting multiple values at once.

**Structure:**
- `assignments`: Array of name-value pairs
  - Each assignment has: `name`, `value`, `type`

**Example Usage:** Set node, Code node variable assignments

### 4. **resourceLocator** (INodeParameterResourceLocator)
Resource selection with multiple lookup modes (ID, name, URL, etc.).

**Structure:**
- `mode`: "id" | "list" | "url" | "name"
- `value`: Resource identifier (string, number, or expression)
- `cachedResultName`: Optional cached display name
- `cachedResultUrl`: Optional cached URL

**Example Usage:** Google Sheets spreadsheet selection, Slack channel selection

## Performance & Results

The validation system was tested against real-world n8n.io workflow templates:

| Metric | Result |
|--------|--------|
| **Templates Tested** | 91 (top by popularity) |
| **Nodes Validated** | 616 nodes with special types |
| **Total Validations** | 776 property validations |
| **Pass Rate** | 100.00% (776/776) |
| **False Positive Rate** | 0.00% |
| **Average Time** | 0.01ms per validation |
| **Max Time** | 1.00ms per validation |
| **Performance vs Target** | 500x faster than 50ms target |

### Type-Specific Results

- `filter`: 93/93 passed (100.00%)
- `resourceMapper`: 69/69 passed (100.00%)
- `assignmentCollection`: 213/213 passed (100.00%)
- `resourceLocator`: 401/401 passed (100.00%)

## How It Works

### Automatic Integration

Structure validation is automatically applied during node configuration validation. When you call `validate_node_operation` or `validate_node_minimal`, the system:

1. **Identifies Special Types**: Detects properties that use filter, resourceMapper, assignmentCollection, or resourceLocator types
2. **Validates Structure**: Checks that the configuration matches the expected structure for that type
3. **Validates Operations**: For filter types, validates that operations are supported for the data type
4. **Provides Context**: Returns specific error messages with property paths and fix suggestions

### Validation Flow

```
User/AI provides node config
        ↓
validate_node_operation (MCP tool)
        ↓
EnhancedConfigValidator.validateWithMode()
        ↓
validateSpecialTypeStructures() ← Automatic structure validation
        ↓
TypeStructureService.validateStructure()
        ↓
Returns validation result with errors/warnings/suggestions
```

### Edge Cases Handled

**1. Credential-Provided Fields**
- Fields like Google Sheets `sheetId` that come from n8n credentials at runtime are excluded from validation
- No false positives for fields that aren't in the configuration

**2. Filter Operations**
- Universal operations (`exists`, `notExists`, `isNotEmpty`) work across all data types
- Type-specific operations validated (e.g., `regex` only for strings, `gt`/`lt` only for numbers)

**3. Node-Specific Logic**
- Custom validation logic for specific nodes (Google Sheets, Slack, etc.)
- Context-aware error messages that understand the node's operation

## Example Validation Error

### Invalid Filter Structure

**Configuration:**
```json
{
  "conditions": {
    "combinator": "and",
    "conditions": [
      {
        "leftValue": "={{ $json.status }}",
        "rightValue": "active",
        "operator": {
          "type": "string",
          "operation": "invalidOperation"  // ❌ Not a valid operation
        }
      }
    ]
  }
}
```

**Validation Error:**
```json
{
  "valid": false,
  "errors": [
    {
      "type": "invalid_structure",
      "property": "conditions.conditions[0].operator.operation",
      "message": "Unsupported operation 'invalidOperation' for type 'string'",
      "suggestion": "Valid operations for string: equals, notEquals, contains, notContains, startsWith, endsWith, regex, exists, notExists, isNotEmpty"
    }
  ]
}
```

## Technical Details

### Implementation

- **Type Definitions**: `src/types/type-structures.ts` (301 lines)
- **Type Structures**: `src/constants/type-structures.ts` (741 lines, 22 complete type structures)
- **Service Layer**: `src/services/type-structure-service.ts` (427 lines)
- **Validator Integration**: `src/services/enhanced-config-validator.ts` (line 270)
- **Node-Specific Logic**: `src/services/node-specific-validators.ts`

### Test Coverage

- **Unit Tests**:
  - `tests/unit/types/type-structures.test.ts` (14 tests)
  - `tests/unit/constants/type-structures.test.ts` (39 tests)
  - `tests/unit/services/type-structure-service.test.ts` (64 tests)
  - `tests/unit/services/enhanced-config-validator-type-structures.test.ts`

- **Integration Tests**:
  - `tests/integration/validation/real-world-structure-validation.test.ts` (8 tests, 388ms)

- **Validation Scripts**:
  - `scripts/test-structure-validation.ts` - Standalone validation against 100 templates

### Documentation

- **Implementation Plan**: `docs/local/v3/implementation-plan-final.md` - Complete technical specifications
- **Phase Results**: Phases 1-3 completed with 100% success criteria met

## For Developers

### Adding New Type Structures

1. Define the type structure in `src/constants/type-structures.ts`
2. Add validation logic in `TypeStructureService.validateStructure()`
3. Add tests in `tests/unit/constants/type-structures.test.ts`
4. Test against real templates using `scripts/test-structure-validation.ts`

### Testing Structure Validation

**Run Unit Tests:**
```bash
npm run test:unit -- tests/unit/services/enhanced-config-validator-type-structures.test.ts
```

**Run Integration Tests:**
```bash
npm run test:integration -- tests/integration/validation/real-world-structure-validation.test.ts
```

**Run Full Validation:**
```bash
npm run test:structure-validation
```

### Relevant Test Files

- **Type Tests**: `tests/unit/types/type-structures.test.ts`
- **Structure Tests**: `tests/unit/constants/type-structures.test.ts`
- **Service Tests**: `tests/unit/services/type-structure-service.test.ts`
- **Validator Tests**: `tests/unit/services/enhanced-config-validator-type-structures.test.ts`
- **Integration Tests**: `tests/integration/validation/real-world-structure-validation.test.ts`
- **Real-World Validation**: `scripts/test-structure-validation.ts`

## Production Readiness

✅ **All Tests Passing**: 100% pass rate on unit and integration tests
✅ **Performance Validated**: 0.01ms average (500x better than 50ms target)
✅ **Zero Breaking Changes**: Fully backward compatible
✅ **Real-World Validation**: 91 templates, 616 nodes, 776 validations
✅ **Production Deployment**: Successfully deployed in v2.22.21
✅ **Edge Cases Handled**: Credential fields, filter operations, node-specific logic

## Version History

- **v2.22.21** (2025-11-21): Type structure validation system completed (Phases 1-3)
  - 22 complete type structures defined
  - 100% pass rate on real-world validation
  - 0.01ms average validation time
  - Zero false positives

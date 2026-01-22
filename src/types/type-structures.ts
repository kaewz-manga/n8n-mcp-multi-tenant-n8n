/**
 * Type Structure Definitions
 *
 * Defines the structure and validation rules for n8n node property types.
 * These structures help validate node configurations and provide better
 * AI assistance by clearly defining what each property type expects.
 *
 * @module types/type-structures
 * @since 2.23.0
 */

import type { NodePropertyTypes } from 'n8n-workflow';

/**
 * Structure definition for a node property type
 *
 * Describes the expected data structure, JavaScript type,
 * example values, and validation rules for each property type.
 *
 * @interface TypeStructure
 *
 * @example
 * ```typescript
 * const stringStructure: TypeStructure = {
 *   type: 'primitive',
 *   jsType: 'string',
 *   description: 'A text value',
 *   example: 'Hello World',
 *   validation: {
 *     allowEmpty: true,
 *     allowExpressions: true
 *   }
 * };
 * ```
 */
export interface TypeStructure {
	/**
	 * Category of the type
	 * - primitive: Basic JavaScript types (string, number, boolean)
	 * - object: Complex object structures
	 * - array: Array types
	 * - collection: n8n collection types (nested properties)
	 * - special: Special n8n types with custom behavior
	 */
	type: 'primitive' | 'object' | 'array' | 'collection' | 'special';

	/**
	 * Underlying JavaScript type
	 */
	jsType: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

	/**
	 * Human-readable description of the type
	 */
	description: string;

	/**
	 * Detailed structure definition for complex types
	 * Describes the expected shape of the data
	 */
	structure?: {
		/**
		 * For objects: map of property names to their types
		 */
		properties?: Record<string, TypePropertyDefinition>;

		/**
		 * For arrays: type of array items
		 */
		items?: TypePropertyDefinition;

		/**
		 * Whether the structure is flexible (allows additional properties)
		 */
		flexible?: boolean;

		/**
		 * Required properties (for objects)
		 */
		required?: string[];
	};

	/**
	 * Example value demonstrating correct usage
	 */
	example: any;

	/**
	 * Additional example values for complex types
	 */
	examples?: any[];

	/**
	 * Validation rules specific to this type
	 */
	validation?: {
		/**
		 * Whether empty values are allowed
		 */
		allowEmpty?: boolean;

		/**
		 * Whether n8n expressions ({{ ... }}) are allowed
		 */
		allowExpressions?: boolean;

		/**
		 * Minimum value (for numbers)
		 */
		min?: number;

		/**
		 * Maximum value (for numbers)
		 */
		max?: number;

		/**
		 * Pattern to match (for strings)
		 */
		pattern?: string;

		/**
		 * Custom validation function name
		 */
		customValidator?: string;
	};

	/**
	 * Version when this type was introduced
	 */
	introducedIn?: string;

	/**
	 * Version when this type was deprecated (if applicable)
	 */
	deprecatedIn?: string;

	/**
	 * Type that replaces this one (if deprecated)
	 */
	replacedBy?: NodePropertyTypes;

	/**
	 * Additional notes or warnings
	 */
	notes?: string[];
}

/**
 * Property definition within a structure
 */
export interface TypePropertyDefinition {
	/**
	 * Type of this property
	 */
	type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

	/**
	 * Description of this property
	 */
	description?: string;

	/**
	 * Whether this property is required
	 */
	required?: boolean;

	/**
	 * Nested properties (for object types)
	 */
	properties?: Record<string, TypePropertyDefinition>;

	/**
	 * Type of array items (for array types)
	 */
	items?: TypePropertyDefinition;

	/**
	 * Example value
	 */
	example?: any;

	/**
	 * Allowed values (enum)
	 */
	enum?: Array<string | number | boolean>;

	/**
	 * Whether this structure allows additional properties beyond those defined
	 */
	flexible?: boolean;
}

/**
 * Complex property types that have nested structures
 *
 * These types require special handling and validation
 * beyond simple type checking.
 */
export type ComplexPropertyType =
	| 'collection'
	| 'fixedCollection'
	| 'resourceLocator'
	| 'resourceMapper'
	| 'filter'
	| 'assignmentCollection';

/**
 * Primitive property types (simple values)
 *
 * These types map directly to JavaScript primitives
 * and don't require complex validation.
 */
export type PrimitivePropertyType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'dateTime'
	| 'color'
	| 'json';

/**
 * Type guard to check if a property type is complex
 *
 * Complex types have nested structures and require
 * special validation logic.
 *
 * @param type - The property type to check
 * @returns True if the type is complex
 *
 * @example
 * ```typescript
 * if (isComplexType('collection')) {
 *   // Handle complex type
 * }
 * ```
 */
export function isComplexType(type: NodePropertyTypes): type is ComplexPropertyType {
	return (
		type === 'collection' ||
		type === 'fixedCollection' ||
		type === 'resourceLocator' ||
		type === 'resourceMapper' ||
		type === 'filter' ||
		type === 'assignmentCollection'
	);
}

/**
 * Type guard to check if a property type is primitive
 *
 * Primitive types map to simple JavaScript values
 * and only need basic type validation.
 *
 * @param type - The property type to check
 * @returns True if the type is primitive
 *
 * @example
 * ```typescript
 * if (isPrimitiveType('string')) {
 *   // Handle as primitive
 * }
 * ```
 */
export function isPrimitiveType(type: NodePropertyTypes): type is PrimitivePropertyType {
	return (
		type === 'string' ||
		type === 'number' ||
		type === 'boolean' ||
		type === 'dateTime' ||
		type === 'color' ||
		type === 'json'
	);
}

/**
 * Type guard to check if a value is a valid TypeStructure
 *
 * @param value - The value to check
 * @returns True if the value conforms to TypeStructure interface
 *
 * @example
 * ```typescript
 * const maybeStructure = getStructureFromSomewhere();
 * if (isTypeStructure(maybeStructure)) {
 *   console.log(maybeStructure.example);
 * }
 * ```
 */
export function isTypeStructure(value: any): value is TypeStructure {
	return (
		value !== null &&
		typeof value === 'object' &&
		'type' in value &&
		'jsType' in value &&
		'description' in value &&
		'example' in value &&
		['primitive', 'object', 'array', 'collection', 'special'].includes(value.type) &&
		['string', 'number', 'boolean', 'object', 'array', 'any'].includes(value.jsType)
	);
}

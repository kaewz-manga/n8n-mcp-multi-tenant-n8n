/**
 * Tests for Type Structure type definitions
 *
 * @group unit
 * @group types
 */

import { describe, it, expect } from 'vitest';
import {
	isComplexType,
	isPrimitiveType,
	isTypeStructure,
	type TypeStructure,
	type ComplexPropertyType,
	type PrimitivePropertyType,
} from '@/types/type-structures';
import type { NodePropertyTypes } from 'n8n-workflow';

describe('Type Guards', () => {
	describe('isComplexType', () => {
		it('should identify complex types correctly', () => {
			const complexTypes: NodePropertyTypes[] = [
				'collection',
				'fixedCollection',
				'resourceLocator',
				'resourceMapper',
				'filter',
				'assignmentCollection',
			];

			for (const type of complexTypes) {
				expect(isComplexType(type)).toBe(true);
			}
		});

		it('should return false for non-complex types', () => {
			const nonComplexTypes: NodePropertyTypes[] = [
				'string',
				'number',
				'boolean',
				'options',
				'multiOptions',
			];

			for (const type of nonComplexTypes) {
				expect(isComplexType(type)).toBe(false);
			}
		});
	});

	describe('isPrimitiveType', () => {
		it('should identify primitive types correctly', () => {
			const primitiveTypes: NodePropertyTypes[] = [
				'string',
				'number',
				'boolean',
				'dateTime',
				'color',
				'json',
			];

			for (const type of primitiveTypes) {
				expect(isPrimitiveType(type)).toBe(true);
			}
		});

		it('should return false for non-primitive types', () => {
			const nonPrimitiveTypes: NodePropertyTypes[] = [
				'collection',
				'fixedCollection',
				'options',
				'multiOptions',
				'filter',
			];

			for (const type of nonPrimitiveTypes) {
				expect(isPrimitiveType(type)).toBe(false);
			}
		});
	});

	describe('isTypeStructure', () => {
		it('should validate correct TypeStructure objects', () => {
			const validStructure: TypeStructure = {
				type: 'primitive',
				jsType: 'string',
				description: 'A test type',
				example: 'test',
			};

			expect(isTypeStructure(validStructure)).toBe(true);
		});

		it('should reject objects missing required fields', () => {
			const invalidStructures = [
				{ jsType: 'string', description: 'test', example: 'test' }, // Missing type
				{ type: 'primitive', description: 'test', example: 'test' }, // Missing jsType
				{ type: 'primitive', jsType: 'string', example: 'test' }, // Missing description
				{ type: 'primitive', jsType: 'string', description: 'test' }, // Missing example
			];

			for (const invalid of invalidStructures) {
				expect(isTypeStructure(invalid)).toBe(false);
			}
		});

		it('should reject objects with invalid type values', () => {
			const invalidType = {
				type: 'invalid',
				jsType: 'string',
				description: 'test',
				example: 'test',
			};

			expect(isTypeStructure(invalidType)).toBe(false);
		});

		it('should reject objects with invalid jsType values', () => {
			const invalidJsType = {
				type: 'primitive',
				jsType: 'invalid',
				description: 'test',
				example: 'test',
			};

			expect(isTypeStructure(invalidJsType)).toBe(false);
		});

		it('should reject non-object values', () => {
			expect(isTypeStructure(null)).toBe(false);
			expect(isTypeStructure(undefined)).toBe(false);
			expect(isTypeStructure('string')).toBe(false);
			expect(isTypeStructure(123)).toBe(false);
			expect(isTypeStructure([])).toBe(false);
		});
	});
});

describe('TypeStructure Interface', () => {
	it('should allow all valid type categories', () => {
		const types: Array<TypeStructure['type']> = [
			'primitive',
			'object',
			'array',
			'collection',
			'special',
		];

		// This test just verifies TypeScript compilation
		expect(types.length).toBe(5);
	});

	it('should allow all valid jsType values', () => {
		const jsTypes: Array<TypeStructure['jsType']> = [
			'string',
			'number',
			'boolean',
			'object',
			'array',
			'any',
		];

		// This test just verifies TypeScript compilation
		expect(jsTypes.length).toBe(6);
	});

	it('should support optional properties', () => {
		const minimal: TypeStructure = {
			type: 'primitive',
			jsType: 'string',
			description: 'Test',
			example: 'test',
		};

		const full: TypeStructure = {
			type: 'primitive',
			jsType: 'string',
			description: 'Test',
			example: 'test',
			examples: ['test1', 'test2'],
			structure: {
				properties: {
					field: {
						type: 'string',
						description: 'A field',
					},
				},
			},
			validation: {
				allowEmpty: true,
				allowExpressions: true,
				pattern: '^test',
			},
			introducedIn: '1.0.0',
			notes: ['Note 1', 'Note 2'],
		};

		expect(minimal).toBeDefined();
		expect(full).toBeDefined();
	});
});

describe('Type Unions', () => {
	it('should correctly type ComplexPropertyType', () => {
		const complexTypes: ComplexPropertyType[] = [
			'collection',
			'fixedCollection',
			'resourceLocator',
			'resourceMapper',
			'filter',
			'assignmentCollection',
		];

		expect(complexTypes.length).toBe(6);
	});

	it('should correctly type PrimitivePropertyType', () => {
		const primitiveTypes: PrimitivePropertyType[] = [
			'string',
			'number',
			'boolean',
			'dateTime',
			'color',
			'json',
		];

		expect(primitiveTypes.length).toBe(6);
	});
});

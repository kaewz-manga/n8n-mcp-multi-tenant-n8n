import { describe, it, expect } from 'vitest';
import { ConfigValidator } from '../../../src/services/config-validator';

describe('ConfigValidator _cnd operators', () => {
  describe('isPropertyVisible with _cnd operators', () => {
    describe('eq operator', () => {
      it('should match when values are equal', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { status: [{ _cnd: { eq: 'active' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { status: 'active' })).toBe(true);
      });

      it('should not match when values are not equal', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { status: [{ _cnd: { eq: 'active' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { status: 'inactive' })).toBe(false);
      });

      it('should match numeric equality', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { eq: 1 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1 })).toBe(true);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2 })).toBe(false);
      });
    });

    describe('not operator', () => {
      it('should match when values are not equal', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { status: [{ _cnd: { not: 'disabled' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { status: 'active' })).toBe(true);
      });

      it('should not match when values are equal', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { status: [{ _cnd: { not: 'disabled' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { status: 'disabled' })).toBe(false);
      });
    });

    describe('gte operator (greater than or equal)', () => {
      it('should match when value is greater', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { gte: 1.1 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2.0 })).toBe(true);
      });

      it('should match when value is equal', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { gte: 1.1 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1.1 })).toBe(true);
      });

      it('should not match when value is less', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { gte: 1.1 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1.0 })).toBe(false);
      });
    });

    describe('lte operator (less than or equal)', () => {
      it('should match when value is less', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { lte: 2.0 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1.5 })).toBe(true);
      });

      it('should match when value is equal', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { lte: 2.0 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2.0 })).toBe(true);
      });

      it('should not match when value is greater', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { lte: 2.0 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2.5 })).toBe(false);
      });
    });

    describe('gt operator (greater than)', () => {
      it('should match when value is greater', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { count: [{ _cnd: { gt: 5 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { count: 10 })).toBe(true);
      });

      it('should not match when value is equal', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { count: [{ _cnd: { gt: 5 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { count: 5 })).toBe(false);
      });
    });

    describe('lt operator (less than)', () => {
      it('should match when value is less', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { count: [{ _cnd: { lt: 10 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { count: 5 })).toBe(true);
      });

      it('should not match when value is equal', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { count: [{ _cnd: { lt: 10 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { count: 10 })).toBe(false);
      });
    });

    describe('between operator', () => {
      it('should match when value is within range', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { between: { from: 4, to: 4.6 } } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 4.3 })).toBe(true);
      });

      it('should match when value equals lower bound', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { between: { from: 4, to: 4.6 } } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 4 })).toBe(true);
      });

      it('should match when value equals upper bound', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { between: { from: 4, to: 4.6 } } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 4.6 })).toBe(true);
      });

      it('should not match when value is below range', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { between: { from: 4, to: 4.6 } } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 3.9 })).toBe(false);
      });

      it('should not match when value is above range', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { between: { from: 4, to: 4.6 } } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 5 })).toBe(false);
      });

      it('should not match when between structure is null', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { between: null } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 4 })).toBe(false);
      });

      it('should not match when between is missing from field', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { between: { to: 5 } } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 4 })).toBe(false);
      });

      it('should not match when between is missing to field', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { '@version': [{ _cnd: { between: { from: 3 } } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 4 })).toBe(false);
      });
    });

    describe('startsWith operator', () => {
      it('should match when string starts with prefix', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { name: [{ _cnd: { startsWith: 'test' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { name: 'testUser' })).toBe(true);
      });

      it('should not match when string does not start with prefix', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { name: [{ _cnd: { startsWith: 'test' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { name: 'mytest' })).toBe(false);
      });

      it('should not match non-string values', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { value: [{ _cnd: { startsWith: 'test' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { value: 123 })).toBe(false);
      });
    });

    describe('endsWith operator', () => {
      it('should match when string ends with suffix', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { email: [{ _cnd: { endsWith: '@example.com' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { email: 'user@example.com' })).toBe(true);
      });

      it('should not match when string does not end with suffix', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { email: [{ _cnd: { endsWith: '@example.com' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { email: 'user@other.com' })).toBe(false);
      });
    });

    describe('includes operator', () => {
      it('should match when string contains substring', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { eventId: [{ _cnd: { includes: '_' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { eventId: 'event_123' })).toBe(true);
      });

      it('should not match when string does not contain substring', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { eventId: [{ _cnd: { includes: '_' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { eventId: 'event123' })).toBe(false);
      });
    });

    describe('regex operator', () => {
      it('should match when string matches regex pattern', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { id: [{ _cnd: { regex: '^[A-Z]{3}\\d{4}$' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { id: 'ABC1234' })).toBe(true);
      });

      it('should not match when string does not match regex pattern', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { id: [{ _cnd: { regex: '^[A-Z]{3}\\d{4}$' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { id: 'abc1234' })).toBe(false);
      });

      it('should not match when regex pattern is invalid', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { id: [{ _cnd: { regex: '[invalid(regex' } }] }
          }
        };
        // Invalid regex should return false without throwing
        expect(ConfigValidator.isPropertyVisible(prop, { id: 'test' })).toBe(false);
      });

      it('should not match non-string values', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { value: [{ _cnd: { regex: '\\d+' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { value: 123 })).toBe(false);
      });
    });

    describe('exists operator', () => {
      it('should match when field exists and is not null', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { optionalField: [{ _cnd: { exists: true } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { optionalField: 'value' })).toBe(true);
      });

      it('should match when field exists with value 0', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { optionalField: [{ _cnd: { exists: true } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { optionalField: 0 })).toBe(true);
      });

      it('should match when field exists with empty string', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { optionalField: [{ _cnd: { exists: true } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { optionalField: '' })).toBe(true);
      });

      it('should not match when field is undefined', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { optionalField: [{ _cnd: { exists: true } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { otherField: 'value' })).toBe(false);
      });

      it('should not match when field is null', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { optionalField: [{ _cnd: { exists: true } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { optionalField: null })).toBe(false);
      });
    });

    describe('mixed plain values and _cnd conditions', () => {
      it('should match plain value in array with _cnd', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: { status: ['active', { _cnd: { eq: 'pending' } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { status: 'active' })).toBe(true);
        expect(ConfigValidator.isPropertyVisible(prop, { status: 'pending' })).toBe(true);
        expect(ConfigValidator.isPropertyVisible(prop, { status: 'disabled' })).toBe(false);
      });

      it('should handle multiple conditions with AND logic', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            show: {
              '@version': [{ _cnd: { gte: 1.1 } }],
              mode: ['advanced']
            }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2.0, mode: 'advanced' })).toBe(true);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2.0, mode: 'basic' })).toBe(false);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1.0, mode: 'advanced' })).toBe(false);
      });
    });

    describe('hide conditions with _cnd', () => {
      it('should hide property when _cnd condition matches', () => {
        const prop = {
          name: 'testField',
          displayOptions: {
            hide: { '@version': [{ _cnd: { lt: 2.0 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1.5 })).toBe(false);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2.0 })).toBe(true);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2.5 })).toBe(true);
      });
    });

    describe('Execute Workflow Trigger scenario', () => {
      it('should show property when @version >= 1.1', () => {
        const prop = {
          name: 'inputSource',
          displayOptions: {
            show: { '@version': [{ _cnd: { gte: 1.1 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1.1 })).toBe(true);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1.2 })).toBe(true);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2.0 })).toBe(true);
      });

      it('should hide property when @version < 1.1', () => {
        const prop = {
          name: 'inputSource',
          displayOptions: {
            show: { '@version': [{ _cnd: { gte: 1.1 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1.0 })).toBe(false);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1 })).toBe(false);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 0.9 })).toBe(false);
      });

      it('should show outdated version warning only for v1', () => {
        const prop = {
          name: 'outdatedVersionWarning',
          displayOptions: {
            show: { '@version': [{ _cnd: { eq: 1 } }] }
          }
        };
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1 })).toBe(true);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 1.1 })).toBe(false);
        expect(ConfigValidator.isPropertyVisible(prop, { '@version': 2 })).toBe(false);
      });
    });
  });

  describe('backward compatibility with plain values', () => {
    it('should continue to work with plain value arrays', () => {
      const prop = {
        name: 'testField',
        displayOptions: {
          show: { resource: ['user', 'message'] }
        }
      };
      expect(ConfigValidator.isPropertyVisible(prop, { resource: 'user' })).toBe(true);
      expect(ConfigValidator.isPropertyVisible(prop, { resource: 'message' })).toBe(true);
      expect(ConfigValidator.isPropertyVisible(prop, { resource: 'channel' })).toBe(false);
    });

    it('should work with properties without displayOptions', () => {
      const prop = {
        name: 'testField'
      };
      expect(ConfigValidator.isPropertyVisible(prop, {})).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { resolvePath } from './jsonpath';

describe('resolvePath', () => {
  const obj = {
    data: {
      id: 42,
      name: 'Alice',
      items: [
        { id: 10, label: 'first' },
        { id: 20, label: 'second' },
      ],
      nested: {
        deep: {
          value: 'found',
        },
      },
    },
    token: 'abc123',
  };

  it('resolves simple key', () => {
    expect(resolvePath(obj, 'token')).toBe('abc123');
  });

  it('resolves nested key', () => {
    expect(resolvePath(obj, 'data.id')).toBe(42);
  });

  it('resolves deeply nested key', () => {
    expect(resolvePath(obj, 'data.nested.deep.value')).toBe('found');
  });

  it('resolves array index', () => {
    expect(resolvePath(obj, 'data.items[0].id')).toBe(10);
    expect(resolvePath(obj, 'data.items[1].label')).toBe('second');
  });

  it('returns undefined for missing key', () => {
    expect(resolvePath(obj, 'data.missing')).toBeUndefined();
  });

  it('returns undefined for null obj', () => {
    expect(resolvePath(null, 'data')).toBeUndefined();
  });

  it('returns undefined for empty path', () => {
    expect(resolvePath(obj, '')).toBeUndefined();
  });

  it('handles $. prefix', () => {
    expect(resolvePath(obj, '$.data.name')).toBe('Alice');
  });

  it('filters array by field value', () => {
    expect(resolvePath(obj, 'data.items[?id==10].label')).toBe('first');
    expect(resolvePath(obj, 'data.items[?id==20].label')).toBe('second');
  });

  it('filters array with nested path after filter', () => {
    const orders = {
      orders: [
        { open_order_id: 'AAA', vendor: { vendor_order_id: 'V1' } },
        { open_order_id: 'BBB', vendor: { vendor_order_id: 'V2' } },
      ],
    };
    expect(resolvePath(orders, 'orders[?open_order_id==BBB].vendor.vendor_order_id')).toBe('V2');
  });

  it('returns undefined when filter finds no match', () => {
    expect(resolvePath(obj, 'data.items[?id==999].label')).toBeUndefined();
  });

  it('returns undefined when filtering non-array', () => {
    expect(resolvePath(obj, 'token[?x==1].y')).toBeUndefined();
  });

  it('filters array by nested field path', () => {
    const data = {
      orders: [
        { open_order_id: 'AAA', vendor: { vendor_order_id: 'V1' } },
        { open_order_id: 'BBB', vendor: { vendor_order_id: 'V2' } },
      ],
    };
    expect(resolvePath(data, 'orders[?vendor.vendor_order_id==V2].open_order_id')).toBe('BBB');
  });
});

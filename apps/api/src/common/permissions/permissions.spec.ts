import {
  ALL_PERMISSION_KEYS,
  effectivePermissions,
  hasPermission,
  isOfficeRole,
  parsePermissionsInput,
} from './permissions';

describe('permissions catalog', () => {
  it('ALL_PERMISSION_KEYS is non-empty and unique', () => {
    expect(ALL_PERMISSION_KEYS.length).toBeGreaterThan(0);
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it('contains expected core keys', () => {
    expect(ALL_PERMISSION_KEYS).toContain('orders.read');
    expect(ALL_PERMISSION_KEYS).toContain('cash.income');
    expect(ALL_PERMISSION_KEYS).toContain('settlements.pay');
  });
});

describe('isOfficeRole', () => {
  it.each(['ADMIN', 'DIRECTOR', 'OWNER'])('returns true for %s', (role) => {
    expect(isOfficeRole(role)).toBe(true);
  });

  it.each(['DISPATCHER', 'MASTER', 'UNKNOWN', ''])(
    'returns false for %s',
    (role) => {
      expect(isOfficeRole(role)).toBe(false);
    },
  );
});

describe('effectivePermissions / hasPermission', () => {
  it('OWNER always has all keys', () => {
    expect(effectivePermissions('OWNER', [])).toEqual(ALL_PERMISSION_KEYS);
    expect(hasPermission('OWNER', [], ['cash.expense'])).toBe(true);
  });

  it('legacy empty ADMIN falls back to full catalog', () => {
    expect(effectivePermissions('ADMIN', [])).toEqual(ALL_PERMISSION_KEYS);
  });

  it('explicit ADMIN list is enforced', () => {
    expect(hasPermission('ADMIN', ['cash.read'], ['cash.expense'])).toBe(false);
    expect(hasPermission('ADMIN', ['cash.read'], ['cash.read'])).toBe(true);
  });

  it('MASTER/DISPATCHER ignore permission keys', () => {
    expect(hasPermission('DISPATCHER', [], ['orders.read'])).toBe(true);
  });
});

describe('parsePermissionsInput', () => {
  it('returns [] for null/undefined/empty string', () => {
    expect(parsePermissionsInput(null)).toEqual([]);
    expect(parsePermissionsInput(undefined)).toEqual([]);
    expect(parsePermissionsInput('')).toEqual([]);
    expect(parsePermissionsInput('   ')).toEqual([]);
  });

  it('keeps valid keys from an array', () => {
    const result = parsePermissionsInput(['orders.read', 'cash.income']);
    expect(result).toEqual(['orders.read', 'cash.income']);
  });

  it('filters out unknown keys from an array', () => {
    const result = parsePermissionsInput([
      'orders.read',
      'not.a.real.permission',
      'cash.income',
    ]);
    expect(result).toEqual(['orders.read', 'cash.income']);
  });

  it('deduplicates repeated keys', () => {
    const result = parsePermissionsInput([
      'orders.read',
      'orders.read',
      'cash.income',
    ]);
    expect(result).toEqual(['orders.read', 'cash.income']);
  });

  it('parses a JSON array string', () => {
    const result = parsePermissionsInput('["orders.read","cash.income"]');
    expect(result).toEqual(['orders.read', 'cash.income']);
  });

  it('parses a comma-separated string with spaces', () => {
    const result = parsePermissionsInput(' orders.read , cash.income ');
    expect(result).toEqual(['orders.read', 'cash.income']);
  });

  it('returns [] for a garbage string', () => {
    expect(parsePermissionsInput('total garbage !!!')).toEqual([]);
  });

  it('coerces non-string array elements and drops invalid ones', () => {
    const result = parsePermissionsInput([123, 'orders.read', true]);
    expect(result).toEqual(['orders.read']);
  });
});

import { Role } from '@prisma/client';
import { BranchScopeService } from './branch-scope.service';

describe('BranchScopeService', () => {
  const prisma = { user: { findUnique: jest.fn() } } as any;
  const svc = new BranchScopeService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('allowedCityIds', () => {
    it('returns null for OWNER without calling findUnique', async () => {
      const result = await svc.allowedCityIds('user-1', Role.OWNER);

      expect(result).toBeNull();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('returns own cityId for ADMIN with no managed branches', async () => {
      prisma.user.findUnique.mockResolvedValue({
        cityId: 'A',
        managedBranches: [],
      });

      const result = await svc.allowedCityIds('user-1', Role.ADMIN);

      expect(result).toEqual(['A']);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          cityId: true,
          managedBranches: { select: { cityId: true } },
        },
      });
    });

    it('returns cityId plus managed branch cities for DIRECTOR (unique via Set)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        cityId: 'A',
        managedBranches: [{ cityId: 'B' }, { cityId: 'C' }],
      });

      const result = await svc.allowedCityIds('user-1', Role.DIRECTOR);

      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('returns empty array when user has no cityId and no managed branches', async () => {
      prisma.user.findUnique.mockResolvedValue({
        cityId: null,
        managedBranches: [],
      });

      const result = await svc.allowedCityIds('user-1', Role.ADMIN);

      expect(result).toEqual([]);
    });

    it('returns empty array when findUnique returns null', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await svc.allowedCityIds('missing', Role.ADMIN);

      expect(result).toEqual([]);
    });
  });

  describe('resolveCityIds', () => {
    it('returns allowed when requested is absent', () => {
      expect(svc.resolveCityIds(['A', 'B'])).toEqual(['A', 'B']);
      expect(svc.resolveCityIds(null)).toBeNull();
      expect(svc.resolveCityIds([])).toEqual([]);
    });

    it('returns [requested] when allowed is null (OWNER scope)', () => {
      expect(svc.resolveCityIds(null, 'X')).toEqual(['X']);
    });

    it('returns [requested] when requested is in allowed', () => {
      expect(svc.resolveCityIds(['A', 'B'], 'A')).toEqual(['A']);
    });

    it('returns empty array when requested is not in allowed', () => {
      expect(svc.resolveCityIds(['A', 'B'], 'Z')).toEqual([]);
    });
  });

  describe('cityWhere', () => {
    it('returns undefined for null', () => {
      expect(svc.cityWhere(null)).toBeUndefined();
    });

    it('returns { in: [] } for empty array', () => {
      expect(svc.cityWhere([])).toEqual({ in: [] });
    });

    it('returns { in: cityIds } for non-empty array', () => {
      expect(svc.cityWhere(['A', 'B'])).toEqual({ in: ['A', 'B'] });
    });
  });
});

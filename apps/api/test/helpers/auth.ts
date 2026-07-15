import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const jwtService = new JwtService({
  secret: process.env.JWT_SECRET ?? 'test-secret',
  signOptions: { expiresIn: '7d' },
});

export function makeToken(
  userId: string,
  role: Role,
  login = 'test-user',
): string {
  return jwtService.sign({ sub: userId, login, role });
}

export type SeedUserSpec = {
  key: string;
  login: string;
  fullName: string;
  role: Role;
  cityKey?: 'a' | 'b';
  createMaster?: boolean;
  createDirector?: boolean;
  createDispatcherPay?: boolean;
};

export type SeedBaseDataOptions = {
  password?: string;
  users?: SeedUserSpec[];
};

export type SeedBaseDataResult = {
  cities: {
    a: { id: string; code: string; name: string };
    b: { id: string; code: string; name: string };
  };
  users: Record<string, { id: string; login: string; role: Role }>;
  password: string;
};

const DEFAULT_USERS: SeedUserSpec[] = [
  { key: 'owner', login: 'owner', fullName: 'Owner', role: Role.OWNER },
  {
    key: 'adminA',
    login: 'admina',
    fullName: 'Admin A',
    role: Role.ADMIN,
    cityKey: 'a',
  },
  {
    key: 'adminB',
    login: 'adminb',
    fullName: 'Admin B',
    role: Role.ADMIN,
    cityKey: 'b',
  },
  {
    key: 'dispatcherA',
    login: 'dispatchera',
    fullName: 'Dispatcher A',
    role: Role.DISPATCHER,
    cityKey: 'a',
    createDispatcherPay: true,
  },
  {
    key: 'directorA',
    login: 'directora',
    fullName: 'Director A',
    role: Role.DIRECTOR,
    cityKey: 'a',
    createDirector: true,
  },
  {
    key: 'masterA',
    login: 'mastera',
    fullName: 'Master A',
    role: Role.MASTER,
    cityKey: 'a',
    createMaster: true,
  },
];

export async function seedBaseData(
  prisma: PrismaClient,
  options: SeedBaseDataOptions = {},
): Promise<SeedBaseDataResult> {
  const password = options.password ?? 'test123';
  const passwordHash = await bcrypt.hash(password, 10);
  const userSpecs = options.users ?? DEFAULT_USERS;

  const cityA = await prisma.city.create({
    data: { code: 'city_a', name: 'Город A' },
  });
  const cityB = await prisma.city.create({
    data: { code: 'city_b', name: 'Город B' },
  });

  const cities = { a: cityA, b: cityB };
  const users: SeedBaseDataResult['users'] = {};

  for (const spec of userSpecs) {
    const cityId = spec.cityKey ? cities[spec.cityKey].id : null;

    const user = await prisma.user.create({
      data: {
        login: spec.login,
        passwordHash,
        fullName: spec.fullName,
        role: spec.role,
        status: UserStatus.ACTIVE,
        cityId,
        hiredAt: new Date(),
      },
    });

    users[spec.key] = { id: user.id, login: user.login, role: user.role };

    if (spec.createMaster || spec.role === Role.MASTER) {
      await prisma.master.create({
        data: { userId: user.id, cityId, status: UserStatus.ACTIVE },
      });
    }

    if (spec.createDirector && cityId) {
      await prisma.branchDirector.create({
        data: { cityId, userId: user.id },
      });
    }

    if (spec.createDispatcherPay || spec.role === Role.DISPATCHER) {
      await prisma.dispatcherPaySettings.create({
        data: { userId: user.id },
      });
    }
  }

  return { cities, users, password };
}

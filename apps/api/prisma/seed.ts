import {
  PrismaClient,
  Role,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const cities = await Promise.all(
    [
      { code: 'msk', name: 'Москва' },
      { code: 'spb', name: 'Санкт-Петербург' },
    ].map((c) =>
      prisma.city.upsert({
        where: { code: c.code },
        update: { name: c.name, active: true },
        create: c,
      }),
    ),
  );

  await Promise.all(
    ['Партнёр А', 'Партнёр Б'].map((name) =>
      prisma.partner.upsert({
        where: { name },
        update: { active: true },
        create: { name },
      }),
    ),
  );

  const ages = [
    { code: 'under_25', label: 'до 25', sort: 1 },
    { code: '25_35', label: '25–35', sort: 2 },
    { code: '35_45', label: '35–45', sort: 3 },
    { code: '45_60', label: '45–60', sort: 4 },
    { code: '60_plus', label: '60+', sort: 5 },
  ];
  for (const a of ages) {
    await prisma.ageCategory.upsert({
      where: { code: a.code },
      update: { label: a.label, sort: a.sort },
      create: a,
    });
  }

  const salaryCount = await prisma.salaryCategory.count();
  if (salaryCount === 0) {
    await prisma.salaryCategory.createMany({
      data: [
        { minSum: 0, maxSum: 3999, percent: 0.5, note: 'placeholder' },
        { minSum: 4000, maxSum: 7999, percent: 0.45, note: 'placeholder' },
        { minSum: 8000, maxSum: 14999, percent: 0.4, note: 'placeholder' },
        { minSum: 15000, maxSum: null, percent: 0.35, note: 'placeholder' },
      ],
    });
  }

  const users = [
    {
      login: 'owner',
      password: 'owner123',
      fullName: 'Владелец Пилот',
      role: Role.OWNER,
    },
    {
      login: 'admin',
      password: 'admin123',
      fullName: 'Админ Пилот',
      role: Role.ADMIN,
    },
    {
      login: 'dispatcher',
      password: 'disp123',
      fullName: 'Диспетчер Пилот',
      role: Role.DISPATCHER,
    },
  ];

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { login: u.login },
      update: {
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        status: UserStatus.ACTIVE,
        cityId: cities[0].id,
      },
      create: {
        login: u.login,
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        status: UserStatus.ACTIVE,
        cityId: cities[0].id,
        hiredAt: new Date(),
      },
    });
  }

  const masterLogin = 'master1';
  const masterHash = await bcrypt.hash('master123', 10);
  const masterUser = await prisma.user.upsert({
    where: { login: masterLogin },
    update: {
      fullName: 'Иванов Иван',
      role: Role.MASTER,
      status: UserStatus.ACTIVE,
      cityId: cities[0].id,
      telegramId: '100001',
    },
    create: {
      login: masterLogin,
      passwordHash: masterHash,
      fullName: 'Иванов Иван',
      role: Role.MASTER,
      status: UserStatus.ACTIVE,
      cityId: cities[0].id,
      telegramId: '100001',
      hiredAt: new Date(),
    },
  });

  await prisma.master.upsert({
    where: { userId: masterUser.id },
    update: { status: UserStatus.ACTIVE },
    create: { userId: masterUser.id, status: UserStatus.ACTIVE },
  });

  // eslint-disable-next-line no-console
  console.log('Seed OK. Logins: owner/owner123, admin/admin123, dispatcher/disp123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { expect, Page } from '@playwright/test';

export type E2ERole =
  | 'owner'
  | 'admin'
  | 'dispatcher'
  | 'adminA'
  | 'adminB';

export const credentials: Record<E2ERole, { login: string; password: string }> =
  {
    owner: {
      login: process.env.E2E_OWNER_LOGIN ?? 'owner',
      password: process.env.E2E_OWNER_PASSWORD ?? 'owner123',
    },
    admin: {
      login: process.env.E2E_ADMIN_LOGIN ?? 'admin',
      password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
    },
    dispatcher: {
      login: process.env.E2E_DISPATCHER_LOGIN ?? 'dispatcher',
      password: process.env.E2E_DISPATCHER_PASSWORD ?? 'disp123',
    },
    adminA: {
      login: process.env.E2E_ADMIN_A_LOGIN ?? 'adminA',
      password: process.env.E2E_ADMIN_A_PASSWORD ?? 'test123',
    },
    adminB: {
      login: process.env.E2E_ADMIN_B_LOGIN ?? 'adminB',
      password: process.env.E2E_ADMIN_B_PASSWORD ?? 'test123',
    },
  };

/** Имя филиала B — не должно встречаться в списках adminA. */
export const branchBName = process.env.E2E_BRANCH_B_NAME ?? 'Город B';

/** Имя филиала A — для переключателя owner. */
export const branchAName = process.env.E2E_BRANCH_A_NAME ?? 'Город A';

export async function loginAs(page: Page, role: E2ERole): Promise<void> {
  const { login, password } = credentials[role];
  await page.goto('/login');
  await page.getByLabel('Логин').fill(login);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/orders/);
  await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Проверяет, что таблица списка (не формы) не содержит данных филиала B. */
export async function expectListTableExcludesBranch(
  page: Page,
  branchName: string,
): Promise<void> {
  const listTable = page.locator('.panel table').last();
  await expect(listTable).toBeVisible();
  await expect(listTable.locator('tbody')).not.toContainText(branchName);
}

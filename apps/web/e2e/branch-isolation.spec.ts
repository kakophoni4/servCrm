import { expect, test } from '@playwright/test';
import {
  branchAName,
  branchBName,
  expectListTableExcludesBranch,
  loginAs,
} from './helpers';

test.describe('Изоляция филиалов', () => {
  test('adminA: список заявок не содержит данных филиала B', async ({
    page,
  }) => {
    await loginAs(page, 'adminA');

    await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible();
    await expect(
      page.getByRole('combobox').filter({ hasText: 'Все филиалы' }),
    ).toHaveCount(0);

    await expect(page.locator('.panel table tbody')).not.toContainText(
      branchBName,
    );
  });

  test('adminA: касса не содержит операций филиала B', async ({ page }) => {
    await loginAs(page, 'adminA');
    await page.getByRole('link', { name: 'Касса' }).click();

    await expect(page.getByRole('heading', { name: 'Касса' })).toBeVisible();
    await expectListTableExcludesBranch(page, branchBName);
  });

  test('adminA: отчёты не содержат данных филиала B', async ({ page }) => {
    await loginAs(page, 'adminA');
    await page.goto('/reports');

    await expect(page.getByRole('heading', { name: 'Отчёты' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText(branchBName);

    await page.getByRole('button', { name: 'Касса' }).click();
    await expect(page.getByText('По городам')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(branchBName);
  });

  test('owner: доступен переключатель филиала на заявках', async ({ page }) => {
    await loginAs(page, 'owner');

    const branchSelect = page.getByRole('combobox').filter({
      has: page.getByRole('option', { name: 'Все филиалы' }),
    });
    await expect(branchSelect).toBeVisible();
    await expect(branchSelect).toContainText('Все филиалы');

    const branchAOption = page.getByRole('option', { name: branchAName });
    if ((await branchAOption.count()) > 0) {
      await branchSelect.selectOption({ label: branchAName });
      await expect(branchSelect).toContainText(branchAName);
    }

    await branchSelect.selectOption({ label: 'Все филиалы' });
    await expect(branchSelect).toContainText('Все филиалы');
  });
});

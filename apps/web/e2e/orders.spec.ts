import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Заявки', () => {
  test('dispatcher: создать заявку и увидеть в списке', async ({ page }) => {
    const clientName = `E2E Клиент ${Date.now()}`;
    const address = `ул. Тестовая, ${Date.now()}`;

    await loginAs(page, 'dispatcher');

    await page.getByRole('link', { name: 'Создать заявку' }).click();
    await expect(page.getByRole('heading', { name: 'Новая заявка' })).toBeVisible();

    await page.getByLabel('Имя клиента').fill(clientName);
    await page.getByLabel('Телефон').fill('+79001234567');
    await page.getByLabel('Адрес').fill(address);
    await page.getByRole('button', { name: 'Создать заявку' }).click();

    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /Заявка / })).toBeVisible();

    await page.getByRole('link', { name: 'Заявки' }).click();
    await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: clientName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(address);
  });

  test('dispatcher: смена статуса недоступна', async ({ page }) => {
    await loginAs(page, 'dispatcher');

    const orderLink = page
      .locator('table tbody tr')
      .first()
      .getByRole('link')
      .first();
    await expect(orderLink).toBeVisible();
    await orderLink.click();

    await expect(page.getByRole('heading', { name: /Заявка / })).toBeVisible();
    await expect(page.getByLabel('Статус')).toHaveCount(0);
    await expect(
      page.getByText('Смена статусов исполнения — у администратора'),
    ).toBeVisible();
  });

  test('admin: сменить статус заявки', async ({ page }) => {
    await loginAs(page, 'admin');

    const orderLink = page
      .locator('table tbody tr')
      .first()
      .getByRole('link')
      .first();
    await expect(orderLink).toBeVisible();
    await orderLink.click();

    const statusSelect = page.getByLabel('Статус');
    await expect(statusSelect).toBeVisible();
    await statusSelect.selectOption({ label: 'В пути' });
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByText('Сохранено')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Заявка / })).toContainText(
      'В пути',
    );
  });
});

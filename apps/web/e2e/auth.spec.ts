import { expect, test } from '@playwright/test';
import { credentials, loginAs } from './helpers';

test.describe('Авторизация', () => {
  test('owner: успешный вход и редирект на заявки', async ({ page }) => {
    await loginAs(page, 'owner');
    await expect(page.getByRole('link', { name: 'Создать заявку' })).toBeVisible();
  });

  test('admin: успешный вход и редирект на заявки', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page.getByRole('link', { name: 'Создать заявку' })).toBeVisible();
  });

  test('dispatcher: успешный вход и редирект на заявки', async ({ page }) => {
    await loginAs(page, 'dispatcher');
    await expect(page.getByRole('link', { name: 'Создать заявку' })).toBeVisible();
  });

  test('неверный пароль: сообщение об ошибке, остаёмся на логине', async ({
    page,
  }) => {
    const { login } = credentials.dispatcher;

    await page.goto('/login');
    await page.getByLabel('Логин').fill(login);
    await page.getByLabel('Пароль').fill('wrong-password-xyz');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'СРМ Сервис' })).toBeVisible();
  });
});

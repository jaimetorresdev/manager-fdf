import { test, expect } from '@playwright/test';

test.describe('Autenticación (smoke)', () => {
  test('muestra el formulario de login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Manager FDF/i })).toBeVisible();
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('login-username')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeEnabled();
  });

  test('redirige la raíz pública a la portada', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/landing/);
  });

  test('enlace a registro desde login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-register-link').click();
    await expect(page).toHaveURL(/\/register/);
  });
});

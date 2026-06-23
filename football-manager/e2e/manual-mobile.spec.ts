import { test, expect } from '@playwright/test';

/**
 * El manual requiere sesión; este test valida layout móvil del login
 * (proxy de accesibilidad touch) hasta tener fixture de auth en CI.
 */
test.describe('Mobile-first (smoke)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('login usable en viewport móvil', async ({ page }) => {
    await page.goto('/login');
    const submit = page.getByTestId('login-submit');
    const box = await submit.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});

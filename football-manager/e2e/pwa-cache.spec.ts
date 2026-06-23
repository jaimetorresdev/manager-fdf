import { test, expect } from '@playwright/test';

test.describe('PWA Cache validation', () => {
  test('does not cache /api/* responses persistently', async ({ page }) => {
    // Navigate to the app (which may redirect to login)
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for a moment to let service worker potentially do its thing
    await page.waitForTimeout(1000);

    // Fetch something from the API
    await page.evaluate(async () => {
      try {
        await fetch('/api/public/news');
      } catch {
        // ignore network errors if no backend is running
      }
    });

    // Check caches
    const cacheKeys = await page.evaluate(async () => {
      return await caches.keys();
    });

    // Expect 'api-cache' to not exist in persistent caches
    expect(cacheKeys).not.toContain('api-cache');
  });
});

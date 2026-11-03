import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { evidence, newGame, skipTutorial, state } from './helpers';

test.describe('saving, export/import and offline', () => {
  test.skip(({ viewport }) => viewport!.width !== 390, 'runs once (390×844)');

  test('REQ-SAVE-E2E-01 manual save, reload, continue resumes paused at the same tick', async ({ page }) => {
    await newGame(page);
    await skipTutorial(page);
    await page.getByTestId('speed-4').click();
    await page.waitForTimeout(2000);
    await page.getByTestId('settings').click();
    await page.getByTestId('save-now').click();
    await expect(page.locator('.toast.good')).toContainText('Sparat');
    const tick = await state<number>(page, 's.clock.tick');
    const cash = await state<number>(page, 's.economy.cash');
    await page.reload();
    await page.getByTestId('continue').click();
    await page.waitForFunction(() => !!(window as any).pixelHospital?.app.scene);
    const t2 = await state<number>(page, 's.clock.tick');
    expect(t2).toBeGreaterThanOrEqual(tick);
    expect(t2 - tick).toBeLessThan(200);
    expect(await state<boolean>(page, 's.clock.paused')).toBe(true);
    expect(Math.abs((await state<number>(page, 's.economy.cash')) - cash)).toBeLessThan(5000);
    await page.waitForTimeout(1000);
    expect(await state<number>(page, 's.clock.tick')).toBe(t2);
  });

  test('REQ-SAVE-E2E-02 export creates a valid save file; import restores it; invalid files are rejected', async ({ page }) => {
    await newGame(page);
    await skipTutorial(page);
    await page.getByTestId('speed-4').click();
    await page.waitForTimeout(1500);
    await page.getByTestId('settings').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-save').click()]);
    const path = await download.path();
    const env = JSON.parse(readFileSync(path!, 'utf8'));
    expect(env.format).toBe('pixel-hospital-save');
    expect(env.checksum).toMatch(/^[0-9a-f]{64}$/);
    const exportedTick = env.state.clock.tick;
    // Invalid file.
    writeFileSync('test-results/bad.json', '{"format":"pixel-hospital-save","state":{}}');
    let chooser = page.waitForEvent('filechooser');
    await page.getByTestId('import-save').click();
    await (await chooser).setFiles('test-results/bad.json');
    await expect(page.locator('.toast.bad')).toContainText('Importen misslyckades');
    // Valid import.
    chooser = page.waitForEvent('filechooser');
    await page.getByTestId('settings').click().catch(() => undefined);
    await page.click('.navbtn[data-panel=analytics]');
    await page.getByTestId('settings').click();
    await page.getByTestId('import-save').click();
    await (await chooser).setFiles(path!);
    await page.locator('.modal .btn', { hasText: 'Importera' }).click();
    await expect(page.locator('.toast.good').last()).toContainText('importerad');
    expect(await state<number>(page, 's.clock.tick')).toBe(exportedTick);
    evidence('export-import', { exportedTick, bytes: readFileSync(path!).length });
  });

  test('REQ-PWA-01 offline restart after the service worker cached the app', async ({ page, context }) => {
    await page.goto('./');
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg?.active;
    }, null, { timeout: 30000 });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    // Let the cache fill completely.
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      if (!keys.length) return false;
      const c = await caches.open(keys[0]!);
      return (await c.keys()).length > 10;
    });
    await page.getByTestId('new-game').click();
    await page.waitForFunction(() => !!(window as any).pixelHospital?.app.scene);
    await page.getByTestId('settings').click();
    await page.getByTestId('save-now').click();
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('continue').click();
    await page.waitForFunction(() => !!(window as any).pixelHospital?.app.scene);
    await expect(page.getByTestId('cash')).toContainText('kr');
    const frames = await page.evaluate(() => (window as any).pixelHospital.app.scene.textures.exists('tiles'));
    expect(frames).toBe(true);
    await context.setOffline(false);
  });

  test('REQ-LIFE-01 backgrounding pauses and saves; returning does not simulate elapsed time; no autoplay audio', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('new-game').click();
    await page.waitForFunction(() => !!(window as any).pixelHospital?.app.scene);
    expect(await state<boolean>(page, 'app.sfx.unlocked')).toBe(false);
    await page.getByTestId('speed-1').click();
    expect(await state<boolean>(page, 'app.sfx.unlocked')).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(await state<boolean>(page, 's.clock.paused')).toBe(true);
    const tick = await state<number>(page, 's.clock.tick');
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(await state<number>(page, 's.clock.tick')).toBe(tick);
    expect(await state<string | null>(page, 'app.lastSaveAt')).not.toBeNull();
  });
});
